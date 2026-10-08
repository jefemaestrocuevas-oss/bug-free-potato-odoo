// Diálogo modal accesible: foco atrapado, Escape cierra, el foco regresa a quien lo abrió.
import { useEffect, useId, useRef, type ReactNode } from 'react';

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  titulo,
  children,
  pie,
  onCerrar,
  bloqueado = false,
}: {
  titulo: string;
  children: ReactNode;
  pie: ReactNode;
  onCerrar: () => void;
  /** Mientras se envía, no se cierra con Escape ni con clic fuera. */
  bloqueado?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  const bloqueadoRef = useRef(bloqueado);
  bloqueadoRef.current = bloqueado;

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const caja = ref.current;
    const primero = caja?.querySelector<HTMLElement>('[data-autofocus]') ?? caja?.querySelector<HTMLElement>(ENFOCABLES);
    (primero ?? caja)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape' && !bloqueadoRef.current) {
        e.preventDefault();
        cerrarRef.current();
        return;
      }
      if (e.key !== 'Tab' || !caja) return;
      const lista = [...caja.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (lista.length === 0) return;
      const ini = lista[0];
      const fin = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === ini) {
        e.preventDefault();
        fin.focus();
      } else if (!e.shiftKey && document.activeElement === fin) {
        e.preventDefault();
        ini.focus();
      }
    }
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = overflow;
      previo?.focus?.();
    };
  }, []);

  return (
    <div
      className="modal-fondo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !bloqueado) onCerrar();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`} ref={ref} tabIndex={-1}>
        <div className="modal-cabeza">
          <h3 id={`${id}-titulo`}>{titulo}</h3>
        </div>
        <div className="modal-cuerpo">{children}</div>
        <div className="modal-pie">{pie}</div>
      </div>
    </div>
  );
}
