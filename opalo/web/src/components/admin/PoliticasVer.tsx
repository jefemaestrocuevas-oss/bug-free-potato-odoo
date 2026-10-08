// Ventana para leer una versión de una política (texto en Markdown, versión y huella digital).
import { useState } from 'react';
import type { Politica } from '../../lib/api';
import { ETIQUETA_POLITICA, fechaCorta } from '../../lib/format';
import { Markdown } from '../ui/Markdown';
import { Modal } from './Modal';
import { copiarAlPortapapeles } from './util';

export type PoliticaAdmin = Politica & { activa: boolean };

interface Props {
  politica: PoliticaAdmin;
  /** Fecha en que la reemplazó la siguiente versión (sólo para versiones anteriores). */
  hasta?: string | null;
  onCerrar: () => void;
  /** Si se da, ofrece publicar una nueva versión a partir de ésta. */
  onNuevaVersion?: () => void;
}

export function PoliticasVer({ politica: p, hasta, onCerrar, onNuevaVersion }: Props) {
  const [copiado, setCopiado] = useState<'si' | 'no' | null>(null);
  const copiar = async () => {
    if (!p.hash_sha256) return;
    setCopiado((await copiarAlPortapapeles(p.hash_sha256)) ? 'si' : 'no');
  };
  return (
    <Modal
      titulo={p.titulo}
      onCerrar={onCerrar}
      ancho="amplio"
      pie={
        <>
          <button type="button" className={`btn ${onNuevaVersion ? 'btn-texto' : 'btn-secundario'}`} onClick={onCerrar}>
            Cerrar
          </button>
          {onNuevaVersion && (
            <button type="button" className="btn btn-primario" onClick={onNuevaVersion}>
              Publicar nueva versión
            </button>
          )}
        </>
      }
    >
      <div className="pola-ver">
        <div className="pola-ver-meta">
          <span className="pill pill-gris">{ETIQUETA_POLITICA[p.tipo] ?? p.tipo}</span>
          <span className={`pill ${p.activa ? 'pill-exito' : 'pill-gris'}`}>
            Versión {p.version}
            {p.activa ? ' · vigente' : ' · anterior'}
          </span>
          <span className="texto-2 pequeno">
            {p.vigente_desde ? (hasta ? `Vigente del ${fechaCorta(p.vigente_desde)} al ${fechaCorta(hasta)}` : `Vigente desde el ${fechaCorta(p.vigente_desde)}`) : 'Sin fecha de vigencia'}
          </span>
        </div>
        {p.hash_sha256 && (
          <div className="pola-huella">
            <span className="etiqueta">Huella digital (SHA-256)</span>
            <code className="pola-huella-codigo">{p.hash_sha256}</code>
            <span className="fila pola-huella-acciones">
              <button type="button" className="btn btn-texto btn-sm" onClick={copiar}>
                Copiar huella
              </button>
              {copiado && (
                <span className="pequeno texto-3" role="status">
                  {copiado === 'si' ? 'Copiada.' : 'No se pudo copiar; selecciónala a mano.'}
                </span>
              )}
            </span>
            <span className="ayuda">Identifica este texto exacto. Cada aceptación y cada consentimiento firmado quedan ligados a la versión que la clienta vio.</span>
          </div>
        )}
        <div className="pola-documento">
          <Markdown texto={p.contenido_md} />
        </div>
      </div>
    </Modal>
  );
}
