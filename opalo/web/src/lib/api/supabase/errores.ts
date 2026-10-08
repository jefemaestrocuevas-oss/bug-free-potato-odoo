// Traducción de errores de Supabase (PostgREST, Postgres y Auth) a ErrorOpalo en español.
// Las RPC de la base ya lanzan mensajes en español con errcode P0001: se muestran tal cual.
import { ErrorOpalo } from '../tipos';

/** Mensajes canónicos (idénticos a los de la base y del modo demostración). */
export const MSG = {
  sesion: 'Inicia sesión para continuar.',
  ocupado: 'Ese horario se acaba de ocupar, elige otro.',
  permiso: 'No tienes permiso para hacer esto.',
} as const;

/** Mensajes propios del adaptador (casos que el contrato no nombra). */
export const MSG_SUPABASE = {
  credenciales: 'Correo o contraseña incorrectos.',
  cuentaExiste: 'Ya existe una cuenta con ese correo.',
  correoSinConfirmar: 'Confirma tu correo con el enlace que te enviamos y vuelve a entrar.',
  passwordDebil: 'La contraseña debe tener al menos 8 caracteres.',
  red: 'No pudimos conectar. Revisa tu internet e intenta de nuevo.',
  demasiadosIntentos: 'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.',
  correoInvalido: 'Escribe un correo electrónico válido.',
  registroCerrado: 'Por ahora no es posible crear cuentas en línea. Escríbenos por WhatsApp al 442 170 1466.',
  enlaceVencido: 'El enlace ya venció. Pide uno nuevo.',
  cuentaSuspendida: 'Tu cuenta está suspendida. Escríbenos por WhatsApp al 442 170 1466.',
  tardo: 'La operación tardó demasiado. Intenta de nuevo.',
  clienteCorreoUsado: 'Ya hay una clienta registrada con ese correo.',
  slugUsado: 'Ya existe otro registro con ese identificador (slug).',
  duplicado: 'Ya existe un registro con esos datos.',
  enUso: 'No se puede eliminar porque hay otros registros que dependen de él.',
  referenciaRota: 'Uno de los datos elegidos ya no existe.',
  datoInvalido: 'Revisa los datos: hay un valor que no es válido.',
  datoFaltante: 'Faltan datos obligatorios.',
  noExiste: 'Ese registro ya no existe.',
  generico: 'Algo salió mal. Intenta de nuevo.',
} as const;

interface ErrorCrudo {
  code: string;
  message: string;
  details: string;
  name: string;
  status: number | undefined;
  esAuth: boolean;
}

function crudo(e: unknown): ErrorCrudo {
  const o = e !== null && typeof e === 'object' ? (e as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
  const name = str(o.name);
  return {
    code: str(o.code),
    message: typeof e === 'string' ? e : str(o.message),
    details: [str(o.details), str(o.hint)].filter(Boolean).join(' '),
    name,
    status: typeof o.status === 'number' ? o.status : undefined,
    esAuth: o.__isAuthError === true || name.startsWith('Auth'),
  };
}

const RE_RED =
  /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_network|err_internet_disconnected|econnrefused|econnreset|enotfound|etimedout|eai_again|socket hang up|aborterror|timeouterror|the network connection was lost/i;

/** ¿Es un problema de conexión (sin internet, servidor caído, petición abortada)? */
export function esErrorDeRed(e: unknown, status?: number): boolean {
  const c = crudo(e);
  if (c.name === 'AuthRetryableFetchError') return true;
  if (c.code === 'P0001') return false;
  if (status === 0 || (c.esAuth && c.status === 0)) return true;
  if (c.status !== undefined && [502, 503, 504, 520, 521, 522, 523, 524].includes(c.status)) return true;
  if (status !== undefined && [502, 503, 504, 520, 521, 522, 523, 524].includes(status)) return true;
  if (RE_RED.test(`${c.name}: ${c.message}`)) return true;
  if (c.name === 'TypeError' && /fetch|network/i.test(c.message)) return true;
  return false;
}

function errorDeAuth(c: ErrorCrudo): ErrorOpalo | null {
  const m = c.message.toLowerCase();
  const code = c.code;
  if (code === 'invalid_credentials' || m.includes('invalid login credentials') || m.includes('invalid credentials'))
    return new ErrorOpalo(MSG_SUPABASE.credenciales, code || 'invalid_credentials');
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    code === 'identity_already_exists' ||
    m.includes('already registered') ||
    m.includes('already been registered') ||
    m.includes('user already exists')
  )
    return new ErrorOpalo(MSG_SUPABASE.cuentaExiste, code || 'user_already_exists');
  if (code === 'email_not_confirmed' || m.includes('email not confirmed'))
    return new ErrorOpalo(MSG_SUPABASE.correoSinConfirmar, 'email_not_confirmed');
  if (
    code === 'weak_password' ||
    c.name === 'AuthWeakPasswordError' ||
    m.includes('password should be') ||
    m.includes('password is too weak') ||
    m.includes('weak password') ||
    m.includes('password must be')
  )
    return new ErrorOpalo(MSG_SUPABASE.passwordDebil, 'weak_password');
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || code === 'over_sms_send_rate_limit' || c.status === 429 || m.includes('rate limit'))
    return new ErrorOpalo(MSG_SUPABASE.demasiadosIntentos, code || 'rate_limit');
  if (code === 'email_address_invalid' || (code === 'validation_failed' && m.includes('email')) || m.includes('unable to validate email') || m.includes('invalid email'))
    return new ErrorOpalo(MSG_SUPABASE.correoInvalido, code || 'email_address_invalid');
  if (code === 'signup_disabled' || code === 'email_provider_disabled' || m.includes('signups not allowed'))
    return new ErrorOpalo(MSG_SUPABASE.registroCerrado, code || 'signup_disabled');
  if (code === 'otp_expired' || code === 'flow_state_expired' || m.includes('link is invalid or has expired'))
    return new ErrorOpalo(MSG_SUPABASE.enlaceVencido, code || 'otp_expired');
  if (code === 'user_banned') return new ErrorOpalo(MSG_SUPABASE.cuentaSuspendida, code);
  if (
    c.name === 'AuthSessionMissingError' ||
    [
      'session_not_found',
      'session_expired',
      'refresh_token_not_found',
      'refresh_token_already_used',
      'bad_jwt',
      'no_authorization',
      'user_not_found',
    ].includes(code)
  )
    return new ErrorOpalo(MSG.sesion, code || 'session_missing');
  return null;
}

function errorDePostgres(c: ErrorCrudo): ErrorOpalo | null {
  const texto = `${c.message} ${c.details}`;
  switch (c.code) {
    case '23505':
      if (/clientes_email_unico|lower\(email\)/i.test(texto)) return new ErrorOpalo(MSG_SUPABASE.clienteCorreoUsado, c.code);
      if (/slug/i.test(texto)) return new ErrorOpalo(MSG_SUPABASE.slugUsado, c.code);
      return new ErrorOpalo(MSG_SUPABASE.duplicado, c.code);
    case '23503':
      if (/update or delete|still referenced/i.test(texto)) return new ErrorOpalo(MSG_SUPABASE.enUso, c.code);
      return new ErrorOpalo(MSG_SUPABASE.referenciaRota, c.code);
    case '23502':
      return new ErrorOpalo(MSG_SUPABASE.datoFaltante, c.code);
    case '23514':
    case '22P02':
    case '22001':
    case '22003':
    case '22007':
    case '22008':
    case '22023':
    case '22004':
      return new ErrorOpalo(MSG_SUPABASE.datoInvalido, c.code);
    case '57014':
      return new ErrorOpalo(MSG_SUPABASE.tardo, c.code);
    case 'PGRST116':
      return new ErrorOpalo(MSG_SUPABASE.noExiste, c.code);
    case 'PGRST301':
    case 'PGRST302':
    case 'PGRST303':
      return new ErrorOpalo(MSG.sesion, c.code);
    default:
      if (/jwt expired/i.test(texto)) return new ErrorOpalo(MSG.sesion, c.code || 'PGRST301');
      return null;
  }
}

/**
 * Convierte cualquier error (de supabase-js, de fetch o propio) en ErrorOpalo con un mensaje
 * listo para mostrarse. `status` es el estado HTTP de la respuesta de PostgREST cuando se conoce.
 */
export function aErrorOpalo(e: unknown, status?: number): ErrorOpalo {
  if (e instanceof ErrorOpalo) return e;
  const c = crudo(e);

  // 1. Reglas de negocio de la base: el mensaje ya viene en español.
  if (c.code === 'P0001' && c.message.trim()) return new ErrorOpalo(c.message.trim(), 'P0001');

  // 2. Dos citas activas en el mismo horario (exclusion_violation).
  if (c.code === '23P01') return new ErrorOpalo(MSG.ocupado, '23P01');

  // 3. Permisos: privilegios de Postgres o RLS.
  if (c.code === '42501' || /row-level security|permission denied/i.test(c.message))
    return new ErrorOpalo(MSG.permiso, '42501');

  // 4. Conexión.
  if (esErrorDeRed(e, status)) return new ErrorOpalo(MSG_SUPABASE.red, 'red');

  // 5. Supabase Auth.
  if (c.esAuth || /^[a-z_]+$/.test(c.code)) {
    const auth = errorDeAuth(c);
    if (auth) return auth;
  }

  // 6. Otros errores de Postgres / PostgREST con traducción conocida.
  const pg = errorDePostgres(c);
  if (pg) return pg;

  if (typeof console !== 'undefined') console.error('[Ópalo] Error no traducido de Supabase:', e);
  return new ErrorOpalo(MSG_SUPABASE.generico, c.code || undefined);
}
