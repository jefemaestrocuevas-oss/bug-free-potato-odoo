// Filas de la "base" en memoria del modo demostración.
// Imitan las tablas de opalo/docs/ESPEC.md §4 (mismos nombres de columnas).

import type {
  AccionContraindicacion,
  BloqueoAgenda,
  CategoriaGasto,
  CategoriaProducto,
  Configuracion,
  EstadoCita,
  EstadoPedido,
  EtapaServicio,
  FrecuenciaGasto,
  GastoRecurrente,
  MetodoPago,
  OrigenCita,
  Rol,
  TipoCapacitacion,
  TipoItemPedido,
  TipoMovimiento,
  TipoPaquete,
  TipoPolitica,
  UnidadMedida,
  UsoProducto,
} from '../tipos';

/** auth.users (sólo lo que necesita la demo). */
export interface UsuarioFila {
  id: string;
  email: string;
  password: string;
  creado_en: string;
}

export interface PerfilFila {
  id: string;
  rol: Rol;
  creado_en: string;
}

export interface ClienteFila {
  id: string;
  usuario_id: string | null;
  nombre: string;
  apellidos: string | null;
  telefono: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
  como_nos_conocio: string | null;
  acepta_promociones: boolean;
  notas_internas: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface PersonalFila {
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
  creado_en: string;
}

export interface CapacitacionFila {
  id: string;
  personal_id: string;
  nombre: string;
  institucion: string | null;
  tipo: TipoCapacitacion;
  fecha: string | null;
  horas: number | null;
  constancia_url: string | null;
  mostrar_en_sitio: boolean;
  notas: string | null;
  creado_en: string;
}

export interface PersonalServicioFila {
  personal_id: string;
  servicio_id: string;
}

export interface CategoriaFila {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
}

export interface ServicioFila {
  id: string;
  categoria_id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  zonas_incluye: string | null;
  duracion_min: number | null;
  duracion_primera_vez_min: number | null;
  precio: number | null;
  etapa: EtapaServicio;
  es_complemento: boolean;
  reservable_en_linea: boolean;
  vendible_en_linea: boolean;
  tipo_consentimiento: TipoPolitica | null;
  activo: boolean;
  orden: number;
}

export interface PaqueteFila {
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
}

export interface PaqueteServicioFila {
  paquete_id: string;
  servicio_id: string;
  cantidad: number;
}

export interface ContraindicacionFila {
  id: string;
  clave: string;
  pregunta: string;
  ayuda: string | null;
  categorias: string[] | null;
  accion: AccionContraindicacion;
  mensaje_cliente: string | null;
  activa: boolean;
  orden: number;
}

export interface CabinaFila {
  id: string;
  nombre: string;
  activa: boolean;
  orden: number;
}

export interface HorarioFila {
  id: string;
  personal_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

export type BloqueoFila = BloqueoAgenda & { creado_en: string };

export interface CitaFila {
  id: string;
  cliente_id: string;
  personal_id: string;
  cabina_id: string;
  inicio: string;
  fin: string;
  estado: EstadoCita;
  origen: OrigenCita;
  primera_vez: boolean;
  requiere_revision: boolean;
  alertas: string[];
  notas_cliente: string | null;
  notas_internas: string | null;
  total: number;
  cancelada_en: string | null;
  motivo_cancelacion: string | null;
  creada_por: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface CitaItemFila {
  id: string;
  cita_id: string;
  servicio_id: string | null;
  paquete_id: string | null;
  credito_id: string | null;
  nombre: string;
  precio: number | null;
  duracion_min: number | null;
}

export interface PoliticaFila {
  id: string;
  tipo: TipoPolitica;
  version: number;
  titulo: string;
  contenido_md: string;
  hash_sha256: string | null;
  activa: boolean;
  vigente_desde: string | null;
  creado_en: string;
}

export interface AceptacionFila {
  id: string;
  cliente_id: string;
  politica_id: string;
  aceptada_en: string;
  ip: string | null;
  user_agent: string | null;
}

export interface FichaFila {
  id: string;
  cliente_id: string;
  respuestas: Record<string, boolean>;
  detalles: Record<string, string>;
  alergias: string | null;
  medicamentos: string | null;
  observaciones: string | null;
  acepta_datos_sensibles: boolean;
  creado_en: string;
}

export interface ConsentimientoFila {
  id: string;
  cliente_id: string;
  cita_id: string | null;
  politica_id: string;
  ficha_salud_id: string | null;
  nombre_firmante: string;
  firma_svg: string;
  es_menor: boolean;
  tutor_nombre: string | null;
  documento_hash: string | null;
  ip: string | null;
  user_agent: string | null;
  firmado_en: string;
}

export interface PedidoFila {
  id: string;
  folio: string;
  cliente_id: string;
  estado: EstadoPedido;
  total: number;
  metodo_pago_preferido: MetodoPago | null;
  notas: string | null;
  creado_en: string;
  pagado_en: string | null;
  cancelado_en: string | null;
}

export interface PedidoItemFila {
  id: string;
  pedido_id: string;
  tipo: TipoItemPedido;
  servicio_id: string | null;
  paquete_id: string | null;
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  regalo_para: string | null;
}

export interface PagoFila {
  id: string;
  pedido_id: string | null;
  cita_id: string | null;
  monto: number;
  propina: number;
  metodo: MetodoPago;
  referencia: string | null;
  recibido_por: string | null;
  pagado_en: string;
  notas: string | null;
}

export interface CreditoFila {
  id: string;
  cliente_id: string;
  servicio_id: string | null;
  paquete_id: string | null;
  cantidad: number;
  usados: number;
  pedido_item_id: string | null;
  codigo_regalo: string | null;
  regalo_para: string | null;
  vence_en: string | null;
  creado_en: string;
}

export interface ProveedorFila {
  id: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  ciudad: string | null;
  notas: string | null;
  activo: boolean;
  creado_en: string;
}

/** `costo_unitario` es columna generada: se calcula al leer. */
export interface ProductoFila {
  id: string;
  nombre: string;
  marca: string | null;
  categoria: CategoriaProducto;
  unidad_medida: UnidadMedida;
  presentacion: string | null;
  contenido_presentacion: number;
  costo_presentacion: number;
  stock_actual: number;
  stock_minimo: number;
  proveedor_id: string | null;
  uso: UsoProducto;
  precio_venta: number | null;
  vendible_en_linea: boolean;
  activo: boolean;
  notas: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface RecetaFila {
  servicio_id: string;
  producto_id: string;
  cantidad: number;
  notas: string | null;
}

export interface CompraFila {
  id: string;
  proveedor_id: string | null;
  fecha: string;
  folio: string | null;
  total: number;
  notas: string | null;
  registrada_por: string | null;
  creado_en: string;
}

export interface CompraItemFila {
  id: string;
  compra_id: string;
  producto_id: string;
  presentaciones: number;
  costo_presentacion: number;
}

export interface MovimientoFila {
  id: string;
  producto_id: string;
  tipo: TipoMovimiento;
  cantidad: number;
  costo_unitario: number | null;
  cita_id: string | null;
  compra_id: string | null;
  pedido_id: string | null;
  nota: string | null;
  creado_por: string | null;
  creado_en: string;
}

export type CategoriaGastoFila = CategoriaGasto;

export interface GastoRecurrenteFila extends GastoRecurrente {
  frecuencia: FrecuenciaGasto;
}

export interface GastoFila {
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
  registrado_por: string | null;
  creado_en: string;
}

/** La "base de datos" completa del navegador. */
export interface Db {
  /** Secuencia de folios de pedidos (`pedidos_folio_seq`). */
  folio_pedidos: number;
  configuracion: Configuracion;
  usuarios: UsuarioFila[];
  perfiles: PerfilFila[];
  clientes: ClienteFila[];
  personal: PersonalFila[];
  capacitaciones: CapacitacionFila[];
  personal_servicios: PersonalServicioFila[];
  categorias_servicio: CategoriaFila[];
  servicios: ServicioFila[];
  paquetes: PaqueteFila[];
  paquete_servicios: PaqueteServicioFila[];
  contraindicaciones: ContraindicacionFila[];
  cabinas: CabinaFila[];
  horarios: HorarioFila[];
  bloqueos_agenda: BloqueoFila[];
  citas: CitaFila[];
  cita_items: CitaItemFila[];
  politicas: PoliticaFila[];
  aceptaciones_politica: AceptacionFila[];
  fichas_salud: FichaFila[];
  consentimientos: ConsentimientoFila[];
  pedidos: PedidoFila[];
  pedido_items: PedidoItemFila[];
  pagos: PagoFila[];
  creditos: CreditoFila[];
  proveedores: ProveedorFila[];
  productos: ProductoFila[];
  recetas_servicio: RecetaFila[];
  compras: CompraFila[];
  compra_items: CompraItemFila[];
  movimientos_inventario: MovimientoFila[];
  categorias_gasto: CategoriaGastoFila[];
  gastos_recurrentes: GastoRecurrenteFila[];
  gastos: GastoFila[];
}

/** Lo que se guarda en localStorage bajo 'opalo-demo-v1'. */
export interface EstadoGuardado {
  v: 1;
  /** Huella de catalogo.json + políticas: si cambian las fuentes, se vuelve a sembrar. */
  huella: string;
  db: Db;
  /** user_id con sesión iniciada (o null). */
  sesion: string | null;
}

// ---------- Fuentes (opalo/datos) ----------

export interface ServicioFuente {
  slug: string;
  categoria: string;
  nombre: string;
  descripcion?: string | null;
  zonas_incluye?: string | null;
  precio: number | null;
  duracion_min?: number | null;
  duracion_primera_vez_min?: number | null;
  etapa?: EtapaServicio;
  es_complemento?: boolean;
  reservable_en_linea?: boolean;
  vendible_en_linea?: boolean;
  tipo_consentimiento?: TipoPolitica | null;
  orden?: number;
}

export interface CatalogoFuente {
  configuracion: Configuracion;
  categorias: { slug: string; nombre: string; descripcion?: string | null; orden?: number }[];
  servicios: ServicioFuente[];
  paquetes: {
    slug: string;
    nombre: string;
    tipo?: TipoPaquete;
    precio: number | null;
    descripcion?: string | null;
    duracion_min?: number | null;
    vigencia_dias?: number | null;
    items: { servicio: string; cantidad?: number }[];
    orden?: number;
  }[];
  contraindicaciones: {
    clave: string;
    pregunta: string;
    ayuda?: string | null;
    categorias?: string[] | null;
    accion?: AccionContraindicacion;
    mensaje_cliente?: string | null;
    orden?: number;
  }[];
  cabinas: { nombre: string }[];
  personal: {
    slug: string;
    nombre: string;
    titulo?: string | null;
    bio?: string | null;
    foto_url?: string | null;
    orden?: number;
    horarios: { dia_semana: number; hora_inicio: string; hora_fin: string }[];
  }[];
  categorias_gasto: { slug: string; nombre: string; es_fijo: boolean }[];
  gastos_recurrentes: {
    categoria: string;
    concepto: string;
    monto_estimado: number | null;
    frecuencia: FrecuenciaGasto;
    dia_pago: number;
  }[];
}

export interface FuentesDemo {
  catalogo: CatalogoFuente;
  /** tipo de política → markdown (puede faltar alguno). */
  politicas: Partial<Record<TipoPolitica, string>>;
}
