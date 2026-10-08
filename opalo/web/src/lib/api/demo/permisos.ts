// Contexto de ejecución, mensajes canónicos y permisos por rol (cliente / personal / admin).
import type { Rol } from '../tipos';
import type { ClienteFila, Db, UsuarioFila } from './modelo';
import { falla } from './utilidades';

/** Lo que una "función del servidor" ve al ejecutarse. */
export interface Ctx {
  db: Db;
  /** Hora real del sistema (inyectable en pruebas). */
  ahora: Date;
  /** auth.uid() */
  usuarioId: string | null;
  userAgent: string | null;
}

/** Mensajes canónicos: idénticos en SQL y en la demo. */
export const MSG = {
  sesion: 'Inicia sesión para continuar.',
  politicas: 'Antes de reservar necesitas aceptar los términos, el aviso de privacidad y la política de cancelación.',
  ficha: 'Antes de reservar necesitas llenar tu ficha de salud.',
  datosSensibles: 'Para guardar tu ficha de salud necesitamos tu consentimiento expreso para tratar datos de salud.',
  edadMinima: (anios: number) => `Atendemos a partir de los ${anios} años.`,
  tutor: 'Por ser menor de edad, escribe el nombre de mamá, papá o tutor que te acompañará.',
  firma: 'Falta tu firma o tu nombre completo.',
  ocupado: 'Ese horario se acaba de ocupar, elige otro.',
  noDisponible: 'Ese horario no está disponible.',
  noReservable: 'Uno de los servicios elegidos no se puede reservar en línea.',
  complementos: 'Los complementos se agregan a un servicio; elige al menos un servicio.',
  sinServicios: 'Elige al menos un servicio.',
  cancelarTarde: (horas: number, telefono: string) =>
    `Faltan menos de ${horas} horas para tu cita. Escríbenos por WhatsApp al ${telefono}.`,
  noCancelable: 'Esta cita ya no se puede cancelar.',
  sinConsentimiento: 'Sin consentimiento firmado no hay servicio: pide a la clienta que firme primero.',
  noVendible: 'Uno de los productos ya no está disponible para compra en línea.',
  credito: 'Ese crédito no es válido o ya se usó.',
  regalo: 'Ese código de regalo no existe o ya se canjeó.',
  permiso: 'No tienes permiso para hacer esto.',
} as const;

/** Mensajes propios de la demo para casos que el contrato no nombra. */
export const MSG_EXTRA = {
  credenciales: 'Correo o contraseña incorrectos.',
  correoInvalido: 'Escribe un correo electrónico válido.',
  correoUsado: 'Ya existe una cuenta con ese correo. Inicia sesión.',
  password: 'Tu contraseña debe tener al menos 6 caracteres.',
  nombre: 'Escribe tu nombre.',
  citaNoExiste: 'No encontramos esa cita.',
  citaNoFirmable: 'Esta cita ya no admite firmas.',
  citaCancelada: 'Esta cita está cancelada; agenda una nueva.',
  citaCompletada: 'Esta cita ya se completó.',
  clienteNoExiste: 'No encontramos a esa clienta.',
  clienteCorreoUsado: 'Ya hay una clienta registrada con ese correo.',
  pedidoNoExiste: 'No encontramos ese pedido.',
  pedidoNoCancelable: 'Este pedido ya no se puede cancelar.',
  pedidoCancelado: 'Ese pedido está cancelado.',
  carritoVacio: 'Tu carrito está vacío.',
  cantidad: 'Revisa las cantidades.',
  monto: 'El monto debe ser mayor a cero.',
  propina: 'La propina no puede ser negativa.',
  pagoSinDestino: 'Indica el pedido o la cita de este pago.',
  productoNoExiste: 'No encontramos ese producto.',
  compraVacia: 'Agrega al menos un producto a la compra.',
  cantidadCero: 'La cantidad no puede ser cero.',
  slugUsado: 'Ya existe otro registro con ese identificador (slug).',
  datoFaltante: 'Faltan datos obligatorios.',
  rangoHorario: 'La hora de salida debe ser después de la de entrada.',
  rangoBloqueo: 'El fin del bloqueo debe ser después del inicio.',
  noExiste: 'Ese registro ya no existe.',
} as const;

export function usuarioActual(ctx: Ctx): UsuarioFila | null {
  if (!ctx.usuarioId) return null;
  return ctx.db.usuarios.find((u) => u.id === ctx.usuarioId) ?? null;
}

/** public.mi_rol(): cliente si no hay perfil; null si anon. */
export function miRol(ctx: Ctx): Rol | null {
  const u = usuarioActual(ctx);
  if (!u) return null;
  return ctx.db.perfiles.find((p) => p.id === u.id)?.rol ?? 'cliente';
}

export function esPersonal(ctx: Ctx): boolean {
  const r = miRol(ctx);
  return r === 'personal' || r === 'admin';
}

export function esAdmin(ctx: Ctx): boolean {
  return miRol(ctx) === 'admin';
}

export function exigirSesion(ctx: Ctx): UsuarioFila {
  const u = usuarioActual(ctx);
  if (!u) falla(MSG.sesion);
  return u;
}

export function exigirPersonal(ctx: Ctx): UsuarioFila {
  const u = exigirSesion(ctx);
  if (!esPersonal(ctx)) falla(MSG.permiso);
  return u;
}

export function exigirAdmin(ctx: Ctx): UsuarioFila {
  const u = exigirSesion(ctx);
  if (!esAdmin(ctx)) falla(MSG.permiso);
  return u;
}

/** public.mi_cliente_id() como fila (o null). */
export function miClienteOpcional(ctx: Ctx): ClienteFila | null {
  if (!ctx.usuarioId) return null;
  return ctx.db.clientes.find((c) => c.usuario_id === ctx.usuarioId) ?? null;
}

/** Sesión con fila en clientes; si no, "Inicia sesión para continuar." */
export function miCliente(ctx: Ctx): ClienteFila {
  exigirSesion(ctx);
  const c = miClienteOpcional(ctx);
  if (!c) falla(MSG.sesion);
  return c;
}
