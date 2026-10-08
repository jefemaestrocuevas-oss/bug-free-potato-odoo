// Paso 2: día en el calendario y hora disponible (siempre en hora de Querétaro).
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { Configuracion, Slot } from '../../lib/api/tipos';
import { fechaLarga, fechaLocal, hora, isoDesdeLocal, mensajeError, sumarDias } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
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
  const max = sumarDias(hoy, Math.max(0, config.ventana_reserva_dias));
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [sinLugar, setSinLugar] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const horasRef = useRef<HTMLDivElement>(null);

  const horarios = useAsync<Slot[] | null>(
    () => (fecha && duracionMin ? api.getHorariosDisponibles(fecha, duracionMin) : Promise.resolve(null)),
    [fecha, duracionMin],
  );

  const otraZona = enOtraZona();

  const lista = horarios.datos ?? [];
  const slotElegidoAqui = !!slot && !!fecha && lista.some((s) => s.inicio === slot.inicio && s.personal_id === slot.personal_id);

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
      let f = desde;
      for (let i = 0; i < 45 && f <= max; i++) {
        const s = await api.getHorariosDisponibles(f, duracionMin);
        if (s.length > 0) {
          onFecha(f);
          requestAnimationFrame(() => horasRef.current?.focus());
          return;
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
    const vigente = !!slot && (!horarios.datos || slotElegidoAqui);
    if (!vigente) {
      setError(fecha ? 'Elige una hora para tu cita.' : 'Elige el día de tu cita en el calendario.');
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    onContinuar();
  }


  return (
    <div className="rv-paso-cuerpo">
      <p className="texto-2" id="rv-cal-ayuda">
        Puedes reservar desde hoy y hasta el {fechaLarga(isoDesdeLocal(max, '12:00'))}. Los horarios están en hora de Querétaro.
        Con el teclado: flechas para moverte entre días, Enter para elegir.
      </p>
      {otraZona && (
        <p className="aviso aviso-info">
          Tu dispositivo está en otra zona horaria. Todas las horas de esta página son de Querétaro (centro de México).
        </p>
      )}

      <div className="rv-horario">
        <div className="rv-horario-cal">
          <Calendario min={hoy} max={max} hoy={hoy} seleccionada={fecha} onElegir={elegirFecha} describedBy="rv-cal-ayuda" />
          {!fecha && (
            <button type="button" className="btn btn-texto btn-sm rv-buscar" onClick={() => buscarSiguiente(hoy)} disabled={buscando || !duracionMin}>
              {buscando ? 'Buscando…' : 'Mostrarme el primer día con lugar'}
            </button>
          )}
        </div>

        <div className="rv-horario-horas" ref={horasRef} tabIndex={-1} aria-labelledby="rv-horas-titulo">
          <h3 id="rv-horas-titulo" className="rv-subtitulo">
            {fecha ? `Horarios del ${fechaLarga(isoDesdeLocal(fecha, '12:00'))}` : 'Horarios'}
          </h3>
          {!fecha && <p className="texto-3">Elige un día en el calendario para ver las horas libres.</p>}
          {fecha && !duracionMin && <Cargando texto="Calculando la duración de tu cita…" />}
          {fecha && duracionMin && horarios.cargando && <Cargando texto="Buscando horarios…" />}
          {fecha && <MensajeError error={horarios.error} onReintentar={horarios.recargar} />}
          {fecha && duracionMin && !horarios.cargando && !horarios.error && lista.length === 0 && (
            <div className="rv-sin-horarios">
              <p>No hay horarios este día; prueba otro.</p>
              <button type="button" className="btn btn-secundario btn-sm" onClick={() => buscarSiguiente(sumarDias(fecha, 1))} disabled={buscando}>
                {buscando ? 'Buscando…' : 'Buscar el siguiente día con lugar'}
              </button>
            </div>
          )}
          {fecha && !horarios.cargando && lista.length > 0 && (
            <div className="rv-horas" role="group" aria-labelledby="rv-horas-titulo">
              {lista.map((s) => {
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
                    <span className="rv-hora-quien">te atiende {s.personal_nombre}</span>
                  </button>
                );
              })}
            </div>
          )}
          {slot && fecha && !horarios.cargando && !!horarios.datos && !slotElegidoAqui && (
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
