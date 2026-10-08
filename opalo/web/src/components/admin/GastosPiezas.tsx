// Piezas de la página de Gastos (/admin/gastos): estado de vencimiento, textos de días,
// enlaces seguros y barras por categoría. Estilos en pages/admin/Gastos.css (.gas-*).
import type { FrecuenciaGasto, GastoPorVencer, MetodoPago } from '../../lib/api';
import { dinero, ETIQUETA_METODO_PAGO, porcentaje } from '../../lib/format';

const fmtCentavos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Como dinero(), pero con centavos completos cuando los hay: "$1,234.50" y no "$1,234.5". */
export function dineroCentavos(n: number | null | undefined, siNulo?: string): string {
  if (n === null || n === undefined || Number.isNaN(n)) return dinero(n, siNulo);
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? dinero(r) : fmtCentavos.format(r);
}

export const ESTADO_VENCIMIENTO: Record<GastoPorVencer['estado'], { clase: string; texto: string }> = {
  vencido: { clase: 'pill-error', texto: 'Vencido' },
  proximo: { clase: 'pill-alerta', texto: 'Próximo' },
  al_corriente: { clase: 'pill-exito', texto: 'Al corriente' },
};

export function GastosPillVencimiento({ estado }: { estado: GastoPorVencer['estado'] }) {
  const e = ESTADO_VENCIMIENTO[estado];
  return <span className={`pill ${e.clase}`}>{e.texto}</span>;
}

/** Cuánto avanza el próximo vencimiento al registrar un pago. */
export const AVANCE_FRECUENCIA: Record<FrecuenciaGasto, string> = {
  mensual: 'un mes',
  bimestral: 'dos meses',
  trimestral: 'tres meses',
  anual: 'un año',
};

/** "Vence hoy" · "en 3 días" · "vencido hace 2 días" · null si no hay fecha. */
export function textoDias(dias: number | null | undefined): string | null {
  if (dias === null || dias === undefined) return null;
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'mañana';
  if (dias > 0) return `en ${dias} días`;
  const n = Math.abs(dias);
  return n === 1 ? 'venció ayer' : `vencido hace ${n} días`;
}

/** Métodos que tienen sentido para un gasto (una "cortesía" no es una forma de pagar un recibo). */
export const METODOS_GASTO: MetodoPago[] = (Object.keys(ETIQUETA_METODO_PAGO) as MetodoPago[]).filter((m) => m !== 'cortesia');

/** Sólo enlaces http(s); cualquier otra cosa (javascript:, data:, texto suelto) no se vuelve enlace. */
export function urlSegura(u: string | null | undefined): string | null {
  const t = (u ?? '').trim();
  if (!t) return null;
  try {
    const x = new URL(t);
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
  } catch {
    return null;
  }
}

/** Primera letra en mayúscula ("octubre de 2026" → "Octubre de 2026"). */
export function capital(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export interface GastosFilaCategoria {
  id: string;
  nombre: string;
  total: number;
  cuantos: number;
}

/** Barras horizontales proporcionales (la categoría más alta ocupa todo el ancho) con su cifra. */
export function GastosBarrasCategoria({ filas, total }: { filas: GastosFilaCategoria[]; total: number }) {
  const max = Math.max(0, ...filas.map((f) => f.total));
  return (
    <ul className="gas-barras">
      {filas.map((f) => {
        const ancho = max > 0 ? (f.total / max) * 100 : 0;
        const parte = total > 0 ? (f.total / total) * 100 : 0;
        return (
          <li key={f.id} className="gas-barra-fila">
            <div className="gas-barra-texto">
              <span className="gas-barra-nombre">
                {f.nombre}
                <span className="gas-barra-cuantos texto-3">
                  {' '}
                  · {f.cuantos} {f.cuantos === 1 ? 'gasto' : 'gastos'}
                </span>
              </span>
              <span className="gas-barra-cifra num">
                <strong>{dineroCentavos(f.total)}</strong>
                <span className="texto-3"> · {porcentaje(parte)}</span>
              </span>
            </div>
            <div className="gas-barra-pista" aria-hidden="true">
              <div className="gas-barra" style={{ width: `${Math.max(ancho, f.total > 0 ? 1.5 : 0)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
