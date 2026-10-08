// /cuenta y /cuenta/:seccion — portal de clientas: citas, pedidos, servicios, documentos y datos.
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSesion } from '../../lib/sesion';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError } from '../../components/ui/Estado';
import { SeccionCitas } from '../../components/cuenta/SeccionCitas';
import { SeccionDatos } from '../../components/cuenta/SeccionDatos';
import { SeccionDocumentos } from '../../components/cuenta/SeccionDocumentos';
import { SeccionPedidos } from '../../components/cuenta/SeccionPedidos';
import { SeccionServicios } from '../../components/cuenta/SeccionServicios';
import '../../components/reserva/reserva.css';
import './cuenta.css';

// Etiquetas cortas y parejas para que las cinco pestañas quepan en el celular.
const SECCIONES = [
  { clave: 'citas', texto: 'Citas', titulo: 'Mis citas' },
  { clave: 'pedidos', texto: 'Pedidos', titulo: 'Mis pedidos' },
  { clave: 'servicios', texto: 'Servicios', titulo: 'Mis servicios' },
  { clave: 'documentos', texto: 'Documentos', titulo: 'Mis documentos' },
  { clave: 'datos', texto: 'Datos', titulo: 'Mis datos' },
] as const;

type Seccion = (typeof SECCIONES)[number]['clave'];

function esSeccion(s: string | undefined): s is Seccion {
  return SECCIONES.some((x) => x.clave === s);
}

export default function MiCuenta() {
  const { seccion } = useParams();
  const { sesion, esPersonal } = useSesion();
  const location = useLocation();
  const config = useAsync(() => api.getConfiguracion(), []);
  const actual: Seccion | null = seccion === undefined ? 'citas' : esSeccion(seccion) ? seccion : null;
  const navigate = useNavigate();
  const avisoEnHistorial = (location.state as { aviso?: string } | null)?.aviso ?? null;
  // Se guarda al montar: la sección de citas puede aparecer después (cuando carga la configuración).
  const [avisoInicial] = useState(avisoEnHistorial);

  // El aviso (p. ej. "firmaste tu consentimiento") se muestra una vez: se limpia del historial.
  useEffect(() => {
    if (avisoEnHistorial) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [avisoEnHistorial, navigate, location.pathname, location.search]);

  useEffect(() => {
    const anterior = document.title;
    const nombre = SECCIONES.find((x) => x.clave === actual)?.titulo ?? 'Mi cuenta';
    document.title = `${nombre} · Ópalo Spa`;
    return () => {
      document.title = anterior;
    };
  }, [actual]);

  if (!actual) return <Navigate to="/cuenta/citas" replace />;

  const nombre = sesion?.cliente?.nombre?.trim() || '';
  const sinCliente = !!sesion && !sesion.cliente;

  return (
    <div className="cu">
      <header className="cu-cabeza">
        <div className="contenedor">
          <p className="eyebrow">Mi cuenta</p>
          <div className="entre cu-cabeza-fila">
            <h1 className="cu-titulo">{nombre ? `Hola, ${nombre}` : 'Hola'}</h1>
            {esPersonal && (
              <Link className="btn btn-oro btn-sm" to="/admin">
                Ir al panel interno
              </Link>
            )}
          </div>
          <p className="texto-2 cu-intro">Tus citas, compras, servicios prepagados y documentos, en un solo lugar.</p>
        </div>
      </header>

      <div className="contenedor cu-contenido">
        <nav className="pestanas cu-pestanas" aria-label="Secciones de mi cuenta">
          {SECCIONES.map((s) => (
            <Link key={s.clave} to={`/cuenta/${s.clave}`} className="pestana cu-pestana" aria-current={actual === s.clave ? 'page' : undefined}>
              {s.texto}
            </Link>
          ))}
        </nav>

        {sinCliente && actual !== 'datos' ? (
          <div className="aviso aviso-info">
            <span>
              Esta cuenta es del equipo de Ópalo y no tiene portal de clienta.{' '}
              {esPersonal ? (
                <>
                  Usa el <Link to="/admin">panel interno</Link> para la agenda, clientas y pedidos.
                </>
              ) : null}
            </span>
          </div>
        ) : actual === 'datos' ? (
          <SeccionDatos />
        ) : actual === 'documentos' ? (
          <SeccionDocumentos />
        ) : config.cargando && !config.datos ? (
          <Cargando />
        ) : config.error || !config.datos ? (
          <MensajeError error={config.error ?? 'No pudimos cargar la información.'} onReintentar={config.recargar} />
        ) : actual === 'citas' ? (
          <SeccionCitas config={config.datos} avisoInicial={avisoInicial} />
        ) : actual === 'pedidos' ? (
          <SeccionPedidos config={config.datos} />
        ) : (
          <SeccionServicios config={config.datos} />
        )}
      </div>
    </div>
  );
}
