import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { reiniciarDemo } from '../lib/api/demo';
import { borrarCarritoGuardado, useCarrito } from '../lib/carrito';
import { enlaceWhatsApp, telefonoBonito } from '../lib/format';
import { useSesion } from '../lib/sesion';
import { Marca } from '../components/ui/Gema';
import { antesDeApertura, enlaceMapa, useContacto } from '../components/publico/contacto';
import {
  IconoBolsa,
  IconoCerrar,
  IconoMenu,
  IconoMensaje,
  IconoReloj,
  IconoUbicacion,
  IconoUsuaria,
} from '../components/publico/Iconos';
import './publico.css';

const NAVEGACION = [
  { to: '/servicios', texto: 'Servicios' },
  { to: '/tienda', texto: 'Tienda' },
  { to: '/equipo', texto: 'Nosotras' },
  { to: '/politicas', texto: 'Políticas' },
];

/** Rutas con su propio flujo de botones donde el botón flotante de WhatsApp estorbaría. */
function ocultarFlotante(ruta: string): boolean {
  return ruta.startsWith('/reservar') || ruta.startsWith('/cuenta/firmar');
}

function BannerDemo() {
  if (api.modo !== 'demo') return null;
  return (
    <div className="banner-demo sp-banner-demo">
      <span>Modo demostración: los datos se guardan sólo en este navegador</span>
      <button
        type="button"
        className="sp-banner-demo-boton"
        onClick={() => {
          if (window.confirm('¿Borrar los datos de la demostración y empezar de nuevo?')) {
            borrarCarritoGuardado();
            reiniciarDemo();
          }
        }}
      >
        Reiniciar datos
      </button>
    </div>
  );
}

function AvisoAgregado() {
  const { aviso, cerrarAviso } = useCarrito();
  const { pathname } = useLocation();
  const visible = !!aviso && pathname !== '/carrito';

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(cerrarAviso, 5000);
    return () => window.clearTimeout(t);
  }, [aviso, cerrarAviso]);

  return (
    <div className="sp-aviso-carrito-region" role="status" aria-live="polite">
      {visible && aviso && (
        <div className="sp-aviso-carrito" key={aviso.n}>
          <IconoBolsa tam={20} />
          <p>
            Agregaste <strong>{aviso.nombre}</strong>
            {aviso.regalo_para ? ` (regalo para ${aviso.regalo_para})` : ''} al carrito.
          </p>
          <Link className="btn btn-texto btn-sm" to="/carrito" onClick={cerrarAviso}>
            Ver carrito
          </Link>
          <button type="button" className="sp-aviso-carrito-cerrar" onClick={cerrarAviso} aria-label="Cerrar aviso">
            <IconoCerrar tam={18} />
          </button>
        </div>
      )}
    </div>
  );
}

export function LayoutPublico() {
  const { sesion, cargando, esPersonal } = useSesion();
  const { contador } = useCarrito();
  const contacto = useContacto();
  const { pathname, hash } = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const botonMenu = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const rutaAnterior = useRef(pathname);

  // Al cambiar de página: arriba del todo (o al ancla), cierra el menú y, si cambió la ruta,
  // lleva el foco al contenido para que los lectores de pantalla empiecen por la página nueva.
  useEffect(() => {
    setMenuAbierto(false);
    const cambioRuta = rutaAnterior.current !== pathname;
    rutaAnterior.current = pathname;
    if (hash) {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
    if (cambioRuta) main.current?.focus({ preventScroll: true });
  }, [pathname, hash]);

  // Escape cierra el menú móvil y regresa el foco al botón.
  useEffect(() => {
    if (!menuAbierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuAbierto(false);
        botonMenu.current?.focus();
      }
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [menuAbierto]);

  const whatsapp = enlaceWhatsApp(contacto.telefono_whatsapp, 'Hola, Ópalo. Me gustaría recibir información.');
  const telefono = telefonoBonito(contacto.telefono_whatsapp);
  const textoCarrito = contador === 0 ? 'Carrito vacío' : `Carrito, ${contador} ${contador === 1 ? 'artículo' : 'artículos'}`;
  const cuenta = sesion ? { to: '/cuenta', texto: 'Mi cuenta' } : { to: '/entrar', texto: 'Entrar' };
  const anio = new Date().getFullYear();

  return (
    <div className={`sitio-publico ${menuAbierto ? 'sp-menu-abierto' : ''}`}>
      <a
        className="sp-saltar"
        href="#contenido"
        onClick={(e) => {
          // Sin cambiar la URL: con el router de # (HashRouter) un ancla sería otra ruta.
          e.preventDefault();
          main.current?.focus();
          main.current?.scrollIntoView();
        }}
      >
        Saltar al contenido
      </a>
      <BannerDemo />

      <header className="sp-encabezado">
        <div className="contenedor sp-barra">
          <Link to="/" className="sp-marca">
            <Marca tam={26} />
            <span className="sr-only">, ir al inicio</span>
          </Link>

          <nav className="sp-nav" aria-label="Principal">
            <ul>
              {NAVEGACION.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to}>{n.texto}</NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="sp-acciones">
            {esPersonal && (
              <Link className="sp-enlace sp-solo-escritorio" to="/admin">
                Panel interno
              </Link>
            )}
            {!cargando && (
              <NavLink className="sp-enlace sp-solo-escritorio" to={cuenta.to}>
                <IconoUsuaria tam={20} />
                {cuenta.texto}
              </NavLink>
            )}
            <NavLink className="sp-carrito" to="/carrito" aria-label={textoCarrito}>
              <IconoBolsa tam={22} />
              {contador > 0 && (
                <span className="sp-carrito-contador num" aria-hidden="true">
                  {contador > 99 ? '99+' : contador}
                </span>
              )}
            </NavLink>
            <Link className="btn btn-primario sp-reservar" to="/reservar">
              Reservar
            </Link>
            <button
              ref={botonMenu}
              type="button"
              className="sp-boton-menu"
              aria-expanded={menuAbierto}
              aria-controls="menu-movil"
              onClick={() => setMenuAbierto((v) => !v)}
            >
              {menuAbierto ? <IconoCerrar tam={24} /> : <IconoMenu tam={24} />}
              <span className="sr-only">{menuAbierto ? 'Cerrar menú' : 'Abrir menú'}</span>
            </button>
          </div>
        </div>

        <div id="menu-movil" className="sp-menu-movil" hidden={!menuAbierto}>
          <nav
            className="contenedor"
            aria-label="Menú"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) setMenuAbierto(false);
            }}
          >
            <ul className="sp-menu-movil-lista">
              <li>
                <NavLink to="/" end>
                  Inicio
                </NavLink>
              </li>
              {NAVEGACION.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to}>{n.texto}</NavLink>
                </li>
              ))}
              <li>
                <NavLink to="/carrito">
                  Carrito{contador > 0 ? ` (${contador})` : ''}
                </NavLink>
              </li>
            </ul>
            <div className="sp-menu-movil-cuenta">
              {!cargando && (
                <Link className="btn btn-secundario btn-bloque" to={cuenta.to}>
                  <IconoUsuaria tam={20} />
                  {cuenta.texto}
                </Link>
              )}
              {esPersonal && (
                <Link className="btn btn-texto btn-bloque" to="/admin">
                  Panel interno
                </Link>
              )}
              <a className="sp-menu-movil-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer">
                <IconoMensaje tam={20} /> WhatsApp {telefono}
                <span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>
            </div>
          </nav>
        </div>
      </header>

      <main id="contenido" ref={main} tabIndex={-1} className="sp-contenido">
        <Outlet />
      </main>

      <footer className="sp-pie">
        <div className="contenedor sp-pie-rejilla">
          <div className="sp-pie-marca">
            <Link to="/" className="sp-pie-logo">
              <Marca tam={30} />
              <span className="sr-only">, ir al inicio</span>
            </Link>
            {contacto.lema && <p className="sp-pie-lema">{contacto.lema}</p>}
            <p className="sp-pie-cita">
              <IconoReloj tam={18} /> Atención con cita
            </p>
            {antesDeApertura() && <p className="sp-pie-apertura">Abrimos el 31 de octubre de 2026.</p>}
          </div>

          <div>
            <h2 className="sp-pie-titulo">Visítanos</h2>
            <p className="sp-pie-dato">
              <IconoUbicacion tam={18} />
              <span>{contacto.direccion}</span>
            </p>
            <a className="sp-pie-enlace" href={enlaceMapa(contacto.direccion)} target="_blank" rel="noopener noreferrer">
              Ver en el mapa<span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          </div>

          <div>
            <h2 className="sp-pie-titulo">Escríbenos</h2>
            <a className="sp-pie-dato sp-pie-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer">
              <IconoMensaje tam={18} />
              <span>
                WhatsApp <span className="sp-nowrap">{telefono}</span>
                <span className="sr-only"> (se abre en una pestaña nueva)</span>
              </span>
            </a>
            <p className="sp-pie-nota">Te respondemos para agendar, resolver dudas o cambiar tu cita.</p>
          </div>

          <nav aria-label="Explora">
            <h2 className="sp-pie-titulo">Explora</h2>
            <ul className="sp-pie-lista">
              <li><Link to="/servicios">Servicios y paquetes</Link></li>
              <li><Link to="/tienda">Tienda y regalos</Link></li>
              <li><Link to="/equipo">Nosotras</Link></li>
              <li><Link to="/reservar">Reservar</Link></li>
              <li><Link to={cuenta.to}>{cuenta.texto}</Link></li>
            </ul>
          </nav>

          <nav aria-label="Políticas">
            <h2 className="sp-pie-titulo">Políticas</h2>
            <ul className="sp-pie-lista">
              <li><Link to="/politicas/terminos">Términos y condiciones</Link></li>
              <li><Link to="/politicas/privacidad">Aviso de privacidad</Link></li>
              <li><Link to="/politicas/cancelacion">Política de cancelación</Link></li>
              <li><Link to="/politicas">Consentimientos informados</Link></li>
            </ul>
          </nav>
        </div>
        <div className="contenedor sp-pie-legal">
          <p>
            © {anio} {contacto.nombre_negocio} · Querétaro, México
          </p>
        </div>
      </footer>

      {!menuAbierto && !ocultarFlotante(pathname) && (
        <a className="sp-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer">
          <IconoMensaje tam={28} />
          <span className="sr-only">Escríbenos por WhatsApp (se abre en una pestaña nueva)</span>
        </a>
      )}

      <AvisoAgregado />
    </div>
  );
}
