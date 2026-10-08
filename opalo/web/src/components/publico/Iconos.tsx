// Íconos de línea para el sitio público (decorativos: siempre aria-hidden; el texto va aparte).
import type { ReactNode } from 'react';

type P = { tam?: number; className?: string };

function Svg({ tam = 22, className = '', children, relleno = false }: P & { children: ReactNode; relleno?: boolean }) {
  return (
    <svg
      className={`sp-icono ${className}`}
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill={relleno ? 'currentColor' : 'none'}
      stroke={relleno ? 'none' : 'currentColor'}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const IconoMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconoCerrar = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconoBolsa = (p: P) => (
  <Svg {...p}>
    <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8Z" />
    <path d="M9 10V6.5a3 3 0 0 1 6 0V10" />
  </Svg>
);

export const IconoUsuaria = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20c1.3-3.6 4.1-5.4 7.5-5.4s6.2 1.8 7.5 5.4" />
  </Svg>
);

/** Burbuja de conversación con teléfono (WhatsApp). */
export const IconoMensaje = (p: P) => (
  <Svg {...p}>
    <path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.5-4.3A8.5 8.5 0 1 1 20.5 11.6Z" />
    <path d="M9.2 8.6c.2-.4.5-.5.8-.5h.4c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.7l-.5.6c.6 1.2 1.6 2.2 2.8 2.8l.6-.5c.2-.2.5-.2.7-.1l1.6.7c.3.1.4.3.4.5v.4c0 .3-.1.6-.5.8-.6.4-1.5.6-2.6.2a8.4 8.4 0 0 1-4.9-4.9c-.4-1.1-.2-2 .1-2.7Z" />
  </Svg>
);

export const IconoUbicacion = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </Svg>
);

export const IconoReloj = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconoCalendario = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    <path d="M8 13.5h2M14 13.5h2M8 16.5h2" />
  </Svg>
);

export const IconoFicha = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="3.5" width="14" height="17" rx="2" />
    <path d="M9 3.5h6v2.5H9z" />
    <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" />
  </Svg>
);

export const IconoFirma = (p: P) => (
  <Svg {...p}>
    <path d="M3 18c2.5 0 3.5-5 5.5-5s1 4 3 4 2-3 3.5-3 1.5 2 3 2" />
    <path d="M3 21h18" />
    <path d="M15 4.5 18.5 8 11 15.5l-4 .5.5-4Z" />
  </Svg>
);

export const IconoCorazon = (p: P) => (
  <Svg {...p}>
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />
  </Svg>
);

export const IconoEscudo = (p: P) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Svg>
);

export const IconoBrillo = (p: P) => (
  <Svg {...p}>
    <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" />
    <path d="M19 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z" />
  </Svg>
);

export const IconoHoja = (p: P) => (
  <Svg {...p}>
    <path d="M5 19C5 10 10.5 4.5 20 4.5 20 14 14.5 19 5 19Z" />
    <path d="M5 19c3.5-4.5 6.5-7 10-9" />
  </Svg>
);

export const IconoRostro = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5c-4 0-6.5 3-6.5 7.2 0 4.8 3.2 9.8 6.5 9.8s6.5-5 6.5-9.8c0-4.2-2.5-7.2-6.5-7.2Z" />
    <path d="M9.3 10.5h.01M14.7 10.5h.01" />
    <path d="M10 15.2c1.2.8 2.8.8 4 0" />
  </Svg>
);

export const IconoCuerpo = (p: P) => (
  <Svg {...p}>
    <path d="M9 3.5c-.5 2.5.5 4 .5 6S7 13.5 7.5 16.5 10 21 10 21" />
    <path d="M15 3.5c.5 2.5-.5 4-.5 6s2.5 4 2 7S14 21 14 21" />
    <path d="M9.6 12.2c1.5.7 3.3.7 4.8 0" />
  </Svg>
);

export const IconoGota = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5s-6 6.4-6 10.6a6 6 0 0 0 12 0c0-4.2-6-10.6-6-10.6Z" />
    <path d="M9.2 14.5a2.9 2.9 0 0 0 2.6 2.7" />
  </Svg>
);

export const IconoRegalo = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="8.5" width="17" height="4" rx="1" />
    <path d="M5 12.5v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 8.5v12" />
    <path d="M12 8.5S10.8 4 8.4 4a2.1 2.1 0 0 0 0 4.5H12ZM12 8.5S13.2 4 15.6 4a2.1 2.1 0 0 1 0 4.5H12Z" />
  </Svg>
);

export const IconoBirrete = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 9.5 12 5l9.5 4.5L12 14Z" />
    <path d="M6.5 11.5V16c1.4 1.4 3.4 2 5.5 2s4.1-.6 5.5-2v-4.5" />
    <path d="M21.5 9.5V15" />
  </Svg>
);

export const IconoCheck = (p: P) => (
  <Svg {...p}>
    <path d="m5 12.5 4.2 4.2L19 7" />
  </Svg>
);

export const IconoFlecha = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconoMas = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconoMenos = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const IconoBasura = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
);

export const IconoImprimir = (p: P) => (
  <Svg {...p}>
    <path d="M7 9V3.5h10V9" />
    <rect x="3.5" y="9" width="17" height="8" rx="1.5" />
    <path d="M7 14h10v6.5H7z" />
  </Svg>
);

/** Barra de jabón con burbujas. */
export const IconoJabon = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="10" width="15" height="9" rx="3" />
    <path d="M6.5 13.5h6" />
    <circle cx="15.5" cy="5.5" r="2" />
    <circle cx="19.5" cy="8" r="1.2" />
    <circle cx="11" cy="6.5" r="1.1" />
  </Svg>
);

/** Vela en vaso con flama. */
export const IconoVela = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 11h11v8.5a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5Z" />
    <path d="M12 11V8.5" />
    <path d="M12 2.5c1.6 1.8 2 3 0 4.6-2-1.6-1.6-2.8 0-4.6Z" />
    <path d="M6.5 14.5h11" />
  </Svg>
);

/** Ícono por categoría del catálogo (por slug; si no se conoce, la gema de brillo). */
export function IconoCategoria({ slug, tam = 26 }: { slug: string; tam?: number }) {
  if (slug.includes('depil')) return <IconoHoja tam={tam} />;
  if (slug.includes('facial')) return <IconoRostro tam={tam} />;
  if (slug.includes('corpor')) return <IconoCuerpo tam={tam} />;
  if (slug.includes('complement')) return <IconoGota tam={tam} />;
  return <IconoBrillo tam={tam} />;
}
