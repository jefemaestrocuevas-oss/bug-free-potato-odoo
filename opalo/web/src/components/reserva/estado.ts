// Estado del asistente de reserva. Se guarda en sessionStorage para sobrevivir al ir a
// /entrar y volver (o a una recarga). La ficha de salud, la firma (cuando se pide en línea) y las
// notas (texto libre donde puede haber datos de salud) NO se guardan aquí: viven sólo en memoria.
// Al cerrar sesión se borra todo con borrarEstado().
//
// ESPEC §9: con configuracion.firma_en_linea = false (decisión de Ópalo) el último paso es
// "Revisa y confirma" y la firma del consentimiento se hace en el spa; con true el último paso
// vuelve a ser la firma en pantalla. Los dos modos tienen 6 pasos, así que un borrador guardado en
// un modo se abre sin problema en el otro (el paso 6 es siempre el último).
import type { CitaDetalle, EstadoCita, FichaSalud, ResultadoReserva, Slot } from '../../lib/api/tipos';
import type { ItemElegido } from './utilidades';

export const CLAVE_RESERVA = 'opalo-reserva-v1';

export type Paso = 1 | 2 | 3 | 4 | 5 | 6;
export const TOTAL_PASOS = 6;

const NOMBRES_BASE: Record<Exclude<Paso, 6>, string> = {
  1: 'Servicios',
  2: 'Día y hora',
  3: 'Tus datos',
  4: 'Ficha de salud',
  5: 'Políticas',
};

/** Nombres cortos del indicador de pasos. */
export function nombresPasos(firmaEnLinea: boolean): Record<Paso, string> {
  return { ...NOMBRES_BASE, 6: firmaEnLinea ? 'Firma' : 'Confirmar' };
}

/** Títulos de cada paso. */
export function titulosPasos(firmaEnLinea: boolean): Record<Paso, string> {
  return {
    1: '¿Qué te vas a hacer?',
    2: 'Elige día y hora',
    3: 'Tus datos',
    4: 'Tu ficha de salud',
    5: firmaEnLinea ? 'Políticas y consentimiento' : 'Nuestras políticas',
    6: firmaEnLinea ? 'Revisa y firma' : 'Revisa y confirma',
  };
}

export interface EstadoReserva {
  v: 1;
  paso: Paso;
  items: ItemElegido[];
  /** Día elegido 'YYYY-MM-DD' (hora de Querétaro). */
  fecha: string | null;
  slot: Slot | null;
  /** firmaItems() de la selección con la que se eligió el horario. */
  slotPara: string | null;
  /** user_id con el que se completaron los pasos personales. */
  usuario: string | null;
  datosListos: boolean;
  /** `${usuario}|${categorías}` con que se completó la ficha. */
  fichaPara: string | null;
  /** ids de las políticas generales pendientes que la clienta marcó. */
  politicasMarcadas: string[];
  /** Sólo con firma en línea: la clienta marcó que leyó el consentimiento que va a firmar. */
  consentimientoLeido: boolean;
  /**
   * Con qué se completó el paso de políticas: `${usuario}|${tipos de consentimiento}` con firma en
   * línea, o `${usuario}|` cuando el consentimiento se firma en el spa (no depende de los servicios).
   */
  politicasPara: string | null;
  /** Sólo en memoria: no se guarda en sessionStorage. */
  notas: string;
  /** ?credito=<id> que falta aplicar (p. ej. mientras inicia sesión). */
  creditoPendiente: string | null;
}

/** Borrador de la ficha (sólo en memoria). */
export interface FichaBorrador {
  /** Todas las respuestas conocidas (incluye las de la ficha anterior). */
  respuestas: Record<string, boolean>;
  detalles: Record<string, string>;
  alergias: string;
  medicamentos: string;
  observaciones: string;
  acepta_datos_sensibles: boolean;
  /** Fecha de la ficha anterior con la que se precargó (o null si es nueva). */
  anterior_en: string | null;
  /** La clienta ya contestó "¿sigue igual?". */
  revisada: boolean;
}

/** Lo que se muestra al terminar (sólo en memoria). */
export interface Confirmacion {
  resultado: ResultadoReserva;
  estado: EstadoCita;
  inicio: string;
  fin: string;
  duracion_min: number;
  personal_nombre: string;
  personal_titulo: string | null;
  servicios: string[];
  total_texto: string;
  /** "Pagas en el spa…" o "no pagas nada en el spa" si todo es prepagado. */
  nota_pago: string;
  /** Para "Agregar a mi calendario". */
  cita?: CitaDetalle;
}

export function estadoInicial(): EstadoReserva {
  return {
    v: 1,
    paso: 1,
    items: [],
    fecha: null,
    slot: null,
    slotPara: null,
    usuario: null,
    datosListos: false,
    fichaPara: null,
    politicasMarcadas: [],
    consentimientoLeido: false,
    politicasPara: null,
    notas: '',
    creditoPendiente: null,
  };
}

function almacen(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function esPaso(n: unknown): n is Paso {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= TOTAL_PASOS;
}

const textoONulo = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function esSlot(s: unknown): s is Slot {
  if (!s || typeof s !== 'object') return false;
  const x = s as Record<string, unknown>;
  return typeof x.inicio === 'string' && typeof x.fin === 'string' && typeof x.personal_id === 'string' && typeof x.personal_nombre === 'string';
}

/**
 * Lee el estado guardado; si no hay o está dañado, uno nuevo. Sólo se toman los campos conocidos y con
 * el tipo correcto: un borrador de otra versión del asistente (p. ej. el que terminaba en el paso de
 * firma) se abre sin romperse y el asistente regresa al primer paso que falte.
 */
export function cargarEstado(): EstadoReserva {
  const base = estadoInicial();
  try {
    const texto = almacen()?.getItem(CLAVE_RESERVA);
    if (!texto) return base;
    const x = JSON.parse(texto) as Record<string, unknown> | null;
    if (!x || typeof x !== 'object' || x.v !== 1 || !Array.isArray(x.items)) return base;
    const items = (x.items as Partial<ItemElegido>[]).filter(
      (it): it is ItemElegido =>
        !!it && (it.tipo === 'servicio' || it.tipo === 'paquete') && typeof it.id === 'string' && (it.credito_id === null || typeof it.credito_id === 'string'),
    );
    return {
      ...base,
      paso: esPaso(x.paso) ? x.paso : 1,
      items,
      fecha: textoONulo(x.fecha),
      slot: esSlot(x.slot) ? x.slot : null,
      slotPara: textoONulo(x.slotPara),
      usuario: textoONulo(x.usuario),
      datosListos: x.datosListos === true,
      fichaPara: textoONulo(x.fichaPara),
      politicasMarcadas: Array.isArray(x.politicasMarcadas) ? x.politicasMarcadas.filter((i): i is string => typeof i === 'string') : [],
      consentimientoLeido: x.consentimientoLeido === true,
      politicasPara: textoONulo(x.politicasPara),
      // Las notas no se leen del almacenamiento (versiones anteriores sí las guardaban).
      notas: '',
      creditoPendiente: textoONulo(x.creditoPendiente),
    };
  } catch {
    return base;
  }
}

export function guardarEstado(e: EstadoReserva): void {
  try {
    almacen()?.setItem(CLAVE_RESERVA, JSON.stringify({ ...e, notas: '' }));
  } catch {
    // Sin almacenamiento: el asistente sigue funcionando en memoria.
  }
}

export function borrarEstado(): void {
  try {
    almacen()?.removeItem(CLAVE_RESERVA);
  } catch {
    // Nada que borrar.
  }
}

/** Convierte el borrador en la ficha que se guarda (detalles sólo de las respuestas "Sí"). */
export function fichaDesdeBorrador(b: FichaBorrador): FichaSalud {
  const detalles: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.detalles)) if (b.respuestas[k] === true && v.trim()) detalles[k] = v.trim();
  const limpio = (t: string) => (t.trim() ? t.trim() : null);
  return {
    respuestas: { ...b.respuestas },
    detalles,
    alergias: limpio(b.alergias),
    medicamentos: limpio(b.medicamentos),
    observaciones: limpio(b.observaciones),
    acepta_datos_sensibles: b.acepta_datos_sensibles,
  };
}

/** Borrador a partir de la ficha vigente (o vacío). El consentimiento se pide de nuevo. */
export function borradorDesdeFicha(f: FichaSalud | null): FichaBorrador {
  return {
    respuestas: f ? { ...f.respuestas } : {},
    detalles: f ? { ...f.detalles } : {},
    alergias: f?.alergias ?? '',
    medicamentos: f?.medicamentos ?? '',
    observaciones: f?.observaciones ?? '',
    acepta_datos_sensibles: false,
    anterior_en: f ? f.creado_en ?? '' : null,
    revisada: !f,
  };
}
