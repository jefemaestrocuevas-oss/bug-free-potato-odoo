import { ErrorOpalo, type OpaloApi } from './tipos';

const MENSAJE =
  'El sitio todavía no está conectado a su base de datos. Escríbenos por WhatsApp al 442 170 1466 para agendar.';

/**
 * API para una compilación de producción sin VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY:
 * cualquier operación responde con un mensaje claro en vez de usar datos de ejemplo.
 */
export function crearApiSinConfigurar(): OpaloApi {
  const falla = () => Promise.reject(new ErrorOpalo(MENSAJE, 'sin_configurar'));
  const admin = new Proxy({}, { get: () => falla }) as OpaloApi['admin'];
  const base = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'modo') return 'supabase';
        if (prop === 'admin') return admin;
        if (prop === 'getSesion') return () => Promise.resolve(null);
        if (prop === 'onCambioSesion') return () => () => {};
        if (prop === 'then') return undefined;
        return falla;
      },
    },
  );
  if (typeof console !== 'undefined') console.error('[Ópalo] Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en esta compilación.');
  return base as OpaloApi;
}
