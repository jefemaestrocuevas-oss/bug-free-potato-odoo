// Ventana modal accesible (Escape, foco atrapado, regreso del foco) y confirmación de acciones.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { IconoCerrar } from './Iconos';

// Pila de modales abiertos: sólo el de arriba responde a Escape y atrapa el foco.
const pila: string[] = [];
let overflowPrevio = '';

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface PropsModal {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  /** Botones del pie. */
  pie?: ReactNode;
  /** normal ≈ 560 px · amplio ≈ 820 px · completo ≈ 1100 px */
  ancho?: 'normal' | 'amplio' | 'completo';
  /** Mientras se envía algo, no se cierra con Escape ni con clic afuera. */
  bloqueado?: boolean;
}

export function Modal({ titulo, onCerrar, children, pie, ancho = 'normal', bloqueado = false }: PropsModal) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  const bloq = useRef(bloqueado);
  bloq.current = bloqueado;

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    if (pila.length === 0) {
      overflowPrevio = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    pila.push(id);
    const el = ref.current;
    const primero =
      el?.querySelector<HTMLElement>('[data-autofoco]') ??
      el?.querySelector<HTMLElement>('.modal-cuerpo input, .modal-cuerpo select, .modal-cuerpo textarea') ??
      el?.querySelector<HTMLElement>('.modal-pie button');
    (primero ?? el)?.focus({ preventScroll: true });

    const alTeclear = (e: KeyboardEvent) => {
      if (pila[pila.length - 1] !== id || !ref.current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!bloq.current) cerrar.current();
        return;
      }
      if (e.key === 'Tab') {
        const nodos = Array.from(ref.current.querySelectorAll<HTMLElement>(ENFOCABLES)).filter((n) => n.offsetParent !== null || n === document.activeElement);
        if (!nodos.length) return;
        const a = nodos[0];
        const z = nodos[nodos.length - 1];
        if (e.shiftKey && (document.activeElement === a || !ref.current.contains(document.activeElement))) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && (document.activeElement === z || !ref.current.contains(document.activeElement))) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      const i = pila.indexOf(id);
      if (i >= 0) pila.splice(i, 1);
      if (pila.length === 0) document.body.style.overflow = overflowPrevio;
      if (previo && document.contains(previo)) previo.focus({ preventScroll: true });
    };
  }, [id]);

  return createPortal(
    <div
      className="modal-fondo adm-modal-fondo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !bloq.current) cerrar.current();
      }}
    >
      <div ref={ref} className={`modal adm-modal adm-modal-${ancho}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`} tabIndex={-1}>
        <div className="modal-cabeza">
          <h3 id={`${id}-titulo`}>{titulo}</h3>
          <button type="button" className="adm-modal-cerrar" onClick={() => !bloq.current && cerrar.current()} aria-label="Cerrar ventana">
            <IconoCerrar tam={20} />
          </button>
        </div>
        <div className="modal-cuerpo">{children}</div>
        {pie && <div className="modal-pie">{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface OpcionesConfirmar {
  titulo: string;
  mensaje: ReactNode;
  /** Texto del botón que confirma. */
  textoBoton?: string;
  /** Acción destructiva: botón rojo. */
  peligro?: boolean;
  accion: () => Promise<unknown>;
  /** Se llama después de que la acción terminó bien. */
  alTerminar?: () => void;
}

function Confirmacion({ titulo, mensaje, textoBoton = 'Sí, continuar', peligro = false, accion, alTerminar, onCerrar }: OpcionesConfirmar & { onCerrar: () => void }) {
  const { ejecutar, enviando, error } = useAccion(async () => {
    await accion();
    return true;
  });
  return (
    <Modal
      titulo={titulo}
      onCerrar={onCerrar}
      bloqueado={enviando}
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            No, regresar
          </button>
          <button
            type="button"
            className={`btn ${peligro ? 'btn-peligro' : 'btn-primario'}`}
            disabled={enviando}
            onClick={async () => {
              const ok = await ejecutar();
              if (ok) {
                onCerrar();
                alTerminar?.();
              }
            }}
          >
            {enviando ? 'Un momento…' : textoBoton}
          </button>
        </>
      }
    >
      <div className="adm-confirmar-texto">{mensaje}</div>
      <MensajeError error={error} />
    </Modal>
  );
}

/** Confirmación antes de acciones importantes: `confirmar({...})` y renderiza `dialogo`. */
export function useConfirmar() {
  const [op, setOp] = useState<OpcionesConfirmar | null>(null);
  const dialogo = op ? <Confirmacion {...op} onCerrar={() => setOp(null)} /> : null;
  return { confirmar: setOp, dialogo };
}
