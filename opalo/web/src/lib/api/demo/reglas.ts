// "Servidor" del modo demostración: las RPC y escrituras de ESPEC §5–§6 con las reglas R1–R13.
// Cada función recibe un Ctx (base, hora real, usuario) y lanza ErrorOpalo con el mensaje canónico.
import { diaSemana, edad, fechaLocal, inicioMes, isoDesdeLocal, sumarDias, telefonoBonito } from '../../format';
import {
  POLITICAS_GENERALES,
  type CapacitacionEditable,
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
  type MetodoPago,
  type NuevaCompra,
  type NuevoCliente,
  type NuevoPago,
  type OrigenCita,
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
  type TipoMovimiento,
  type TipoPolitica,
  type BloqueoAgenda,
} from '../tipos';
import type {
  CabinaFila,
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
  miCliente,
  miClienteOpcional,
  MSG,
  MSG_EXTRA,
} from './permisos';
import {
  emailValido,
  esFecha,
  falla,
  fechaEnMes,
  iso,
  ms,
  MS_HORA,
  MS_MIN,
  redondear,
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

/** Crea el usuario, su perfil y crea o vincula su fila de clientes (como el trigger). */
export function crearUsuario(ctx: Ctx, d: DatosNuevoUsuario): UsuarioFila {
  const { db } = ctx;
  const email = (d.email ?? '').trim().toLowerCase();
  if (!emailValido(email)) falla(MSG_EXTRA.correoInvalido);
  if ((d.password ?? '').length < 6) falla(MSG_EXTRA.password);
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
  c.nombre = d.nombre.trim();
  c.apellidos = textoONulo(d.apellidos);
  c.telefono = textoONulo(d.telefono);
  c.fecha_nacimiento = textoONulo(d.fecha_nacimiento);
  c.acepta_promociones = !!d.acepta_promociones;
  c.actualizado_en = ahoraIso(ctx);
  return c;
}

/** guardar_ficha_salud: nueva fila de historial (la última es la vigente). */
export function guardarFicha(ctx: Ctx, f: FichaSalud): string {
  const c = miCliente(ctx);
  if (f.acepta_datos_sensibles !== true) falla(MSG.datosSensibles);
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
  if (!ORDEN_POLITICAS.includes(tipo) || !(titulo ?? '').trim() || !(contenido_md ?? '').trim()) falla(MSG_EXTRA.datoFaltante);
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

function resolverItems(db: Db, items: ItemReserva[], clienteId: string, hoy: string, staff: boolean): ItemResuelto[] {
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
        (credito.vence_en !== null && credito.vence_en < hoy) ||
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

/** Alertas de la ficha vigente que aplican a las categorías reservadas. */
export function alertasPara(db: Db, clienteId: string, slugs: Set<string>): { alertas: string[]; requiereRevision: boolean } {
  const ficha = fichaVigenteFila(db, clienteId);
  const alertas: string[] = [];
  let requiereRevision = false;
  if (!ficha) return { alertas, requiereRevision };
  const contras = db.contraindicaciones.filter((c) => c.activa).sort((a, b) => a.orden - b.orden);
  for (const c of contras) {
    if (ficha.respuestas[c.clave] !== true) continue;
    const aplica = !c.categorias || c.categorias.length === 0 || c.categorias.some((s) => slugs.has(s));
    if (!aplica) continue;
    alertas.push(c.pregunta);
    if (c.accion === 'revisar' || c.accion === 'no_se_realiza') requiereRevision = true;
  }
  return { alertas, requiereRevision };
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

function esMenorDeEdad(db: Db, cliente: ClienteFila, hoy: string): boolean {
  return cliente.fecha_nacimiento ? edad(cliente.fecha_nacimiento, hoy) < db.configuracion.edad_mayoria : false;
}

function validarEdadMinima(db: Db, cliente: ClienteFila, hoy: string): void {
  if (cliente.fecha_nacimiento && edad(cliente.fecha_nacimiento, hoy) < db.configuracion.edad_minima)
    falla(MSG.edadMinima(db.configuracion.edad_minima));
}

function firmaCompleta(f: DatosFirma | null | undefined): boolean {
  return !!f && !!(f.nombre_firmante ?? '').trim() && !!(f.firma_svg ?? '').trim();
}

/** Un consentimiento por cada tipo distinto de los servicios de la cita (si aún no está firmado). */
export function crearConsentimientos(ctx: Ctx, cita: CitaFila, firma: DatosFirma, esMenor: boolean): number {
  const { db } = ctx;
  const items = db.cita_items.filter((i) => i.cita_id === cita.id);
  const tipos = tiposConsentimiento(db, expandirServicios(db, items).keys());
  const ficha = fichaVigenteFila(db, cita.cliente_id);
  const firmado_en = ahoraIso(ctx);
  let n = 0;
  for (const tipo of tipos) {
    const pol = politicaActiva(db, tipo);
    if (!pol) continue;
    const yaFirmado = db.consentimientos.some((k) => {
      if (k.cita_id !== cita.id) return false;
      return db.politicas.find((p) => p.id === k.politica_id)?.tipo === tipo;
    });
    if (yaFirmado) continue;
    db.consentimientos.push({
      id: uuid(),
      cliente_id: cita.cliente_id,
      cita_id: cita.id,
      politica_id: pol.id,
      ficha_salud_id: ficha?.id ?? null,
      nombre_firmante: firma.nombre_firmante.trim(),
      firma_svg: firma.firma_svg,
      es_menor: esMenor,
      tutor_nombre: esMenor ? textoONulo(firma.tutor_nombre) : null,
      documento_hash: sha256(`${pol.hash_sha256 ?? ''}${ficha?.id ?? ''}${firmado_en}`),
      ip: null,
      user_agent: ctx.userAgent,
      firmado_en,
    });
    n++;
  }
  return n;
}

/** reservar_cita (clienta). */
export function reservarCita(ctx: Ctx, s: SolicitudReserva): ResultadoReserva {
  const { db } = ctx;
  const cliente = miCliente(ctx);
  const hoy = hoyDe(ctx);

  for (const tipo of POLITICAS_GENERALES) {
    const pol = politicaActiva(db, tipo);
    if (pol && !db.aceptaciones_politica.some((a) => a.cliente_id === cliente.id && a.politica_id === pol.id)) falla(MSG.politicas);
  }
  if (!fichaVigenteFila(db, cliente.id)) falla(MSG.ficha);
  validarEdadMinima(db, cliente, hoy);
  const esMenor = esMenorDeEdad(db, cliente, hoy);
  if (esMenor && !(s.firma?.tutor_nombre ?? '').trim()) falla(MSG.tutor);
  if (!firmaCompleta(s.firma)) falla(MSG.firma);

  const resueltos = resolverItems(db, s.items, cliente.id, hoy, false);
  const dur = duracionReserva(db, s.items);
  const servicioIds = [...expandirServicios(db, s.items).keys()];

  const inicio = ms(s.inicio);
  if (!Number.isFinite(inicio)) falla(MSG.noDisponible);
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
  crearConsentimientos(ctx, cita, s.firma, esMenor);
  return { id: cita.id, estado: cita.estado, requiere_revision: cita.requiere_revision, alertas: [...cita.alertas] };
}

/** reservar_cita_staff (personal): sin firma; respeta citas, cabinas y bloqueos, no el horario publicado. */
export function reservarCitaStaff(ctx: Ctx, s: SolicitudReservaStaff): ResultadoReserva {
  exigirPersonal(ctx);
  const { db } = ctx;
  const cliente = db.clientes.find((c) => c.id === s.cliente_id);
  if (!cliente) falla(MSG_EXTRA.clienteNoExiste);
  const hoy = hoyDe(ctx);
  validarEdadMinima(db, cliente, hoy);
  const resueltos = resolverItems(db, s.items, cliente.id, hoy, true);
  const dur = duracionReserva(db, s.items);
  const servicioIds = [...expandirServicios(db, s.items).keys()];
  const inicio = ms(s.inicio);
  if (!Number.isFinite(inicio)) falla(MSG.noDisponible);
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

/** firmar_consentimiento_cita: dueña de la cita o personal (tablet de cabina). */
export function firmarConsentimientoCita(ctx: Ctx, citaId: string, firma: DatosFirma): void {
  exigirSesion(ctx);
  const { db } = ctx;
  const cita = buscarCita(db, citaId);
  const mia = miClienteOpcional(ctx)?.id === cita.cliente_id;
  if (!mia && !esPersonal(ctx)) falla(MSG.permiso);
  if (!['pendiente', 'confirmada', 'en_curso'].includes(cita.estado)) falla(MSG_EXTRA.citaNoFirmable);
  const cliente = db.clientes.find((c) => c.id === cita.cliente_id)!;
  const esMenor = esMenorDeEdad(db, cliente, hoyDe(ctx));
  if (esMenor && !(firma?.tutor_nombre ?? '').trim()) falla(MSG.tutor);
  if (!firmaCompleta(firma)) falla(MSG.firma);
  crearConsentimientos(ctx, cita, firma, esMenor);
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
  m: Omit<MovimientoFila, 'id' | 'creado_en' | 'creado_por' | 'cita_id' | 'compra_id' | 'pedido_id' | 'nota'> &
    Partial<Pick<MovimientoFila, 'cita_id' | 'compra_id' | 'pedido_id' | 'nota'>>,
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
  if (cita.estado === 'cancelada') falla(MSG_EXTRA.citaCancelada);
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
  if (cita.estado === 'cancelada') falla(MSG_EXTRA.citaCancelada);
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
  cita.estado = estado;
  cita.actualizado_en = ahoraIso(ctx);
}

// ======================================================================
// R8 pedidos · R9 pagos · R10 regalos
// ======================================================================

export function crearPedido(ctx: Ctx, items: ItemPedidoNuevo[], metodo: MetodoPago, notas?: string | null): ResultadoPedido {
  const c = miCliente(ctx);
  const { db } = ctx;
  if (!Array.isArray(items) || items.length === 0) falla(MSG_EXTRA.carritoVacio);
  const filas = items.map((it) => {
    const cantidad = Number(it.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1) falla(MSG_EXTRA.cantidad);
    let precio: number | null = null;
    let descripcion = '';
    if (it.tipo === 'servicio') {
      const s = db.servicios.find((x) => x.id === it.id);
      if (!s || !s.activo || s.etapa !== 'disponible' || !s.vendible_en_linea || s.precio === null) falla(MSG.noVendible);
      precio = s.precio;
      descripcion = s.nombre;
    } else if (it.tipo === 'paquete') {
      const p = db.paquetes.find((x) => x.id === it.id);
      if (!p || !p.activo || p.precio === null) falla(MSG.noVendible);
      precio = p.precio;
      descripcion = p.nombre;
    } else if (it.tipo === 'producto') {
      const p = db.productos.find((x) => x.id === it.id);
      if (!p || !p.activo || !p.vendible_en_linea || p.precio_venta === null) falla(MSG.noVendible);
      precio = p.precio_venta;
      descripcion = p.presentacion ? `${p.nombre} · ${p.presentacion}` : p.nombre;
    } else falla(MSG.noVendible);
    return { it, cantidad, precio: precio as number, descripcion };
  });
  db.folio_pedidos += 1;
  const t = ahoraIso(ctx);
  const pedido: PedidoFila = {
    id: uuid(),
    folio: `OP-${String(db.folio_pedidos).padStart(5, '0')}`,
    cliente_id: c.id,
    estado: 'pendiente_pago',
    total: redondear(filas.reduce((s, f) => s + f.cantidad * f.precio, 0), 2),
    metodo_pago_preferido: metodo ?? 'efectivo',
    notas: textoONulo(notas),
    creado_en: t,
    pagado_en: null,
    cancelado_en: null,
  };
  db.pedidos.push(pedido);
  for (const f of filas)
    db.pedido_items.push({
      id: uuid(),
      pedido_id: pedido.id,
      tipo: f.it.tipo,
      servicio_id: f.it.tipo === 'servicio' ? f.it.id : null,
      paquete_id: f.it.tipo === 'paquete' ? f.it.id : null,
      producto_id: f.it.tipo === 'producto' ? f.it.id : null,
      descripcion: f.descripcion,
      cantidad: f.cantidad,
      precio_unitario: f.precio,
      regalo_para: textoONulo(f.it.regalo_para),
    });
  return { id: pedido.id, folio: pedido.folio, total: pedido.total };
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
          nota: `Venta ${pedido.folio}`,
        });
      continue;
    }
    const paquete = it.paquete_id ? db.paquetes.find((x) => x.id === it.paquete_id) ?? null : null;
    const vence_en = sumarDias(hoy, paquete?.vigencia_dias ?? db.configuracion.vigencia_creditos_dias);
    const nuevo = (servicio_id: string | null, paquete_id: string | null, cantidad: number) => {
      db.creditos.push({
        id: uuid(),
        cliente_id: pedido.cliente_id,
        servicio_id,
        paquete_id,
        cantidad,
        usados: 0,
        pedido_item_id: it.id,
        codigo_regalo: it.regalo_para ? codigoRegaloUnico(db) : null,
        regalo_para: it.regalo_para,
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
  if (!Number.isFinite(monto) || monto <= 0) falla(MSG_EXTRA.monto);
  if (!Number.isFinite(propina) || propina < 0) falla(MSG_EXTRA.propina);
  if (!p.pedido_id && !p.cita_id) falla(MSG_EXTRA.pagoSinDestino);
  const pedido = p.pedido_id ? db.pedidos.find((x) => x.id === p.pedido_id) : null;
  if (p.pedido_id && !pedido) falla(MSG_EXTRA.pedidoNoExiste);
  if (pedido && pedido.estado === 'cancelado') falla(MSG_EXTRA.pedidoCancelado);
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

/** R10 canjear_regalo: el crédito pasa a la clienta y se limpia el código. */
export function canjearRegalo(ctx: Ctx, codigo: string): string {
  const c = miCliente(ctx);
  const cod = (codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cr = cod ? ctx.db.creditos.find((x) => x.codigo_regalo === cod) : undefined;
  if (!cr) falla(MSG.regalo);
  cr.cliente_id = c.id;
  cr.codigo_regalo = null;
  return cr.id;
}

// ======================================================================
// R11 compras · ajustes · productos · recetas
// ======================================================================

export function registrarCompra(ctx: Ctx, c: NuevaCompra): string {
  const u = exigirPersonal(ctx);
  const { db } = ctx;
  if (!Array.isArray(c.items) || c.items.length === 0) falla(MSG_EXTRA.compraVacia);
  const items = c.items.map((it) => {
    const p = db.productos.find((x) => x.id === it.producto_id);
    if (!p) falla(MSG_EXTRA.productoNoExiste);
    const presentaciones = Number(it.presentaciones);
    const costo = Number(it.costo_presentacion);
    if (!Number.isFinite(presentaciones) || presentaciones <= 0 || !Number.isFinite(costo) || costo < 0) falla(MSG_EXTRA.cantidad);
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
  if (tipo !== 'ajuste' && tipo !== 'merma') falla(MSG.permiso);
  const p = ctx.db.productos.find((x) => x.id === productoId);
  if (!p) falla(MSG_EXTRA.productoNoExiste);
  let cant = Number(cantidad);
  if (!Number.isFinite(cant) || cant === 0) falla(MSG_EXTRA.cantidadCero);
  if (tipo === 'merma') cant = -Math.abs(cant);
  insertarMovimiento(ctx, { producto_id: p.id, tipo, cantidad: cant, costo_unitario: costoUnitario(p), nota: textoONulo(nota) });
}

export function guardarProducto(ctx: Ctx, e: ProductoEditable): ProductoFila {
  exigirPersonal(ctx);
  const { db } = ctx;
  if (!(e.nombre ?? '').trim() || !(Number(e.contenido_presentacion) > 0) || Number(e.costo_presentacion) < 0) falla(MSG_EXTRA.datoFaltante);
  const t = ahoraIso(ctx);
  const datos = {
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
  if (e.id) {
    const p = db.productos.find((x) => x.id === e.id);
    if (!p) falla(MSG_EXTRA.noExiste);
    Object.assign(p, datos, { actualizado_en: t });
    return p;
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

export function guardarReceta(ctx: Ctx, servicioId: string, items: RecetaItem[]): void {
  exigirPersonal(ctx);
  const { db } = ctx;
  if (!db.servicios.some((s) => s.id === servicioId)) falla(MSG_EXTRA.noExiste);
  const juntos = new Map<string, { cantidad: number; notas: string | null }>();
  for (const it of items ?? []) {
    const cant = Number(it.cantidad);
    if (!db.productos.some((p) => p.id === it.producto_id)) falla(MSG_EXTRA.productoNoExiste);
    if (!Number.isFinite(cant) || cant <= 0) falla(MSG_EXTRA.cantidad);
    const prev = juntos.get(it.producto_id);
    juntos.set(it.producto_id, { cantidad: (prev?.cantidad ?? 0) + cant, notas: textoONulo(it.notas) ?? prev?.notas ?? null });
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

function slugLimpio(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
  if (s.id) {
    const fila = db.servicios.find((x) => x.id === s.id);
    if (!fila) falla(MSG_EXTRA.noExiste);
    Object.assign(fila, datos);
  } else db.servicios.push({ id: uuid(), ...datos });
}

export function guardarPaquete(ctx: Ctx, p: PaqueteEditable): void {
  exigirAdmin(ctx);
  const { db } = ctx;
  const slug = slugLimpio(p.slug || p.nombre);
  if (!slug || !(p.nombre ?? '').trim()) falla(MSG_EXTRA.datoFaltante);
  if (db.paquetes.some((x) => x.slug === slug && x.id !== p.id)) falla(MSG_EXTRA.slugUsado);
  const items = new Map<string, number>();
  for (const it of p.items ?? []) {
    const cant = Math.round(Number(it.cantidad));
    if (!db.servicios.some((s) => s.id === it.servicio_id)) falla(MSG_EXTRA.noExiste);
    if (!(cant >= 1)) falla(MSG_EXTRA.cantidad);
    items.set(it.servicio_id, (items.get(it.servicio_id) ?? 0) + cant);
  }
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Math.max(0, Number(v)));
  const datos = {
    slug,
    nombre: p.nombre.trim(),
    descripcion: textoONulo(p.descripcion),
    tipo: p.tipo ?? 'combo',
    precio: num(p.precio),
    duracion_min: num(p.duracion_min),
    vigencia_dias: num(p.vigencia_dias),
    activo: p.activo !== false,
    orden: Number(p.orden) || 0,
  };
  let id = p.id;
  if (id) {
    const fila = db.paquetes.find((x) => x.id === id);
    if (!fila) falla(MSG_EXTRA.noExiste);
    Object.assign(fila, datos);
  } else {
    id = uuid();
    db.paquetes.push({ id, ...datos });
  }
  db.paquete_servicios = db.paquete_servicios.filter((x) => x.paquete_id !== id);
  for (const [servicio_id, cantidad] of items) db.paquete_servicios.push({ paquete_id: id, servicio_id, cantidad });
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

export function guardarHorarios(ctx: Ctx, personalId: string, horarios: Horario[]): void {
  exigirAdmin(ctx);
  const { db } = ctx;
  if (!db.personal.some((p) => p.id === personalId)) falla(MSG_EXTRA.noExiste);
  const limpios = (horarios ?? []).map((h) => {
    const ini = (h.hora_inicio ?? '').slice(0, 5);
    const fin = (h.hora_fin ?? '').slice(0, 5);
    if (!(h.dia_semana >= 0 && h.dia_semana <= 6) || !/^\d{2}:\d{2}$/.test(ini) || !/^\d{2}:\d{2}$/.test(fin)) falla(MSG_EXTRA.datoFaltante);
    if (fin <= ini) falla(MSG_EXTRA.rangoHorario);
    return { id: uuid(), personal_id: personalId, dia_semana: h.dia_semana, hora_inicio: ini, hora_fin: fin };
  });
  db.horarios = db.horarios.filter((h) => h.personal_id !== personalId).concat(limpios);
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
