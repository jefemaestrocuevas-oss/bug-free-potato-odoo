import type { OpaloApi } from './tipos';
import { crearApiDemo } from './demo';
import { crearApiSupabase } from './supabase';
import { crearApiSinConfigurar } from './sinConfigurar';

export * from './tipos';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// El modo demostración sólo se usa a propósito: en desarrollo (npm run dev) o con
// `--mode demo` (vista previa). Una compilación de producción sin las variables de
// Supabase NO cae en demo: muestra que el sitio no está configurado, para que nadie
// reserve ni compre en una base de mentira sin darse cuenta.
const demoPermitido = import.meta.env.DEV || import.meta.env.MODE === 'demo' || import.meta.env.MODE === 'test';

/** Punto único de acceso a datos. */
export const api: OpaloApi =
  url && anonKey ? crearApiSupabase(url, anonKey) : demoPermitido ? crearApiDemo() : crearApiSinConfigurar();
