// "Nueva cita" desde el panel: para citas que llegan por WhatsApp, teléfono o mostrador.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  type ClienteResumen,
  type ItemReserva,
  type OrigenCita,
  type ResultadoReserva,
  type Servicio,
} from '../../lib/api';
import {
  dinero,
  duracion,
  edad,
  enlaceWhatsApp,
  ETIQUETA_ESTADO_CITA,
  fechaCorta,
  fechaHora,
  fechaLarga,
  fechaLocal,
  hora,
  isoDesdeLocal,
  telefonoBonito,
} from '../../lib/format';
import { useAccion, useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../ui/Estado';
import { FormCliente } from './FormCliente';
import { Modal } from './Modal';
import { ETIQUETA_ORIGEN, nombreCompleto, textoONulo } from './util';

export interface ClienteElegido {
  id: string;
  nombre: string;
  telefono: string | null;
}

interface Props {
  onCerrar: () => void;
  /** Se llama al cerrar después de crear la cita (para recargar la agenda). */
  onListo: (r: ResultadoReserva, inicio: string) => void;
  inicial?: { fecha?: string; hora?: string | null; personal_id?: string | null; cliente?: ClienteElegido | null };
}

type Clave = `s:${string}` | `p:${string}`;
const ORIGENES: OrigenCita[] = ['whatsapp', 'mostrador', 'telefono'];

/** Busca clientas mientras se escribe (con una pequeña espera). */
function useBusquedaClientes(q: string) {
  const [res, setRes] = useState<{ datos: ClienteResumen[]; cargando: boolean; error: string | null }>({ datos: [], cargando: false, error: null });
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setRes({ datos: [], cargando: false, error: null });
      return;
    }
    let vivo = true;
    setRes((r) => ({ ...r, cargando: true }));
    const id = window.setTimeout(() => {
      api.admin
        .getClientes(t)
        .then((d) => vivo && setRes({ datos: d.slice(0, 8), cargando: false, error: null }))
        .catch((e) => vivo && setRes({ datos: [], cargando: false, error: e instanceof Error ? e.message : String(e) }));
    }, 280);
    return () => {
      vivo = false;
      window.clearTimeout(id);
    };
  }, [q]);
  return res;
}

export function NuevaCita({ onCerrar, onListo, inicial }: Props) {
  const [cliente, setCliente] = useState<ClienteElegido | null>(inicial?.cliente ?? null);
  const [busqueda, setBusqueda] = useState('');
  const [creando, setCreando] = useState(false);
  const encontrados = useBusquedaClientes(cliente ? '' : busqueda);

  const base = useAsync(
    () =>
      Promise.all([
        api.getCatalogo(),
        api.admin.getPersonal().catch(() => []),
        api.getConfiguracion(),
      ]),
    [],
  );
  const expediente = useAsync(() => (cliente ? api.admin.getExpediente(cliente.id) : Promise.resolve(null)), [cliente?.id]);

  const [elegidos, setElegidos] = useState<Clave[]>([]);
  const [creditos, setCreditos] = useState<Partial<Record<Clave, string>>>({});
  const [fecha, setFecha] = useState(inicial?.fecha ?? fechaLocal());
  const [personalId, setPersonalId] = useState(inicial?.personal_id ?? '');
  const [inicio, setInicio] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [horaManual, setHoraManual] = useState(inicial?.hora ?? '');
  const [origen, setOrigen] = useState<OrigenCita>('whatsapp');
  const [notas, setNotas] = useState('');
  const [resultado, setResultado] = useState<{ r: ResultadoReserva; inicio: string } | null>(null);

  const items: ItemReserva[] = useMemo(
    () =>
      elegidos.map((k) => {
        const id = k.slice(2);
        const cred = creditos[k];
        return k.startsWith('s:') ? { servicio_id: id, ...(cred ? { credito_id: cred } : {}) } : { paquete_id: id, ...(cred ? { credito_id: cred } : {}) };
      }),
    [elegidos, creditos],
  );
  const claveItems = elegidos.join(',');

  const dur = useAsync(() => (items.length ? api.getDuracionReserva(items) : Promise.resolve(null)), [claveItems]);
  const claveSlots = `${fecha}|${dur.datos ?? ''}|${personalId}`;
  const slots = useAsync(
    () =>
      (dur.datos ? api.getHorariosDisponibles(fecha, dur.datos, personalId || null) : Promise.resolve([])).then((lista) => ({ clave: claveSlots, lista })),
    [claveSlots],
  );

  // Si se llegó desde un hueco de la agenda, se elige esa hora (o se pasa a hora manual) la primera vez.
  const horaAplicada = useRef(false);
  useEffect(() => {
    if (horaAplicada.current || !inicial?.hora || !dur.datos || !slots.datos || slots.datos.clave !== claveSlots) return;
    horaAplicada.current = true;
    const buscado = new Date(isoDesdeLocal(fecha, inicial.hora)).getTime();
    const slot = slots.datos.lista.find((s) => new Date(s.inicio).getTime() === buscado);
    if (slot) setInicio(slot.inicio);
    else setManual(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots.datos]);

  const inicioFinal = manual ? (horaManual ? isoDesdeLocal(fecha, horaManual) : null) : inicio;

  const { ejecutar, enviando, error } = useAccion(async () => {
    if (!cliente) throw new Error('Elige o registra a la clienta.');
    if (!items.length) throw new Error('Elige al menos un servicio.');
    if (!inicioFinal) throw new Error('Elige un horario.');
    const r = await api.admin.reservarParaCliente({
      cliente_id: cliente.id,
      items,
      inicio: inicioFinal,
      personal_id: personalId || null,
      origen,
      notas: textoONulo(notas),
    });
    return { r, inicio: inicioFinal };
  });

  const catalogo = base.datos?.[0];
  const personal = (base.datos?.[1] ?? []).filter((p) => p.activo);
  const config = base.datos?.[2];

  const porCategoria = useMemo(() => {
    if (!catalogo) return [];
    return catalogo.categorias
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map((c) => ({
        categoria: c,
        servicios: catalogo.servicios
          .filter((s) => s.categoria_id === c.id && s.activo && s.etapa === 'disponible')
          .sort((a, b) => a.orden - b.orden),
      }))
      .filter((g) => g.servicios.length > 0);
  }, [catalogo]);

  const nombreItem = (k: Clave) => {
    const id = k.slice(2);
    return k.startsWith('s:') ? catalogo?.servicios.find((s) => s.id === id)?.nombre : catalogo?.paquetes.find((p) => p.id === id)?.nombre;
  };

  const alternar = (k: Clave) => {
    setInicio(null);
    setElegidos((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));
    setCreditos((c) => {
      const copia = { ...c };
      delete copia[k];
      return copia;
    });
  };

  const creditosPara = (k: Clave) => {
    const id = k.slice(2);
    return (expediente.datos?.creditos ?? []).filter(
      (c) => c.vigente && c.restantes > 0 && (k.startsWith('s:') ? c.servicio_id === id : c.paquete_id === id),
    );
  };

  const nac = expediente.datos?.cliente.fecha_nacimiento ?? null;
  const anios = nac ? edad(nac, fecha) : null;
  const slotsUnicos = useMemo(() => {
    const vistos = new Map<string, { inicio: string; nombres: string[] }>();
    for (const s of slots.datos?.lista ?? []) {
      const k = new Date(s.inicio).toISOString();
      const v = vistos.get(k);
      if (v) v.nombres.push(s.personal_nombre);
      else vistos.set(k, { inicio: s.inicio, nombres: [s.personal_nombre] });
    }
    return [...vistos.values()];
  }, [slots.datos]);

  // ---------- Pantalla de cita creada ----------
  if (resultado) {
    const { r, inicio: ini } = resultado;
    const mensaje = `Hola${cliente ? `, ${cliente.nombre.split(' ')[0]}` : ''}. Tu cita en Ópalo quedó agendada para el ${fechaHora(ini)}. Antes del servicio te pediremos firmar tu consentimiento informado; si tienes cuenta puedes hacerlo desde "Mi cuenta". ¡Te esperamos!`;
    return (
      <Modal
        titulo="Cita creada"
        onCerrar={() => onListo(r, ini)}
        pie={
          <button type="button" className="btn btn-primario" onClick={() => onListo(r, ini)} data-autofoco>
            Listo
          </button>
        }
      >
        <div className="pila">
          <p className="aviso aviso-exito adm-sin-margen">
            La cita de <strong>{cliente?.nombre}</strong> quedó para el <strong>{fechaHora(ini)}</strong> · Estado: {ETIQUETA_ESTADO_CITA[r.estado]}.
          </p>
          {r.requiere_revision && (
            <div className="aviso aviso-alerta adm-sin-margen">
              <div>
                <strong>Su ficha de salud tiene respuestas que conviene revisar</strong> antes de confirmar:
                <ul className="adm-lista-alertas">
                  {r.alertas.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <p className="aviso aviso-info adm-sin-margen">
            Recuerda: sin consentimiento firmado no hay servicio. La clienta puede firmar desde su portal (si tiene cuenta) o en la tablet de la cabina con
            “Firmar en cabina” en la agenda.
          </p>
          {cliente?.telefono && (
            <a className="btn btn-secundario" href={enlaceWhatsApp(cliente.telefono, mensaje)} target="_blank" rel="noreferrer">
              Enviar confirmación por WhatsApp
            </a>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      titulo="Nueva cita"
      ancho="amplio"
      onCerrar={onCerrar}
      bloqueado={enviando}
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primario"
            disabled={enviando || !cliente || !items.length || !inicioFinal}
            onClick={async () => {
              const r = await ejecutar();
              if (r) setResultado(r);
            }}
          >
            {enviando ? 'Agendando…' : 'Agendar cita'}
          </button>
        </>
      }
    >
      <p className="ayuda adm-sin-margen">
        Para citas que llegan por WhatsApp, teléfono o en mostrador. La clienta deberá firmar su consentimiento antes del servicio (desde su cuenta o en la
        tablet de la cabina).
      </p>

      {/* 1 · Clienta */}
      <fieldset className="adm-paso">
        <legend>1 · Clienta</legend>
        {cliente ? (
          <div className="entre adm-clienta-elegida">
            <div>
              <strong>{cliente.nombre}</strong>
              {cliente.telefono && <span className="texto-3"> · {telefonoBonito(cliente.telefono)}</span>}
              {anios !== null && <span className="texto-3"> · {anios} años</span>}
            </div>
            {!inicial?.cliente && (
              <button
                type="button"
                className="btn btn-texto btn-sm"
                onClick={() => {
                  setCliente(null);
                  setCreditos({});
                }}
              >
                Cambiar
              </button>
            )}
          </div>
        ) : creando ? (
          <FormCliente
            inicial={busqueda}
            formId="nueva-cita-clienta"
            conNotas={false}
            onCancelar={() => setCreando(false)}
            onCreada={(id, d) => {
              setCliente({ id, nombre: nombreCompleto(d), telefono: d.telefono });
              setCreando(false);
            }}
          />
        ) : (
          <>
            <div className="campo adm-sin-margen">
              <label className="etiqueta" htmlFor="nc-buscar">
                Busca por nombre, teléfono o correo
              </label>
              <input
                id="nc-buscar"
                className="input"
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Ej. Ana o 442 123"
                autoComplete="off"
              />
            </div>
            {encontrados.cargando && <Cargando texto="Buscando…" />}
            <MensajeError error={encontrados.error} />
            {encontrados.datos.length > 0 && (
              <ul className="adm-resultados-busqueda">
                {encontrados.datos.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="adm-resultado"
                      onClick={() => setCliente({ id: c.id, nombre: nombreCompleto(c), telefono: c.telefono })}
                    >
                      <strong>{nombreCompleto(c)}</strong>
                      <span className="texto-3 pequeno">
                        {[telefonoBonito(c.telefono), c.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {busqueda.trim().length >= 2 && !encontrados.cargando && encontrados.datos.length === 0 && !encontrados.error && (
              <p className="texto-3 pequeno">No encontramos a nadie con “{busqueda.trim()}”.</p>
            )}
            <button type="button" className="btn btn-secundario btn-sm" onClick={() => setCreando(true)}>
              + Registrar clienta nueva
            </button>
          </>
        )}
        {anios !== null && config && anios < config.edad_minima && (
          <p className="aviso aviso-error">Atendemos a partir de los {config.edad_minima} años.</p>
        )}
        {anios !== null && config && anios >= config.edad_minima && anios < config.edad_mayoria && (
          <p className="aviso aviso-alerta">Es menor de edad: debe venir con mamá, papá o tutor, que también firma el consentimiento.</p>
        )}
        {cliente && expediente.datos && !expediente.datos.ficha && (
          <p className="ayuda">Aún no tiene ficha de salud: pídele que la llene desde su cuenta o repásenla juntas en cabina.</p>
        )}
      </fieldset>

      {/* 2 · Servicios */}
      <fieldset className="adm-paso">
        <legend>2 · Servicios</legend>
        {base.cargando && <Cargando />}
        <MensajeError error={base.error} onReintentar={base.recargar} />
        {catalogo && (
          <div className="adm-elegir-servicios">
            {porCategoria.map(({ categoria, servicios }) => (
              <details key={categoria.id} className="adm-grupo-servicios" open={servicios.some((s) => elegidos.includes(`s:${s.id}`))}>
                <summary>
                  {categoria.nombre}
                  <span className="texto-3 pequeno"> · {servicios.filter((s) => elegidos.includes(`s:${s.id}`)).length || ''}</span>
                </summary>
                <div className="adm-chips">
                  {servicios.map((s: Servicio) => (
                    <label key={s.id} className={`adm-chip ${elegidos.includes(`s:${s.id}`) ? 'adm-chip-activo' : ''}`}>
                      <input type="checkbox" checked={elegidos.includes(`s:${s.id}`)} onChange={() => alternar(`s:${s.id}`)} />
                      <span>
                        {s.nombre}
                        {s.es_complemento && <span className="texto-3"> (complemento)</span>}
                        <span className="adm-chip-precio num">{dinero(s.precio, 'por confirmar')}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </details>
            ))}
            {catalogo.paquetes.filter((p) => p.activo).length > 0 && (
              <details className="adm-grupo-servicios" open={elegidos.some((k) => k.startsWith('p:'))}>
                <summary>Paquetes</summary>
                <div className="adm-chips">
                  {catalogo.paquetes
                    .filter((p) => p.activo)
                    .map((p) => (
                      <label key={p.id} className={`adm-chip ${elegidos.includes(`p:${p.id}`) ? 'adm-chip-activo' : ''}`}>
                        <input type="checkbox" checked={elegidos.includes(`p:${p.id}`)} onChange={() => alternar(`p:${p.id}`)} />
                        <span>
                          {p.nombre}
                          <span className="adm-chip-precio num">{dinero(p.precio, 'por confirmar')}</span>
                        </span>
                      </label>
                    ))}
                </div>
              </details>
            )}
          </div>
        )}
        {elegidos.length > 0 && (
          <div className="adm-elegidos">
            <p className="etiqueta adm-sin-margen">Elegidos{dur.datos ? ` · duración estimada ${duracion(dur.datos)}` : ''}</p>
            <ul>
              {elegidos.map((k) => {
                const disponibles = creditosPara(k);
                return (
                  <li key={k}>
                    <span>{nombreItem(k)}</span>
                    {disponibles.length > 0 && (
                      <label className="check pequeno">
                        <input
                          type="checkbox"
                          checked={!!creditos[k]}
                          onChange={(e) => setCreditos((c) => ({ ...c, [k]: e.target.checked ? disponibles[0].id : undefined }))}
                        />
                        <span>
                          Usar su crédito prepagado (le quedan {disponibles[0].restantes}
                          {disponibles[0].vence_en ? `, vence ${fechaCorta(disponibles[0].vence_en)}` : ''})
                        </span>
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </fieldset>

      {/* 3 · Día y hora */}
      <fieldset className="adm-paso">
        <legend>3 · Día y horario</legend>
        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="nc-fecha">
              Día
            </label>
            <input
              id="nc-fecha"
              className="input"
              type="date"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value || fechaLocal());
                setInicio(null);
              }}
            />
            <span className="ayuda">{fechaLarga(isoDesdeLocal(fecha, '12:00'))}</span>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="nc-personal">
              ¿Quién atiende?
            </label>
            <select
              id="nc-personal"
              className="input"
              value={personalId}
              onChange={(e) => {
                setPersonalId(e.target.value);
                setInicio(null);
              }}
            >
              <option value="">Quien esté disponible</option>
              {personal.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!items.length ? (
          <p className="texto-3 pequeno">Elige los servicios para ver los horarios libres.</p>
        ) : manual ? null : slots.cargando || dur.cargando ? (
          <Cargando texto="Buscando horarios libres…" />
        ) : (
          <>
            <MensajeError error={slots.error ?? dur.error} onReintentar={slots.recargar} />
            {slotsUnicos.length === 0 ? (
              <Vacio titulo="No hay horarios libres ese día">Prueba otro día u otra persona, o escribe la hora a mano.</Vacio>
            ) : (
              <div className="adm-horarios" role="radiogroup" aria-label="Horarios libres">
                {slotsUnicos.map((s) => {
                  const activo = inicio !== null && new Date(inicio).getTime() === new Date(s.inicio).getTime();
                  return (
                    <button
                      key={s.inicio}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      className={`adm-horario ${activo ? 'adm-horario-activo' : ''}`}
                      onClick={() => setInicio(s.inicio)}
                    >
                      <span className="num">{hora(s.inicio)}</span>
                      {!personalId && personal.length > 1 && <span className="adm-horario-quien">{s.nombres.join(', ')}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {items.length > 0 && (
          <div className="adm-hora-manual">
            <label className="check pequeno">
              <input
                type="checkbox"
                checked={manual}
                onChange={(e) => {
                  setManual(e.target.checked);
                  setInicio(null);
                }}
              />
              <span>Otra hora (fuera de los horarios sugeridos, p. ej. si la clienta ya está en mostrador)</span>
            </label>
            {manual && (
              <div className="campo adm-campo-corto">
                <label className="etiqueta" htmlFor="nc-hora">
                  Hora de inicio
                </label>
                <input id="nc-hora" className="input num" type="time" step={300} value={horaManual} onChange={(e) => setHoraManual(e.target.value)} />
                <span className="ayuda">El sistema sólo revisa que no se empalme con otra cita.</span>
              </div>
            )}
          </div>
        )}
      </fieldset>

      {/* 4 · Detalles */}
      <fieldset className="adm-paso">
        <legend>4 · Detalles</legend>
        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="nc-origen">
              ¿Cómo llegó la cita?
            </label>
            <select id="nc-origen" className="input" value={origen} onChange={(e) => setOrigen(e.target.value as OrigenCita)}>
              {ORIGENES.map((o) => (
                <option key={o} value={o}>
                  {ETIQUETA_ORIGEN[o]}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="nc-notas">
              Notas de la clienta (opcional)
            </label>
            <input id="nc-notas" className="input" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. prefiere cera tibia" />
          </div>
        </div>
      </fieldset>

      {inicioFinal && cliente && items.length > 0 && (
        <p className="aviso aviso-info adm-sin-margen">
          {cliente.nombre} · {fechaHora(inicioFinal)} · {elegidos.map(nombreItem).join(', ')}
        </p>
      )}
      <MensajeError error={error} />
    </Modal>
  );
}
