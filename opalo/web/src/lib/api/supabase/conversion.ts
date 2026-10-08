// Conversión de filas de PostgREST (numeric como texto o número, jsonb, timestamptz con zona)
// a los tipos de tipos.ts. Todas las funciones toleran null/undefined y valores de más.
import { fechaLocal, inicioMes, isoDesdeLocal, sumarDias } from '../../format';
import { ErrorOpalo } from '../tipos';
import type {
  AccionContraindicacion,
  BloqueoAgenda,
  Capacitacion,
  CategoriaGasto,
  CategoriaProducto,
  Categoria,
  CitaDetalle,
  Cliente,
  ClienteResumen,
  Configuracion,
  ConsentimientoFirmado,
  Contraindicacion,
  CostoServicio,
  Credito,
  EstadoCita,
  EstadoPedido,
  EtapaServicio,
  FichaSalud,
  FrecuenciaGasto,
  Gasto,
  GastoPorVencer,
  GastoRecurrente,
  Horario,
  ItemCita,
  ItemPedido,
  MetodoPago,
  MovimientoInventario,
  OrigenCita,
  Paquete,
  PaqueteItem,
  PedidoDetalle,
  Politica,
  Producto,
  ProductoReposicion,
  ProductoTienda,
  Proveedor,
  ResultadoMensual,
  ResultadoPedido,
  ResultadoReserva,
  Servicio,
  Slot,
  TipoCapacitacion,
  TipoItemPedido,
  TipoMovimiento,
  TipoPaquete,
  TipoPolitica,
  UnidadMedida,
  UsoProducto,
} from '../tipos';

/** Fila cruda tal como llega de PostgREST. */
export type Fila = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Primitivos
// ---------------------------------------------------------------------------

/** numeric/int → number (null, vacío o no numérico → `siNulo`). */
export function num(v: unknown, siNulo = 0): number {
  if (v === null || v === undefined || v === '') return siNulo;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : siNulo;
}

/** numeric/int → number | null. */
export function numONulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function texto(v: unknown, siNulo = ''): string {
  return v === null || v === undefined ? siNulo : String(v);
}

export function textoONulo(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

/** Texto del usuario recortado; vacío → null (para guardar). */
export function limpio(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t ? t : null;
}

export function bool(v: unknown): boolean {
  return v === true || v === 't' || v === 'true' || v === 1;
}

/** jsonb/array de Postgres → arreglo de JS (acepta también el JSON en texto). */
export function arreglo(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try {
      const x: unknown = JSON.parse(v);
      return Array.isArray(x) ? x : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** jsonb objeto → objeto de JS. */
export function objeto(v: unknown): Fila {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Fila;
  if (typeof v === 'string' && v.trim().startsWith('{')) {
    try {
      const x: unknown = JSON.parse(v);
      return x && typeof x === 'object' && !Array.isArray(x) ? (x as Fila) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function filas(v: unknown): Fila[] {
  return arreglo(v).filter((x): x is Fila => !!x && typeof x === 'object' && !Array.isArray(x));
}

/** timestamptz → ISO en UTC ('…Z'), para que las comparaciones de texto sean seguras. */
export function instante(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

export function instanteONulo(v: unknown): string | null {
  return v === null || v === undefined || v === '' ? null : instante(v);
}

/** date → 'YYYY-MM-DD'. */
export function fecha(v: unknown): string {
  return texto(v).slice(0, 10);
}

export function fechaONula(v: unknown): string | null {
  return v === null || v === undefined || v === '' ? null : fecha(v);
}

/** time → 'HH:MM'. */
export function horaCorta(v: unknown): string {
  return texto(v).slice(0, 5);
}

/** Relación embebida de PostgREST (objeto o arreglo de un elemento). */
export function embebido(v: unknown): Fila | null {
  if (Array.isArray(v)) return (v[0] as Fila | undefined) ?? null;
  return v && typeof v === 'object' ? (v as Fila) : null;
}

// ---------------------------------------------------------------------------
// Fechas y rangos (hora de Querétaro)
// ---------------------------------------------------------------------------

export function esFecha(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Rango [desde, hasta) como instantes ISO. Acepta fechas 'YYYY-MM-DD' (hora de Querétaro;
 * `hasta` incluye todo ese día) o instantes ISO.
 */
export function rangoInstantes(desde: string, hasta: string): [string, string] {
  const d = esFecha(desde) ? isoDesdeLocal(desde, '00:00') : fechaValida(desde).toISOString();
  const h = esFecha(hasta) ? isoDesdeLocal(sumarDias(hasta, 1), '00:00') : fechaValida(hasta).toISOString();
  return [d, h];
}

/** Rango de fechas inclusivo ['YYYY-MM-DD', 'YYYY-MM-DD'] (un instante ISO se pasa a fecha local). */
export function rangoFechas(desde: string, hasta: string): [string, string] {
  const d = esFecha(desde) ? desde : fechaLocal(fechaValida(desde));
  const h = esFecha(hasta) ? hasta : fechaLocal(fechaValida(hasta));
  return [d, h];
}

function fechaValida(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new ErrorOpalo('Revisa las fechas: hay una que no es válida.');
  return d;
}

/** Suma n meses a 'YYYY-MM-01'. */
export function sumarMesesAMes(mes01: string, n: number): string {
  const [a, m] = mes01.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  const na = Math.floor(total / 12);
  const nm = total - na * 12 + 1;
  return `${na}-${String(nm).padStart(2, '0')}-01`;
}

/** Los últimos `meses` meses (ascendente) que terminan en el mes local de `ahora`. */
export function ultimosMeses(ahora: Date, meses: number): string[] {
  const n = Math.max(1, Math.min(60, Math.floor(meses) || 1));
  const actual = inicioMes(fechaLocal(ahora));
  const r: string[] = [];
  for (let i = n - 1; i >= 0; i--) r.push(sumarMesesAMes(actual, -i));
  return r;
}

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------

export const ORDEN_POLITICAS: TipoPolitica[] = [
  'terminos',
  'privacidad',
  'cancelacion',
  'consentimiento_depilacion',
  'consentimiento_facial',
  'consentimiento_corporal',
];

export function aConfiguracion(f: Fila | null): Configuracion {
  const x = f ?? {};
  return {
    nombre_negocio: texto(x.nombre_negocio, 'Ópalo'),
    lema: textoONulo(x.lema),
    telefono_whatsapp: texto(x.telefono_whatsapp),
    direccion: texto(x.direccion),
    zona_horaria: texto(x.zona_horaria, 'America/Mexico_City'),
    duracion_sesion_min: num(x.duracion_sesion_min, 60),
    intervalo_slots_min: num(x.intervalo_slots_min, 60),
    anticipacion_min_horas: num(x.anticipacion_min_horas, 2),
    ventana_reserva_dias: num(x.ventana_reserva_dias, 60),
    horas_cancelacion: num(x.horas_cancelacion, 24),
    tolerancia_retraso_min: num(x.tolerancia_retraso_min, 15),
    edad_minima: num(x.edad_minima, 15),
    edad_mayoria: num(x.edad_mayoria, 18),
    vigencia_creditos_dias: num(x.vigencia_creditos_dias, 365),
  };
}

export function aCategoria(f: Fila): Categoria {
  return {
    id: texto(f.id),
    slug: texto(f.slug),
    nombre: texto(f.nombre),
    descripcion: textoONulo(f.descripcion),
    orden: num(f.orden),
  };
}

export function aServicio(f: Fila): Servicio {
  return {
    id: texto(f.id),
    categoria_id: texto(f.categoria_id),
    slug: texto(f.slug),
    nombre: texto(f.nombre),
    descripcion: textoONulo(f.descripcion),
    zonas_incluye: textoONulo(f.zonas_incluye),
    duracion_min: numONulo(f.duracion_min),
    duracion_primera_vez_min: numONulo(f.duracion_primera_vez_min),
    precio: numONulo(f.precio),
    etapa: texto(f.etapa, 'disponible') as EtapaServicio,
    es_complemento: bool(f.es_complemento),
    reservable_en_linea: f.reservable_en_linea === undefined ? true : bool(f.reservable_en_linea),
    vendible_en_linea: f.vendible_en_linea === undefined ? true : bool(f.vendible_en_linea),
    tipo_consentimiento: textoONulo(f.tipo_consentimiento) as TipoPolitica | null,
    activo: f.activo === undefined ? true : bool(f.activo),
    orden: num(f.orden),
  };
}

export function aPaqueteItem(f: Fila): PaqueteItem {
  return { servicio_id: texto(f.servicio_id), cantidad: num(f.cantidad, 1) };
}

export function aPaquete(f: Fila, items: PaqueteItem[]): Paquete {
  return {
    id: texto(f.id),
    slug: texto(f.slug),
    nombre: texto(f.nombre),
    descripcion: textoONulo(f.descripcion),
    tipo: texto(f.tipo, 'combo') as TipoPaquete,
    precio: numONulo(f.precio),
    duracion_min: numONulo(f.duracion_min),
    vigencia_dias: numONulo(f.vigencia_dias),
    activo: f.activo === undefined ? true : bool(f.activo),
    orden: num(f.orden),
    items,
  };
}

export function aCapacitacion(f: Fila): Capacitacion {
  return {
    id: texto(f.id),
    personal_id: texto(f.personal_id),
    nombre: texto(f.nombre),
    institucion: textoONulo(f.institucion),
    tipo: texto(f.tipo, 'curso') as TipoCapacitacion,
    fecha: fechaONula(f.fecha),
    horas: numONulo(f.horas),
  };
}

export function aPolitica(f: Fila): Politica {
  return {
    id: texto(f.id),
    tipo: texto(f.tipo) as TipoPolitica,
    version: num(f.version, 1),
    titulo: texto(f.titulo),
    contenido_md: texto(f.contenido_md),
    hash_sha256: textoONulo(f.hash_sha256),
    vigente_desde: instanteONulo(f.vigente_desde),
  };
}

export function compararPoliticas(a: Politica, b: Politica): number {
  return ORDEN_POLITICAS.indexOf(a.tipo) - ORDEN_POLITICAS.indexOf(b.tipo) || b.version - a.version;
}

export function aContraindicacion(f: Fila): Contraindicacion {
  const cats = f.categorias === null || f.categorias === undefined ? null : arreglo(f.categorias).map((x) => String(x));
  return {
    id: texto(f.id),
    clave: texto(f.clave),
    pregunta: texto(f.pregunta),
    ayuda: textoONulo(f.ayuda),
    categorias: cats,
    accion: texto(f.accion, 'revisar') as AccionContraindicacion,
    mensaje_cliente: textoONulo(f.mensaje_cliente),
    orden: num(f.orden),
  };
}

export function aProductoTienda(f: Fila): ProductoTienda {
  return {
    id: texto(f.id),
    nombre: texto(f.nombre),
    marca: textoONulo(f.marca),
    presentacion: textoONulo(f.presentacion),
    precio_venta: num(f.precio_venta),
    hay_stock: bool(f.hay_stock),
  };
}

export function aSlot(f: Fila): Slot {
  return {
    inicio: instante(f.inicio),
    fin: instante(f.fin),
    personal_id: texto(f.personal_id),
    personal_nombre: texto(f.personal_nombre),
  };
}

// ---------------------------------------------------------------------------
// Clienta
// ---------------------------------------------------------------------------

/** Columnas de clientes que ve la propia clienta (nunca notas_internas). */
export const COLUMNAS_CLIENTE = 'id, nombre, apellidos, telefono, email, fecha_nacimiento, acepta_promociones';

export function aCliente(f: Fila): Cliente {
  return {
    id: texto(f.id),
    nombre: texto(f.nombre),
    apellidos: textoONulo(f.apellidos),
    telefono: textoONulo(f.telefono),
    email: textoONulo(f.email),
    fecha_nacimiento: fechaONula(f.fecha_nacimiento),
    acepta_promociones: bool(f.acepta_promociones),
  };
}

export function aFichaSalud(f: Fila | null): FichaSalud | null {
  if (!f) return null;
  const respuestas: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(objeto(f.respuestas))) respuestas[k] = bool(v);
  const detalles: Record<string, string> = {};
  for (const [k, v] of Object.entries(objeto(f.detalles))) if (v !== null && v !== undefined) detalles[k] = String(v);
  return {
    respuestas,
    detalles,
    alergias: textoONulo(f.alergias),
    medicamentos: textoONulo(f.medicamentos),
    observaciones: textoONulo(f.observaciones),
    acepta_datos_sensibles: bool(f.acepta_datos_sensibles),
    creado_en: instanteONulo(f.creado_en) ?? undefined,
  };
}

export function aResultadoReserva(v: unknown): ResultadoReserva {
  const f = objeto(v);
  return {
    id: texto(f.id),
    estado: texto(f.estado, 'confirmada') as EstadoCita,
    requiere_revision: bool(f.requiere_revision),
    alertas: arreglo(f.alertas).map((x) => String(x)),
  };
}

export function aResultadoPedido(v: unknown): ResultadoPedido {
  const f = objeto(v);
  return { id: texto(f.id), folio: texto(f.folio), total: num(f.total) };
}

export function aItemCita(f: Fila): ItemCita {
  return {
    nombre: texto(f.nombre),
    precio: numONulo(f.precio),
    duracion_min: numONulo(f.duracion_min),
    servicio_id: textoONulo(f.servicio_id),
    paquete_id: textoONulo(f.paquete_id),
  };
}

/** Fila de v_citas_detalle. */
export function aCitaDetalle(f: Fila): CitaDetalle {
  return {
    id: texto(f.id),
    cliente_id: texto(f.cliente_id),
    cliente_nombre: texto(f.cliente_nombre),
    cliente_telefono: textoONulo(f.cliente_telefono),
    inicio: instante(f.inicio),
    fin: instante(f.fin),
    duracion_min: num(f.duracion_min, 60),
    estado: texto(f.estado, 'confirmada') as EstadoCita,
    origen: texto(f.origen, 'web') as OrigenCita,
    primera_vez: bool(f.primera_vez),
    requiere_revision: bool(f.requiere_revision),
    alertas: arreglo(f.alertas).map((x) => String(x)),
    notas_cliente: textoONulo(f.notas_cliente),
    total: num(f.total),
    personal_id: texto(f.personal_id),
    personal_nombre: texto(f.personal_nombre),
    personal_titulo: textoONulo(f.personal_titulo),
    cabina_nombre: textoONulo(f.cabina_nombre),
    consentimientos_firmados: num(f.consentimientos_firmados),
    pagado: num(f.pagado),
    items: filas(f.items).map(aItemCita),
  };
}

export function aItemPedido(f: Fila): ItemPedido {
  const cantidad = num(f.cantidad, 1);
  const precio = num(f.precio_unitario);
  return {
    tipo: texto(f.tipo, 'servicio') as TipoItemPedido,
    descripcion: texto(f.descripcion),
    cantidad,
    precio_unitario: precio,
    importe: f.importe === null || f.importe === undefined ? Math.round(cantidad * precio * 100) / 100 : num(f.importe),
    regalo_para: textoONulo(f.regalo_para),
  };
}

/** Fila de v_pedidos_detalle. */
export function aPedidoDetalle(f: Fila): PedidoDetalle {
  return {
    id: texto(f.id),
    folio: texto(f.folio),
    cliente_id: texto(f.cliente_id),
    cliente_nombre: texto(f.cliente_nombre),
    estado: texto(f.estado, 'pendiente_pago') as EstadoPedido,
    total: num(f.total),
    pagado: num(f.pagado),
    metodo_pago_preferido: textoONulo(f.metodo_pago_preferido) as MetodoPago | null,
    notas: textoONulo(f.notas),
    creado_en: instante(f.creado_en),
    pagado_en: instanteONulo(f.pagado_en),
    items: filas(f.items).map(aItemPedido),
  };
}

/** Fila de v_creditos. */
export function aCredito(f: Fila): Credito {
  const cantidad = num(f.cantidad);
  const usados = num(f.usados);
  return {
    id: texto(f.id),
    cliente_id: texto(f.cliente_id),
    nombre: texto(f.nombre),
    servicio_id: textoONulo(f.servicio_id),
    paquete_id: textoONulo(f.paquete_id),
    cantidad,
    usados,
    restantes: f.restantes === null || f.restantes === undefined ? cantidad - usados : num(f.restantes),
    vence_en: fechaONula(f.vence_en),
    vigente: bool(f.vigente),
    codigo_regalo: textoONulo(f.codigo_regalo),
    regalo_para: textoONulo(f.regalo_para),
    creado_en: instante(f.creado_en),
  };
}

/** Columnas de consentimientos con su política embebida. */
export const COLUMNAS_CONSENTIMIENTO =
  'id, cita_id, nombre_firmante, tutor_nombre, firma_svg, documento_hash, firmado_en, politicas(tipo, titulo, version)';

export function aConsentimiento(f: Fila): ConsentimientoFirmado {
  const pol = embebido(f.politicas);
  return {
    id: texto(f.id),
    cita_id: textoONulo(f.cita_id),
    politica_tipo: texto(pol?.tipo, 'consentimiento_depilacion') as TipoPolitica,
    politica_titulo: texto(pol?.titulo),
    politica_version: num(pol?.version, 1),
    nombre_firmante: texto(f.nombre_firmante),
    tutor_nombre: textoONulo(f.tutor_nombre),
    firma_svg: texto(f.firma_svg),
    documento_hash: textoONulo(f.documento_hash),
    firmado_en: instante(f.firmado_en),
  };
}

// ---------------------------------------------------------------------------
// Interno
// ---------------------------------------------------------------------------

/** Fila de v_clientes_resumen. */
export function aClienteResumen(f: Fila): ClienteResumen {
  return {
    id: texto(f.id),
    nombre: texto(f.nombre),
    apellidos: textoONulo(f.apellidos),
    telefono: textoONulo(f.telefono),
    email: textoONulo(f.email),
    fecha_nacimiento: fechaONula(f.fecha_nacimiento),
    tiene_cuenta: bool(f.tiene_cuenta),
    citas_completadas: num(f.citas_completadas),
    ultima_visita: instanteONulo(f.ultima_visita),
    proxima_cita: instanteONulo(f.proxima_cita),
    total_pagado: num(f.total_pagado),
    creado_en: instante(f.creado_en),
  };
}

export function aBloqueo(f: Fila): BloqueoAgenda {
  return {
    id: texto(f.id),
    personal_id: textoONulo(f.personal_id),
    inicio: instante(f.inicio),
    fin: instante(f.fin),
    motivo: textoONulo(f.motivo),
  };
}

export const COLUMNAS_PROVEEDOR = 'id, nombre, contacto, telefono, email, ciudad, notas, activo';

export function aProveedor(f: Fila): Proveedor {
  return {
    id: texto(f.id),
    nombre: texto(f.nombre),
    contacto: textoONulo(f.contacto),
    telefono: textoONulo(f.telefono),
    email: textoONulo(f.email),
    ciudad: textoONulo(f.ciudad),
    notas: textoONulo(f.notas),
    activo: f.activo === undefined ? true : bool(f.activo),
  };
}

export const COLUMNAS_PRODUCTO =
  'id, nombre, marca, categoria, unidad_medida, presentacion, contenido_presentacion, costo_presentacion, costo_unitario, stock_actual, stock_minimo, proveedor_id, uso, precio_venta, vendible_en_linea, activo, notas';

export function aProducto(f: Fila): Producto {
  const contenido = num(f.contenido_presentacion, 1);
  const costo = num(f.costo_presentacion);
  return {
    id: texto(f.id),
    nombre: texto(f.nombre),
    marca: textoONulo(f.marca),
    categoria: texto(f.categoria, 'otro') as CategoriaProducto,
    unidad_medida: texto(f.unidad_medida, 'pz') as UnidadMedida,
    presentacion: textoONulo(f.presentacion),
    contenido_presentacion: contenido,
    costo_presentacion: costo,
    costo_unitario:
      f.costo_unitario === null || f.costo_unitario === undefined ? (contenido > 0 ? costo / contenido : 0) : num(f.costo_unitario),
    stock_actual: num(f.stock_actual),
    stock_minimo: num(f.stock_minimo),
    proveedor_id: textoONulo(f.proveedor_id),
    uso: texto(f.uso, 'cabina') as UsoProducto,
    precio_venta: numONulo(f.precio_venta),
    vendible_en_linea: bool(f.vendible_en_linea),
    activo: f.activo === undefined ? true : bool(f.activo),
    notas: textoONulo(f.notas),
  };
}

/** Fila de v_reposicion. */
export function aProductoReposicion(f: Fila): ProductoReposicion {
  return {
    id: texto(f.id),
    nombre: texto(f.nombre),
    marca: textoONulo(f.marca),
    unidad_medida: texto(f.unidad_medida, 'pz') as UnidadMedida,
    stock_actual: num(f.stock_actual),
    stock_minimo: num(f.stock_minimo),
    faltante: num(f.faltante),
    presentacion: textoONulo(f.presentacion),
    contenido_presentacion: num(f.contenido_presentacion, 1),
    presentaciones_sugeridas: num(f.presentaciones_sugeridas, 1),
    costo_estimado: num(f.costo_estimado),
    proveedor_nombre: textoONulo(f.proveedor_nombre),
  };
}

export function aMovimiento(f: Fila): MovimientoInventario {
  return {
    id: texto(f.id),
    producto_id: texto(f.producto_id),
    producto_nombre: texto(embebido(f.productos)?.nombre ?? f.producto_nombre),
    tipo: texto(f.tipo, 'ajuste') as TipoMovimiento,
    cantidad: num(f.cantidad),
    costo_unitario: numONulo(f.costo_unitario),
    nota: textoONulo(f.nota),
    creado_en: instante(f.creado_en),
  };
}

/** Fila de v_costo_servicio. */
export function aCostoServicio(f: Fila): CostoServicio {
  return {
    servicio_id: texto(f.servicio_id),
    slug: texto(f.slug),
    nombre: texto(f.nombre),
    categoria: texto(f.categoria),
    precio: numONulo(f.precio),
    costo_material: num(f.costo_material),
    margen: numONulo(f.margen),
    margen_pct: numONulo(f.margen_pct),
    tiene_receta: bool(f.tiene_receta),
  };
}

export function aCategoriaGasto(f: Fila): CategoriaGasto {
  return { id: texto(f.id), slug: texto(f.slug), nombre: texto(f.nombre), es_fijo: bool(f.es_fijo) };
}

export const COLUMNAS_GASTO =
  'id, categoria_id, concepto, monto, fecha, periodo, metodo_pago, proveedor, comprobante_url, recurrente_id, notas';

export function aGasto(f: Fila): Gasto {
  return {
    id: texto(f.id),
    categoria_id: texto(f.categoria_id),
    concepto: texto(f.concepto),
    monto: num(f.monto),
    fecha: fecha(f.fecha),
    periodo: fecha(f.periodo),
    metodo_pago: textoONulo(f.metodo_pago) as MetodoPago | null,
    proveedor: textoONulo(f.proveedor),
    comprobante_url: textoONulo(f.comprobante_url),
    recurrente_id: textoONulo(f.recurrente_id),
    notas: textoONulo(f.notas),
  };
}

export const COLUMNAS_GASTO_RECURRENTE =
  'id, categoria_id, concepto, monto_estimado, frecuencia, dia_pago, proximo_vencimiento, activo, notas';

export function aGastoRecurrente(f: Fila): GastoRecurrente {
  return {
    id: texto(f.id),
    categoria_id: texto(f.categoria_id),
    concepto: texto(f.concepto),
    monto_estimado: numONulo(f.monto_estimado),
    frecuencia: texto(f.frecuencia, 'mensual') as FrecuenciaGasto,
    dia_pago: num(f.dia_pago, 1),
    proximo_vencimiento: fechaONula(f.proximo_vencimiento),
    activo: f.activo === undefined ? true : bool(f.activo),
    notas: textoONulo(f.notas),
  };
}

/** Fila de v_gastos_por_vencer. */
export function aGastoPorVencer(f: Fila): GastoPorVencer {
  const estado = texto(f.estado, 'al_corriente');
  return {
    id: texto(f.id),
    concepto: texto(f.concepto),
    categoria: texto(f.categoria),
    monto_estimado: numONulo(f.monto_estimado),
    frecuencia: texto(f.frecuencia, 'mensual') as FrecuenciaGasto,
    proximo_vencimiento: fechaONula(f.proximo_vencimiento),
    dias_restantes: numONulo(f.dias_restantes),
    estado: (estado === 'vencido' || estado === 'proximo' ? estado : 'al_corriente') as GastoPorVencer['estado'],
  };
}

export function resultadoVacio(mes: string): ResultadoMensual {
  return { mes, ingresos: 0, propinas: 0, costo_insumos: 0, compras: 0, gastos: 0, utilidad: 0, flujo: 0, citas_completadas: 0 };
}

/** Fila de v_resultado_mensual. */
export function aResultadoMensual(f: Fila): ResultadoMensual {
  return {
    mes: fecha(f.mes),
    ingresos: num(f.ingresos),
    propinas: num(f.propinas),
    costo_insumos: num(f.costo_insumos),
    compras: num(f.compras),
    gastos: num(f.gastos),
    utilidad: num(f.utilidad),
    flujo: num(f.flujo),
    citas_completadas: num(f.citas_completadas),
  };
}

/**
 * Completa los meses sin actividad con ceros: devuelve exactamente `meses` filas,
 * de la más antigua a la actual (mes local de `ahora`).
 */
export function completarMeses(filasVista: Fila[], ahora: Date, meses: number): ResultadoMensual[] {
  const porMes = new Map(filasVista.map((f) => [fecha(f.mes), aResultadoMensual(f)]));
  return ultimosMeses(ahora, meses).map((mes) => porMes.get(mes) ?? resultadoVacio(mes));
}

export function aHorario(f: Fila): Horario {
  return {
    id: texto(f.id),
    dia_semana: num(f.dia_semana),
    hora_inicio: horaCorta(f.hora_inicio),
    hora_fin: horaCorta(f.hora_fin),
  };
}

export const COLUMNAS_PERSONAL = 'id, usuario_id, slug, nombre, titulo, bio, foto_url, color_agenda, activo, mostrar_en_sitio, orden';
export const COLUMNAS_CAPACITACION =
  'id, personal_id, nombre, institucion, tipo, fecha, horas, constancia_url, mostrar_en_sitio, notas';

/** Agrupa filas por una columna conservando el orden en que llegaron. */
export function agrupar<T>(lista: Fila[], clave: string, mapear: (f: Fila) => T): Map<string, T[]> {
  const r = new Map<string, T[]>();
  for (const f of lista) {
    const k = texto(f[clave]);
    const arr = r.get(k);
    if (arr) arr.push(mapear(f));
    else r.set(k, [mapear(f)]);
  }
  return r;
}
