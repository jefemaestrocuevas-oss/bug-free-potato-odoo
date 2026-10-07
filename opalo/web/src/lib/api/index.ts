import type { OpaloApi } from './tipos';
import { crearApiDemo } from './demo';
import { crearApiSupabase } from './supabase';

export * from './tipos';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Punto único de acceso a datos. Sin credenciales de Supabase, el sitio usa el modo demostración. */
export const api: OpaloApi = url && anonKey ? crearApiSupabase(url, anonKey) : crearApiDemo();
