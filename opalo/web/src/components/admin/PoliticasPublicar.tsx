// Publicar una nueva versión de una política: título + Markdown con vista previa (R13).
import { useState } from 'react';
import { api, POLITICAS_GENERALES, type TipoPolitica } from '../../lib/api';
import { ETIQUETA_POLITICA } from '../../lib/format';
import { MensajeError } from '../ui/Estado';
import { Markdown } from '../ui/Markdown';
import { Modal, useConfirmar } from './Modal';
import type { PoliticaAdmin } from './PoliticasVer';

interface Props {
  tipo: TipoPolitica;
  /** Versión activa sobre la que se edita (null si aún no hay ninguna). */
  base: PoliticaAdmin | null;
  siguienteVersion: number;
  onCerrar: () => void;
  onPublicada: (version: number) => void;
}

export function PoliticasPublicar({ tipo, base, siguienteVersion, onCerrar, onPublicada }: Props) {
  const [titulo, setTitulo] = useState(base?.titulo ?? ETIQUETA_POLITICA[tipo] ?? '');
  const [contenido, setContenido] = useState(base?.contenido_md ?? '');
  const [intentado, setIntentado] = useState(false);
  const { confirmar, dialogo } = useConfirmar();

  const nombre = ETIQUETA_POLITICA[tipo] ?? tipo;
  const esGeneral = POLITICAS_GENERALES.includes(tipo);
  const sinCambios = !!base && titulo.trim() === base.titulo.trim() && contenido.trim() === base.contenido_md.trim();
  const sucio = base ? !sinCambios : titulo.trim() !== (ETIQUETA_POLITICA[tipo] ?? '') || contenido.trim() !== '';
  const errorTitulo = !titulo.trim() ? 'Escribe el título.' : null;
  const errorTexto = !contenido.trim() ? 'Escribe el texto de la política.' : null;
  const problema = errorTitulo ?? errorTexto ?? (sinCambios ? 'Aún no has cambiado nada respecto a la versión vigente.' : null);
  const palabras = contenido.trim() ? contenido.trim().split(/\s+/).length : 0;

  const cerrar = () => {
    if (!sucio) return onCerrar();
    confirmar({
      titulo: 'Descartar cambios',
      mensaje: <p>Tienes cambios sin publicar en {nombre}. Si cierras, se pierden.</p>,
      textoBoton: 'Sí, descartar',
      peligro: true,
      accion: async () => undefined,
      alTerminar: onCerrar,
    });
  };

  const publicar = () => {
    setIntentado(true);
    if (problema) return;
    confirmar({
      titulo: `Publicar versión ${siguienteVersion}`,
      mensaje: (
        <>
          <p>
            Vas a publicar <strong>{titulo.trim()}</strong> como versión {siguienteVersion} de {nombre}
            {base ? `, en lugar de la versión ${base.version}` : ''}.
          </p>
          <p>
            <strong>Las clientas tendrán que aceptarla de nuevo en su próxima reserva.</strong> La versión anterior queda en el historial y ya no se puede editar.
          </p>
        </>
      ),
      textoBoton: 'Sí, publicar',
      accion: () => api.admin.publicarPolitica(tipo, titulo.trim(), contenido),
      alTerminar: () => onPublicada(siguienteVersion),
    });
  };

  return (
    <Modal
      titulo={`Nueva versión · ${nombre}`}
      onCerrar={cerrar}
      ancho="completo"
      pie={
        <>
          <span className="pola-contador texto-3 pequeno num">
            {palabras} {palabras === 1 ? 'palabra' : 'palabras'}
          </span>
          <button type="button" className="btn btn-texto" onClick={cerrar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primario" onClick={publicar} disabled={sinCambios}>
            Publicar versión {siguienteVersion}
          </button>
        </>
      }
    >
      <div className="pola-publicar">
        <div className="aviso aviso-alerta pola-advertencia" role="note">
          <div>
            <strong>Al publicar, las clientas tendrán que aceptarla de nuevo en su próxima reserva.</strong>{' '}
            {esGeneral
              ? 'Se les mostrará antes de confirmar su cita y no podrán reservar sin aceptarla.'
              : 'Desde ese momento, los consentimientos nuevos se firman sobre esta versión; los que ya se firmaron conservan la versión con la que se firmaron.'}{' '}
            {base ? `La versión ${base.version} queda guardada en el historial.` : ''}
          </div>
        </div>

        <div className="campo">
          <label className="etiqueta" htmlFor="pola-titulo">
            Título
          </label>
          <input id="pola-titulo" className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} aria-invalid={intentado && errorTitulo ? true : undefined} />
        </div>

        <div className="pola-editor">
          <div className="campo pola-editor-texto">
            <div className="pola-editor-cabeza">
              <label className="etiqueta" htmlFor="pola-texto">
                Texto {base ? `(partiendo de la versión ${base.version})` : ''}
              </label>
              <details className="pola-ayuda-formato">
                <summary>Cómo dar formato</summary>
                <ul className="pequeno">
                  <li>
                    <code># Título</code>, <code>## Subtítulo</code>, <code>### Apartado</code>
                  </li>
                  <li>Deja una línea en blanco entre párrafos.</li>
                  <li>
                    <code>- elemento</code> para listas; <code>1. paso</code> para listas numeradas.
                  </li>
                  <li>
                    <code>**negritas**</code> y <code>*cursivas*</code>
                  </li>
                  <li>
                    <code>&gt; nota</code> para un recuadro destacado; <code>---</code> para una línea divisoria.
                  </li>
                </ul>
              </details>
            </div>
            <textarea
              id="pola-texto"
              className="input pola-textarea"
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              spellCheck
              aria-invalid={intentado && errorTexto ? true : undefined}
            />
          </div>
          <section className="pola-vista" aria-labelledby="pola-vista-titulo">
            <p className="pola-vista-titulo etiqueta" id="pola-vista-titulo">
              Vista previa (así la leerán las clientas)
            </p>
            <div className="pola-documento pola-vista-cuerpo">
              {contenido.trim() ? <Markdown texto={contenido} /> : <p className="texto-3">Aquí verás el texto con formato.</p>}
            </div>
          </section>
        </div>

        {intentado && problema && <MensajeError error={problema} />}
        {sinCambios && !intentado && <p className="ayuda adm-sin-margen">Edita el título o el texto para poder publicar una versión nueva.</p>}
      </div>
      {dialogo}
    </Modal>
  );
}
