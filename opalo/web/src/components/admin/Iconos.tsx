// Íconos de línea del panel interno (decorativos: aria-hidden; el texto siempre va aparte).
import type { ReactNode } from 'react';

type P = { tam?: number; className?: string };

function Svg({ tam = 20, className = '', children }: P & { children: ReactNode }) {
  return (
    <svg
      className={`adm-icono ${className}`}
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const IconoResumen = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
    <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
  </Svg>
);

export const IconoAgenda = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4M8 13h2M14 13h2M8 16.5h2" />
  </Svg>
);

export const IconoClientas = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3 19.5c.9-3.2 3.2-4.8 6-4.8s5.1 1.6 6 4.8" />
    <path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.6 14.9c1.6.6 2.8 2 3.4 4.1" />
  </Svg>
);

export const IconoPedidos = (p: P) => (
  <Svg {...p}>
    <path d="M6 3.5h12v17l-2.4-1.5-2.4 1.5-2.4-1.5-2.4 1.5L6 20.5Z" />
    <path d="M9 8h6M9 11.5h6M9 15h3.5" />
  </Svg>
);

export const IconoInventario = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 8 12 3.5 20.5 8v8.5L12 21l-8.5-4.5Z" />
    <path d="M3.5 8 12 12.5 20.5 8M12 12.5V21" />
  </Svg>
);

export const IconoCostos = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8 7h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h3.5" />
  </Svg>
);

export const IconoGastos = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9.5v5M18 9.5v5" />
  </Svg>
);

export const IconoResultados = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <path d="M7 16.5v-4M11 16.5V8.5M15 16.5v-6M19 16.5V5" />
  </Svg>
);

export const IconoCatalogo = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.6 6.6a1.5 1.5 0 0 1-2.1 0Z" />
    <circle cx="8" cy="8" r="1.4" />
  </Svg>
);

export const IconoEquipo = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 9 12 4.5 21.5 9 12 13.5Z" />
    <path d="M6.5 11v4.5c1.4 1.5 3.4 2.3 5.5 2.3s4.1-.8 5.5-2.3V11M21.5 9v5" />
  </Svg>
);

export const IconoPoliticas = (p: P) => (
  <Svg {...p}>
    <path d="M6 3.5h8.5L19 8v12.5H6Z" />
    <path d="M14 3.5V8h5M9 12h7M9 15.5h7" />
  </Svg>
);

/** Taller: barra de jabón con burbujas. */
export const IconoTaller = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="11.5" width="13.5" height="8.5" rx="2.6" />
    <path d="M6.2 15h4.5" />
    <circle cx="18" cy="7.2" r="2.6" />
    <circle cx="12.6" cy="5.4" r="1.6" />
    <circle cx="20" cy="13" r="1.3" />
  </Svg>
);

/** Mostrador: bolsa de compra. */
export const IconoMostrador = (p: P) => (
  <Svg {...p}>
    <path d="M4.8 8.2h14.4l-1.1 12.3H5.9Z" />
    <path d="M8.8 10.5V6.8a3.2 3.2 0 0 1 6.4 0v3.7" />
  </Svg>
);

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

export const IconoSalir = (p: P) => (
  <Svg {...p}>
    <path d="M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14" />
    <path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" />
  </Svg>
);

export const IconoSitio = (p: P) => (
  <Svg {...p}>
    <path d="M13.5 4.5h6v6M19.5 4.5 11 13" />
    <path d="M17.5 13.5v5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1h5" />
  </Svg>
);

export const IconoMensaje = (p: P) => (
  <Svg {...p}>
    <path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.5-4.3A8.5 8.5 0 1 1 20.5 11.6Z" />
  </Svg>
);

export const IconoAlerta = (p: P) => (
  <Svg {...p}>
    <path d="M12 4 21 19.5H3Z" />
    <path d="M12 10v4.2M12 17h.01" />
  </Svg>
);

export const IconoFirma = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 17.5c2.5 0 3.5-9 6-9 2 0 0 8 2.5 8 1.6 0 2.4-3 4-3 1 0 1.2 1.5 2 1.5h2.5" />
    <path d="M3.5 20.5h17" />
  </Svg>
);

export const IconoMas = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconoAnterior = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 6 8.5 12l6 6" />
  </Svg>
);

export const IconoSiguiente = (p: P) => (
  <Svg {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Svg>
);
