// Mis documentos: copia de los consentimientos informados firmados (cita, versión, fecha, firmante,
// tutor, firma, huella y, si sigue vigente esa versión, el texto completo). Con
// configuracion.firma_en_linea = false (decisión de Ópalo, ESPEC §9) se firman en el spa, en la tablet
// de la cabina: aquí la clienta sólo consulta su copia, sin invitaciones a firmar.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { CitaDetalle, Politica } from '../../lib/api/tipos';
import { ETIQUETA_POLITICA, fechaHora, fechaLarga, hora } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../ui/Estado';
import { Markdown } from '../ui/Markdown';
import { VerFirma } from '../ui/PanelFirma';
import { unirConY } from '../reserva/utilidades';

/** Caracteres de la huella que se muestran de entrada (la completa tiene 64). */
const HUELLA_CORTA = 12;

export function SeccionDocumentos({ firmaEnLinea = false }: { firmaEnLinea?: boolean }) {
  const docs = useAsync(
    () =>
      Promise.all([
        api.getMisConsentimientos(),
        // Sólo sirve para decir de qué cita es cada documento: si falla, los documentos se muestran igual.
        api.getMisCitas().catch((): CitaDetalle[] => []),
        // El texto de cada documento (si la versión que firmó sigue vigente); si falla, se muestra el resto.
        api.getPoliticasVigentes().catch((): Politica[] => []),
      ]),
    [],
  );

  if (docs.cargando && !docs.datos) return <Cargando texto="Cargando tus documentos…" />;
  if (docs.error) return <MensajeError error={docs.error} onReintentar={docs.recargar} />;
  const [consentimientos, citas, vigentes] = docs.datos ?? [[], [], []];
  const citasPorId = new Map(citas.map((c) => [c.id, c]));
  const vigentePorTipo = new Map(vigentes.map((p) => [p.tipo, p]));
  const lista = [...consentimientos].sort((a, b) => b.firmado_en.localeCompare(a.firmado_en));

  return (
    <div className="cu-seccion">
      <h2 className="cu-h2">Mis documentos</h2>
      {lista.length === 0 ? (
        <Vacio titulo="Aún no tienes documentos">
          {firmaEnLinea ? (
            <p>Firmas el consentimiento informado al reservar tu cita o desde la pestaña “Citas”.</p>
          ) : (
            <p>Aquí vas a encontrar una copia de los documentos de tus servicios, para que los tengas a la mano cuando quieras.</p>
          )}
        </Vacio>
      ) : (
        <>
          <p className="texto-2 cu-sin-margen">
            {firmaEnLinea
              ? 'Cada consentimiento guarda la versión exacta que firmaste. La huella digital permite comprobar que el documento no cambió.'
              : 'Tu copia de los consentimientos que firmaste en el spa. Cada uno guarda la versión exacta del documento; la huella digital permite comprobar que no cambió.'}
          </p>
          <ul className="cu-lista">
            {lista.map((d) => {
              const cita = d.cita_id ? citasPorId.get(d.cita_id) : undefined;
              const vigente = vigentePorTipo.get(d.politica_tipo);
              return (
                <li key={d.id}>
                  <article className="cu-tarjeta cu-documento" aria-labelledby={`doc-${d.id}`}>
                    <div className="entre cu-cita-cabeza">
                      <h3 className="cu-cita-titulo" id={`doc-${d.id}`}>
                        {d.politica_titulo || ETIQUETA_POLITICA[d.politica_tipo]}
                      </h3>
                      <span className="pill pill-verde">Versión {d.politica_version}</span>
                    </div>
                    {cita && (
                      <p className="cu-documento-cita">
                        Para tu cita del {fechaLarga(cita.inicio)} a las {hora(cita.inicio)}
                        {cita.items.length > 0 ? ` · ${unirConY(cita.items.map((i) => i.nombre))}` : ''}
                      </p>
                    )}
                    <dl className="cu-datos">
                      <div>
                        <dt>Firmado</dt>
                        <dd>
                          <span className="cu-mayuscula">{fechaHora(d.firmado_en)}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>Firmó</dt>
                        <dd>{d.nombre_firmante}</dd>
                      </div>
                      {d.tutor_nombre && (
                        <div>
                          <dt>Tutor</dt>
                          <dd>{d.tutor_nombre}</dd>
                        </div>
                      )}
                      {d.documento_hash && (
                        <div>
                          <dt>Huella</dt>
                          <dd>
                            <Huella hash={d.documento_hash} />
                          </dd>
                        </div>
                      )}
                    </dl>
                    <div className="cu-firma">
                      <span className="ayuda">Firma</span>
                      <VerFirma svg={d.firma_svg} alto={64} />
                    </div>
                    <Copia vigente={vigente} version={d.politica_version} />
                    {firmaEnLinea && vigente && vigente.version !== d.politica_version && (
                      <div className="cu-acciones">
                        <Link className="btn btn-texto btn-sm" to={`/politicas/${d.politica_tipo}`}>
                          Ver la política vigente
                        </Link>
                      </div>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Texto del documento firmado. Sólo se tiene a la mano el de la versión vigente: si la clienta firmó una
 * anterior, se le dice cómo pedir la copia de esa versión (y si no se pudo cargar, no se dice nada).
 */
function Copia({ vigente, version }: { vigente: Politica | undefined; version: number }) {
  if (!vigente) return null;
  if (vigente.version !== version)
    return (
      <p className="ayuda cu-sin-margen">
        Este documento ya tiene una versión más nueva. Si quieres el texto de la versión {version}, pídelo en el spa o por WhatsApp.
      </p>
    );
  return (
    <details className="cu-copia">
      <summary>Leer el documento</summary>
      <div className="rv-documento rv-documento-largo" tabIndex={0} role="region" aria-label={vigente.titulo || ETIQUETA_POLITICA[vigente.tipo]}>
        <Markdown texto={vigente.contenido_md} />
      </div>
    </details>
  );
}

/** Huella SHA-256 abreviada, con opción de verla completa para compararla. */
function Huella({ hash }: { hash: string }) {
  const [completa, setCompleta] = useState(false);
  const corta = hash.length > HUELLA_CORTA;
  return (
    <span className="cu-huella-fila">
      <code className="cu-huella" title={hash}>
        {completa || !corta ? hash : `${hash.slice(0, HUELLA_CORTA)}…`}
      </code>
      {corta && (
        <button type="button" className="btn btn-texto btn-sm" onClick={() => setCompleta((v) => !v)} aria-expanded={completa}>
          {completa ? 'Ver corta' : 'Ver completa'}
        </button>
      )}
    </span>
  );
}
