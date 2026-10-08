// Datos de contacto del sitio público. Se leen de `configuracion` (api.getConfiguracion);
// mientras cargan (o si falla la conexión) se usan estos valores, que son los mismos del catálogo.
import { useEffect, useState } from 'react';
import { api, type Configuracion } from '../../lib/api';
import { fechaLocal } from '../../lib/format';

export const CONTACTO_RESPALDO = {
  nombre_negocio: 'Ópalo',
  lema: 'Todo lo que necesitas para consentirte, en un solo lugar',
  telefono_whatsapp: '4421701466',
  direccion: 'Momentum Centro Sur, Torre 2, Int. 207, Querétaro, Qro.',
  horas_cancelacion: 24,
  edad_minima: 15,
  edad_mayoria: 18,
  vigencia_creditos_dias: 365,
  duracion_sesion_min: 60,
} as const;

/** Fecha de apertura del spa ('YYYY-MM-DD', hora de Querétaro). */
export const FECHA_APERTURA = '2026-10-31';

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
  if (!config) return { ...CONTACTO_RESPALDO };
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
  };
}

/** true mientras no llega el día de apertura. */
export function antesDeApertura(hoy: string = fechaLocal()): boolean {
  return hoy < FECHA_APERTURA;
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
