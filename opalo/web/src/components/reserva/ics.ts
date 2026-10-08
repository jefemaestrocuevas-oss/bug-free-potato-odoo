// Archivo .ics (iCalendar, RFC 5545) generado en el navegador para "Agregar a mi calendario".
// Las horas van en UTC (sufijo Z): cualquier calendario las muestra en la hora local de quien lo abre.
import type { Configuracion } from '../../lib/api/tipos';
import { telefonoBonito } from '../../lib/format';
import { unirConY } from './utilidades';

export interface EventoCalendario {
  uid: string;
  /** ISO 8601 */
  inicio: string;
  /** ISO 8601 */
  fin: string;
  titulo: string;
  descripcion?: string;
  lugar?: string;
}

/**
 * Evento de una cita de Ópalo (confirmación de la reserva y Mis citas): quién te atiende, tolerancia y
 * cómo cancelar. Sólo datos de la cita: nada de la ficha de salud ni de documentos.
 */
export function eventoDeCita(
  cita: { id: string; inicio: string; fin: string; servicios: string[]; personal_nombre: string },
  config: Pick<Configuracion, 'nombre_negocio' | 'direccion' | 'telefono_whatsapp' | 'tolerancia_retraso_min' | 'horas_cancelacion'>,
): EventoCalendario {
  return {
    uid: cita.id,
    inicio: cita.inicio,
    fin: cita.fin,
    titulo: `Cita en ${config.nombre_negocio}: ${unirConY(cita.servicios)}`,
    descripcion: [
      `Te atiende ${cita.personal_nombre}.`,
      `Llega puntual: tienes ${config.tolerancia_retraso_min} minutos de tolerancia.`,
      `Para cancelar o cambiar tu cita, hazlo con ${config.horas_cancelacion} horas de anticipación desde tu cuenta o por WhatsApp al ${telefonoBonito(config.telefono_whatsapp)}.`,
    ].join('\n'),
    lugar: config.direccion,
  };
}

function fechaIcs(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Escapa texto según RFC 5545 (\\ ; , y saltos de línea). */
export function escaparIcs(t: string): string {
  return t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Dobla líneas largas (máx. 75 octetos por línea; las siguientes empiezan con un espacio). */
function doblar(linea: string): string {
  const cod = new TextEncoder();
  if (cod.encode(linea).length <= 75) return linea;
  const partes: string[] = [];
  let actual = '';
  let bytes = 0;
  for (const ch of linea) {
    const n = cod.encode(ch).length;
    const limite = partes.length === 0 ? 75 : 74;
    if (bytes + n > limite) {
      partes.push(actual);
      actual = '';
      bytes = 0;
    }
    actual += ch;
    bytes += n;
  }
  if (actual) partes.push(actual);
  return partes.join('\r\n ');
}

export function generarIcs(e: EventoCalendario, ahora: Date = new Date()): string {
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Opalo Spa//Reservas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@opalo`,
    `DTSTAMP:${fechaIcs(ahora.toISOString())}`,
    `DTSTART:${fechaIcs(e.inicio)}`,
    `DTEND:${fechaIcs(e.fin)}`,
    `SUMMARY:${escaparIcs(e.titulo)}`,
    ...(e.descripcion ? [`DESCRIPTION:${escaparIcs(e.descripcion)}`] : []),
    ...(e.lugar ? [`LOCATION:${escaparIcs(e.lugar)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT2H',
    `DESCRIPTION:${escaparIcs(e.titulo)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lineas.map(doblar).join('\r\n') + '\r\n';
}

/** Descarga el .ics (no sale nada del navegador). */
export function descargarIcs(e: EventoCalendario, nombreArchivo = 'cita-opalo.ics'): void {
  const blob = new Blob([generarIcs(e)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
