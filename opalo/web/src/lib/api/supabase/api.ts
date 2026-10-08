// OpaloApi sobre Supabase (PostgreSQL + Auth + RLS + RPC). Contrato: opalo/docs/ESPEC.md.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OpaloApi } from '../tipos';
import { crearApiAdmin } from './admin';
import { crearApiClienta } from './clienta';
import { crearContexto, type OpcionesSupabase } from './contexto';
import { crearApiPublica } from './publico';
import { crearApiSesion } from './sesion';

export type { OpcionesSupabase } from './contexto';

/** Arma la API con un cliente de Supabase ya creado (las pruebas pasan uno simulado). */
export function crearApiSupabaseCon(sb: SupabaseClient, opciones: OpcionesSupabase = {}): OpaloApi {
  const ctx = crearContexto(sb, opciones);
  return {
    modo: 'supabase',
    ...crearApiPublica(ctx),
    ...crearApiSesion(ctx),
    ...crearApiClienta(ctx),
    admin: crearApiAdmin(ctx),
  };
}
