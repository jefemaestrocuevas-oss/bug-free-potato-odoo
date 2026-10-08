// Contexto compartido del adaptador: ejecutar consultas, llamar RPC y conocer a la usuaria actual.
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { ErrorOpalo } from '../tipos';
import { aErrorOpalo, MSG, MSG_SUPABASE } from './errores';
import type { Fila } from './conversion';

/** Respuesta mínima de PostgREST que usamos (data / error / count / status). */
interface Respuesta {
  data: unknown;
  error: unknown;
  count?: number | null;
  status?: number;
}

export interface OpcionesSupabase {
  /** Reloj (inyectable en pruebas). Por defecto, la hora del sistema. */
  ahora?: () => Date;
}

export interface Contexto {
  sb: SupabaseClient;
  ahora: () => Date;
  /** navigator.userAgent cuando existe (para aceptaciones y consentimientos). */
  userAgent: () => string | null;
  /** Ejecuta una consulta y devuelve `data` (lanza ErrorOpalo si hubo error). */
  ejecutar(consulta: PromiseLike<Respuesta>): Promise<unknown>;
  /** Ejecuta un select y devuelve las filas (arreglo vacío si no hay). */
  filas(consulta: PromiseLike<Respuesta>): Promise<Fila[]>;
  /** Ejecuta un select con maybeSingle() y devuelve la fila o null. */
  fila(consulta: PromiseLike<Respuesta>): Promise<Fila | null>;
  /** Ejecuta un select con { count: 'exact', head: true } y devuelve el conteo. */
  contar(consulta: PromiseLike<Respuesta>): Promise<number>;
  /** Llama una función RPC con sus parámetros p_* y devuelve lo que regresa. */
  rpc(nombre: string, args?: Record<string, unknown>): Promise<unknown>;
  /** Sesión de Supabase Auth actual (sin red salvo que haya que refrescar el token). */
  sesionAuth(): Promise<Session | null>;
  /** auth.uid() o error "Inicia sesión para continuar." */
  exigirUid(): Promise<string>;
  /** clientes.id de la usuaria actual o error "Inicia sesión para continuar." */
  miClienteId(): Promise<string>;
  /** Recuerda el clientes.id de un usuario (lo usa getSesion). */
  recordarCliente(uid: string, clienteId: string | null): void;
  /**
   * Una escritura no afectó ninguna fila (RLS la filtró o el registro ya no existe):
   * devuelve el error más útil para mostrar.
   */
  errorSinFilas(nivel: 'personal' | 'admin' | 'propio'): Promise<ErrorOpalo>;
}

export function crearContexto(sb: SupabaseClient, opciones: OpcionesSupabase = {}): Contexto {
  const ahora = opciones.ahora ?? (() => new Date());
  let cacheCliente: { uid: string; id: string | null } | null = null;

  async function correr(consulta: PromiseLike<Respuesta>): Promise<Respuesta> {
    let r: Respuesta;
    try {
      r = await consulta;
    } catch (e) {
      throw aErrorOpalo(e);
    }
    if (!r || typeof r !== 'object') throw new ErrorOpalo(MSG_SUPABASE.generico);
    if (r.error) throw aErrorOpalo(r.error, r.status);
    return r;
  }

  const ctx: Contexto = {
    sb,
    ahora,
    userAgent: () => (typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : null),

    async ejecutar(consulta) {
      return (await correr(consulta)).data;
    },

    async filas(consulta) {
      const data = (await correr(consulta)).data;
      return Array.isArray(data) ? (data as Fila[]) : data && typeof data === 'object' ? [data as Fila] : [];
    },

    async fila(consulta) {
      const data = (await correr(consulta)).data;
      if (Array.isArray(data)) return (data[0] as Fila | undefined) ?? null;
      return data && typeof data === 'object' ? (data as Fila) : null;
    },

    async contar(consulta) {
      const r = await correr(consulta);
      if (typeof r.count === 'number') return r.count;
      return Array.isArray(r.data) ? r.data.length : 0;
    },

    rpc(nombre, args) {
      return ctx.ejecutar(sb.rpc(nombre, args ?? {}));
    },

    async sesionAuth() {
      let r: Awaited<ReturnType<SupabaseClient['auth']['getSession']>>;
      try {
        r = await sb.auth.getSession();
      } catch (e) {
        throw aErrorOpalo(e);
      }
      if (r.error) throw aErrorOpalo(r.error);
      return r.data.session ?? null;
    },

    async exigirUid() {
      const s = await ctx.sesionAuth();
      if (!s?.user?.id) throw new ErrorOpalo(MSG.sesion, 'P0001');
      return s.user.id;
    },

    async miClienteId() {
      const uid = await ctx.exigirUid();
      if (cacheCliente?.uid === uid && cacheCliente.id) return cacheCliente.id;
      const f = await ctx.fila(sb.from('clientes').select('id').eq('usuario_id', uid).maybeSingle());
      const id = f?.id ? String(f.id) : null;
      cacheCliente = { uid, id };
      if (!id) throw new ErrorOpalo(MSG.sesion, 'P0001');
      return id;
    },

    recordarCliente(uid, clienteId) {
      cacheCliente = { uid, id: clienteId };
    },

    async errorSinFilas(nivel) {
      try {
        const s = await ctx.sesionAuth();
        if (!s) return new ErrorOpalo(MSG.sesion, 'P0001');
        if (nivel !== 'propio') {
          const permitido = await ctx.rpc(nivel === 'admin' ? 'es_admin' : 'es_personal');
          if (permitido !== true) return new ErrorOpalo(MSG.permiso, '42501');
        }
      } catch (e) {
        return aErrorOpalo(e);
      }
      return new ErrorOpalo(nivel === 'propio' ? MSG.sesion : MSG_SUPABASE.noExiste, 'sin_filas');
    },
  };
  return ctx;
}
