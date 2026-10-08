// /cuenta/firmar/:citaId — firmar el consentimiento informado de una cita creada sin firma
// (p. ej. agendada por WhatsApp o en mostrador). Sólo con configuracion.firma_en_linea = true: con
// false (decisión de Ópalo, ESPEC §9) la firma se hace en el spa, en la tablet de la cabina, y esta
// página sólo lo explica y regresa a Mis citas.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { DatosFirma, Politica } from '../../lib/api/tipos';
import { duracion, edad, ETIQUETA_POLITICA, fechaLarga, fechaLocal, hora, mensajeError } from '../../lib/format';
import { useSesion } from '../../lib/sesion';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { Markdown } from '../../components/ui/Markdown';
import { PanelFirma } from '../../components/ui/PanelFirma';
import { PillEstadoCita } from '../../components/cuenta/SeccionCitas';
import { mapaPaquetes, mapaServicios, nombreCompleto, ORDEN_TIPOS, totalCita, unirConY } from '../../components/reserva/utilidades';
import '../../components/reserva/reserva.css';
import './cuenta.css';

const FIRMABLES = ['pendiente', 'confirmada', 'en_curso'];

/** Mismo texto que la base (firmar_consentimiento_cita) cuando la firma no es en línea. */
export const MSG_FIRMA_EN_SPA = 'La firma se hace en el spa, el día de tu cita.';

export default function FirmarPendiente() {
  const config = useAsync(() => api.getConfiguracion(), []);
  const enSpa = !!config.datos && config.datos.firma_en_linea !== true;

  useEffect(() => {
    const anterior = document.title;
    document.title = enSpa ? 'Consentimiento informado · Ópalo Spa' : 'Firmar consentimiento · Ópalo Spa';
    return () => {
      document.title = anterior;
    };
  }, [enSpa]);

  if (config.cargando && !config.datos)
    return (
      <Marco titulo="Tu cita">
        <Cargando texto="Cargando tu cita…" />
      </Marco>
    );
  if (config.error || !config.datos)
    return (
      <Marco titulo="Tu cita">
        <MensajeError error={config.error ?? 'No pudimos cargar tu cita.'} onReintentar={config.recargar} />
      </Marco>
    );
  if (enSpa)
    return (
      <Marco titulo="Consentimiento informado">
        <div className="pila">
          <p className="aviso aviso-info" role="status">
            {MSG_FIRMA_EN_SPA}
          </p>
          <p className="texto-2 cu-sin-margen">Tu especialista lo revisa contigo en cabina antes de empezar. No necesitas hacer nada más por ahora.</p>
          <div className="fila">
            <Link className="btn btn-primario" to="/cuenta/citas">
              Ir a mis citas
            </Link>
          </div>
        </div>
      </Marco>
    );
  return <FirmarEnLinea />;
}

function Marco({ titulo, intro, children }: { titulo: string; intro?: string; children: ReactNode }) {
  return (
    <div className="cu">
      <header className="cu-cabeza">
        <div className="contenedor">
          <p className="eyebrow">Mi cuenta</p>
          <h1 className="cu-titulo">{titulo}</h1>
          {intro && <p className="texto-2 cu-intro">{intro}</p>}
        </div>
      </header>
      <div className="contenedor cu-contenido cu-angosto">{children}</div>
    </div>
  );
}

/** Firma en línea del consentimiento (sólo con configuracion.firma_en_linea = true). */
function FirmarEnLinea() {
  const { citaId = '' } = useParams();
  const { sesion } = useSesion();
  const navigate = useNavigate();
  const datos = useAsync(
    () => Promise.all([api.getMisCitas(), api.getCatalogo(), api.getPoliticasVigentes(), api.getConfiguracion()]),
    [citaId],
  );
  const [firma, setFirma] = useState<DatosFirma | null>(null);
  const [leido, setLeido] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorLeido, setErrorLeido] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const leidoRef = useRef<HTMLInputElement>(null);

  const volver = (
    <Link className="btn btn-secundario" to="/cuenta/citas">
      Volver a mis citas
    </Link>
  );

  let contenido;
  if (datos.cargando && !datos.datos) contenido = <Cargando texto="Cargando tu cita…" />;
  else if (datos.error || !datos.datos)
    contenido = <MensajeError error={datos.error ?? 'No pudimos cargar tu cita.'} onReintentar={datos.recargar} />;
  else {
    const [citas, cat, vigentes, config] = datos.datos;
    const cita = citas.find((c) => c.id === citaId);
    if (!cita) {
      contenido = (
        <Vacio titulo="No encontramos esa cita">
          <p>Puede que el enlace sea de otra cuenta o que la cita ya no exista.</p>
          {volver}
        </Vacio>
      );
    } else if (cita.consentimientos_firmados > 0) {
      contenido = (
        <div className="pila">
          <p className="aviso aviso-exito">Ya firmaste el consentimiento de esta cita. Puedes verlo en tus documentos.</p>
          <div className="fila">
            {volver}
            <Link className="btn btn-texto" to="/cuenta/documentos">
              Ver mis documentos
            </Link>
          </div>
        </div>
      );
    } else if (!FIRMABLES.includes(cita.estado)) {
      contenido = (
        <div className="pila">
          <p className="aviso aviso-info">Esta cita ya no admite firmas.</p>
          <div className="fila">{volver}</div>
        </div>
      );
    } else {
      // Tipos de consentimiento de los servicios de la cita (los paquetes se expanden).
      const porId = mapaServicios(cat);
      const paquetes = mapaPaquetes(cat);
      const tipos = new Set<string>();
      for (const it of cita.items) {
        const ids = it.servicio_id ? [it.servicio_id] : (paquetes.get(it.paquete_id ?? '')?.items ?? []).map((x) => x.servicio_id);
        for (const id of ids) {
          const t = porId.get(id)?.tipo_consentimiento;
          if (t) tipos.add(t);
        }
      }
      const documentos: Politica[] = vigentes
        .filter((p) => tipos.has(p.tipo))
        .sort((a, b) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo));
      const anios = sesion?.cliente?.fecha_nacimiento ? edad(sesion.cliente.fecha_nacimiento, fechaLocal()) : null;
      // La base no deja firmar sin fecha de nacimiento (decide si firma también mamá, papá o tutor).
      const sinFecha = !!sesion?.cliente && !sesion.cliente.fecha_nacimiento;
      const requiereTutor = anios !== null && anios < config.edad_mayoria;
      const nombresDocs = documentos.map((d) => (ETIQUETA_POLITICA[d.tipo] ?? d.titulo).replace(/^Consentimiento informado · /, '').toLowerCase());

      const firmar = async () => {
        setError(null);
        if (documentos.length > 0 && !leido) {
          setErrorLeido(true);
          leidoRef.current?.focus();
          return;
        }
        if (sinFecha) {
          setError('Para firmar necesitamos tu fecha de nacimiento.');
          requestAnimationFrame(() => errorRef.current?.focus());
          return;
        }
        if (!firma) {
          setError('Falta tu firma o tu nombre completo.');
          requestAnimationFrame(() => errorRef.current?.focus());
          return;
        }
        setEnviando(true);
        try {
          await api.firmarConsentimientoCita(cita.id, firma);
          navigate('/cuenta/citas', {
            state: { aviso: `Listo, firmaste tu consentimiento para la cita del ${fechaLarga(cita.inicio)} a las ${hora(cita.inicio)}. Gracias.` },
          });
        } catch (e) {
          setError(mensajeError(e));
          requestAnimationFrame(() => errorRef.current?.focus());
        } finally {
          setEnviando(false);
        }
      };

      contenido = (
        <div className="rv-paso-cuerpo cu-firmar">
          <section className="tarjeta-plana rv-final" aria-labelledby="cu-firmar-cita">
            <div className="entre">
              <h2 className="rv-subtitulo" id="cu-firmar-cita">
                Tu cita
              </h2>
              <PillEstadoCita estado={cita.estado} />
            </div>
            <dl className="rv-final-datos">
              <div>
                <dt>Día</dt>
                <dd>{fechaLarga(cita.inicio)}</dd>
              </div>
              <div>
                <dt>Hora</dt>
                <dd>
                  {hora(cita.inicio)} a {hora(cita.fin)} (hora de Querétaro)
                </dd>
              </div>
              <div>
                <dt>Te atiende</dt>
                <dd>{cita.personal_nombre}</dd>
              </div>
              <div>
                <dt>Tiempo estimado</dt>
                <dd>{duracion(cita.duracion_min)}</dd>
              </div>
              <div className="rv-final-servicios">
                <dt>Servicios</dt>
                <dd>{unirConY(cita.items.map((i) => i.nombre))}</dd>
              </div>
              <div className="rv-final-total">
                <dt>Total estimado</dt>
                <dd className="num">{totalCita(cita.items).texto}</dd>
              </div>
            </dl>
          </section>

          {documentos.length > 0 ? (
            <section className="rv-bloque" aria-labelledby="cu-firmar-docs">
              <h2 className="rv-subtitulo" id="cu-firmar-docs">
                {documentos.length === 1 ? 'Consentimiento informado' : 'Consentimientos informados'}
              </h2>
              <p className="texto-2 cu-sin-margen">
                Léelo completo antes de firmar. Explica en qué consiste tu tratamiento, sus beneficios, riesgos y cuidados. Si tienes
                dudas, pregúntanos antes de firmar.
              </p>
              {documentos.map((d) => (
                <article key={d.id} className="rv-consentimiento-doc">
                  <p className="ayuda">
                    {ETIQUETA_POLITICA[d.tipo]} · versión {d.version}
                  </p>
                  <div className="rv-documento rv-documento-largo" tabIndex={0} role="region" aria-label={d.titulo || ETIQUETA_POLITICA[d.tipo]}>
                    <Markdown texto={d.contenido_md} />
                  </div>
                </article>
              ))}
              <label className="check rv-politica-check">
                <input
                  ref={leidoRef}
                  type="checkbox"
                  checked={leido}
                  onChange={(e) => {
                    setLeido(e.target.checked);
                    if (e.target.checked) setErrorLeido(false);
                  }}
                  aria-invalid={(errorLeido && !leido) || undefined}
                  aria-describedby={errorLeido && !leido ? 'cu-leido-error' : undefined}
                />
                <span>Leí el consentimiento informado completo.</span>
              </label>
              {errorLeido && !leido && (
                <span className="rv-campo-error" id="cu-leido-error">
                  Marca que leíste el consentimiento para poder firmar.
                </span>
              )}
            </section>
          ) : (
            <p className="aviso aviso-info">
              El consentimiento de tus servicios aún no está publicado en línea; tu firma queda registrada para esta cita y en cabina te
              explicamos todo antes de empezar.
            </p>
          )}

          <section className="rv-bloque" aria-labelledby="cu-firmar-firma">
            <h2 className="rv-subtitulo" id="cu-firmar-firma">
              Tu firma
            </h2>
            {sinFecha && (
              <p className="aviso aviso-alerta">
                <span>
                  Para firmar necesitamos tu fecha de nacimiento. <Link to="/cuenta/datos">Agrégala en «Mis datos»</Link> y vuelve a esta
                  cita desde «Mis citas».
                </span>
              </p>
            )}
            <PanelFirma
              onCambio={setFirma}
              requiereTutor={requiereTutor}
              nombreSugerido={nombreCompleto(sesion?.cliente)}
              leyenda={
                nombresDocs.length
                  ? `Con tu firma aceptas el consentimiento informado de ${unirConY(nombresDocs)}. Firma con tu dedo o con el mouse dentro del recuadro.`
                  : 'Firma con tu dedo o con el mouse dentro del recuadro.'
              }
            />
          </section>

          {error && (
            <p className="aviso aviso-error rv-error" role="alert" tabIndex={-1} ref={errorRef}>
              <span>
                {error}
                {/necesitamos tu fecha de nacimiento/.test(error) && (
                  <>
                    {' '}
                    <Link to="/cuenta/datos">Ir a «Mis datos»</Link>
                  </>
                )}
              </span>
            </p>
          )}

          <div className="rv-pie">
            <div className="rv-pie-botones">
              {volver}
              <button type="button" className="btn btn-primario rv-pie-continuar" onClick={() => void firmar()} disabled={enviando}>
                {enviando ? 'Firmando…' : 'Firmar consentimiento'}
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  return (
    <Marco
      titulo="Firma tu consentimiento"
      intro="Sin consentimiento firmado no podemos empezar tu servicio. Fírmalo aquí y llega directo a tu cita."
    >
      {contenido}
    </Marco>
  );
}
