import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type BloqueoAgenda, type CitaDetalle, type PersonalInterno } from '../../lib/api';
import {
  DIAS,
  DIAS_CORTOS,
  diaSemana,
  dinero,
  duracion,
  enlaceWhatsApp,
  fechaCorta,
  fechaHora,
  fechaLarga,
  fechaLocal,
  hora,
  isoDesdeLocal,
  sumarDias,
  telefonoBonito,
} from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError } from '../../components/ui/Estado';
import { AccionesCita } from '../../components/admin/AccionesCita';
import { BloqueosAgenda, quienBloqueo, rangoBloqueo } from '../../components/admin/Bloqueos';
import { useCabina } from '../../components/admin/cabina';
import { IconoAlerta, IconoAnterior, IconoMensaje, IconoSiguiente } from '../../components/admin/Iconos';
import { NuevaCita } from '../../components/admin/NuevaCita';
import { EncabezadoAdmin, Exito, PillEstadoCita, PillFirma } from '../../components/admin/Piezas';
import { ETIQUETA_ORIGEN, inicioSemana } from '../../components/admin/util';
import './paginas.css';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_MS = 3_600_000;

function horaLocalNum(iso: string): number {
  const [h, m] = hora(iso).split(':').map(Number);
  return h + m / 60;
}

function TarjetaCita({ cita, color, onCambio, onAviso }: { cita: CitaDetalle; color?: string; onCambio: () => void; onAviso: (t: string) => void }) {
  const saldo = cita.total - cita.pagado;
  const telefono = cita.cliente_telefono;
  const mensaje = `Hola, ${cita.cliente_nombre.split(' ')[0]}. Te escribimos de Ópalo sobre tu cita del ${fechaHora(cita.inicio)}.`;
  const estilo = color ? ({ '--adm-color-personal': color } as CSSProperties) : undefined;
  const inactiva = cita.estado === 'cancelada' || cita.estado === 'no_asistio';
  return (
    <article className={`adm-cita adm-cita-${cita.estado}`} style={estilo} aria-label={`Cita de ${cita.cliente_nombre} a las ${hora(cita.inicio)}`}>
      <div className="adm-cita-cabeza">
        <span className="adm-cita-hora num">
          {hora(cita.inicio)}–{hora(cita.fin)}
        </span>
        <span className="texto-3 pequeno">{duracion(cita.duracion_min)}</span>
        <PillEstadoCita estado={cita.estado} />
        {cita.primera_vez && <span className="pill pill-oro">Primera vez</span>}
        <span className="pill pill-gris">{ETIQUETA_ORIGEN[cita.origen]}</span>
      </div>
      <div className="adm-cita-cuerpo">
        <div className="adm-cita-clienta">
          <Link to={`/admin/clientes/${cita.cliente_id}`} className="adm-cita-nombre">
            {cita.cliente_nombre}
          </Link>
          {telefono && (
            <a className="adm-enlace-wa" href={enlaceWhatsApp(telefono, mensaje)} target="_blank" rel="noreferrer">
              <IconoMensaje tam={16} /> {telefonoBonito(telefono)}
            </a>
          )}
        </div>
        <p className="adm-cita-servicios">{cita.items.map((i) => i.nombre).join(' · ') || 'Sin servicios'}</p>
        <div className="adm-cita-meta">
          <span>
            Atiende <strong>{cita.personal_nombre}</strong>
            {cita.cabina_nombre ? ` · ${cita.cabina_nombre}` : ''}
          </span>
          <span className="num">
            Total {dinero(cita.total, 'por confirmar')} · Pagado {dinero(cita.pagado)}
            {saldo > 0.005 && !inactiva && <strong className="adm-saldo"> · Saldo {dinero(saldo)}</strong>}
            {saldo < -0.005 && <strong className="adm-pagado-de-mas"> · Pagado de más {dinero(-saldo)}</strong>}
          </span>
          {!inactiva && (
            <span>
              Consentimiento <PillFirma firmados={cita.consentimientos_firmados} />
            </span>
          )}
        </div>
        {(cita.requiere_revision || cita.alertas.length > 0) && !inactiva && (
          <div className="aviso aviso-alerta adm-cita-alertas">
            <div>
              <strong className="fila adm-gap-chico">
                <IconoAlerta tam={18} /> {cita.requiere_revision ? 'Revisar su ficha antes de confirmar' : 'Alertas de su ficha de salud'}
              </strong>
              <ul className="adm-lista-alertas">
                {cita.alertas.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {cita.notas_cliente && <p className="adm-cita-notas">“{cita.notas_cliente}”</p>}
        <AccionesCita cita={cita} onCambio={onCambio} onAviso={onAviso} />
      </div>
    </article>
  );
}

export default function Agenda() {
  const [params, setParams] = useSearchParams();
  const hoy = fechaLocal();
  const fp = params.get('fecha');
  const fecha = fp && FECHA_RE.test(fp) ? fp : hoy;
  const vista: 'dia' | 'semana' = params.get('vista') === 'semana' ? 'semana' : 'dia';
  const filtro = params.get('personal') ?? '';
  const desde = vista === 'dia' ? fecha : inicioSemana(fecha);
  const hasta = vista === 'dia' ? fecha : sumarDias(desde, 6);

  const agenda = useAsync(() => Promise.all([api.admin.getAgenda(desde, hasta), api.admin.getBloqueos(desde, hasta)]), [desde, hasta]);
  const equipo = useAsync(() => api.admin.getPersonal().catch((): PersonalInterno[] => []), []);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nueva, setNueva] = useState<null | { fecha: string; hora?: string }>(null);
  const [verBloqueos, setVerBloqueos] = useState(false);
  const [verCanceladas, setVerCanceladas] = useState(false);

  // Al desbloquear la tablet después de «Firmar en cabina» (aunque se haya recargado la página
  // a media firma), se vuelve a leer la agenda para que la firma aparezca.
  const cabina = useCabina();
  const huboCabina = useRef(false);
  const { recargar: recargarAgenda } = agenda;
  useEffect(() => {
    if (cabina) huboCabina.current = true;
    else if (huboCabina.current) {
      huboCabina.current = false;
      recargarAgenda();
    }
  }, [cabina, recargarAgenda]);

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === '') p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  };

  const personal = (equipo.datos ?? []).filter((p) => p.activo);
  const colores = new Map((equipo.datos ?? []).map((p) => [p.id, p.color_agenda]));
  const [citasTodas, bloqueosTodos] = agenda.datos ?? [[], []];
  const citas = citasTodas.filter(
    (c) => (!filtro || c.personal_id === filtro) && (verCanceladas || (c.estado !== 'cancelada' && c.estado !== 'no_asistio')),
  );
  const ocultas = citasTodas.filter((c) => (!filtro || c.personal_id === filtro) && (c.estado === 'cancelada' || c.estado === 'no_asistio')).length;
  const bloqueos = bloqueosTodos.filter((b) => !filtro || !b.personal_id || b.personal_id === filtro);

  const recargar = () => agenda.recargar();
  const mostrarAviso = (t: string) => setAviso(t);
  const paso = vista === 'dia' ? 1 : 7;

  const titulo =
    vista === 'dia'
      ? `${fechaLarga(isoDesdeLocal(fecha, '12:00'))}${fecha === hoy ? ' · hoy' : ''}`
      : `Semana del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;

  return (
    <div className="adm-pagina">
      <EncabezadoAdmin titulo="Agenda" descripcion="Sesiones de 1 hora. Confirma, inicia y completa citas; registra pagos y firmas en cabina.">
        <button type="button" className="btn btn-secundario" onClick={() => setVerBloqueos(true)}>
          Bloqueos
        </button>
        <button type="button" className="btn btn-primario" onClick={() => setNueva({ fecha })}>
          + Nueva cita
        </button>
      </EncabezadoAdmin>

      <div className="adm-agenda-barra">
        <div className="adm-agenda-nav">
          <button type="button" className="btn btn-secundario btn-sm adm-btn-icono" onClick={() => ir({ fecha: sumarDias(fecha, -paso) })} aria-label={vista === 'dia' ? 'Día anterior' : 'Semana anterior'}>
            <IconoAnterior tam={18} />
          </button>
          <button type="button" className="btn btn-secundario btn-sm" onClick={() => ir({ fecha: null })} disabled={fecha === hoy}>
            Hoy
          </button>
          <button type="button" className="btn btn-secundario btn-sm adm-btn-icono" onClick={() => ir({ fecha: sumarDias(fecha, paso) })} aria-label={vista === 'dia' ? 'Día siguiente' : 'Semana siguiente'}>
            <IconoSiguiente tam={18} />
          </button>
          <label className="sr-only" htmlFor="agenda-fecha">
            Ir a la fecha
          </label>
          <input id="agenda-fecha" type="date" className="input adm-input-fecha" value={fecha} onChange={(e) => e.target.value && ir({ fecha: e.target.value === hoy ? null : e.target.value })} />
        </div>
        <div className="pestanas adm-pestanas-mini" role="tablist" aria-label="Vista">
          <button type="button" role="tab" className="pestana" aria-selected={vista === 'dia'} onClick={() => ir({ vista: null })}>
            Día
          </button>
          <button type="button" role="tab" className="pestana" aria-selected={vista === 'semana'} onClick={() => ir({ vista: 'semana' })}>
            Semana
          </button>
        </div>
        <div className="campo adm-sin-margen">
          <label className="sr-only" htmlFor="agenda-personal">
            Filtrar por persona
          </label>
          <select id="agenda-personal" className="input" value={filtro} onChange={(e) => ir({ personal: e.target.value || null })}>
            <option value="">Todo el equipo</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="entre adm-agenda-titulo">
        <h2 className="adm-subtitulo adm-capital">{titulo}</h2>
        <label className="check pequeno">
          <input type="checkbox" checked={verCanceladas} onChange={(e) => setVerCanceladas(e.target.checked)} />
          <span>Mostrar canceladas y no asistió{ocultas && !verCanceladas ? ` (${ocultas})` : ''}</span>
        </label>
      </div>

      <Exito texto={aviso} onCerrar={() => setAviso(null)} />
      <MensajeError error={agenda.error} onReintentar={agenda.recargar} />
      {agenda.cargando && !agenda.datos && <Cargando texto="Cargando la agenda…" />}

      {agenda.datos && (
        <div className={agenda.cargando ? 'adm-recargando' : ''}>
          {vista === 'dia' ? (
            <VistaDia
              fecha={fecha}
              hoy={hoy}
              citas={citas}
              bloqueos={bloqueos}
              personal={personal}
              filtro={filtro}
              colores={colores}
              onCambio={recargar}
              onAviso={mostrarAviso}
              onAgendar={(h) => setNueva({ fecha, hora: h })}
              equipoTodo={equipo.datos ?? []}
            />
          ) : (
            <VistaSemana desde={desde} hoy={hoy} citas={citas} bloqueos={bloqueos} equipo={equipo.datos ?? []} onDia={(f) => ir({ fecha: f, vista: null })} />
          )}
        </div>
      )}

      {nueva && (
        <NuevaCita
          inicial={{ fecha: nueva.fecha, hora: nueva.hora ?? null, personal_id: filtro || null }}
          onCerrar={() => setNueva(null)}
          onListo={(r, ini) => {
            setNueva(null);
            setAviso(`Cita agendada para el ${fechaHora(ini)}${r.requiere_revision ? ' (por confirmar: revisa su ficha)' : ''}.`);
            const f = fechaLocal(new Date(ini));
            if (f < desde || f > hasta) ir({ fecha: f });
            else recargar();
          }}
        />
      )}
      {verBloqueos && <BloqueosAgenda personal={personal} onCerrar={() => setVerBloqueos(false)} onCambio={recargar} />}
    </div>
  );
}

function VistaDia({
  fecha,
  hoy,
  citas,
  bloqueos,
  personal,
  filtro,
  colores,
  onCambio,
  onAviso,
  onAgendar,
  equipoTodo,
}: {
  fecha: string;
  hoy: string;
  citas: CitaDetalle[];
  bloqueos: BloqueoAgenda[];
  personal: PersonalInterno[];
  filtro: string;
  colores: Map<string, string>;
  onCambio: () => void;
  onAviso: (t: string) => void;
  onAgendar: (hora: string) => void;
  equipoTodo: PersonalInterno[];
}) {
  const dow = diaSemana(fecha);
  const quienes = personal.filter((p) => !filtro || p.id === filtro);
  const rangos = quienes.flatMap((p) => p.horarios.filter((h) => h.dia_semana === dow));

  const { horas, abiertas } = useMemo(() => {
    const aNum = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h + (m || 0) / 60;
    };
    let ini = rangos.length ? Math.floor(Math.min(...rangos.map((r) => aNum(r.hora_inicio)))) : 10;
    let fin = rangos.length ? Math.ceil(Math.max(...rangos.map((r) => aNum(r.hora_fin)))) : 19;
    for (const c of citas) {
      ini = Math.min(ini, Math.floor(horaLocalNum(c.inicio)));
      fin = Math.max(fin, Math.ceil(horaLocalNum(c.inicio) + c.duracion_min / 60));
    }
    const hs: number[] = [];
    for (let h = ini; h < Math.min(fin, 24); h++) hs.push(h);
    const ab = new Set(hs.filter((h) => rangos.some((r) => aNum(r.hora_inicio) <= h && aNum(r.hora_fin) >= h + 1)));
    return { horas: hs, abiertas: ab };
  }, [rangos, citas]);

  const ahora = Date.now();
  const horaActual = fecha === hoy ? Math.floor(horaLocalNum(new Date().toISOString())) : -1;
  const bloqueosDelDia = bloqueos.filter((b) => new Date(b.inicio).getTime() < new Date(isoDesdeLocal(sumarDias(fecha, 1), '00:00')).getTime());

  return (
    <div className="adm-dia">
      {rangos.length === 0 && (
        <p className="aviso aviso-info">
          {DIAS[dow]} no hay horario de atención{filtro ? ' para esta persona' : ''}. Puedes agendar a mano si hace falta.
        </p>
      )}
      {bloqueosDelDia.length > 0 && (
        <div className="aviso aviso-alerta">
          <div>
            <strong>Bloqueos este día:</strong>
            <ul className="adm-lista-alertas">
              {bloqueosDelDia.map((b) => (
                <li key={b.id}>
                  {rangoBloqueo(b)} · {quienBloqueo(b, equipoTodo)}
                  {b.motivo ? ` · ${b.motivo}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <ol className="adm-horas">
        {horas.map((h) => {
          const hh = `${String(h).padStart(2, '0')}:00`;
          const iniMs = new Date(isoDesdeLocal(fecha, hh)).getTime();
          const finMs = iniMs + HORA_MS;
          const enHora = citas.filter((c) => Math.floor(horaLocalNum(c.inicio)) === h);
          const ocupada = citas.some(
            (c) => c.estado !== 'cancelada' && c.estado !== 'no_asistio' && new Date(c.inicio).getTime() < finMs && new Date(c.fin).getTime() > iniMs,
          );
          const bloqueo = bloqueos.find((b) => new Date(b.inicio).getTime() < finMs && new Date(b.fin).getTime() > iniMs);
          const abierta = abiertas.has(h);
          const pasada = finMs <= ahora;
          return (
            <li key={h} className={`adm-hora ${h === horaActual ? 'adm-hora-actual' : ''} ${!abierta ? 'adm-hora-cerrada' : ''}`}>
              <div className="adm-hora-etiqueta num">
                {hh}
                {h === horaActual && <span className="adm-ahora">Ahora</span>}
              </div>
              <div className="adm-hora-contenido">
                {enHora.map((c) => (
                  <TarjetaCita key={c.id} cita={c} color={colores.get(c.personal_id)} onCambio={onCambio} onAviso={onAviso} />
                ))}
                {!ocupada && bloqueo && (
                  <div className="adm-hueco adm-hueco-bloqueado">
                    Bloqueado · {quienBloqueo(bloqueo, equipoTodo)}
                    {bloqueo.motivo ? ` · ${bloqueo.motivo}` : ''}
                  </div>
                )}
                {!ocupada && !bloqueo && (
                  <div className="adm-hueco">
                    <span className="texto-3">{abierta ? (pasada ? 'Sin cita' : 'Libre') : 'Fuera de horario'}</span>
                    {!pasada && (
                      <button type="button" className="btn btn-texto btn-sm" onClick={() => onAgendar(hh)}>
                        + Agendar a las {hh}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function VistaSemana({
  desde,
  hoy,
  citas,
  bloqueos,
  equipo,
  onDia,
}: {
  desde: string;
  hoy: string;
  citas: CitaDetalle[];
  bloqueos: BloqueoAgenda[];
  equipo: PersonalInterno[];
  onDia: (f: string) => void;
}) {
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(desde, i));
  const colores = new Map(equipo.map((p) => [p.id, p.color_agenda]));
  return (
    <div className="adm-semana-marco">
      <div className="adm-semana">
        {dias.map((f) => {
          const iniMs = new Date(isoDesdeLocal(f, '00:00')).getTime();
          const finMs = new Date(isoDesdeLocal(sumarDias(f, 1), '00:00')).getTime();
          const delDia = citas.filter((c) => fechaLocal(new Date(c.inicio)) === f);
          const bloq = bloqueos.filter((b) => new Date(b.inicio).getTime() < finMs && new Date(b.fin).getTime() > iniMs);
          const [, , d] = f.split('-');
          return (
            <section key={f} className={`adm-semana-dia ${f === hoy ? 'adm-semana-hoy' : ''}`} aria-label={fechaLarga(isoDesdeLocal(f, '12:00'))}>
              <button type="button" className="adm-semana-cabeza" onClick={() => onDia(f)}>
                <span className="adm-semana-dow">{DIAS_CORTOS[diaSemana(f)]}</span>
                <span className="adm-semana-num num">{Number(d)}</span>
                <span className="adm-semana-cuenta">{delDia.length ? `${delDia.length} ${delDia.length === 1 ? 'cita' : 'citas'}` : 'Sin citas'}</span>
              </button>
              {bloq.map((b) => (
                <p key={b.id} className="adm-semana-bloqueo">
                  Bloqueado · {quienBloqueo(b, equipo)}
                  {b.motivo ? ` · ${b.motivo}` : ''}
                </p>
              ))}
              <ul className="adm-semana-citas">
                {delDia.map((c) => {
                  const color = colores.get(c.personal_id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`adm-semana-cita adm-cita-${c.estado}`}
                        style={color ? ({ '--adm-color-personal': color } as CSSProperties) : undefined}
                        onClick={() => onDia(f)}
                      >
                        <span className="num adm-semana-cita-hora">{hora(c.inicio)}</span>
                        <span className="adm-semana-cita-nombre">{c.cliente_nombre}</span>
                        <span className="adm-semana-cita-detalle">{c.items.map((i) => i.nombre).join(', ')}</span>
                        <span className="adm-semana-cita-pills">
                          <PillEstadoCita estado={c.estado} />
                          {c.consentimientos_firmados === 0 && c.estado !== 'cancelada' && c.estado !== 'no_asistio' && c.estado !== 'completada' && (
                            <span className="pill pill-error">Sin firma</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
