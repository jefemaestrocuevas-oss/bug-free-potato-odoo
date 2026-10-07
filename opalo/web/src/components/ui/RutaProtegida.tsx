import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from '../../lib/sesion';
import { Cargando } from './Estado';

/** Exige sesión; con `personal` exige rol personal/admin; con `admin`, rol admin. */
export function RutaProtegida({ children, personal = false, admin = false }: { children: ReactNode; personal?: boolean; admin?: boolean }) {
  const { sesion, cargando, esPersonal, esAdmin } = useSesion();
  const loc = useLocation();
  if (cargando) return <Cargando />;
  if (!sesion) return <Navigate to={`/entrar?volver=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (admin && !esAdmin) return <Navigate to="/admin" replace />;
  if (personal && !esPersonal) return <Navigate to="/cuenta" replace />;
  return <>{children}</>;
}
