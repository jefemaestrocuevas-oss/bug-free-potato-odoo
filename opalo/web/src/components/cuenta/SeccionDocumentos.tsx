// Mis documentos: consentimientos informados firmados (versión, fecha, firmante, tutor, firma y huella).
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { ETIQUETA_POLITICA, fechaHora } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../ui/Estado';
import { VerFirma } from '../ui/PanelFirma';

export function SeccionDocumentos() {
  const docs = useAsync(() => api.getMisConsentimientos(), []);

  if (docs.cargando && !docs.datos) return <Cargando texto="Cargando tus documentos…" />;
  if (docs.error) return <MensajeError error={docs.error} onReintentar={docs.recargar} />;
  const lista = [...(docs.datos ?? [])].sort((a, b) => b.firmado_en.localeCompare(a.firmado_en));

  return (
    <div className="cu-seccion">
      <h2 className="cu-h2">Mis documentos firmados</h2>
      <p className="texto-2 cu-sin-margen">
        Cada consentimiento guarda la versión exacta que firmaste. La huella digital permite comprobar que el documento no cambió.
      </p>
      {lista.length === 0 ? (
        <Vacio titulo="Aún no has firmado documentos">
          <p>Firmas el consentimiento informado al reservar tu cita o desde “Mis citas”.</p>
        </Vacio>
      ) : (
        <ul className="cu-lista">
          {lista.map((d) => (
            <li key={d.id}>
              <article className="cu-tarjeta cu-documento" aria-labelledby={`doc-${d.id}`}>
                <div className="entre cu-cita-cabeza">
                  <h3 className="cu-cita-titulo" id={`doc-${d.id}`}>
                    {d.politica_titulo || ETIQUETA_POLITICA[d.politica_tipo]}
                  </h3>
                  <span className="pill pill-verde">Versión {d.politica_version}</span>
                </div>
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
                        <code className="cu-huella" title={d.documento_hash}>
                          {d.documento_hash}
                        </code>
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="cu-firma">
                  <span className="ayuda">Firma</span>
                  <VerFirma svg={d.firma_svg} alto={64} />
                </div>
                <div className="cu-acciones">
                  <Link className="btn btn-texto btn-sm" to={`/politicas/${d.politica_tipo}`}>
                    Ver la política vigente
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
