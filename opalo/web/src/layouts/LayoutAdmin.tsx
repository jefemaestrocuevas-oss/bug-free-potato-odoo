// Panel interno de Ópalo (/admin): barra lateral en escritorio y tablet horizontal;
// en pantallas angostas se vuelve una barra superior con menú desplegable.
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { reiniciarDemo } from '../lib/api/demo';
import { useSesion } from '../lib/sesion';
import { Marca } from '../components/ui/Gema';
import {
  IconoAgenda,
  IconoCatalogo,
  IconoClientas,
  IconoCostos,
  IconoEquipo,
  IconoGastos,
  IconoInventario,
  IconoMenu,
  IconoCerrar,
  IconoPedidos,
  IconoPoliticas,
  IconoResultados,
  IconoResumen,
  IconoSalir,
  IconoSitio,
} from '../components/admin/Iconos';
import { ETIQUETA_ROL } from '../components/admin/util';
import '../components/admin/componentes.css';
import './admin.css';

interface Enlace {
  to: string;
  texto: string;
  Icono: ComponentType<{ tam?: number }>;
  fin?: boolean;
}

const OPERACION: Enlace[] = [
  { to: '/admin', texto: 'Resumen', Icono: IconoResumen, fin: true },
  { to: '/admin/agenda', texto: 'Agenda', Icono: IconoAgenda },
  { to: '/admin/clientes', texto: 'Clientas', Icono: IconoClientas },
  { to: '/admin/pedidos', texto: 'Pedidos y pagos', Icono: IconoPedidos },
  { to: '/admin/inventario', texto: 'Inventario', Icono: IconoInventario },
  { to: '/admin/costos', texto: 'Costos y márgenes', Icono: IconoCostos },
];

const ADMINISTRACION: Enlace[] = [
  { to: '/admin/gastos', texto: 'Gastos', Icono: IconoGastos },
  { to: '/admin/resultados', texto: 'Resultados', Icono: IconoResultados },
  { to: '/admin/catalogo', texto: 'Catálogo y precios', Icono: IconoCatalogo },
  { to: '/admin/equipo', texto: 'Equipo y capacitaciones', Icono: IconoEquipo },
  { to: '/admin/politicas', texto: 'Políticas', Icono: IconoPoliticas },
];

function BannerDemo() {
  if (api.modo !== 'demo') return null;
  return (
    <div className="banner-demo adm-banner-demo">
      <span>Modo demostración: los datos de ejemplo viven sólo en este navegador.</span>
      <button
        type="button"
        className="adm-banner-boton"
        onClick={() => {
          if (window.confirm('¿Borrar los datos de la demostración y empezar de nuevo?')) reiniciarDemo();
        }}
      >
        Reiniciar datos
      </button>
    </div>
  );
}

export function LayoutAdmin() {
  const { sesion, esAdmin } = useSesion();
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const main = useRef<HTMLElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const anterior = useRef(pathname);

  // Al cambiar de sección: cierra el menú, sube y lleva el foco al contenido.
  useEffect(() => {
    setAbierto(false);
    if (anterior.current !== pathname) {
      anterior.current = pathname;
      window.scrollTo(0, 0);
      main.current?.focus({ preventScroll: true });
    }
  }, [pathname]);

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [abierto]);

  const salir = async () => {
    setSaliendo(true);
    try {
      await api.cerrarSesion();
    } finally {
      setSaliendo(false);
      navegar('/', { replace: true });
    }
  };

  const enlaces = (lista: Enlace[]) =>
    lista.map(({ to, texto, Icono, fin }) => (
      <li key={to}>
        <NavLink to={to} end={fin} className={({ isActive }) => `adm-nav-enlace ${isActive ? 'adm-nav-activo' : ''}`}>
          <Icono tam={20} />
          <span>{texto}</span>
        </NavLink>
      </li>
    ));

  const rol = sesion?.rol ? ETIQUETA_ROL[sesion.rol] : '';
  const quien = sesion?.cliente?.nombre ? [sesion.cliente.nombre, sesion.cliente.apellidos].filter(Boolean).join(' ') : sesion?.email ?? '';

  return (
    <div className={`panel-admin ${abierto ? 'adm-menu-abierto' : ''}`}>
      <a
        className="adm-saltar"
        href="#contenido-admin"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        Saltar al contenido
      </a>
      <BannerDemo />
      <div className="adm-marco">
        <aside className="adm-lateral">
          <div className="adm-lateral-cabeza">
            <Link to="/admin" className="adm-marca" aria-label="Ópalo · Panel interno, ir al resumen">
              <Marca tam={22} />
              <span className="adm-marca-sub">Panel interno</span>
            </Link>
            <button
              ref={boton}
              type="button"
              className="adm-boton-menu"
              aria-expanded={abierto}
              aria-controls="adm-navegacion"
              onClick={() => setAbierto((v) => !v)}
            >
              {abierto ? <IconoCerrar tam={22} /> : <IconoMenu tam={22} />}
              <span>{abierto ? 'Cerrar' : 'Menú'}</span>
            </button>
          </div>
          <div className="adm-lateral-cuerpo" id="adm-navegacion">
            <nav aria-label="Secciones del panel">
              <p className="adm-nav-grupo">Día a día</p>
              <ul className="adm-nav">{enlaces(OPERACION)}</ul>
              {esAdmin && (
                <>
                  <p className="adm-nav-grupo">Administración</p>
                  <ul className="adm-nav">{enlaces(ADMINISTRACION)}</ul>
                </>
              )}
            </nav>
            <div className="adm-usuario">
              <div className="adm-usuario-datos">
                <span className="adm-usuario-nombre" title={quien}>
                  {quien || 'Sesión iniciada'}
                </span>
                <span className="pill pill-oro">{rol}</span>
              </div>
              <Link className="adm-nav-enlace" to="/">
                <IconoSitio tam={20} />
                <span>Ver sitio</span>
              </Link>
              <button type="button" className="adm-nav-enlace adm-boton-salir" onClick={salir} disabled={saliendo}>
                <IconoSalir tam={20} />
                <span>{saliendo ? 'Cerrando…' : 'Cerrar sesión'}</span>
              </button>
            </div>
          </div>
        </aside>
        <main className="adm-principal" id="contenido-admin" ref={main} tabIndex={-1}>
          <div className="adm-contenido">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
