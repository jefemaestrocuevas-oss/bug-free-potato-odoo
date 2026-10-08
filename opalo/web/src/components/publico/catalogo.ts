// Reglas de presentación del catálogo para el sitio público (R1, R2 y R8 de ESPEC.md,
// vistas desde la UI: el servidor vuelve a validar todo al reservar o comprar).
import type { Catalogo, Categoria, Paquete, Servicio, TipoCapacitacion } from '../../lib/api/tipos';
import { duracion } from '../../lib/format';

export const DURACION_SESION = 60;

/** R1: se puede reservar en línea. */
export function servicioReservable(s: Servicio): boolean {
  return s.activo && s.etapa === 'disponible' && s.reservable_en_linea;
}

/** R8: se puede comprar en línea (necesita precio). */
export function servicioVendible(s: Servicio): boolean {
  return s.activo && s.etapa === 'disponible' && s.vendible_en_linea && s.precio !== null;
}

export function paqueteVendible(p: Paquete): boolean {
  return p.activo && p.precio !== null;
}

/** Un paquete se puede reservar si está activo y todo lo que incluye ya está disponible. */
export function paqueteReservable(p: Paquete, porId: Map<string, Servicio>): boolean {
  if (!p.activo || p.items.length === 0) return false;
  return p.items.every((it) => {
    const s = porId.get(it.servicio_id);
    return !!s && s.activo && s.etapa === 'disponible';
  });
}

export function mapaServicios(cat: Catalogo): Map<string, Servicio> {
  return new Map(cat.servicios.map((s) => [s.id, s]));
}

/** "Próximamente" para lo que todavía no se ofrece. */
export function proximamente(s: Servicio): boolean {
  return s.etapa !== 'disponible';
}

/** Suma de los precios sueltos del paquete, o null si alguno está por confirmar. */
export function sumaPorSeparado(p: Paquete, porId: Map<string, Servicio>): number | null {
  if (p.items.length === 0) return null;
  let suma = 0;
  for (const it of p.items) {
    const s = porId.get(it.servicio_id);
    if (!s || s.precio === null) return null;
    suma += s.precio * it.cantidad;
  }
  return Math.round(suma * 100) / 100;
}

/** Ahorro del paquete frente a los servicios sueltos (sólo si se conocen todos los precios y es positivo). */
export function ahorroPaquete(p: Paquete, porId: Map<string, Servicio>): { separado: number; ahorro: number } | null {
  const separado = sumaPorSeparado(p, porId);
  if (separado === null || p.precio === null) return null;
  const ahorro = Math.round((separado - p.precio) * 100) / 100;
  return ahorro > 0 ? { separado, ahorro } : null;
}

/** R2 aproximada para mostrar: suma de duraciones, redondeada a la hora y nunca menor a 1 h. */
export function duracionPaquete(p: Paquete, porId: Map<string, Servicio>, sesion = DURACION_SESION): number {
  let min = p.duracion_min;
  if (min === null) {
    min = p.items.reduce((s, it) => s + (porId.get(it.servicio_id)?.duracion_min ?? 0) * it.cantidad, 0);
  }
  return Math.max(sesion, Math.ceil(min / sesion) * sesion);
}

/** Texto de duración de un servicio: "Sesión de 1 h", "Sesión de 1 h 30 min". */
export function textoDuracion(s: Servicio): string {
  if (s.es_complemento) return 'Se suma a tu sesión';
  return `Sesión de ${duracion(s.duracion_min ?? DURACION_SESION)}`;
}

/** Texto de primera vez, si es distinto a la sesión normal. */
export function textoPrimeraVez(s: Servicio): string | null {
  if (!s.duracion_primera_vez_min || s.duracion_primera_vez_min === s.duracion_min) return null;
  return `Primera vez: ${duracion(s.duracion_primera_vez_min)}`;
}

/** "Cejas, Axilas y Labio superior (bigote)" · con cantidades: "3 × Cejas". */
export function listaIncluye(p: Paquete, porId: Map<string, Servicio>): string[] {
  return p.items.map((it) => {
    const nombre = porId.get(it.servicio_id)?.nombre ?? 'Servicio';
    return it.cantidad > 1 ? `${it.cantidad} × ${nombre}` : nombre;
  });
}

export function unirConY(partes: string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/** Sesiones totales de un bono (suma de cantidades). */
export function sesionesBono(p: Paquete): number {
  return p.items.reduce((s, it) => s + it.cantidad, 0);
}

export function etiquetaTipoPaquete(p: Paquete): string {
  if (p.tipo === 'bono') {
    const n = sesionesBono(p);
    return `Bono · ${n} ${n === 1 ? 'sesión' : 'sesiones'}`;
  }
  return 'Combo · en una visita';
}

/** Precio más bajo conocido de una categoría (para "desde $120"). */
export function precioDesde(servicios: Servicio[]): number | null {
  const precios = servicios.filter((s) => s.etapa === 'disponible' && s.precio !== null).map((s) => s.precio as number);
  return precios.length ? Math.min(...precios) : null;
}

export function serviciosDeCategoria(cat: Catalogo, c: Categoria): Servicio[] {
  return cat.servicios.filter((s) => s.categoria_id === c.id && s.activo).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

export function categoriasOrdenadas(cat: Catalogo): Categoria[] {
  return [...cat.categorias].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

export function paquetesOrdenados(cat: Catalogo): Paquete[] {
  return cat.paquetes.filter((p) => p.activo).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

/** Categoría de complementos: la que tiene sólo complementos. */
export function esCategoriaComplementos(cat: Catalogo, c: Categoria): boolean {
  const s = cat.servicios.filter((x) => x.categoria_id === c.id && x.activo);
  return s.length > 0 && s.every((x) => x.es_complemento);
}

export const ETIQUETA_CAPACITACION: Record<TipoCapacitacion, string> = {
  curso: 'Curso',
  taller: 'Taller',
  diplomado: 'Diplomado',
  certificacion: 'Certificación',
  congreso: 'Congreso',
};
