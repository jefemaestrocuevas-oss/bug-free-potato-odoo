// Utilidades del modo demostración: ids, hash, redondeos y fechas.
import { fechaLocal, inicioMes, isoDesdeLocal, OFFSET_MX, sumarDias } from '../../format';
import { ErrorOpalo } from '../tipos';

// ---------- Errores ----------

export function falla(mensaje: string): never {
  throw new ErrorOpalo(mensaje, 'P0001');
}

// ---------- Ids y copias ----------

export function uuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Copia profunda (la base sólo guarda datos JSON). */
export function clonar<T>(x: T): T {
  return x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T);
}

const ALFABETO_REGALO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I

/** Código de regalo de 8 caracteres A-Z0-9 sin 0/O/1/I. */
export function codigoRegalo(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALFABETO_REGALO[Math.floor(Math.random() * ALFABETO_REGALO.length)];
  return s;
}

// ---------- Números ----------

export function redondear(n: number, decimales = 2): number {
  const f = 10 ** decimales;
  return Math.round((n + Number.EPSILON) * f) / f;
}

// ---------- Texto ----------

/** minúsculas y sin acentos, para búsquedas. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function textoONulo(s: string | null | undefined): string | null {
  const t = (s ?? '').trim();
  return t ? t : null;
}

/** public.slug_de: 'Jabón de Avena (ejemplo)' → 'jabon-de-avena-ejemplo' ('' si no queda nada). */
export function slugDe(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

/** Color '#rrggbb' (acepta '#rgb'); cualquier otra cosa → null (como colorHex del adaptador). */
export function colorHex(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t;
  const corto = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(t);
  return corto ? `#${corto[1]}${corto[1]}${corto[2]}${corto[2]}${corto[3]}${corto[3]}` : null;
}

/** Número de un formulario: null si viene vacío; NaN si no es número. */
export function numeroOpcional(v: unknown): number | null {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return null;
  return typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
}

/** Como numeroOpcional, pero lo que no es un número finito también es null (como numeroCrudo del adaptador). */
export function numeroONulo(v: unknown): number | null {
  const n = numeroOpcional(v);
  return n !== null && Number.isFinite(n) ? n : null;
}

/** public.cantidad_legible: 12.500 → '12.5', 300.000 → '300'. */
export function cantidadLegible(n: number): string {
  const r = redondear(n, 3);
  return String(Object.is(r, -0) ? 0 : r);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** public.fecha_legible: '2026-11-12' → '12 de noviembre de 2026'. */
export function fechaLegible(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * public.firma_valida(text): un <svg> sólo con trazos (svg, path, g, polyline, line, circle),
 * sin eventos (on…=), enlaces (href), javascript: ni url(), de 200 000 caracteres o menos.
 */
export function firmaValida(svg: unknown, maximo = 200_000): boolean {
  if (typeof svg !== 'string') return false;
  return (
    svg.length <= maximo &&
    /^\s*<svg[\s>/]/.test(svg) &&
    /(<\/svg>|\/>)\s*$/.test(svg) &&
    !/<(?!\/?(svg|path|g|polyline|line|circle)[\s>/])/i.test(svg) &&
    !/\son[a-z]+\s*=/i.test(svg) &&
    !/(href|javascript:|url\s*\()/i.test(svg)
  );
}

// ---------- Fechas (México: UTC−6 fijo) ----------

export const MS_MIN = 60_000;
export const MS_HORA = 3_600_000;

export function ms(iso: string): number {
  return new Date(iso).getTime();
}

export function iso(msOFecha: number | Date): string {
  return (typeof msOFecha === 'number' ? new Date(msOFecha) : msOFecha).toISOString();
}

/** ¿Se traslapan [a1, a2) y [b1, b2)? (como tstzrange &&) */
export function traslapan(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

/** Mes local 'YYYY-MM-01' de un instante ISO. */
export function mesDeInstante(isoInstante: string): string {
  return inicioMes(fechaLocal(new Date(isoInstante)));
}

/** Mes 'YYYY-MM-01' de una fecha 'YYYY-MM-DD'. */
export function mesDeFecha(fecha: string): string {
  return inicioMes(fecha);
}

/** Suma meses a 'YYYY-MM-01'. */
export function sumarMesesAMes(mes01: string, n: number): string {
  const [a, m] = mes01.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  const na = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${na}-${String(nm).padStart(2, '0')}-01`;
}

export function diasDelMes(anio: number, mes1a12: number): number {
  return new Date(Date.UTC(anio, mes1a12, 0)).getUTCDate();
}

/** Fecha con el día `dia` (recortado al largo del mes) del mes de `mes01`. */
export function fechaEnMes(mes01: string, dia: number): string {
  const [a, m] = mes01.split('-').map(Number);
  const d = Math.min(Math.max(1, dia), diasDelMes(a, m));
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Suma n meses a 'YYYY-MM-DD' conservando el día (o el último del mes). */
export function sumarMeses(fecha: string, n: number, dia?: number): string {
  const mes = sumarMesesAMes(inicioMes(fecha), n);
  return fechaEnMes(mes, dia ?? Number(fecha.slice(8, 10)));
}

/** Días entre dos fechas 'YYYY-MM-DD' (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((ms(`${b}T12:00:00${OFFSET_MX}`) - ms(`${a}T12:00:00${OFFSET_MX}`)) / 86_400_000);
}

export function esFecha(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Rango [desde, hasta) en milisegundos.
 * Acepta fechas 'YYYY-MM-DD' (hora de Querétaro; `hasta` incluye todo ese día) o instantes ISO.
 */
export function rangoInstantes(desde: string, hasta: string): [number, number] {
  const d = esFecha(desde) ? ms(isoDesdeLocal(desde, '00:00')) : ms(desde);
  const h = esFecha(hasta) ? ms(isoDesdeLocal(sumarDias(hasta, 1), '00:00')) : ms(hasta);
  return [d, h];
}

/** Rango de fechas inclusivo ['YYYY-MM-DD', 'YYYY-MM-DD'] (acepta ISO y lo pasa a fecha local). */
export function rangoFechas(desde: string, hasta: string): [string, string] {
  const d = esFecha(desde) ? desde : fechaLocal(new Date(desde));
  const h = esFecha(hasta) ? hasta : fechaLocal(new Date(hasta));
  return [d, h];
}

// ---------- SHA-256 (síncrono, para hash_sha256 y documento_hash) ----------

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** SHA-256 en hexadecimal (mismo resultado que `encode(sha256(convert_to(x,'UTF8')),'hex')`). */
export function sha256(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  const largo = bytes.length;
  const bloques = Math.ceil((largo + 9) / 64);
  const m = new Uint8Array(bloques * 64);
  m.set(bytes);
  m[largo] = 0x80;
  const dv = new DataView(m.buffer);
  const bits = largo * 8;
  dv.setUint32(m.length - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(m.length - 4, bits >>> 0);

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < m.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
