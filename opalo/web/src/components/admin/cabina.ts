// Modo cabina: mientras la clienta lee y firma en la tablet, el panel queda bloqueado.
// Lo muestra LayoutAdmin (<ModoCabina />) encima de todo; sólo se sale con la contraseña
// de quien entregó la tablet. Vive en sessionStorage para que recargar la página no lo abra.
import { useSyncExternalStore } from 'react';

export interface ConsentimientoCabina {
  id: string;
  titulo: string;
  version: number;
  contenido_md: string;
}

export interface DatosCabina {
  /** Quién entregó la tablet: sólo su contraseña desbloquea el panel. */
  user_id: string;
  email: string | null;
  cita_id: string;
  /** "miércoles 7 de octubre, 12:00" */
  cuando: string;
  servicios: string;
  /** Nombre completo de la clienta (sugerido para la firma). */
  nombre: string;
  menor: boolean;
  anios: number | null;
  consentimientos: ConsentimientoCabina[];
  firmada: boolean;
  /** Se cerró la sesión desde la cabina: al volver a entrar, el bloqueo ya no aplica. */
  sesion_cerrada?: boolean;
}

const CLAVE = 'opalo-modo-cabina';
const oyentes = new Set<() => void>();
let ultimoCierre: { cita_id: string; firmada: boolean } | null = null;

function valido(d: unknown): d is DatosCabina {
  if (!d || typeof d !== 'object') return false;
  const x = d as Partial<DatosCabina>;
  return typeof x.user_id === 'string' && typeof x.cita_id === 'string' && typeof x.nombre === 'string' && Array.isArray(x.consentimientos);
}

function leer(): DatosCabina | null {
  try {
    const t = window.sessionStorage.getItem(CLAVE);
    const d: unknown = t ? JSON.parse(t) : null;
    return valido(d) ? d : null;
  } catch {
    return null;
  }
}

let actual: DatosCabina | null = typeof window === 'undefined' ? null : leer();

function guardar(d: DatosCabina | null) {
  actual = d;
  try {
    if (d) window.sessionStorage.setItem(CLAVE, JSON.stringify(d));
    else window.sessionStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): el modo cabina sigue en memoria.
  }
  oyentes.forEach((f) => f());
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

/** Bloquea el panel y muestra la pantalla de firma para la clienta. */
export function entrarCabina(d: Omit<DatosCabina, 'firmada'>): void {
  ultimoCierre = null;
  guardar({ ...d, firmada: false });
}

export function marcarFirmada(): void {
  if (actual) guardar({ ...actual, firmada: true });
}

export function marcarSesionCerrada(valor: boolean): void {
  if (actual) guardar({ ...actual, sesion_cerrada: valor });
}

/** Desbloquea el panel (después de verificar la contraseña o de cerrar sesión). */
export function salirCabina(): void {
  if (actual) ultimoCierre = { cita_id: actual.cita_id, firmada: actual.firmada };
  guardar(null);
}

/** Cómo terminó el último modo cabina de esta cita (si fue la última en usarlo). */
export function cierreCabina(cita_id: string): { firmada: boolean } | null {
  return ultimoCierre?.cita_id === cita_id ? { firmada: ultimoCierre.firmada } : null;
}

export function useCabina(): DatosCabina | null {
  return useSyncExternalStore(
    suscribir,
    () => actual,
    () => null,
  );
}
