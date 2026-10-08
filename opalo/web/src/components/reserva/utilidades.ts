// Utilidades puras de la reserva en línea y del portal de clientas.
// Las reglas son las de ESPEC.md vistas desde la UI; el servidor vuelve a validar todo.
import type {
  Catalogo,
  Cliente,
  Contraindicacion,
  Credito,
  ItemCita,
  ItemReserva,
  Paquete,
  Servicio,
  TipoPolitica,
} from '../../lib/api/tipos';
import { dinero, edad, fechaLocal } from '../../lib/format';

export type TipoItem = 'servicio' | 'paquete';

/** Lo que la clienta eligió en el paso 1. */
export interface ItemElegido {
  tipo: TipoItem;
  id: string;
  /** Servicio prepagado (crédito) con el que se paga este ítem. */
  credito_id: string | null;
}

/** Orden canónico de los documentos (igual que en la base). */
export const ORDEN_TIPOS: TipoPolitica[] = [
  'terminos',
  'privacidad',
  'cancelacion',
  'consentimiento_depilacion',
  'consentimiento_facial',
  'consentimiento_corporal',
];

/** R1: un servicio se reserva en línea si está activo, disponible y marcado como reservable. */
export function servicioReservable(s: Servicio): boolean {
  return s.activo && s.etapa === 'disponible' && s.reservable_en_linea;
}

/**
 * Un paquete se ofrece para reservar si es combo (una visita), está activo y todo lo que
 * incluye ya está disponible. Los bonos se compran y luego se reservan sesión por sesión con el crédito.
 */
export function paqueteReservable(p: Paquete, porId: Map<string, Servicio>): boolean {
  if (!p.activo || p.tipo !== 'combo' || p.items.length === 0) return false;
  return p.items.every((it) => {
    const s = porId.get(it.servicio_id);
    return !!s && s.activo && s.etapa === 'disponible';
  });
}

export function mapaServicios(cat: Catalogo): Map<string, Servicio> {
  return new Map(cat.servicios.map((s) => [s.id, s]));
}

export function mapaPaquetes(cat: Catalogo): Map<string, Paquete> {
  return new Map(cat.paquetes.map((p) => [p.id, p]));
}

export function aItemsReserva(items: ItemElegido[]): ItemReserva[] {
  return items.map((it) => {
    const base: ItemReserva = it.tipo === 'servicio' ? { servicio_id: it.id } : { paquete_id: it.id };
    if (it.credito_id) base.credito_id = it.credito_id;
    return base;
  });
}

/** Firma estable de la selección (para saber si cambió). */
export function firmaItems(items: ItemElegido[]): string {
  return items
    .map((it) => `${it.tipo}:${it.id}:${it.credito_id ?? ''}`)
    .sort()
    .join('|');
}

/** Servicios que implica la selección (los paquetes se expanden). Sin repetir. */
export function serviciosDeItems(items: ItemElegido[], cat: Catalogo): Servicio[] {
  const porId = mapaServicios(cat);
  const paquetes = mapaPaquetes(cat);
  const vistos = new Map<string, Servicio>();
  for (const it of items) {
    if (it.tipo === 'servicio') {
      const s = porId.get(it.id);
      if (s) vistos.set(s.id, s);
    } else {
      for (const ps of paquetes.get(it.id)?.items ?? []) {
        const s = porId.get(ps.servicio_id);
        if (s) vistos.set(s.id, s);
      }
    }
  }
  return [...vistos.values()];
}

/** Hay al menos un servicio que no es complemento (o un paquete). */
export function tieneServicioBase(items: ItemElegido[], cat: Catalogo): boolean {
  const porId = mapaServicios(cat);
  return items.some((it) => it.tipo === 'paquete' || (porId.get(it.id) && !porId.get(it.id)!.es_complemento));
}

/** Slugs de las categorías de la selección, ordenados (también sirve de firma). */
export function categoriasDeItems(items: ItemElegido[], cat: Catalogo): string[] {
  const porCat = new Map(cat.categorias.map((c) => [c.id, c.slug]));
  const slugs = new Set<string>();
  for (const s of serviciosDeItems(items, cat)) {
    const slug = porCat.get(s.categoria_id);
    if (slug) slugs.add(slug);
  }
  return [...slugs].sort();
}

/** Tipos de consentimiento informado que implica la selección, en orden canónico. */
export function tiposConsentimiento(servicios: Servicio[]): TipoPolitica[] {
  const tipos = new Set<TipoPolitica>();
  for (const s of servicios) if (s.tipo_consentimiento) tipos.add(s.tipo_consentimiento);
  return ORDEN_TIPOS.filter((t) => tipos.has(t));
}

/** Preguntas de la ficha que aplican a las categorías elegidas (categorias null o vacío = todas). */
export function contraindicacionesAplicables(contras: Contraindicacion[], slugs: string[]): Contraindicacion[] {
  return contras
    .filter((c) => !c.categorias || c.categorias.length === 0 || c.categorias.some((s) => slugs.includes(s)))
    .sort((a, b) => a.orden - b.orden);
}

/** Un crédito (servicio prepagado) como ítem de la reserva. */
export function creditoAItem(c: Credito): ItemElegido | null {
  if (c.servicio_id) return { tipo: 'servicio', id: c.servicio_id, credito_id: c.id };
  if (c.paquete_id) return { tipo: 'paquete', id: c.paquete_id, credito_id: c.id };
  return null;
}

export function creditoUsable(c: Credito): boolean {
  return c.vigente && c.restantes > 0;
}

// ---------------- Dinero ----------------

export interface LineaPrecio {
  precio: number | null;
  prepagado?: boolean;
}

export interface Total {
  /** Suma de lo que ya tiene precio (sin lo prepagado). */
  monto: number;
  /** Hay algo con precio por confirmar. */
  porConfirmar: boolean;
  /** Lo que queda por pagar sólo tiene precios por confirmar (nada con precio conocido). */
  todoPorConfirmar: boolean;
  /** Cuántas líneas se pagan con un servicio prepagado. */
  prepagados: number;
  /** Todo se paga con servicios prepagados: no hay nada que pagar en el spa. */
  todoPrepagado: boolean;
  texto: string;
}

/** Total estimado: precios null = "por confirmar en cabina"; los prepagados no se cobran. */
export function calcularTotal(lineas: LineaPrecio[]): Total {
  let monto = 0;
  let porConfirmar = false;
  let conPrecio = 0;
  let prepagados = 0;
  for (const l of lineas) {
    if (l.prepagado) prepagados++;
    else if (l.precio === null) porConfirmar = true;
    else {
      monto += l.precio;
      conPrecio++;
    }
  }
  monto = Math.round(monto * 100) / 100;
  const todoPrepagado = lineas.length > 0 && prepagados === lineas.length;
  const todoPorConfirmar = porConfirmar && conPrecio === 0;
  let texto: string;
  if (todoPrepagado) texto = 'Prepagado';
  else if (todoPorConfirmar) texto = 'Por confirmar en cabina';
  else if (porConfirmar) texto = `${dinero(monto)} + lo que se confirme en cabina`;
  else if (prepagados > 0) texto = `${dinero(monto)} (más ${prepagados === 1 ? 'tu servicio prepagado' : 'tus servicios prepagados'})`;
  else texto = dinero(monto);
  return { monto, porConfirmar, todoPorConfirmar, prepagados, todoPrepagado, texto };
}

/**
 * Total de una cita ya creada (los ítems traen su precio copiado; null = por confirmar).
 * R4: el ítem que se paga con un servicio prepagado se guarda con precio 0, así que 0 = prepagado.
 */
export function totalCita(items: ItemCita[]): Total {
  return calcularTotal(items.map((i) => ({ precio: i.precio, prepagado: i.precio === 0 })));
}

/** Frase sobre el pago para el resumen y la confirmación. */
export function notaPago(t: Total): string {
  if (t.todoPrepagado)
    return `Ya está cubierto con ${t.prepagados === 1 ? 'tu servicio prepagado' : 'tus servicios prepagados'}: no pagas nada en el spa.`;
  if (t.prepagados > 0) return 'Lo demás lo pagas en el spa el día de tu cita.';
  return 'Pagas en el spa el día de tu cita.';
}

// ---------------- Personas ----------------

export function nombreCompleto(c: Pick<Cliente, 'nombre' | 'apellidos'> | null | undefined): string {
  if (!c) return '';
  return [c.nombre, c.apellidos].filter((x) => x && x.trim()).join(' ').trim();
}

export function soloDigitos(t: string): string {
  return t.replace(/\D/g, '');
}

/** Teléfono de México a 10 dígitos (acepta +52 / 52 al inicio). */
export function normalizarTelefono(t: string): string {
  const d = soloDigitos(t);
  if (d.length === 12 && d.startsWith('52')) return d.slice(2);
  if (d.length === 13 && d.startsWith('521')) return d.slice(3);
  return d;
}

export function telefonoValido(t: string): boolean {
  return /^\d{10}$/.test(normalizarTelefono(t));
}

export function fechaValida(f: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const [a, m, d] = f.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d));
  return x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
}

/** Revisa una fecha de nacimiento: null si está bien, o el mensaje de error. */
export function errorFechaNacimiento(f: string, hoy: string = fechaLocal()): string | null {
  if (!f) return 'Escribe tu fecha de nacimiento.';
  if (!fechaValida(f)) return 'Revisa tu fecha de nacimiento.';
  if (f >= hoy) return 'Tu fecha de nacimiento debe ser anterior a hoy.';
  if (edad(f, hoy) > 110) return 'Revisa el año de tu fecha de nacimiento.';
  return null;
}

export function emailValido(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
}

/**
 * Sólo rutas internas para ?volver= (evita redirigir a otro sitio). Rechaza caracteres de control y
 * barras invertidas: el parser de URL los quita o los vuelve "/" ('/\t/evil.com' → '//evil.com').
 */
export function volverSeguro(v: string | null | undefined): string | null {
  if (!v || !v.startsWith('/') || v.startsWith('//')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F\\]/.test(v)) return null;
  try {
    const base = 'https://opalo.invalid';
    const u = new URL(v, base);
    if (u.origin !== base || !u.pathname.startsWith('/') || u.pathname.startsWith('//')) return null;
    // Ruta ya normalizada (sin "..", ni "//" que salgan de quitar segmentos).
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

/** Horas que faltan para un instante (negativo si ya pasó). */
export function horasHasta(iso: string, ahora: Date = new Date()): number {
  return (new Date(iso).getTime() - ahora.getTime()) / 3_600_000;
}

/** Une con comas y "y": "Cejas, Axilas y Bigote". */
export function unirConY(partes: string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}
