// Vistas de ESPEC §7 calculadas sobre la base en memoria.
import { fechaLocal, inicioMes } from '../../format';
import type {
  Catalogo,
  CitaDetalle,
  Cliente,
  ClienteResumen,
  ConsentimientoFirmado,
  CostoServicio,
  Credito,
  FichaSalud,
  GastoPorVencer,
  Paquete,
  PedidoDetalle,
  PersonalInterno,
  PersonalPublico,
  Politica,
  Producto,
  ProductoReposicion,
  ProductoTienda,
  ResultadoMensual,
  Sesion,
  TipoPolitica,
} from '../tipos';
import type {
  CitaFila,
  ClienteFila,
  ConsentimientoFila,
  CreditoFila,
  Db,
  FichaFila,
  PaqueteFila,
  PedidoFila,
  PoliticaFila,
  ProductoFila,
} from './modelo';
import { diasEntre, mesDeFecha, mesDeInstante, ms, MS_MIN, redondear, sumarMesesAMes } from './utilidades';

export const ORDEN_POLITICAS: TipoPolitica[] = [
  'terminos',
  'privacidad',
  'cancelacion',
  'consentimiento_depilacion',
  'consentimiento_facial',
  'consentimiento_corporal',
];

export function citaActiva(c: CitaFila): boolean {
  return c.estado !== 'cancelada' && c.estado !== 'no_asistio';
}

export function nombreCompleto(c: { nombre: string; apellidos: string | null }): string {
  return [c.nombre, c.apellidos].filter(Boolean).join(' ').trim();
}

// ---------- Clientas y sesión ----------

export function clientePublico(c: ClienteFila): Cliente {
  return {
    id: c.id,
    nombre: c.nombre,
    apellidos: c.apellidos,
    telefono: c.telefono,
    email: c.email,
    fecha_nacimiento: c.fecha_nacimiento,
    acepta_promociones: c.acepta_promociones,
  };
}

export function sesionDe(db: Db, usuarioId: string | null): Sesion | null {
  if (!usuarioId) return null;
  const u = db.usuarios.find((x) => x.id === usuarioId);
  if (!u) return null;
  const rol = db.perfiles.find((p) => p.id === u.id)?.rol ?? 'cliente';
  const c = db.clientes.find((x) => x.usuario_id === u.id);
  return { user_id: u.id, email: u.email, rol, cliente: c ? clientePublico(c) : null };
}

export function fichaVigenteFila(db: Db, clienteId: string): FichaFila | null {
  let ultima: FichaFila | null = null;
  for (const f of db.fichas_salud) {
    if (f.cliente_id !== clienteId) continue;
    if (!ultima || f.creado_en >= ultima.creado_en) ultima = f;
  }
  return ultima;
}

export function fichaVista(f: FichaFila | null): FichaSalud | null {
  if (!f) return null;
  return {
    respuestas: { ...f.respuestas },
    detalles: { ...f.detalles },
    alergias: f.alergias,
    medicamentos: f.medicamentos,
    observaciones: f.observaciones,
    acepta_datos_sensibles: f.acepta_datos_sensibles,
    creado_en: f.creado_en,
  };
}

// ---------- Catálogo y público ----------

export function paqueteVista(db: Db, p: PaqueteFila): Paquete {
  return {
    ...p,
    items: db.paquete_servicios
      .filter((ps) => ps.paquete_id === p.id)
      .map((ps) => ({ servicio_id: ps.servicio_id, cantidad: ps.cantidad })),
  };
}

export function catalogoVista(db: Db, incluirInactivos: boolean): Catalogo {
  const ordenCat = new Map(db.categorias_servicio.map((c) => [c.id, c.orden]));
  const categorias = [...db.categorias_servicio].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
  const servicios = db.servicios
    .filter((s) => incluirInactivos || s.activo)
    .sort(
      (a, b) =>
        (ordenCat.get(a.categoria_id) ?? 0) - (ordenCat.get(b.categoria_id) ?? 0) ||
        a.orden - b.orden ||
        a.nombre.localeCompare(b.nombre),
    );
  const paquetes = db.paquetes
    .filter((p) => incluirInactivos || p.activo)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map((p) => paqueteVista(db, p));
  return { categorias, servicios, paquetes };
}

export function politicaVista(p: PoliticaFila): Politica {
  return {
    id: p.id,
    tipo: p.tipo,
    version: p.version,
    titulo: p.titulo,
    contenido_md: p.contenido_md,
    hash_sha256: p.hash_sha256,
    vigente_desde: p.vigente_desde,
  };
}

export function politicaActiva(db: Db, tipo: TipoPolitica): PoliticaFila | null {
  return db.politicas.find((p) => p.tipo === tipo && p.activa) ?? null;
}

function compararPoliticas(a: PoliticaFila, b: PoliticaFila): number {
  return ORDEN_POLITICAS.indexOf(a.tipo) - ORDEN_POLITICAS.indexOf(b.tipo) || b.version - a.version;
}

export function politicasVigentes(db: Db): Politica[] {
  return db.politicas.filter((p) => p.activa).sort(compararPoliticas).map(politicaVista);
}

export function politicasTodas(db: Db): (Politica & { activa: boolean })[] {
  return [...db.politicas].sort(compararPoliticas).map((p) => ({ ...politicaVista(p), activa: p.activa }));
}

function compararFechaDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
}

export function equipoPublico(db: Db): PersonalPublico[] {
  return db.personal
    .filter((p) => p.activo && p.mostrar_en_sitio)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      nombre: p.nombre,
      titulo: p.titulo,
      bio: p.bio,
      foto_url: p.foto_url,
      orden: p.orden,
      capacitaciones: db.capacitaciones
        .filter((c) => c.personal_id === p.id && c.mostrar_en_sitio)
        .sort((a, b) => compararFechaDesc(a.fecha, b.fecha))
        .map((c) => ({
          id: c.id,
          personal_id: c.personal_id,
          nombre: c.nombre,
          institucion: c.institucion,
          tipo: c.tipo,
          fecha: c.fecha,
          horas: c.horas,
        })),
    }));
}

export function personalInterno(db: Db): PersonalInterno[] {
  return [...db.personal]
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map((p) => ({
      id: p.id,
      usuario_id: p.usuario_id,
      slug: p.slug,
      nombre: p.nombre,
      titulo: p.titulo,
      bio: p.bio,
      foto_url: p.foto_url,
      color_agenda: p.color_agenda,
      activo: p.activo,
      mostrar_en_sitio: p.mostrar_en_sitio,
      orden: p.orden,
      horarios: db.horarios
        .filter((h) => h.personal_id === p.id)
        .sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio))
        .map((h) => ({ id: h.id, dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin })),
      capacitaciones: db.capacitaciones
        .filter((c) => c.personal_id === p.id)
        .sort((a, b) => compararFechaDesc(a.fecha, b.fecha))
        .map((c) => ({
          id: c.id,
          personal_id: c.personal_id,
          nombre: c.nombre,
          institucion: c.institucion,
          tipo: c.tipo,
          fecha: c.fecha,
          horas: c.horas,
          mostrar_en_sitio: c.mostrar_en_sitio,
          constancia_url: c.constancia_url,
          notas: c.notas,
        })),
    }));
}

// ---------- Inventario ----------

export function costoUnitario(p: Pick<ProductoFila, 'costo_presentacion' | 'contenido_presentacion'>): number {
  return p.contenido_presentacion > 0 ? redondear(p.costo_presentacion / p.contenido_presentacion, 4) : 0;
}

export function productoVista(p: ProductoFila): Producto {
  return {
    id: p.id,
    nombre: p.nombre,
    marca: p.marca,
    categoria: p.categoria,
    unidad_medida: p.unidad_medida,
    presentacion: p.presentacion,
    contenido_presentacion: p.contenido_presentacion,
    costo_presentacion: p.costo_presentacion,
    costo_unitario: costoUnitario(p),
    stock_actual: redondear(p.stock_actual, 3),
    stock_minimo: p.stock_minimo,
    proveedor_id: p.proveedor_id,
    uso: p.uso,
    precio_venta: p.precio_venta,
    vendible_en_linea: p.vendible_en_linea,
    activo: p.activo,
    notas: p.notas,
  };
}

export function productosTienda(db: Db): ProductoTienda[] {
  return db.productos
    .filter((p) => p.activo && p.vendible_en_linea && p.precio_venta !== null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      marca: p.marca,
      presentacion: p.presentacion,
      precio_venta: p.precio_venta as number,
      hay_stock: p.stock_actual > 0,
    }));
}

/**
 * R12 / v_reposicion: necesita reposición si stock_actual <= stock_minimo (los más urgentes primero).
 * presentaciones_sugeridas = floor(faltante / contenido_presentacion) + 1: comprar lo sugerido deja el
 * stock por encima del mínimo (y el producto sale de la lista).
 */
export function reposicion(db: Db): ProductoReposicion[] {
  return db.productos
    .filter((p) => p.activo && p.stock_actual <= p.stock_minimo)
    .sort((a, b) => a.stock_actual - a.stock_minimo - (b.stock_actual - b.stock_minimo) || a.nombre.localeCompare(b.nombre))
    .map((p) => {
      const faltante = redondear(Math.max(0, p.stock_minimo - p.stock_actual), 3);
      // Redondeo previo: en JS 0.7 / 0.1 = 6.999…; en SQL (numeric exacto) da 7.
      const presentaciones = Math.floor(redondear(faltante / (p.contenido_presentacion || 1), 9)) + 1;
      return {
        id: p.id,
        nombre: p.nombre,
        marca: p.marca,
        unidad_medida: p.unidad_medida,
        stock_actual: redondear(p.stock_actual, 3),
        stock_minimo: p.stock_minimo,
        faltante,
        presentacion: p.presentacion,
        contenido_presentacion: p.contenido_presentacion,
        presentaciones_sugeridas: presentaciones,
        costo_estimado: redondear(presentaciones * p.costo_presentacion, 2),
        proveedor_nombre: db.proveedores.find((x) => x.id === p.proveedor_id)?.nombre ?? null,
      };
    });
}

export function costosServicios(db: Db): CostoServicio[] {
  const cats = new Map(db.categorias_servicio.map((c) => [c.id, c]));
  return db.servicios
    .filter((s) => s.activo)
    .sort(
      (a, b) =>
        (cats.get(a.categoria_id)?.orden ?? 0) - (cats.get(b.categoria_id)?.orden ?? 0) || a.orden - b.orden,
    )
    .map((s) => {
      const receta = db.recetas_servicio.filter((r) => r.servicio_id === s.id);
      let costo = 0;
      for (const r of receta) {
        const p = db.productos.find((x) => x.id === r.producto_id);
        if (p) costo += r.cantidad * costoUnitario(p);
      }
      const costo_material = redondear(costo, 2);
      const margen = s.precio === null ? null : redondear(s.precio - costo_material, 2);
      const margen_pct = s.precio === null || s.precio === 0 || margen === null ? null : redondear((margen / s.precio) * 100, 1);
      return {
        servicio_id: s.id,
        slug: s.slug,
        nombre: s.nombre,
        categoria: cats.get(s.categoria_id)?.nombre ?? '',
        precio: s.precio,
        costo_material,
        margen,
        margen_pct,
        tiene_receta: receta.length > 0,
      };
    });
}

// ---------- Citas ----------

export function pagadoCita(db: Db, citaId: string): number {
  return redondear(
    db.pagos.filter((p) => p.cita_id === citaId).reduce((s, p) => s + p.monto, 0),
    2,
  );
}

export function citaDetalle(db: Db, c: CitaFila): CitaDetalle {
  const cliente = db.clientes.find((x) => x.id === c.cliente_id);
  const personal = db.personal.find((x) => x.id === c.personal_id);
  const cabina = db.cabinas.find((x) => x.id === c.cabina_id);
  return {
    id: c.id,
    cliente_id: c.cliente_id,
    cliente_nombre: cliente ? nombreCompleto(cliente) : '',
    cliente_telefono: cliente?.telefono ?? null,
    inicio: c.inicio,
    fin: c.fin,
    duracion_min: Math.round((ms(c.fin) - ms(c.inicio)) / MS_MIN),
    estado: c.estado,
    origen: c.origen,
    primera_vez: c.primera_vez,
    requiere_revision: c.requiere_revision,
    alertas: [...c.alertas],
    notas_cliente: c.notas_cliente,
    total: c.total,
    personal_id: c.personal_id,
    personal_nombre: personal?.nombre ?? '',
    personal_titulo: personal?.titulo ?? null,
    cabina_nombre: cabina?.nombre ?? null,
    consentimientos_firmados: db.consentimientos.filter((k) => k.cita_id === c.id).length,
    pagado: pagadoCita(db, c.id),
    items: db.cita_items
      .filter((i) => i.cita_id === c.id)
      .map((i) => ({
        nombre: i.nombre,
        precio: i.precio,
        duracion_min: i.duracion_min,
        servicio_id: i.servicio_id,
        paquete_id: i.paquete_id,
      })),
  };
}

export function citasDetalle(db: Db, filtro: (c: CitaFila) => boolean, orden: 'asc' | 'desc' = 'asc'): CitaDetalle[] {
  const f = orden === 'asc' ? 1 : -1;
  return db.citas
    .filter(filtro)
    .sort((a, b) => (a.inicio < b.inicio ? -f : a.inicio > b.inicio ? f : 0))
    .map((c) => citaDetalle(db, c));
}

// ---------- Pedidos y créditos ----------

export function pagadoPedido(db: Db, pedidoId: string): number {
  return redondear(
    db.pagos.filter((p) => p.pedido_id === pedidoId).reduce((s, p) => s + p.monto, 0),
    2,
  );
}

export function pedidoDetalle(db: Db, p: PedidoFila): PedidoDetalle {
  const cliente = db.clientes.find((x) => x.id === p.cliente_id);
  return {
    id: p.id,
    folio: p.folio,
    cliente_id: p.cliente_id,
    cliente_nombre: cliente ? nombreCompleto(cliente) : '',
    estado: p.estado,
    total: p.total,
    pagado: pagadoPedido(db, p.id),
    metodo_pago_preferido: p.metodo_pago_preferido,
    notas: p.notas,
    creado_en: p.creado_en,
    pagado_en: p.pagado_en,
    items: db.pedido_items
      .filter((i) => i.pedido_id === p.id)
      .map((i) => ({
        tipo: i.tipo,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        importe: redondear(i.cantidad * i.precio_unitario, 2),
        regalo_para: i.regalo_para,
      })),
  };
}

export function pedidosDetalle(db: Db, filtro: (p: PedidoFila) => boolean): PedidoDetalle[] {
  return db.pedidos
    .filter(filtro)
    .sort((a, b) => (a.creado_en < b.creado_en ? 1 : a.creado_en > b.creado_en ? -1 : 0))
    .map((p) => pedidoDetalle(db, p));
}

export function creditoVigente(c: CreditoFila, hoy: string): boolean {
  return c.cantidad - c.usados > 0 && (c.vence_en === null || c.vence_en >= hoy);
}

export function creditoVista(db: Db, c: CreditoFila, hoy: string): Credito {
  const nombre = c.servicio_id
    ? db.servicios.find((s) => s.id === c.servicio_id)?.nombre
    : db.paquetes.find((p) => p.id === c.paquete_id)?.nombre;
  return {
    id: c.id,
    cliente_id: c.cliente_id,
    nombre: nombre ?? '',
    servicio_id: c.servicio_id,
    paquete_id: c.paquete_id,
    cantidad: c.cantidad,
    usados: c.usados,
    restantes: c.cantidad - c.usados,
    vence_en: c.vence_en,
    vigente: creditoVigente(c, hoy),
    codigo_regalo: c.codigo_regalo,
    regalo_para: c.regalo_para,
    creado_en: c.creado_en,
  };
}

export function creditosDe(db: Db, clienteId: string, hoy: string): Credito[] {
  return db.creditos
    .filter((c) => c.cliente_id === clienteId)
    .sort((a, b) => (a.creado_en < b.creado_en ? 1 : a.creado_en > b.creado_en ? -1 : 0))
    .map((c) => creditoVista(db, c, hoy));
}

// ---------- Consentimientos ----------

export function consentimientoVista(db: Db, k: ConsentimientoFila): ConsentimientoFirmado {
  const pol = db.politicas.find((p) => p.id === k.politica_id);
  return {
    id: k.id,
    cita_id: k.cita_id,
    politica_tipo: pol?.tipo ?? 'consentimiento_depilacion',
    politica_titulo: pol?.titulo ?? '',
    politica_version: pol?.version ?? 1,
    nombre_firmante: k.nombre_firmante,
    tutor_nombre: k.tutor_nombre,
    firma_svg: k.firma_svg,
    documento_hash: k.documento_hash,
    firmado_en: k.firmado_en,
  };
}

export function consentimientosDe(db: Db, clienteId: string): ConsentimientoFirmado[] {
  return db.consentimientos
    .filter((k) => k.cliente_id === clienteId)
    .sort((a, b) => (a.firmado_en < b.firmado_en ? 1 : a.firmado_en > b.firmado_en ? -1 : 0))
    .map((k) => consentimientoVista(db, k));
}

// ---------- Resumen de clientas ----------

export function clienteResumen(db: Db, c: ClienteFila, ahora: Date): ClienteResumen {
  const ahoraIso = ahora.toISOString();
  const citas = db.citas.filter((x) => x.cliente_id === c.id);
  const completadas = citas.filter((x) => x.estado === 'completada');
  const ultima = completadas.reduce<string | null>((m, x) => (m === null || x.inicio > m ? x.inicio : m), null);
  const proxima = citas
    .filter((x) => (x.estado === 'pendiente' || x.estado === 'confirmada') && x.inicio >= ahoraIso)
    .reduce<string | null>((m, x) => (m === null || x.inicio < m ? x.inicio : m), null);
  const citaIds = new Set(citas.map((x) => x.id));
  const pedidoIds = new Set(db.pedidos.filter((p) => p.cliente_id === c.id).map((p) => p.id));
  const total = db.pagos
    .filter((p) => p.metodo !== 'cortesia') // como v_clientes_resumen: las cortesías no cuentan
    .filter((p) => (p.cita_id && citaIds.has(p.cita_id)) || (p.pedido_id && pedidoIds.has(p.pedido_id)))
    .reduce((s, p) => s + p.monto, 0);
  return {
    id: c.id,
    nombre: c.nombre,
    apellidos: c.apellidos,
    telefono: c.telefono,
    email: c.email,
    fecha_nacimiento: c.fecha_nacimiento,
    tiene_cuenta: c.usuario_id !== null,
    citas_completadas: completadas.length,
    ultima_visita: ultima,
    proxima_cita: proxima,
    total_pagado: redondear(total, 2),
    creado_en: c.creado_en,
    es_personal: esCuentaDelEquipo(db, c.usuario_id),
  };
}

/** ¿La cuenta ligada es del equipo (rol personal o admin)? */
export function esCuentaDelEquipo(db: Db, usuarioId: string | null): boolean {
  if (!usuarioId) return false;
  const rol = db.perfiles.find((p) => p.id === usuarioId)?.rol;
  return rol === 'personal' || rol === 'admin';
}

// ---------- Gastos y resultados ----------

export function gastosPorVencer(db: Db, hoy: string): GastoPorVencer[] {
  const cats = new Map(db.categorias_gasto.map((c) => [c.id, c.nombre]));
  return db.gastos_recurrentes
    .filter((g) => g.activo)
    .map((g) => {
      const dias = g.proximo_vencimiento ? diasEntre(hoy, g.proximo_vencimiento) : null;
      const estado: GastoPorVencer['estado'] = dias === null ? 'al_corriente' : dias < 0 ? 'vencido' : dias <= 7 ? 'proximo' : 'al_corriente';
      return {
        id: g.id,
        concepto: g.concepto,
        categoria: cats.get(g.categoria_id) ?? '',
        monto_estimado: g.monto_estimado,
        frecuencia: g.frecuencia,
        proximo_vencimiento: g.proximo_vencimiento,
        dias_restantes: dias,
        estado,
      };
    })
    .sort((a, b) => {
      if (a.proximo_vencimiento === b.proximo_vencimiento) return a.concepto.localeCompare(b.concepto);
      if (a.proximo_vencimiento === null) return 1;
      if (b.proximo_vencimiento === null) return -1;
      return a.proximo_vencimiento < b.proximo_vencimiento ? -1 : 1;
    });
}

/**
 * v_resultado_mensual de los últimos `meses` meses (incluye el actual), del más antiguo al
 * más reciente; los meses sin actividad aparecen en ceros.
 */
export function resultadosMensuales(db: Db, ahora: Date, meses: number): ResultadoMensual[] {
  const n = Math.max(1, Math.min(60, Math.floor(meses) || 1));
  const actual = inicioMes(fechaLocal(ahora));
  const filas = new Map<string, ResultadoMensual>();
  for (let i = n - 1; i >= 0; i--) {
    const mes = sumarMesesAMes(actual, -i);
    filas.set(mes, {
      mes,
      ingresos: 0,
      propinas: 0,
      costo_insumos: 0,
      compras: 0,
      gastos: 0,
      utilidad: 0,
      flujo: 0,
      citas_completadas: 0,
    });
  }
  for (const p of db.pagos) {
    const f = filas.get(mesDeInstante(p.pagado_en));
    if (!f) continue;
    if (p.metodo !== 'cortesia') f.ingresos += p.monto; // las cortesías no son ingreso
    f.propinas += p.propina;
  }
  for (const m of db.movimientos_inventario) {
    if (m.tipo !== 'consumo') continue;
    const f = filas.get(mesDeInstante(m.creado_en));
    if (f) f.costo_insumos += -(m.cantidad * (m.costo_unitario ?? 0));
  }
  for (const c of db.compras) {
    const f = filas.get(mesDeFecha(c.fecha));
    if (f) f.compras += c.total;
  }
  for (const g of db.gastos) {
    const f = filas.get(mesDeFecha(g.periodo));
    if (f) f.gastos += g.monto;
  }
  for (const c of db.citas) {
    if (c.estado !== 'completada') continue;
    const f = filas.get(mesDeInstante(c.inicio));
    if (f) f.citas_completadas += 1;
  }
  return [...filas.values()].map((f) => {
    const ingresos = redondear(f.ingresos, 2);
    const costo_insumos = redondear(f.costo_insumos, 2);
    const compras = redondear(f.compras, 2);
    const gastos = redondear(f.gastos, 2);
    return {
      ...f,
      ingresos,
      propinas: redondear(f.propinas, 2),
      costo_insumos,
      compras,
      gastos,
      utilidad: redondear(ingresos - costo_insumos - gastos, 2),
      flujo: redondear(ingresos - compras - gastos, 2),
    };
  });
}
