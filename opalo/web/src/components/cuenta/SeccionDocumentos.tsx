// Mis documentos: consentimientos informados firmados (cita, versión, fecha, firmante, tutor, firma y huella).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { CitaDetalle } from '../../lib/api/tipos';
import { ETIQUETA_POLITICA, fechaHora, fechaLarga, hora } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../ui/Estado';
import { VerFirma } from '../ui/PanelFirma';
import { unirConY } from '../reserva/utilidades';

/** Caracteres de la huella que se muestran de entrada (la completa tiene 64). */
const HUELLA_CORTA = 12;

export function SeccionDocumentos() {
  const docs = useAsync(
    () =>
      Promise.all([
        api.getMisConsentimientos(),
        // Sólo sirve para decir de qué cita es cada documento: si falla, los documentos se muestran igual.
        api.getMisCitas().catch((): CitaDetalle[] => []),
      ]),
    [],
  );

  if (docs.cargando && !docs.datos) return <Cargando texto="Cargando tus documentos…" />;
  if (docs.error) return <MensajeError error={docs.error} onReintentar={docs.recargar} />;
  const [consentimientos, citas] = docs.datos ?? [[], []];
  const citasPorId = new Map(citas.map((c) => [c.id, c]));
  const lista = [...consentimientos].sort((a, b) => b.firmado_en.localeCompare(a.firmado_en));

  return (
    <div className="cu-seccion">
      <h2 className="cu-h2">Mis documentos firmados</h2>
      <p className="texto-2 cu-sin-margen">
        Cada consentimiento guarda la versión exacta que firmaste. La huella digital permite comprobar que el documento no cambió.
      </p>
      {lista.length === 0 ? (
        <Vacio titulo="Aún no has firmado documentos">
          <p>Firmas el consentimiento informado al reservar tu cita o desde la pestaña “Citas”.</p>
        </Vacio>
      ) : (
        <ul className="cu-lista">
          {lista.map((d) => {
            const cita = d.cita_id ? citasPorId.get(d.cita_id) : undefined;
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
                  <div className="cu-acciones">
                    <Link className="btn btn-texto btn-sm" to={`/politicas/${d.politica_tipo}`}>
                      Ver la política vigente
                    </Link>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
