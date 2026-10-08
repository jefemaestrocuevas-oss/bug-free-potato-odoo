// Utilidades del panel interno (etiquetas, números, fechas y portapapeles).
import type {
  CategoriaProducto,
  EtapaServicio,
  FrecuenciaGasto,
  OrigenCita,
  Rol,
  TipoCapacitacion,
  TipoMovimiento,
  TipoPaquete,
  UnidadMedida,
  UsoProducto,
} from '../../lib/api';
import { diaSemana, fechaLocal, numero, sumarDias } from '../../lib/format';

export const ETIQUETA_ROL: Record<Rol, string> = {
  cliente: 'Clienta',
  personal: 'Personal',
  admin: 'Administración',
};

export const ETIQUETA_CATEGORIA_PRODUCTO: Record<CategoriaProducto, string> = {
  cera: 'Cera',
  preparacion: 'Preparación',
  post: 'Post-tratamiento',
  facial: 'Facial',
  corporal: 'Corporal',
  desechable: 'Desechables',
  limpieza: 'Limpieza',
  venta: 'Para venta',
  otro: 'Otro',
};

export const ETIQUETA_UNIDAD: Record<UnidadMedida, string> = {
  g: 'Gramos (g)',
  ml: 'Mililitros (ml)',
  pz: 'Piezas (pz)',
};

export const ETIQUETA_USO: Record<UsoProducto, string> = {
  cabina: 'Se usa en cabina',
  venta: 'Se vende',
  ambos: 'Cabina y venta',
};

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  compra: 'Compra',
  consumo: 'Consumo en cita',
  venta: 'Venta',
  ajuste: 'Ajuste',
  merma: 'Merma',
};

export const ETIQUETA_FRECUENCIA: Record<FrecuenciaGasto, string> = {
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  anual: 'Anual',
};

export const ETIQUETA_ETAPA: Record<EtapaServicio, string> = {
  disponible: 'Disponible',
  segunda_etapa: 'Segunda etapa',
  requiere_curso: 'Requiere curso',
};

export const ETIQUETA_CAPACITACION: Record<TipoCapacitacion, string> = {
  curso: 'Curso',
  taller: 'Taller',
  diplomado: 'Diplomado',
  certificacion: 'Certificación',
  congreso: 'Congreso',
};

export const ETIQUETA_ORIGEN: Record<OrigenCita, string> = {
  web: 'En línea',
  whatsapp: 'WhatsApp',
  mostrador: 'Mostrador',
  telefono: 'Teléfono',
};

export const ETIQUETA_TIPO_PAQUETE: Record<TipoPaquete, string> = {
  combo: 'Combo',
  bono: 'Bono',
};

/** "Ana López" */
export function nombreCompleto(c: { nombre: string; apellidos?: string | null }): string {
  return [c.nombre, c.apellidos].filter(Boolean).join(' ').trim();
}

/**
 * Texto de un input numérico → número. Vacío o inválido → null.
 * Acepta "$" al inicio, comas de miles como se escriben en México ("1,200" → 1200,
 * "12,500.50" → 12500.5) y coma decimal en lo demás ("1,5" → 1.5).
 */
export function aNumero(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = v.trim().replace(/\s/g, '').replace(/^\$/, '');
  if (!t) return null;
  t = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Número → texto para un input ('' si es null). */
export function aTexto(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? '' : String(n);
}

/** Texto recortado o null si queda vacío. */
export function textoONulo(s: string | null | undefined): string | null {
  const t = (s ?? '').trim();
  return t ? t : null;
}

/** "1,250.5 g" */
export function cantidadConUnidad(n: number | null | undefined, unidad: UnidadMedida, decimales = 1): string {
  if (n === null || n === undefined) return '—';
  return `${numero(n, decimales)} ${unidad}`;
}

/** Cuántas presentaciones equivalen a una cantidad en unidad de medida. */
export function enPresentaciones(cantidad: number, contenido: number): number {
  if (!contenido || contenido <= 0) return 0;
  return cantidad / contenido;
}

/** Costo por unidad de medida con hasta 4 decimales: "$0.5625". */
export function dineroUnitario(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);
}

/** Lunes de la semana de una fecha 'YYYY-MM-DD'. */
export function inicioSemana(fecha: string): string {
  return sumarDias(fecha, -((diaSemana(fecha) + 6) % 7));
}

/** 'YYYY-MM' del mes actual (hora de Querétaro). */
export function mesActual(): string {
  return fechaLocal().slice(0, 7);
}

/** Primer y último día de un mes 'YYYY-MM'. */
export function rangoDeMes(mes: string): [string, string] {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return [`${mes}-01`, `${mes}-${String(ultimo).padStart(2, '0')}`];
}

/** Suma (o resta) meses a 'YYYY-MM'. */
export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM' → "octubre de 2026" */
export function nombreDeMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, 15)));
}

/** 'YYYY-MM-01' → "oct 26" (para ejes de gráficas). */
export function mesCorto(mes: string): string {
  const [a, m] = mes.slice(0, 7).split('-').map(Number);
  const t = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, 15)));
  return `${t.replace('.', '')} ${String(a).slice(2)}`;
}

/** Copia texto al portapapeles (con alternativa para navegadores sin la API). */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Seguimos con la alternativa.
  }
  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Ordena por una clave de texto en español. */
export function porTexto<T>(clave: (x: T) => string) {
  return (a: T, b: T) => clave(a).localeCompare(clave(b), 'es');
}

/** Identificador corto legible para hashes. */
export function hashCorto(h: string | null | undefined): string {
  return h ? `${h.slice(0, 10)}…` : '—';
}
