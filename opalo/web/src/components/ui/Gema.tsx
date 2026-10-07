/** Ícono de ópalo (gema facetada) de la marca. */
export function Gema({ tam = 28, className = '' }: { tam?: number; className?: string }) {
  return (
    <svg className={`gema ${className}`} width={tam * (40 / 48)} height={tam} viewBox="0 0 40 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M20 2 36 14v20L20 46 4 34V14Z" />
      <path d="M20 2 12 20h16Z" />
      <path d="M12 20 20 46 28 20" />
      <path d="M4 14l8 6M36 14l-8 6M4 34l8-14M36 34l-8-14" />
    </svg>
  );
}

export function Marca({ tam = 26 }: { tam?: number }) {
  return (
    <span className="marca">
      <Gema tam={tam} className="marca-gema" />
      <span className="marca-texto">Ópalo</span>
    </span>
  );
}
