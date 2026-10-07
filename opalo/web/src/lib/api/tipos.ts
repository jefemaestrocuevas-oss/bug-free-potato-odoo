// Contrato entre el sitio y la base de datos de Ópalo.
// Las páginas SOLO usan `OpaloApi`; hay dos implementaciones: supabase.ts y demo.ts.
// Los nombres siguen opalo/docs/ESPEC.md. Fechas/horas: strings ISO 8601 (timestamptz)
// o 'YYYY-MM-DD' para fechas sin hora.

export type Rol = 'cliente' | 'personal' | 'admin';
export type EtapaServicio = 'disponible' | 'segunda_etapa' | 'requiere_curso';
export type TipoPaquete = 'combo' | 'bono';
export type EstadoCita = 'pendiente' | 'confirmada' | 'en_curso' | 'completada' | 'cancelada' | 'no_asistio';
export type OrigenCita = 'web' | 'whatsapp' | 'mostrador' | 'telefono';
export type TipoPolitica =
  | 'terminos'
  | 'privacidad'
  | 'cancelacion'
  | 'consentimiento_depilacion'
  | 'consentimiento_facial'
  | 'consentimiento_corporal';
export type AccionContraindicacion = 'no_se_realiza' | 'revisar' | 'precaucion';
export type EstadoPedido = 'pendiente_pago' | 'pagado' | 'cancelado' | 'reembolsado';
export type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'mercado_pago' | 'cortesia';
export type TipoItemPedido = 'servicio' | 'paquete' | 'producto';
export type TipoMovimiento = 'compra' | 'consumo' | 'venta' | 'ajuste' | 'merma';
export type FrecuenciaGasto = 'mensual' | 'bimestral' | 'trimestral' | 'anual';
export type UnidadMedida = 'g' | 'ml' | 'pz';
export type CategoriaProducto =
  | 'cera' | 'preparacion' | 'post' | 'facial' | 'corporal' | 'desechable' | 'limpieza' | 'venta' | 'otro';
export type UsoProducto = 'cabina' | 'venta' | 'ambos';
export type TipoCapacitacion = 'curso' | 'taller' | 'diplomado' | 'certificacion' | 'congreso';

/** Políticas que toda clienta acepta antes de su primera reserva (y cuando cambian de versión). */
export const POLITICAS_GENERALES: TipoPolitica[] = ['terminos', 'privacidad', 'cancelacion'];

// ---------- Público ----------

export interface Configuracion {
  nombre_negocio: string;
  lema: string | null;
  telefono_whatsapp: string;
  direccion: string;
  zona_horaria: string;
  duracion_sesion_min: number;
  intervalo_slots_min: number;
  anticipacion_min_horas: number;
  ventana_reserva_dias: number;
  horas_cancelacion: number;
  tolerancia_retraso_min: number;
  edad_minima: number;
  edad_mayoria: number;
  vigencia_creditos_dias: number;
}

export interface Categoria {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
}

export interface Servicio {
  id: string;
  categoria_id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  zonas_incluye: string | null;
  /** null = cabe en la sesión estándar (1 h). */
  duracion_min: number | null;
  duracion_primera_vez_min: number | null;
  /** null = precio por confirmar (se reserva, pero no se vende en línea). */
  precio: number | null;
  etapa: EtapaServicio;
  es_complemento: boolean;
  reservable_en_linea: boolean;
  vendible_en_linea: boolean;
  tipo_consentimiento: TipoPolitica | null;
  activo: boolean;
  orden: number;
}

export interface PaqueteItem {
  servicio_id: string;
  cantidad: number;
}

export interface Paquete {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  tipo: TipoPaquete;
  precio: number | null;
  duracion_min: number | null;
  vigencia_dias: number | null;
  activo: boolean;
  orden: number;
  items: PaqueteItem[];
}

export interface Catalogo {
  categorias: Categoria[];
  servicios: Servicio[];
  paquetes: Paquete[];
}

export interface Capacitacion {
  id: string;
  personal_id: string;
  nombre: string;
  institucion: string | null;
  tipo: TipoCapacitacion;
  fecha: string | null;
  horas: number | null;
}

export interface PersonalPublico {
  id: string;
  slug: string;
  nombre: string;
  titulo: string | null;
  bio: string | null;
  foto_url: string | null;
  orden: number;
  capacitaciones: Capacitacion[];
}

export interface Politica {
  id: string;
  tipo: TipoPolitica;
  version: number;
  titulo: string;
  contenido_md: string;
  hash_sha256: string | null;
  vigente_desde: string | null;
}

export interface Contraindicacion {
  id: string;
  clave: string;
  pregunta: string;
  ayuda: string | null;
  /** slugs de categoría; null = aplica a todas */
  categorias: string[] | null;
  accion: AccionContraindicacion;
  mensaje_cliente: string | null;
  orden: number;
}

export interface ProductoTienda {
  id: string;
  nombre: string;
  marca: string | null;
  presentacion: string | null;
  precio_venta: number;
  hay_stock: boolean;
}

export interface Slot {
  inicio: string;
  fin: string;
  personal_id: string;
  personal_nombre: string;
}

// ---------- Sesión y clienta ----------

export interface Cliente {
  id: string;
  nombre: string;
  apellidos: string | null;
  telefono: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
  acepta_promociones: boolean;
}

export interface Sesion {
  user_id: string;
  email: string | null;
  rol: Rol;
  cliente: Cliente | null;
}

export interface DatosRegistro {
  email: string;
  password: string;
  nombre: string;
  apellidos: string;
  telefono: string;
  fecha_nacimiento: string | null;
}

export interface DatosCliente {
  nombre: string;
  apellidos: string | null;
  telefono: string | null;
  fecha_nacimiento: string | null;
  acepta_promociones: boolean;
}

export interface FichaSalud {
  /** clave de contraindicación → respuesta */
  respuestas: Record<string, boolean>;
  /** clave → detalle libre (p. ej. qué medicamento) */
  detalles: Record<string, string>;
  alergias: string | null;
  medicamentos: string | null;
  observaciones: string | null;
  acepta_datos_sensibles: boolean;
  creado_en?: string;
}

export interface DatosFirma {
  nombre_firmante: string;
  /** SVG completo (<svg …>…</svg>) con el trazo de la firma. */
  firma_svg: string;
  tutor_nombre?: string | null;
}

export interface ItemReserva {
  servicio_id?: string;
  paquete_id?: string;
  credito_id?: string;
}

export interface SolicitudReserva {
  items: ItemReserva[];
  inicio: string;
  personal_id?: string | null;
  notas?: string | null;
  firma: DatosFirma;
}

export interface ResultadoReserva {
  id: string;
  estado: EstadoCita;
  requiere_revision: boolean;
  alertas: string[];
}

export interface ItemCita {
  nombre: string;
  precio: number | null;
  duracion_min: number | null;
  servicio_id: string | null;
  paquete_id: string | null;
}

export interface CitaDetalle {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  inicio: string;
  fin: string;
  duracion_min: number;
  estado: EstadoCita;
  origen: OrigenCita;
  primera_vez: boolean;
  requiere_revision: boolean;
  alertas: string[];
  notas_cliente: string | null;
  total: number;
  personal_id: string;
  personal_nombre: string;
  personal_titulo: string | null;
  cabina_nombre: string | null;
  consentimientos_firmados: number;
  pagado: number;
  items: ItemCita[];
}

export interface ItemPedidoNuevo {
  tipo: TipoItemPedido;
  id: string;
  cantidad: number;
  regalo_para?: string | null;
}

export interface ResultadoPedido {
  id: string;
  folio: string;
  total: number;
}

export interface ItemPedido {
  tipo: TipoItemPedido;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  regalo_para: string | null;
}

export interface PedidoDetalle {
  id: string;
  folio: string;
  cliente_id: string;
  cliente_nombre: string;
  estado: EstadoPedido;
  total: number;
  pagado: number;
  metodo_pago_preferido: MetodoPago | null;
  notas: string | null;
  creado_en: string;
  pagado_en: string | null;
  items: ItemPedido[];
}

export interface Credito {
  id: string;
  cliente_id: string;
  nombre: string;
  servicio_id: string | null;
  paquete_id: string | null;
  cantidad: number;
  usados: number;
  restantes: number;
  vence_en: string | null;
  vigente: boolean;
  codigo_regalo: string | null;
  regalo_para: string | null;
  creado_en: string;
}

export interface ConsentimientoFirmado {
  id: string;
  cita_id: string | null;
  politica_tipo: TipoPolitica;
  politica_titulo: string;
  politica_version: number;
  nombre_firmante: string;
  tutor_nombre: string | null;
  firma_svg: string;
  documento_hash: string | null;
  firmado_en: string;
}

// ---------- Interno (personal / admin) ----------

export interface ClienteResumen {
  id: string;
  nombre: string;
  apellidos: string | null;
  telefono: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
  tiene_cuenta: boolean;
  citas_completadas: number;
  ultima_visita: string | null;
  proxima_cita: string | null;
  total_pagado: number;
  creado_en: string;
}

export interface NuevoCliente {
  nombre: string;
  apellidos: string | null;
  telefono: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
  notas_internas?: string | null;
}

export interface ExpedienteCliente {
  cliente: ClienteResumen & { notas_internas: string | null };
  ficha: FichaSalud | null;
  citas: CitaDetalle[];
  pedidos: PedidoDetalle[];
  creditos: Credito[];
  consentimientos: ConsentimientoFirmado[];
}

export interface SolicitudReservaStaff {
  cliente_id: string;
  items: ItemReserva[];
  inicio: string;
  personal_id?: string | null;
  origen: OrigenCita;
  notas?: string | null;
}

export interface NuevoPago {
  monto: number;
  metodo: MetodoPago;
  pedido_id?: string | null;
  cita_id?: string | null;
  referencia?: string | null;
  propina?: number;
}

export interface Proveedor {
  id: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  ciudad: string | null;
  notas: string | null;
  activo: boolean;
}

export interface Producto {
  id: string;
  nombre: string;
  marca: string | null;
  categoria: CategoriaProducto;
  unidad_medida: UnidadMedida;
  presentacion: string | null;
  contenido_presentacion: number;
  costo_presentacion: number;
  /** costo por g/ml/pieza (calculado) */
  costo_unitario: number;
  stock_actual: number;
  stock_minimo: number;
  proveedor_id: string | null;
  uso: UsoProducto;
  precio_venta: number | null;
  vendible_en_linea: boolean;
  activo: boolean;
  notas: string | null;
}

export type ProductoEditable = Omit<Producto, 'id' | 'costo_unitario' | 'stock_actual'> & { id?: string };

export interface ProductoReposicion {
  id: string;
  nombre: string;
  marca: string | null;
  unidad_medida: UnidadMedida;
  stock_actual: number;
  stock_minimo: number;
  faltante: number;
  presentacion: string | null;
  contenido_presentacion: number;
  presentaciones_sugeridas: number;
  costo_estimado: number;
  proveedor_nombre: string | null;
}

export interface ItemCompra {
  producto_id: string;
  presentaciones: number;
  costo_presentacion: number;
}

export interface NuevaCompra {
  items: ItemCompra[];
  proveedor_id?: string | null;
  fecha?: string;
  folio?: string | null;
  notas?: string | null;
}

export interface MovimientoInventario {
  id: string;
  producto_id: string;
  producto_nombre: string;
  tipo: TipoMovimiento;
  cantidad: number;
  costo_unitario: number | null;
  nota: string | null;
  creado_en: string;
}

export interface RecetaItem {
  producto_id: string;
  cantidad: number;
  notas?: string | null;
}

export interface CostoServicio {
  servicio_id: string;
  slug: string;
  nombre: string;
  categoria: string;
  precio: number | null;
  costo_material: number;
  margen: number | null;
  margen_pct: number | null;
  tiene_receta: boolean;
}

export interface CategoriaGasto {
  id: string;
  slug: string;
  nombre: string;
  es_fijo: boolean;
}

export interface Gasto {
  id: string;
  categoria_id: string;
  concepto: string;
  monto: number;
  fecha: string;
  periodo: string;
  metodo_pago: MetodoPago | null;
  proveedor: string | null;
  comprobante_url: string | null;
  recurrente_id: string | null;
  notas: string | null;
}

export type GastoEditable = Omit<Gasto, 'id' | 'periodo'> & { id?: string; periodo?: string };

export interface GastoRecurrente {
  id: string;
  categoria_id: string;
  concepto: string;
  monto_estimado: number | null;
  frecuencia: FrecuenciaGasto;
  dia_pago: number;
  proximo_vencimiento: string | null;
  activo: boolean;
  notas: string | null;
}

export type GastoRecurrenteEditable = Omit<GastoRecurrente, 'id'> & { id?: string };

export interface GastoPorVencer {
  id: string;
  concepto: string;
  categoria: string;
  monto_estimado: number | null;
  frecuencia: FrecuenciaGasto;
  proximo_vencimiento: string | null;
  dias_restantes: number | null;
  estado: 'vencido' | 'proximo' | 'al_corriente';
}

export interface ResultadoMensual {
  /** 'YYYY-MM-01' */
  mes: string;
  ingresos: number;
  propinas: number;
  costo_insumos: number;
  compras: number;
  gastos: number;
  utilidad: number;
  flujo: number;
  citas_completadas: number;
}

export interface Horario {
  id?: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

export interface PersonalInterno {
  id: string;
  usuario_id: string | null;
  slug: string;
  nombre: string;
  titulo: string | null;
  bio: string | null;
  foto_url: string | null;
  color_agenda: string;
  activo: boolean;
  mostrar_en_sitio: boolean;
  orden: number;
  horarios: Horario[];
  capacitaciones: (Capacitacion & { mostrar_en_sitio: boolean; constancia_url: string | null; notas: string | null })[];
}

export type PersonalEditable = Omit<PersonalInterno, 'id' | 'horarios' | 'capacitaciones' | 'usuario_id'> & { id?: string };

export interface CapacitacionEditable {
  id?: string;
  personal_id: string;
  nombre: string;
  institucion: string | null;
  tipo: TipoCapacitacion;
  fecha: string | null;
  horas: number | null;
  constancia_url: string | null;
  mostrar_en_sitio: boolean;
  notas: string | null;
}

export interface BloqueoAgenda {
  id: string;
  personal_id: string | null;
  inicio: string;
  fin: string;
  motivo: string | null;
}

export type ServicioEditable = Omit<Servicio, 'id'> & { id?: string };
export type PaqueteEditable = Omit<Paquete, 'id'> & { id?: string };

export interface ResumenHoy {
  citas_hoy: CitaDetalle[];
  por_revisar: number;
  reposicion: ProductoReposicion[];
  gastos_por_vencer: GastoPorVencer[];
  /** null si el usuario no es admin */
  mes_actual: ResultadoMensual | null;
  pedidos_pendientes: number;
}

// ---------- La interfaz ----------

export interface OpaloApi {
  readonly modo: 'demo' | 'supabase';

  // Público
  getConfiguracion(): Promise<Configuracion>;
  getCatalogo(): Promise<Catalogo>;
  getEquipo(): Promise<PersonalPublico[]>;
  getPoliticasVigentes(): Promise<Politica[]>;
  getContraindicaciones(): Promise<Contraindicacion[]>;
  getProductosTienda(): Promise<ProductoTienda[]>;
  /** fecha 'YYYY-MM-DD' en hora de Querétaro */
  getHorariosDisponibles(fecha: string, duracion_min: number, personal_id?: string | null): Promise<Slot[]>;
  getDuracionReserva(items: ItemReserva[]): Promise<number>;

  // Sesión
  getSesion(): Promise<Sesion | null>;
  /** Devuelve función para desuscribirse. */
  onCambioSesion(cb: (s: Sesion | null) => void): () => void;
  iniciarSesion(email: string, password: string): Promise<Sesion>;
  registrarse(datos: DatosRegistro): Promise<Sesion | null>;
  cerrarSesion(): Promise<void>;
  recuperarPassword(email: string): Promise<void>;

  // Clienta (sesión iniciada)
  actualizarMisDatos(datos: DatosCliente): Promise<Cliente>;
  getMiFicha(): Promise<FichaSalud | null>;
  guardarFicha(ficha: FichaSalud): Promise<void>;
  /** ids de políticas que la clienta ya aceptó */
  getMisAceptaciones(): Promise<string[]>;
  aceptarPoliticas(politica_ids: string[]): Promise<void>;
  reservarCita(solicitud: SolicitudReserva): Promise<ResultadoReserva>;
  getMisCitas(): Promise<CitaDetalle[]>;
  cancelarCita(cita_id: string, motivo?: string | null): Promise<void>;
  firmarConsentimientoCita(cita_id: string, firma: DatosFirma): Promise<void>;
  crearPedido(items: ItemPedidoNuevo[], metodo_pago: MetodoPago, notas?: string | null): Promise<ResultadoPedido>;
  cancelarPedido(pedido_id: string): Promise<void>;
  getMisPedidos(): Promise<PedidoDetalle[]>;
  getMisCreditos(): Promise<Credito[]>;
  canjearRegalo(codigo: string): Promise<void>;
  getMisConsentimientos(): Promise<ConsentimientoFirmado[]>;

  // Personal y admin
  admin: {
    getResumenHoy(): Promise<ResumenHoy>;
    // agenda
    getAgenda(desde: string, hasta: string): Promise<CitaDetalle[]>;
    reservarParaCliente(s: SolicitudReservaStaff): Promise<ResultadoReserva>;
    cambiarEstadoCita(cita_id: string, estado: EstadoCita): Promise<void>;
    completarCita(cita_id: string): Promise<void>;
    getBloqueos(desde: string, hasta: string): Promise<BloqueoAgenda[]>;
    guardarBloqueo(b: Omit<BloqueoAgenda, 'id'> & { id?: string }): Promise<void>;
    eliminarBloqueo(id: string): Promise<void>;
    // clientas
    getClientes(busqueda?: string): Promise<ClienteResumen[]>;
    getExpediente(cliente_id: string): Promise<ExpedienteCliente>;
    crearCliente(c: NuevoCliente): Promise<string>;
    guardarNotasCliente(cliente_id: string, notas: string): Promise<void>;
    // pedidos y pagos
    getPedidos(estado?: EstadoPedido | null): Promise<PedidoDetalle[]>;
    registrarPago(p: NuevoPago): Promise<void>;
    cancelarPedido(pedido_id: string): Promise<void>;
    // inventario
    getProductos(): Promise<Producto[]>;
    guardarProducto(p: ProductoEditable): Promise<Producto>;
    getReposicion(): Promise<ProductoReposicion[]>;
    registrarCompra(c: NuevaCompra): Promise<void>;
    ajustarInventario(producto_id: string, cantidad: number, tipo: 'ajuste' | 'merma', nota?: string | null): Promise<void>;
    getMovimientos(producto_id?: string | null, limite?: number): Promise<MovimientoInventario[]>;
    getProveedores(): Promise<Proveedor[]>;
    guardarProveedor(p: Omit<Proveedor, 'id'> & { id?: string }): Promise<Proveedor>;
    // costos
    getReceta(servicio_id: string): Promise<RecetaItem[]>;
    guardarReceta(servicio_id: string, items: RecetaItem[]): Promise<void>;
    getCostosServicios(): Promise<CostoServicio[]>;
    // gastos y resultados (admin)
    getCategoriasGasto(): Promise<CategoriaGasto[]>;
    getGastos(desde: string, hasta: string): Promise<Gasto[]>;
    guardarGasto(g: GastoEditable): Promise<void>;
    eliminarGasto(id: string): Promise<void>;
    getGastosRecurrentes(): Promise<GastoRecurrente[]>;
    guardarGastoRecurrente(g: GastoRecurrenteEditable): Promise<void>;
    getGastosPorVencer(): Promise<GastoPorVencer[]>;
    getResultados(meses: number): Promise<ResultadoMensual[]>;
    // catálogo (admin)
    guardarServicio(s: ServicioEditable): Promise<void>;
    guardarPaquete(p: PaqueteEditable): Promise<void>;
    // equipo (admin)
    getPersonal(): Promise<PersonalInterno[]>;
    guardarPersonal(p: PersonalEditable): Promise<void>;
    guardarHorarios(personal_id: string, horarios: Horario[]): Promise<void>;
    guardarCapacitacion(c: CapacitacionEditable): Promise<void>;
    eliminarCapacitacion(id: string): Promise<void>;
    // políticas (admin)
    getPoliticasTodas(): Promise<(Politica & { activa: boolean })[]>;
    publicarPolitica(tipo: TipoPolitica, titulo: string, contenido_md: string): Promise<void>;
  };
}

/** Error con mensaje listo para mostrarse a la persona usuaria. */
export class ErrorOpalo extends Error {
  constructor(mensaje: string, public readonly codigo?: string) {
    super(mensaje);
    this.name = 'ErrorOpalo';
  }
}
