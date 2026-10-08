// Piezas compartidas de Inventario y Costos (selector de producto, equivalencias, entradas con unidad).
import type { ReactNode } from 'react';
import type { CategoriaProducto, Producto, TipoMovimiento, UnidadMedida } from '../../lib/api';
import { dinero, numero } from '../../lib/format';
import { ETIQUETA_CATEGORIA_PRODUCTO, ETIQUETA_MOVIMIENTO, cantidadConUnidad, enPresentaciones, porTexto } from './util';

export const CATEGORIAS_PRODUCTO = Object.keys(ETIQUETA_CATEGORIA_PRODUCTO) as CategoriaProducto[];

/** Ejemplo de presentación según la unidad. */
export const EJEMPLO_PRESENTACION: Record<UnidadMedida, string> = {
  g: 'Lata 800 g',
  ml: 'Botella 500 ml',
  pz: 'Caja 100 pz',
};

/** Palabra para "cuántos g/ml/piezas". */
export const UNIDAD_PLURAL: Record<UnidadMedida, string> = {
  g: 'gramos',
  ml: 'mililitros',
  pz: 'piezas',
};

/** R12: activo y con stock en su mínimo o por debajo. */
export function necesitaReponer(p: Pick<Producto, 'activo' | 'stock_actual' | 'stock_minimo'>): boolean {
  return p.activo && p.stock_actual <= p.stock_minimo;
}

/** Nombre de la presentación o, si no tiene, su contenido ("presentación de 800 g"). */
export function nombrePresentacion(p: Pick<Producto, 'presentacion' | 'contenido_presentacion' | 'unidad_medida'>): string {
  return p.presentacion?.trim() || `presentación de ${cantidadConUnidad(p.contenido_presentacion, p.unidad_medida, 3)}`;
}

/** "≈ 1.4 × Lata 800 g" · null cuando la presentación es de una sola pieza (no aporta nada). */
export function equivalencia(cantidad: number, p: Pick<Producto, 'presentacion' | 'contenido_presentacion' | 'unidad_medida'>): string | null {
  if (!p.contenido_presentacion || p.contenido_presentacion <= 0) return null;
  if (p.unidad_medida === 'pz' && p.contenido_presentacion === 1) return null;
  return `≈ ${numero(enPresentaciones(cantidad, p.contenido_presentacion), 1)} × ${nombrePresentacion(p)}`;
}

/** "+1,600 g" / "−15 g" con signo tipográfico. */
export function cantidadConSigno(n: number, unidad: UnidadMedida | null): string {
  const signo = n > 0 ? '+' : n < 0 ? '−' : '';
  const abs = Math.abs(n);
  return `${signo}${unidad ? cantidadConUnidad(abs, unidad, 3) : numero(abs, 3)}`;
}

const fmtCentavos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Como `dinero`, pero con centavos completos cuando los hay: "$4,691.20" en vez de "$4,691.2". */
export function pesos(n: number | null | undefined, siNulo?: string): string {
  if (n === null || n === undefined || Number.isNaN(n)) return dinero(n, siNulo);
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? dinero(r) : fmtCentavos.format(r);
}

/** Redondeo a centavos para mostrar totales sin arrastre de flotantes. */
export function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

const CLASE_MOVIMIENTO: Record<TipoMovimiento, string> = {
  compra: 'pill-exito',
  consumo: 'pill-info',
  venta: 'pill-verde',
  ajuste: 'pill-oro',
  merma: 'pill-error',
};

export function PillMovimiento({ tipo }: { tipo: TipoMovimiento }) {
  return <span className={`pill ${CLASE_MOVIMIENTO[tipo]}`}>{ETIQUETA_MOVIMIENTO[tipo] ?? tipo}</span>;
}

/** Texto de una opción de producto: "Cera elástica · Marca (inactivo)". */
export function etiquetaProducto(p: Pick<Producto, 'nombre' | 'marca' | 'activo'>): string {
  return `${p.nombre}${p.marca ? ` · ${p.marca}` : ''}${p.activo ? '' : ' (inactivo)'}`;
}

/**
 * Selector de producto agrupado por categoría. Los inactivos sólo aparecen si ya están elegidos.
 * `primero` pone arriba un grupo (p. ej. los productos del proveedor elegido).
 */
export function SelectorProducto({
  id,
  productos,
  valor,
  onCambio,
  excluir,
  primero,
  textoVacio = 'Elige un producto…',
  etiquetaAccesible,
  incluirInactivos = false,
  requerido = false,
}: {
  id: string;
  productos: Producto[];
  valor: string;
  onCambio: (id: string) => void;
  excluir?: Set<string>;
  primero?: { etiqueta: string; ids: Set<string> };
  textoVacio?: string;
  etiquetaAccesible?: string;
  incluirInactivos?: boolean;
  requerido?: boolean;
}) {
  const visibles = productos.filter((p) => p.activo || incluirInactivos || p.id === valor).sort(porTexto((p) => p.nombre));
  const opcion = (p: Producto) => (
    <option key={p.id} value={p.id} disabled={p.id !== valor && excluir?.has(p.id)}>
      {etiquetaProducto(p)}
    </option>
  );
  const destacados = primero ? visibles.filter((p) => primero.ids.has(p.id)) : [];
  const resto = primero ? visibles.filter((p) => !primero.ids.has(p.id)) : visibles;
  const grupos: ReactNode[] = [];
  if (destacados.length) {
    grupos.push(
      <optgroup key="__primero" label={primero!.etiqueta}>
        {destacados.map(opcion)}
      </optgroup>,
    );
  }
  for (const c of CATEGORIAS_PRODUCTO) {
    const deLa = resto.filter((p) => p.categoria === c);
    if (deLa.length)
      grupos.push(
        <optgroup key={c} label={destacados.length ? `${ETIQUETA_CATEGORIA_PRODUCTO[c]} · otros` : ETIQUETA_CATEGORIA_PRODUCTO[c]}>
          {deLa.map(opcion)}
        </optgroup>,
      );
  }
  return (
    <select id={id} className="input" value={valor} onChange={(e) => onCambio(e.target.value)} aria-label={etiquetaAccesible} required={requerido}>
      <option value="">{textoVacio}</option>
      {grupos}
    </select>
  );
}

/** Entrada numérica con la unidad pegada a la derecha ("g", "ml", "pz", "$"). */
export function EntradaConUnidad({
  id,
  valor,
  onCambio,
  unidad,
  antes,
  placeholder,
  etiquetaAccesible,
  invalido,
  requerido,
  descrita,
}: {
  id: string;
  valor: string;
  onCambio: (v: string) => void;
  unidad?: string;
  antes?: string;
  placeholder?: string;
  etiquetaAccesible?: string;
  invalido?: boolean;
  requerido?: boolean;
  descrita?: string;
}) {
  return (
    <div className="inv-entrada">
      {antes && (
        <span className="inv-entrada-pre" aria-hidden="true">
          {antes}
        </span>
      )}
      <input
        id={id}
        className="input num"
        inputMode="decimal"
        autoComplete="off"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        aria-label={etiquetaAccesible}
        aria-invalid={invalido || undefined}
        aria-describedby={descrita}
        required={requerido}
      />
      {unidad && (
        <span className="inv-entrada-post" aria-hidden="true">
          {unidad}
        </span>
      )}
    </div>
  );
}
