// Gráfica de resultados mensuales: barras de ingresos vs egresos (gastos + costo de insumos +
// costo de ventas + mermas) y línea de utilidad. SVG propio, colores de tokens (--g-*) definidos en componentes.css.
// La tabla de la página es la vista equivalente en texto (los valores nunca dependen del tooltip).
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ResultadoMensual } from '../../lib/api';
import { dinero, mesNombre } from '../../lib/format';
import { mesCorto } from './util';

const ALTO = 300;
const M = { arriba: 18, derecha: 64, abajo: 34, izquierda: 72 };
/** Ancho aproximado de un carácter de las etiquetas del eje (11.5 px, cifras tabulares). */
const ANCHO_CARACTER = 6.6;
/** Aire mínimo entre dos etiquetas del eje X. */
const AIRE_ETIQUETAS = 10;

/**
 * Cada cuántos meses se pone etiqueta para que no se encimen («ago 26oct 26»). Se cuenta desde el
 * último mes, que siempre lleva etiqueta: así nunca queda pegada a la anterior.
 */
export function pasoEtiquetas(banda: number, etiquetas: string[]): number {
  const mas = Math.max(0, ...etiquetas.map((t) => t.length)) * ANCHO_CARACTER + AIRE_ETIQUETAS;
  return Math.max(1, Math.ceil(mas / Math.max(1, banda)));
}

function pasoBonito(rango: number, partes: number): number {
  const crudo = rango / partes;
  const mag = 10 ** Math.floor(Math.log10(crudo || 1));
  const norm = crudo / mag;
  const paso = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return paso * mag;
}

/** Cifra corta para los ejes: "$12 mil", "-$3.5 mil" (mismo signo menos que dinero() en tarjetas y tabla). */
export function compacto(n: number): string {
  const a = Math.abs(n);
  const signo = n < 0 && Math.round(a) !== 0 ? '-' : '';
  if (a >= 1_000_000) return `${signo}$${(a / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} M`;
  if (a >= 1000) return `${signo}$${(a / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} mil`;
  return `${signo}$${a.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
}

/** Barra con esquinas superiores redondeadas (4 px) y base recta. Para valores negativos, al revés. */
function barra(x: number, ancho: number, y0: number, y1: number): string {
  const alto = Math.abs(y1 - y0);
  if (alto < 0.5) return '';
  const r = Math.min(4, ancho / 2, alto);
  if (y1 < y0) {
    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + ancho - r} Q${x + ancho},${y1} ${x + ancho},${y1 + r} V${y0} Z`;
  }
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + ancho - r} Q${x + ancho},${y1} ${x + ancho},${y1 - r} V${y0} Z`;
}

export function GraficaResultados({ datos, idTabla }: { datos: ResultadoMensual[]; idTabla?: string }) {
  const id = useId();
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(720);
  const [activo, setActivo] = useState<number | null>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    // Siempre del ancho de su caja (a 390 px el SVG no se sale ni se estira).
    const medir = () => setAncho(Math.max(240, Math.round(el.clientWidth)));
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filas = useMemo(
    () =>
      [...datos]
        .sort((a, b) => a.mes.localeCompare(b.mes))
        .map((d) => ({ ...d, egresos: d.gastos + d.costo_insumos + (d.costo_ventas ?? 0) + (d.mermas ?? 0) })),
    [datos],
  );

  const plotW = ancho - M.izquierda - M.derecha;
  const plotH = ALTO - M.arriba - M.abajo;
  const valores = filas.flatMap((f) => [f.ingresos, f.egresos, f.utilidad]);
  const maxV = Math.max(0, ...valores);
  const minV = Math.min(0, ...valores);
  const paso = pasoBonito(maxV - minV || 1000, 4);
  const tope = Math.max(paso, Math.ceil(maxV / paso) * paso);
  const piso = Math.min(0, Math.floor(minV / paso) * paso);
  const y = (v: number) => M.arriba + ((tope - v) / (tope - piso)) * plotH;
  const ticks: number[] = [];
  for (let v = piso; v <= tope + paso / 2; v += paso) ticks.push(Math.round(v * 100) / 100);

  const n = Math.max(1, filas.length);
  const banda = plotW / n;
  const anchoBarra = Math.max(4, Math.min(24, (banda - 10) / 2 - 1));
  const centro = (i: number) => M.izquierda + banda * i + banda / 2;
  const etiquetas = filas.map((f) => mesCorto(f.mes));
  const cada = pasoEtiquetas(banda, etiquetas);
  const y0 = y(0);
  const puntos = filas.map((f, i) => `${centro(i)},${y(f.utilidad)}`).join(' ');
  const ultima = filas.length - 1;
  const act = activo !== null ? filas[activo] : null;

  // Posición del tooltip (en px dentro de la caja).
  const tipX = activo !== null ? Math.min(Math.max(centro(activo), 110), ancho - 110) : 0;

  return (
    <div className="adm-grafica">
      <div className="adm-grafica-leyenda" aria-hidden="true">
        <span>
          <i className="adm-ley-barra adm-ley-ingresos" /> Ingresos
        </span>
        <span>
          <i className="adm-ley-barra adm-ley-egresos" /> Egresos (gastos y costos)
        </span>
        <span>
          <i className="adm-ley-linea" /> Utilidad
        </span>
      </div>
      <div className="adm-grafica-caja" ref={caja} onMouseLeave={() => setActivo(null)}>
        {/* role="group" (no "img"): los meses enfocables de adentro deben seguir visibles para el lector de pantalla. */}
        <svg
          width={ancho}
          height={ALTO}
          viewBox={`0 0 ${ancho} ${ALTO}`}
          role="group"
          aria-labelledby={`${id}-t`}
          aria-describedby={`${id}-d`}
          className="adm-grafica-svg"
        >
          <title id={`${id}-t`}>Ingresos, egresos y utilidad por mes</title>
          <desc id={`${id}-d`}>
            Barras de ingresos y egresos (gastos más costo de insumos, de lo vendido y mermas) de los últimos {filas.length} meses, con la utilidad como línea.
            {idTabla ? ' Los valores exactos están en la tabla de abajo.' : ''}
          </desc>

          {/* Lo dibujado es decorativo para el lector de pantalla: cada mes se lee completo en su zona. */}
          <g aria-hidden="true">
            {/* Rejilla y eje */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.izquierda} x2={ancho - M.derecha} y1={y(t)} y2={y(t)} className={t === 0 ? 'adm-g-base' : 'adm-g-rejilla'} />
                <text x={M.izquierda - 8} y={y(t)} className="adm-g-eje" textAnchor="end" dominantBaseline="middle">
                  {compacto(t)}
                </text>
              </g>
            ))}

            {/* Banda resaltada */}
            {activo !== null && <rect x={M.izquierda + banda * activo} y={M.arriba} width={banda} height={plotH} className="adm-g-banda" />}

            {/* Barras */}
            {filas.map((f, i) => {
              const x1 = centro(i) - anchoBarra - 1;
              const x2 = centro(i) + 1;
              return (
                <g key={f.mes}>
                  <path d={barra(x1, anchoBarra, y0, y(f.ingresos))} className="adm-g-ingresos" />
                  <path d={barra(x2, anchoBarra, y0, y(f.egresos))} className="adm-g-egresos" />
                </g>
              );
            })}

            {/* Línea de utilidad */}
            {filas.length > 1 && <polyline points={puntos} className="adm-g-utilidad" />}
            {filas.map((f, i) => (
              <circle key={f.mes} cx={centro(i)} cy={y(f.utilidad)} r={activo === i ? 5.5 : 4} className="adm-g-punto" />
            ))}
            {ultima >= 0 && (
              <text x={centro(ultima) + 9} y={y(filas[ultima].utilidad)} className="adm-g-etiqueta" dominantBaseline="middle">
                {compacto(filas[ultima].utilidad)}
              </text>
            )}

            {/* Meses: uno de cada `cada`, contando desde el último */}
            {filas.map((f, i) =>
              (ultima - i) % cada === 0 ? (
                <text key={f.mes} x={centro(i)} y={ALTO - M.abajo + 20} className="adm-g-eje" textAnchor="middle">
                  {etiquetas[i]}
                </text>
              ) : null,
            )}
          </g>

          {/* Zonas de interacción (mouse, toque y teclado) */}
          {filas.map((f, i) => (
            <rect
              key={f.mes}
              x={M.izquierda + banda * i}
              y={M.arriba}
              width={banda}
              height={plotH + 24}
              className="adm-g-zona"
              tabIndex={0}
              role="img"
              aria-label={`${mesNombre(f.mes)}: ingresos ${dinero(f.ingresos)}, egresos ${dinero(f.egresos)}, utilidad ${dinero(f.utilidad)}`}
              onMouseEnter={() => setActivo(i)}
              onFocus={() => setActivo(i)}
              onBlur={() => setActivo(null)}
              onClick={() => setActivo(i)}
            />
          ))}
        </svg>
        {act && (
          <div className="adm-g-tooltip" style={{ left: tipX }} aria-hidden="true">
            <p className="adm-g-tooltip-mes">{mesNombre(act.mes)}</p>
            <p>
              <i className="adm-ley-barra adm-ley-ingresos" />
              <strong className="num">{dinero(act.ingresos)}</strong> <span>Ingresos</span>
            </p>
            <p>
              <i className="adm-ley-barra adm-ley-egresos" />
              <strong className="num">{dinero(act.egresos)}</strong> <span>Egresos</span>
            </p>
            <p>
              <i className="adm-ley-linea" />
              <strong className="num">{dinero(act.utilidad)}</strong> <span>Utilidad</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
