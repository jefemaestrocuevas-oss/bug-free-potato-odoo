// Piezas del taller y del mostrador: ficha pública de los productos, miniaturas (foto o ilustración),
// estado de los lotes, curado y precios sugeridos.
import { useState } from 'react';
import { CATEGORIAS_TIENDA, type CategoriaProducto, type EstadoLote, type Lote, type Producto, type ProductoEditable } from '../../lib/api';
import { fechaEnLetra, fechaLocal } from '../../lib/format';
import { IlustracionProducto } from '../ui/IlustracionProducto';
import { CATEGORIAS_MATERIA_PRIMA, ETIQUETA_ESTADO_LOTE } from './util';

/** Campos de la ficha pública de un producto (ESPEC §10.1). */
export type FichaProducto = Pick<
  ProductoEditable,
  | 'slug'
  | 'descripcion'
  | 'aroma'
  | 'ingredientes'
  | 'modo_uso'
  | 'advertencias'
  | 'contenido_neto'
  | 'foto_url'
  | 'color_hex'
  | 'destacado'
  | 'hecho_en_opalo'
  | 'orden'
>;

export const FICHA_VACIA: FichaProducto = {
  slug: null,
  descripcion: null,
  aroma: null,
  ingredientes: null,
  modo_uso: null,
  advertencias: null,
  contenido_neto: null,
  foto_url: null,
  color_hex: null,
  destacado: false,
  hecho_en_opalo: false,
  orden: 0,
};

/** La ficha de un producto (o la vacía si es nuevo), para no perderla al guardar desde otra pantalla. */
export function fichaDe(p: Partial<Producto> | null | undefined): FichaProducto {
  if (!p) return { ...FICHA_VACIA };
  return {
    slug: p.slug ?? null,
    descripcion: p.descripcion ?? null,
    aroma: p.aroma ?? null,
    ingredientes: p.ingredientes ?? null,
    modo_uso: p.modo_uso ?? null,
    advertencias: p.advertencias ?? null,
    contenido_neto: p.contenido_neto ?? null,
    foto_url: p.foto_url ?? null,
    color_hex: p.color_hex ?? null,
    destacado: p.destacado ?? false,
    hecho_en_opalo: p.hecho_en_opalo ?? false,
    orden: p.orden ?? 0,
  };
}

/** Producto completo → lo que acepta guardarProducto (sin stock ni costo calculado). */
export function aEditable(p: Producto): ProductoEditable {
  const { costo_unitario: _c, stock_actual: _s, ...resto } = p;
  void _c;
  void _s;
  return resto;
}

/** Jabón, vela o set: producto terminado de la tienda propia (se maneja por pieza). */
export function esTerminado(categoria: CategoriaProducto): boolean {
  return CATEGORIAS_TIENDA.includes(categoria);
}

/** Materia prima o envase del taller. */
export function esMateriaPrima(categoria: CategoriaProducto): boolean {
  return CATEGORIAS_MATERIA_PRIMA.includes(categoria);
}

/** Lo que se vende (en el spa o en línea): terminados del taller y productos de reventa. */
export function esDeVenta(p: Pick<Producto, 'categoria' | 'uso'>): boolean {
  return esTerminado(p.categoria) || p.uso === 'venta' || p.uso === 'ambos';
}

/** "Jabón de avena y miel" → "jabon-de-avena-y-miel" (sin acentos ni ñ, como pide la ESPEC). */
export function slugDe(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const COLOR_VALIDO = /^#[0-9a-fA-F]{6}$/;

/** Sólo direcciones http(s): una foto con otro esquema no se muestra. */
export function fotoValida(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\/\S+$/i.test(url.trim());
}

/** Foto del producto o, si no tiene (o no carga), su ilustración con el color de la ficha. */
export function MiniaturaProducto({
  producto,
  className = '',
}: {
  producto: Pick<Producto, 'nombre' | 'categoria' | 'foto_url' | 'color_hex'> & { hecho_en_opalo?: boolean };
  className?: string;
}) {
  const [fallo, setFallo] = useState<string | null>(null);
  const foto = fotoValida(producto.foto_url) && fallo !== producto.foto_url ? producto.foto_url : null;
  return (
    <span className={`tal-miniatura ${className}`}>
      {foto ? (
        <img src={foto} alt="" loading="lazy" onError={() => setFallo(foto)} />
      ) : (
        <IlustracionProducto categoria={producto.categoria} color={producto.color_hex} nombre={producto.nombre} conMarca={producto.hecho_en_opalo ?? true} />
      )}
    </span>
  );
}

const CLASE_LOTE: Record<EstadoLote, string> = {
  en_curado: 'pill-info',
  disponible: 'pill-exito',
  descartado: 'pill-gris',
};

/** Estado de un lote; si está en curado pero ya cumplió su fecha, "Listo para liberar". */
export function PillEstadoLote({ lote }: { lote: Pick<Lote, 'estado' | 'dias_para_listo'> }) {
  if (lote.estado === 'en_curado' && lote.dias_para_listo <= 0) return <span className="pill pill-alerta">Listo para liberar</span>;
  return <span className={`pill ${CLASE_LOTE[lote.estado]}`}>{ETIQUETA_ESTADO_LOTE[lote.estado]}</span>;
}

/** Días entre dos fechas 'YYYY-MM-DD' (b − a). */
export function diasEntre(a: string, b: string): number {
  const t = (f: string) => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** Días de curado de un lote (de la elaboración a "listo desde"). */
export function diasCuradoLote(l: Pick<Lote, 'elaborado_en' | 'listo_desde'>): number {
  return Math.max(0, diasEntre(l.elaborado_en, l.listo_desde));
}

/** Avance del curado de 0 a 1. */
export function avanceCurado(l: Pick<Lote, 'elaborado_en' | 'listo_desde' | 'dias_para_listo'>): number {
  const total = diasCuradoLote(l);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (total - l.dias_para_listo) / total));
}

/** "Falta 1 día" · "Faltan 12 días" · "Listo desde hoy" */
export function textoFaltan(dias: number): string {
  if (dias <= 0) return dias === 0 ? 'Listo desde hoy' : `Listo desde hace ${-dias} ${dias === -1 ? 'día' : 'días'}`;
  return dias === 1 ? 'Falta 1 día' : `Faltan ${dias} días`;
}

/** Barra de avance del curado (con su texto para lector de pantalla). */
export function BarraCurado({ lote }: { lote: Pick<Lote, 'elaborado_en' | 'listo_desde' | 'dias_para_listo'> }) {
  const avance = avanceCurado(lote);
  const total = diasCuradoLote(lote);
  const hechos = Math.round(avance * total);
  return (
    <span className="tal-curado">
      <span
        className="tal-curado-barra"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={hechos}
        aria-valuetext={`${hechos} de ${total} días de curado`}
      >
        <span className="tal-curado-relleno" style={{ width: `${Math.round(avance * 100)}%` }} />
      </span>
      <span className="tal-curado-texto num">
        {hechos} de {total} días
      </span>
    </span>
  );
}

/**
 * Precio para que el margen sea `margenPct` % del precio: costo / (1 − margen). Se redondea hacia
 * arriba al peso; null si el margen pedido no tiene sentido (≥ 100 % o negativo) o no hay costo.
 */
export function precioSugerido(costo: number, margenPct: number): number | null {
  if (!(costo > 0) || !(margenPct >= 0) || margenPct >= 100) return null;
  return Math.ceil(costo / (1 - margenPct / 100) - 1e-9);
}

/** Margen en % sobre el precio (una decimal). */
export function margenPct(precio: number | null | undefined, costo: number): number | null {
  if (precio === null || precio === undefined || precio <= 0) return null;
  return Math.round(((precio - costo) / precio) * 1000) / 10;
}

/** Hoy en Querétaro, 'YYYY-MM-DD'. */
export const hoyLocal = () => fechaLocal();

/** Piezas en curado y fecha del primer lote que estará listo, por producto. */
export type Curado = { piezas: number; listo: string };
export function curadoPorProducto(lotes: Pick<Lote, 'estado' | 'producto_id' | 'piezas_planeadas' | 'listo_desde'>[]): Map<string, Curado> {
  const curado = new Map<string, Curado>();
  for (const l of lotes) {
    if (l.estado !== 'en_curado') continue;
    const c = curado.get(l.producto_id);
    if (c) {
      c.piezas += l.piezas_planeadas;
      if (l.listo_desde < c.listo) c.listo = l.listo_desde;
    } else curado.set(l.producto_id, { piezas: l.piezas_planeadas, listo: l.listo_desde });
  }
  return curado;
}

/**
 * ¿Lo que ya está curando basta para pasar del mínimo? Entonces no hace falta otro lote (sólo esperar):
 * así «Hay que reponer» no lleva a producir de más.
 */
export function curadoCubre(stock: number, minimo: number, curado: Curado | null | undefined): curado is Curado {
  return !!curado && curado.piezas > 0 && stock + curado.piezas > minimo;
}

/** "Lote en curado · listo el 18 de octubre" (o "ya listo para liberar"). */
export function textoLoteEnCurado(c: Curado, hoy: string = fechaLocal()): string {
  return c.listo <= hoy ? 'Lote en curado · ya se puede liberar' : `Lote en curado · listo el ${fechaEnLetra(c.listo, c.listo.slice(0, 4) !== hoy.slice(0, 4))}`;
}
