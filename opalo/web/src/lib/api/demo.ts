// Modo demostración: OpaloApi completa que vive en el navegador (sin backend).
// Siembra el catálogo real (opalo/datos/catalogo.json), las políticas (opalo/datos/politicas/*.md)
// y datos de ejemplo marcados como "(ejemplo)". El estado se guarda en localStorage ('opalo-demo-v1').
import catalogo from '../../../../datos/catalogo.json';
import { almacenPorDefecto, CLAVE_DEMO, crearApiDemoCon, type OpcionesDemo } from './demo/api';
import type { CatalogoFuente, FuentesDemo } from './demo/modelo';
import type { OpaloApi, TipoPolitica } from './tipos';

export type { OpcionesDemo } from './demo/api';
export { CLAVE_DEMO } from './demo/api';

const TIPOS: TipoPolitica[] = [
  'terminos',
  'privacidad',
  'cancelacion',
  'consentimiento_depilacion',
  'consentimiento_facial',
  'consentimiento_corporal',
];

const archivosPoliticas = import.meta.glob<string>('../../../../datos/politicas/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function politicasDesdeArchivos(): Partial<Record<TipoPolitica, string>> {
  const r: Partial<Record<TipoPolitica, string>> = {};
  for (const [ruta, texto] of Object.entries(archivosPoliticas)) {
    const tipo = (ruta.split('/').pop() ?? '').replace(/\.md$/, '') as TipoPolitica;
    if (TIPOS.includes(tipo) && typeof texto === 'string' && texto.trim()) r[tipo] = texto;
  }
  return r;
}

/** Fuentes con las que se siembra la demo (catálogo real + políticas). */
export const FUENTES_DEMO: FuentesDemo = {
  catalogo: catalogo as unknown as CatalogoFuente,
  politicas: politicasDesdeArchivos(),
};

/** Crea la API de demostración. Las opciones sólo hacen falta en pruebas. */
export function crearApiDemo(opciones?: OpcionesDemo): OpaloApi {
  return crearApiDemoCon(FUENTES_DEMO, opciones);
}

/** Borra los datos guardados de la demostración y recarga la página. */
export function reiniciarDemo(): void {
  try {
    almacenPorDefecto()?.removeItem(CLAVE_DEMO);
  } catch {
    // Sin almacenamiento: no hay nada que borrar.
  }
  if (typeof window !== 'undefined') {
    try {
      window.location.reload();
    } catch {
      // Entornos sin recarga (pruebas).
    }
  }
}
