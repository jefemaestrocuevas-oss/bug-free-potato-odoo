import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Sesion } from './api';

interface ValorSesion {
  sesion: Sesion | null;
  cargando: boolean;
  /** Vuelve a leer la sesión (p. ej. después de actualizar datos). */
  refrescar: () => Promise<void>;
  esPersonal: boolean;
  esAdmin: boolean;
}

const Ctx = createContext<ValorSesion | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [cargando, setCargando] = useState(true);

  const refrescar = async () => {
    setSesion(await api.getSesion());
  };

  useEffect(() => {
    let vivo = true;
    api
      .getSesion()
      .then((s) => vivo && setSesion(s))
      .finally(() => vivo && setCargando(false));
    const quitar = api.onCambioSesion((s) => vivo && setSesion(s));
    return () => {
      vivo = false;
      quitar();
    };
  }, []);

  const esPersonal = sesion?.rol === 'personal' || sesion?.rol === 'admin';
  const esAdmin = sesion?.rol === 'admin';
  return <Ctx.Provider value={{ sesion, cargando, refrescar, esPersonal, esAdmin }}>{children}</Ctx.Provider>;
}

export function useSesion(): ValorSesion {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSesion fuera de SesionProvider');
  return v;
}
