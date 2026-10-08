// Qué políticas se muestran en el sitio público (ESPEC §9). Con configuracion.firma_en_linea = false
// (decisión de Ópalo) los consentimientos informados se revisan y firman en el spa, así que no se
// listan en el índice público ni se abren desde el sitio.
import type { Politica, TipoPolitica } from '../../lib/api/tipos';

export function esConsentimiento(tipo: TipoPolitica | string): boolean {
  return tipo.startsWith('consentimiento_');
}

/** Políticas visibles en el índice público. */
export function politicasPublicas(politicas: Politica[], firmaEnLinea: boolean): Politica[] {
  return firmaEnLinea ? politicas : politicas.filter((p) => !esConsentimiento(p.tipo));
}

/** Un documento que se revisa contigo en el spa (no se publica en el sitio). */
export function seRevisaEnSpa(tipo: string, firmaEnLinea: boolean): boolean {
  return !firmaEnLinea && esConsentimiento(tipo);
}
