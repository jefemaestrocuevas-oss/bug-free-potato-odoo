// Paso 2: día en el calendario y hora disponible (siempre en hora de Querétaro).
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { Configuracion, Slot } from '../../lib/api/tipos';
import { fechaLarga, fechaLocal, hora, isoDesdeLocal, mensajeError, sumarDias } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { FECHA_APERTURA } from '../publico/contacto';
import { Cargando, MensajeError } from '../ui/Estado';
import { Calendario } from './Calendario';
import { PieAsistente } from './Piezas';

interface Props {
  config: Configuracion;
  duracionMin: number | null;
  fecha: string | null;
  slot: Slot | null;
  onFecha: (fecha: string) => void;
  onSlot: (slot: Slot) => void;
  onAtras: () => void;
  onContinuar: () => void;
}

/** Cuántos días del mes se revisan a la vez para marcar los que no tienen lugar. */
const CONSULTAS_A_LA_VEZ = 4;

/** Primer día que se puede reservar: hoy o, si todavía no abrimos, el día de apertura. */
export function primerDiaReservable(hoy: string = fechaLocal()): string {
  return hoy < FECHA_APERTURA ? FECHA_APERTURA : hoy;
}

/** Días del mes `ym` ('YYYY-MM') dentro de [min, max]. */
function diasEnRango(ym: string, min: string, max: string): string[] {
  const dias: string[] = [];
  for (let f = `${ym}-01`; f.slice(0, 7) === ym; f = sumarDias(f, 1)) if (f >= min && f <= max) dias.push(f);
  return dias;
}

/** Horarios agrupados por especialista, en el orden en que llegan. */
function porEspecialista(lista: Slot[]): { personal_id: string; personal_nombre: string; slots: Slot[] }[] {
  const grupos = new Map<string, { personal_id: string; personal_nombre: string; slots: Slot[] }>();
  for (const s of lista) {
    const g = grupos.get(s.personal_id) ?? { personal_id: s.personal_id, personal_nombre: s.personal_nombre, slots: [] };
    g.slots.push(s);
    grupos.set(s.personal_id, g);
  }
  return [...grupos.values()];
}

/** El dispositivo no está en la hora del centro de México (UTC−6 todo el año). */
function enOtraZona(): boolean {
  try {
    return new Date().getTimezoneOffset() !== 360;
  } catch {
    return false;
  }
}

export function PasoHorario({ config, duracionMin, fecha, slot, onFecha, onSlot, onAtras, onContinuar }: Props) {
  const hoy = fechaLocal();
  const min = primerDiaReservable(hoy);
  const max = sumarDias(hoy, Math.max(0, config.ventana_reserva_dias));
  const antesDeAbrir = min > hoy;
  // Un día guardado antes (p. ej. anterior a la apertura o ya pasado) no cuenta.
  const fechaVigente = fecha && fecha >= min && fecha <= max ? fecha : null;
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [sinLugar, setSinLugar] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const horasRef = useRef<HTMLDivElement>(null);

  // Qué días del mes visible tienen lugar (true) o no (false), para marcarlos en el calendario.
  const [mes, setMes] = useState<string | null>(null);
  const [libres, setLibres] = useState<Record<string, boolean>>({});
  const [revisando, setRevisando] = useState(false);
  const cache = useRef(new Map<string, boolean>());

  function anotar(f: string, dur: number, hay: boolean) {
    cache.current.set(`${dur}|${f}`, hay);
    setLibres((r) => (r[f] === hay ? r : { ...r, [f]: hay }));
  }

  useEffect(() => {
    if (!mes || !duracionMin) {
      setLibres({});
      setRevisando(false);
      return;
    }
    const dur = duracionMin;
    const k = (f: string) => `${dur}|${f}`;
    const dias = diasEnRango(mes, min, max);
    let vivo = true;
    const publicar = () => {
      const r: Record<string, boolean> = {};
      for (const f of dias) {
        const v = cache.current.get(k(f));
        if (v !== undefined) r[f] = v;
      }
      setLibres(r);
    };
    publicar();
    const faltan = dias.filter((f) => !cache.current.has(k(f)));
    setRevisando(faltan.length > 0);
    if (faltan.length === 0) return;
    let i = 0;
    const trabajador = async () => {
      while (vivo && i < faltan.length) {
        const f = faltan[i++];
        try {
          cache.current.set(k(f), (await api.getHorariosDisponibles(f, dur)).length > 0);
        } catch {
          // Si no se pudo revisar, el día se queda sin marcar y se puede elegir.
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(CONSULTAS_A_LA_VEZ, faltan.length) }, trabajador)).then(() => {
      if (!vivo) return;
      publicar();
      setRevisando(false);
    });
    return () => {
      vivo = false;
    };
  }, [mes, duracionMin, min, max]);

  const horarios = useAsync<Slot[] | null>(async () => {
    if (!fechaVigente || !duracionMin) return null;
    const s = await api.getHorariosDisponibles(fechaVigente, duracionMin);
    anotar(fechaVigente, duracionMin, s.length > 0);
    return s;
  }, [fechaVigente, duracionMin]);

  const otraZona = enOtraZona();

  const lista = horarios.datos ?? [];
  const grupos = porEspecialista(lista);
  const slotElegidoAqui = !!slot && !!fechaVigente && lista.some((s) => s.inicio === slot.inicio && s.personal_id === slot.personal_id);
  const hayDiasSinLugar = Object.values(libres).some((v) => !v);

  function elegirFecha(f: string) {
    setError(null);
    setSinLugar(null);
    onFecha(f);
  }

  /** Busca el siguiente día (desde `desde`) con al menos un horario libre. */
  async function buscarSiguiente(desde: string) {
    if (!duracionMin) return;
    setBuscando(true);
    setSinLugar(null);
    setError(null);
    try {
      let f = desde < min ? min : desde;
      for (let i = 0; i < 45 && f <= max; i++) {
        if (cache.current.get(`${duracionMin}|${f}`) !== false) {
          const s = await api.getHorariosDisponibles(f, duracionMin);
          anotar(f, duracionMin, s.length > 0);
          if (s.length > 0) {
            onFecha(f);
            requestAnimationFrame(() => horasRef.current?.focus());
            return;
          }
        }
        f = sumarDias(f, 1);
      }
      setSinLugar(
        f > max
          ? 'No encontramos horarios libres en los próximos días que se pueden reservar. Escríbenos por WhatsApp y te buscamos un espacio.'
          : 'No encontramos lugar en las próximas semanas. Prueba más adelante en el calendario o escríbenos por WhatsApp.',
      );
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setBuscando(false);
    }
  }

  function continuar() {
    const slotEnRango = !!slot && fechaLocal(new Date(slot.inicio)) >= min;
    const vigente = !!slot && slotEnRango && !!fechaVigente && (!horarios.datos || slotElegidoAqui);
    if (!vigente) {
      setError(fechaVigente ? 'Elige una hora para tu cita.' : 'Elige el día de tu cita en el calendario.');
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    onContinuar();
  }

  const fechaTexto = (f: string) => fechaLarga(isoDesdeLocal(f, '12:00'));

  return (
    <div className="rv-paso-cuerpo">
      <p className="texto-2" id="rv-cal-ayuda">
        {antesDeAbrir
          ? `Abrimos el ${fechaTexto(min)}: puedes reservar desde ese día y hasta el ${fechaTexto(max)}.`
          : `Puedes reservar desde hoy y hasta el ${fechaTexto(max)}.`}{' '}
        Los horarios están en hora de Querétaro. Con el teclado: flechas para moverte entre días, Enter para elegir.
      </p>
      {otraZona && (
        <p className="aviso aviso-info">
          Tu dispositivo está en otra zona horaria. Todas las horas de esta página son de Querétaro (centro de México).
        </p>
      )}

      <div className="rv-horario">
        <div className="rv-horario-cal">
          <Calendario
            min={min}
            max={max}
            hoy={hoy}
            seleccionada={fechaVigente}
            disponibilidad={libres}
            onMes={setMes}
            onElegir={elegirFecha}
            describedBy="rv-cal-ayuda"
          />
          <p className="ayuda rv-cal-leyenda" aria-live="polite">
            {revisando ? 'Revisando qué días tienen lugar…' : hayDiasSinLugar ? 'Los días tachados no tienen horarios libres.' : ''}
          </p>
          {!fechaVigente && (
            <button type="button" className="btn btn-texto btn-sm rv-buscar" onClick={() => buscarSiguiente(min)} disabled={buscando || !duracionMin}>
              {buscando ? 'Buscando…' : 'Mostrarme el primer día con lugar'}
            </button>
          )}
        </div>

        <div className="rv-horario-horas" ref={horasRef} tabIndex={-1} aria-labelledby="rv-horas-titulo">
          <h3 id="rv-horas-titulo" className="rv-subtitulo">
            {fechaVigente ? `Horarios del ${fechaTexto(fechaVigente)}` : 'Horarios'}
          </h3>
          {!fechaVigente && <p className="texto-3">Elige un día en el calendario para ver las horas libres.</p>}
          {fechaVigente && !duracionMin && <Cargando texto="Calculando la duración de tu cita…" />}
          {fechaVigente && duracionMin && horarios.cargando && <Cargando texto="Buscando horarios…" />}
          {fechaVigente && <MensajeError error={horarios.error} onReintentar={horarios.recargar} />}
          {fechaVigente && duracionMin && !horarios.cargando && !horarios.error && lista.length === 0 && (
            <div className="rv-sin-horarios">
              <p>No hay horarios este día; prueba otro.</p>
              <button
                type="button"
                className="btn btn-secundario btn-sm"
                onClick={() => buscarSiguiente(sumarDias(fechaVigente, 1))}
                disabled={buscando}
              >
                {buscando ? 'Buscando…' : 'Buscar el siguiente día con lugar'}
              </button>
            </div>
          )}
          {fechaVigente && !horarios.cargando && lista.length > 0 && (
            <div className="rv-horas-grupos">
              {grupos.map((g) => (
                <div key={g.personal_id} className="rv-horas-grupo">
                  <p className="rv-horas-quien" id={`rv-horas-${g.personal_id}`}>
                    Te atiende <strong>{g.personal_nombre}</strong>
                  </p>
                  <div className="rv-horas" role="group" aria-labelledby={`rv-horas-titulo rv-horas-${g.personal_id}`}>
                    {g.slots.map((s) => {
                      const activo = !!slot && s.inicio === slot.inicio && s.personal_id === slot.personal_id;
                      return (
                        <button
                          key={`${s.inicio}|${s.personal_id}`}
                          type="button"
                          className={`rv-hora${activo ? ' rv-hora-elegida' : ''}`}
                          aria-pressed={activo}
                          onClick={() => {
                            setError(null);
                            onSlot(s);
                          }}
                        >
                          <span className="rv-hora-hora num">{hora(s.inicio)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {slot && fechaVigente && !horarios.cargando && !!horarios.datos && !slotElegidoAqui && (
            <p className="ayuda">
              Tenías elegido el {fechaLarga(slot.inicio)} a las {hora(slot.inicio)}; ese horario ya no aparece libre. Elige otro.
            </p>
          )}
          {sinLugar && (
            <p className="aviso aviso-info" role="status">
              {sinLugar}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="aviso aviso-error rv-error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}

      <PieAsistente onAtras={onAtras} onContinuar={continuar} textoContinuar="Continuar" />
    </div>
  );
}
