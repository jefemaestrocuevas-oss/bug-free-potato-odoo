// /admin/equipo: personas del equipo, su horario semanal y sus capacitaciones.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PersonalInterno } from '../../lib/api';
import { DIAS, DIAS_CORTOS, fechaCorta, numero } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { EncabezadoAdmin, Exito, Kpi } from '../../components/admin/Piezas';
import { IconoMas } from '../../components/admin/Iconos';
import { useConfirmar } from '../../components/admin/Modal';
import { EquipoFormPersona } from '../../components/admin/EquipoFormPersona';
import { EquipoHorario } from '../../components/admin/EquipoHorario';
import { EquipoFormCapacitacion } from '../../components/admin/EquipoFormCapacitacion';
import { EquipoFoto, enlaceSeguro, horarioPorDia, horasTexto, minutosSemana, type CapacitacionInterna } from '../../components/admin/EquipoPiezas';
import { ETIQUETA_CAPACITACION } from '../../components/admin/util';
import './EquipoAdmin.css';

const porFechaDesc = (a: CapacitacionInterna, b: CapacitacionInterna) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || a.nombre.localeCompare(b.nombre, 'es');

export default function EquipoAdmin() {
  const equipo = useAsync(() => api.admin.getPersonal(), []);
  const [personaAbierta, setPersonaAbierta] = useState<{ persona: PersonalInterno | null } | null>(null);
  const [horario, setHorario] = useState<PersonalInterno | null>(null);
  const [capAbierta, setCapAbierta] = useState<{ persona: PersonalInterno; cap: CapacitacionInterna | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { confirmar, dialogo } = useConfirmar();

  const lista = equipo.datos ?? [];
  const activas = lista.filter((p) => p.activo);
  const enSitio = lista.filter((p) => p.activo && p.mostrar_en_sitio);
  const caps = lista.flatMap((p) => p.capacitaciones);
  const capsVisibles = lista.filter((p) => p.activo && p.mostrar_en_sitio).flatMap((p) => p.capacitaciones.filter((c) => c.mostrar_en_sitio));
  const horasTotales = caps.reduce((s, c) => s + (c.horas ?? 0), 0);
  const ultima = [...caps].filter((c) => c.fecha).sort(porFechaDesc)[0];
  const slugs = new Map(lista.map((p) => [p.slug, p.nombre]));
  const ordenSugerido = lista.reduce((m, p) => Math.max(m, p.orden), 0) + 1;

  const listo = (texto: string) => {
    setPersonaAbierta(null);
    setHorario(null);
    setCapAbierta(null);
    setAviso(texto);
    equipo.recargar();
  };

  const borrarCap = (p: PersonalInterno, c: CapacitacionInterna) =>
    confirmar({
      titulo: 'Borrar capacitación',
      mensaje: (
        <>
          <p>
            ¿Borrar <strong>{c.nombre}</strong> de {p.nombre}?
          </p>
          <p>{c.mostrar_en_sitio ? 'Dejará de aparecer en el sitio. ' : ''}Esto no se puede deshacer.</p>
        </>
      ),
      textoBoton: 'Sí, borrar',
      peligro: true,
      accion: () => api.admin.eliminarCapacitacion(c.id),
      alTerminar: () => listo(`Borramos «${c.nombre}».`),
    });

  return (
    <div className="adm-pagina eqa-pagina">
      <EncabezadoAdmin titulo="Equipo y capacitaciones" descripcion="Quién atiende, en qué horario y qué cursos ha tomado.">
        <Link className="btn btn-secundario" to="/equipo" target="_blank" rel="noreferrer">
          Ver la página Equipo
        </Link>
        <button type="button" className="btn btn-primario" onClick={() => setPersonaAbierta({ persona: null })} disabled={!equipo.datos}>
          <IconoMas tam={18} /> Agregar persona
        </button>
      </EncabezadoAdmin>

      {equipo.cargando && !equipo.datos && <Cargando texto="Cargando al equipo…" />}
      <MensajeError error={equipo.error} onReintentar={equipo.recargar} />
      <Exito texto={aviso} onCerrar={() => setAviso(null)} />

      {equipo.datos && (
        <>
          <div className="aviso aviso-info eqa-recordatorio" role="note">
            <span>
              <strong>Nos capacitamos constantemente</strong>, y el sitio lo demuestra: cada capacitación marcada como visible aparece en la página Equipo con su fecha e
              institución. Regístralas en cuanto terminen.
            </span>
          </div>

          <div className="adm-kpis eqa-kpis">
            <Kpi etiqueta="Equipo activo" valor={<span className="num">{activas.length}</span>} detalle={`${enSitio.length} ${enSitio.length === 1 ? 'se muestra' : 'se muestran'} en el sitio`} />
            <Kpi etiqueta="Capacitaciones" valor={<span className="num">{caps.length}</span>} detalle={`${capsVisibles.length} ${capsVisibles.length === 1 ? 'visible' : 'visibles'} en el sitio`} />
            <Kpi etiqueta="Horas de formación" valor={<span className="num">{numero(horasTotales, 1)}</span>} detalle="Registradas en total" />
            <Kpi
              etiqueta="La más reciente"
              valor={<span className="num eqa-kpi-fecha">{ultima?.fecha ? fechaCorta(ultima.fecha) : '—'}</span>}
              detalle={ultima ? ultima.nombre : 'Aún no hay fechas registradas'}
            />
          </div>

          {lista.length === 0 ? (
            <Vacio titulo="Aún no hay nadie en el equipo">Agrega a la primera persona para poder darle horario y recibir citas.</Vacio>
          ) : (
            <div className="eqa-personas">
              {lista.map((p) => (
                <TarjetaPersona
                  key={p.id}
                  persona={p}
                  onEditar={() => setPersonaAbierta({ persona: p })}
                  onHorario={() => setHorario(p)}
                  onNuevaCap={() => setCapAbierta({ persona: p, cap: null })}
                  onEditarCap={(c) => setCapAbierta({ persona: p, cap: c })}
                  onBorrarCap={(c) => borrarCap(p, c)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {personaAbierta && (
        <EquipoFormPersona
          persona={personaAbierta.persona}
          slugsUsados={slugs}
          ordenSugerido={ordenSugerido}
          onCerrar={() => setPersonaAbierta(null)}
          onGuardado={(nombre, nueva) => listo(nueva ? `Listo: ${nombre} ya está en el equipo. Ahora define su horario.` : `Listo: guardamos los datos de ${nombre}.`)}
        />
      )}
      {horario && <EquipoHorario persona={horario} onCerrar={() => setHorario(null)} onGuardado={() => listo(`Listo: guardamos el horario de ${horario.nombre}.`)} />}
      {capAbierta && (
        <EquipoFormCapacitacion
          persona={capAbierta.persona}
          capacitacion={capAbierta.cap}
          onCerrar={() => setCapAbierta(null)}
          onGuardado={(nombre, nueva) => listo(nueva ? `Listo: agregamos «${nombre}».` : `Listo: guardamos «${nombre}».`)}
        />
      )}
      {dialogo}
    </div>
  );
}

function TarjetaPersona({
  persona: p,
  onEditar,
  onHorario,
  onNuevaCap,
  onEditarCap,
  onBorrarCap,
}: {
  persona: PersonalInterno;
  onEditar: () => void;
  onHorario: () => void;
  onNuevaCap: () => void;
  onEditarCap: (c: CapacitacionInterna) => void;
  onBorrarCap: (c: CapacitacionInterna) => void;
}) {
  const dias = horarioPorDia(p.horarios);
  const semana = minutosSemana(p.horarios);
  const caps = [...p.capacitaciones].sort(porFechaDesc);
  const visible = p.activo && p.mostrar_en_sitio;
  const id = `eqa-p-${p.id}`;
  return (
    <article className={`tarjeta-plana eqa-persona ${p.activo ? '' : 'eqa-persona-inactiva'}`} aria-labelledby={id}>
      <header className="eqa-persona-cabeza">
        <EquipoFoto nombre={p.nombre} url={p.foto_url} color={p.color_agenda} tam={76} />
        <div className="eqa-persona-datos">
          <h2 className="eqa-persona-nombre" id={id}>
            {p.nombre}
          </h2>
          {p.titulo && <p className="eqa-persona-titulo">{p.titulo}</p>}
          <div className="eqa-pills">
            {p.activo ? <span className="pill pill-verde">Activa</span> : <span className="pill pill-gris">Inactiva</span>}
            {visible ? <span className="pill pill-oro">En el sitio</span> : <span className="pill pill-gris">No se muestra en el sitio</span>}
            <span className="pill pill-gris eqa-pill-color">
              <span className="eqa-muestra" style={{ background: p.color_agenda }} aria-hidden="true" /> Color en agenda
            </span>
            <span className="pill pill-gris">Orden {p.orden}</span>
            {p.usuario_id ? <span className="pill pill-info">Entra al panel</span> : null}
          </div>
        </div>
        <button type="button" className="btn btn-secundario btn-sm eqa-editar" onClick={onEditar}>
          Editar datos
        </button>
      </header>
      {p.bio ? <p className="eqa-bio">{p.bio}</p> : <p className="eqa-bio texto-3">Sin semblanza. Agrégala en «Editar datos» para presentarla en el sitio.</p>}

      <div className="eqa-persona-cuerpo">
        <section className="eqa-seccion" aria-labelledby={`${id}-h`}>
          <div className="eqa-seccion-cabeza">
            <h3 className="eqa-seccion-titulo" id={`${id}-h`}>
              Horario semanal
            </h3>
            <button type="button" className="btn btn-texto btn-sm" onClick={onHorario}>
              Editar horario
            </button>
          </div>
          {p.horarios.length === 0 ? (
            <div className="aviso aviso-alerta eqa-aviso-compacto">
              <span>Sin horario: no se le ofrecen citas en línea.</span>
              <button type="button" className="btn btn-texto btn-sm" onClick={onHorario}>
                Definir horario
              </button>
            </div>
          ) : (
            <>
              <dl className="eqa-semana">
                {dias.map((d, i) => (
                  <div key={i} className={d.length ? '' : 'eqa-semana-cerrado'}>
                    <dt>
                      <abbr title={DIAS[i]}>{DIAS_CORTOS[i]}</abbr>
                    </dt>
                    <dd className="num">{d.length ? d.map((h) => `${h.hora_inicio.slice(0, 5)}–${h.hora_fin.slice(0, 5)}`).join(' · ') : 'Cerrado'}</dd>
                  </div>
                ))}
              </dl>
              <p className="ayuda adm-sin-margen">{horasTexto(semana)} a la semana.</p>
            </>
          )}
        </section>

        <section className="eqa-seccion" aria-labelledby={`${id}-c`}>
          <div className="eqa-seccion-cabeza">
            <h3 className="eqa-seccion-titulo" id={`${id}-c`}>
              Capacitaciones <span className="texto-3 num eqa-cuenta">({caps.length})</span>
            </h3>
            <button type="button" className="btn btn-texto btn-sm" onClick={onNuevaCap}>
              <IconoMas tam={16} /> Agregar
            </button>
          </div>
          {!visible && caps.some((c) => c.mostrar_en_sitio) && (
            <p className="ayuda eqa-nota-alerta">Como {p.nombre} no se muestra en el sitio, sus capacitaciones tampoco aparecen ahí.</p>
          )}
          {caps.length === 0 ? (
            <Vacio titulo="Sin capacitaciones registradas">Cada curso, taller o certificación que registres puede mostrarse en el sitio.</Vacio>
          ) : (
            <ul className="eqa-caps">
              {caps.map((c) => (
                <li key={c.id} className="eqa-cap">
                  <div className="eqa-cap-texto">
                    <div className="eqa-cap-linea">
                      <span className="pill pill-verde">{ETIQUETA_CAPACITACION[c.tipo] ?? c.tipo}</span>
                      {c.mostrar_en_sitio ? <span className="pill pill-oro">En el sitio</span> : <span className="pill pill-gris">Sólo interna</span>}
                    </div>
                    <strong className="eqa-cap-nombre">{c.nombre}</strong>
                    <span className="adm-sub">
                      {[c.institucion, c.fecha ? fechaCorta(c.fecha) : 'Sin fecha', c.horas !== null ? `${numero(c.horas, 1)} h` : null].filter(Boolean).join(' · ')}
                    </span>
                    {enlaceSeguro(c.constancia_url) && (
                      <a className="eqa-constancia pequeno" href={enlaceSeguro(c.constancia_url)!} target="_blank" rel="noreferrer">
                        Ver constancia
                      </a>
                    )}
                    {c.notas && <span className="eqa-cap-notas pequeno">{c.notas}</span>}
                  </div>
                  <div className="eqa-cap-acciones">
                    <button type="button" className="btn btn-texto btn-sm" onClick={() => onEditarCap(c)} aria-label={`Editar ${c.nombre}`}>
                      Editar
                    </button>
                    <button type="button" className="btn btn-texto btn-sm adm-texto-peligro" onClick={() => onBorrarCap(c)} aria-label={`Borrar ${c.nombre}`}>
                      Borrar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}
