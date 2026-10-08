// Reglas de presentación de la tienda de Ópalo (ESPEC §10): grupos, existencias, rutas y
// productos relacionados. El servidor vuelve a validar precios y existencias al hacer el pedido y al pagarlo.
import type { CategoriaProducto, ProductoTienda } from '../../lib/api/tipos';
import { fechaEnLetra, fechaLocal, OFFSET_MX, ZONA } from '../../lib/format';

export type GrupoTienda = 'jabones' | 'velas' | 'sets' | 'cuidado';

export const GRUPOS_TIENDA: { valor: GrupoTienda; texto: string; descripcion: string }[] = [
  { valor: 'jabones', texto: 'Jabones', descripcion: 'Hechos a mano en lotes pequeños y curados con paciencia antes de venderse.' },
  { valor: 'velas', texto: 'Velas', descripcion: 'Para llevarte a casa el aroma y la calma de tu sesión.' },
  { valor: 'sets', texto: 'Sets de regalo', descripcion: 'Listos para regalar a quien quieras consentir.' },
  { valor: 'cuidado', texto: 'Para tu cuidado', descripcion: 'Para que los resultados de tu sesión duren más, también en casa.' },
];

/** Desde 1 hasta este número de piezas se avisa "Últimas N piezas". */
export const ULTIMAS_PIEZAS = 3;

export function grupoDe(categoria: CategoriaProducto): GrupoTienda {
  if (categoria === 'jabon') return 'jabones';
  if (categoria === 'vela') return 'velas';
  if (categoria === 'set') return 'sets';
  return 'cuidado';
}

/** Etiqueta corta del tipo de producto ("Jabón", "Vela"…); para lo demás, la marca si la hay. */
export function etiquetaProducto(p: Pick<ProductoTienda, 'categoria' | 'marca'>): string {
  if (p.categoria === 'jabon') return 'Jabón';
  if (p.categoria === 'vela') return 'Vela';
  if (p.categoria === 'set') return 'Set de regalo';
  return p.marca || 'Cuidado en casa';
}

/** Ruta pública de la ficha: /tienda/{slug} (o el id si el producto todavía no tiene slug). */
export function rutaProducto(p: Pick<ProductoTienda, 'slug' | 'id'>): string {
  return `/tienda/${encodeURIComponent(p.slug || p.id)}`;
}

export function buscarProducto(productos: ProductoTienda[], slug: string | undefined): ProductoTienda | null {
  if (!slug) return null;
  return productos.find((p) => p.slug === slug) ?? productos.find((p) => p.id === slug) ?? null;
}

/** Piezas completas que se pueden pedir ahora. */
export function piezasDisponibles(p: Pick<ProductoTienda, 'stock_disponible' | 'hay_stock'>): number {
  if (!p.hay_stock || !Number.isFinite(p.stock_disponible)) return 0;
  return Math.max(0, Math.floor(p.stock_disponible));
}

/** `texto` es el estado completo (ficha); `corto`, el de la pastilla de la tarjeta ("Desde el 18 oct"). */
export type EstadoExistencias =
  | { tipo: 'disponible'; piezas: number; texto: string; corto: string }
  | { tipo: 'ultimas'; piezas: number; texto: string; corto: string }
  | { tipo: 'proximo'; piezas: 0; fecha: string; texto: string; corto: string }
  | { tipo: 'agotado'; piezas: 0; texto: string; corto: string };

/** "12 de noviembre" (con año si no es el año en curso). */
function fechaCorta(fecha: string, hoy: string): string {
  return fechaEnLetra(fecha, fecha.slice(0, 4) !== hoy.slice(0, 4));
}

/** "12 nov" (con año si no es el año en curso: "5 ene 2027"). */
function fechaMuyCorta(fecha: string, hoy: string): string {
  const conAnio = fecha.slice(0, 4) !== hoy.slice(0, 4);
  return new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, day: 'numeric', month: 'short', ...(conAnio ? { year: 'numeric' as const } : {}) })
    .format(new Date(`${fecha.slice(0, 10)}T12:00:00${OFFSET_MX}`))
    .replace(/\./g, '');
}

/** "sábado 31 de octubre" para 'YYYY-MM-DD'. */
function diaEnLetra(fecha: string): string {
  const dia = new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, weekday: 'long' }).format(new Date(`${fecha.slice(0, 10)}T12:00:00${OFFSET_MX}`));
  return `${dia} ${fechaEnLetra(fecha, false)}`;
}

/**
 * Mientras el spa no abre: "a partir del sábado 31 de octubre, cuando abrimos" (para decir desde cuándo se
 * paga y se recoge un pedido). null si ya abrió o no hay fecha de apertura.
 */
export function cuandoAbrimos(apertura: string | null, hoy: string = fechaLocal()): string | null {
  if (!apertura || hoy >= apertura) return null;
  return `a partir del ${diaEnLetra(apertura)}, cuando abrimos`;
}

/**
 * Estado de existencias para la clienta: "Disponible", "Últimas N piezas" (1 a 3), "Agotado" o, si
 * hay un lote curándose, "Disponible desde el {fecha}".
 */
export function estadoExistencias(
  p: Pick<ProductoTienda, 'stock_disponible' | 'hay_stock' | 'proximo_lote_listo'>,
  hoy: string = fechaLocal(),
): EstadoExistencias {
  const piezas = piezasDisponibles(p);
  if (piezas === 0) {
    const fecha = p.proximo_lote_listo;
    if (fecha) {
      // Lote ya curado que el taller todavía no libera: no anunciamos una fecha pasada.
      const futura = fecha > hoy;
      const texto = futura ? `Disponible desde el ${fechaCorta(fecha, hoy)}` : 'Disponible muy pronto';
      return { tipo: 'proximo', piezas: 0, fecha, texto, corto: futura ? `Desde el ${fechaMuyCorta(fecha, hoy)}` : 'Muy pronto' };
    }
    return { tipo: 'agotado', piezas: 0, texto: 'Agotado', corto: 'Agotado' };
  }
  if (piezas <= ULTIMAS_PIEZAS) {
    const texto = piezas === 1 ? 'Última pieza' : `Últimas ${piezas} piezas`;
    return { tipo: 'ultimas', piezas, texto, corto: texto };
  }
  return { tipo: 'disponible', piezas, texto: 'Disponible', corto: 'Disponible' };
}

/** Destacados primero, sin perder el orden del servidor (categoría, orden, nombre). */
export function ordenarProductos(productos: ProductoTienda[]): ProductoTienda[] {
  return productos
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(b.p.destacado) - Number(a.p.destacado) || a.i - b.i)
    .map((x) => x.p);
}

export function productosDelGrupo(productos: ProductoTienda[], grupo: GrupoTienda | 'todo'): ProductoTienda[] {
  const lista = grupo === 'todo' ? productos : productos.filter((p) => grupoDe(p.categoria) === grupo);
  return ordenarProductos(lista);
}

/** Grupos que tienen al menos un producto (para las pestañas). */
export function gruposConProductos(productos: ProductoTienda[]): typeof GRUPOS_TIENDA {
  return GRUPOS_TIENDA.filter((g) => productos.some((p) => grupoDe(p.categoria) === g.valor));
}

/** Otros productos de la misma categoría (los que se pueden pedir ya, primero). */
export function relacionados(productos: ProductoTienda[], producto: ProductoTienda, n = 3): ProductoTienda[] {
  return ordenarProductos(productos.filter((p) => p.id !== producto.id && p.categoria === producto.categoria))
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(piezasDisponibles(b.p) > 0) - Number(piezasDisponibles(a.p) > 0) || a.i - b.i)
    .slice(0, n)
    .map((x) => x.p);
}

/** Para Inicio: sólo lo hecho en Ópalo; destacados y con existencias primero. */
export function destacadosHechosEnOpalo(productos: ProductoTienda[], n = 3): ProductoTienda[] {
  return productos
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.hecho_en_opalo)
    .sort(
      (a, b) =>
        Number(b.p.destacado) - Number(a.p.destacado) ||
        Number(piezasDisponibles(b.p) > 0) - Number(piezasDisponibles(a.p) > 0) ||
        a.i - b.i,
    )
    .slice(0, n)
    .map((x) => x.p);
}

/** Color de la ilustración: el del producto si es válido ('#rrggbb'). */
export function colorValido(hex: string | null | undefined): string | null {
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : null;
}

/** Foto sólo si es una dirección http(s) o una ruta del propio sitio. */
export function fotoValida(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  return /^https?:\/\//i.test(u) || (u.startsWith('/') && !u.startsWith('//')) ? u : null;
}

/** "Avena y miel · 100 g" */
export function detalleProducto(p: Pick<ProductoTienda, 'aroma' | 'contenido_neto' | 'presentacion'>): string {
  // "100 g" no se parte en dos renglones.
  const contenido = (p.contenido_neto || p.presentacion || '').replace(/(\d) (?=\S)/g, '$1\u00a0');
  return [p.aroma, contenido].filter(Boolean).join(' · ');
}

/** "Momentum Centro Sur, Torre 2, Int. 207" (sin ciudad ni estado). */
export function direccionCorta(direccion: string): string {
  const partes = direccion.split(',').map((s) => s.trim()).filter(Boolean);
  return partes.length > 3 ? partes.slice(0, 3).join(', ') : direccion.trim();
}

/**
 * Mensaje de "Avísame por WhatsApp". Con un lote en curado (estado 'proximo') dice cuándo sale; si no, no
 * supone que el producto ya estuvo a la venta ("cuando esté disponible", no "cuando vuelva").
 */
export function mensajeAvisame(nombre: string, estado?: EstadoExistencias | null, hoy: string = fechaLocal()): string {
  const base = `Hola, Ópalo. Me interesa ${nombre}.`;
  if (estado?.tipo === 'proximo') {
    return estado.fecha > hoy
      ? `${base} ¿Me avisan cuando esté listo? Vi que sale el ${fechaCorta(estado.fecha, hoy)}.`
      : `${base} ¿Me avisan cuando esté listo? Vi que sale muy pronto.`;
  }
  return `${base} ¿Me avisan cuando esté disponible?`;
}
