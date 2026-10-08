// Piezas compartidas del asistente: indicador de progreso, pie con Atrás/Continuar y resumen vivo.
import type { ReactNode } from 'react';
import type { Slot } from '../../lib/api/tipos';
import { dinero, duracion, fechaLarga, hora } from '../../lib/format';
import { NOMBRES_PASOS, TOTAL_PASOS, type Paso } from './estado';
import { notaPago, type Total } from './utilidades';

export function Progreso({ paso, maxPaso, onIr }: { paso: Paso; maxPaso: Paso; onIr: (p: Paso) => void }) {
  const pasos = Array.from({ length: TOTAL_PASOS }, (_, i) => (i + 1) as Paso);
  return (
    <nav className="rv-progreso" aria-label="Pasos de tu reserva">
      <p className="rv-progreso-texto">
        Paso {paso} de {TOTAL_PASOS}
        <span aria-hidden="true"> · </span>
        <strong>{NOMBRES_PASOS[paso]}</strong>
      </p>
      <ol className="rv-progreso-lista">
        {pasos.map((n) => {
          const estado = n < paso ? 'hecho' : n === paso ? 'actual' : 'pendiente';
          const alcanzable = n !== paso && n <= maxPaso;
          const contenido = (
            <>
              <span className="rv-progreso-num" aria-hidden="true">
                {estado === 'hecho' ? '✓' : n}
              </span>
              <span className="rv-progreso-nombre">{NOMBRES_PASOS[n]}</span>
              <span className="sr-only">
                {estado === 'hecho' ? ', listo' : estado === 'actual' ? ', paso actual' : ', pendiente'}
              </span>
            </>
          );
          return (
            <li key={n} className={`rv-progreso-paso rv-progreso-${estado}`} aria-current={n === paso ? 'step' : undefined}>
              {alcanzable ? (
                <button type="button" className="rv-progreso-boton" onClick={() => onIr(n)}>
                  {contenido}
                </button>
              ) : (
                <span className="rv-progreso-boton" aria-disabled={n !== paso || undefined}>
                  {contenido}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PieAsistente({
  onAtras,
  onContinuar,
  textoContinuar = 'Continuar',
  enviando = false,
  textoEnviando = 'Guardando…',
  deshabilitado = false,
  extra,
  fijo = false,
}: {
  onAtras?: () => void;
  onContinuar?: () => void;
  textoContinuar?: string;
  enviando?: boolean;
  textoEnviando?: string;
  deshabilitado?: boolean;
  /** Texto corto junto a los botones (p. ej. el resumen en móvil). */
  extra?: ReactNode;
  /** Se queda pegado abajo en pantallas chicas. */
  fijo?: boolean;
}) {
  return (
    <div className={`rv-pie${fijo ? ' rv-pie-fijo' : ''}`}>
      {extra && <div className="rv-pie-extra">{extra}</div>}
      <div className="rv-pie-botones">
        {onAtras ? (
          <button type="button" className="btn btn-secundario" onClick={onAtras} disabled={enviando}>
            Atrás
          </button>
        ) : (
          <span />
        )}
        {onContinuar && (
          <button type="button" className="btn btn-primario rv-pie-continuar" onClick={onContinuar} disabled={enviando || deshabilitado} aria-busy={enviando || undefined}>
            {enviando ? textoEnviando : textoContinuar}
          </button>
        )}
      </div>
    </div>
  );
}

export interface LineaResumen {
  clave: string;
  nombre: string;
  detalle?: string | null;
  precio: number | null;
  prepagado: boolean;
}

export function ResumenReserva({
  lineas,
  total,
  duracionMin,
  cargandoDuracion,
  slot,
}: {
  lineas: LineaResumen[];
  total: Total;
  duracionMin: number | null;
  cargandoDuracion: boolean;
  slot: Slot | null;
}) {
  return (
    <div className="rv-resumen-caja" aria-live="polite">
      <h2 className="rv-resumen-titulo">Tu cita</h2>
      {lineas.length === 0 ? (
        <p className="texto-3 pequeno rv-resumen-vacio">Aún no eliges servicios.</p>
      ) : (
        <ul className="rv-resumen-lista">
          {lineas.map((l) => (
            <li key={l.clave}>
              <span>
                {l.nombre}
                {l.detalle && <span className="rv-resumen-detalle">{l.detalle}</span>}
              </span>
              <span className="num rv-resumen-precio">
                {l.prepagado ? 'Prepagado' : l.precio === null ? 'Por confirmar' : dinero(l.precio)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <dl className="rv-resumen-datos">
        {slot && (
          <>
            <div>
              <dt>Día</dt>
              <dd>{fechaLarga(slot.inicio)}</dd>
            </div>
            <div>
              <dt>Hora</dt>
              <dd>
                {hora(slot.inicio)} <span className="texto-3">(hora de Querétaro)</span>
              </dd>
            </div>
            <div>
              <dt>Te atiende</dt>
              <dd>{slot.personal_nombre}</dd>
            </div>
          </>
        )}
        {lineas.length > 0 && (
          <div>
            <dt>Tiempo estimado</dt>
            <dd>{cargandoDuracion || duracionMin === null ? 'Calculando…' : duracion(duracionMin)}</dd>
          </div>
        )}
        {lineas.length > 0 && (
          <div className="rv-resumen-total">
            <dt>Total estimado</dt>
            <dd className="num">{total.texto}</dd>
          </div>
        )}
      </dl>
      {lineas.length > 0 && (
        <p className="ayuda rv-resumen-nota">
          {notaPago(total)}
          {total.porConfirmar ? ' Los precios por confirmar te los decimos en cabina antes de empezar.' : ''}
        </p>
      )}
    </div>
  );
}

