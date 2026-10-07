import type { ReactNode } from 'react';

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="estado-cargando" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {texto}
    </div>
  );
}

export function MensajeError({ error, onReintentar }: { error: string | null | undefined; onReintentar?: () => void }) {
  if (!error) return null;
  return (
    <div className="aviso aviso-error" role="alert">
      <span>{error}</span>
      {onReintentar && (
        <button type="button" className="btn btn-texto" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vacio">
      <p className="vacio-titulo">{titulo}</p>
      {children && <div className="vacio-texto">{children}</div>}
    </div>
  );
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'exito' | 'alerta' | 'error'; children: ReactNode }) {
  return <div className={`aviso aviso-${tipo}`}>{children}</div>;
}
