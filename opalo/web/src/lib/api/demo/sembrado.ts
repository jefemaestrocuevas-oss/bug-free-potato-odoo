// Sembrado del modo demostración: catálogo real (opalo/datos) + datos de EJEMPLO relativos a hoy.
// Todo lo inventado lleva "(ejemplo)" en el nombre o en las notas.
import { CUENTAS_DEMO, PASSWORD_DEMO } from '../cuentasDemo';
import { diaSemana, ETIQUETA_POLITICA, fechaLocal, inicioMes, isoDesdeLocal, sumarDias } from '../../format';
import type {
  CategoriaProducto,
  Configuracion,
  ItemReserva,
  MetodoPago,
  OrigenCita,
  ProductoEditable,
  TipoCapacitacion,
  UnidadMedida,
  UsoProducto,
} from '../tipos';
import type { ClienteFila, Db, FichaFila, FuentesDemo } from './modelo';
import type { Ctx } from './permisos';
import {
  aceptarPoliticas,
  alertasPara,
  cambiarEstadoCita,
  categoriasDe,
  completarCita,
  crearCliente,
  crearConsentimientos,
  crearPedido,
  crearUsuario,
  duracionReserva,
  expandirServicios,
  firmaEnLinea,
  firmarConsentimientoCita,
  guardarBloqueo,
  guardarFicha,
  guardarGasto,
  guardarProducto,
  insertarCita,
  insertarMovimiento,
  insertarPolitica,
  marcarEntregado,
  mesesDeFrecuencia,
  registrarCompra,
  registrarPago,
  reservarCita,
  reservarCitaStaff,
  ventaMostrador,
} from './reglas';
import { FICHA_VACIA, sembrarTaller } from './sembradoTaller';
import { fechaEnMes, ms, MS_MIN, sumarMesesAMes, uuid } from './utilidades';
import { costoUnitario, nombreCompleto, ORDEN_POLITICAS, politicaActiva } from './vistas';

const DIA = 86_400_000;
const AGENTE = 'Modo demostración';

/** Firma de ejemplo (mismo formato que PanelFirma). */
export const FIRMA_EJEMPLO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="600" height="200"><path d="M40 140 C 80 40, 120 40, 140 120 S 200 170, 230 90 S 300 40, 330 120 L 360 100 M 380 130 C 420 60, 470 60, 500 110 S 540 150, 570 90" fill="none" stroke="#1d2016" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function dbVacia(configuracion: Configuracion): Db {
  return {
    folio_pedidos: 0,
    configuracion: {
      ...configuracion,
      fecha_apertura: configuracion.fecha_apertura ?? null,
      // ESPEC §9: false (lo de Ópalo) = la firma se hace en la tablet de cabina.
      firma_en_linea: configuracion.firma_en_linea === true,
    },
    usuarios: [],
    perfiles: [],
    clientes: [],
    personal: [],
    capacitaciones: [],
    personal_servicios: [],
    categorias_servicio: [],
    servicios: [],
    paquetes: [],
    paquete_servicios: [],
    contraindicaciones: [],
    cabinas: [],
    horarios: [],
    bloqueos_agenda: [],
    citas: [],
    cita_items: [],
    politicas: [],
    aceptaciones_politica: [],
    fichas_salud: [],
    consentimientos: [],
    pedidos: [],
    pedido_items: [],
    pagos: [],
    creditos: [],
    proveedores: [],
    productos: [],
    recetas_servicio: [],
    compras: [],
    compra_items: [],
    formulas: [],
    formula_items: [],
    lotes_produccion: [],
    movimientos_inventario: [],
    categorias_gasto: [],
    gastos_recurrentes: [],
    gastos: [],
  };
}

/** Título = primera línea "# …" del markdown. */
export function tituloDePolitica(md: string, respaldo: string): string {
  const primera = md.trimStart().split('\n')[0] ?? '';
  const m = /^#\s+(.+)$/.exec(primera.trim()) ?? /^#\s+(.+)$/m.exec(md);
  return m ? m[1].trim() : respaldo;
}

function textoRespaldo(titulo: string): string {
  return `# ${titulo}\n\n> **BORRADOR.** Este documento todavía está en preparación. En el modo demostración se muestra este texto de respaldo; la versión para revisión estará aquí próximamente.\n\nSi tienes dudas, escríbenos por WhatsApp al 442 170 1466.\n`;
}

/** Montos de ejemplo para los gastos recurrentes que aún no tienen monto. */
const MONTO_EJEMPLO_RECURRENTE: Record<string, number> = {
  renta: 12000,
  'mantenimiento-edificio': 1800,
  luz: 1150,
  agua: 280,
  internet: 599,
  telefono: 299,
};

export interface OpcionesSembrado {
  /** false: sólo catálogo, políticas y cuentas demo (útil en pruebas). */
  ejemplos?: boolean;
}

export function sembrar(fuentes: FuentesDemo, ahora: Date, opciones: OpcionesSembrado = {}): Db {
  const cat = fuentes.catalogo;
  const db = dbVacia(cat.configuracion);
  const hace = (dias: number) => new Date(ahora.getTime() - dias * DIA);
  const en = (cuando: Date | number, usuarioId: string | null): Ctx => ({
    db,
    ahora: new Date(cuando),
    usuarioId,
    userAgent: AGENTE,
  });
  const tCatalogo = hace(120).toISOString();

  // ---------- Catálogo real ----------
  const catId = new Map<string, string>();
  cat.categorias.forEach((c, i) => {
    const id = uuid();
    catId.set(c.slug, id);
    db.categorias_servicio.push({ id, slug: c.slug, nombre: c.nombre, descripcion: c.descripcion ?? null, orden: c.orden ?? i + 1 });
  });

  const servId = new Map<string, string>();
  cat.servicios.forEach((s, i) => {
    const categoria_id = catId.get(s.categoria);
    if (!categoria_id) return;
    const id = uuid();
    servId.set(s.slug, id);
    db.servicios.push({
      id,
      categoria_id,
      slug: s.slug,
      nombre: s.nombre,
      descripcion: s.descripcion ?? null,
      zonas_incluye: s.zonas_incluye ?? null,
      duracion_min: s.duracion_min ?? null,
      duracion_primera_vez_min: s.duracion_primera_vez_min ?? null,
      precio: s.precio ?? null,
      etapa: s.etapa ?? 'disponible',
      es_complemento: s.es_complemento ?? false,
      reservable_en_linea: s.reservable_en_linea ?? true,
      vendible_en_linea: s.vendible_en_linea ?? true,
      tipo_consentimiento: s.tipo_consentimiento ?? null,
      activo: true,
      orden: s.orden ?? i + 1,
    });
  });

  const paqId = new Map<string, string>();
  cat.paquetes.forEach((p, i) => {
    const id = uuid();
    paqId.set(p.slug, id);
    db.paquetes.push({
      id,
      slug: p.slug,
      nombre: p.nombre,
      descripcion: p.descripcion ?? null,
      tipo: p.tipo ?? 'combo',
      precio: p.precio ?? null,
      duracion_min: p.duracion_min ?? null,
      vigencia_dias: p.vigencia_dias ?? null,
      activo: true,
      orden: p.orden ?? i + 1,
    });
    for (const it of p.items) {
      const servicio_id = servId.get(it.servicio);
      if (servicio_id) db.paquete_servicios.push({ paquete_id: id, servicio_id, cantidad: it.cantidad ?? 1 });
    }
  });

  cat.contraindicaciones.forEach((c, i) =>
    db.contraindicaciones.push({
      id: uuid(),
      clave: c.clave,
      pregunta: c.pregunta,
      ayuda: c.ayuda ?? null,
      categorias: c.categorias ?? null,
      accion: c.accion ?? 'revisar',
      mensaje_cliente: c.mensaje_cliente ?? null,
      activa: true,
      orden: c.orden ?? i + 1,
    }),
  );

  cat.cabinas.forEach((c, i) => db.cabinas.push({ id: uuid(), nombre: c.nombre, activa: true, orden: i + 1 }));

  cat.personal.forEach((p, i) => {
    const id = uuid();
    db.personal.push({
      id,
      usuario_id: null,
      slug: p.slug,
      nombre: p.nombre,
      titulo: p.titulo ?? null,
      bio: p.bio ?? null,
      foto_url: p.foto_url ?? null,
      color_agenda: '#5C6B3F',
      activo: true,
      mostrar_en_sitio: true,
      orden: p.orden ?? i + 1,
      creado_en: tCatalogo,
    });
    for (const h of p.horarios)
      db.horarios.push({ id: uuid(), personal_id: id, dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin });
  });

  const catGastoId = new Map<string, string>();
  for (const c of cat.categorias_gasto) {
    const id = uuid();
    catGastoId.set(c.slug, id);
    db.categorias_gasto.push({ id, slug: c.slug, nombre: c.nombre, es_fijo: c.es_fijo });
  }
  const recurrenteId = new Map<string, string>();
  for (const r of cat.gastos_recurrentes) {
    const categoria_id = catGastoId.get(r.categoria);
    if (!categoria_id) continue;
    const id = uuid();
    recurrenteId.set(r.categoria, id);
    const ejemplo = opciones.ejemplos !== false && r.monto_estimado === null ? MONTO_EJEMPLO_RECURRENTE[r.categoria] ?? null : null;
    db.gastos_recurrentes.push({
      id,
      categoria_id,
      concepto: r.concepto,
      monto_estimado: r.monto_estimado ?? ejemplo,
      frecuencia: r.frecuencia,
      dia_pago: r.dia_pago,
      proximo_vencimiento: fechaEnMes(inicioMes(fechaLocal(ahora)), r.dia_pago),
      activo: true,
      notas: ejemplo !== null ? 'Monto de ejemplo: captura el real.' : null,
    });
  }

  // ---------- Políticas (opalo/datos/politicas/*.md) ----------
  for (const tipo of ORDEN_POLITICAS) {
    const etiqueta = ETIQUETA_POLITICA[tipo] ?? tipo;
    const md = (fuentes.politicas[tipo] ?? '').trim() ? (fuentes.politicas[tipo] as string) : textoRespaldo(etiqueta);
    insertarPolitica(db, tipo, tituloDePolitica(md, etiqueta), md, hace(90).toISOString());
  }

  // ---------- Cuentas demo ----------
  const datosCuenta: Record<string, { nombre: string; apellidos: string; telefono: string | null; fecha_nacimiento: string | null }> = {
    cliente: { nombre: 'Mariana', apellidos: 'López (ejemplo)', telefono: '4420000001', fecha_nacimiento: '1994-05-12' },
    personal: { nombre: 'Especialista', apellidos: 'de Ópalo (ejemplo)', telefono: null, fecha_nacimiento: null },
    admin: { nombre: 'Socia', apellidos: 'de Ópalo (ejemplo)', telefono: null, fecha_nacimiento: null },
  };
  const usuarios: Record<string, string> = {};
  for (const cuenta of CUENTAS_DEMO) {
    const u = crearUsuario(en(hace(100), null), { email: cuenta.email, password: cuenta.password, rol: cuenta.rol, ...datosCuenta[cuenta.rol] });
    usuarios[cuenta.rol] = u.id;
  }
  const especialista = db.personal.find((p) => p.slug === 'especialista') ?? db.personal[0];
  if (especialista && usuarios.personal) especialista.usuario_id = usuarios.personal;

  if (opciones.ejemplos === false || !especialista || db.cabinas.length === 0) return db;

  // ======================================================================
  // Datos de EJEMPLO
  // ======================================================================
  const hoy = fechaLocal(ahora);
  const staff = usuarios.personal;
  const admin = usuarios.admin;
  const intentar = (que: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      // Un ejemplo que no cabe (p. ej. por el día de la semana) no debe romper la demo.
      if (typeof console !== 'undefined') console.warn(`[demo] No se sembró ${que}:`, e);
    }
  };

  // ---------- Capacitaciones (ejemplo) ----------
  const capacitaciones: [string, string, TipoCapacitacion, number, number][] = [
    ['Bioseguridad e higiene en cabina (ejemplo)', 'Institución de ejemplo', 'certificacion', 35, 8],
    ['Tratamientos faciales avanzados (ejemplo)', 'Academia de ejemplo', 'taller', 150, 12],
    ['Depilación con cera premium (ejemplo)', 'Academia de ejemplo', 'curso', 240, 20],
    ['Diplomado en cosmetología (ejemplo)', 'Escuela de ejemplo', 'diplomado', 720, 120],
  ];
  for (const [nombre, institucion, tipo, dias, horas] of capacitaciones)
    db.capacitaciones.push({
      id: uuid(),
      personal_id: especialista.id,
      nombre,
      institucion,
      tipo,
      fecha: sumarDias(hoy, -dias),
      horas,
      constancia_url: null,
      mostrar_en_sitio: true,
      notas: 'Dato de ejemplo del modo demostración.',
      creado_en: hace(dias).toISOString(),
    });

  // ---------- Proveedores (ejemplo) ----------
  const prov = (nombre: string, ciudad: string, contacto: string) => {
    const id = uuid();
    db.proveedores.push({
      id,
      nombre,
      contacto,
      telefono: null,
      email: null,
      ciudad,
      notas: 'Proveedor de ejemplo del modo demostración.',
      activo: true,
      creado_en: hace(110).toISOString(),
    });
    return id;
  };
  const provBelleza = prov('Distribuidora de belleza (ejemplo)', 'Querétaro', 'Ventas mostrador');
  const provDesechables = prov('Insumos desechables (ejemplo)', 'Querétaro', 'Atención a clientes');
  const provDermo = prov('Dermocosméticos (ejemplo)', 'Ciudad de México', 'Representante de zona');

  // ---------- Productos (ejemplo) ----------
  interface ProdEj {
    clave: string;
    nombre: string;
    categoria: CategoriaProducto;
    unidad: UnidadMedida;
    presentacion: string;
    contenido: number;
    costo: number;
    minimo: number;
    deseado: number;
    proveedor: string;
    uso?: UsoProducto;
    precio_venta?: number;
  }
  const productos: ProdEj[] = [
    { clave: 'cera', nombre: 'Cera elástica (ejemplo)', categoria: 'cera', unidad: 'g', presentacion: 'Lata 800 g', contenido: 800, costo: 450, minimo: 800, deseado: 1100, proveedor: provBelleza },
    { clave: 'roll', nombre: 'Cera roll-on (ejemplo)', categoria: 'cera', unidad: 'g', presentacion: 'Cartucho 100 g', contenido: 100, costo: 65, minimo: 400, deseado: 250, proveedor: provBelleza },
    { clave: 'locion', nombre: 'Loción antiséptica pre-depilación (ejemplo)', categoria: 'preparacion', unidad: 'ml', presentacion: 'Botella 500 ml', contenido: 500, costo: 180, minimo: 250, deseado: 650, proveedor: provBelleza },
    { clave: 'aceite', nombre: 'Aceite post-depilación (ejemplo)', categoria: 'post', unidad: 'ml', presentacion: 'Botella 250 ml', contenido: 250, costo: 220, minimo: 150, deseado: 110, proveedor: provBelleza },
    { clave: 'abate', nombre: 'Abatelenguas de madera (ejemplo)', categoria: 'desechable', unidad: 'pz', presentacion: 'Caja 100 pz', contenido: 100, costo: 85, minimo: 100, deseado: 260, proveedor: provDesechables },
    { clave: 'guantes', nombre: 'Guantes de nitrilo (ejemplo)', categoria: 'desechable', unidad: 'pz', presentacion: 'Caja 100 pz', contenido: 100, costo: 150, minimo: 100, deseado: 70, proveedor: provDesechables },
    { clave: 'sabana', nombre: 'Sábana desechable (ejemplo)', categoria: 'desechable', unidad: 'pz', presentacion: 'Rollo 50 pz', contenido: 50, costo: 160, minimo: 40, deseado: 60, proveedor: provDesechables },
    { clave: 'limpiador', nombre: 'Gel limpiador facial (ejemplo)', categoria: 'facial', unidad: 'ml', presentacion: 'Botella 1 L', contenido: 1000, costo: 520, minimo: 300, deseado: 1200, proveedor: provDermo },
    { clave: 'mascarilla', nombre: 'Mascarilla hidratante (ejemplo)', categoria: 'facial', unidad: 'g', presentacion: 'Tarro 500 g', contenido: 500, costo: 640, minimo: 150, deseado: 380, proveedor: provDermo },
    { clave: 'reductor', nombre: 'Gel reductor (ejemplo)', categoria: 'corporal', unidad: 'ml', presentacion: 'Botella 1 L', contenido: 1000, costo: 480, minimo: 300, deseado: 900, proveedor: provDermo },
    { clave: 'desinfectante', nombre: 'Desinfectante de superficies (ejemplo)', categoria: 'limpieza', unidad: 'ml', presentacion: 'Galón 3.78 L', contenido: 3785, costo: 210, minimo: 1000, deseado: 2500, proveedor: provDesechables },
    { clave: 'protector', nombre: 'Protector solar FPS 50 para casa (ejemplo)', categoria: 'venta', unidad: 'pz', presentacion: 'Tubo 50 ml', contenido: 1, costo: 190, minimo: 3, deseado: 6, proveedor: provDermo, uso: 'venta', precio_venta: 350 },
    { clave: 'aceite-casa', nombre: 'Aceite calmante para casa (ejemplo)', categoria: 'venta', unidad: 'pz', presentacion: 'Frasco 120 ml', contenido: 1, costo: 120, minimo: 3, deseado: 2, proveedor: provBelleza, uso: 'venta', precio_venta: 260 },
    { clave: 'serum', nombre: 'Sérum hidratante para casa (ejemplo)', categoria: 'venta', unidad: 'pz', presentacion: 'Gotero 30 ml', contenido: 1, costo: 230, minimo: 2, deseado: 0, proveedor: provDermo, uso: 'venta', precio_venta: 420 },
  ];
  const prodId = new Map<string, string>();
  const deseado = new Map<string, number>();
  /** Alta de un producto como lo haría el personal (guardarProducto: misma regla de slug y de piezas que la base). */
  const altaProducto = (cuando: Date, datos: Partial<ProductoEditable> & Pick<ProductoEditable, 'nombre' | 'categoria' | 'unidad_medida'>) =>
    guardarProducto(en(cuando, staff), {
      ...FICHA_VACIA,
      marca: null,
      presentacion: null,
      contenido_presentacion: 1,
      costo_presentacion: 0,
      stock_minimo: 0,
      proveedor_id: null,
      uso: 'cabina',
      precio_venta: null,
      vendible_en_linea: false,
      activo: true,
      notas: 'Producto de ejemplo: costos y existencias inventados.',
      ...datos,
    }).id;
  for (const p of productos) {
    const id = altaProducto(hace(110), {
      nombre: p.nombre,
      categoria: p.categoria,
      unidad_medida: p.unidad,
      presentacion: p.presentacion,
      contenido_presentacion: p.contenido,
      costo_presentacion: p.costo,
      stock_minimo: p.minimo,
      proveedor_id: p.proveedor,
      uso: p.uso ?? 'cabina',
      precio_venta: p.precio_venta ?? null,
      vendible_en_linea: p.uso === 'venta',
    });
    prodId.set(p.clave, id);
    deseado.set(id, p.deseado);
  }

  // ---------- Recetas (ejemplo) ----------
  const recetas: Record<string, [string, number][]> = {
    cejas: [['cera', 15], ['locion', 5], ['abate', 3], ['guantes', 2], ['aceite', 3]],
    'labio-superior': [['cera', 8], ['locion', 3], ['abate', 2], ['guantes', 2]],
    axilas: [['cera', 30], ['locion', 8], ['abate', 4], ['guantes', 2], ['aceite', 5]],
    'cara-con-ceja': [['cera', 35], ['locion', 8], ['abate', 6], ['guantes', 2], ['aceite', 5]],
    'bikini-brasileno': [['cera', 60], ['locion', 10], ['abate', 6], ['guantes', 2], ['aceite', 8], ['sabana', 1]],
    'media-pierna': [['roll', 40], ['locion', 15], ['guantes', 2], ['aceite', 10], ['sabana', 1]],
    'pierna-completa': [['roll', 80], ['locion', 20], ['guantes', 2], ['aceite', 15], ['sabana', 1]],
    'limpieza-facial': [['limpiador', 20], ['guantes', 2], ['sabana', 1]],
    'facial-hidratante': [['limpiador', 15], ['mascarilla', 20], ['guantes', 2], ['sabana', 1]],
    'reductivo-zona': [['reductor', 40], ['guantes', 2], ['sabana', 1]],
  };
  for (const [slug, filas] of Object.entries(recetas)) {
    const servicio_id = servId.get(slug);
    if (!servicio_id) continue;
    for (const [clave, cantidad] of filas) {
      const producto_id = prodId.get(clave);
      if (producto_id) db.recetas_servicio.push({ servicio_id, producto_id, cantidad, notas: 'Cantidad de ejemplo.' });
    }
  }

  // ---------- Clientas (ejemplo) ----------
  const clienteDeUsuario = (uid: string) => db.clientes.find((c) => c.usuario_id === uid)!;
  const mariana = clienteDeUsuario(usuarios.cliente);
  mariana.acepta_promociones = true;
  mariana.como_nos_conocio = 'Instagram (ejemplo)';

  const danielaUid = crearUsuario(en(hace(25), null), {
    email: 'daniela@demo.opalo.mx',
    password: PASSWORD_DEMO,
    nombre: 'Daniela',
    apellidos: 'Herrera (ejemplo)',
    telefono: '4420000002',
    fecha_nacimiento: '1991-09-03',
  }).id;
  const daniela = clienteDeUsuario(danielaUid);
  const clientaSinCuenta = (dias: number, datos: Parameters<typeof crearCliente>[1]) => {
    const id = crearCliente(en(hace(dias), admin), datos);
    return db.clientes.find((c) => c.id === id)!;
  };
  const fernanda = clientaSinCuenta(60, {
    nombre: 'Fernanda',
    apellidos: 'Ríos (ejemplo)',
    telefono: '4420000003',
    email: null,
    fecha_nacimiento: '1998-02-20',
    notas_internas: 'Prefiere que le escriban por WhatsApp (ejemplo).',
  });
  const lucia = clientaSinCuenta(40, {
    nombre: 'Lucía',
    apellidos: 'Campos (ejemplo)',
    telefono: '4420000004',
    email: null,
    fecha_nacimiento: '1987-11-30',
    notas_internas: null,
  });

  // Aceptaciones y fichas
  const generales = ['terminos', 'privacidad', 'cancelacion'] as const;
  const idsGenerales = generales.map((t) => politicaActiva(db, t)?.id).filter((x): x is string => !!x);
  const todasNo = Object.fromEntries(db.contraindicaciones.map((c) => [c.clave, false])) as Record<string, boolean>;
  aceptarPoliticas(en(hace(70), usuarios.cliente), idsGenerales);
  guardarFicha(en(hace(70), usuarios.cliente), { respuestas: { ...todasNo }, detalles: {}, alergias: null, medicamentos: null, observaciones: null, acepta_datos_sensibles: true });
  aceptarPoliticas(en(hace(24), danielaUid), idsGenerales);
  guardarFicha(en(hace(24), danielaUid), {
    respuestas: { ...todasNo, embarazo_lactancia: true, alergias_productos: true },
    detalles: { embarazo_lactancia: 'Lactancia, bebé de 5 meses (ejemplo).', alergias_productos: 'Perfumes fuertes (ejemplo).' },
    alergias: 'Perfumes (ejemplo)',
    medicamentos: null,
    observaciones: 'Ficha de ejemplo.',
    acepta_datos_sensibles: true,
  });
  const fichaDirecta = (cliente: ClienteFila, dias: number) => {
    const f: FichaFila = {
      id: uuid(),
      cliente_id: cliente.id,
      respuestas: { ...todasNo },
      detalles: {},
      alergias: null,
      medicamentos: null,
      observaciones: 'Llenada en cabina (ejemplo).',
      acepta_datos_sensibles: true,
      creado_en: hace(dias).toISOString(),
    };
    db.fichas_salud.push(f);
  };
  fichaDirecta(fernanda, 58);
  fichaDirecta(lucia, 38);

  // ---------- Ayudas de agenda ----------
  const rangosDe = (fecha: string) =>
    db.horarios
      .filter((h) => h.personal_id === especialista.id && h.dia_semana === diaSemana(fecha))
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  /** Mueve la fecha (hacia atrás o adelante) hasta un día con horario. */
  const diaHabil = (fecha: string, dir: 1 | -1) => {
    let f = fecha;
    for (let i = 0; i < 7; i++) {
      if (rangosDe(f).length) return f;
      f = sumarDias(f, dir);
    }
    return fecha;
  };
  /** Ajusta 'HH:00' a una hora que quepa en el horario de ese día. */
  const horaEn = (fecha: string, hhmm: string) => {
    const r = rangosDe(fecha);
    if (!r.length) return hhmm;
    const ini = Number(r[0].hora_inicio.slice(0, 2));
    const fin = Number(r[r.length - 1].hora_fin.slice(0, 2));
    const h = Math.min(Math.max(Number(hhmm.slice(0, 2)), ini), fin - 1);
    return `${String(h).padStart(2, '0')}:00`;
  };
  const S = (slug: string): ItemReserva => ({ servicio_id: servId.get(slug) });
  const P = (slug: string): ItemReserva => ({ paquete_id: paqId.get(slug) });
  // Antes de configuracion.fecha_apertura las clientas no reservan en línea; lo que el personal
  // agenda en esos días son ensayos (ESPEC §4.1), y no se cobran.
  const apertura = db.configuracion.fecha_apertura;
  const antesDeAbrir = (fecha: string) => !!apertura && fecha < apertura;
  const NOTA_ENSAYO = 'Ensayo de apertura (ejemplo).';

  // ---------- Citas pasadas (completadas con pago) ----------
  interface Pasada {
    cliente: ClienteFila;
    creador: string;
    items: ItemReserva[];
    dias: number;
    hora: string;
    origen: OrigenCita;
    estado: 'completada' | 'no_asistio';
    pago?: { metodo: MetodoPago; propina?: number; monto?: number; referencia?: string };
  }
  const pasadas: Pasada[] = [
    { cliente: mariana, creador: usuarios.cliente, items: [S('facial-hidratante')], dias: 62, hora: '11:00', origen: 'web', estado: 'completada', pago: { metodo: 'tarjeta', propina: 80 } },
    { cliente: fernanda, creador: admin, items: [S('bikini-brasileno')], dias: 48, hora: '16:00', origen: 'whatsapp', estado: 'completada', pago: { metodo: 'efectivo', propina: 40 } },
    { cliente: mariana, creador: usuarios.cliente, items: [P('express')], dias: 34, hora: '12:00', origen: 'web', estado: 'completada', pago: { metodo: 'efectivo', propina: 50 } },
    { cliente: lucia, creador: admin, items: [S('cara-con-ceja')], dias: 27, hora: '13:00', origen: 'telefono', estado: 'completada', pago: { metodo: 'tarjeta' } },
    { cliente: fernanda, creador: admin, items: [S('pierna-completa'), S('axilas')], dias: 20, hora: '17:00', origen: 'whatsapp', estado: 'completada', pago: { metodo: 'tarjeta', propina: 60 } },
    { cliente: daniela, creador: danielaUid, items: [S('limpieza-facial')], dias: 16, hora: '15:00', origen: 'web', estado: 'completada', pago: { metodo: 'transferencia', monto: 450, referencia: 'Precio confirmado en cabina (ejemplo)' } },
    { cliente: lucia, creador: admin, items: [S('cejas')], dias: 13, hora: '11:00', origen: 'telefono', estado: 'no_asistio' },
    { cliente: mariana, creador: usuarios.cliente, items: [S('cejas'), S('axilas')], dias: 9, hora: '10:00', origen: 'web', estado: 'completada', pago: { metodo: 'transferencia', propina: 30, referencia: 'SPEI (ejemplo)' } },
  ];
  for (const p of pasadas) {
    intentar(`cita pasada de ${p.cliente.nombre}`, () => {
      const fecha = diaHabil(sumarDias(hoy, -p.dias), -1);
      const inicio = ms(isoDesdeLocal(fecha, horaEn(fecha, p.hora)));
      const fin = inicio + duracionReserva(db, p.items) * MS_MIN;
      const servicioIds = [...expandirServicios(db, p.items).keys()];
      const { alertas, requiereRevision } = alertasPara(db, p.cliente.id, categoriasDe(db, servicioIds));
      // Antes de abrir: ensayo agendado por el personal (nunca "web") y sin cobro.
      const ensayo = antesDeAbrir(fecha);
      const cita = insertarCita(en(inicio - 3 * DIA, ensayo ? admin : p.creador), {
        cliente: p.cliente,
        resueltos: p.items.map((it) => ({
          servicio: db.servicios.find((s) => s.id === it.servicio_id) ?? null,
          paquete: db.paquetes.find((x) => x.id === it.paquete_id) ?? null,
          credito: null,
        })),
        inicio,
        fin,
        personal_id: especialista.id,
        cabina_id: db.cabinas[0].id,
        estado: 'confirmada',
        origen: ensayo && p.origen === 'web' ? 'mostrador' : p.origen,
        requiere_revision: requiereRevision,
        alertas,
        notas_cliente: null,
      });
      if (ensayo) cita.notas_internas = NOTA_ENSAYO;
      if (p.estado === 'no_asistio') {
        cambiarEstadoCita(en(fin, staff), cita.id, 'no_asistio');
        return;
      }
      crearConsentimientos(en(inicio - 10 * MS_MIN, staff), cita, { nombre_firmante: nombreCompleto(p.cliente), firma_svg: FIRMA_EJEMPLO }, false, 'cabina');
      completarCita(en(fin, staff), cita.id);
      if (p.pago && !ensayo) {
        const monto = p.pago.monto ?? cita.total;
        if (monto > 0)
          registrarPago(en(fin + 5 * MS_MIN, staff), {
            monto,
            metodo: p.pago.metodo,
            cita_id: cita.id,
            propina: p.pago.propina ?? 0,
            referencia: p.pago.referencia ?? null,
          });
      }
    });
  }

  // ---------- Compras (ejemplo) ----------
  intentar('compras', () => {
    registrarCompra(en(hace(40), staff), {
      items: [
        { producto_id: prodId.get('cera')!, presentaciones: 1, costo_presentacion: 450 },
        { producto_id: prodId.get('locion')!, presentaciones: 1, costo_presentacion: 180 },
        { producto_id: prodId.get('limpiador')!, presentaciones: 1, costo_presentacion: 520 },
      ],
      proveedor_id: provBelleza,
      fecha: sumarDias(hoy, -40),
      folio: 'F-1021 (ejemplo)',
      notas: 'Compra de ejemplo.',
    });
    registrarCompra(en(hace(15), staff), {
      items: [
        { producto_id: prodId.get('abate')!, presentaciones: 2, costo_presentacion: 85 },
        { producto_id: prodId.get('sabana')!, presentaciones: 1, costo_presentacion: 160 },
      ],
      proveedor_id: provDesechables,
      fecha: sumarDias(hoy, -15),
      folio: 'A-338 (ejemplo)',
      notas: 'Compra de ejemplo.',
    });
  });

  // ---------- Inventario inicial de cabina (ajuste con fecha anterior a todo lo demás) ----------
  // Va antes de las ventas: deja cada insumo de cabina en su existencia "deseada" después de los consumos
  // y compras de arriba, y así hay producto que vender en la tienda.
  for (const p of db.productos) {
    const meta = deseado.get(p.id);
    if (meta === undefined) continue;
    const diferencia = meta - p.stock_actual;
    if (diferencia > 0)
      insertarMovimiento(en(hace(75), staff), {
        producto_id: p.id,
        tipo: 'ajuste',
        cantidad: diferencia,
        costo_unitario: costoUnitario(p),
        nota: 'Inventario inicial (ejemplo)',
      });
  }

  // ---------- Taller y tienda propia (ESPEC §10): jabones y velas hechos en Ópalo ----------
  const t = sembrarTaller({ db, hoy, staff, en, altaProducto });

  // ---------- Pedidos y ventas (ejemplo), en orden de fecha ----------
  // En línea (la clienta pide; el personal registra el pago y entrega en el spa) y en mostrador (se paga y se
  // entrega en el acto). Todo pasa por las mismas reglas que en la base (existencias, precios, créditos).
  let creditoExpress: string | null = null;
  const T = t.producto;
  t.evento(50, '12:30', 'pedido en línea de Mariana', () => {
    const r = crearPedido(en(t.momento(50, '12:30'), usuarios.cliente), [
      { tipo: 'producto', id: T('avena-miel'), cantidad: 2 },
      { tipo: 'producto', id: T('lavanda-eucalipto'), cantidad: 1 },
    ], 'transferencia', 'Para regalar a mi mamá (ejemplo).');
    registrarPago(en(t.momento(49, '10:15'), staff), { monto: r.total, metodo: 'transferencia', pedido_id: r.id, referencia: 'SPEI (ejemplo)' });
    marcarEntregado(en(t.momento(47, '17:00'), staff), r.id);
  });
  t.evento(20, '11:00', 'pedido en línea de Daniela', () => {
    const r = crearPedido(en(t.momento(20, '11:00'), danielaUid), [
      { tipo: 'producto', id: T('lavanda'), cantidad: 2 },
      { tipo: 'producto', id: T('naranja-canela'), cantidad: 1 },
    ], 'efectivo', null);
    registrarPago(en(t.momento(19, '13:00'), staff), { monto: r.total, metodo: 'efectivo', pedido_id: r.id });
    marcarEntregado(en(t.momento(19, '13:05'), staff), r.id);
  });
  t.evento(12, '19:00', 'pedido pagado de Mariana (por entregar)', () => {
    const r = crearPedido(
      en(t.momento(12, '19:00'), usuarios.cliente),
      [
        { tipo: 'paquete', id: paqId.get('express')!, cantidad: 2 },
        { tipo: 'servicio', id: servId.get('bikini-brasileno')!, cantidad: 1, regalo_para: 'Ana (ejemplo)' },
        { tipo: 'producto', id: prodId.get('protector')!, cantidad: 1 },
        { tipo: 'producto', id: T('avena-miel'), cantidad: 1 },
      ],
      'transferencia',
      'Pedido de ejemplo: lo recojo el día de mi cita.',
    );
    registrarPago(en(t.momento(11, '10:30'), staff), { monto: r.total, metodo: 'transferencia', pedido_id: r.id, referencia: 'SPEI (ejemplo)' });
    creditoExpress = db.creditos.find((c) => c.cliente_id === mariana.id && c.paquete_id === paqId.get('express'))?.id ?? null;
  });
  t.evento(1, '18:00', 'pedido pendiente de Daniela', () => {
    crearPedido(en(t.momento(1, '18:00'), danielaUid), [{ tipo: 'producto', id: prodId.get('aceite-casa')!, cantidad: 1 }], 'efectivo', 'Lo recojo en mi próxima cita (ejemplo).');
  });
  // Mostrador: sin clienta registrada o con su expediente; una cortesía (no cuenta como ingreso).
  const mostrador = (dias: number, hhmm: string, items: [string, number][], metodo: MetodoPago, cliente: ClienteFila | null, notas: string | null = null) =>
    t.evento(dias, hhmm, `venta de mostrador (hace ${dias} días)`, () =>
      ventaMostrador(en(t.momento(dias, hhmm), staff), {
        items: items.map(([clave, cantidad]) => ({ tipo: 'producto' as const, id: T(clave), cantidad })),
        metodo,
        cliente_id: cliente?.id ?? null,
        notas,
      }),
    );
  mostrador(58, '13:00', [['lavanda', 1], ['vainilla-coco', 1]], 'efectivo', null);
  mostrador(44, '16:30', [['avena-miel', 2]], 'tarjeta', fernanda);
  mostrador(33, '12:00', [['lavanda-eucalipto', 2]], 'tarjeta', null);
  mostrador(14, '17:30', [['set-lavanda', 1]], 'transferencia', null, 'Para un cumpleaños (ejemplo).');
  mostrador(9, '11:30', [['rosa-arcilla', 1]], 'efectivo', lucia);
  mostrador(5, '15:00', [['avena-miel', 1]], 'cortesia', null, 'Cortesía de bienvenida (ejemplo).');
  mostrador(2, '18:30', [['naranja-canela', 1], ['rosa-arcilla', 1]], 'efectivo', null);

  t.ejecutar(intentar);

  // ---------- Citas futuras ----------
  // Las de clientas van desde el día de apertura: antes no se reserva en línea (y así se siembran con
  // las mismas reglas que una clienta real). Mariana empieza con una sola cita próxima, para que pueda
  // probar varias reservas antes de llegar al límite de 3.
  const desde = apertura && hoy < apertura ? apertura : hoy;
  // Con un par de días de margen: las reservas se siembran "hechas" uno o dos días antes de hoy.
  const ultimoDiaReservable = sumarDias(hoy, db.configuracion.ventana_reserva_dias - 2);
  const firmaDe = (c: ClienteFila) => ({ nombre_firmante: nombreCompleto(c), firma_svg: FIRMA_EJEMPLO, tutor_nombre: null });
  // ESPEC §9: con firma_en_linea = false la clienta reserva sin firmar (la cita queda "falta firma" y se
  // firma en la tablet de cabina); con true firma al reservar, como antes.
  const firmaEnReserva = (c: ClienteFila) => (firmaEnLinea(db) ? firmaDe(c) : null);
  /** Inicio a `dias` del primer día en que las clientas reservan, o null si queda fuera de la ventana de reserva. */
  const futura = (dias: number, hhmm: string) => {
    const fecha = diaHabil(sumarDias(desde, dias), 1);
    return fecha > ultimoDiaReservable ? null : isoDesdeLocal(fecha, horaEn(fecha, hhmm));
  };
  intentar('cita con crédito de Mariana', () => {
    const inicio = futura(6, '12:00');
    if (!creditoExpress || !inicio) return;
    reservarCita(en(hace(1), usuarios.cliente), {
      items: [{ paquete_id: paqId.get('express'), credito_id: creditoExpress }],
      inicio,
      firma: firmaEnReserva(mariana),
      notas: 'Cita de ejemplo.',
    });
  });
  intentar('cita por revisar de Daniela', () => {
    const inicio = futura(3, '13:00');
    if (!inicio) return;
    reservarCita(en(hace(1), danielaUid), {
      items: [S('facial-hidratante'), S('shot-hidratante')],
      inicio,
      firma: firmaEnReserva(daniela),
      notas: 'Es mi primera vez con un facial (ejemplo).',
    });
  });
  intentar('cita sin firma de Fernanda', () => {
    const inicio = futura(2, '17:00');
    if (!inicio) return;
    reservarCitaStaff(en(hace(1), staff), {
      cliente_id: fernanda.id,
      items: [S('bikini-brasileno')],
      inicio,
      origen: 'whatsapp',
      notas: 'Agendó por WhatsApp; falta que firme (ejemplo).',
    });
  });
  if (rangosDe(hoy).length) {
    intentar('cita de hoy', () => {
      const r = reservarCitaStaff(en(hace(3), staff), {
        cliente_id: lucia.id,
        items: [S('cejas')],
        inicio: isoDesdeLocal(hoy, rangosDe(hoy)[0].hora_inicio),
        origen: 'mostrador',
        notas: null,
      });
      firmarConsentimientoCita(en(hace(3), staff), r.id, firmaDe(lucia));
      const cita = db.citas.find((c) => c.id === r.id);
      if (cita && antesDeAbrir(hoy)) cita.notas_internas = NOTA_ENSAYO;
    });
  }
  intentar('bloqueo de ejemplo', () => {
    const fecha = diaHabil(sumarDias(hoy, 9), 1);
    const inicio = isoDesdeLocal(fecha, horaEn(fecha, '16:00'));
    guardarBloqueo(en(hace(2), staff), {
      personal_id: especialista.id,
      inicio,
      fin: new Date(ms(inicio) + 3 * 60 * MS_MIN).toISOString(),
      motivo: 'Capacitación (ejemplo)',
    });
  });

  // ---------- Gastos (ejemplo) de los últimos 3 meses ----------
  const mesActual = inicioMes(hoy);
  const gasto = (categoria: string, concepto: string, monto: number, mes: string, dia: number, recurrente: boolean, metodo: MetodoPago = 'transferencia') => {
    const categoria_id = catGastoId.get(categoria);
    if (!categoria_id) return;
    const fecha = fechaEnMes(mes, dia);
    if (fecha > hoy) return;
    intentar(`gasto ${concepto}`, () =>
      guardarGasto(en(new Date(`${fecha}T12:00:00-06:00`), admin), {
        categoria_id,
        concepto,
        monto,
        fecha,
        periodo: mes,
        metodo_pago: metodo,
        proveedor: null,
        comprobante_url: null,
        recurrente_id: recurrente ? recurrenteId.get(categoria) ?? null : null,
        notas: 'Monto de ejemplo.',
      }),
    );
  };
  for (const atras of [3, 2, 1]) {
    const mes = sumarMesesAMes(mesActual, -atras);
    gasto('renta', 'Renta del local (ejemplo)', 12000, mes, 1, true);
    gasto('agua', 'Recibo de agua (ejemplo)', 280, mes, 15, true);
    gasto('internet', 'Internet (ejemplo)', 599, mes, 10, true, 'tarjeta');
    if (atras !== 2) gasto('luz', 'Recibo de luz CFE (ejemplo)', 1150, mes, 15, true);
  }
  gasto('renta', 'Renta del local (ejemplo)', 12000, mesActual, 1, true);
  gasto('publicidad', 'Publicidad en redes (ejemplo)', 1500, sumarMesesAMes(mesActual, -1), 20, false, 'tarjeta');
  gasto('capacitacion', 'Curso de faciales (ejemplo)', 2500, sumarMesesAMes(mesActual, -2), 8, false);

  // Próximo vencimiento: un periodo después del último pagado (o el de este mes si no hay pagos).
  for (const r of db.gastos_recurrentes) {
    const periodos = db.gastos
      .filter((g) => g.recurrente_id === r.id)
      .map((g) => g.periodo)
      .sort();
    const ultimo = periodos[periodos.length - 1];
    r.proximo_vencimiento = ultimo
      ? fechaEnMes(sumarMesesAMes(ultimo, mesesDeFrecuencia(r.frecuencia)), r.dia_pago)
      : fechaEnMes(mesActual, r.dia_pago);
  }

  return db;
}
