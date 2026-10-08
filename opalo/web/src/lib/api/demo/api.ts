// OpaloApi del modo demostración: la "base" vive en memoria y se guarda en localStorage.
import { fechaLocal } from '../../format';
import {
  ErrorOpalo,
  type Contraindicacion,
  type GastoRecurrente,
  type OpaloApi,
  type Proveedor,
  type Sesion,
} from '../tipos';
import type { Db, EstadoGuardado, FuentesDemo, GastoFila, ProveedorFila } from './modelo';
import { type Ctx, esAdmin, esPersonal, exigirAdmin, exigirPersonal, miCliente, MSG_EXTRA } from './permisos';
import * as R from './reglas';
import { sembrar } from './sembrado';
import * as T from './taller';
import { clonar, emailValido, ms, normalizar, rangoFechas, rangoInstantes, sha256 } from './utilidades';
import * as V from './vistas';

export const CLAVE_DEMO = 'opalo-demo-v1';

/**
 * Versión de la forma de las filas guardadas. Entra en la huella: si cambia (p. ej. columnas nuevas en
 * consentimientos), lo guardado en el navegador se descarta y se vuelve a sembrar.
 * 3: firma en cabina (§9), ficha de productos, taller (fórmulas y lotes), mostrador y entregas (§10).
 */
export const ESQUEMA_DEMO = 3;

export type AlmacenDemo = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface OpcionesDemo {
  /** Espera simulada por llamada (ms). Por defecto ≈100 ms; 0 en pruebas. */
  latenciaMs?: number;
  /** Reloj (inyectable en pruebas). Por defecto, la hora real del sistema. */
  ahora?: () => Date;
  /** Dónde guardar el estado. Por defecto localStorage; null = sólo memoria. */
  almacenamiento?: AlmacenDemo | null;
  /** Clave de almacenamiento (por defecto 'opalo-demo-v1'). */
  clave?: string;
  /** false: sin datos de ejemplo (sólo catálogo, políticas y cuentas demo). */
  datosEjemplo?: boolean;
}

/** localStorage si existe y se puede usar; si no, null. */
export function almacenPorDefecto(): AlmacenDemo | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const prueba = '__opalo_demo__';
    window.localStorage.setItem(prueba, '1');
    window.localStorage.removeItem(prueba);
    return window.localStorage;
  } catch {
    return null;
  }
}

function sinCampos<T extends object, K extends keyof T>(fila: T, ...campos: K[]): Omit<T, K> {
  const copia = { ...fila };
  for (const c of campos) delete copia[c];
  return copia;
}

const proveedorVista = (p: ProveedorFila): Proveedor => sinCampos(p, 'creado_en');
const gastoVista = (g: GastoFila) => sinCampos(g, 'registrado_por', 'creado_en');

export function crearApiDemoCon(fuentes: FuentesDemo, opciones: OpcionesDemo = {}): OpaloApi {
  const clave = opciones.clave ?? CLAVE_DEMO;
  const latencia = opciones.latenciaMs ?? 100;
  const reloj = opciones.ahora ?? (() => new Date());
  const almacen = opciones.almacenamiento === undefined ? almacenPorDefecto() : opciones.almacenamiento;
  const userAgent = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : null;
  const oyentes = new Set<(s: Sesion | null) => void>();
  let estado: EstadoGuardado | null = null;
  let huella: string | null = null;

  const huellaFuentes = () =>
    (huella ??= sha256(JSON.stringify({ fuentes, ejemplos: opciones.datosEjemplo !== false, esquema: ESQUEMA_DEMO })));

  function persistir(): void {
    if (!almacen || !estado) return;
    try {
      almacen.setItem(clave, JSON.stringify(estado));
    } catch {
      // Sin espacio o sin permiso: la demo sigue en memoria.
    }
  }

  function cargar(): EstadoGuardado {
    if (estado) return estado;
    let guardado: EstadoGuardado | null = null;
    try {
      const texto = almacen?.getItem(clave);
      if (texto) {
        const x = JSON.parse(texto) as EstadoGuardado;
        if (x && x.v === 1 && x.huella === huellaFuentes() && x.db && Array.isArray(x.db.citas)) guardado = x;
      }
    } catch {
      guardado = null;
    }
    if (guardado) {
      estado = guardado;
    } else {
      estado = { v: 1, huella: huellaFuentes(), db: sembrar(fuentes, reloj(), { ejemplos: opciones.datosEjemplo !== false }), sesion: null };
      persistir();
    }
    return estado;
  }

  const esperar = () => (latencia > 0 ? new Promise<void>((r) => setTimeout(r, latencia)) : Promise.resolve());
  const ctxCon = (db: Db): Ctx => ({ db, ahora: reloj(), usuarioId: cargar().sesion, userAgent });

  /** Lectura: se ejecuta sobre la base y se devuelve una copia. */
  async function leer<T>(fn: (ctx: Ctx) => T): Promise<T> {
    await esperar();
    return clonar(fn(ctxCon(cargar().db)));
  }

  /** Escritura "transaccional": trabaja sobre una copia y sólo la guarda si no hubo error. */
  async function escribir<T>(fn: (ctx: Ctx) => T): Promise<T> {
    await esperar();
    const actual = cargar();
    const db = clonar(actual.db);
    const r = fn(ctxCon(db));
    estado = { ...actual, db };
    persistir();
    return clonar(r);
  }

  const sesionActual = () => V.sesionDe(cargar().db, cargar().sesion);

  function notificar(): void {
    const s = sesionActual();
    for (const cb of [...oyentes]) {
      try {
        cb(clonar(s));
      } catch {
        // Un suscriptor con error no afecta a los demás.
      }
    }
  }

  function cambiarSesion(usuarioId: string | null): void {
    estado = { ...cargar(), sesion: usuarioId };
    persistir();
    notificar();
  }

  const hoy = (ctx: Ctx) => fechaLocal(ctx.ahora);

  const api: OpaloApi = {
    modo: 'demo',

    // ---------------- Público ----------------
    getConfiguracion: () => leer(({ db }) => db.configuracion),
    getCatalogo: (op) => leer((ctx) => V.catalogoVista(ctx.db, !!op?.incluirInactivos && esPersonal(ctx))),
    getEquipo: () => leer(({ db }) => V.equipoPublico(db)),
    getPoliticasVigentes: () => leer(({ db }) => V.politicasVigentes(db)),
    getContraindicaciones: () =>
      leer(({ db }) =>
        db.contraindicaciones
          .filter((c) => c.activa)
          .sort((a, b) => a.orden - b.orden)
          .map((c): Contraindicacion => sinCampos(c, 'activa')),
      ),
    getProductosTienda: () => leer(({ db }) => V.productosTienda(db)),
    getHorariosDisponibles: (fecha, duracion_min, personal_id) =>
      leer((ctx) => R.horariosDisponibles(ctx, fecha, duracion_min, personal_id ?? null)),
    getDuracionReserva: (items) => leer(({ db }) => R.duracionReserva(db, items)),

    // ---------------- Sesión ----------------
    getSesion: async () => clonar(sesionActual()),
    onCambioSesion(cb) {
      oyentes.add(cb);
      return () => {
        oyentes.delete(cb);
      };
    },
    async iniciarSesion(email, password) {
      await esperar();
      const correo = (email ?? '').trim().toLowerCase();
      const u = cargar().db.usuarios.find((x) => x.email === correo);
      if (!u || u.password !== password) throw new ErrorOpalo(MSG_EXTRA.credenciales, 'credenciales');
      cambiarSesion(u.id);
      return clonar(sesionActual()!);
    },
    async registrarse(datos) {
      const u = await escribir((ctx) => R.crearUsuario(ctx, { ...datos, rol: 'cliente' }));
      cambiarSesion(u.id);
      return clonar(sesionActual());
    },
    async cerrarSesion() {
      await esperar();
      cambiarSesion(null);
    },
    async recuperarPassword(email) {
      await esperar();
      // En la demo no se envían correos; basta con validar el formato.
      if (!emailValido((email ?? '').trim().toLowerCase())) throw new ErrorOpalo(MSG_EXTRA.correoInvalido);
    },

    // ---------------- Clienta ----------------
    async actualizarMisDatos(datos) {
      const c = await escribir((ctx) => V.clientePublico(R.actualizarMisDatos(ctx, datos)));
      notificar();
      return c;
    },
    getMiFicha: () => leer((ctx) => V.fichaVista(V.fichaVigenteFila(ctx.db, miCliente(ctx).id))),
    guardarFicha: (ficha) => escribir((ctx) => void R.guardarFicha(ctx, ficha)),
    getMisAceptaciones: () =>
      leer((ctx) => {
        const c = miCliente(ctx);
        return ctx.db.aceptaciones_politica.filter((a) => a.cliente_id === c.id).map((a) => a.politica_id);
      }),
    aceptarPoliticas: (ids) => escribir((ctx) => R.aceptarPoliticas(ctx, ids)),
    reservarCita: (s) => escribir((ctx) => R.reservarCita(ctx, s)),
    getMisCitas: () =>
      leer((ctx) => {
        const c = miCliente(ctx);
        return V.citasDetalle(ctx.db, (x) => x.cliente_id === c.id, 'desc');
      }),
    cancelarCita: (id, motivo) => escribir((ctx) => R.cancelarCita(ctx, id, motivo)),
    firmarConsentimientoCita: (id, firma) => escribir((ctx) => R.firmarConsentimientoCita(ctx, id, firma)),
    crearPedido: (items, metodo, notas) => escribir((ctx) => R.crearPedido(ctx, items, metodo, notas)),
    cancelarPedido: (id) => escribir((ctx) => R.cancelarPedido(ctx, id)),
    getMisPedidos: () =>
      leer((ctx) => {
        const c = miCliente(ctx);
        return V.pedidosDetalle(ctx.db, (p) => p.cliente_id === c.id);
      }),
    getMisCreditos: () => leer((ctx) => V.creditosDe(ctx.db, miCliente(ctx).id, hoy(ctx))),
    canjearRegalo: (codigo) => escribir((ctx) => void R.canjearRegalo(ctx, codigo)),
    getMisConsentimientos: () => leer((ctx) => V.consentimientosDe(ctx.db, miCliente(ctx).id)),

    // ---------------- Personal y admin ----------------
    admin: {
      getResumenHoy: () =>
        leer((ctx) => {
          exigirPersonal(ctx);
          const { db } = ctx;
          const dia = hoy(ctx);
          const [d, h] = rangoInstantes(dia, dia);
          const admin = esAdmin(ctx);
          const conProductos = new Set(db.pedido_items.filter((i) => i.tipo === 'producto').map((i) => i.pedido_id));
          return {
            citas_hoy: V.citasDetalle(db, (c) => c.estado !== 'cancelada' && ms(c.inicio) >= d && ms(c.inicio) < h),
            por_revisar: db.citas.filter((c) => c.estado === 'pendiente' && ms(c.fin) >= ctx.ahora.getTime()).length,
            reposicion: V.reposicion(db),
            gastos_por_vencer: admin ? V.gastosPorVencer(db, dia).filter((g) => g.estado !== 'al_corriente') : [],
            mes_actual: admin ? V.resultadosMensuales(db, ctx.ahora, 1)[0] : null,
            pedidos_pendientes: db.pedidos.filter((p) => p.estado === 'pendiente_pago').length,
            // Pagados con productos que falta entregar en el spa (ESPEC §10.3).
            pedidos_por_entregar: db.pedidos.filter((p) => p.estado === 'pagado' && p.entregado_en === null && conProductos.has(p.id)).length,
            // Lotes en curado que ya cumplieron su fecha: listos para liberar (ESPEC §10.2).
            lotes_listos: V.lotesListos(db, dia),
          };
        }),

      // agenda
      getAgenda: (desde, hasta) =>
        leer((ctx) => {
          exigirPersonal(ctx);
          const [d, h] = rangoInstantes(desde, hasta);
          return V.citasDetalle(ctx.db, (c) => ms(c.inicio) >= d && ms(c.inicio) < h);
        }),
      reservarParaCliente: (s) => escribir((ctx) => R.reservarCitaStaff(ctx, s)),
      cambiarEstadoCita: (id, estado) => escribir((ctx) => R.cambiarEstadoCita(ctx, id, estado)),
      completarCita: (id) => escribir((ctx) => R.completarCita(ctx, id)),
      getBloqueos: (desde, hasta) =>
        leer((ctx) => {
          exigirPersonal(ctx);
          const [d, h] = rangoInstantes(desde, hasta);
          return ctx.db.bloqueos_agenda
            .filter((b) => ms(b.inicio) < h && ms(b.fin) > d)
            .sort((a, b) => (a.inicio < b.inicio ? -1 : 1))
            .map((b) => sinCampos(b, 'creado_en'));
        }),
      guardarBloqueo: (b) => escribir((ctx) => R.guardarBloqueo(ctx, b)),
      eliminarBloqueo: (id) => escribir((ctx) => R.eliminarBloqueo(ctx, id)),

      // clientas
      getClientes: (busqueda) =>
        leer((ctx) => {
          exigirPersonal(ctx);
          const q = normalizar(busqueda);
          const qDigitos = (busqueda ?? '').replace(/\D/g, '');
          return ctx.db.clientes
            .filter((c) => {
              if (!q) return true;
              const texto = normalizar([c.nombre, c.apellidos, c.email, c.telefono].filter(Boolean).join(' '));
              return texto.includes(q) || (qDigitos.length >= 3 && (c.telefono ?? '').replace(/\D/g, '').includes(qDigitos));
            })
            .map((c) => V.clienteResumen(ctx.db, c, ctx.ahora))
            .sort((a, b) => V.nombreCompleto(a).localeCompare(V.nombreCompleto(b), 'es'));
        }),
      getExpediente: (cliente_id) =>
        leer((ctx) => {
          exigirPersonal(ctx);
          const { db } = ctx;
          const c = db.clientes.find((x) => x.id === cliente_id);
          if (!c) throw new ErrorOpalo(MSG_EXTRA.clienteNoExiste);
          return {
            cliente: { ...V.clienteResumen(db, c, ctx.ahora), notas_internas: c.notas_internas },
            ficha: V.fichaVista(V.fichaVigenteFila(db, c.id)),
            citas: V.citasDetalle(db, (x) => x.cliente_id === c.id, 'desc'),
            pedidos: V.pedidosDetalle(db, (p) => p.cliente_id === c.id),
            creditos: V.creditosDe(db, c.id, hoy(ctx)),
            consentimientos: V.consentimientosDe(db, c.id),
          };
        }),
      crearCliente: (c) => escribir((ctx) => R.crearCliente(ctx, c)),
      guardarNotasCliente: (id, notas) => escribir((ctx) => R.guardarNotasCliente(ctx, id, notas)),

      // pedidos y pagos
      getPedidos: (estado) =>
        leer((ctx) => {
          exigirPersonal(ctx);
          return V.pedidosDetalle(ctx.db, (p) => !estado || p.estado === estado);
        }),
      registrarPago: (p) => escribir((ctx) => void R.registrarPago(ctx, p)),
      cancelarPedido: (id) =>
        escribir((ctx) => {
          exigirPersonal(ctx);
          R.cancelarPedido(ctx, id);
        }),

      // inventario
      getProductos: () =>
        leer((ctx) => {
          exigirPersonal(ctx);
          return [...ctx.db.productos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(V.productoVista);
        }),
      guardarProducto: (p) => escribir((ctx) => V.productoVista(R.guardarProducto(ctx, p))),
      getReposicion: () =>
        leer((ctx) => {
          exigirPersonal(ctx);
          return V.reposicion(ctx.db);
        }),
      registrarCompra: (c) => escribir((ctx) => void R.registrarCompra(ctx, c)),
      ajustarInventario: (id, cantidad, tipo, nota) => escribir((ctx) => R.ajustarInventario(ctx, id, cantidad, tipo, nota)),
      getMovimientos: (producto_id, limite) =>
        leer((ctx) => {
          exigirPersonal(ctx);
          const { db } = ctx;
          const nombres = new Map(db.productos.map((p) => [p.id, p.nombre]));
          return db.movimientos_inventario
            .filter((m) => !producto_id || m.producto_id === producto_id)
            .sort((a, b) => (a.creado_en < b.creado_en ? 1 : a.creado_en > b.creado_en ? -1 : 0))
            .slice(0, limite && limite > 0 ? limite : 100)
            .map((m) => ({
              id: m.id,
              producto_id: m.producto_id,
              producto_nombre: nombres.get(m.producto_id) ?? '',
              tipo: m.tipo,
              cantidad: m.cantidad,
              costo_unitario: m.costo_unitario,
              nota: m.nota,
              creado_en: m.creado_en,
            }));
        }),
      getProveedores: () =>
        leer((ctx) => {
          exigirPersonal(ctx);
          return [...ctx.db.proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(proveedorVista);
        }),
      guardarProveedor: (p) => escribir((ctx) => proveedorVista(R.guardarProveedor(ctx, p))),

      // costos
      getReceta: (servicio_id) =>
        leer((ctx) => {
          exigirPersonal(ctx);
          return ctx.db.recetas_servicio
            .filter((r) => r.servicio_id === servicio_id)
            .map((r) => ({ producto_id: r.producto_id, cantidad: r.cantidad, notas: r.notas }));
        }),
      guardarReceta: (servicio_id, items) => escribir((ctx) => R.guardarReceta(ctx, servicio_id, items)),
      getCostosServicios: () =>
        leer((ctx) => {
          exigirPersonal(ctx);
          return V.costosServicios(ctx.db);
        }),

      // gastos y resultados
      getCategoriasGasto: () =>
        leer((ctx) => {
          exigirAdmin(ctx);
          return [...ctx.db.categorias_gasto].sort((a, b) => Number(b.es_fijo) - Number(a.es_fijo) || a.nombre.localeCompare(b.nombre, 'es'));
        }),
      getGastos: (desde, hasta) =>
        leer((ctx) => {
          exigirAdmin(ctx);
          const [d, h] = rangoFechas(desde, hasta);
          return ctx.db.gastos
            .filter((g) => g.fecha >= d && g.fecha <= h)
            .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.creado_en.localeCompare(a.creado_en)))
            .map(gastoVista);
        }),
      guardarGasto: (g) => escribir((ctx) => R.guardarGasto(ctx, g)),
      eliminarGasto: (id) => escribir((ctx) => R.eliminarGasto(ctx, id)),
      getGastosRecurrentes: () =>
        leer((ctx): GastoRecurrente[] => {
          exigirAdmin(ctx);
          return [...ctx.db.gastos_recurrentes].sort(
            (a, b) => (a.proximo_vencimiento ?? '9999').localeCompare(b.proximo_vencimiento ?? '9999') || a.concepto.localeCompare(b.concepto, 'es'),
          );
        }),
      guardarGastoRecurrente: (g) => escribir((ctx) => R.guardarGastoRecurrente(ctx, g)),
      getGastosPorVencer: () =>
        leer((ctx) => {
          exigirAdmin(ctx);
          return V.gastosPorVencer(ctx.db, hoy(ctx));
        }),
      getResultados: (meses) =>
        leer((ctx) => {
          exigirAdmin(ctx);
          return V.resultadosMensuales(ctx.db, ctx.ahora, meses);
        }),

      // catálogo
      guardarServicio: (s) => escribir((ctx) => R.guardarServicio(ctx, s)),
      guardarPaquete: (p) => escribir((ctx) => R.guardarPaquete(ctx, p)),

      // equipo
      getPersonal: () =>
        leer((ctx) => {
          exigirPersonal(ctx);
          return V.personalInterno(ctx.db);
        }),
      guardarPersonal: (p) => escribir((ctx) => R.guardarPersonal(ctx, p)),
      guardarHorarios: (id, horarios) => escribir((ctx) => R.guardarHorarios(ctx, id, horarios)),
      guardarCapacitacion: (c) => escribir((ctx) => R.guardarCapacitacion(ctx, c)),
      eliminarCapacitacion: (id) => escribir((ctx) => R.eliminarCapacitacion(ctx, id)),

      // políticas
      getPoliticasTodas: () =>
        leer((ctx) => {
          exigirPersonal(ctx);
          return V.politicasTodas(ctx.db);
        }),
      publicarPolitica: (tipo, titulo, contenido) => escribir((ctx) => void R.publicarPolitica(ctx, tipo, titulo, contenido)),

      // taller: fórmulas y lotes (ESPEC §10.2)
      getFormulas: () =>
        leer((ctx) => {
          exigirPersonal(ctx);
          return V.formulasVista(ctx.db);
        }),
      guardarFormula: (f) => escribir((ctx) => T.guardarFormula(ctx, f)),
      getCostosFormulas: () =>
        leer((ctx) => {
          exigirPersonal(ctx);
          return V.costosFormulas(ctx.db);
        }),
      getLotes: (estado) =>
        leer((ctx) => {
          exigirPersonal(ctx);
          return V.lotesVista(ctx.db, hoy(ctx), (l) => !estado || l.estado === estado);
        }),
      registrarLote: (l) => escribir((ctx) => T.registrarLote(ctx, l)),
      liberarLote: (id, piezas, forzar) => escribir((ctx) => T.liberarLote(ctx, id, piezas, forzar)),
      descartarLote: (id, motivo) => escribir((ctx) => T.descartarLote(ctx, id, motivo)),
      getMargenesProductos: () =>
        leer((ctx) => {
          exigirPersonal(ctx);
          return V.margenesProductos(ctx.db, ctx.ahora);
        }),

      // mostrador y entregas (ESPEC §10.3)
      ventaMostrador: (v) => escribir((ctx) => R.ventaMostrador(ctx, v)),
      marcarEntregado: (id) => escribir((ctx) => R.marcarEntregado(ctx, id)),
    },
  };

  return api;
}
