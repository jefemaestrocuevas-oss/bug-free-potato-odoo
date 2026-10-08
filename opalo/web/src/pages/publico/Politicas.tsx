import { Link, useParams } from 'react-router-dom';
import { api, POLITICAS_GENERALES, type Politica } from '../../lib/api';
import { ETIQUETA_POLITICA, fechaCorta } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { Markdown } from '../../components/ui/Markdown';
import { EncabezadoPagina, useTitulo } from '../../components/publico/EncabezadoPagina';
import { Gema } from '../../components/ui/Gema';
import { IconoFirma, IconoFlecha, IconoImprimir } from '../../components/publico/Iconos';
import { useContacto } from '../../components/publico/contacto';
import { politicasPublicas, seRevisaEnSpa } from '../../components/publico/politicas';
import './politicas.css';

/** Quita el primer "# Título" del documento: el título ya se muestra arriba. */
function sinTituloInicial(md: string): string {
  return md.replace(/^\s*#\s+[^\n]*\n+/, '');
}

function huella(hash: string | null): string | null {
  return hash ? hash.slice(0, 12) : null;
}

export default function Politicas() {
  const { tipo } = useParams<{ tipo?: string }>();
  const { firma_en_linea } = useContacto();
  const todas = useAsync(() => api.getPoliticasVigentes(), []);
  // Con la firma en el spa (ESPEC §9) los consentimientos no se publican en el sitio.
  const politicas = todas.datos ? politicasPublicas(todas.datos, firma_en_linea) : undefined;
  const carga = { cargando: todas.cargando, error: todas.error, recargar: todas.recargar, politicas, firmaEnLinea: firma_en_linea };

  if (tipo && seRevisaEnSpa(tipo, firma_en_linea)) return <SeRevisaEnElSpa tipo={tipo} politicas={politicas} />;
  if (tipo) return <Documento tipo={tipo} {...carga} />;
  return <Indice {...carga} />;
}

interface PropsCarga {
  cargando: boolean;
  error: string | null;
  recargar: () => void;
  politicas: Politica[] | undefined;
  firmaEnLinea: boolean;
}

function Indice({ cargando, error, recargar, politicas, firmaEnLinea }: PropsCarga) {
  useTitulo('Políticas');
  const contacto = useContacto();
  const generales = (politicas ?? []).filter((p) => POLITICAS_GENERALES.includes(p.tipo));
  const consentimientos = (politicas ?? []).filter((p) => !POLITICAS_GENERALES.includes(p.tipo));
  return (
    <>
      <EncabezadoPagina eyebrow="Políticas" titulo="Claras desde el principio">
        <p>
          Antes de tu primera reserva te pedimos aceptar los términos, el aviso de privacidad y la política de cancelación.
          {firmaEnLinea ? ' El consentimiento informado de cada servicio lo firmas en línea al reservar.' : ''}
        </p>
      </EncabezadoPagina>
      <div className="contenedor seccion pol">
        {cargando && <Cargando texto="Cargando políticas…" />}
        <MensajeError error={error} onReintentar={recargar} />
        {politicas && politicas.length === 0 && (
          <Vacio titulo="Estamos terminando nuestras políticas">
            <p>Muy pronto podrás leerlas aquí. Si tienes dudas, escríbenos por WhatsApp.</p>
          </Vacio>
        )}
        {generales.length > 0 && (
          <section aria-labelledby="pol-generales" className="pol-grupo">
            <h2 id="pol-generales">Para todas nuestras clientas</h2>
            <ul className="pol-lista">
              {generales.map((p) => (
                <TarjetaPolitica key={p.id} politica={p} />
              ))}
            </ul>
          </section>
        )}
        {firmaEnLinea && consentimientos.length > 0 && (
          <section aria-labelledby="pol-consentimientos" className="pol-grupo">
            <h2 id="pol-consentimientos">Consentimientos informados</h2>
            <p className="pol-grupo-texto">
              <IconoFirma tam={20} /> Cada servicio tiene su consentimiento. Lo lees y lo firmas en la pantalla al reservar, y
              queda guardado en tu cuenta.
            </p>
            <ul className="pol-lista">
              {consentimientos.map((p) => (
                <TarjetaPolitica key={p.id} politica={p} />
              ))}
            </ul>
          </section>
        )}
        {politicas && politicas.length > 0 && (
          <p className="pol-nota">
            Cuando actualizamos una política publicamos una versión nueva y te pedimos aceptarla en tu siguiente reserva. Puedes
            cancelar tu cita en línea hasta {contacto.horas_cancelacion} horas antes.
          </p>
        )}
      </div>
    </>
  );
}

function TarjetaPolitica({ politica: p }: { politica: Politica }) {
  return (
    <li>
      <Link className="pol-tarjeta" to={`/politicas/${p.tipo}`}>
        <span className="pol-tarjeta-tipo">{ETIQUETA_POLITICA[p.tipo] ?? p.tipo}</span>
        <span className="pol-tarjeta-titulo">{p.titulo}</span>
        <span className="pol-tarjeta-meta">
          Versión {p.version}
          {p.vigente_desde ? ` · vigente desde el ${fechaCorta(p.vigente_desde)}` : ''}
        </span>
        <span className="pol-tarjeta-ir" aria-hidden="true">
          <IconoFlecha tam={18} />
        </span>
      </Link>
    </li>
  );
}

function Documento({ tipo, cargando, error, recargar, politicas, firmaEnLinea }: PropsCarga & { tipo: string }) {
  const politica = politicas?.find((p) => p.tipo === tipo);
  useTitulo(politica?.titulo ?? (ETIQUETA_POLITICA[tipo] || 'Políticas'));
  const otras = (politicas ?? []).filter((p) => p.tipo !== tipo);

  return (
    <div className="contenedor seccion pol-doc">
      <nav className="pol-migas" aria-label="Ruta">
        <Link to="/politicas">Políticas</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{politica?.titulo ?? ETIQUETA_POLITICA[tipo] ?? 'Documento'}</span>
      </nav>
      {cargando && <Cargando texto="Cargando documento…" />}
      <MensajeError error={error} onReintentar={recargar} />
      {politicas && !politica && (
        <Vacio titulo="No encontramos esa política">
          <p>
            Puede que el enlace esté incompleto. <Link to="/politicas">Ver todas las políticas</Link>.
          </p>
        </Vacio>
      )}
      {politica && (
        <div className="pol-doc-rejilla">
          <article className="pol-articulo" aria-labelledby="pol-titulo">
            <header className="pol-doc-cabeza">
              <p className="eyebrow">{ETIQUETA_POLITICA[politica.tipo] ?? 'Política'}</p>
              <h1 id="pol-titulo">{politica.titulo}</h1>
              <dl className="pol-datos">
                <div>
                  <dt>Versión</dt>
                  <dd>{politica.version}</dd>
                </div>
                {politica.vigente_desde && (
                  <div>
                    <dt>Vigente desde</dt>
                    <dd>{fechaCorta(politica.vigente_desde)}</dd>
                  </div>
                )}
                <div>
                  <dt>
                    Huella del documento
                    <span className="sr-only"> (identifica esta versión exacta del texto)</span>
                  </dt>
                  <dd>
                    <code className="pol-huella" title={politica.hash_sha256 ?? undefined}>
                      {huella(politica.hash_sha256) ?? 'Por generar'}
                    </code>
                  </dd>
                </div>
              </dl>
              <p className="pol-huella-ayuda">
                La huella cambia si cambia una sola letra del documento: así sabes exactamente qué versión aceptaste
                {firmaEnLinea ? ' o firmaste' : ''}.
              </p>
              <button type="button" className="btn btn-texto btn-sm pol-imprimir" onClick={() => window.print()}>
                <IconoImprimir tam={18} /> Imprimir o guardar en PDF
              </button>
            </header>
            <Markdown texto={sinTituloInicial(politica.contenido_md)} className="pol-texto" />
          </article>
          {otras.length > 0 && (
            <aside className="pol-otras" aria-labelledby="pol-otras-titulo">
              <h2 id="pol-otras-titulo">Otras políticas</h2>
              <ul>
                {otras.map((p) => (
                  <li key={p.id}>
                    <Link to={`/politicas/${p.tipo}`}>{p.titulo}</Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

/** /politicas/consentimiento_*: con la firma en el spa, el documento se revisa en persona (ESPEC §9). */
function SeRevisaEnElSpa({ tipo, politicas }: { tipo: string; politicas: Politica[] | undefined }) {
  const nombre = ETIQUETA_POLITICA[tipo] || 'Consentimiento informado';
  useTitulo(nombre);
  const otras = politicas ?? [];
  return (
    <div className="contenedor seccion pol-doc">
      <nav className="pol-migas" aria-label="Ruta">
        <Link to="/politicas">Políticas</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{nombre}</span>
      </nav>
      <section className="pol-en-spa" aria-labelledby="pol-en-spa-titulo">
        <Gema tam={36} className="pol-en-spa-gema" />
        <h1 id="pol-en-spa-titulo">Este documento se revisa contigo en el spa</h1>
        <p>
          El día de tu cita, antes de empezar, tu especialista lo revisa contigo: te explica qué incluye el servicio y sus
          cuidados, y resuelve tus dudas con calma.
        </p>
        <Link className="btn btn-primario" to="/politicas">
          Ver nuestras políticas
        </Link>
      </section>
      {otras.length > 0 && (
        <aside className="pol-otras pol-en-spa-otras" aria-labelledby="pol-otras-titulo">
          <h2 id="pol-otras-titulo">Políticas para todas nuestras clientas</h2>
          <ul>
            {otras.map((p) => (
              <li key={p.id}>
                <Link to={`/politicas/${p.tipo}`}>{p.titulo}</Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
