// Implementación real de OpaloApi con @supabase/supabase-js v2.
// El código vive en ./supabase/: errores.ts (mensajes en español), conversion.ts (filas → tipos),
// contexto.ts (ejecutar consultas y RPC), publico.ts, sesion.ts, clienta.ts y admin.ts.
import { createClient } from '@supabase/supabase-js';
import type { OpaloApi } from './tipos';
import { crearApiSupabaseCon } from './supabase/api';

export { crearApiSupabaseCon } from './supabase/api';
export { aErrorOpalo } from './supabase/errores';

export function crearApiSupabase(url: string, anonKey: string): OpaloApi {
  const sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return crearApiSupabaseCon(sb);
}
