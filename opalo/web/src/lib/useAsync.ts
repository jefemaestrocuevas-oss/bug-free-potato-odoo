import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { mensajeError } from './format';

export interface EstadoAsync<T> {
  datos: T | undefined;
  error: string | null;
  cargando: boolean;
  recargar: () => void;
}

/** Ejecuta una función async al montar (y cuando cambian deps). */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList = []): EstadoAsync<T> {
  const [datos, setDatos] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [n, setN] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    fnRef
      .current()
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(mensajeError(e)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);

  const recargar = useCallback(() => setN((x) => x + 1), []);
  return { datos, error, cargando, recargar };
}

/** Envuelve una acción async (botón) con estado de "enviando" y error. */
export function useAccion<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ejecutar = async (...args: A): Promise<R | undefined> => {
    setEnviando(true);
    setError(null);
    try {
      return await fn(...args);
    } catch (e) {
      setError(mensajeError(e));
      return undefined;
    } finally {
      setEnviando(false);
    }
  };
  return { ejecutar, enviando, error, setError };
}
