import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type Sesion } from './api';
import { borrarEstado } from '../components/reserva/estado';

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
  const usuarioPrevio = useRef<string | null>(null);

  // Al cerrar sesión o cambiar de usuaria se borra el borrador de reserva de este navegador
  // (de null a alguien no: iniciar sesión a mitad de la reserva debe conservarlo).
  const aplicar = (s: Sesion | null) => {
    const nuevo = s?.user_id ?? null;
    if (usuarioPrevio.current && usuarioPrevio.current !== nuevo) borrarEstado();
    usuarioPrevio.current = nuevo;
    setSesion(s);
  };

  const refrescar = async () => {
    aplicar(await api.getSesion());
  };

  useEffect(() => {
    let vivo = true;
    api
      .getSesion()
      .then((s) => vivo && aplicar(s))
      .finally(() => vivo && setCargando(false));
    const quitar = api.onCambioSesion((s) => vivo && aplicar(s));
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
