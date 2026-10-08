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
  // Endurecimiento (ESPEC §5.1)
  nacimientoReservar: 'Para reservar necesitamos tu fecha de nacimiento.',
  nacimientoFirmar: 'Para firmar necesitamos tu fecha de nacimiento.',
  maxCitas: (n: number, telefono: string) => `Ya tienes ${n} citas próximas; para agendar otra escríbenos por WhatsApp al ${telefono}.`,
  maxPedidos: (n: number) => `Tienes ${n} pedidos por pagar; págalos o cancela alguno antes de hacer otro.`,
  metodoPago: 'Elige efectivo, tarjeta o transferencia.',
  firmaInvalida: 'No pudimos leer tu firma; bórrala y vuelve a firmar.',
  nombreLargo: 'El nombre es muy largo; escríbelo en máximo 200 caracteres.',
  notasLargas: 'Las notas son muy largas; escríbelas en máximo 1000 caracteres.',
  nacimientoRegistrado: (telefono: string) =>
    `Tu fecha de nacimiento ya está registrada; si hay un error, escríbenos por WhatsApp al ${telefono}.`,
  servicioSinConsentimiento: 'Elige qué consentimiento firma la clienta para este servicio.',
  noAsistio: 'Esta cita se marcó como no asistió.',
  fichaLarga: 'Tu ficha de salud es muy larga; resume cada respuesta en máximo 2000 caracteres.',
  cantidadMinima: 'La cantidad debe ser al menos 1.',
  regaloLargo: 'El nombre de quien recibe el regalo es muy largo (máximo 120 caracteres).',
  citaCancelada: 'Esta cita está cancelada.',
  // guardar_horarios
  personalNoExiste: 'No encontramos a esa persona del equipo.',
  horarios: 'Revisa los horarios.',
  diaSemana: 'El día de la semana debe ir de 0 (domingo) a 6 (sábado).',
  horasFaltantes: 'Escribe la hora de entrada y la de salida.',
  rangoHorario: 'La salida debe ser después de la entrada.',
  horariosEncimados: (dia: string, a: string, b: string) => `Dos horarios del ${dia} se enciman (${a} y ${b}).`,
  // guardar_paquete
  paqueteNoExiste: 'No encontramos ese paquete.',
  paqueteNombre: 'Escribe el nombre del paquete.',
  paqueteSlug: 'El identificador (slug) del paquete debe tener letras o números.',
  paqueteSlugUsado: 'Ya existe otro paquete con ese identificador (slug).',
  paqueteTipo: 'Elige si el paquete es combo o bono.',
  precio: 'Revisa el precio.',
  precioNegativo: 'El precio no puede ser negativo.',
  duracion: 'Revisa la duración: minutos enteros, cero o más.',
  vigencia: 'Revisa la vigencia: días enteros, uno o más.',
  paqueteSinServicios: 'Agrega al menos un servicio al paquete.',
  paqueteServicioNoExiste: 'Uno de los servicios del paquete no existe.',
  bonoUnServicio: 'Un bono es de un solo servicio: elige sólo uno y cuántas sesiones incluye.',
  // guardar_receta
  servicioNoExiste: 'No encontramos ese servicio.',
  receta: 'Revisa la receta.',
  recetaProductoNoExiste: 'Uno de los productos de la receta no existe.',
  recetaCantidad: 'La cantidad de cada producto debe ser mayor a cero.',
  // registrar_pago
  pagoSinDestino: 'Indica el pedido o la cita que se está pagando.',
  metodoPagoFalta: 'Elige el método de pago.',
  // registrar_compra y ajustar_inventario
  proveedorNoExiste: 'No encontramos ese proveedor.',
  compraProductoNoExiste: 'Uno de los productos de la compra no existe.',
  compraPresentaciones: 'Las presentaciones compradas deben ser más de cero.',
  costoNegativo: 'El costo no puede ser negativo.',
  soloAjusteMerma: 'Sólo se registran ajustes o mermas.',
  // publicar_politica
  politicaDatos: 'Escribe el título y el contenido de la política.',
  // Firma en el spa (ESPEC §9)
  firmaEnSpa: 'La firma se hace en el spa, el día de tu cita.',
  // Tienda, mostrador y entregas (ESPEC §10.1 y §10.3)
  noALaVenta: 'Uno de los productos ya no está a la venta.',
  sinExistencias: (nombre: string) => `Por ahora no tenemos ${nombre}.`,
  pocasExistencias: (n: number, nombre: string) =>
    n === 1 ? `Por ahora sólo queda 1 pieza de ${nombre}.` : `Por ahora sólo quedan ${n} piezas de ${nombre}.`,
  serviciosSinClienta: 'Para vender servicios prepagados elige a la clienta.',
  pedidoNoPagado: 'Este pedido todavía no está pagado.',
  pedidoSinProductos: 'Este pedido no tiene productos que entregar.',
  porPieza: 'Los jabones, velas y sets se manejan por pieza: unidad "pz" y contenido 1.',
  productoSlug: 'El identificador (slug) del producto debe tener letras o números.',
  productoSlugUsado: 'Ya existe otro producto con ese identificador (slug).',
  // Taller: fórmulas y lotes (ESPEC §10.2)
  insumoNoExiste: (de: 'de la fórmula' | 'del lote') => `Uno de los insumos ${de} no existe.`,
  insumoPropio: 'Un producto no puede ser insumo de sí mismo: elige la materia prima que lleva.',
  insumoCantidad: 'La cantidad de cada insumo debe ser mayor a cero.',
  formulaNombre: 'Escribe el nombre de la fórmula.',
  formulaNoExiste: 'No encontramos esa fórmula.',
  formulaProducto: 'Elige el producto que se elabora con esta fórmula.',
  rendimiento: 'Revisa el rendimiento: cuántas piezas salen de un lote (más de cero).',
  diasCurado: 'Revisa los días de curado: días enteros, cero o más.',
  instruccionesLargas: 'Las instrucciones son muy largas; escríbelas en máximo 5000 caracteres.',
  formulaSinInsumos: 'Agrega al menos un insumo a la fórmula.',
  formulaOtroProducto: 'Esa fórmula es de otro producto.',
  loteSinMateriales: 'Elige la fórmula o escribe los insumos que usaste.',
  jabonSinFormula: 'Los jabones necesitan una fórmula con sus días de curado; elígela o créala primero.',
  lotePiezasFalta: 'Escribe cuántas piezas salen del lote.',
  lotePiezas: 'Revisa las piezas: más de cero.',
  elaboracionFutura: 'La fecha de elaboración no puede ser futura.',
  caducidad: 'La caducidad debe ser después de la elaboración.',
  formulaVacia: 'La fórmula no tiene insumos.',
  noAlcanza: (nombre: string, hay: string, necesita: string, unidad: string) =>
    `No alcanza el inventario de ${nombre}: hay ${hay} ${unidad} y se necesitan ${necesita} ${unidad}.`,
  piezasObtenidas: 'Revisa las piezas obtenidas: más de cero.',
  loteNoExiste: 'No encontramos ese lote.',
  loteLiberado: 'Este lote ya se liberó.',
  loteDescartado: 'Este lote se descartó.',
  loteEnCurado: (fecha: string) => `Este lote sigue en curado hasta el ${fecha}.`,
  motivoDescarte: 'Escribe por qué se descarta el lote.',
} as const;

/** Límites del endurecimiento (ESPEC §5.1), iguales a las constantes de SQL. */
export const LIMITES = {
  citasProximas: 3,
  pedidosPorPagar: 5,
  cantidadMaxima: 99,
  firmaSvg: 200_000,
  nombre: 200,
  notas: 1000,
  campoFicha: 2000,
  jsonFicha: 20_000,
  regaloPara: 120,
  instrucciones: 5000,
  /** Piezas de un lote o rendimiento de una fórmula: menos de 100 000 000 (numeric(10,2)). */
  piezas: 100_000_000,
  /** Cantidad de un insumo: menos de 1 000 000 000 (numeric(12,3)). */
  cantidadInsumo: 1_000_000_000,
  diasCurado: 3650,
} as const;

/** Mensajes propios de la demo para casos que el contrato no nombra. */
export const MSG_EXTRA = {
  credenciales: 'Correo o contraseña incorrectos.',
  correoInvalido: 'Escribe un correo electrónico válido.',
  correoUsado: 'Ya existe una cuenta con ese correo. Inicia sesión.',
  password: 'La contraseña debe tener al menos 8 caracteres.',
  nombre: 'Escribe tu nombre.',
  citaNoExiste: 'No encontramos esa cita.',
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
  productoNoExiste: 'No encontramos ese producto.',
  compraVacia: 'Agrega al menos un producto a la compra.',
  cantidadCero: 'La cantidad no puede ser cero.',
  slugUsado: 'Ya existe otro registro con ese identificador (slug).',
  datoFaltante: 'Faltan datos obligatorios.',
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
