// Formas decorativas suaves (SVG con colores de los tokens: funcionan en modo oscuro).
// Todas son aria-hidden: no aportan información.
import { useId, type ReactNode } from 'react';
import { Gema } from '../ui/Gema';
import './componentes.css';

/** Composición del hero: gema grande facetada sobre formas orgánicas y destellos. */
export function ArteHero() {
  return (
    <div className="arte-hero" aria-hidden="true">
      <svg className="arte-hero-fondo" viewBox="0 0 400 400" focusable="false">
        <path className="f-verde" d="M318 92c38 40 52 104 30 158s-80 96-142 104-122-18-150-66S28 170 66 116 168 32 226 38s54 14 92 54Z" />
        <path className="f-oro" d="M282 54c30 18 46 56 38 88s-38 52-70 52-60-22-68-54 8-70 36-84 34-20 64-2Z" />
        <circle className="f-linea" cx="200" cy="210" r="150" />
        <circle className="f-linea f-linea-2" cx="200" cy="210" r="176" />
      </svg>
      <div className="arte-hero-gema">
        <svg viewBox="0 0 40 48" focusable="false" fill="none" strokeLinejoin="round">
          <path className="g-cara-1" d="M20 2 36 14 28 20 20 2Z" />
          <path className="g-cara-2" d="M20 2 4 14l8 6L20 2Z" />
          <path className="g-cara-3" d="M12 20h16l-8 26Z" />
          <path className="g-cara-4" d="M4 14v20l8-14Z" />
          <path className="g-cara-5" d="M36 14v20l-8-14Z" />
          <path className="g-trazo" d="M20 2 36 14v20L20 46 4 34V14Z" />
          <path className="g-trazo" d="M20 2 12 20h16Z" />
          <path className="g-trazo" d="M12 20 20 46 28 20" />
          <path className="g-trazo" d="M4 14l8 6M36 14l-8 6M4 34l8-14M36 34l-8-14" />
        </svg>
      </div>
      <Destello className="sp-destello d1" />
      <Destello className="sp-destello d2" />
      <Destello className="sp-destello d3" />
    </div>
  );
}

export function Destello({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 0c.8 6.4 4.8 10.6 12 12-7.2 1.4-11.2 5.6-12 12-.8-6.4-4.8-10.6-12-12C7.2 10.6 11.2 6.4 12 0Z" fill="currentColor" />
    </svg>
  );
}

/** Onda suave para separar secciones. `invertida` la voltea. */
export function Onda({ className = '', invertida = false }: { className?: string; invertida?: boolean }) {
  return (
    <svg className={`sp-onda ${invertida ? 'sp-onda-invertida' : ''} ${className}`} viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 32c160-28 320-28 480 0s320 28 480 0 320-28 480 0v28H0Z" />
    </svg>
  );
}

/** Separador con la gema al centro, entre dos líneas finas. */
export function SeparadorGema({ className = '' }: { className?: string }) {
  return (
    <div className={`separador-gema ${className}`} aria-hidden="true">
      <span />
      <Gema tam={18} />
      <span />
    </div>
  );
}

/** Patrón de facetas muy sutil para fondos de sección. */
export function PatronFacetas({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={`patron-facetas ${className}`} aria-hidden="true" focusable="false">
      <defs>
        <pattern id={`facetas-${id}`} width="56" height="64" patternUnits="userSpaceOnUse">
          <path d="M28 4 48 18v28L28 60 8 46V18Z M28 4 18 28h20Z M18 28l10 32 10-32" fill="none" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#facetas-${id})`} />
    </svg>
  );
}

/** Círculo con ícono (para pasos y beneficios). */
export function Medallon({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`sp-medallon ${className}`} aria-hidden="true">
      {children}
    </span>
  );
}
