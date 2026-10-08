// Datos de contacto del sitio público. Se leen de `configuracion` (api.getConfiguracion);
// mientras cargan (o si falla la conexión) se usan los de datos/catalogo.json, la misma fuente
// que llena la base: así no hay valores escritos dos veces.
import { useEffect, useState } from 'react';
import { configuracion as CONFIG_CATALOGO } from '../../../../datos/catalogo.json';
import { api, type Configuracion } from '../../lib/api';
import { fechaLocal } from '../../lib/format';

export type DatosContacto = {
  nombre_negocio: string;
  lema: string | null;
  telefono_whatsapp: string;
  direccion: string;
  horas_cancelacion: number;
  edad_minima: number;
  edad_mayoria: number;
  vigencia_creditos_dias: number;
  duracion_sesion_min: number;
  tolerancia_retraso_min: number;
  /**
   * Día de apertura ('YYYY-MM-DD', hora de Querétaro) o null. Aquí sólo alimenta los textos de
   * bienvenida; la regla de reservas usa `configuracion.fecha_apertura` (ver PasoHorario).
   */
  fecha_apertura: string | null;
  /** false (decisión de Ópalo, ESPEC §9): la firma se hace en el spa y el sitio no la menciona. */
  firma_en_linea: boolean;
};

/** Valores del catálogo, mientras llega la configuración de la base. */
export const CONTACTO_RESPALDO: DatosContacto = {
  nombre_negocio: CONFIG_CATALOGO.nombre_negocio,
  lema: CONFIG_CATALOGO.lema,
  telefono_whatsapp: CONFIG_CATALOGO.telefono_whatsapp,
  direccion: CONFIG_CATALOGO.direccion,
  horas_cancelacion: CONFIG_CATALOGO.horas_cancelacion,
  edad_minima: CONFIG_CATALOGO.edad_minima,
  edad_mayoria: CONFIG_CATALOGO.edad_mayoria,
  vigencia_creditos_dias: CONFIG_CATALOGO.vigencia_creditos_dias,
  duracion_sesion_min: CONFIG_CATALOGO.duracion_sesion_min,
  tolerancia_retraso_min: CONFIG_CATALOGO.tolerancia_retraso_min,
  fecha_apertura: CONFIG_CATALOGO.fecha_apertura ?? null,
  firma_en_linea: CONFIG_CATALOGO.firma_en_linea === true,
};

let promesa: Promise<Configuracion> | null = null;
let cache: Configuracion | null = null;

function cargarConfiguracion(): Promise<Configuracion> {
  if (!promesa) {
    promesa = api.getConfiguracion().then(
      (c) => (cache = c),
      (e) => {
        promesa = null; // permite reintentar en la siguiente página
        throw e;
      },
    );
  }
  return promesa;
}

/** Configuración pública con valores de respaldo inmediatos (nunca bloquea la página). */
export function useContacto(): DatosContacto {
  const [config, setConfig] = useState<Configuracion | null>(cache);
  useEffect(() => {
    if (cache) return;
    let vivo = true;
    cargarConfiguracion()
      .then((c) => vivo && setConfig(c))
      .catch(() => {
        // Sin conexión: seguimos con los datos de respaldo.
      });
    return () => {
      vivo = false;
    };
  }, []);
  if (!config) return CONTACTO_RESPALDO;
  return {
    nombre_negocio: config.nombre_negocio || CONTACTO_RESPALDO.nombre_negocio,
    lema: config.lema,
    telefono_whatsapp: config.telefono_whatsapp || CONTACTO_RESPALDO.telefono_whatsapp,
    direccion: config.direccion || CONTACTO_RESPALDO.direccion,
    horas_cancelacion: config.horas_cancelacion,
    edad_minima: config.edad_minima,
    edad_mayoria: config.edad_mayoria,
    vigencia_creditos_dias: config.vigencia_creditos_dias,
    duracion_sesion_min: config.duracion_sesion_min,
    tolerancia_retraso_min: config.tolerancia_retraso_min,
    fecha_apertura: config.fecha_apertura,
    firma_en_linea: config.firma_en_linea === true,
  };
}

/** true mientras no llega el día de apertura (`apertura` null = ya no hay fecha de apertura). */
export function antesDeApertura(apertura: string | null, hoy: string = fechaLocal()): boolean {
  return !!apertura && hoy < apertura;
}

/** Enlace a Google Maps con la dirección (se abre en otra pestaña). */
export function enlaceMapa(direccion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
}

/** 365 → "12 meses", 180 → "6 meses", 30 → "30 días". */
export function textoVigencia(dias: number): string {
  if (dias >= 360 && dias % 365 === 0) return `${(dias / 365) * 12} meses`;
  if (dias >= 60) return `${Math.round(dias / 30)} meses`;
  return dias === 1 ? '1 día' : `${dias} días`;
}
