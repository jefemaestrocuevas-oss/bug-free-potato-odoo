// Piezas de /admin/equipo: foto con respaldo, horas en minutos y validación de horarios.
// Estilos en pages/admin/EquipoAdmin.css (.eqa-).
import { useState, type CSSProperties } from 'react';
import type { Horario, PersonalInterno } from '../../lib/api';

export type CapacitacionInterna = PersonalInterno['capacitaciones'][number];

/** Colores sugeridos para la agenda (se distinguen entre sí y con texto blanco encima). */
export const COLORES_AGENDA = ['#5C6B3F', '#B08A34', '#3E6A7C', '#A5433A', '#7A5C8E', '#2E7BB0', '#4F7A3D', '#8C6A2D'];

export const COLOR_POR_DEFECTO = '#5C6B3F';

export function colorValido(c: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(c);
}

/** URL absoluta (http/https) o ruta del propio sitio. */
export function urlValida(u: string): boolean {
  return /^(https?:\/\/[^\s]+|\/[^\s]*)$/i.test(u.trim());
}

/** Sólo http(s) se vuelve enlace (nunca javascript:, data:, etc.). */
export function enlaceSeguro(u: string | null | undefined): string | null {
  const t = (u ?? '').trim();
  return /^https?:\/\/[^\s]+$/i.test(t) ? t : null;
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter((p) => !/^(de|del|la|las|los|y)$/i.test(p));
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '·';
}

/** Foto de la persona o, si no hay (o no carga), sus iniciales sobre su color de agenda. */
export function EquipoFoto({ nombre, url, color, tam = 72 }: { nombre: string; url: string | null; color: string; tam?: number }) {
  const [fallo, setFallo] = useState<string | null>(null);
  const estilo = { '--eqa-color': colorValido(color) ? color : COLOR_POR_DEFECTO, '--eqa-tam': `${tam}px` } as CSSProperties;
  const segura = url && urlValida(url) ? url.trim() : null;
  if (segura && fallo !== segura) {
    return <img className="eqa-foto" style={estilo} src={segura} alt={`Foto de ${nombre}`} loading="lazy" onError={() => setFallo(segura)} />;
  }
  return (
    <span className="eqa-foto eqa-foto-iniciales" style={estilo} aria-hidden="true">
      {iniciales(nombre)}
    </span>
  );
}

/** 'HH:MM' o 'HH:MM:SS' → minutos desde medianoche. */
export function aMinutos(h: string): number {
  const [hh, mm] = h.slice(0, 5).split(':').map(Number);
  return hh * 60 + mm;
}

export function deMinutos(m: number): string {
  const t = Math.max(0, Math.min(m, 23 * 60 + 59));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** 90 → "1 h 30 min"; 480 → "8 h". */
export function horasTexto(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export interface RangoEditable {
  k: number;
  inicio: string;
  fin: string;
}

/** Errores por rango de un día: incompleto, fin ≤ inicio o traslape con otro rango. */
export function erroresDelDia(rangos: RangoEditable[]): Map<number, string> {
  const errores = new Map<number, string>();
  const completos: RangoEditable[] = [];
  for (const r of rangos) {
    if (!/^\d{2}:\d{2}/.test(r.inicio) || !/^\d{2}:\d{2}/.test(r.fin)) errores.set(r.k, 'Escribe la hora de entrada y la de salida.');
    else if (aMinutos(r.fin) <= aMinutos(r.inicio)) errores.set(r.k, 'La salida debe ser después de la entrada.');
    else completos.push(r);
  }
  const orden = [...completos].sort((a, b) => aMinutos(a.inicio) - aMinutos(b.inicio));
  for (let i = 1; i < orden.length; i++) {
    const previo = orden[i - 1];
    const actual = orden[i];
    if (aMinutos(actual.inicio) < aMinutos(previo.fin)) {
      const texto = `Se encima con ${previo.inicio.slice(0, 5)}–${previo.fin.slice(0, 5)}.`;
      errores.set(actual.k, texto);
      if (!errores.has(previo.k)) errores.set(previo.k, `Se encima con ${actual.inicio.slice(0, 5)}–${actual.fin.slice(0, 5)}.`);
    }
  }
  return errores;
}

/** Rangos de cada día (0 = domingo), ordenados. */
export function horarioPorDia(horarios: Horario[]): Horario[][] {
  const dias: Horario[][] = [[], [], [], [], [], [], []];
  for (const h of horarios) if (h.dia_semana >= 0 && h.dia_semana <= 6) dias[h.dia_semana].push(h);
  for (const d of dias) d.sort((a, b) => aMinutos(a.hora_inicio) - aMinutos(b.hora_inicio));
  return dias;
}

export function minutosSemana(horarios: Horario[]): number {
  return horarios.reduce((s, h) => s + Math.max(0, aMinutos(h.hora_fin) - aMinutos(h.hora_inicio)), 0);
}
