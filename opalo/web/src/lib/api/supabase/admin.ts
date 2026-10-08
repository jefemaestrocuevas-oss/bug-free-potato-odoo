// Panel interno (personal y admin): vistas v_*, RPC de personal y escrituras directas de ESPEC §6.1.
import { fechaLocal, inicioMes, sumarDias, isoDesdeLocal } from '../../format';
import { ErrorOpalo, type OpaloApi, type PaqueteItem } from '../tipos';
import {
  aBloqueo,
  aCapacitacion,
  aCategoriaGasto,
  aCitaDetalle,
  aClienteResumen,
  aConsentimiento,
  aCostoServicio,
  aCredito,
  aFichaSalud,
  aGasto,
  aGastoPorVencer,
  aGastoRecurrente,
  agrupar,
  aHorario,
  aMovimiento,
  aPedidoDetalle,
  aPolitica,
  aProducto,
  aProductoReposicion,
  aProveedor,
  aResultadoMensual,
  aResultadoReserva,
  bool,
  COLUMNAS_CAPACITACION,
  COLUMNAS_CITA_DETALLE,
  COLUMNAS_CLIENTE_RESUMEN,
  COLUMNAS_COSTO_SERVICIO,
  COLUMNAS_CREDITO,
  COLUMNAS_GASTO,
  COLUMNAS_GASTO_POR_VENCER,
  COLUMNAS_GASTO_RECURRENTE,
  COLUMNAS_PEDIDO_DETALLE,
  COLUMNAS_PERSONAL,
  COLUMNAS_PRODUCTO,
  COLUMNAS_PROVEEDOR,
  COLUMNAS_REPOSICION,
  COLUMNAS_RESULTADO_MENSUAL,
  compararPoliticas,
  completarMeses,
  esFecha,
  fechaONula,
  limpio,
  num,
  numONulo,
  rangoFechas,
  rangoInstantes,
  resultadoVacio,
  sumarMesesAMes,
  texto,
  textoONulo,
  type Fila,
} from './conversion';
import type { Contexto } from './contexto';
import { consultaConsentimientos, consultaFichaVigente } from './clienta';
import { COLUMNAS_POLITICA, itemsReserva } from './publico';
import { MSG_SUPABASE } from './errores';

type ApiAdmin = OpaloApi['admin'];
type Nivel = 'personal' | 'admin';

const MSG_ADMIN = {
  nombreClienta: 'Escribe el nombre de la clienta.',
  clienteNoExiste: 'No encontramos a esa clienta.',
  monto: 'El monto debe ser mayor a cero.',
  rangoBloqueo: 'El fin del bloqueo debe ser después del inicio.',
} as const;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** minúsculas y sin acentos, para búsquedas. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** 'Depilación Bikini' → 'depilacion-bikini' (sin acentos ni ñ, como pide ESPEC §2). */
export function slugLimpio(s: string): string {
  return normalizar(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Filtro de PostgREST (`or=`) que trae un superconjunto de las clientas que coinciden con
 * la búsqueda; el filtrado exacto (sin acentos) se hace después en el navegador.
 * Las vocales y la n se vuelven comodín de un carácter (`_`) para que "maria" encuentre "María".
 */
export function filtroBusquedaClientes(busqueda: string): string | null {
  const q = normalizar(busqueda);
  const digitos = (busqueda ?? '').replace(/\D/g, '');
  const partes: string[] = [];
  const token = q.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? '';
  if (token.length >= 2) {
    const patron = token.replace(/[^a-z0-9@-]/g, '_').replace(/[aeioun]/g, '_');
    for (const col of ['nombre', 'apellidos', 'email', 'telefono']) partes.push(`${col}.ilike.*${patron}*`);
  }
  if (digitos.length >= 3) partes.push(`telefono.ilike.*${digitos.split('').join('*')}*`);
  return partes.length ? partes.join(',') : null;
}

/** ¿Coincide la clienta con la búsqueda? (mismo criterio que el modo demostración) */
export function coincideBusqueda(c: { nombre: string; apellidos: string | null; email: string | null; telefono: string | null }, busqueda: string): boolean {
  const q = normalizar(busqueda);
  if (!q) return true;
  const digitos = (busqueda ?? '').replace(/\D/g, '');
  const textoClienta = normalizar([c.nombre, c.apellidos, c.email, c.telefono].filter(Boolean).join(' '));
  return textoClienta.includes(q) || (digitos.length >= 3 && (c.telefono ?? '').replace(/\D/g, '').includes(digitos));
}

function nombreCompleto(c: { nombre: string; apellidos: string | null }): string {
  return [c.nombre, c.apellidos].filter(Boolean).join(' ');
}

function diasDelMes(anio: number, mes1a12: number): number {
  return new Date(Date.UTC(anio, mes1a12, 0)).getUTCDate();
}

function fechaEnMes(mes01: string, dia: number): string {
  const [a, m] = mes01.split('-').map(Number);
  const d = Math.min(Math.max(1, dia), diasDelMes(a, m));
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Primer vencimiento en o después de `hoy` para un día de pago (igual que public.primer_vencimiento). */
export function primerVencimiento(hoy: string, diaPago: number): string {
  const mes = inicioMes(hoy);
  const este = fechaEnMes(mes, diaPago);
  return este >= hoy ? este : fechaEnMes(sumarMesesAMes(mes, 1), diaPago);
}

const numeroONulo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : null;
};

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es');

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export function crearApiAdmin(ctx: Contexto): ApiAdmin {
  const { sb } = ctx;

  /** Inserta o actualiza (por id) y devuelve la fila con `columnas`. */
  async function guardarFila(tabla: string, datos: Record<string, unknown>, id: string | null | undefined, nivel: Nivel, columnas = 'id'): Promise<Fila> {
    if (id) {
      const f = await ctx.fila(sb.from(tabla).update(datos).eq('id', id).select(columnas).maybeSingle());
      if (!f) throw await ctx.errorSinFilas(nivel);
      return f;
    }
    const f = await ctx.fila(sb.from(tabla).insert(datos).select(columnas).single());
    if (!f) throw new ErrorOpalo(MSG_SUPABASE.generico);
    return f;
  }

  /**
   * Actualiza por id sin pedir la fila de vuelta (return=minimal): sirve para columnas que la sesión
   * puede escribir pero no leer (clientes.notas_internas, ESPEC §5.1). El conteo de filas afectadas
   * dice si RLS la filtró o si ya no existe.
   */
  async function actualizarSinDevolver(
    tabla: string,
    datos: Record<string, unknown>,
    id: string,
    nivel: Nivel,
  ): Promise<ErrorOpalo | null> {
    const n = await ctx.afectadas(sb.from(tabla).update(datos, { count: 'exact' }).eq('id', id));
    return n === 0 ? ctx.errorSinFilas(nivel) : null;
  }

  /** Borra por id. Si no borró nada: error si fue por permisos; si ya no existía, no pasa nada. */
  async function eliminarFila(tabla: string, id: string, nivel: Nivel): Promise<void> {
    const fs = await ctx.filas(sb.from(tabla).delete().eq('id', id).select('id'));
    if (fs.length) return;
    const e = await ctx.errorSinFilas(nivel);
    if (e.codigo !== 'sin_filas') throw e;
  }

  async function esAdmin(): Promise<boolean> {
    return (await ctx.rpc('es_admin')) === true;
  }

  return {
    // ------------------------------- resumen -------------------------------
    async getResumenHoy() {
      const ahora = ctx.ahora();
      const hoy = fechaLocal(ahora);
      const desde = isoDesdeLocal(hoy, '00:00');
      const hasta = isoDesdeLocal(sumarDias(hoy, 1), '00:00');
      const mes = inicioMes(hoy);
      const [admin, citas, porRevisar, reposicion, pedidosPendientes, gastos, meses] = await Promise.all([
        esAdmin(),
        ctx.filas(
          sb
            .from('v_citas_detalle')
            .select(COLUMNAS_CITA_DETALLE)
            .gte('inicio', desde)
            .lt('inicio', hasta)
            .neq('estado', 'cancelada')
            .order('inicio'),
        ),
        ctx.contar(
          sb.from('citas').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente').gte('fin', ahora.toISOString()),
        ),
        ctx.filas(sb.from('v_reposicion').select(COLUMNAS_REPOSICION)),
        ctx.contar(sb.from('pedidos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente_pago')),
        // Las vistas de admin devuelven vacío para el personal (where es_admin()).
        ctx.filas(sb.from('v_gastos_por_vencer').select(COLUMNAS_GASTO_POR_VENCER).neq('estado', 'al_corriente')),
        ctx.filas(sb.from('v_resultado_mensual').select(COLUMNAS_RESULTADO_MENSUAL).eq('mes', mes)),
      ]);
      return {
        citas_hoy: citas.map(aCitaDetalle),
        por_revisar: porRevisar,
        reposicion: reposicion.map(aProductoReposicion),
        gastos_por_vencer: admin ? gastos.map(aGastoPorVencer) : [],
        mes_actual: admin ? (meses[0] ? aResultadoMensual(meses[0]) : resultadoVacio(mes)) : null,
        pedidos_pendientes: pedidosPendientes,
      };
    },

    // ------------------------------- agenda -------------------------------
    async getAgenda(desde, hasta) {
      const [d, h] = rangoInstantes(desde, hasta);
      const fs = await ctx.filas(
        sb.from('v_citas_detalle').select(COLUMNAS_CITA_DETALLE).gte('inicio', d).lt('inicio', h).order('inicio'),
      );
      return fs.map(aCitaDetalle);
    },

    async reservarParaCliente(s) {
      const data = await ctx.rpc('reservar_cita_staff', {
        p_cliente_id: s.cliente_id,
        p_items: itemsReserva(s.items),
        p_inicio: s.inicio,
        p_personal_id: s.personal_id || null,
        p_origen: s.origen ?? 'whatsapp',
        p_notas: limpio(s.notas),
      });
      return aResultadoReserva(data);
    },

    async cambiarEstadoCita(cita_id, estado) {
      await ctx.rpc('cambiar_estado_cita', { p_cita_id: cita_id, p_estado: estado });
    },

    async completarCita(cita_id) {
      await ctx.rpc('completar_cita', { p_cita_id: cita_id });
    },

    async getBloqueos(desde, hasta) {
      const [d, h] = rangoInstantes(desde, hasta);
      const fs = await ctx.filas(
        sb.from('bloqueos_agenda').select('id, personal_id, inicio, fin, motivo').lt('inicio', h).gt('fin', d).order('inicio'),
      );
      return fs.map(aBloqueo);
    },

    async guardarBloqueo(b) {
      const ini = new Date(b.inicio).getTime();
      const fin = new Date(b.fin).getTime();
      if (!Number.isFinite(ini) || !Number.isFinite(fin)) throw new ErrorOpalo(MSG_SUPABASE.datoFaltante);
      if (fin <= ini) throw new ErrorOpalo(MSG_ADMIN.rangoBloqueo);
      await guardarFila(
        'bloqueos_agenda',
        {
          personal_id: b.personal_id || null,
          inicio: new Date(ini).toISOString(),
          fin: new Date(fin).toISOString(),
          motivo: limpio(b.motivo),
        },
        b.id,
        'personal',
      );
    },

    async eliminarBloqueo(id) {
      await eliminarFila('bloqueos_agenda', id, 'personal');
    },

    // ------------------------------- clientas -------------------------------
    async getClientes(busqueda) {
      let q = sb.from('v_clientes_resumen').select(COLUMNAS_CLIENTE_RESUMEN);
      const filtro = busqueda ? filtroBusquedaClientes(busqueda) : null;
      if (filtro) q = q.or(filtro);
      const fs = await ctx.filas(q.order('nombre').order('apellidos'));
      return fs
        .map(aClienteResumen)
        .filter((c) => !busqueda || coincideBusqueda(c, busqueda))
        .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'));
    },

    async getExpediente(cliente_id) {
      const [resumen, notas, ficha, citas, pedidos, creditos, consentimientos] = await Promise.all([
        ctx.fila(sb.from('v_clientes_resumen').select(COLUMNAS_CLIENTE_RESUMEN).eq('id', cliente_id).maybeSingle()),
        // clientes.notas_internas no tiene SELECT para la sesión (ESPEC §5.1): se lee en v_clientes_notas.
        ctx.fila(sb.from('v_clientes_notas').select('id, notas_internas').eq('id', cliente_id).maybeSingle()),
        ctx.fila(consultaFichaVigente(ctx, cliente_id)),
        ctx.filas(
          sb.from('v_citas_detalle').select(COLUMNAS_CITA_DETALLE).eq('cliente_id', cliente_id).order('inicio', { ascending: false }),
        ),
        ctx.filas(
          sb.from('v_pedidos_detalle').select(COLUMNAS_PEDIDO_DETALLE).eq('cliente_id', cliente_id).order('creado_en', { ascending: false }),
        ),
        ctx.filas(sb.from('v_creditos').select(COLUMNAS_CREDITO).eq('cliente_id', cliente_id).order('creado_en', { ascending: false })),
        ctx.filas(consultaConsentimientos(ctx, cliente_id)),
      ]);
      if (!resumen) {
        const e = await ctx.errorSinFilas('personal');
        throw e.codigo === 'sin_filas' ? new ErrorOpalo(MSG_ADMIN.clienteNoExiste) : e;
      }
      return {
        cliente: { ...aClienteResumen(resumen), notas_internas: textoONulo(notas?.notas_internas) },
        ficha: aFichaSalud(ficha),
        citas: citas.map(aCitaDetalle),
        pedidos: pedidos.map(aPedidoDetalle),
        creditos: creditos.map(aCredito),
        consentimientos: consentimientos.map(aConsentimiento),
      };
    },

    async crearCliente(c) {
      const nombre = (c.nombre ?? '').trim();
      if (!nombre) throw new ErrorOpalo(MSG_ADMIN.nombreClienta);
      const email = limpio(c.email)?.toLowerCase() ?? null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorOpalo(MSG_SUPABASE.correoInvalido);
      const f = await guardarFila(
        'clientes',
        {
          nombre,
          apellidos: limpio(c.apellidos),
          telefono: limpio(c.telefono),
          email,
          fecha_nacimiento: limpio(c.fecha_nacimiento),
          notas_internas: limpio(c.notas_internas),
        },
        null,
        'personal',
      );
      return texto(f.id);
    },

    async guardarNotasCliente(cliente_id, notas) {
      const e = await actualizarSinDevolver('clientes', { notas_internas: limpio(notas) }, cliente_id, 'personal');
      if (e) throw e.codigo === 'sin_filas' ? new ErrorOpalo(MSG_ADMIN.clienteNoExiste, 'sin_filas') : e;
    },

    // ------------------------------- pedidos y pagos -------------------------------
    async getPedidos(estado) {
      let q = sb.from('v_pedidos_detalle').select(COLUMNAS_PEDIDO_DETALLE);
      if (estado) q = q.eq('estado', estado);
      const fs = await ctx.filas(q.order('creado_en', { ascending: false }));
      return fs.map(aPedidoDetalle);
    },

    async registrarPago(p) {
      const monto = Number(p.monto);
      if (!Number.isFinite(monto) || monto <= 0) throw new ErrorOpalo(MSG_ADMIN.monto);
      await ctx.rpc('registrar_pago', {
        p_monto: monto,
        p_metodo: p.metodo,
        p_pedido_id: p.pedido_id || null,
        p_cita_id: p.cita_id || null,
        p_referencia: limpio(p.referencia),
        p_propina: Number(p.propina) > 0 ? Number(p.propina) : 0,
      });
    },

    async cancelarPedido(pedido_id) {
      await ctx.rpc('cancelar_pedido', { p_pedido_id: pedido_id });
    },

    // ------------------------------- inventario -------------------------------
    async getProductos() {
      const fs = await ctx.filas(sb.from('productos').select(COLUMNAS_PRODUCTO).order('nombre'));
      return fs.map(aProducto).sort(porNombre);
    },

    async guardarProducto(p) {
      const nombre = (p.nombre ?? '').trim();
      const contenido = Number(p.contenido_presentacion);
      const costo = Number(p.costo_presentacion) || 0;
      if (!nombre || !(contenido > 0) || costo < 0) throw new ErrorOpalo(MSG_SUPABASE.datoFaltante);
      // stock_actual sólo cambia con movimientos; costo_unitario es calculado: nunca se envían.
      const f = await guardarFila(
        'productos',
        {
          nombre,
          marca: limpio(p.marca),
          categoria: p.categoria,
          unidad_medida: p.unidad_medida,
          presentacion: limpio(p.presentacion),
          contenido_presentacion: contenido,
          costo_presentacion: costo,
          stock_minimo: Math.max(0, Number(p.stock_minimo) || 0),
          proveedor_id: p.proveedor_id || null,
          uso: p.uso,
          precio_venta: numeroONulo(p.precio_venta),
          vendible_en_linea: !!p.vendible_en_linea,
          activo: p.activo !== false,
          notas: limpio(p.notas),
        },
        p.id,
        'personal',
        COLUMNAS_PRODUCTO,
      );
      return aProducto(f);
    },

    async getReposicion() {
      return (await ctx.filas(sb.from('v_reposicion').select(COLUMNAS_REPOSICION))).map(aProductoReposicion);
    },

    async registrarCompra(c) {
      const args: Record<string, unknown> = {
        p_items: (c.items ?? []).map((it) => ({
          producto_id: it.producto_id,
          presentaciones: Number(it.presentaciones),
          costo_presentacion: Number(it.costo_presentacion),
        })),
        p_proveedor_id: c.proveedor_id || null,
        p_folio: limpio(c.folio),
        p_notas: limpio(c.notas),
      };
      // Sin fecha, la base usa "hoy" en Querétaro (default de p_fecha).
      if (c.fecha && esFecha(c.fecha)) args.p_fecha = c.fecha;
      await ctx.rpc('registrar_compra', args);
    },

    async ajustarInventario(producto_id, cantidad, tipo, nota) {
      await ctx.rpc('ajustar_inventario', {
        p_producto_id: producto_id,
        p_cantidad: Number(cantidad),
        p_tipo: tipo,
        p_nota: limpio(nota),
      });
    },

    async getMovimientos(producto_id, limite) {
      let q = sb
        .from('movimientos_inventario')
        .select('id, producto_id, tipo, cantidad, costo_unitario, nota, creado_en, productos(nombre)');
      if (producto_id) q = q.eq('producto_id', producto_id);
      const n = limite && limite > 0 ? Math.floor(limite) : 100;
      const fs = await ctx.filas(q.order('creado_en', { ascending: false }).limit(n));
      return fs.map(aMovimiento);
    },

    async getProveedores() {
      const fs = await ctx.filas(sb.from('proveedores').select(COLUMNAS_PROVEEDOR).order('nombre'));
      return fs.map(aProveedor).sort(porNombre);
    },

    async guardarProveedor(p) {
      const nombre = (p.nombre ?? '').trim();
      if (!nombre) throw new ErrorOpalo(MSG_SUPABASE.datoFaltante);
      const f = await guardarFila(
        'proveedores',
        {
          nombre,
          contacto: limpio(p.contacto),
          telefono: limpio(p.telefono),
          email: limpio(p.email),
          ciudad: limpio(p.ciudad),
          notas: limpio(p.notas),
          activo: p.activo !== false,
        },
        p.id,
        'personal',
        COLUMNAS_PROVEEDOR,
      );
      return aProveedor(f);
    },

    // ------------------------------- costos -------------------------------
    async getReceta(servicio_id) {
      const fs = await ctx.filas(sb.from('recetas_servicio').select('producto_id, cantidad, notas').eq('servicio_id', servicio_id));
      return fs.map((f) => ({ producto_id: texto(f.producto_id), cantidad: num(f.cantidad), notas: textoONulo(f.notas) }));
    },

    async guardarReceta(servicio_id, items) {
      // Reemplazo completo de la receta en una sola transacción (ESPEC §6: guardar_receta). La base
      // valida, junta los productos repetidos (conserva la primera nota) y responde con los mismos
      // textos que la demo; aquí no se valida para no dar otro mensaje.
      await ctx.rpc('guardar_receta', {
        p_servicio_id: servicio_id,
        p_items: (items ?? []).map((it) => ({
          producto_id: it.producto_id || null,
          cantidad: it.cantidad,
          notas: limpio(it.notas),
        })),
      });
    },

    async getCostosServicios() {
      return (await ctx.filas(sb.from('v_costo_servicio').select(COLUMNAS_COSTO_SERVICIO))).map(aCostoServicio);
    },

    // ------------------------------- gastos y resultados -------------------------------
    async getCategoriasGasto() {
      const fs = await ctx.filas(
        sb.from('categorias_gasto').select('id, slug, nombre, es_fijo').order('es_fijo', { ascending: false }).order('nombre'),
      );
      return fs.map(aCategoriaGasto);
    },

    async getGastos(desde, hasta) {
      const [d, h] = rangoFechas(desde, hasta);
      const fs = await ctx.filas(
        sb
          .from('gastos')
          .select(COLUMNAS_GASTO)
          .gte('fecha', d)
          .lte('fecha', h)
          .order('fecha', { ascending: false })
          .order('creado_en', { ascending: false }),
      );
      return fs.map(aGasto);
    },

    async guardarGasto(g) {
      const monto = Number(g.monto);
      if (!Number.isFinite(monto) || monto <= 0) throw new ErrorOpalo(MSG_ADMIN.monto);
      const concepto = (g.concepto ?? '').trim();
      if (!concepto || !g.categoria_id) throw new ErrorOpalo(MSG_SUPABASE.datoFaltante);
      const fecha = g.fecha && esFecha(g.fecha) ? g.fecha : fechaLocal(ctx.ahora());
      await guardarFila(
        'gastos',
        {
          categoria_id: g.categoria_id,
          concepto,
          monto: Math.round(monto * 100) / 100,
          fecha,
          periodo: inicioMes(g.periodo && esFecha(g.periodo) ? g.periodo : fecha),
          metodo_pago: g.metodo_pago ?? null,
          proveedor: limpio(g.proveedor),
          comprobante_url: limpio(g.comprobante_url),
          recurrente_id: g.recurrente_id || null,
          notas: limpio(g.notas),
        },
        g.id,
        'admin',
      );
    },

    async eliminarGasto(id) {
      await eliminarFila('gastos', id, 'admin');
    },

    async getGastosRecurrentes() {
      const fs = await ctx.filas(
        sb
          .from('gastos_recurrentes')
          .select(COLUMNAS_GASTO_RECURRENTE)
          .order('proximo_vencimiento', { ascending: true, nullsFirst: false })
          .order('concepto'),
      );
      return fs.map(aGastoRecurrente);
    },

    async guardarGastoRecurrente(g) {
      const dia = Math.round(Number(g.dia_pago));
      const concepto = (g.concepto ?? '').trim();
      if (!concepto || !g.categoria_id || !(dia >= 1 && dia <= 31)) throw new ErrorOpalo(MSG_SUPABASE.datoFaltante);
      const monto = numeroONulo(g.monto_estimado);
      const proximo = g.proximo_vencimiento && esFecha(g.proximo_vencimiento) ? g.proximo_vencimiento : null;
      await guardarFila(
        'gastos_recurrentes',
        {
          categoria_id: g.categoria_id,
          concepto,
          monto_estimado: monto === null ? null : Math.round(monto * 100) / 100,
          frecuencia: g.frecuencia ?? 'mensual',
          dia_pago: dia,
          proximo_vencimiento: proximo ?? (g.id ? null : primerVencimiento(fechaLocal(ctx.ahora()), dia)),
          activo: g.activo !== false,
          notas: limpio(g.notas),
        },
        g.id,
        'admin',
      );
    },

    async getGastosPorVencer() {
      return (await ctx.filas(sb.from('v_gastos_por_vencer').select(COLUMNAS_GASTO_POR_VENCER))).map(aGastoPorVencer);
    },

    async getResultados(meses) {
      const fs = await ctx.filas(
        sb.from('v_resultado_mensual').select(COLUMNAS_RESULTADO_MENSUAL).order('mes', { ascending: false }),
      );
      return completarMeses(fs, ctx.ahora(), meses);
    },

    // ------------------------------- catálogo -------------------------------
    async guardarServicio(s) {
      const nombre = (s.nombre ?? '').trim();
      const slug = slugLimpio(s.slug || nombre);
      if (!slug || !nombre || !s.categoria_id) throw new ErrorOpalo(MSG_SUPABASE.datoFaltante);
      await guardarFila(
        'servicios',
        {
          categoria_id: s.categoria_id,
          slug,
          nombre,
          descripcion: limpio(s.descripcion),
          zonas_incluye: limpio(s.zonas_incluye),
          duracion_min: numeroONulo(s.duracion_min),
          duracion_primera_vez_min: numeroONulo(s.duracion_primera_vez_min),
          precio: numeroONulo(s.precio),
          etapa: s.etapa ?? 'disponible',
          es_complemento: !!s.es_complemento,
          reservable_en_linea: s.reservable_en_linea !== false,
          vendible_en_linea: s.vendible_en_linea !== false,
          tipo_consentimiento: s.tipo_consentimiento ?? null,
          activo: s.activo !== false,
          orden: Number(s.orden) || 0,
        },
        s.id,
        'admin',
      );
    },

    async guardarPaquete(p) {
      // Paquete y paquete_servicios en una sola transacción (ESPEC §6: guardar_paquete; p_id null = nuevo).
      // La base arma el slug (vacío = del nombre), valida, junta servicios repetidos y responde con los
      // mismos textos que la demo; aquí no se valida para no dar otro mensaje.
      await ctx.rpc('guardar_paquete', {
        p_id: p.id || null,
        p_datos: {
          slug: limpio(p.slug),
          nombre: (p.nombre ?? '').trim(),
          descripcion: limpio(p.descripcion),
          tipo: p.tipo ?? 'combo',
          precio: numeroONulo(p.precio),
          duracion_min: numeroONulo(p.duracion_min),
          vigencia_dias: numeroONulo(p.vigencia_dias) || null,
          activo: p.activo !== false,
          orden: Number(p.orden) || 0,
        },
        p_items: ((p.items ?? []) as PaqueteItem[]).map((it) => ({ servicio_id: it.servicio_id || null, cantidad: it.cantidad ?? null })),
      });
    },

    // ------------------------------- equipo -------------------------------
    async getPersonal() {
      const [personas, horarios, caps] = await Promise.all([
        ctx.filas(sb.from('personal').select(COLUMNAS_PERSONAL).order('orden').order('nombre')),
        ctx.filas(sb.from('horarios').select('id, personal_id, dia_semana, hora_inicio, hora_fin').order('dia_semana').order('hora_inicio')),
        ctx.filas(
          sb.from('capacitaciones').select(COLUMNAS_CAPACITACION).order('fecha', { ascending: false, nullsFirst: false }).order('nombre'),
        ),
      ]);
      const horariosPor = agrupar(horarios, 'personal_id', aHorario);
      const capsPor = agrupar(caps, 'personal_id', (f) => ({
        ...aCapacitacion(f),
        mostrar_en_sitio: f.mostrar_en_sitio === undefined ? true : bool(f.mostrar_en_sitio),
        constancia_url: textoONulo(f.constancia_url),
        notas: textoONulo(f.notas),
      }));
      return personas
        .map((p) => ({
          id: texto(p.id),
          usuario_id: textoONulo(p.usuario_id),
          slug: texto(p.slug),
          nombre: texto(p.nombre),
          titulo: textoONulo(p.titulo),
          bio: textoONulo(p.bio),
          foto_url: textoONulo(p.foto_url),
          color_agenda: texto(p.color_agenda, '#5C6B3F'),
          activo: p.activo === undefined ? true : bool(p.activo),
          mostrar_en_sitio: p.mostrar_en_sitio === undefined ? true : bool(p.mostrar_en_sitio),
          orden: num(p.orden),
          horarios: (horariosPor.get(texto(p.id)) ?? []).sort(
            (a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio),
          ),
          capacitaciones: capsPor.get(texto(p.id)) ?? [],
        }))
        .sort((a, b) => a.orden - b.orden || porNombre(a, b));
    },

    async guardarPersonal(p) {
      const nombre = (p.nombre ?? '').trim();
      const slug = slugLimpio(p.slug || nombre);
      if (!slug || !nombre) throw new ErrorOpalo(MSG_SUPABASE.datoFaltante);
      await guardarFila(
        'personal',
        {
          slug,
          nombre,
          titulo: limpio(p.titulo),
          bio: limpio(p.bio),
          foto_url: limpio(p.foto_url),
          color_agenda: limpio(p.color_agenda) ?? '#5C6B3F',
          activo: p.activo !== false,
          mostrar_en_sitio: p.mostrar_en_sitio !== false,
          orden: Number(p.orden) || 0,
        },
        p.id,
        'admin',
      );
    },

    async guardarHorarios(personal_id, horarios) {
      // Reemplaza todos los rangos en una sola transacción (ESPEC §6). La base valida día, horas,
      // salida después de la entrada y que no se encimen, con los mismos textos que la demo.
      const p_horarios = (horarios ?? []).map((h) => ({
        dia_semana: h.dia_semana,
        hora_inicio: typeof h.hora_inicio === 'string' ? h.hora_inicio.slice(0, 5) : null,
        hora_fin: typeof h.hora_fin === 'string' ? h.hora_fin.slice(0, 5) : null,
      }));
      await ctx.rpc('guardar_horarios', { p_personal_id: personal_id, p_horarios });
    },

    async guardarCapacitacion(c) {
      const nombre = (c.nombre ?? '').trim();
      if (!nombre || !c.personal_id) throw new ErrorOpalo(MSG_SUPABASE.datoFaltante);
      const horas = numONulo(c.horas);
      await guardarFila(
        'capacitaciones',
        {
          personal_id: c.personal_id,
          nombre,
          institucion: limpio(c.institucion),
          tipo: c.tipo ?? 'curso',
          fecha: c.fecha && esFecha(c.fecha) ? fechaONula(c.fecha) : null,
          horas: horas === null ? null : Math.max(0, horas),
          constancia_url: limpio(c.constancia_url),
          mostrar_en_sitio: c.mostrar_en_sitio !== false,
          notas: limpio(c.notas),
        },
        c.id,
        'admin',
      );
    },

    async eliminarCapacitacion(id) {
      await eliminarFila('capacitaciones', id, 'admin');
    },

    // ------------------------------- políticas -------------------------------
    async getPoliticasTodas() {
      const fs = await ctx.filas(sb.from('politicas').select(`${COLUMNAS_POLITICA}, activa`));
      return fs.map((f) => ({ ...aPolitica(f), activa: bool(f.activa) })).sort(compararPoliticas);
    },

    async publicarPolitica(tipo, titulo, contenido_md) {
      await ctx.rpc('publicar_politica', { p_tipo: tipo, p_titulo: (titulo ?? '').trim(), p_contenido_md: contenido_md ?? '' });
    },
  };
}
