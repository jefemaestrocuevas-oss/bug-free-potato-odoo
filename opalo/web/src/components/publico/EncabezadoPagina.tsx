import { useEffect, type ReactNode } from 'react';
import { Destello, PatronFacetas } from './Decoracion';

/** Pone el título de la pestaña del navegador: "Servicios · Ópalo". */
export function useTitulo(titulo: string | null | undefined) {
  useEffect(() => {
    if (!titulo) return;
    const anterior = document.title;
    document.title = `${titulo} · Ópalo Spa`;
    return () => {
      document.title = anterior;
    };
  }, [titulo]);
}

/** Cabecera de las páginas internas del sitio público (no del Inicio). */
export function EncabezadoPagina({
  eyebrow,
  titulo,
  children,
  acciones,
}: {
  eyebrow?: string;
  titulo: ReactNode;
  children?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <header className="sp-cabecera">
      <PatronFacetas className="sp-cabecera-patron" />
      <Destello className="sp-cabecera-destello" />
      <div className="contenedor sp-cabecera-contenido">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="sp-cabecera-titulo">{titulo}</h1>
        {children && <div className="subtitulo sp-cabecera-texto">{children}</div>}
        {acciones && <div className="fila sp-cabecera-acciones">{acciones}</div>}
      </div>
    </header>
  );
}
