// "Servidor" del modo demostración: las RPC y escrituras de ESPEC §5–§6 con las reglas R1–R13.
// Cada función recibe un Ctx (base, hora real, usuario) y lanza ErrorOpalo con el mensaje canónico.
import { diaSemana, edad, fechaLocal, inicioMes, isoDesdeLocal, sumarDias, telefonoBonito } from '../../format';
import {
  POLITICAS_GENERALES,
  type CapacitacionEditable,
  type CategoriaProducto,
  type DatosCliente,
  type DatosFirma,
  type EstadoCita,
  type FichaSalud,
  type FrecuenciaGasto,
  type GastoEditable,
  type GastoRecurrenteEditable,
  type Horario,
  type ItemPedidoNuevo,
  type ItemReserva,
  CATEGORIAS_TIENDA,
  type MetodoPago,
  type NuevaCompra,
  type NuevoCliente,
  type NuevoPago,
  type OrigenCita,
  type OrigenPedido,
  type PaqueteEditable,
  type PersonalEditable,
  type ProductoEditable,
  type Proveedor,
  type RecetaItem,
  type ResultadoPedido,
  type ResultadoReserva,
  type Rol,
  type ServicioEditable,
  type Slot,
  type SolicitudReserva,
  type SolicitudReservaStaff,
  type TipoItemPedido,
  type TipoMovimiento,
  type TipoPolitica,
  type BloqueoAgenda,
  type VentaMostrador,
} from '../tipos';
import type {
  CabinaFila,
  CanalFirma,
  CitaFila,
  ClienteFila,
  CreditoFila,
  Db,
  FichaFila,
  MovimientoFila,
  PaqueteFila,
  PedidoFila,
  ProductoFila,
  ProveedorFila,
  ServicioFila,
  UsuarioFila,
} from './modelo';
import {
  type Ctx,
  esPersonal,
  exigirAdmin,
  exigirPersonal,
  exigirSesion,
  LIMITES,
  miCliente,
  miClienteOpcional,
  MSG,
  MSG_EXTRA,
} from './permisos';
import {
  colorHex,
  emailValido,
  esFecha,
  falla,
  fechaEnMes,
  firmaValida,
  iso,
  ms,
  MS_HORA,
  MS_MIN,
  numeroOpcional,
  redondear,
  slugDe,
  sumarMeses,
  codigoRegalo,
  sha256,
  textoONulo,
  traslapan,
  uuid,
} from './utilidades';
import {
  citaActiva,
  costoUnitario,
  fichaVigenteFila,
  ORDEN_POLITICAS,
  pagadoPedido,
  politicaActiva,
} from './vistas';

const ahoraIso = (ctx: Ctx) => ctx.ahora.toISOString();
const hoyDe = (ctx: Ctx) => fechaLocal(ctx.ahora);
/** WhatsApp de la configuración, legible ('442 170 1466'), como public.telefono_legible. */
const telefonoWhatsApp = (db: Db) => telefonoBonito(db.configuracion.telefono_whatsapp) || '442 170 1466';

// ======================================================================
// Usuarios (auth.users + trigger tg_nuevo_usuario)
// ======================================================================

export interface DatosNuevoUsuario {
  email: string;
  password: string;
  rol?: Rol;
  nombre: string;
  apellidos?: string | null;
  telefono?: string | null;
  fecha_nacimiento?: string | null;
}

/** Mínimo de la contraseña, igual que el adaptador de Supabase y el formulario de registro. */
const PASSWORD_MIN = 8;

/** Crea el usuario, su perfil y crea o vincula su fila de clientes (como el trigger). */
export function crearUsuario(ctx: Ctx, d: DatosNuevoUsuario): UsuarioFila {
  const { db } = ctx;
  const email = (d.email ?? '').trim().toLowerCase();
  if (!emailValido(email)) falla(MSG_EXTRA.correoInvalido);
  if ((d.password ?? '').length < PASSWORD_MIN) falla(MSG_EXTRA.password);
  if (!(d.nombre ?? '').trim()) falla(MSG_EXTRA.nombre);
  if (db.usuarios.some((u) => u.email === email)) falla(MSG_EXTRA.correoUsado);
  const t = ahoraIso(ctx);
  const u: UsuarioFila = { id: uuid(), email, password: d.password, creado_en: t };
  db.usuarios.push(u);
  db.perfiles.push({ id: u.id, rol: d.rol ?? 'cliente', creado_en: t });
  const existente = db.clientes.find((c) => c.usuario_id === null && (c.email ?? '').toLowerCase() === email);
  if (existente) {
    existente.usuario_id = u.id;
    existente.apellidos ??= textoONulo(d.apellidos);
    existente.telefono ??= textoONulo(d.telefono);
    existente.fecha_nacimiento ??= textoONulo(d.fecha_nacimiento);
    existente.actualizado_en = t;
  } else {
    db.clientes.push({
      id: uuid(),
      usuario_id: u.id,
      nombre: d.nombre.trim(),
      apellidos: textoONulo(d.apellidos),
      telefono: textoONulo(d.telefono),
      email,
      fecha_nacimiento: textoONulo(d.fecha_nacimiento),
      como_nos_conocio: null,
      acepta_promociones: false,
      notas_internas: null,
      creado_en: t,
      actualizado_en: t,
    });
  }
  return u;
}

// ======================================================================
// Clienta: datos, ficha, políticas
// ======================================================================

export function actualizarMisDatos(ctx: Ctx, d: DatosCliente): ClienteFila {
  const c = miCliente(ctx);
  if (!(d.nombre ?? '').trim()) falla(MSG_EXTRA.nombre);
  const fechaNacimiento = textoONulo(d.fecha_nacimiento);
  // tg_clientes_proteger: la clienta captura su fecha de nacimiento una sola vez; después la corrige el personal.
  if (!esPersonal(ctx) && c.fecha_nacimiento !== null && fechaNacimiento !== c.fecha_nacimiento)
    falla(MSG.nacimientoRegistrado(telefonoWhatsApp(ctx.db)));
  c.nombre = d.nombre.trim();
  c.apellidos = textoONulo(d.apellidos);
  c.telefono = textoONulo(d.telefono);
  c.fecha_nacimiento = fechaNacimiento;
  c.acepta_promociones = !!d.acepta_promociones;
  c.actualizado_en = ahoraIso(ctx);
  return c;
}

/** guardar_ficha_salud: nueva fila de historial (la última es la vigente). */
export function guardarFicha(ctx: Ctx, f: FichaSalud): string {
  const c = miCliente(ctx);
  if (f.acepta_datos_sensibles !== true) falla(MSG.datosSensibles);
  const largo = (t: unknown) => (typeof t === 'string' ? t.length : 0);
  if (
    [f.alergias, f.medicamentos, f.observaciones].some((t) => largo(t) > LIMITES.campoFicha) ||
    JSON.stringify(f.respuestas ?? {}).length > LIMITES.jsonFicha ||
    JSON.stringify(f.detalles ?? {}).length > LIMITES.jsonFicha
  )
    falla(MSG.fichaLarga);
  const respuestas: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(f.respuestas ?? {})) respuestas[k] = v === true;
  const detalles: Record<string, string> = {};
  for (const [k, v] of Object.entries(f.detalles ?? {})) if (typeof v === 'string' && v.trim()) detalles[k] = v.trim();
  const fila: FichaFila = {
    id: uuid(),
    cliente_id: c.id,
    respuestas,
    detalles,
    alergias: textoONulo(f.alergias),
    medicamentos: textoONulo(f.medicamentos),
    observaciones: textoONulo(f.observaciones),
    acepta_datos_sensibles: true,
    creado_en: ahoraIso(ctx),
  };
  ctx.db.fichas_salud.push(fila);
  return fila.id;
}

/** aceptar_politicas: registra la aceptación (una vez por política). */
export function aceptarPoliticas(ctx: Ctx, ids: string[]): void {
  const c = miCliente(ctx);
  const { db } = ctx;
  for (const id of new Set(ids ?? [])) {
    if (!db.politicas.some((p) => p.id === id)) continue;
    if (db.aceptaciones_politica.some((a) => a.cliente_id === c.id && a.politica_id === id)) continue;
    db.aceptaciones_politica.push({
      id: uuid(),
      cliente_id: c.id,
      politica_id: id,
      aceptada_en: ahoraIso(ctx),
      ip: null,
      user_agent: ctx.userAgent,
    });
  }
}

/** R13 publicar_politica: versión = max + 1, se activa y desactiva la anterior. */
export function publicarPolitica(ctx: Ctx, tipo: TipoPolitica, titulo: string, contenido_md: string): string {
  exigirAdmin(ctx);
  if (!ORDEN_POLITICAS.includes(tipo) || !(titulo ?? '').trim() || !(contenido_md ?? '').trim()) falla(MSG.politicaDatos);
  return insertarPolitica(ctx.db, tipo, titulo.trim(), contenido_md, ahoraIso(ctx));
}

export function insertarPolitica(db: Db, tipo: TipoPolitica, titulo: string, contenido_md: string, cuando: string): string {
  const version = db.politicas.filter((p) => p.tipo === tipo).reduce((m, p) => Math.max(m, p.version), 0) + 1;
  for (const p of db.politicas) if (p.tipo === tipo) p.activa = false;
  const id = uuid();
  db.politicas.push({
    id,
    tipo,
    version,
    titulo,
    contenido_md,
    hash_sha256: sha256(contenido_md),
    activa: true,
    vigente_desde: cuando,
    creado_en: cuando,
  });
  return id;
}

// ======================================================================
// Catálogo: R1 reservable, R2 duración
// ======================================================================

interface ItemResuelto {
  servicio: ServicioFila | null;
  paquete: PaqueteFila | null;
  credito: CreditoFila | null;
}

/** servicio_id → veces (expande paquetes × cantidad). */
export function expandirServicios(db: Db, items: { servicio_id?: string | null; paquete_id?: string | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    if (it.servicio_id) m.set(it.servicio_id, (m.get(it.servicio_id) ?? 0) + 1);
    else if (it.paquete_id)
      for (const ps of db.paquete_servicios.filter((x) => x.paquete_id === it.paquete_id))
        m.set(ps.servicio_id, (m.get(ps.servicio_id) ?? 0) + ps.cantidad);
  }
  return m;
}

/** R2 duracion_reserva. */
export function duracionReserva(db: Db, items: ItemReserva[]): number {
  const conf = db.configuracion;
  let total = 0;
  for (const it of items ?? []) {
    if (it.servicio_id) {
      total += db.servicios.find((s) => s.id === it.servicio_id)?.duracion_min ?? 0;
    } else if (it.paquete_id) {
      const p = db.paquetes.find((x) => x.id === it.paquete_id);
      if (!p) continue;
      if (p.duracion_min !== null) total += p.duracion_min;
      else
        for (const ps of db.paquete_servicios.filter((x) => x.paquete_id === p.id))
          total += (db.servicios.find((s) => s.id === ps.servicio_id)?.duracion_min ?? 0) * ps.cantidad;
    }
  }
  const paso = conf.intervalo_slots_min > 0 ? conf.intervalo_slots_min : 60;
  return Math.max(Math.ceil(total / paso) * paso, conf.duracion_sesion_min);
}

/** `vigencia`: el crédito debe estar vigente ese día (greatest(hoy, fecha local de la cita)). */
function resolverItems(db: Db, items: ItemReserva[], clienteId: string, vigencia: string, staff: boolean): ItemResuelto[] {
  if (!Array.isArray(items) || items.length === 0) falla(MSG.sinServicios);
  const usos = new Map<string, number>();
  const res = items.map((it): ItemResuelto => {
    const sid = it.servicio_id || null;
    const pid = it.paquete_id || null;
    if ((sid && pid) || (!sid && !pid)) falla(MSG.noReservable);
    let servicio: ServicioFila | null = null;
    let paquete: PaqueteFila | null = null;
    if (sid) {
      servicio = db.servicios.find((s) => s.id === sid) ?? null;
      if (!servicio || !servicio.activo || servicio.etapa !== 'disponible' || (!staff && !servicio.reservable_en_linea))
        falla(MSG.noReservable);
    } else {
      paquete = db.paquetes.find((p) => p.id === pid) ?? null;
      if (!paquete || !paquete.activo) falla(MSG.noReservable);
    }
    let credito: CreditoFila | null = null;
    if (it.credito_id) {
      credito = db.creditos.find((c) => c.id === it.credito_id) ?? null;
      const usar = (usos.get(it.credito_id) ?? 0) + 1;
      if (
        !credito ||
        credito.cliente_id !== clienteId ||
        credito.codigo_regalo !== null || // regalo sin canjear: aún no es de nadie para reservar
        (credito.vence_en !== null && credito.vence_en < vigencia) ||
        credito.cantidad - credito.usados < usar ||
        (sid ? credito.servicio_id !== sid : credito.paquete_id !== pid)
      )
        falla(MSG.credito);
      usos.set(it.credito_id, usar);
    }
    return { servicio, paquete, credito };
  });
  if (res.every((r) => r.servicio?.es_complemento === true)) falla(MSG.complementos);
  return res;
}

export function categoriasDe(db: Db, servicioIds: Iterable<string>): Set<string> {
  const slugs = new Set<string>();
  for (const id of servicioIds) {
    const s = db.servicios.find((x) => x.id === id);
    const cat = s && db.categorias_servicio.find((c) => c.id === s.categoria_id);
    if (cat) slugs.add(cat.slug);
  }
  return slugs;
}

function tiposConsentimiento(db: Db, servicioIds: Iterable<string>): TipoPolitica[] {
  const tipos = new Set<TipoPolitica>();
  for (const id of servicioIds) {
    const t = db.servicios.find((x) => x.id === id)?.tipo_consentimiento;
    if (t) tipos.add(t);
  }
  return ORDEN_POLITICAS.filter((t) => tipos.has(t));
}

function puedeHacer(db: Db, personalId: string, servicioIds: string[]): boolean {
  const propios = db.personal_servicios.filter((x) => x.personal_id === personalId);
  if (propios.length === 0) return true;
  return servicioIds.every((id) => propios.some((x) => x.servicio_id === id));
}

/**
 * R4: alertas de la ficha vigente que aplican a las categorías reservadas. Sólo cuentan las
 * contraindicaciones con acción 'revisar' o 'no_se_realiza' ('precaucion' no detiene la cita).
 * `categorias` null = todas; un arreglo (aunque esté vacío) sólo aplica a las que nombra, como en SQL.
 */
export function alertasPara(db: Db, clienteId: string, slugs: Set<string>): { alertas: string[]; requiereRevision: boolean } {
  const ficha = fichaVigenteFila(db, clienteId);
  const alertas: string[] = [];
  if (!ficha) return { alertas, requiereRevision: false };
  const contras = db.contraindicaciones.filter((c) => c.activa).sort((a, b) => a.orden - b.orden);
  for (const c of contras) {
    if (c.accion !== 'revisar' && c.accion !== 'no_se_realiza') continue;
    if (ficha.respuestas[c.clave] !== true) continue;
    if (c.categorias && !c.categorias.some((s) => slugs.has(s))) continue;
    alertas.push(c.pregunta);
  }
  return { alertas, requiereRevision: alertas.length > 0 };
}

/** ¿La fecha local 'YYYY-MM-DD' es anterior a configuracion.fecha_apertura? */
export function antesDeApertura(db: Db, fecha: string): boolean {
  const apertura = db.configuracion.fecha_apertura;
  return !!apertura && fecha < apertura;
}

// ======================================================================
// R3 horarios disponibles
// ======================================================================

function bloqueado(db: Db, personalId: string, t: number, f: number): boolean {
  return db.bloqueos_agenda.some(
    (b) => (b.personal_id === null || b.personal_id === personalId) && traslapan(t, f, ms(b.inicio), ms(b.fin)),
  );
}

function personalOcupado(db: Db, personalId: string, t: number, f: number, excluirCita?: string): boolean {
  return db.citas.some(
    (c) => c.id !== excluirCita && citaActiva(c) && c.personal_id === personalId && traslapan(t, f, ms(c.inicio), ms(c.fin)),
  );
}

function cabinaLibre(db: Db, t: number, f: number, excluirCita?: string): CabinaFila | null {
  const cabinas = db.cabinas.filter((c) => c.activa).sort((a, b) => a.orden - b.orden);
  return (
    cabinas.find(
      (cab) =>
        !db.citas.some(
          (c) => c.id !== excluirCita && citaActiva(c) && c.cabina_id === cab.id && traslapan(t, f, ms(c.inicio), ms(c.fin)),
        ),
    ) ?? null
  );
}

function personalOrdenado(db: Db) {
  return db.personal.filter((p) => p.activo).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

export function horariosDisponibles(
  ctx: Ctx,
  fecha: string,
  duracionMin: number | null,
  personalId: string | null,
  opciones: { ignorarCitas?: boolean } = {},
): Slot[] {
  const { db } = ctx;
  const conf = db.configuracion;
  if (!esFecha(fecha)) return [];
  const dur = duracionMin && duracionMin > 0 ? duracionMin : conf.duracion_sesion_min;
  const paso = conf.intervalo_slots_min > 0 ? conf.intervalo_slots_min : 60;
  const hoy = hoyDe(ctx);
  if (fecha > sumarDias(hoy, conf.ventana_reserva_dias)) return [];
  // Antes de la apertura, visitantes y clientas no ven horarios; el personal sí (puede agendar el ensayo de apertura).
  if (antesDeApertura(db, fecha) && !esPersonal(ctx)) return [];
  const limite = ctx.ahora.getTime() + conf.anticipacion_min_horas * MS_HORA;
  const dow = diaSemana(fecha);
  if (!db.cabinas.some((c) => c.activa)) return [];

  const personal = personalOrdenado(db).filter((p) => !personalId || p.id === personalId);
  const slots: Slot[] = [];
  const vistos = new Set<string>();
  personal.forEach((p) => {
    const rangos = db.horarios
      .filter((h) => h.personal_id === p.id && h.dia_semana === dow)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    for (const r of rangos) {
      const ini = ms(isoDesdeLocal(fecha, r.hora_inicio));
      const finRango = ms(isoDesdeLocal(fecha, r.hora_fin));
      for (let t = ini; t + dur * MS_MIN <= finRango; t += paso * MS_MIN) {
        const f = t + dur * MS_MIN;
        if (t < limite) continue;
        if (bloqueado(db, p.id, t, f)) continue;
        if (!opciones.ignorarCitas) {
          if (personalOcupado(db, p.id, t, f)) continue;
          if (!cabinaLibre(db, t, f)) continue;
        }
        const clave = `${p.id}|${t}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        slots.push({ inicio: iso(t), fin: iso(f), personal_id: p.id, personal_nombre: p.nombre });
      }
    }
  });
  const orden = new Map(personal.map((p, i) => [p.id, i]));
  return slots.sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : (orden.get(a.personal_id) ?? 0) - (orden.get(b.personal_id) ?? 0)));
}

// ======================================================================
// R4 reservar
// ======================================================================

interface DatosCitaNueva {
  cliente: ClienteFila;
  resueltos: ItemResuelto[];
  inicio: number;
  fin: number;
  personal_id: string;
  cabina_id: string;
  estado: EstadoCita;
  origen: OrigenCita;
  requiere_revision: boolean;
  alertas: string[];
  notas_cliente: string | null;
}

/** Inserta cita + cita_items y descuenta los créditos usados. */
export function insertarCita(ctx: Ctx, d: DatosCitaNueva): CitaFila {
  const { db } = ctx;
  const t = ahoraIso(ctx);
  const primera_vez = !db.citas.some((c) => c.cliente_id === d.cliente.id && c.estado === 'completada');
  const cita: CitaFila = {
    id: uuid(),
    cliente_id: d.cliente.id,
    personal_id: d.personal_id,
    cabina_id: d.cabina_id,
    inicio: iso(d.inicio),
    fin: iso(d.fin),
    estado: d.estado,
    origen: d.origen,
    primera_vez,
    requiere_revision: d.requiere_revision,
    alertas: d.alertas,
    notas_cliente: d.notas_cliente,
    notas_internas: null,
    total: 0,
    cancelada_en: null,
    motivo_cancelacion: null,
    creada_por: ctx.usuarioId,
    creado_en: t,
    actualizado_en: t,
  };
  let total = 0;
  for (const r of d.resueltos) {
    const base = r.servicio ?? r.paquete!;
    const precio = r.credito ? 0 : base.precio;
    total += precio ?? 0;
    if (r.credito) r.credito.usados += 1;
    db.cita_items.push({
      id: uuid(),
      cita_id: cita.id,
      servicio_id: r.servicio?.id ?? null,
      paquete_id: r.paquete?.id ?? null,
      credito_id: r.credito?.id ?? null,
      nombre: base.nombre,
      precio,
      duracion_min: base.duracion_min,
    });
  }
  cita.total = redondear(total, 2);
  db.citas.push(cita);
  return cita;
}

/** Fecha local de la cita: la edad se mide ese día (SQL: edad_en(fecha_nacimiento, fecha local de p_inicio)). */
function fechaDeCita(inicio: number, hoy: string): string {
  return Number.isFinite(inicio) ? fechaLocal(new Date(inicio)) : hoy;
}

function esMenorDeEdad(db: Db, cliente: ClienteFila, fechaCita: string): boolean {
  return cliente.fecha_nacimiento ? edad(cliente.fecha_nacimiento, fechaCita) < db.configuracion.edad_mayoria : false;
}

function validarEdadMinima(db: Db, cliente: ClienteFila, fechaCita: string): void {
  if (cliente.fecha_nacimiento && edad(cliente.fecha_nacimiento, fechaCita) < db.configuracion.edad_minima)
    falla(MSG.edadMinima(db.configuracion.edad_minima));
}

/** public.validar_firma: nombre y trazo presentes, nombres de 200 caracteres o menos y un SVG sólo de trazos. */
function validarFirma(f: DatosFirma | null | undefined): asserts f is DatosFirma {
  const nombre = (f?.nombre_firmante ?? '').trim();
  if (!f || !nombre || !(f.firma_svg ?? '').trim()) falla(MSG.firma);
  if (nombre.length > LIMITES.nombre || (f.tutor_nombre ?? '').trim().length > LIMITES.nombre) falla(MSG.nombreLargo);
  if (!firmaValida(f.firma_svg, LIMITES.firmaSvg)) falla(MSG.firmaInvalida);
}

function validarNotas(notas: string | null | undefined): void {
  if ((notas ?? '').trim().length > LIMITES.notas) falla(MSG.notasLargas);
}

/**
 * documento_hash (trigger tg_consentimiento_hash): sha256 de, separados por '|', política, clienta, cita,
 * ficha, firmante, tutor, menor ('t'/'f'), sha256 de la firma y firmado_en en UTC con microsegundos.
 */
export function documentoHash(k: {
  hash_politica: string | null;
  cliente_id: string;
  cita_id: string | null;
  ficha_salud_id: string | null;
  nombre_firmante: string;
  tutor_nombre: string | null;
  es_menor: boolean;
  firma_svg: string;
  firmado_en: string;
}): string {
  const utc = new Date(k.firmado_en).toISOString().replace(/Z$/, '000Z'); // 'YYYY-MM-DDTHH:MI:SS.US' + 'Z'
  return sha256(
    [
      k.hash_politica ?? '',
      k.cliente_id,
      k.cita_id ?? '',
      k.ficha_salud_id ?? '',
      k.nombre_firmante,
      k.tutor_nombre ?? '',
      k.es_menor ? 't' : 'f',
      sha256(k.firma_svg),
      utc,
    ].join('|'),
  );
}

/**
 * Un consentimiento por cada tipo distinto de los servicios de la cita (si esa versión aún no está firmada).
 * `canal`: 'reserva_web' al reservar, 'portal' si firma la clienta desde su cuenta, 'cabina' si firma en la tablet del personal.
 */
export function crearConsentimientos(ctx: Ctx, cita: CitaFila, firma: DatosFirma, esMenor: boolean, canal: CanalFirma): number {
  const { db } = ctx;
  const items = db.cita_items.filter((i) => i.cita_id === cita.id);
  const tipos = tiposConsentimiento(db, expandirServicios(db, items).keys());
  const ficha = fichaVigenteFila(db, cita.cliente_id);
  const firmado_en = ahoraIso(ctx);
  const nombre_firmante = firma.nombre_firmante.trim();
  const tutor_nombre = esMenor ? textoONulo(firma.tutor_nombre) : null;
  let n = 0;
  for (const tipo of tipos) {
    const pol = politicaActiva(db, tipo);
    if (!pol) continue;
    if (db.consentimientos.some((k) => k.cita_id === cita.id && k.politica_id === pol.id)) continue;
    db.consentimientos.push({
      id: uuid(),
      cliente_id: cita.cliente_id,
      cita_id: cita.id,
      politica_id: pol.id,
      ficha_salud_id: ficha?.id ?? null,
      nombre_firmante,
      firma_svg: firma.firma_svg,
      es_menor: esMenor,
      tutor_nombre,
      documento_hash: documentoHash({
        hash_politica: pol.hash_sha256,
        cliente_id: cita.cliente_id,
        cita_id: cita.id,
        ficha_salud_id: ficha?.id ?? null,
        nombre_firmante,
        tutor_nombre,
        es_menor: esMenor,
        firma_svg: firma.firma_svg,
        firmado_en,
      }),
      ip: null,
      user_agent: ctx.userAgent,
      capturado_por: ctx.usuarioId,
      canal,
      firmado_en,
    });
    n++;
  }
  return n;
}

/**
 * Núcleo de crear_cita_interna (clienta y personal): ítems, notas, créditos vigentes el día de la cita,
 * complementos y que la cita tenga algún consentimiento que firmar (si no, nunca se podría iniciar).
 */
function prepararCita(ctx: Ctx, clienteId: string, items: ItemReserva[], notas: string | null | undefined, inicio: number, staff: boolean) {
  const { db } = ctx;
  if (!Array.isArray(items) || items.length === 0) falla(MSG.sinServicios);
  validarNotas(notas);
  const hoy = hoyDe(ctx);
  const fechaCita = fechaDeCita(inicio, hoy);
  const resueltos = resolverItems(db, items, clienteId, fechaCita > hoy ? fechaCita : hoy, staff);
  const servicioIds = [...expandirServicios(db, items).keys()];
  if (!tiposConsentimiento(db, servicioIds).some((t) => politicaActiva(db, t) !== null)) falla(MSG.noReservable);
  if (!Number.isFinite(inicio)) falla(MSG.noDisponible);
  return { resueltos, servicioIds, dur: duracionReserva(db, items) };
}

/** Citas próximas (pendientes o confirmadas que aún no empiezan) de una clienta. */
function citasProximas(ctx: Ctx, clienteId: string): number {
  const t = ctx.ahora.getTime();
  return ctx.db.citas.filter((c) => c.cliente_id === clienteId && (c.estado === 'pendiente' || c.estado === 'confirmada') && ms(c.inicio) > t)
    .length;
}

/** ¿La firma del consentimiento es parte de la reserva en línea? (configuracion.firma_en_linea, ESPEC §9) */
export function firmaEnLinea(db: Db): boolean {
  return db.configuracion.firma_en_linea === true;
}

/**
 * reservar_cita (clienta). Mismo orden de validaciones que SQL.
 * Firma (ESPEC §9): con firma_en_linea = false (lo de Ópalo) la firma que llegue se ignora (no se valida
 * ni se guarda) y la cita nace sin consentimientos: se firma en la tablet de la cabina. Con true se exige.
 * El nombre del tutor de una menor se pide igual (viene en `firma.tutor_nombre`, aunque no haya trazo).
 */
export function reservarCita(ctx: Ctx, s: SolicitudReserva): ResultadoReserva {
  const { db } = ctx;
  const cliente = miCliente(ctx);
  const conFirma = firmaEnLinea(db);
  const hoy = hoyDe(ctx);
  const inicio = ms(s.inicio);
  const fechaCita = fechaDeCita(inicio, hoy);

  // Antes de la apertura no se reserva en línea (vale para cualquier cuenta; el personal agenda con reservarParaCliente).
  if (Number.isFinite(inicio) && antesDeApertura(db, fechaCita)) falla(MSG.noDisponible);
  for (const tipo of POLITICAS_GENERALES) {
    const pol = politicaActiva(db, tipo);
    if (pol && !db.aceptaciones_politica.some((a) => a.cliente_id === cliente.id && a.politica_id === pol.id)) falla(MSG.politicas);
  }
  if (!fichaVigenteFila(db, cliente.id)) falla(MSG.ficha);
  if (!cliente.fecha_nacimiento) falla(MSG.nacimientoReservar);
  validarEdadMinima(db, cliente, fechaCita);
  const esMenor = esMenorDeEdad(db, cliente, fechaCita);
  if (esMenor && !(s.firma?.tutor_nombre ?? '').trim()) falla(MSG.tutor);
  if (conFirma) validarFirma(s.firma);
  // Una sola cuenta no acapara la agenda; para más citas, el personal agenda por WhatsApp (sin límite).
  if (citasProximas(ctx, cliente.id) >= LIMITES.citasProximas) falla(MSG.maxCitas(LIMITES.citasProximas, telefonoWhatsApp(db)));

  const { resueltos, servicioIds, dur } = prepararCita(ctx, cliente.id, s.items, s.notas, inicio, false);
  const fecha = fechaLocal(new Date(inicio));
  const personalPedido = s.personal_id || null;
  const coincide = (sl: Slot) => ms(sl.inicio) === inicio && puedeHacer(db, sl.personal_id, servicioIds);
  const candidatos = horariosDisponibles(ctx, fecha, dur, personalPedido).filter(coincide);
  if (candidatos.length === 0) {
    const sinCitas = horariosDisponibles(ctx, fecha, dur, personalPedido, { ignorarCitas: true }).filter(coincide);
    falla(sinCitas.length ? MSG.ocupado : MSG.noDisponible);
  }
  const fin = inicio + dur * MS_MIN;
  const personal_id = candidatos[0].personal_id;
  const cabina = cabinaLibre(db, inicio, fin);
  if (!cabina) falla(MSG.ocupado);

  const { alertas, requiereRevision } = alertasPara(db, cliente.id, categoriasDe(db, servicioIds));
  const cita = insertarCita(ctx, {
    cliente,
    resueltos,
    inicio,
    fin,
    personal_id,
    cabina_id: cabina.id,
    estado: requiereRevision ? 'pendiente' : 'confirmada',
    origen: 'web',
    requiere_revision: requiereRevision,
    alertas,
    notas_cliente: textoONulo(s.notas),
  });
  // Sin firma en línea, lo que llegue de firma se descarta: la cita queda "falta firma".
  if (conFirma && s.firma) crearConsentimientos(ctx, cita, s.firma, esMenor, 'reserva_web');
  return { id: cita.id, estado: cita.estado, requiere_revision: cita.requiere_revision, alertas: [...cita.alertas] };
}

/**
 * reservar_cita_staff (personal): sin firma ni límite de citas; puede agendar antes de la apertura.
 * Respeta citas, cabinas y bloqueos, no el horario publicado.
 */
export function reservarCitaStaff(ctx: Ctx, s: SolicitudReservaStaff): ResultadoReserva {
  exigirPersonal(ctx);
  const { db } = ctx;
  const cliente = db.clientes.find((c) => c.id === s.cliente_id);
  if (!cliente) falla(MSG_EXTRA.clienteNoExiste);
  const hoy = hoyDe(ctx);
  const inicio = ms(s.inicio);
  validarEdadMinima(db, cliente, fechaDeCita(inicio, hoy));
  const { resueltos, servicioIds, dur } = prepararCita(ctx, cliente.id, s.items, s.notas, inicio, true);
  const fin = inicio + dur * MS_MIN;

  const candidatos = personalOrdenado(db).filter((p) => (!s.personal_id || p.id === s.personal_id) && puedeHacer(db, p.id, servicioIds));
  if (candidatos.length === 0) falla(MSG.noDisponible);
  const sinBloqueo = candidatos.filter((p) => !bloqueado(db, p.id, inicio, fin));
  if (sinBloqueo.length === 0) falla(MSG.noDisponible);
  const libre = sinBloqueo.find((p) => !personalOcupado(db, p.id, inicio, fin));
  if (!libre) falla(MSG.ocupado);
  const cabina = cabinaLibre(db, inicio, fin);
  if (!cabina) falla(MSG.ocupado);

  const { alertas, requiereRevision } = alertasPara(db, cliente.id, categoriasDe(db, servicioIds));
  const cita = insertarCita(ctx, {
    cliente,
    resueltos,
    inicio,
    fin,
    personal_id: libre.id,
    cabina_id: cabina.id,
    estado: requiereRevision ? 'pendiente' : 'confirmada',
    origen: s.origen ?? 'whatsapp',
    requiere_revision: requiereRevision,
    alertas,
    notas_cliente: textoONulo(s.notas),
  });
  return { id: cita.id, estado: cita.estado, requiere_revision: cita.requiere_revision, alertas: [...cita.alertas] };
}

function buscarCita(db: Db, id: string): CitaFila {
  const c = db.citas.find((x) => x.id === id);
  if (!c) falla(MSG_EXTRA.citaNoExiste);
  return c;
}

/**
 * firmar_consentimiento_cita: tablet de la cabina (sesión del personal; siempre se puede, canal 'cabina')
 * o portal de la propia clienta (sólo con configuracion.firma_en_linea = true; si no, 'La firma se hace en
 * el spa, el día de tu cita.', ESPEC §9). Desde su cuenta, la clienta necesita su fecha de nacimiento; en
 * cabina el personal verifica la edad en persona.
 */
export function firmarConsentimientoCita(ctx: Ctx, citaId: string, firma: DatosFirma): void {
  exigirSesion(ctx);
  const { db } = ctx;
  // Como en SQL: una cita que no existe responde lo mismo que una ajena (no se revela si existe).
  const cita = db.citas.find((x) => x.id === citaId);
  if (!cita) falla(MSG.permiso);
  const cliente = db.clientes.find((c) => c.id === cita.cliente_id)!;
  const portal = !esPersonal(ctx);
  if (portal && (ctx.usuarioId === null || cliente.usuario_id !== ctx.usuarioId)) falla(MSG.permiso);
  if (portal && !firmaEnLinea(db)) falla(MSG.firmaEnSpa);
  if (cita.estado === 'cancelada' || cita.estado === 'no_asistio') falla(MSG.citaCancelada);
  if (portal && !cliente.fecha_nacimiento) falla(MSG.nacimientoFirmar);
  const esMenor = esMenorDeEdad(db, cliente, fechaLocal(new Date(cita.inicio)));
  if (esMenor && !(firma?.tutor_nombre ?? '').trim()) falla(MSG.tutor);
  validarFirma(firma);
  crearConsentimientos(ctx, cita, firma, esMenor, portal ? 'portal' : 'cabina');
}

// ======================================================================
// R5 cancelar · R6 consentimiento · R7 completar
// ======================================================================

export function cancelarCita(ctx: Ctx, citaId: string, motivo?: string | null): void {
  exigirSesion(ctx);
  const { db } = ctx;
  const cita = buscarCita(db, citaId);
  const staff = esPersonal(ctx);
  const mia = miClienteOpcional(ctx)?.id === cita.cliente_id;
  if (!staff && !mia) falla(MSG.permiso);
  const cancelables: EstadoCita[] = staff ? ['pendiente', 'confirmada', 'en_curso'] : ['pendiente', 'confirmada'];
  if (!cancelables.includes(cita.estado)) falla(MSG.noCancelable);
  if (!staff) {
    const horas = db.configuracion.horas_cancelacion;
    if (ms(cita.inicio) - ctx.ahora.getTime() < horas * MS_HORA)
      falla(MSG.cancelarTarde(horas, telefonoBonito(db.configuracion.telefono_whatsapp) || '442 170 1466'));
  }
  const t = ahoraIso(ctx);
  cita.estado = 'cancelada';
  cita.cancelada_en = t;
  cita.motivo_cancelacion = textoONulo(motivo);
  cita.actualizado_en = t;
  for (const it of db.cita_items.filter((i) => i.cita_id === cita.id && i.credito_id)) {
    const cr = db.creditos.find((c) => c.id === it.credito_id);
    if (cr && cr.usados > 0) cr.usados -= 1;
  }
}

function tieneConsentimiento(db: Db, citaId: string): boolean {
  return db.consentimientos.some((k) => k.cita_id === citaId);
}

export function insertarMovimiento(
  ctx: Ctx,
  m: Omit<MovimientoFila, 'id' | 'creado_en' | 'creado_por' | 'cita_id' | 'compra_id' | 'pedido_id' | 'lote_id' | 'nota'> &
    Partial<Pick<MovimientoFila, 'cita_id' | 'compra_id' | 'pedido_id' | 'lote_id' | 'nota'>>,
): MovimientoFila {
  const p = ctx.db.productos.find((x) => x.id === m.producto_id);
  if (!p) falla(MSG_EXTRA.productoNoExiste);
  const fila: MovimientoFila = {
    id: uuid(),
    producto_id: m.producto_id,
    tipo: m.tipo,
    cantidad: redondear(m.cantidad, 3),
    costo_unitario: m.costo_unitario,
    cita_id: m.cita_id ?? null,
    compra_id: m.compra_id ?? null,
    pedido_id: m.pedido_id ?? null,
    lote_id: m.lote_id ?? null,
    nota: m.nota ?? null,
    creado_por: ctx.usuarioId,
    creado_en: ahoraIso(ctx),
  };
  ctx.db.movimientos_inventario.push(fila);
  p.stock_actual = redondear(p.stock_actual + fila.cantidad, 3); // trigger: stock_actual += cantidad
  return fila;
}

/** R7 completar_cita: consumos según receta (idempotente). */
export function completarCita(ctx: Ctx, citaId: string): void {
  exigirPersonal(ctx);
  const { db } = ctx;
  const cita = buscarCita(db, citaId);
  if (cita.estado === 'cancelada') falla(MSG.citaCancelada);
  if (cita.estado === 'no_asistio') falla(MSG.noAsistio);
  if (!tieneConsentimiento(db, cita.id)) falla(MSG.sinConsentimiento);
  const yaConsumida = cita.estado === 'completada' || db.movimientos_inventario.some((m) => m.cita_id === cita.id && m.tipo === 'consumo');
  if (!yaConsumida) {
    const porProducto = new Map<string, number>();
    const servicios = expandirServicios(db, db.cita_items.filter((i) => i.cita_id === cita.id));
    for (const [servicioId, veces] of servicios)
      for (const r of db.recetas_servicio.filter((x) => x.servicio_id === servicioId))
        porProducto.set(r.producto_id, (porProducto.get(r.producto_id) ?? 0) + r.cantidad * veces);
    for (const [productoId, cantidad] of porProducto) {
      const p = db.productos.find((x) => x.id === productoId);
      if (!p) continue;
      insertarMovimiento(ctx, {
        producto_id: productoId,
        tipo: 'consumo',
        cantidad: -cantidad,
        costo_unitario: costoUnitario(p),
        cita_id: cita.id,
        nota: 'Consumo por receta',
      });
    }
  }
  cita.estado = 'completada';
  cita.actualizado_en = ahoraIso(ctx);
}

/** cambiar_estado_cita (personal). 'completada' y 'cancelada' pasan por sus reglas (R7, R5). */
export function cambiarEstadoCita(ctx: Ctx, citaId: string, estado: EstadoCita): void {
  exigirPersonal(ctx);
  const { db } = ctx;
  const cita = buscarCita(db, citaId);
  if (cita.estado === estado) return;
  if (cita.estado === 'cancelada') falla(MSG.citaCancelada);
  if (cita.estado === 'completada') falla(MSG_EXTRA.citaCompletada);
  if (estado === 'cancelada') return cancelarCita(ctx, citaId, null);
  if (estado === 'completada') return completarCita(ctx, citaId);
  if (estado === 'en_curso' && !tieneConsentimiento(db, cita.id)) falla(MSG.sinConsentimiento);
  if (!citaActiva(cita) && estado !== 'no_asistio') {
    // Reactivar (p. ej. de "no asistió"): no debe empalmarse con otra cita.
    const t = ms(cita.inicio);
    const f = ms(cita.fin);
    if (personalOcupado(db, cita.personal_id, t, f, cita.id)) falla(MSG.ocupado);
    const cab = cabinaLibre(db, t, f, cita.id);
    if (!cab) falla(MSG.ocupado);
    cita.cabina_id = cab.id;
  }
  if (estado === 'confirmada') cita.requiere_revision = false; // el personal ya la revisó
  cita.estado = estado;
  cita.actualizado_en = ahoraIso(ctx);
}

// ======================================================================
// R8 pedidos · R9 pagos · R10 regalos
// ======================================================================

/** La clienta elige uno de estos; cortesía y Mercado Pago los registra el personal al cobrar. */
const METODOS_PEDIDO: MetodoPago[] = ['efectivo', 'tarjeta', 'transferencia'];

/** Cantidad de una línea de pedido: entera de 1 a 99 (número o texto); si falta, 1. */
function cantidadDePedido(v: unknown): number {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return 1;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n > LIMITES.cantidadMaxima) falla(MSG_EXTRA.cantidad);
  if (n < 1) falla(MSG.cantidadMinima);
  return n;
}

/** Renglón de pedido con precio del servidor (lineas_pedido_interna). */
interface LineaPedido {
  tipo: TipoItemPedido;
  id: string;
  cantidad: number;
  descripcion: string;
  precio: number;
  regalo_para: string | null;
}

/**
 * lineas_pedido_interna: valida los renglones y pone los precios del servidor.
 * En línea: servicio activo, disponible, vendible_en_linea y con precio; paquete activo con precio; producto
 * activo, vendible_en_linea y con precio_venta. En mostrador, lo mismo sin exigir vendible_en_linea.
 */
function lineasPedido(db: Db, items: ItemPedidoNuevo[], mostrador: boolean): LineaPedido[] {
  if (!Array.isArray(items) || items.length === 0) falla(MSG_EXTRA.carritoVacio);
  const noDisponible = mostrador ? MSG.noALaVenta : MSG.noVendible;
  return items.map((it): LineaPedido => {
    if (!it || typeof it !== 'object') falla(noDisponible);
    const cantidad = cantidadDePedido(it.cantidad);
    const regalo_para = textoONulo(it.regalo_para);
    if (regalo_para && regalo_para.length > LIMITES.regaloPara) falla(MSG.regaloLargo);
    let precio: number | null = null;
    let descripcion = '';
    if (it.tipo === 'servicio') {
      const s = db.servicios.find((x) => x.id === it.id);
      if (!s || !s.activo || s.etapa !== 'disponible' || (!mostrador && !s.vendible_en_linea) || s.precio === null) falla(noDisponible);
      precio = s.precio;
      descripcion = s.nombre;
    } else if (it.tipo === 'paquete') {
      const p = db.paquetes.find((x) => x.id === it.id);
      if (!p || !p.activo || p.precio === null) falla(noDisponible);
      precio = p.precio;
      descripcion = p.nombre;
    } else if (it.tipo === 'producto') {
      const p = db.productos.find((x) => x.id === it.id);
      if (!p || !p.activo || (!mostrador && !p.vendible_en_linea) || p.precio_venta === null) falla(noDisponible);
      precio = p.precio_venta;
      descripcion = p.presentacion ? `${p.nombre} · ${p.presentacion}` : p.nombre;
    } else falla(noDisponible);
    return { tipo: it.tipo, id: it.id, cantidad, descripcion, precio: precio as number, regalo_para };
  });
}

/**
 * validar_existencias_interna (ESPEC §10.3): piezas completas (floor del stock) y renglones repetidos del
 * mismo producto sumados. 'Por ahora no tenemos …' / 'Por ahora sólo quedan N piezas de …'.
 */
function validarExistencias(db: Db, lineas: Pick<LineaPedido, 'tipo' | 'id' | 'cantidad'>[]): void {
  const porProducto = new Map<string, number>();
  for (const l of lineas) if (l.tipo === 'producto') porProducto.set(l.id, (porProducto.get(l.id) ?? 0) + l.cantidad);
  for (const id of [...porProducto.keys()].sort()) {
    const p = db.productos.find((x) => x.id === id)!;
    const hay = Math.max(Math.floor(redondear(p.stock_actual, 3)), 0);
    if (porProducto.get(id)! > hay) falla(hay === 0 ? MSG.sinExistencias(p.nombre) : MSG.pocasExistencias(hay, p.nombre));
  }
}

/** insertar_pedido_interna: pedido + renglones (folio OP-00001…). */
function insertarPedido(ctx: Ctx, clienteId: string | null, lineas: LineaPedido[], metodo: MetodoPago, notas: string | null | undefined, origen: OrigenPedido): PedidoFila {
  const { db } = ctx;
  db.folio_pedidos += 1;
  const pedido: PedidoFila = {
    id: uuid(),
    folio: `OP-${String(db.folio_pedidos).padStart(5, '0')}`,
    cliente_id: clienteId,
    estado: 'pendiente_pago',
    total: redondear(lineas.reduce((s, l) => s + l.cantidad * l.precio, 0), 2),
    metodo_pago_preferido: metodo,
    notas: textoONulo(notas),
    origen,
    entregado_en: null,
    creado_en: ahoraIso(ctx),
    pagado_en: null,
    cancelado_en: null,
  };
  db.pedidos.push(pedido);
  for (const l of lineas)
    db.pedido_items.push({
      id: uuid(),
      pedido_id: pedido.id,
      tipo: l.tipo,
      servicio_id: l.tipo === 'servicio' ? l.id : null,
      paquete_id: l.tipo === 'paquete' ? l.id : null,
      producto_id: l.tipo === 'producto' ? l.id : null,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio_unitario: l.precio,
      regalo_para: l.regalo_para,
    });
  return pedido;
}

/** R8 crear_pedido (clienta). Los productos deben tener existencias al pedir; se descuentan al pagarse. */
export function crearPedido(ctx: Ctx, items: ItemPedidoNuevo[], metodo: MetodoPago, notas?: string | null): ResultadoPedido {
  const c = miCliente(ctx);
  const { db } = ctx;
  if (!Array.isArray(items) || items.length === 0) falla(MSG_EXTRA.carritoVacio);
  const metodoPago: MetodoPago = metodo ?? 'efectivo';
  if (!METODOS_PEDIDO.includes(metodoPago)) falla(MSG.metodoPago);
  validarNotas(notas);
  if (db.pedidos.filter((p) => p.cliente_id === c.id && p.estado === 'pendiente_pago').length >= LIMITES.pedidosPorPagar)
    falla(MSG.maxPedidos(LIMITES.pedidosPorPagar));
  const lineas = lineasPedido(db, items, false);
  validarExistencias(db, lineas);
  const pedido = insertarPedido(ctx, c.id, lineas, metodoPago, notas, 'web');
  return { id: pedido.id, folio: pedido.folio, total: pedido.total };
}

/**
 * venta_mostrador (personal, ESPEC §10.3): la clienta paga y se lleva lo que compró en el acto. Mismos
 * renglones que crear_pedido (sin exigir que se vendan en línea); servicios y paquetes exigen clienta; los
 * productos, existencias. Crea el pedido (origen 'mostrador'), registra el pago completo (cortesía permitida,
 * no cuenta como ingreso), lo liquida (créditos y salida de productos) y, si lleva productos, lo entrega.
 */
export function ventaMostrador(ctx: Ctx, v: VentaMostrador): ResultadoPedido {
  const u = exigirPersonal(ctx);
  const { db } = ctx;
  if (!v.metodo) falla(MSG.metodoPagoFalta);
  const propina = v.propina === null || v.propina === undefined ? 0 : Number(v.propina);
  if (!Number.isFinite(propina) || propina < 0) falla(MSG_EXTRA.propina);
  validarNotas(v.notas);
  const clienteId = v.cliente_id || null;
  if (clienteId && !db.clientes.some((c) => c.id === clienteId)) falla(MSG_EXTRA.clienteNoExiste);
  const lineas = lineasPedido(db, v.items, true);
  if (!clienteId && lineas.some((l) => l.tipo !== 'producto')) falla(MSG.serviciosSinClienta);
  validarExistencias(db, lineas);
  const pedido = insertarPedido(ctx, clienteId, lineas, v.metodo, v.notas, 'mostrador');
  if (pedido.total <= 0) falla(MSG_EXTRA.monto);
  db.pagos.push({
    id: uuid(),
    pedido_id: pedido.id,
    cita_id: null,
    monto: pedido.total,
    propina: redondear(propina, 2),
    metodo: v.metodo,
    referencia: null,
    recibido_por: u.id,
    pagado_en: ahoraIso(ctx),
    notas: null,
  });
  marcarPedidoPagado(ctx, pedido);
  if (lineas.some((l) => l.tipo === 'producto')) pedido.entregado_en = ahoraIso(ctx);
  return { id: pedido.id, folio: pedido.folio, total: pedido.total };
}

/** marcar_entregado (personal): pedido pagado con productos. Marcarlo otra vez no cambia la fecha. */
export function marcarEntregado(ctx: Ctx, pedidoId: string): void {
  exigirPersonal(ctx);
  const { db } = ctx;
  const p = db.pedidos.find((x) => x.id === pedidoId);
  if (!p) falla(MSG_EXTRA.pedidoNoExiste);
  if (p.estado !== 'pagado') falla(MSG.pedidoNoPagado);
  if (!db.pedido_items.some((i) => i.pedido_id === p.id && i.tipo === 'producto')) falla(MSG.pedidoSinProductos);
  p.entregado_en ??= ahoraIso(ctx);
}

/** cancelar_pedido: dueña o personal, sólo si está pendiente de pago. */
export function cancelarPedido(ctx: Ctx, pedidoId: string): void {
  exigirSesion(ctx);
  const { db } = ctx;
  const p = db.pedidos.find((x) => x.id === pedidoId);
  if (!p) falla(MSG_EXTRA.pedidoNoExiste);
  const mio = miClienteOpcional(ctx)?.id === p.cliente_id;
  if (!mio && !esPersonal(ctx)) falla(MSG.permiso);
  if (p.estado !== 'pendiente_pago') falla(MSG_EXTRA.pedidoNoCancelable);
  p.estado = 'cancelado';
  p.cancelado_en = ahoraIso(ctx);
}

function codigoRegaloUnico(db: Db): string {
  for (;;) {
    const c = codigoRegalo();
    if (!db.creditos.some((x) => x.codigo_regalo === c)) return c;
  }
}

/** Pedido pagado: créditos por servicios/paquetes y movimiento de venta por productos. */
function marcarPedidoPagado(ctx: Ctx, pedido: PedidoFila): void {
  const { db } = ctx;
  const t = ahoraIso(ctx);
  const hoy = hoyDe(ctx);
  // Un pedido en línea no aparta piezas: si mientras tanto se vendieron, no se cobra ni se entrega lo que
  // ya no hay (el inventario nunca queda en negativo). Mismos mensajes que crear_pedido.
  validarExistencias(
    db,
    db.pedido_items
      .filter((i) => i.pedido_id === pedido.id && i.tipo === 'producto' && i.producto_id)
      .map((i) => ({ tipo: 'producto' as const, id: i.producto_id!, cantidad: i.cantidad })),
  );
  pedido.estado = 'pagado';
  pedido.pagado_en = t;
  for (const it of db.pedido_items.filter((i) => i.pedido_id === pedido.id)) {
    if (it.tipo === 'producto' && it.producto_id) {
      const p = db.productos.find((x) => x.id === it.producto_id);
      if (p)
        insertarMovimiento(ctx, {
          producto_id: p.id,
          tipo: 'venta',
          cantidad: -it.cantidad,
          costo_unitario: costoUnitario(p),
          pedido_id: pedido.id,
          nota: `Venta del pedido ${pedido.folio}`,
        });
      continue;
    }
    // Sólo una venta de mostrador puede no tener clienta, y ésa no lleva servicios ni paquetes.
    const clienteId = pedido.cliente_id;
    if (!clienteId) continue;
    const paquete = it.paquete_id ? db.paquetes.find((x) => x.id === it.paquete_id) ?? null : null;
    const vence_en = sumarDias(hoy, paquete?.vigencia_dias ?? db.configuracion.vigencia_creditos_dias);
    // Un solo código por regalo (ítem), aunque genere varios créditos (bono de varios servicios).
    const regalo_para = textoONulo(it.regalo_para);
    const codigo_regalo = regalo_para ? codigoRegaloUnico(db) : null;
    const nuevo = (servicio_id: string | null, paquete_id: string | null, cantidad: number) => {
      db.creditos.push({
        id: uuid(),
        cliente_id: clienteId,
        servicio_id,
        paquete_id,
        cantidad,
        usados: 0,
        pedido_item_id: it.id,
        codigo_regalo,
        regalo_para,
        vence_en,
        creado_en: t,
      });
    };
    if (it.tipo === 'servicio' && it.servicio_id) nuevo(it.servicio_id, null, it.cantidad);
    else if (paquete && paquete.tipo === 'combo') nuevo(null, paquete.id, it.cantidad);
    else if (paquete)
      for (const ps of db.paquete_servicios.filter((x) => x.paquete_id === paquete.id))
        nuevo(ps.servicio_id, null, it.cantidad * ps.cantidad);
  }
}

/** R9 registrar_pago (personal). */
export function registrarPago(ctx: Ctx, p: NuevoPago): string {
  const u = exigirPersonal(ctx);
  const { db } = ctx;
  const monto = Number(p.monto);
  const propina = Number(p.propina ?? 0);
  // Mismo orden y textos que registrar_pago en SQL.
  if (!p.pedido_id && !p.cita_id) falla(MSG.pagoSinDestino);
  if (!Number.isFinite(monto) || monto <= 0) falla(MSG_EXTRA.monto);
  if (!Number.isFinite(propina) || propina < 0) falla(MSG_EXTRA.propina);
  if (!p.metodo) falla(MSG.metodoPagoFalta);
  const pedido = p.pedido_id ? db.pedidos.find((x) => x.id === p.pedido_id) : null;
  if (p.pedido_id && !pedido) falla(MSG_EXTRA.pedidoNoExiste);
  if (pedido && (pedido.estado === 'cancelado' || pedido.estado === 'reembolsado')) falla(MSG_EXTRA.pedidoCancelado);
  if (p.cita_id && !db.citas.some((x) => x.id === p.cita_id)) falla(MSG_EXTRA.citaNoExiste);
  const id = uuid();
  db.pagos.push({
    id,
    pedido_id: p.pedido_id ?? null,
    cita_id: p.cita_id ?? null,
    monto: redondear(monto, 2),
    propina: redondear(propina, 2),
    metodo: p.metodo,
    referencia: textoONulo(p.referencia),
    recibido_por: u.id,
    pagado_en: ahoraIso(ctx),
    notas: null,
  });
  if (pedido && pedido.estado === 'pendiente_pago' && pagadoPedido(db, pedido.id) >= pedido.total) marcarPedidoPagado(ctx, pedido);
  return id;
}

/**
 * R10 canjear_regalo: los créditos con ese código (uno, o varios si es un bono de varios servicios)
 * pasan a la clienta que canjea y se limpia el código. Devuelve el id del primero.
 */
export function canjearRegalo(ctx: Ctx, codigo: string): string {
  const c = miCliente(ctx);
  const cod = (codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const creditos = cod ? ctx.db.creditos.filter((x) => x.codigo_regalo === cod) : [];
  if (creditos.length === 0) falla(MSG.regalo);
  for (const cr of creditos) {
    cr.cliente_id = c.id;
    cr.codigo_regalo = null;
  }
  creditos.sort((a, b) => a.creado_en.localeCompare(b.creado_en) || a.id.localeCompare(b.id));
  return creditos[0].id;
}

// ======================================================================
// R11 compras · ajustes · productos · recetas
// ======================================================================

export function registrarCompra(ctx: Ctx, c: NuevaCompra): string {
  const u = exigirPersonal(ctx);
  const { db } = ctx;
  // Mismo orden y textos que registrar_compra en SQL.
  if (!Array.isArray(c.items) || c.items.length === 0) falla(MSG_EXTRA.compraVacia);
  if (c.proveedor_id && !db.proveedores.some((x) => x.id === c.proveedor_id)) falla(MSG.proveedorNoExiste);
  const items = c.items.map((it) => {
    const p = db.productos.find((x) => x.id === it.producto_id);
    if (!p) falla(MSG.compraProductoNoExiste);
    const vacio = (v: unknown) => v === null || v === undefined || v === '';
    const presentaciones = vacio(it.presentaciones) ? NaN : Number(it.presentaciones);
    // Sin costo, se toma el último costo del producto (como coalesce en SQL).
    const costo = vacio(it.costo_presentacion) ? p.costo_presentacion : Number(it.costo_presentacion);
    if (!Number.isFinite(presentaciones) || presentaciones <= 0) falla(MSG.compraPresentaciones);
    if (!Number.isFinite(costo)) falla(MSG_EXTRA.cantidad);
    if (costo < 0) falla(MSG.costoNegativo);
    return { p, presentaciones, costo };
  });
  const compraId = uuid();
  db.compras.push({
    id: compraId,
    proveedor_id: c.proveedor_id ?? null,
    fecha: c.fecha && esFecha(c.fecha) ? c.fecha : hoyDe(ctx),
    folio: textoONulo(c.folio),
    total: redondear(items.reduce((s, i) => s + i.presentaciones * i.costo, 0), 2),
    notas: textoONulo(c.notas),
    registrada_por: u.id,
    creado_en: ahoraIso(ctx),
  });
  for (const { p, presentaciones, costo } of items) {
    db.compra_items.push({ id: uuid(), compra_id: compraId, producto_id: p.id, presentaciones, costo_presentacion: costo });
    insertarMovimiento(ctx, {
      producto_id: p.id,
      tipo: 'compra',
      cantidad: presentaciones * p.contenido_presentacion,
      costo_unitario: redondear(costo / p.contenido_presentacion, 4),
      compra_id: compraId,
      nota: c.folio ? `Compra ${c.folio}` : 'Compra',
    });
    p.costo_presentacion = costo; // último costo
    p.actualizado_en = ahoraIso(ctx);
  }
  return compraId;
}

export function ajustarInventario(ctx: Ctx, productoId: string, cantidad: number, tipo: TipoMovimiento, nota?: string | null): void {
  exigirPersonal(ctx);
  // Mismo orden y textos que ajustar_inventario en SQL.
  if (tipo !== 'ajuste' && tipo !== 'merma') falla(MSG.soloAjusteMerma);
  let cant = Number(cantidad);
  if (!Number.isFinite(cant) || cant === 0) falla(MSG_EXTRA.cantidadCero);
  if (tipo === 'merma') cant = -Math.abs(cant);
  const p = ctx.db.productos.find((x) => x.id === productoId);
  if (!p) falla(MSG_EXTRA.productoNoExiste);
  insertarMovimiento(ctx, { producto_id: p.id, tipo, cantidad: cant, costo_unitario: costoUnitario(p), nota: textoONulo(nota) });
}

/**
 * Slug del producto como el trigger tg_productos_ficha: se normaliza el que escriban ('' → error); si no
 * escriben uno y el producto se vende en línea o es de la tienda propia, se arma con el nombre (-2, -3… si
 * ya existe), porque la ficha pública vive en /tienda/:slug; si no, null. Al editar, el mismo slug se queda.
 */
function slugProducto(
  db: Db,
  e: { slug?: string | null; nombre: string; vendible_en_linea: boolean; categoria: CategoriaProducto },
  id: string | null,
  anterior: string | null,
): string | null {
  const escrito = textoONulo(e.slug);
  if (id && escrito !== null && escrito === anterior) return anterior;
  const usado = (s: string) => db.productos.some((p) => p.slug === s && p.id !== id);
  if (escrito !== null) {
    const base = slugDe(escrito);
    if (!base) falla(MSG.productoSlug);
    if (usado(base)) falla(MSG.productoSlugUsado);
    return base;
  }
  if (!e.vendible_en_linea && !CATEGORIAS_TIENDA.includes(e.categoria)) return null;
  const base = slugDe(e.nombre) || 'producto';
  let slug = base;
  for (let n = 2; usado(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/** Escritura directa en productos (personal; ESPEC §6.1), con la ficha pública de la tienda (§10.1). */
export function guardarProducto(ctx: Ctx, e: ProductoEditable): ProductoFila {
  exigirPersonal(ctx);
  const { db } = ctx;
  if (!(e.nombre ?? '').trim() || !(Number(e.contenido_presentacion) > 0) || Number(e.costo_presentacion) < 0) falla(MSG_EXTRA.datoFaltante);
  const anterior = e.id ? db.productos.find((x) => x.id === e.id) : undefined;
  if (e.id && !anterior) falla(MSG_EXTRA.noExiste);
  const t = ahoraIso(ctx);
  const base = {
    nombre: e.nombre.trim(),
    marca: textoONulo(e.marca),
    categoria: e.categoria,
    unidad_medida: e.unidad_medida,
    presentacion: textoONulo(e.presentacion),
    contenido_presentacion: Number(e.contenido_presentacion),
    costo_presentacion: Number(e.costo_presentacion) || 0,
    stock_minimo: Number(e.stock_minimo) || 0,
    proveedor_id: e.proveedor_id || null,
    uso: e.uso,
    precio_venta: e.precio_venta === null || e.precio_venta === undefined || (e.precio_venta as unknown) === '' ? null : Number(e.precio_venta),
    vendible_en_linea: !!e.vendible_en_linea,
    activo: e.activo !== false,
    notas: textoONulo(e.notas),
  };
  // Jabones, velas y sets se manejan por pieza: así costo_unitario es el costo de una pieza (ESPEC §10.2).
  if (CATEGORIAS_TIENDA.includes(base.categoria) && (base.unidad_medida !== 'pz' || base.contenido_presentacion !== 1)) falla(MSG.porPieza);
  const datos = {
    ...base,
    slug: slugProducto(db, { ...base, slug: e.slug }, e.id ?? null, anterior?.slug ?? null),
    descripcion: textoONulo(e.descripcion),
    aroma: textoONulo(e.aroma),
    ingredientes: textoONulo(e.ingredientes),
    modo_uso: textoONulo(e.modo_uso),
    advertencias: textoONulo(e.advertencias),
    contenido_neto: textoONulo(e.contenido_neto),
    foto_url: textoONulo(e.foto_url),
    color_hex: colorHex(e.color_hex),
    destacado: !!e.destacado,
    hecho_en_opalo: !!e.hecho_en_opalo,
    orden: Math.round(Number(e.orden)) || 0,
  };
  if (anterior) {
    Object.assign(anterior, datos, { actualizado_en: t });
    return anterior;
  }
  const p: ProductoFila = { id: uuid(), ...datos, stock_actual: 0, creado_en: t, actualizado_en: t };
  db.productos.push(p);
  return p;
}

export function guardarProveedor(ctx: Ctx, e: Omit<Proveedor, 'id'> & { id?: string }): ProveedorFila {
  exigirPersonal(ctx);
  const { db } = ctx;
  if (!(e.nombre ?? '').trim()) falla(MSG_EXTRA.datoFaltante);
  const datos = {
    nombre: e.nombre.trim(),
    contacto: textoONulo(e.contacto),
    telefono: textoONulo(e.telefono),
    email: textoONulo(e.email),
    ciudad: textoONulo(e.ciudad),
    notas: textoONulo(e.notas),
    activo: e.activo !== false,
  };
  if (e.id) {
    const p = db.proveedores.find((x) => x.id === e.id);
    if (!p) falla(MSG_EXTRA.noExiste);
    Object.assign(p, datos);
    return p;
  }
  const p: ProveedorFila = { id: uuid(), ...datos, creado_en: ahoraIso(ctx) };
  db.proveedores.push(p);
  return p;
}

/**
 * guardar_receta (personal): reemplaza la receta completa. Si un producto se repite, se suman las
 * cantidades y se conserva la primera nota. '[]' deja la receta vacía.
 */
export function guardarReceta(ctx: Ctx, servicioId: string, items: RecetaItem[]): void {
  exigirPersonal(ctx);
  const { db } = ctx;
  if (!db.servicios.some((s) => s.id === servicioId)) falla(MSG.servicioNoExiste);
  if (!Array.isArray(items)) falla(MSG.receta);
  const juntos = new Map<string, { cantidad: number; notas: string | null }>();
  for (const it of items) {
    if (!it || !db.productos.some((p) => p.id === it.producto_id)) falla(MSG.recetaProductoNoExiste);
    const cant = it.cantidad === null || (it.cantidad as unknown) === '' ? NaN : redondear(Number(it.cantidad), 3);
    if (!Number.isFinite(cant) || cant <= 0 || cant >= 1e9) falla(MSG.recetaCantidad);
    const notas = textoONulo(it.notas);
    if (notas && notas.length > LIMITES.notas) falla(MSG.notasLargas);
    const prev = juntos.get(it.producto_id);
    const cantidad = (prev?.cantidad ?? 0) + cant;
    if (cantidad >= 1e9) falla(MSG.recetaCantidad);
    juntos.set(it.producto_id, { cantidad, notas: prev ? prev.notas ?? notas : notas });
  }
  db.recetas_servicio = db.recetas_servicio.filter((r) => r.servicio_id !== servicioId);
  for (const [producto_id, v] of juntos)
    db.recetas_servicio.push({ servicio_id: servicioId, producto_id, cantidad: redondear(v.cantidad, 3), notas: v.notas });
}

// ======================================================================
// Gastos (admin)
// ======================================================================

export function mesesDeFrecuencia(f: FrecuenciaGasto): number {
  return f === 'bimestral' ? 2 : f === 'trimestral' ? 3 : f === 'anual' ? 12 : 1;
}

/** Primer vencimiento en o después de hoy para un día de pago. */
export function primerVencimiento(hoy: string, diaPago: number): string {
  const este = fechaEnMes(inicioMes(hoy), diaPago);
  return este >= hoy ? este : sumarMeses(este, 1, diaPago);
}

export function guardarGasto(ctx: Ctx, g: GastoEditable): void {
  const u = exigirAdmin(ctx);
  const { db } = ctx;
  const monto = Number(g.monto);
  if (!Number.isFinite(monto) || monto <= 0) falla(MSG_EXTRA.monto);
  if (!(g.concepto ?? '').trim() || !db.categorias_gasto.some((c) => c.id === g.categoria_id)) falla(MSG_EXTRA.datoFaltante);
  const fecha = g.fecha && esFecha(g.fecha) ? g.fecha : hoyDe(ctx);
  const datos = {
    categoria_id: g.categoria_id,
    concepto: g.concepto.trim(),
    monto: redondear(monto, 2),
    fecha,
    periodo: inicioMes(g.periodo && esFecha(g.periodo) ? g.periodo : fecha),
    metodo_pago: g.metodo_pago ?? null,
    proveedor: textoONulo(g.proveedor),
    comprobante_url: textoONulo(g.comprobante_url),
    recurrente_id: g.recurrente_id || null,
    notas: textoONulo(g.notas),
  };
  if (g.id) {
    const fila = db.gastos.find((x) => x.id === g.id);
    if (!fila) falla(MSG_EXTRA.noExiste);
    Object.assign(fila, datos);
    return;
  }
  db.gastos.push({ id: uuid(), ...datos, registrado_por: u.id, creado_en: ahoraIso(ctx) });
  // Trigger: un gasto ligado a un recurrente avanza su próximo vencimiento un periodo.
  const r = datos.recurrente_id ? db.gastos_recurrentes.find((x) => x.id === datos.recurrente_id) : null;
  if (r) r.proximo_vencimiento = sumarMeses(r.proximo_vencimiento ?? fecha, mesesDeFrecuencia(r.frecuencia), r.dia_pago);
}

export function eliminarGasto(ctx: Ctx, id: string): void {
  exigirAdmin(ctx);
  ctx.db.gastos = ctx.db.gastos.filter((g) => g.id !== id);
}

export function guardarGastoRecurrente(ctx: Ctx, g: GastoRecurrenteEditable): void {
  exigirAdmin(ctx);
  const { db } = ctx;
  const dia = Math.round(Number(g.dia_pago));
  if (!(g.concepto ?? '').trim() || !db.categorias_gasto.some((c) => c.id === g.categoria_id) || !(dia >= 1 && dia <= 31))
    falla(MSG_EXTRA.datoFaltante);
  const monto = g.monto_estimado === null || g.monto_estimado === undefined ? null : Number(g.monto_estimado);
  const datos = {
    categoria_id: g.categoria_id,
    concepto: g.concepto.trim(),
    monto_estimado: monto !== null && Number.isFinite(monto) ? redondear(monto, 2) : null,
    frecuencia: g.frecuencia,
    dia_pago: dia,
    proximo_vencimiento: g.proximo_vencimiento && esFecha(g.proximo_vencimiento) ? g.proximo_vencimiento : null,
    activo: g.activo !== false,
    notas: textoONulo(g.notas),
  };
  if (g.id) {
    const fila = db.gastos_recurrentes.find((x) => x.id === g.id);
    if (!fila) falla(MSG_EXTRA.noExiste);
    Object.assign(fila, datos);
    return;
  }
  db.gastos_recurrentes.push({ id: uuid(), ...datos, proximo_vencimiento: datos.proximo_vencimiento ?? primerVencimiento(hoyDe(ctx), dia) });
}

// ======================================================================
// Catálogo, equipo, agenda y clientas (escrituras directas de ESPEC §6.1)
// ======================================================================

/** Slug sin acentos; `guionBajo` lo conserva como en guardar_paquete ([^a-z0-9_-]+ → '-'). */
function slugLimpio(s: string, guionBajo = false): string {
  const base = (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return guionBajo
    ? base.replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '')
    : base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function guardarServicio(ctx: Ctx, s: ServicioEditable): void {
  exigirAdmin(ctx);
  const { db } = ctx;
  const slug = slugLimpio(s.slug || s.nombre);
  if (!slug || !(s.nombre ?? '').trim() || !db.categorias_servicio.some((c) => c.id === s.categoria_id)) falla(MSG_EXTRA.datoFaltante);
  if (db.servicios.some((x) => x.slug === slug && x.id !== s.id)) falla(MSG_EXTRA.slugUsado);
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Math.max(0, Number(v)));
  const datos = {
    categoria_id: s.categoria_id,
    slug,
    nombre: s.nombre.trim(),
    descripcion: textoONulo(s.descripcion),
    zonas_incluye: textoONulo(s.zonas_incluye),
    duracion_min: num(s.duracion_min),
    duracion_primera_vez_min: num(s.duracion_primera_vez_min),
    precio: num(s.precio),
    etapa: s.etapa ?? 'disponible',
    es_complemento: !!s.es_complemento,
    reservable_en_linea: s.reservable_en_linea !== false,
    vendible_en_linea: s.vendible_en_linea !== false,
    tipo_consentimiento: s.tipo_consentimiento ?? null,
    activo: s.activo !== false,
    orden: Number(s.orden) || 0,
  };
  // R6: un servicio que se puede agendar debe decir qué consentimiento firma la clienta (tg_servicios_consentimiento).
  if (datos.activo && datos.etapa === 'disponible' && !datos.tipo_consentimiento) falla(MSG.servicioSinConsentimiento);
  if (s.id) {
    const fila = db.servicios.find((x) => x.id === s.id);
    if (!fila) falla(MSG_EXTRA.noExiste);
    Object.assign(fila, datos);
  } else db.servicios.push({ id: uuid(), ...datos });
}

/**
 * guardar_paquete (admin): upsert del paquete + reemplazo de sus servicios en un solo paso.
 * Cantidades enteras 1–99 (repetidos se suman); un bono es N sesiones de un solo servicio.
 */
export function guardarPaquete(ctx: Ctx, p: PaqueteEditable): void {
  exigirAdmin(ctx);
  const { db } = ctx;
  const fila = p.id ? db.paquetes.find((x) => x.id === p.id) : undefined;
  if (p.id && !fila) falla(MSG.paqueteNoExiste);
  const nombre = textoONulo(p.nombre);
  if (!nombre) falla(MSG.paqueteNombre);
  if (nombre.length > LIMITES.nombre) falla(MSG.nombreLargo);
  const slug = slugLimpio(textoONulo(p.slug) ?? nombre, true);
  if (!slug) falla(MSG.paqueteSlug);
  if (db.paquetes.some((x) => x.slug === slug && x.id !== p.id)) falla(MSG.paqueteSlugUsado);
  const tipo = p.tipo ?? 'combo';
  if (tipo !== 'combo' && tipo !== 'bono') falla(MSG.paqueteTipo);
  const precio = numeroOpcional(p.precio);
  if (precio !== null && !Number.isFinite(precio)) falla(MSG.precio);
  if (precio !== null && precio < 0) falla(MSG.precioNegativo);
  const duracion = numeroOpcional(p.duracion_min);
  if (duracion !== null && !(Number.isInteger(duracion) && duracion >= 0)) falla(MSG.duracion);
  const vigencia = numeroOpcional(p.vigencia_dias);
  if (vigencia !== null && !(Number.isInteger(vigencia) && vigencia > 0)) falla(MSG.vigencia);

  if (!Array.isArray(p.items) || p.items.length === 0) falla(MSG.paqueteSinServicios);
  const items = new Map<string, number>();
  for (const it of p.items) {
    if (!it || !db.servicios.some((s) => s.id === it.servicio_id)) falla(MSG.paqueteServicioNoExiste);
    const cant = numeroOpcional(it.cantidad) ?? 1;
    if (!Number.isInteger(cant) || cant < 1 || cant > LIMITES.cantidadMaxima) falla(MSG_EXTRA.cantidad);
    const total = (items.get(it.servicio_id) ?? 0) + cant;
    if (total > LIMITES.cantidadMaxima) falla(MSG_EXTRA.cantidad);
    items.set(it.servicio_id, total);
  }
  if (tipo === 'bono' && items.size !== 1) falla(MSG.bonoUnServicio);

  const datos = {
    slug,
    nombre,
    descripcion: textoONulo(p.descripcion),
    tipo,
    precio: precio === null ? null : redondear(precio, 2),
    duracion_min: duracion,
    vigencia_dias: vigencia,
    activo: p.activo !== false,
    orden: Math.trunc(Number(p.orden)) || 0,
  };
  let id = p.id;
  if (fila) Object.assign(fila, datos);
  else {
    id = uuid();
    db.paquetes.push({ id, ...datos });
  }
  db.paquete_servicios = db.paquete_servicios.filter((x) => x.paquete_id !== id);
  for (const [servicio_id, cantidad] of items) db.paquete_servicios.push({ paquete_id: id!, servicio_id, cantidad });
}

export function guardarPersonal(ctx: Ctx, p: PersonalEditable): void {
  exigirAdmin(ctx);
  const { db } = ctx;
  const slug = slugLimpio(p.slug || p.nombre);
  if (!slug || !(p.nombre ?? '').trim()) falla(MSG_EXTRA.datoFaltante);
  if (db.personal.some((x) => x.slug === slug && x.id !== p.id)) falla(MSG_EXTRA.slugUsado);
  const datos = {
    slug,
    nombre: p.nombre.trim(),
    titulo: textoONulo(p.titulo),
    bio: textoONulo(p.bio),
    foto_url: textoONulo(p.foto_url),
    color_agenda: p.color_agenda || '#5C6B3F',
    activo: p.activo !== false,
    mostrar_en_sitio: p.mostrar_en_sitio !== false,
    orden: Number(p.orden) || 0,
  };
  if (p.id) {
    const fila = db.personal.find((x) => x.id === p.id);
    if (!fila) falla(MSG_EXTRA.noExiste);
    Object.assign(fila, datos);
  } else db.personal.push({ id: uuid(), usuario_id: null, ...datos, creado_en: ahoraIso(ctx) });
}

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Hora 'H:MM', 'HH:MM' o 'HH:MM:SS' → 'HH:MM' (o null si no es una hora válida). */
function horaDe(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Día de la semana entero 0–6 (número o texto); si no, null. */
function diaDe(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
}

/**
 * guardar_horarios (admin): reemplaza todos los rangos de la persona. Puede haber varios por día
 * (comida), pero no encimados: 10–14 y 14–19 sí; 10–14 y 13–19 no.
 */
export function guardarHorarios(ctx: Ctx, personalId: string, horarios: Horario[]): void {
  exigirAdmin(ctx);
  const { db } = ctx;
  if (!db.personal.some((p) => p.id === personalId)) falla(MSG.personalNoExiste);
  if (!Array.isArray(horarios)) falla(MSG.horarios);
  const rangos = horarios.map((h, n) => {
    const dia = diaDe(h?.dia_semana);
    if (dia === null) falla(MSG.diaSemana);
    const ini = horaDe(h.hora_inicio);
    const fin = horaDe(h.hora_fin);
    if (ini === null || fin === null) falla(MSG.horasFaltantes);
    if (fin <= ini) falla(MSG.rangoHorario);
    return { n, dia, ini, fin };
  });
  // Primer par encimado el mismo día (por día, inicio del primero e inicio del segundo), como en SQL.
  let choque: { a: (typeof rangos)[number]; b: (typeof rangos)[number] } | null = null;
  for (const a of rangos)
    for (const b of rangos) {
      if (a.n === b.n || a.dia !== b.dia) continue;
      if (!(a.ini < b.ini || (a.ini === b.ini && a.n < b.n))) continue;
      if (!(b.ini < a.fin && a.ini < b.fin)) continue;
      const antes =
        !choque ||
        a.dia < choque.a.dia ||
        (a.dia === choque.a.dia && (a.ini < choque.a.ini || (a.ini === choque.a.ini && b.ini < choque.b.ini)));
      if (antes) choque = { a, b };
    }
  if (choque)
    falla(MSG.horariosEncimados(NOMBRES_DIA[choque.a.dia], `${choque.a.ini}–${choque.a.fin}`, `${choque.b.ini}–${choque.b.fin}`));
  const nuevos = [...rangos]
    .sort((x, y) => x.dia - y.dia || x.ini.localeCompare(y.ini))
    .map((r) => ({ id: uuid(), personal_id: personalId, dia_semana: r.dia, hora_inicio: r.ini, hora_fin: r.fin }));
  db.horarios = db.horarios.filter((h) => h.personal_id !== personalId).concat(nuevos);
}

export function guardarCapacitacion(ctx: Ctx, c: CapacitacionEditable): void {
  exigirAdmin(ctx);
  const { db } = ctx;
  if (!(c.nombre ?? '').trim() || !db.personal.some((p) => p.id === c.personal_id)) falla(MSG_EXTRA.datoFaltante);
  const horas = c.horas === null || c.horas === undefined || (c.horas as unknown) === '' ? null : Number(c.horas);
  const datos = {
    personal_id: c.personal_id,
    nombre: c.nombre.trim(),
    institucion: textoONulo(c.institucion),
    tipo: c.tipo ?? 'curso',
    fecha: c.fecha && esFecha(c.fecha) ? c.fecha : null,
    horas: horas !== null && Number.isFinite(horas) ? horas : null,
    constancia_url: textoONulo(c.constancia_url),
    mostrar_en_sitio: c.mostrar_en_sitio !== false,
    notas: textoONulo(c.notas),
  };
  if (c.id) {
    const fila = db.capacitaciones.find((x) => x.id === c.id);
    if (!fila) falla(MSG_EXTRA.noExiste);
    Object.assign(fila, datos);
  } else db.capacitaciones.push({ id: uuid(), ...datos, creado_en: ahoraIso(ctx) });
}

export function eliminarCapacitacion(ctx: Ctx, id: string): void {
  exigirAdmin(ctx);
  ctx.db.capacitaciones = ctx.db.capacitaciones.filter((c) => c.id !== id);
}

export function guardarBloqueo(ctx: Ctx, b: Omit<BloqueoAgenda, 'id'> & { id?: string }): void {
  exigirPersonal(ctx);
  const { db } = ctx;
  const ini = ms(b.inicio);
  const fin = ms(b.fin);
  if (!Number.isFinite(ini) || !Number.isFinite(fin)) falla(MSG_EXTRA.datoFaltante);
  if (fin <= ini) falla(MSG_EXTRA.rangoBloqueo);
  if (b.personal_id && !db.personal.some((p) => p.id === b.personal_id)) falla(MSG_EXTRA.noExiste);
  const datos = { personal_id: b.personal_id || null, inicio: iso(ini), fin: iso(fin), motivo: textoONulo(b.motivo) };
  if (b.id) {
    const fila = db.bloqueos_agenda.find((x) => x.id === b.id);
    if (!fila) falla(MSG_EXTRA.noExiste);
    Object.assign(fila, datos);
  } else db.bloqueos_agenda.push({ id: uuid(), ...datos, creado_en: ahoraIso(ctx) });
}

export function eliminarBloqueo(ctx: Ctx, id: string): void {
  exigirPersonal(ctx);
  ctx.db.bloqueos_agenda = ctx.db.bloqueos_agenda.filter((b) => b.id !== id);
}

export function crearCliente(ctx: Ctx, c: NuevoCliente): string {
  exigirPersonal(ctx);
  const { db } = ctx;
  if (!(c.nombre ?? '').trim()) falla(MSG_EXTRA.nombre);
  const email = textoONulo(c.email)?.toLowerCase() ?? null;
  if (email && !emailValido(email)) falla(MSG_EXTRA.correoInvalido);
  if (email && db.clientes.some((x) => (x.email ?? '').toLowerCase() === email)) falla(MSG_EXTRA.clienteCorreoUsado);
  const t = ahoraIso(ctx);
  const id = uuid();
  db.clientes.push({
    id,
    usuario_id: null,
    nombre: c.nombre.trim(),
    apellidos: textoONulo(c.apellidos),
    telefono: textoONulo(c.telefono),
    email,
    fecha_nacimiento: textoONulo(c.fecha_nacimiento),
    como_nos_conocio: null,
    acepta_promociones: false,
    notas_internas: textoONulo(c.notas_internas),
    creado_en: t,
    actualizado_en: t,
  });
  return id;
}

export function guardarNotasCliente(ctx: Ctx, clienteId: string, notas: string): void {
  exigirPersonal(ctx);
  const c = ctx.db.clientes.find((x) => x.id === clienteId);
  if (!c) falla(MSG_EXTRA.clienteNoExiste);
  c.notas_internas = textoONulo(notas);
  c.actualizado_en = ahoraIso(ctx);
}
