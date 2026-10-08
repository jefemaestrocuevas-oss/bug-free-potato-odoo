// Sesión: Supabase Auth + perfiles.rol + la fila de clientes de la usuaria.
import type { Session } from '@supabase/supabase-js';
import { ErrorOpalo, type OpaloApi, type Rol, type Sesion } from '../tipos';
import { aCliente, COLUMNAS_CLIENTE, limpio } from './conversion';
import type { Contexto } from './contexto';
import { aErrorOpalo, MSG_SUPABASE } from './errores';

type ApiSesion = Pick<
  OpaloApi,
  'getSesion' | 'onCambioSesion' | 'iniciarSesion' | 'registrarse' | 'cerrarSesion' | 'recuperarPassword'
>;

const ROLES: Rol[] = ['cliente', 'personal', 'admin'];

/** Largo mínimo de contraseña (configúralo igual en Supabase Auth → Password min length). */
export const PASSWORD_MIN = 8;

function origen(): string | undefined {
  try {
    return typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined;
  } catch {
    return undefined;
  }
}

export function crearApiSesion(ctx: Contexto): ApiSesion {
  const { sb } = ctx;

  /** Combina la sesión de Auth con el rol (perfiles) y la clienta (clientes.usuario_id = uid). */
  async function construirSesion(s: Session | null): Promise<Sesion | null> {
    const uid = s?.user?.id;
    if (!s || !uid) return null;
    const [perfil, cliente] = await Promise.all([
      ctx.fila(sb.from('perfiles').select('rol').eq('id', uid).maybeSingle()),
      ctx.fila(sb.from('clientes').select(COLUMNAS_CLIENTE).eq('usuario_id', uid).maybeSingle()),
    ]);
    const rol = ROLES.includes(perfil?.rol as Rol) ? (perfil?.rol as Rol) : 'cliente';
    const c = cliente ? aCliente(cliente) : null;
    ctx.recordarCliente(uid, c?.id ?? null);
    return { user_id: uid, email: s.user.email ?? null, rol, cliente: c };
  }

  return {
    async getSesion() {
      return construirSesion(await ctx.sesionAuth());
    },

    onCambioSesion(cb) {
      let turno = 0;
      let activo = true;
      const { data } = sb.auth.onAuthStateChange((_evento, session) => {
        const mio = ++turno;
        // Supabase recomienda no llamar a otras funciones de Supabase dentro del callback
        // (puede bloquearse esperando el candado de la sesión): se difiere al siguiente ciclo.
        setTimeout(() => {
          if (!activo || mio !== turno) return;
          construirSesion(session).then(
            (s) => {
              if (activo && mio === turno) cb(s);
            },
            (e: unknown) => {
              // Sin red u otro error al leer el perfil: se conserva la sesión anterior.
              if (typeof console !== 'undefined') console.warn('[Ópalo] No se pudo leer la sesión:', e);
            },
          );
        }, 0);
      });
      return () => {
        activo = false;
        data?.subscription?.unsubscribe();
      };
    },

    async iniciarSesion(email, password) {
      let r: Awaited<ReturnType<typeof sb.auth.signInWithPassword>>;
      try {
        r = await sb.auth.signInWithPassword({ email: email.trim(), password });
      } catch (e) {
        throw aErrorOpalo(e);
      }
      if (r.error) throw aErrorOpalo(r.error);
      const s = await construirSesion(r.data.session);
      if (!s) throw new ErrorOpalo(MSG_SUPABASE.correoSinConfirmar, 'email_not_confirmed');
      return s;
    },

    async registrarse(datos) {
      if ((datos.password ?? '').length < PASSWORD_MIN) throw new ErrorOpalo(MSG_SUPABASE.passwordDebil, 'weak_password');
      const redirect = origen();
      let r: Awaited<ReturnType<typeof sb.auth.signUp>>;
      try {
        r = await sb.auth.signUp({
          email: datos.email.trim(),
          password: datos.password,
          options: {
            // El trigger public.tg_nuevo_usuario() crea el perfil y la clienta con estos datos.
            data: {
              nombre: (datos.nombre ?? '').trim(),
              apellidos: limpio(datos.apellidos),
              telefono: limpio(datos.telefono),
              fecha_nacimiento: limpio(datos.fecha_nacimiento),
            },
            ...(redirect ? { emailRedirectTo: redirect } : {}),
          },
        });
      } catch (e) {
        throw aErrorOpalo(e);
      }
      if (r.error) throw aErrorOpalo(r.error);
      const user = r.data.user;
      // Con confirmación de correo activa, Supabase no revela si el correo ya existía:
      // responde un usuario sin identidades.
      if (user && Array.isArray(user.identities) && user.identities.length === 0)
        throw new ErrorOpalo(MSG_SUPABASE.cuentaExiste, 'user_already_exists');
      if (!r.data.session) return null; // hay que confirmar el correo
      return construirSesion(r.data.session);
    },

    async cerrarSesion() {
      try {
        const { error } = await sb.auth.signOut();
        if (!error) return;
      } catch {
        // sigue abajo
      }
      // Sin red (o el servidor no respondió): al menos se borra la sesión de este navegador.
      try {
        await sb.auth.signOut({ scope: 'local' });
      } catch {
        // Nada más que hacer.
      }
    },

    async recuperarPassword(email) {
      const redirect = origen();
      let r: Awaited<ReturnType<typeof sb.auth.resetPasswordForEmail>>;
      try {
        r = await sb.auth.resetPasswordForEmail(email.trim(), redirect ? { redirectTo: redirect } : undefined);
      } catch (e) {
        throw aErrorOpalo(e);
      }
      if (r.error) throw aErrorOpalo(r.error);
    },
  };
}
