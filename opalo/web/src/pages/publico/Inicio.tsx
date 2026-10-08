import { Link } from 'react-router-dom';
import { api, type Catalogo, type Capacitacion, type PersonalPublico } from '../../lib/api';
import { dinero, enlaceWhatsApp, mesNombre, numero, telefonoBonito } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError } from '../../components/ui/Estado';
import { Gema } from '../../components/ui/Gema';
import { ArteHero, Medallon, SeparadorGema } from '../../components/publico/Decoracion';
import { useTitulo } from '../../components/publico/EncabezadoPagina';
import { TarjetaPaquete } from '../../components/publico/TarjetasCatalogo';
import {
  categoriasOrdenadas,
  ETIQUETA_CAPACITACION,
  mapaServicios,
  paquetesOrdenados,
  precioDesde,
  serviciosDeCategoria,
} from '../../components/publico/catalogo';
import { antesDeApertura, enlaceMapa, useContacto } from '../../components/publico/contacto';
import { fechaEnTexto } from '../../components/reserva/utilidades';
import {
  IconoBirrete,
  IconoCalendario,
  IconoCategoria,
  IconoCorazon,
  IconoEscudo,
  IconoFicha,
  IconoFirma,
  IconoFlecha,
  IconoMensaje,
  IconoReloj,
  IconoUbicacion,
} from '../../components/publico/Iconos';
import './inicio.css';

export default function Inicio() {
  useTitulo('Spa en Querétaro');
  const contacto = useContacto();
  const catalogo = useAsync(() => api.getCatalogo(), []);
  const equipo = useAsync(() => api.getEquipo(), []);
  // Fecha de apertura de la configuración (mientras carga, la del catálogo); null = ya no se anuncia.
  const apertura = antesDeApertura(contacto.fecha_apertura) ? contacto.fecha_apertura : null;

  return (
    <div className="inicio">
      {/* ---------- Hero ---------- */}
      {/* data-sin-flotante: en celular el botón flotante de WhatsApp no tapa los botones del hero. */}
      <section className="ini-hero" aria-labelledby="hero-titulo" data-sin-flotante>
        <div className="contenedor ini-hero-rejilla">
          <div className="ini-hero-texto">
            <p className="eyebrow">{apertura ? `Spa en Querétaro · Abrimos el ${fechaEnTexto(apertura, false)}` : 'Spa en Querétaro · Momentum Centro Sur'}</p>
            <h1 id="hero-titulo" className="ini-hero-titulo">
              Todo lo que necesitas para consentirte, <em>en un solo lugar</em>
            </h1>
            <p className="ini-hero-sub">
              Depilación con cera premium, faciales, tratamientos corporales, complementos y paquetes. Y un equipo en
              capacitación constante para darte las mejores sesiones.
            </p>
            <div className="ini-hero-cta">
              <Link className="btn btn-primario ini-hero-boton" to="/reservar">
                Reserva tu cita
              </Link>
              <Link className="btn btn-secundario ini-hero-boton" to="/servicios">
                Ver servicios
              </Link>
            </div>
            <ul className="ini-hero-datos">
              <li className="ini-hero-dato-enlace">
                <Link to="/equipo">
                  <IconoBirrete tam={18} /> Equipo en capacitación constante
                </Link>
              </li>
              <li>
                <IconoReloj tam={18} /> Sesiones de 1 hora
              </li>
              <li>
                <IconoFirma tam={18} /> Reserva y firma en línea
              </li>
            </ul>
          </div>
          <div className="ini-hero-arte">
            <ArteHero />
          </div>
        </div>
      </section>

      {/* ---------- Todo en un solo lugar ---------- */}
      <section className="seccion" aria-labelledby="titulo-todo">
        <div className="contenedor">
          <div className="sp-encabezado-seccion">
            <p className="eyebrow">Todo en un solo lugar</p>
            <h2 id="titulo-todo">Lo que necesitas, sin ir de un lado a otro</h2>
            <p className="subtitulo">
              Depílate, cuida tu piel y date un respiro en una misma visita. Elige un servicio, súmale un complemento o
              ahorra con un paquete.
            </p>
          </div>
          {catalogo.cargando && <Cargando texto="Cargando servicios…" />}
          <MensajeError error={catalogo.error} onReintentar={catalogo.recargar} />
          {catalogo.datos && <Categorias catalogo={catalogo.datos} />}
        </div>
      </section>

      {/* ---------- Paquetes ---------- */}
      {catalogo.datos && paquetesOrdenados(catalogo.datos).length > 0 && (
        <section className="seccion seccion-alt inicio-paquetes" aria-labelledby="titulo-paquetes">
          <div className="contenedor">
            <div className="sp-encabezado-seccion sp-entre-alineado">
              <div>
                <p className="eyebrow">Paquetes</p>
                <h2 id="titulo-paquetes">Combina y consiéntete más</h2>
                <p className="subtitulo">Varios servicios en una sola visita, a un precio especial.</p>
              </div>
              <Link className="btn btn-texto" to="/servicios?ver=paquetes">
                Ver todos los paquetes <IconoFlecha tam={18} />
              </Link>
            </div>
            <div className="sp-rejilla-paquetes">
              {paquetesOrdenados(catalogo.datos)
                .slice(0, 4)
                .map((p) => (
                  <TarjetaPaquete key={p.id} paquete={p} porId={mapaServicios(catalogo.datos!)} sesionMin={contacto.duracion_sesion_min} />
                ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Siempre aprendiendo ---------- */}
      <section className="seccion" aria-labelledby="titulo-aprendiendo">
        <div className="contenedor aprendiendo">
          <div className="aprendiendo-texto">
            <p className="eyebrow">Siempre aprendiendo</p>
            <h2 id="titulo-aprendiendo">Un equipo en capacitación constante</h2>
            <p className="subtitulo">
              Las mejores sesiones empiezan antes de que llegues: en la preparación de quien te atiende. Por eso nos
              seguimos formando en técnica, higiene y cuidado de la piel, y aquí te mostramos cada capacitación que
              registramos.
            </p>
            <Link className="btn btn-secundario" to="/equipo">
              Conoce al equipo
            </Link>
          </div>
          <div className="aprendiendo-lista">
            {equipo.cargando && <Cargando texto="Cargando capacitaciones…" />}
            <MensajeError error={equipo.error} onReintentar={equipo.recargar} />
            {equipo.datos && <Capacitaciones equipo={equipo.datos} />}
          </div>
        </div>
      </section>

      {/* ---------- Cómo reservar ---------- */}
      <section className="seccion seccion-alt" aria-labelledby="titulo-pasos">
        <div className="contenedor">
          <div className="sp-encabezado-seccion centrado">
            <SeparadorGema />
            <p className="eyebrow">Cómo reservar</p>
            <h2 id="titulo-pasos">Tu cita en cuatro pasos</h2>
            <p className="subtitulo">Todo desde tu celular, en unos minutos.</p>
          </div>
          <ol className="ini-pasos">
            <li className="ini-paso">
              <Medallon>
                <IconoCalendario tam={24} />
              </Medallon>
              <h3>Eliges servicio y hora</h3>
              <p>Ves los horarios libres en el calendario. Cada sesión dura 1 hora y sabes desde antes quién te atiende.</p>
            </li>
            <li className="ini-paso">
              <Medallon>
                <IconoFicha tam={24} />
              </Medallon>
              <h3>Llenas tu ficha de salud</h3>
              <p>Unas preguntas rápidas para saber si el servicio es seguro para ti. Tus respuestas son confidenciales.</p>
            </li>
            <li className="ini-paso">
              <Medallon>
                <IconoFirma tam={24} />
              </Medallon>
              <h3>Firmas tu consentimiento en línea</h3>
              <p>Lo firmas en la pantalla de tu celular o computadora y queda guardado en tu cuenta para que lo consultes cuando quieras.</p>
            </li>
            <li className="ini-paso">
              <Medallon className="sp-medallon-oro">
                <IconoCorazon tam={24} />
              </Medallon>
              <h3>Te esperamos</h3>
              <p>Llega unos minutos antes a Momentum Centro Sur. Tu cita y sus detalles están siempre en "Mi cuenta".</p>
            </li>
          </ol>
          <div className="ini-centrado-boton">
            <Link className="btn btn-primario" to="/reservar">
              Reserva tu cita
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Tu seguridad primero ---------- */}
      <section className="seccion" aria-labelledby="titulo-seguridad">
        <div className="contenedor">
          <div className="sp-encabezado-seccion">
            <p className="eyebrow">Tu seguridad primero</p>
            <h2 id="titulo-seguridad">Te cuidamos antes, durante y después</h2>
          </div>
          <div className="grid-3 ini-seguridad">
            <article className="ini-tarjeta-seguridad">
              <Medallon>
                <IconoFicha tam={24} />
              </Medallon>
              <h3>Ficha de salud</h3>
              <p>
                Antes de cada cita revisamos tu ficha: embarazo, medicamentos, alergias y otras condiciones que cambian la
                forma de atenderte. Si algo requiere revisión, te escribimos antes de tu cita.
              </p>
            </article>
            <article className="ini-tarjeta-seguridad">
              <Medallon>
                <IconoEscudo tam={24} />
              </Medallon>
              <h3>Consentimiento informado</h3>
              <p>
                Te explicamos qué incluye cada servicio, sus cuidados y sus riesgos, y lo firmas en línea. Sin consentimiento
                firmado no hay servicio.
              </p>
            </article>
            <article className="ini-tarjeta-seguridad">
              <Medallon>
                <Gema tam={24} />
              </Medallon>
              <h3>Higiene en cada sesión</h3>
              <p>Cera premium, técnica cuidadosa y protocolos de higiene en cada sesión, en una cabina preparada para ti.</p>
            </article>
          </div>
          <p className="ini-nota-edad">
            Atendemos a partir de los {contacto.edad_minima} años. Si tienes menos de {contacto.edad_mayoria}, te acompaña
            mamá, papá o tu tutor. Consulta nuestras <Link to="/politicas">políticas</Link>.
          </p>
        </div>
      </section>

      {/* ---------- Ubicación y contacto ---------- */}
      <section className="seccion seccion-alt" aria-labelledby="titulo-visitanos">
        <div className="contenedor visitanos">
          <div>
            <p className="eyebrow">Visítanos</p>
            <h2 id="titulo-visitanos">Te esperamos en Momentum Centro Sur</h2>
            <p className="visitanos-dato">
              <IconoUbicacion tam={22} />
              <span>{contacto.direccion}</span>
            </p>
            <p className="visitanos-dato">
              <IconoReloj tam={22} />
              <span>
                Atención con cita. Consulta los horarios libres al reservar.
                {apertura && <strong className="visitanos-apertura"> Abrimos el {fechaEnTexto(apertura)}.</strong>}
              </span>
            </p>
            <p className="visitanos-dato">
              <IconoMensaje tam={22} />
              <span>
                WhatsApp <strong className="num">{telefonoBonito(contacto.telefono_whatsapp)}</strong>
              </span>
            </p>
          </div>
          <div className="visitanos-tarjeta">
            <Gema tam={40} className="visitanos-gema" />
            <p className="visitanos-frase">¿Tienes dudas sobre qué servicio es para ti? Escríbenos y te orientamos.</p>
            <div className="visitanos-botones">
              <a
                className="btn btn-primario btn-bloque"
                href={enlaceWhatsApp(contacto.telefono_whatsapp, 'Hola, Ópalo. Tengo una duda sobre sus servicios.')}
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconoMensaje tam={20} /> Escríbenos por WhatsApp<span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>
              <a className="btn btn-secundario btn-bloque" href={enlaceMapa(contacto.direccion)} target="_blank" rel="noopener noreferrer">
                <IconoUbicacion tam={20} /> Cómo llegar<span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Categorias({ catalogo }: { catalogo: Catalogo }) {
  const categorias = categoriasOrdenadas(catalogo).filter((c) => serviciosDeCategoria(catalogo, c).length > 0);
  const paquetes = paquetesOrdenados(catalogo);
  return (
    <ul className="ini-categorias">
      {categorias.map((c) => {
        const servicios = serviciosDeCategoria(catalogo, c);
        const desde = precioDesde(servicios);
        return (
          <li key={c.id}>
            <Link className="tarjeta-categoria" to={`/servicios?ver=${encodeURIComponent(c.slug)}`}>
              <Medallon>
                <IconoCategoria slug={c.slug} />
              </Medallon>
              <h3>{c.nombre}</h3>
              {c.descripcion && <p className="tc-desc">{c.descripcion}</p>}
              <p className="tc-meta">
                <span>
                  {servicios.length} {servicios.length === 1 ? 'opción' : 'opciones'}
                </span>
                {desde !== null && <span>desde {dinero(desde)}</span>}
              </p>
              <span className="tc-ir" aria-hidden="true">
                <IconoFlecha tam={18} />
              </span>
            </Link>
          </li>
        );
      })}
      {paquetes.length > 0 && (
        <li>
          <Link className="tarjeta-categoria tarjeta-categoria-paquetes" to="/servicios?ver=paquetes">
            <Medallon className="sp-medallon-oro">
              <Gema tam={24} />
            </Medallon>
            <h3>Paquetes</h3>
            <p className="tc-desc">Combina varios servicios en una visita y paga menos.</p>
            <p className="tc-meta">
              <span>
                {paquetes.length} {paquetes.length === 1 ? 'paquete' : 'paquetes'}
              </span>
            </p>
            <span className="tc-ir" aria-hidden="true">
              <IconoFlecha tam={18} />
            </span>
          </Link>
        </li>
      )}
    </ul>
  );
}

function Capacitaciones({ equipo }: { equipo: PersonalPublico[] }) {
  const nombrePor = new Map(equipo.map((p) => [p.id, p.nombre]));
  const todas: Capacitacion[] = equipo.flatMap((p) => p.capacitaciones);
  if (todas.length === 0) {
    return (
      <div className="aprendiendo-vacio">
        <IconoBirrete tam={32} />
        <p>
          Nuestro compromiso es que cada persona que te atienda siga aprendiendo. Conforme el equipo tome cursos, talleres
          y certificaciones, los verás aquí con su fecha y la institución que los imparte.
        </p>
      </div>
    );
  }
  const recientes = [...todas].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '')).slice(0, 4);
  const horas = todas.reduce((s, c) => s + (c.horas ?? 0), 0);
  return (
    <div>
      <dl className="aprendiendo-cifras">
        <div>
          <dt>Capacitaciones registradas</dt>
          <dd className="num">{todas.length}</dd>
        </div>
        {horas > 0 && (
          <div>
            <dt>Horas de formación</dt>
            <dd className="num">{numero(horas, 1)}</dd>
          </div>
        )}
      </dl>
      <ul className="linea-capacitaciones">
        {recientes.map((c) => (
          <li key={c.id}>
            <span className="lc-punto" aria-hidden="true" />
            <p className="lc-fecha">
              {c.fecha ? mesNombre(c.fecha) : 'Sin fecha'} · {ETIQUETA_CAPACITACION[c.tipo] ?? c.tipo}
            </p>
            <p className="lc-nombre">{c.nombre}</p>
            <p className="lc-detalle">
              {[nombrePor.get(c.personal_id), c.institucion, c.horas ? `${numero(c.horas, 1)} h` : null].filter(Boolean).join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
