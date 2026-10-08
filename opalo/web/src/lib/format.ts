// Formatos y fechas para Ópalo (es-MX, America/Mexico_City).
// México no tiene horario de verano desde 2022: la hora local es UTC−6 todo el año.

export const ZONA = 'America/Mexico_City';
export const OFFSET_MX = '-06:00';

const fmtDineroEntero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const fmtDineroCentavos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** "$1,250" o "$1,250.50" (nunca "$1,250.5") · null → "Precio por confirmar" */
export function dinero(n: number | null | undefined, siNulo = 'Precio por confirmar'): string {
  if (n === null || n === undefined || Number.isNaN(n)) return siNulo;
  const redondo = Math.round(n * 100) / 100;
  return Number.isInteger(redondo) ? fmtDineroEntero.format(redondo) : fmtDineroCentavos.format(redondo);
}

export function numero(n: number | null | undefined, decimales = 0): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: decimales, minimumFractionDigits: 0 }).format(n);
}

export function porcentaje(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${numero(n, 1)} %`;
}

/** "martes 4 de noviembre" */
export function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
}

/** "31 de octubre de 2026" (o "31 de octubre" sin año) para 'YYYY-MM-DD'. */
export function fechaEnLetra(fecha: string, conAnio = true): string {
  return new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, day: 'numeric', month: 'long', ...(conAnio ? { year: 'numeric' as const } : {}) }).format(
    new Date(`${fecha.slice(0, 10)}T12:00:00${OFFSET_MX}`),
  );
}

/** "4 nov 2026" (acepta 'YYYY-MM-DD' o ISO completo) */
export function fechaCorta(fechaOIso: string): string {
  const d = fechaOIso.length === 10 ? new Date(`${fechaOIso}T12:00:00${OFFSET_MX}`) : new Date(fechaOIso);
  return new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/** "10:00" en hora de Querétaro */
export function hora(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** "martes 4 de noviembre · 10:00" */
export function fechaHora(iso: string): string {
  return `${fechaLarga(iso)} · ${hora(iso)}`;
}

/** "noviembre 2026" para 'YYYY-MM-01' */
export function mesNombre(yyyyMm01: string): string {
  return new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, month: 'long', year: 'numeric' }).format(new Date(`${yyyyMm01.slice(0, 10)}T12:00:00${OFFSET_MX}`));
}

/** 60 → "1 h", 90 → "1 h 30 min", 45 → "45 min" */
export function duracion(min: number | null | undefined): string {
  if (!min) return '1 h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

/** Fecha local 'YYYY-MM-DD' de un instante (por defecto, ahora) en Querétaro. */
export function fechaLocal(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)!.value;
  return `${v('year')}-${v('month')}-${v('day')}`;
}

/** 'YYYY-MM-DD' + 'HH:mm' (hora de Querétaro) → ISO con zona. */
export function isoDesdeLocal(fecha: string, hhmm: string): string {
  return new Date(`${fecha}T${hhmm.slice(0, 5)}:00${OFFSET_MX}`).toISOString();
}

/** Suma días a 'YYYY-MM-DD'. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00${OFFSET_MX}`);
  d.setUTCDate(d.getUTCDate() + dias);
  return fechaLocal(d);
}

/** Día de la semana (0 = domingo) de 'YYYY-MM-DD'. */
export function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00${OFFSET_MX}`).getUTCDay();
}

export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Primer día del mes 'YYYY-MM-01' de una fecha 'YYYY-MM-DD'. */
export function inicioMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`;
}

/** Edad cumplida a hoy (fecha 'YYYY-MM-DD'). */
export function edad(fechaNacimiento: string, hoy: string = fechaLocal()): number {
  const [a, m, d] = fechaNacimiento.split('-').map(Number);
  const [ha, hm, hd] = hoy.split('-').map(Number);
  let e = ha - a;
  if (hm < m || (hm === m && hd < d)) e--;
  return e;
}

/** Enlace de WhatsApp con mensaje. */
export function enlaceWhatsApp(telefono: string, mensaje?: string): string {
  const num = telefono.replace(/\D/g, '');
  const conPais = num.length === 10 ? `52${num}` : num;
  return `https://wa.me/${conPais}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`;
}

/** "442 170 1466" */
export function telefonoBonito(t: string | null | undefined): string {
  if (!t) return '';
  const n = t.replace(/\D/g, '').slice(-10);
  return n.length === 10 ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : t;
}

export const ETIQUETA_ESTADO_CITA: Record<string, string> = {
  pendiente: 'Por confirmar',
  confirmada: 'Confirmada',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
};

export const ETIQUETA_ESTADO_PEDIDO: Record<string, string> = {
  pendiente_pago: 'Pendiente de pago',
  pagado: 'Pagado',
  cancelado: 'Cancelado',
  reembolsado: 'Reembolsado',
};

export const ETIQUETA_METODO_PAGO: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  mercado_pago: 'Mercado Pago',
  cortesia: 'Cortesía',
};

export const ETIQUETA_POLITICA: Record<string, string> = {
  terminos: 'Términos y condiciones',
  privacidad: 'Aviso de privacidad',
  cancelacion: 'Política de cancelación',
  consentimiento_depilacion: 'Consentimiento informado · Depilación',
  consentimiento_facial: 'Consentimiento informado · Faciales',
  consentimiento_corporal: 'Consentimiento informado · Corporales',
};

/** Mensaje legible de cualquier error. */
export function mensajeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Algo salió mal. Intenta de nuevo.';
}
