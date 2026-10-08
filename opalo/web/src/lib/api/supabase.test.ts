// Pruebas del adaptador de Supabase con un cliente simulado (sin red ni base real).
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isoDesdeLocal } from '../format';
import { crearApiSupabaseCon } from './supabase';
import { coincideBusqueda, filtroBusquedaClientes, primerVencimiento, slugLimpio } from './supabase/admin';
import {
  aCitaDetalle,
  aCostoFormula,
  aCredito,
  aFichaSalud,
  aLote,
  aPedidoDetalle,
  aProducto,
  aProductoTienda,
  completarMeses,
  ordenarTienda,
  rangoInstantes,
} from './supabase/conversion';
import { aErrorOpalo } from './supabase/errores';
import { ErrorOpalo, type OpaloApi } from './tipos';

// ---------------------------------------------------------------------------
// Cliente simulado
// ---------------------------------------------------------------------------

interface Llamada {
  tabla?: string;
  rpc?: string;
  args?: Record<string, unknown>;
  ops: [string, unknown[]][];
}

interface Respuesta {
  data?: unknown;
  error?: unknown;
  count?: number | null;
  status?: number;
}

type Responder = (l: Llamada) => Respuesta | Promise<Respuesta> | undefined;

interface SesionFalsa {
  user: { id: string; email?: string };
  access_token: string;
}

function crearFalso(responder: Responder = () => undefined) {
  const llamadas: Llamada[] = [];
  const oyentes: ((evento: string, s: SesionFalsa | null) => void)[] = [];
  const estado: { sesion: SesionFalsa | null } = { sesion: null };
  const desuscribir = vi.fn();

  function consulta(base: Omit<Llamada, 'ops'>): unknown {
    const l: Llamada = { ...base, ops: [] };
    llamadas.push(l);
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then')
            return (ok: (r: unknown) => unknown, mal: (e: unknown) => unknown) =>
              Promise.resolve()
                .then(() => responder(l))
                .then((r) => ({ data: [], error: null, count: null, status: 200, ...(r ?? {}) }))
                .then(ok, mal);
          return (...args: unknown[]) => {
            l.ops.push([String(prop), args]);
            return proxy;
          };
        },
      },
    );
    return proxy;
  }

  const auth = {
    getSession: vi.fn(async () => ({ data: { session: estado.sesion }, error: null })),
    onAuthStateChange: vi.fn((cb: (evento: string, s: SesionFalsa | null) => void) => {
      oyentes.push(cb);
      return { data: { subscription: { unsubscribe: desuscribir } } };
    }),
    signInWithPassword: vi.fn(async (_c: { email: string; password: string }): Promise<{ data: { session: SesionFalsa | null; user: unknown }; error: unknown }> => ({
      data: { session: null, user: null },
      error: null,
    })),
    signUp: vi.fn(async (_c: unknown): Promise<{ data: { session: SesionFalsa | null; user: unknown }; error: unknown }> => ({
      data: { session: null, user: { id: 'u-nueva', identities: [{ id: 'i1' }] } },
      error: null,
    })),
    signOut: vi.fn(async (_o?: unknown) => ({ error: null })),
    resetPasswordForEmail: vi.fn(async (_e: string, _o?: unknown) => ({ data: {}, error: null })),
  };

  const sb = {
    from: (tabla: string) => consulta({ tabla }),
    rpc: (rpc: string, args?: Record<string, unknown>) => consulta({ rpc, args }),
    auth,
  } as unknown as SupabaseClient;

  return { sb, llamadas, oyentes, estado, auth, desuscribir };
}

/** Argumentos de la operación `op` (p. ej. 'eq') de una llamada. */
function ops(l: Llamada | undefined, op: string): unknown[][] {
  return (l?.ops ?? []).filter(([n]) => n === op).map(([, a]) => a);
}

const UID = '11111111-1111-4111-8111-111111111111';
const CLIENTE_ID = '22222222-2222-4222-8222-222222222222';
const SESION: SesionFalsa = { user: { id: UID, email: 'mariana@correo.mx' }, access_token: 'tkn' };

const FILA_CLIENTA = {
  id: CLIENTE_ID,
  nombre: 'Mariana',
  apellidos: 'López',
  telefono: '4421234567',
  email: 'mariana@correo.mx',
  fecha_nacimiento: '1995-04-12',
  acepta_promociones: false,
};

/** Campos de la ficha pública de un producto (ESPEC §10.1) vacíos, para insumos de cabina. */
const FICHA_VACIA = {
  slug: null,
  descripcion: null,
  aroma: null,
  ingredientes: null,
  modo_uso: null,
  advertencias: null,
  contenido_neto: null,
  foto_url: null,
  color_hex: null,
  destacado: false,
  hecho_en_opalo: false,
  orden: 0,
};

const M = {
  sesion: 'Inicia sesión para continuar.',
  ocupado: 'Ese horario se acaba de ocupar, elige otro.',
  permiso: 'No tienes permiso para hacer esto.',
  tarde: 'Faltan menos de 24 horas para tu cita. Escríbenos por WhatsApp al 442 170 1466.',
  red: 'No pudimos conectar. Revisa tu internet e intenta de nuevo.',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

describe('aErrorOpalo', () => {
  it('deja pasar tal cual los mensajes de negocio (P0001)', () => {
    const e = aErrorOpalo({ code: 'P0001', message: M.tarde, details: null, hint: null });
    expect(e).toBeInstanceOf(ErrorOpalo);
    expect(e.message).toBe(M.tarde);
    expect(e.codigo).toBe('P0001');
    expect(aErrorOpalo({ code: 'P0001', message: 'Atendemos a partir de los 15 años.' }).message).toBe(
      'Atendemos a partir de los 15 años.',
    );
  });

  it('traduce el traslape de citas (23P01)', () => {
    const e = aErrorOpalo({ code: '23P01', message: 'conflicting key value violates exclusion constraint "citas_sin_traslape_personal"' });
    expect(e.message).toBe(M.ocupado);
  });

  it('traduce permisos y RLS', () => {
    expect(aErrorOpalo({ code: '42501', message: 'permission denied for table gastos' }).message).toBe(M.permiso);
    expect(aErrorOpalo({ code: '', message: 'new row violates row-level security policy for table "servicios"' }).message).toBe(M.permiso);
  });

  it('traduce errores comunes de Supabase Auth', () => {
    const auth = (code: string | undefined, message: string, name = 'AuthApiError', status = 400) => ({ __isAuthError: true, name, code, message, status });
    expect(aErrorOpalo(auth('invalid_credentials', 'Invalid login credentials')).message).toBe('Correo o contraseña incorrectos.');
    expect(aErrorOpalo(auth(undefined, 'Invalid login credentials')).message).toBe('Correo o contraseña incorrectos.');
    expect(aErrorOpalo(auth('user_already_exists', 'User already registered', 'AuthApiError', 422)).message).toBe(
      'Ya existe una cuenta con ese correo.',
    );
    expect(aErrorOpalo(auth('email_exists', 'Email address already exists')).message).toBe('Ya existe una cuenta con ese correo.');
    expect(aErrorOpalo(auth('email_not_confirmed', 'Email not confirmed')).message).toBe(
      'Confirma tu correo con el enlace que te enviamos y vuelve a entrar.',
    );
    expect(aErrorOpalo(auth('weak_password', 'Password should be at least 8 characters.', 'AuthWeakPasswordError', 422)).message).toBe(
      'La contraseña debe tener al menos 8 caracteres.',
    );
  });

  it('reconoce los problemas de conexión', () => {
    expect(aErrorOpalo(new TypeError('Failed to fetch')).message).toBe(M.red);
    expect(aErrorOpalo({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }).message).toBe(M.red);
    expect(aErrorOpalo({ message: 'TypeError: Load failed', code: '' }).message).toBe(M.red);
    expect(aErrorOpalo({ __isAuthError: true, name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }).message).toBe(M.red);
    expect(aErrorOpalo({ message: 'algo', code: '' }, 0).message).toBe(M.red);
  });

  it('traduce duplicados y deja un mensaje genérico para lo desconocido', () => {
    expect(
      aErrorOpalo({ code: '23505', message: 'duplicate key value violates unique constraint "clientes_email_unico"' }).message,
    ).toBe('Ya hay una clienta registrada con ese correo.');
    expect(aErrorOpalo({ code: '23505', message: 'duplicate key value violates unique constraint "servicios_slug_key"' }).message).toBe(
      'Ya existe otro registro con ese identificador (slug).',
    );
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(aErrorOpalo({ code: 'XX000', message: 'internal error' }).message).toBe('Algo salió mal. Intenta de nuevo.');
    expect(consola).toHaveBeenCalled();
  });

  it('no envuelve dos veces un ErrorOpalo', () => {
    const e = new ErrorOpalo('Hola', 'x');
    expect(aErrorOpalo(e)).toBe(e);
  });
});

// ---------------------------------------------------------------------------
// Conversión
// ---------------------------------------------------------------------------

describe('conversión de filas', () => {
  it('v_citas_detalle: numeric a number, jsonb a ItemCita, instantes en UTC', () => {
    const c = aCitaDetalle({
      id: 'c1',
      cliente_id: CLIENTE_ID,
      cliente_nombre: 'Mariana López',
      cliente_telefono: null,
      inicio: '2026-11-03T16:00:00+00:00',
      fin: '2026-11-03T17:00:00+00:00',
      duracion_min: 60,
      estado: 'confirmada',
      origen: 'web',
      primera_vez: true,
      requiere_revision: false,
      alertas: [],
      notas_cliente: null,
      total: '450.00',
      personal_id: 'p1',
      personal_nombre: 'Ana',
      personal_titulo: null,
      cabina_nombre: 'Cabina 1',
      consentimientos_firmados: 1,
      pagado: '0',
      items: [
        { nombre: 'Cejas', precio: '120.00', duracion_min: null, servicio_id: 's1', paquete_id: null },
        { nombre: 'Bigote', precio: null, duracion_min: '15', servicio_id: 's2', paquete_id: null },
      ],
    });
    expect(c.total).toBe(450);
    expect(c.pagado).toBe(0);
    expect(c.inicio).toBe('2026-11-03T16:00:00.000Z');
    expect(c.items).toEqual([
      { nombre: 'Cejas', precio: 120, duracion_min: null, servicio_id: 's1', paquete_id: null },
      { nombre: 'Bigote', precio: null, duracion_min: 15, servicio_id: 's2', paquete_id: null },
    ]);
  });

  it('v_pedidos_detalle, v_creditos y productos', () => {
    const p = aPedidoDetalle({
      id: 'pe1',
      folio: 'OP-00001',
      cliente_id: CLIENTE_ID,
      cliente_nombre: 'Mariana',
      estado: 'pendiente_pago',
      total: '240.50',
      pagado: 100,
      metodo_pago_preferido: null,
      notas: null,
      creado_en: '2026-10-07T18:00:00.123456+00:00',
      pagado_en: null,
      items: [{ tipo: 'servicio', descripcion: 'Cejas', cantidad: 2, precio_unitario: '120.25', importe: '240.50', regalo_para: 'Sofía' }],
    });
    expect(p.total).toBe(240.5);
    expect(p.creado_en).toBe('2026-10-07T18:00:00.123Z');
    expect(p.items[0]).toEqual({ tipo: 'servicio', descripcion: 'Cejas', cantidad: 2, precio_unitario: 120.25, importe: 240.5, regalo_para: 'Sofía' });

    const cr = aCredito({ id: 'k', cliente_id: CLIENTE_ID, nombre: 'Axila', servicio_id: 's', paquete_id: null, cantidad: 5, usados: 2, restantes: 3, vence_en: '2027-10-07', vigente: true, codigo_regalo: null, regalo_para: null, creado_en: '2026-10-07T18:00:00Z' });
    expect(cr.restantes).toBe(3);
    expect(cr.vigente).toBe(true);

    const pr = aProducto({ id: 'x', nombre: 'Cera', categoria: 'cera', unidad_medida: 'g', contenido_presentacion: '800.000', costo_presentacion: '400.00', costo_unitario: '0.5000', stock_actual: '120.500', stock_minimo: '200', precio_venta: null });
    expect(pr.costo_unitario).toBe(0.5);
    expect(pr.stock_actual).toBe(120.5);
    expect(pr.precio_venta).toBeNull();
  });

  it('ficha de salud: respuestas a boolean y detalles a texto', () => {
    const f = aFichaSalud({ respuestas: { embarazo: true, diabetes: 'false' }, detalles: { medicamentos: 'Ninguno' }, alergias: null, medicamentos: null, observaciones: null, acepta_datos_sensibles: true, creado_en: '2026-10-07T18:00:00Z' });
    expect(f?.respuestas).toEqual({ embarazo: true, diabetes: false });
    expect(f?.detalles).toEqual({ medicamentos: 'Ninguno' });
    expect(aFichaSalud(null)).toBeNull();
  });

  it('resultados: completa los meses sin actividad, del más antiguo al actual', () => {
    const ahora = new Date(isoDesdeLocal('2026-11-15', '12:00'));
    const r = completarMeses([{ mes: '2026-11-01', ingresos: '1000.00', propinas: 0, costo_insumos: '50', compras: 0, gastos: 200, utilidad: '750', flujo: 800, citas_completadas: 4 }], ahora, 3);
    expect(r.map((x) => x.mes)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
    expect(r[0].ingresos).toBe(0);
    expect(r[2]).toMatchObject({ ingresos: 1000, costo_insumos: 50, utilidad: 750, citas_completadas: 4 });
  });

  it('rangos en hora de Querétaro (UTC−6)', () => {
    expect(rangoInstantes('2026-11-02', '2026-11-02')).toEqual(['2026-11-02T06:00:00.000Z', '2026-11-03T06:00:00.000Z']);
  });

  it('búsqueda de clientas sin acentos, slugs y vencimientos', () => {
    expect(filtroBusquedaClientes('María')).toContain('nombre.ilike.*m_r__*');
    expect(filtroBusquedaClientes('442 170')).toContain('telefono.ilike.*4*4*2*1*7*0*');
    expect(filtroBusquedaClientes(' ')).toBeNull();
    const c = { nombre: 'María', apellidos: 'Peña', email: null, telefono: '442 170 1466' };
    expect(coincideBusqueda(c, 'maria pena')).toBe(true);
    expect(coincideBusqueda(c, '4421701')).toBe(true);
    expect(coincideBusqueda(c, 'mario')).toBe(false);
    expect(slugLimpio('Depilación Bikini Brasileño')).toBe('depilacion-bikini-brasileno');
    expect(primerVencimiento('2026-10-08', 5)).toBe('2026-11-05');
    expect(primerVencimiento('2026-10-08', 31)).toBe('2026-10-31');
    expect(primerVencimiento('2027-02-10', 31)).toBe('2027-02-28');
  });
});

// ---------------------------------------------------------------------------
// API con el cliente simulado
// ---------------------------------------------------------------------------

function apiCon(responder?: Responder, opciones?: { ahora?: () => Date }) {
  const falso = crearFalso(responder);
  const api: OpaloApi = crearApiSupabaseCon(falso.sb, opciones);
  return { api, ...falso };
}

/** Responde perfil y clienta para la sesión. */
function responderSesion(rol: string, extra?: Responder): Responder {
  return (l) => {
    if (l.tabla === 'perfiles') return { data: { rol } };
    if (l.tabla === 'clientes' && ops(l, 'select')[0]?.[0] !== 'id') return { data: FILA_CLIENTA };
    if (l.tabla === 'clientes') return { data: { id: CLIENTE_ID } };
    return extra?.(l);
  };
}

describe('crearApiSupabaseCon · sesión', () => {
  it('getSesion: null sin sesión; con sesión combina rol y clienta', async () => {
    const { api, estado } = apiCon(responderSesion('admin'));
    expect(await api.getSesion()).toBeNull();
    estado.sesion = SESION;
    const s = await api.getSesion();
    expect(s).toEqual({
      user_id: UID,
      email: 'mariana@correo.mx',
      rol: 'admin',
      cliente: { ...FILA_CLIENTA },
    });
  });

  it('getSesion: rol cliente si no hay perfil y cliente null si no hay fila', async () => {
    const { api, estado } = apiCon(() => ({ data: null }));
    estado.sesion = SESION;
    expect(await api.getSesion()).toMatchObject({ rol: 'cliente', cliente: null });
  });

  it('iniciarSesion traduce credenciales inválidas', async () => {
    const { api, auth } = apiCon();
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { __isAuthError: true, name: 'AuthApiError', code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 },
    });
    await expect(api.iniciarSesion('x@y.mx', 'malamala')).rejects.toThrow('Correo o contraseña incorrectos.');
  });

  it('iniciarSesion devuelve la sesión armada', async () => {
    const { api, auth } = apiCon(responderSesion('personal'));
    auth.signInWithPassword.mockResolvedValueOnce({ data: { session: SESION, user: SESION.user }, error: null });
    const s = await api.iniciarSesion('  mariana@correo.mx ', 'secreta123');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'mariana@correo.mx', password: 'secreta123' });
    expect(s.rol).toBe('personal');
    expect(s.cliente?.id).toBe(CLIENTE_ID);
  });

  it('registrarse manda los datos al trigger y devuelve null si hay que confirmar el correo', async () => {
    const { api, auth } = apiCon();
    const r = await api.registrarse({
      email: 'nueva@correo.mx',
      password: 'secreta123',
      nombre: ' Sofía ',
      apellidos: 'Ruiz',
      telefono: '',
      fecha_nacimiento: '2000-01-31',
    });
    expect(r).toBeNull();
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'nueva@correo.mx',
      password: 'secreta123',
      options: {
        data: { nombre: 'Sofía', apellidos: 'Ruiz', telefono: null, fecha_nacimiento: '2000-01-31' },
        emailRedirectTo: window.location.origin,
      },
    });
  });

  it('registrarse: correo ya registrado (usuario sin identidades) y contraseña corta', async () => {
    const { api, auth } = apiCon();
    auth.signUp.mockResolvedValueOnce({ data: { session: null, user: { id: 'u', identities: [] } }, error: null });
    const datos = { email: 'ya@correo.mx', password: 'secreta123', nombre: 'A', apellidos: '', telefono: '', fecha_nacimiento: null };
    await expect(api.registrarse(datos)).rejects.toThrow('Ya existe una cuenta con ese correo.');
    await expect(api.registrarse({ ...datos, password: '123' })).rejects.toThrow('La contraseña debe tener al menos 8 caracteres.');
  });

  it('cerrarSesion borra al menos la sesión local si no hay red', async () => {
    const { api, auth } = apiCon();
    auth.signOut.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await api.cerrarSesion();
    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
  });

  it('onCambioSesion vuelve a leer perfil y clienta fuera del callback y se puede desuscribir', async () => {
    vi.useFakeTimers();
    const { api, oyentes, desuscribir } = apiCon(responderSesion('cliente'));
    const cb = vi.fn();
    const quitar = api.onCambioSesion(cb);
    oyentes[0]('SIGNED_IN', SESION);
    expect(cb).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ user_id: UID, rol: 'cliente' }));
    oyentes[0]('SIGNED_OUT', null);
    await vi.runAllTimersAsync();
    expect(cb).toHaveBeenLastCalledWith(null);
    quitar();
    expect(desuscribir).toHaveBeenCalled();
  });
});

describe('crearApiSupabaseCon · público', () => {
  it('getCatalogo ordena, filtra activos y arma los paquetes con paquete_servicios', async () => {
    const { api, llamadas } = apiCon((l) => {
      if (l.tabla === 'categorias_servicio')
        return { data: [{ id: 'c2', slug: 'faciales', nombre: 'Faciales', descripcion: null, orden: 2 }, { id: 'c1', slug: 'depilacion', nombre: 'Depilación', descripcion: null, orden: 1 }] };
      if (l.tabla === 'servicios')
        return {
          data: [
            { id: 's2', categoria_id: 'c2', slug: 'limpieza', nombre: 'Limpieza', precio: null, etapa: 'disponible', activo: true, orden: 1 },
            { id: 's1', categoria_id: 'c1', slug: 'cejas', nombre: 'Cejas', precio: '120.00', etapa: 'disponible', activo: true, orden: 1 },
          ],
        };
      if (l.tabla === 'paquetes') return { data: [{ id: 'p1', slug: 'combo', nombre: 'Combo', tipo: 'combo', precio: '300', activo: true, orden: 1 }] };
      if (l.tabla === 'paquete_servicios') return { data: [{ paquete_id: 'p1', servicio_id: 's1', cantidad: 2 }] };
      return undefined;
    });
    const cat = await api.getCatalogo();
    expect(cat.categorias.map((c) => c.slug)).toEqual(['depilacion', 'faciales']);
    expect(cat.servicios.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(cat.servicios[0].precio).toBe(120);
    expect(cat.servicios[1].precio).toBeNull();
    expect(cat.paquetes[0]).toMatchObject({ precio: 300, items: [{ servicio_id: 's1', cantidad: 2 }] });
    const servicios = llamadas.find((l) => l.tabla === 'servicios');
    expect(ops(servicios, 'eq')).toContainEqual(['activo', true]);

    llamadas.length = 0;
    await api.getCatalogo({ incluirInactivos: true });
    expect(ops(llamadas.find((l) => l.tabla === 'servicios'), 'eq')).toEqual([]);
  });

  it('getConfiguracion pide sus columnas por nombre y trae fecha_apertura como YYYY-MM-DD o null', async () => {
    const { api, llamadas } = apiCon((l) =>
      l.tabla === 'configuracion'
        ? { data: { nombre_negocio: 'Ópalo', telefono_whatsapp: '4421701466', duracion_sesion_min: 60, fecha_apertura: '2026-10-31' } }
        : undefined,
    );
    const c = await api.getConfiguracion();
    expect(c).toMatchObject({ nombre_negocio: 'Ópalo', duracion_sesion_min: 60, fecha_apertura: '2026-10-31' });
    const [cols] = ops(llamadas[0], 'select')[0] as [string];
    expect(cols).toContain('fecha_apertura');
    expect(cols).not.toContain('*');
    expect(ops(llamadas[0], 'eq')).toEqual([['id', 1]]);

    const sinFecha = apiCon(() => ({ data: { nombre_negocio: 'Ópalo', fecha_apertura: null } }));
    expect((await sinFecha.api.getConfiguracion()).fecha_apertura).toBeNull();
    const sinFila = apiCon(() => ({ data: null }));
    expect((await sinFila.api.getConfiguracion()).fecha_apertura).toBeNull();
  });

  it('getEquipo agrupa capacitaciones_publicas por persona', async () => {
    const { api } = apiCon((l) => {
      if (l.tabla === 'personal_publico') return { data: [{ id: 'a', slug: 'ana', nombre: 'Ana', titulo: null, bio: null, foto_url: null, orden: 1 }] };
      if (l.tabla === 'capacitaciones_publicas')
        return { data: [{ id: 'k1', personal_id: 'a', nombre: 'Cera tibia', institucion: null, tipo: 'curso', fecha: '2026-09-01', horas: '12.5' }] };
      return undefined;
    });
    const eq = await api.getEquipo();
    expect(eq[0].capacitaciones).toEqual([
      { id: 'k1', personal_id: 'a', nombre: 'Cera tibia', institucion: null, tipo: 'curso', fecha: '2026-09-01', horas: 12.5 },
    ]);
  });

  it('getHorariosDisponibles llama la RPC con sus parámetros p_*', async () => {
    const { api, llamadas } = apiCon((l) =>
      l.rpc === 'horarios_disponibles'
        ? { data: [{ inicio: '2026-11-03T16:00:00+00:00', fin: '2026-11-03T17:00:00+00:00', personal_id: 'a', personal_nombre: 'Ana' }] }
        : undefined,
    );
    const slots = await api.getHorariosDisponibles('2026-11-03', 60);
    expect(llamadas[0].args).toEqual({ p_fecha: '2026-11-03', p_duracion_min: 60, p_personal_id: null });
    expect(slots).toEqual([{ inicio: '2026-11-03T16:00:00.000Z', fin: '2026-11-03T17:00:00.000Z', personal_id: 'a', personal_nombre: 'Ana' }]);
  });

  it('getHorariosDisponibles deja un solo bloque por persona y hora aunque los rangos se encimen', async () => {
    const bloque = (personal_id: string, hora: string) => ({
      inicio: `2026-11-03T${hora}:00:00+00:00`,
      fin: `2026-11-03T${Number(hora) + 1}:00:00+00:00`,
      personal_id,
      personal_nombre: personal_id === 'a' ? 'Ana' : 'Bea',
    });
    const { api } = apiCon((l) =>
      l.rpc === 'horarios_disponibles' ? { data: [bloque('a', '16'), bloque('a', '16'), bloque('b', '16'), bloque('a', '17')] } : undefined,
    );
    const slots = await api.getHorariosDisponibles('2026-11-03', 60);
    expect(slots.map((s) => [s.personal_id, s.inicio])).toEqual([
      ['a', '2026-11-03T16:00:00.000Z'],
      ['b', '2026-11-03T16:00:00.000Z'],
      ['a', '2026-11-03T17:00:00.000Z'],
    ]);
  });
});

describe('crearApiSupabaseCon · clienta', () => {
  const FIRMA = { nombre_firmante: ' Mariana López ', firma_svg: '<svg/>', tutor_nombre: null };

  it('reservarCita manda exactamente los parámetros de ESPEC §6', async () => {
    const { api, llamadas } = apiCon((l) =>
      l.rpc === 'reservar_cita' ? { data: { id: 'c9', estado: 'pendiente', requiere_revision: true, alertas: ['¿Estás embarazada?'] } } : undefined,
    );
    const r = await api.reservarCita({
      items: [{ servicio_id: 's1' }, { paquete_id: 'p1', credito_id: 'k1' }],
      inicio: '2026-11-03T16:00:00.000Z',
      firma: FIRMA,
    });
    expect(r).toEqual({ id: 'c9', estado: 'pendiente', requiere_revision: true, alertas: ['¿Estás embarazada?'] });
    expect(llamadas[0].rpc).toBe('reservar_cita');
    expect(llamadas[0].args).toEqual({
      p_items: [{ servicio_id: 's1' }, { paquete_id: 'p1', credito_id: 'k1' }],
      p_inicio: '2026-11-03T16:00:00.000Z',
      p_nombre_firmante: 'Mariana López',
      p_firma_svg: '<svg/>',
      p_personal_id: null,
      p_notas: null,
      p_tutor_nombre: null,
      p_user_agent: navigator.userAgent,
    });
  });

  it('reservarCita: traslape → "Ese horario se acaba de ocupar"; P0001 tal cual', async () => {
    const { api } = apiCon(() => ({ error: { code: '23P01', message: 'conflicting key value violates exclusion constraint', details: null, hint: null }, data: null, status: 409 }));
    await expect(api.reservarCita({ items: [{ servicio_id: 's1' }], inicio: '2026-11-03T16:00:00Z', firma: FIRMA })).rejects.toThrow(M.ocupado);

    const otra = apiCon(() => ({ error: { code: 'P0001', message: 'Falta tu firma o tu nombre completo.' }, data: null, status: 400 }));
    await expect(otra.api.reservarCita({ items: [], inicio: 'x', firma: FIRMA })).rejects.toMatchObject({
      name: 'ErrorOpalo',
      message: 'Falta tu firma o tu nombre completo.',
    });
  });

  it('una petición que no llega al servidor da el mensaje de conexión', async () => {
    const { api } = apiCon(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(api.getConfiguracion()).rejects.toThrow(M.red);
  });

  it('getMisCitas busca a la clienta por usuario_id y filtra v_citas_detalle por su id', async () => {
    const { api, llamadas, estado } = apiCon(responderSesion('cliente', (l) => (l.tabla === 'v_citas_detalle' ? { data: [] } : undefined)));
    await expect(api.getMisCitas()).rejects.toThrow(M.sesion);
    estado.sesion = SESION;
    await api.getMisCitas();
    const cli = llamadas.find((l) => l.tabla === 'clientes');
    expect(ops(cli, 'eq')).toContainEqual(['usuario_id', UID]);
    const v = llamadas.find((l) => l.tabla === 'v_citas_detalle');
    expect(ops(v, 'eq')).toContainEqual(['cliente_id', CLIENTE_ID]);
    expect(ops(v, 'order')).toContainEqual(['inicio', { ascending: false }]);
    // Segunda vez: el id de la clienta ya está en memoria.
    llamadas.length = 0;
    await api.getMisCitas();
    expect(llamadas.some((l) => l.tabla === 'clientes')).toBe(false);
  });

  it('getMisConsentimientos usa la política embebida', async () => {
    const { api, estado } = apiCon(
      responderSesion('cliente', (l) =>
        l.tabla === 'consentimientos'
          ? {
              data: [
                {
                  id: 'k',
                  cita_id: 'c1',
                  nombre_firmante: 'Mariana',
                  tutor_nombre: null,
                  firma_svg: '<svg/>',
                  documento_hash: 'abc',
                  firmado_en: '2026-10-07T18:00:00+00:00',
                  politicas: { tipo: 'consentimiento_facial', titulo: 'Consentimiento facial', version: 2 },
                },
              ],
            }
          : undefined,
      ),
    );
    estado.sesion = SESION;
    const [k] = await api.getMisConsentimientos();
    expect(k).toMatchObject({ politica_tipo: 'consentimiento_facial', politica_titulo: 'Consentimiento facial', politica_version: 2 });
  });

  it('canjearRegalo normaliza el código', async () => {
    const { api, llamadas } = apiCon();
    await api.canjearRegalo(' abcd-2345 ');
    expect(llamadas[0]).toMatchObject({ rpc: 'canjear_regalo', args: { p_codigo: 'ABCD2345' } });
  });
});

describe('crearApiSupabaseCon · panel interno', () => {
  const AHORA = new Date(isoDesdeLocal('2026-11-02', '12:00'));

  it('getResumenHoy: agenda de hoy en hora de Querétaro; sin datos de admin para el personal', async () => {
    const { api, llamadas } = apiCon(
      (l) => {
        if (l.rpc === 'es_admin') return { data: false };
        if (l.tabla === 'citas') return { data: null, count: 3 };
        if (l.tabla === 'pedidos') return { data: null, count: 2 };
        return undefined;
      },
      { ahora: () => AHORA },
    );
    const r = await api.admin.getResumenHoy();
    expect(r).toEqual({
      citas_hoy: [],
      por_revisar: 3,
      reposicion: [],
      gastos_por_vencer: [],
      mes_actual: null,
      pedidos_pendientes: 2,
      pedidos_por_entregar: 0,
      lotes_listos: [],
    });
    const v = llamadas.find((l) => l.tabla === 'v_citas_detalle');
    expect(ops(v, 'gte')).toContainEqual(['inicio', '2026-11-02T06:00:00.000Z']);
    expect(ops(v, 'lt')).toContainEqual(['inicio', '2026-11-03T06:00:00.000Z']);
  });

  it('getResumenHoy: el admin recibe el mes actual (en ceros si no hay actividad)', async () => {
    const { api } = apiCon((l) => (l.rpc === 'es_admin' ? { data: true } : undefined), { ahora: () => AHORA });
    const r = await api.admin.getResumenHoy();
    expect(r.mes_actual).toMatchObject({ mes: '2026-11-01', ingresos: 0, utilidad: 0 });
  });

  it('getResultados devuelve n meses ascendentes', async () => {
    const { api } = apiCon(
      (l) => (l.tabla === 'v_resultado_mensual' ? { data: [{ mes: '2026-10-01', ingresos: '500', utilidad: '300' }] } : undefined),
      { ahora: () => AHORA },
    );
    const r = await api.admin.getResultados(2);
    expect(r.map((x) => [x.mes, x.ingresos])).toEqual([
      ['2026-10-01', 500],
      ['2026-11-01', 0],
    ]);
  });

  it('guardarProducto nunca envía stock_actual ni costo_unitario', async () => {
    const { api, llamadas } = apiCon((l) => (l.tabla === 'productos' ? { data: { id: 'n1', nombre: 'Cera', contenido_presentacion: 800, costo_presentacion: 400, costo_unitario: 0.5, stock_actual: 0 } } : undefined));
    const p = await api.admin.guardarProducto({
      nombre: 'Cera',
      marca: null,
      categoria: 'cera',
      unidad_medida: 'g',
      presentacion: 'Lata 800 g',
      contenido_presentacion: 800,
      costo_presentacion: 400,
      stock_minimo: 200,
      proveedor_id: null,
      uso: 'cabina',
      precio_venta: null,
      vendible_en_linea: false,
      activo: true,
      notas: null,
      ...FICHA_VACIA,
    });
    const [datos] = ops(llamadas[0], 'insert')[0] as [Record<string, unknown>];
    expect(datos).not.toHaveProperty('stock_actual');
    expect(datos).not.toHaveProperty('costo_unitario');
    expect(p.costo_unitario).toBe(0.5);
  });

  describe('guardados atómicos por RPC (ESPEC §6)', () => {
    const PAQUETE = {
      slug: '',
      nombre: 'Combo Piernas y Axila',
      descripcion: '  ',
      tipo: 'combo' as const,
      precio: 500,
      duracion_min: null,
      vigencia_dias: null,
      activo: true,
      orden: 1,
      items: [
        { servicio_id: 's1', cantidad: 1 },
        { servicio_id: 's2', cantidad: 1 },
        { servicio_id: 's1', cantidad: 1 },
      ],
    };
    const TABLAS_POR_RPC = ['paquetes', 'paquete_servicios', 'horarios', 'recetas_servicio'];

    it('guardarPaquete llama guardar_paquete con p_id, p_datos y p_items (la base arma el slug y junta repetidos)', async () => {
      const { api, llamadas } = apiCon((l) => (l.rpc === 'guardar_paquete' ? { data: 'p1' } : undefined));
      await api.admin.guardarPaquete({ ...PAQUETE, id: 'p1' });
      expect(llamadas).toHaveLength(1);
      expect(llamadas[0].rpc).toBe('guardar_paquete');
      expect(llamadas[0].args).toEqual({
        p_id: 'p1',
        p_datos: {
          slug: null,
          nombre: 'Combo Piernas y Axila',
          descripcion: null,
          tipo: 'combo',
          precio: 500,
          duracion_min: null,
          vigencia_dias: null,
          activo: true,
          orden: 1,
        },
        p_items: [
          { servicio_id: 's1', cantidad: 1 },
          { servicio_id: 's2', cantidad: 1 },
          { servicio_id: 's1', cantidad: 1 },
        ],
      });

      // Paquete nuevo: p_id null (la base genera el id).
      llamadas.length = 0;
      await api.admin.guardarPaquete({ ...PAQUETE, items: [{ servicio_id: 's3', cantidad: 2 }] });
      expect(llamadas[0].args).toMatchObject({ p_id: null, p_items: [{ servicio_id: 's3', cantidad: 2 }] });
    });

    it('guardarPaquete deja que la base valide y muestra su mensaje tal cual (igual que la demo)', async () => {
      const { api, llamadas } = apiCon((l) =>
        l.rpc === 'guardar_paquete' ? { error: { code: 'P0001', message: 'Escribe el nombre del paquete.' }, data: null, status: 400 } : undefined,
      );
      await expect(api.admin.guardarPaquete({ ...PAQUETE, nombre: ' ', items: [{ servicio_id: '', cantidad: 0 }] })).rejects.toThrow(
        'Escribe el nombre del paquete.',
      );
      expect(llamadas).toHaveLength(1);
      expect(llamadas[0].args).toMatchObject({ p_datos: { nombre: '' }, p_items: [{ servicio_id: null, cantidad: 0 }] });
    });

    it('guardarHorarios llama guardar_horarios con los rangos en HH:MM', async () => {
      const { api, llamadas } = apiCon();
      await api.admin.guardarHorarios('a', [
        { id: 'h1', dia_semana: 2, hora_inicio: '10:00:00', hora_fin: '14:00' },
        { dia_semana: 2, hora_inicio: '15:00', hora_fin: '19:00:00' },
      ]);
      expect(llamadas).toHaveLength(1);
      expect(llamadas[0]).toMatchObject({
        rpc: 'guardar_horarios',
        args: {
          p_personal_id: 'a',
          p_horarios: [
            { dia_semana: 2, hora_inicio: '10:00', hora_fin: '14:00' },
            { dia_semana: 2, hora_inicio: '15:00', hora_fin: '19:00' },
          ],
        },
      });

      // Lista vacía: quita todos los rangos.
      llamadas.length = 0;
      await api.admin.guardarHorarios('a', []);
      expect(llamadas[0].args).toEqual({ p_personal_id: 'a', p_horarios: [] });
    });

    it('guardarHorarios deja que la base valide y muestra su mensaje tal cual (igual que la demo)', async () => {
      const { api, llamadas } = apiCon((l) =>
        l.rpc === 'guardar_horarios' ? { error: { code: 'P0001', message: 'La salida debe ser después de la entrada.' }, data: null, status: 400 } : undefined,
      );
      await expect(api.admin.guardarHorarios('a', [{ dia_semana: 2, hora_inicio: '19:00', hora_fin: '10:00' }])).rejects.toThrow(
        'La salida debe ser después de la entrada.',
      );
      expect(llamadas).toHaveLength(1);
      expect(llamadas[0].args).toEqual({ p_personal_id: 'a', p_horarios: [{ dia_semana: 2, hora_inicio: '19:00', hora_fin: '10:00' }] });
    });

    it('guardarReceta llama guardar_receta con las líneas tal cual (la base junta repetidos y valida)', async () => {
      const { api, llamadas } = apiCon();
      await api.admin.guardarReceta('s1', [
        { producto_id: 'cera', cantidad: 20, notas: null },
        { producto_id: 'banda', cantidad: 1, notas: ' ' },
        { producto_id: 'cera', cantidad: 10.0004, notas: ' tibia ' },
      ]);
      expect(llamadas).toHaveLength(1);
      expect(llamadas[0]).toMatchObject({
        rpc: 'guardar_receta',
        args: {
          p_servicio_id: 's1',
          p_items: [
            { producto_id: 'cera', cantidad: 20, notas: null },
            { producto_id: 'banda', cantidad: 1, notas: null },
            { producto_id: 'cera', cantidad: 10.0004, notas: 'tibia' },
          ],
        },
      });

      // Receta vacía: se queda sin productos.
      llamadas.length = 0;
      await api.admin.guardarReceta('s1', []);
      expect(llamadas[0].args).toEqual({ p_servicio_id: 's1', p_items: [] });

      // Una cantidad inválida la rechaza la base, con su texto.
      const mala = apiCon(() => ({ error: { code: 'P0001', message: 'La cantidad de cada producto debe ser mayor a cero.' }, data: null, status: 400 }));
      await expect(mala.api.admin.guardarReceta('s1', [{ producto_id: 'cera', cantidad: 0 }])).rejects.toThrow(
        'La cantidad de cada producto debe ser mayor a cero.',
      );
    });

    it('no escriben directo en paquetes, paquete_servicios, horarios ni recetas_servicio', async () => {
      const { api, llamadas } = apiCon();
      await api.admin.guardarPaquete({ ...PAQUETE, id: 'p1' });
      await api.admin.guardarPaquete(PAQUETE);
      await api.admin.guardarHorarios('a', [{ dia_semana: 1, hora_inicio: '10:00', hora_fin: '19:00' }]);
      await api.admin.guardarReceta('s1', [{ producto_id: 'cera', cantidad: 20 }]);
      expect(llamadas.map((l) => l.rpc)).toEqual(['guardar_paquete', 'guardar_paquete', 'guardar_horarios', 'guardar_receta']);
      expect(llamadas.filter((l) => l.tabla && TABLAS_POR_RPC.includes(l.tabla))).toEqual([]);
    });

    it('un error se muestra tal cual, sin pedir volver a guardar (no hay guardados a medias)', async () => {
      const SIN_RED = () => {
        throw new TypeError('Failed to fetch');
      };
      const red = apiCon(SIN_RED);
      await expect(red.api.admin.guardarPaquete(PAQUETE)).rejects.toThrow(new ErrorOpalo(M.red));
      await expect(red.api.admin.guardarHorarios('a', [])).rejects.toThrow(new ErrorOpalo(M.red));
      await expect(red.api.admin.guardarReceta('s1', [])).rejects.toThrow(new ErrorOpalo(M.red));

      const negocio = apiCon(() => ({ error: { code: 'P0001', message: 'Mensaje de la base.' }, data: null, status: 400 }));
      await expect(negocio.api.admin.guardarHorarios('a', [])).rejects.toMatchObject({ message: 'Mensaje de la base.', codigo: 'P0001' });

      const permiso = apiCon(() => ({ error: { code: '42501', message: 'permission denied for function guardar_paquete' }, data: null, status: 403 }));
      await expect(permiso.api.admin.guardarPaquete(PAQUETE)).rejects.toThrow(M.permiso);
    });
  });

  it('una edición que RLS filtra (0 filas) se reporta como falta de permiso', async () => {
    const { api, estado } = apiCon((l) => {
      if (l.tabla === 'servicios') return { data: null };
      if (l.rpc === 'es_admin') return { data: false };
      return undefined;
    });
    estado.sesion = SESION;
    await expect(
      api.admin.guardarServicio({
        id: 's1',
        categoria_id: 'c1',
        slug: 'cejas',
        nombre: 'Cejas',
        descripcion: null,
        zonas_incluye: null,
        duracion_min: null,
        duracion_primera_vez_min: null,
        precio: 130,
        etapa: 'disponible',
        es_complemento: false,
        reservable_en_linea: true,
        vendible_en_linea: true,
        tipo_consentimiento: 'consentimiento_depilacion',
        activo: true,
        orden: 1,
      }),
    ).rejects.toThrow(M.permiso);
  });

  describe('notas internas de la clienta (ESPEC §5.1)', () => {
    const RESUMEN = {
      id: CLIENTE_ID,
      nombre: 'Mariana',
      apellidos: 'López',
      telefono: null,
      email: null,
      fecha_nacimiento: '1995-04-12',
      tiene_cuenta: true,
      citas_completadas: 1,
      ultima_visita: null,
      proxima_cita: null,
      total_pagado: '0',
      creado_en: '2026-10-01T00:00:00Z',
      es_personal: false,
    };

    it('getExpediente lee las notas en v_clientes_notas y nunca consulta clientes', async () => {
      const { api, llamadas } = apiCon((l) => {
        if (l.tabla === 'v_clientes_resumen') return { data: RESUMEN };
        if (l.tabla === 'v_clientes_notas') return { data: { id: CLIENTE_ID, notas_internas: 'Piel sensible' } };
        return undefined;
      });
      const x = await api.admin.getExpediente(CLIENTE_ID);
      expect(x.cliente).toMatchObject({ id: CLIENTE_ID, notas_internas: 'Piel sensible', es_personal: false, fecha_nacimiento: '1995-04-12' });
      expect(llamadas.some((l) => l.tabla === 'clientes')).toBe(false);
      const notas = llamadas.find((l) => l.tabla === 'v_clientes_notas');
      expect(ops(notas, 'select')).toEqual([['id, notas_internas']]);
      expect(ops(notas, 'eq')).toEqual([['id', CLIENTE_ID]]);
    });

    it('getExpediente: sin fila en v_clientes_notas, notas_internas es null', async () => {
      const { api } = apiCon((l) => (l.tabla === 'v_clientes_resumen' ? { data: RESUMEN } : undefined));
      expect((await api.admin.getExpediente(CLIENTE_ID)).cliente.notas_internas).toBeNull();
    });

    it('guardarNotasCliente actualiza clientes sin pedir la fila de vuelta (return=minimal)', async () => {
      const { api, llamadas } = apiCon((l) => (l.tabla === 'clientes' ? { data: null, count: 1, status: 204 } : undefined));
      await api.admin.guardarNotasCliente(CLIENTE_ID, '  Piel sensible ');
      expect(llamadas).toHaveLength(1);
      const [u] = llamadas;
      expect(u.tabla).toBe('clientes');
      expect(u.ops.map(([n]) => n)).toEqual(['update', 'eq']);
      expect(ops(u, 'update')[0]).toEqual([{ notas_internas: 'Piel sensible' }, { count: 'exact' }]);
      expect(ops(u, 'eq')).toEqual([['id', CLIENTE_ID]]);
      expect(ops(u, 'select')).toEqual([]);

      // Notas vacías → null. Sin conteo del servidor se da por guardado.
      const sinConteo = apiCon((l) => (l.tabla === 'clientes' ? { data: null, status: 204 } : undefined));
      await sinConteo.api.admin.guardarNotasCliente(CLIENTE_ID, '   ');
      expect(ops(sinConteo.llamadas[0], 'update')[0][0]).toEqual({ notas_internas: null });
    });

    it('guardarNotasCliente: 0 filas → la clienta no existe, o falta de permiso', async () => {
      const ninguna = (personal: boolean) =>
        apiCon((l) => {
          if (l.tabla === 'clientes') return { data: null, count: 0, status: 204 };
          if (l.rpc === 'es_personal') return { data: personal };
          return undefined;
        });
      const noExiste = ninguna(true);
      noExiste.estado.sesion = SESION;
      await expect(noExiste.api.admin.guardarNotasCliente(CLIENTE_ID, 'x')).rejects.toThrow('No encontramos a esa clienta.');
      const sinPermiso = ninguna(false);
      sinPermiso.estado.sesion = SESION;
      await expect(sinPermiso.api.admin.guardarNotasCliente(CLIENTE_ID, 'x')).rejects.toThrow(M.permiso);
    });
  });

  it('getClientes filtra en el servidor y afina sin acentos en el navegador', async () => {
    const { api, llamadas } = apiCon((l) =>
      l.tabla === 'v_clientes_resumen'
        ? {
            data: [
              { id: '1', nombre: 'María', apellidos: 'Peña', telefono: null, email: null, citas_completadas: '2', total_pagado: '300.00', creado_en: '2026-10-01T00:00:00Z', es_personal: false },
              { id: '2', nombre: 'Marco', apellidos: null, telefono: null, email: null, creado_en: '2026-10-01T00:00:00Z', es_personal: true },
              { id: '3', nombre: 'Mariela', apellidos: null, telefono: null, email: null, creado_en: '2026-10-01T00:00:00Z', es_personal: true },
            ],
          }
        : undefined,
    );
    const r = await api.admin.getClientes('mari');
    expect(r.map((c) => c.id)).toEqual(['1', '3']);
    expect(r[0]).toMatchObject({ citas_completadas: 2, total_pagado: 300, es_personal: false });
    expect(r[1].es_personal).toBe(true);
    expect(ops(llamadas[0], 'or')[0][0]).toContain('nombre.ilike.*m_r_*');
    expect(ops(llamadas[0], 'select')[0][0]).toContain('es_personal');
  });
});

// ---------------------------------------------------------------------------
// La firma es parte del flujo interno (ESPEC §9)
// ---------------------------------------------------------------------------

describe('firma en cabina (ESPEC §9)', () => {
  it('getConfiguracion pide firma_en_linea y la trae como boolean (false si falta)', async () => {
    const { api, llamadas } = apiCon((l) => (l.tabla === 'configuracion' ? { data: { nombre_negocio: 'Ópalo', firma_en_linea: false } } : undefined));
    expect((await api.getConfiguracion()).firma_en_linea).toBe(false);
    expect(String(ops(llamadas[0], 'select')[0][0])).toContain('firma_en_linea');

    const enLinea = apiCon(() => ({ data: { firma_en_linea: true } }));
    expect((await enLinea.api.getConfiguracion()).firma_en_linea).toBe(true);
    const sinFila = apiCon(() => ({ data: null }));
    expect((await sinFila.api.getConfiguracion()).firma_en_linea).toBe(false);
  });

  it('reservarCita sin firma no manda p_nombre_firmante ni p_firma_svg', async () => {
    const { api, llamadas } = apiCon((l) =>
      l.rpc === 'reservar_cita' ? { data: { id: 'c1', estado: 'confirmada', requiere_revision: false, alertas: [] } } : undefined,
    );
    const r = await api.reservarCita({ items: [{ servicio_id: 's1' }], inicio: '2026-11-03T16:00:00.000Z', notas: '  Llego 5 min antes ' });
    expect(r).toEqual({ id: 'c1', estado: 'confirmada', requiere_revision: false, alertas: [] });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].args).toEqual({
      p_items: [{ servicio_id: 's1' }],
      p_inicio: '2026-11-03T16:00:00.000Z',
      p_personal_id: null,
      p_notas: 'Llego 5 min antes',
      p_tutor_nombre: null,
      p_user_agent: navigator.userAgent,
    });

    // firma null o vacía cuenta como "sin firma"
    llamadas.length = 0;
    await api.reservarCita({ items: [{ servicio_id: 's1' }], inicio: '2026-11-03T16:00:00.000Z', firma: null });
    await api.reservarCita({
      items: [{ servicio_id: 's1' }],
      inicio: '2026-11-03T16:00:00.000Z',
      firma: { nombre_firmante: '  ', firma_svg: '' },
    });
    for (const l of llamadas) {
      expect(l.args).not.toHaveProperty('p_nombre_firmante');
      expect(l.args).not.toHaveProperty('p_firma_svg');
    }
  });

  it('reservarCita de una menor sin firma (firma_en_linea = false) manda el tutor sin trazo ni firmante', async () => {
    const { api, llamadas } = apiCon();
    await api.reservarCita({
      items: [{ servicio_id: 's1' }],
      inicio: '2026-11-03T16:00:00.000Z',
      firma: { nombre_firmante: '', firma_svg: '', tutor_nombre: ' Laura Ruiz ' },
    });
    expect(llamadas[0].args).toMatchObject({ p_tutor_nombre: 'Laura Ruiz' });
    expect(llamadas[0].args).not.toHaveProperty('p_nombre_firmante');
    expect(llamadas[0].args).not.toHaveProperty('p_firma_svg');
  });

  it('reservarCita con firma (firma_en_linea = true) la manda con su tutor', async () => {
    const { api, llamadas } = apiCon();
    await api.reservarCita({
      items: [{ servicio_id: 's1' }],
      inicio: '2026-11-03T16:00:00.000Z',
      firma: { nombre_firmante: ' Sofía Ruiz ', firma_svg: '<svg/>', tutor_nombre: ' Laura Ruiz ' },
    });
    expect(llamadas[0].args).toMatchObject({ p_nombre_firmante: 'Sofía Ruiz', p_firma_svg: '<svg/>', p_tutor_nombre: 'Laura Ruiz' });
  });

  it('firmarConsentimientoCita de la clienta muestra el mensaje de la base tal cual', async () => {
    const msg = 'La firma se hace en el spa, el día de tu cita.';
    const { api } = apiCon(() => ({ error: { code: 'P0001', message: msg }, data: null, status: 400 }));
    await expect(api.firmarConsentimientoCita('c1', { nombre_firmante: 'Mariana', firma_svg: '<svg/>' })).rejects.toMatchObject({
      message: msg,
      codigo: 'P0001',
    });
  });
});

// ---------------------------------------------------------------------------
// Tienda, taller y mostrador (ESPEC §10)
// ---------------------------------------------------------------------------

describe('tienda de jabones y velas (ESPEC §10.1)', () => {
  const JABON = {
    id: 'j1',
    slug: 'jabon-avena-miel',
    nombre: 'Jabón de avena y miel (ejemplo)',
    categoria: 'jabon',
    marca: 'Ópalo',
    presentacion: 'Barra',
    descripcion: 'Suave para piel sensible.',
    aroma: 'Miel',
    ingredientes: 'Avena, miel, aceite de oliva',
    modo_uso: 'Haz espuma con agua tibia.',
    advertencias: 'Uso externo.',
    contenido_neto: '100 g',
    foto_url: null,
    color_hex: '#E8D9B5',
    destacado: true,
    hecho_en_opalo: true,
    precio_venta: '120.00',
    stock_disponible: 7,
    hay_stock: true,
    proximo_lote_listo: '2026-11-20',
  };

  it('productos_tienda: columnas de §10.1, numeric a number y fechas YYYY-MM-DD', () => {
    expect(aProductoTienda(JABON)).toEqual({ ...JABON, precio_venta: 120 });
    const sin = aProductoTienda({ id: 'v1', nombre: 'Vela', categoria: 'vela', precio_venta: 250, stock_disponible: '0', hay_stock: false, color_hex: 'rojo' });
    expect(sin).toMatchObject({ slug: null, stock_disponible: 0, hay_stock: false, proximo_lote_listo: null, color_hex: null, destacado: false });
    expect(aProductoTienda({ id: 'x', color_hex: '#abc', stock_disponible: '3.7' })).toMatchObject({ color_hex: '#aabbcc', stock_disponible: 3, hay_stock: true });
  });

  it('getProductosTienda pide la vista sin * ni order() propio y deja destacados primero', async () => {
    const { api, llamadas } = apiCon((l) =>
      l.tabla === 'productos_tienda'
        ? {
            data: [
              { ...JABON, id: 'v1', categoria: 'vela', destacado: false, nombre: 'Vela' },
              { ...JABON, id: 'j2', destacado: false, nombre: 'Jabón 2' },
              { ...JABON, id: 'j1', destacado: true },
              { ...JABON, id: 'j3', destacado: false, nombre: 'Jabón 3' },
            ],
          }
        : undefined,
    );
    const r = await api.getProductosTienda();
    expect(r.map((p) => p.id)).toEqual(['j1', 'j2', 'j3', 'v1']);
    expect(llamadas).toHaveLength(1);
    expect(ops(llamadas[0], 'order')).toEqual([]);
    expect(String(ops(llamadas[0], 'select')[0][0])).not.toContain('*');
  });

  it('ordenarTienda es estable dentro de cada categoría', () => {
    const p = (id: string, categoria: 'jabon' | 'vela' | 'set', destacado = false) => aProductoTienda({ id, categoria, destacado, precio_venta: 1 });
    expect(ordenarTienda([p('s', 'set'), p('v', 'vela', true), p('j2', 'jabon'), p('j1', 'jabon')]).map((x) => x.id)).toEqual(['v', 'j2', 'j1', 's']);
  });

  it('productos: la ficha pública se lee y se guarda (el slug lo normaliza o lo arma la base)', async () => {
    const pr = aProducto({ ...JABON, unidad_medida: 'pz', contenido_presentacion: 1, costo_presentacion: '18.5', orden: '3' });
    expect(pr).toMatchObject({ slug: 'jabon-avena-miel', contenido_neto: '100 g', color_hex: '#E8D9B5', destacado: true, hecho_en_opalo: true, orden: 3, costo_unitario: 18.5 });

    const { api, llamadas } = apiCon((l) => (l.tabla === 'productos' ? { data: { id: 'n1', nombre: 'Vela de lavanda', categoria: 'vela' } } : undefined));
    await api.admin.guardarProducto({
      nombre: ' Vela de lavanda ',
      marca: null,
      categoria: 'vela',
      unidad_medida: 'pz',
      presentacion: 'Frasco',
      contenido_presentacion: 1,
      costo_presentacion: 60,
      stock_minimo: 4,
      proveedor_id: null,
      uso: 'venta',
      precio_venta: 250,
      vendible_en_linea: true,
      activo: true,
      notas: null,
      ...FICHA_VACIA,
      descripcion: '  Cera de soya. ',
      aroma: 'Lavanda',
      contenido_neto: '180 g',
      color_hex: '#B8A9D9',
      destacado: true,
      hecho_en_opalo: true,
      orden: 2,
    });
    const [datos] = ops(llamadas[0], 'insert')[0] as [Record<string, unknown>];
    expect(datos).toMatchObject({
      nombre: 'Vela de lavanda',
      slug: null,
      descripcion: 'Cera de soya.',
      aroma: 'Lavanda',
      ingredientes: null,
      contenido_neto: '180 g',
      foto_url: null,
      color_hex: '#B8A9D9',
      destacado: true,
      hecho_en_opalo: true,
      orden: 2,
    });
    expect(datos).not.toHaveProperty('stock_actual');
    expect(datos).not.toHaveProperty('costo_unitario');
    expect(String(ops(llamadas[0], 'select')[0][0])).toContain('hecho_en_opalo');

    // Un color que no es #rrggbb no se manda; un slug escrito va tal cual (recortado) a la base.
    llamadas.length = 0;
    await api.admin.guardarProducto({
      id: 'c1',
      nombre: 'Cera tibia',
      marca: null,
      categoria: 'cera',
      unidad_medida: 'g',
      presentacion: null,
      contenido_presentacion: 800,
      costo_presentacion: 400,
      stock_minimo: 0,
      proveedor_id: null,
      uso: 'cabina',
      precio_venta: null,
      vendible_en_linea: false,
      activo: true,
      notas: null,
      ...FICHA_VACIA,
      color_hex: 'no-es-color',
    });
    expect(ops(llamadas[0], 'update')[0][0]).toMatchObject({ slug: null, color_hex: null, destacado: false });
    llamadas.length = 0;
    await api.admin.guardarProducto({
      nombre: 'Set regalo',
      marca: null,
      categoria: 'set',
      unidad_medida: 'pz',
      presentacion: null,
      contenido_presentacion: 1,
      costo_presentacion: 0,
      stock_minimo: 0,
      proveedor_id: null,
      uso: 'venta',
      precio_venta: null,
      vendible_en_linea: false,
      activo: true,
      notas: null,
      ...FICHA_VACIA,
      slug: ' Set Navideño ',
    });
    expect(ops(llamadas[0], 'insert')[0][0]).toMatchObject({ slug: 'Set Navideño' });

    // Los avisos del trigger de la ficha llegan tal cual.
    const msg = 'Los jabones, velas y sets se manejan por pieza: unidad "pz" y contenido 1.';
    const mala = apiCon(() => ({ error: { code: 'P0001', message: msg }, data: null, status: 400 }));
    await expect(
      mala.api.admin.guardarProducto({
        nombre: 'Jabón',
        marca: null,
        categoria: 'jabon',
        unidad_medida: 'g',
        presentacion: null,
        contenido_presentacion: 100,
        costo_presentacion: 18,
        stock_minimo: 0,
        proveedor_id: null,
        uso: 'venta',
        precio_venta: 120,
        vendible_en_linea: true,
        activo: true,
        notas: null,
        ...FICHA_VACIA,
      }),
    ).rejects.toThrow(msg);
  });
});

describe('pedidos de mostrador y resultados (ESPEC §10.3–§10.4)', () => {
  it('v_pedidos_detalle: origen, entregado_en, tiene_productos y venta sin clienta', () => {
    const p = aPedidoDetalle({
      id: 'pe2',
      folio: 'OP-00002',
      cliente_id: null,
      cliente_nombre: 'Venta de mostrador',
      estado: 'pagado',
      total: '240',
      pagado: '240',
      creado_en: '2026-10-08T18:00:00+00:00',
      pagado_en: '2026-10-08T18:00:00+00:00',
      origen: 'mostrador',
      entregado_en: '2026-10-08T18:00:01+00:00',
      tiene_productos: true,
      items: [{ tipo: 'producto', descripcion: 'Jabón', cantidad: 2, precio_unitario: 120, importe: 240, regalo_para: null }],
    });
    expect(p).toMatchObject({ cliente_id: null, cliente_nombre: 'Venta de mostrador', origen: 'mostrador', entregado_en: '2026-10-08T18:00:01.000Z', tiene_productos: true });

    // Sin columnas nuevas (o nulas): origen web, sin entregar, tiene_productos según los ítems.
    const q = aPedidoDetalle({ id: 'pe3', cliente_id: null, cliente_nombre: null, items: [{ tipo: 'producto', cantidad: 1, precio_unitario: 1 }] });
    expect(q).toMatchObject({ cliente_nombre: 'Venta de mostrador', origen: 'web', entregado_en: null, tiene_productos: true });
    expect(aPedidoDetalle({ id: 'pe4', cliente_id: CLIENTE_ID, cliente_nombre: 'Mariana', items: [{ tipo: 'servicio' }] }).tiene_productos).toBe(false);
  });

  it('resultados: costo_ventas y mermas (en ceros los meses sin actividad)', () => {
    const ahora = new Date(isoDesdeLocal('2026-11-15', '12:00'));
    const r = completarMeses([{ mes: '2026-11-01', ingresos: '1000', costo_insumos: '50', costo_ventas: '120.50', mermas: '30', gastos: 200, utilidad: '599.50' }], ahora, 2);
    expect(r[0]).toMatchObject({ mes: '2026-10-01', costo_ventas: 0, mermas: 0 });
    expect(r[1]).toMatchObject({ costo_ventas: 120.5, mermas: 30, utilidad: 599.5 });
  });

  it('ventaMostrador llama venta_mostrador con los ítems de crear_pedido y devuelve folio y total', async () => {
    const { api, llamadas } = apiCon((l) => (l.rpc === 'venta_mostrador' ? { data: { id: 'pe9', folio: 'OP-00009', total: '370.00' } } : undefined));
    const r = await api.admin.ventaMostrador({
      items: [
        { tipo: 'producto', id: 'j1', cantidad: 2 },
        { tipo: 'servicio', id: 's1', cantidad: 1, regalo_para: ' Sofía ' },
      ],
      metodo: 'tarjeta',
      cliente_id: CLIENTE_ID,
      propina: 30,
      notas: '  ',
    });
    expect(r).toEqual({ id: 'pe9', folio: 'OP-00009', total: 370 });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].args).toEqual({
      p_items: [
        { tipo: 'producto', id: 'j1', cantidad: 2, regalo_para: null },
        { tipo: 'servicio', id: 's1', cantidad: 1, regalo_para: 'Sofía' },
      ],
      p_metodo: 'tarjeta',
      p_cliente_id: CLIENTE_ID,
      p_propina: 30,
      p_notas: null,
    });

    // Sin clienta ni propina
    llamadas.length = 0;
    await api.admin.ventaMostrador({ items: [{ tipo: 'producto', id: 'j1', cantidad: 1 }], metodo: 'cortesia' });
    expect(llamadas[0].args).toMatchObject({ p_cliente_id: null, p_propina: 0, p_metodo: 'cortesia' });
  });

  it('ventaMostrador y marcarEntregado muestran los mensajes de la base tal cual', async () => {
    const msg = 'Para vender servicios prepagados elige a la clienta.';
    const { api } = apiCon(() => ({ error: { code: 'P0001', message: msg }, data: null, status: 400 }));
    await expect(api.admin.ventaMostrador({ items: [{ tipo: 'servicio', id: 's1', cantidad: 1 }], metodo: 'efectivo' })).rejects.toThrow(msg);

    const ok = apiCon();
    await ok.api.admin.marcarEntregado('pe1');
    expect(ok.llamadas[0]).toMatchObject({ rpc: 'marcar_entregado', args: { p_pedido_id: 'pe1' } });
  });

  it('crearPedido sigue mandando los mismos p_items (y muestra el aviso de existencias)', async () => {
    const msg = 'Por ahora sólo quedan 2 piezas de Jabón de avena.';
    const { api, llamadas } = apiCon(() => ({ error: { code: 'P0001', message: msg }, data: null, status: 400 }));
    await expect(api.crearPedido([{ tipo: 'producto', id: 'j1', cantidad: 3.2 }], 'efectivo')).rejects.toThrow(msg);
    expect(llamadas[0].args).toEqual({ p_items: [{ tipo: 'producto', id: 'j1', cantidad: 3, regalo_para: null }], p_metodo_pago: 'efectivo', p_notas: null });
  });
});

describe('taller: fórmulas y lotes (ESPEC §10.2)', () => {
  const AHORA = new Date(isoDesdeLocal('2026-11-02', '12:00'));
  const LOTE = {
    id: 'l1',
    codigo: 'JAB-261002-01',
    producto_id: 'j1',
    producto_nombre: 'Jabón de avena',
    categoria: 'jabon',
    formula_nombre: 'Avena 12 piezas',
    elaborado_en: '2026-10-02',
    listo_desde: '2026-10-30',
    dias_para_listo: -3,
    caduca_en: null,
    piezas_planeadas: '12.00',
    piezas_obtenidas: null,
    costo_materiales: '222.00',
    costo_unitario: '18.5000',
    estado: 'en_curado',
    liberado_en: null,
    notas: null,
  };

  it('v_lotes y v_costo_formulas a sus tipos (insumos jsonb, también como texto)', () => {
    expect(aLote(LOTE)).toEqual({ ...LOTE, piezas_planeadas: 12, costo_materiales: 222, costo_unitario: 18.5 });
    expect(aLote({ ...LOTE, estado: 'raro', liberado_en: '2026-10-31T18:00:00+00:00' })).toMatchObject({ estado: 'en_curado', liberado_en: '2026-10-31T18:00:00.000Z' });

    const insumos = [{ insumo_id: 'aceite', nombre: 'Aceite de oliva', unidad_medida: 'ml', cantidad: '500.000', costo: '90.00' }];
    const fila = { formula_id: 'f1', producto_id: 'j1', producto_nombre: 'Jabón', nombre: 'Avena', rendimiento_piezas: '12', dias_curado: 28, costo_lote: '222', costo_pieza: '18.5', precio_venta: '120', margen_pieza: '101.5', margen_pct: '84.58', insumos };
    const c = aCostoFormula(fila);
    expect(c).toMatchObject({ rendimiento_piezas: 12, costo_lote: 222, costo_pieza: 18.5, precio_venta: 120, margen_pieza: 101.5, margen_pct: 84.58 });
    expect(c.insumos).toEqual([{ insumo_id: 'aceite', nombre: 'Aceite de oliva', unidad_medida: 'ml', cantidad: 500, costo: 90 }]);
    expect(aCostoFormula({ ...fila, insumos: JSON.stringify(insumos) }).insumos).toHaveLength(1);
    expect(aCostoFormula({ ...fila, precio_venta: null, margen_pieza: null, margen_pct: null, insumos: null })).toMatchObject({ precio_venta: null, margen_pct: null, insumos: [] });
  });

  it('getFormulas trae fórmulas con sus insumos embebidos en una consulta', async () => {
    const { api, llamadas } = apiCon((l) =>
      l.tabla === 'formulas'
        ? {
            data: [
              { id: 'f2', producto_id: 'v1', nombre: 'Vela soya', rendimiento_piezas: '6', dias_curado: 2, instrucciones: null, activa: true, formula_items: [] },
              {
                id: 'f1',
                producto_id: 'j1',
                nombre: 'Avena',
                rendimiento_piezas: '12.00',
                dias_curado: 28,
                instrucciones: 'Mezclar a 40 °C',
                activa: false,
                formula_items: [{ insumo_id: 'aceite', cantidad: '500.000' }, { insumo_id: 'sosa', cantidad: '70' }],
              },
            ],
          }
        : undefined,
    );
    const fs = await api.admin.getFormulas();
    expect(llamadas).toHaveLength(1);
    expect(fs.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(fs[0]).toEqual({
      id: 'f1',
      producto_id: 'j1',
      nombre: 'Avena',
      rendimiento_piezas: 12,
      dias_curado: 28,
      instrucciones: 'Mezclar a 40 °C',
      activa: false,
      items: [
        { insumo_id: 'aceite', cantidad: 500 },
        { insumo_id: 'sosa', cantidad: 70 },
      ],
    });
  });

  it('guardarFormula llama guardar_formula (p_id, p_datos, p_items) y devuelve el id', async () => {
    const { api, llamadas } = apiCon((l) => (l.rpc === 'guardar_formula' ? { data: 'f9' } : undefined));
    const id = await api.admin.guardarFormula({
      producto_id: 'j1',
      nombre: ' Avena ',
      rendimiento_piezas: 12,
      dias_curado: 28,
      instrucciones: '  ',
      activa: true,
      items: [{ insumo_id: 'aceite', cantidad: 500 }],
    });
    expect(id).toBe('f9');
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].args).toEqual({
      p_id: null,
      p_datos: { producto_id: 'j1', nombre: 'Avena', rendimiento_piezas: 12, dias_curado: 28, instrucciones: null, activa: true },
      p_items: [{ insumo_id: 'aceite', cantidad: 500 }],
    });
    expect(llamadas.some((l) => l.tabla === 'formulas' || l.tabla === 'formula_items')).toBe(false);

    llamadas.length = 0;
    await api.admin.guardarFormula({ id: 'f1', producto_id: 'j1', nombre: 'Avena', rendimiento_piezas: 0, dias_curado: 28, instrucciones: null, activa: false, items: [] });
    expect(llamadas[0].args).toMatchObject({ p_id: 'f1', p_datos: { rendimiento_piezas: 0, activa: false }, p_items: [] });

    const msg = 'Agrega al menos un insumo a la fórmula.';
    const mala = apiCon(() => ({ error: { code: 'P0001', message: msg }, data: null, status: 400 }));
    await expect(mala.api.admin.guardarFormula({ producto_id: 'j1', nombre: 'Avena', rendimiento_piezas: 12, dias_curado: 28, instrucciones: null, activa: true, items: [] })).rejects.toThrow(msg);
  });

  it('getCostosFormulas, getMargenesProductos y getLotes leen sus vistas', async () => {
    const { api, llamadas } = apiCon((l) => {
      if (l.tabla === 'v_lotes') return { data: [LOTE] };
      if (l.tabla === 'v_margen_productos')
        return { data: [{ id: 'j1', nombre: 'Jabón', categoria: 'jabon', precio_venta: '120', costo_unitario: '18.5', margen: '101.5', margen_pct: '84.6', stock_actual: '7', piezas_en_curado: '12', vendidas_30d: 3 }] };
      return undefined;
    });
    const lotes = await api.admin.getLotes('en_curado');
    expect(lotes[0]).toMatchObject({ codigo: 'JAB-261002-01', dias_para_listo: -3, piezas_planeadas: 12 });
    const v = llamadas.find((l) => l.tabla === 'v_lotes');
    expect(ops(v, 'eq')).toEqual([['estado', 'en_curado']]);

    llamadas.length = 0;
    await api.admin.getLotes();
    expect(ops(llamadas[0], 'eq')).toEqual([]);
    await api.admin.getLotes(null);
    expect(ops(llamadas[1], 'eq')).toEqual([]);

    const [m] = await api.admin.getMargenesProductos();
    expect(m).toEqual({ id: 'j1', nombre: 'Jabón', categoria: 'jabon', precio_venta: 120, costo_unitario: 18.5, margen: 101.5, margen_pct: 84.6, stock_actual: 7, piezas_en_curado: 12, vendidas_30d: 3 });
    expect(await api.admin.getCostosFormulas()).toEqual([]);
  });

  it('registrarLote llama registrar_lote y devuelve el código, el costo y cuándo está listo', async () => {
    const { api, llamadas } = apiCon((l) =>
      l.rpc === 'registrar_lote'
        ? { data: { id: 'l9', codigo: 'JAB-261102-01', costo_materiales: '222.00', costo_unitario: '18.5000', listo_desde: '2026-11-30', estado: 'en_curado' } }
        : undefined,
    );
    const r = await api.admin.registrarLote({ producto_id: 'j1', formula_id: 'f1', piezas: 12, notas: ' Primer lote ' });
    expect(r).toEqual({ id: 'l9', codigo: 'JAB-261102-01', costo_materiales: 222, costo_unitario: 18.5, listo_desde: '2026-11-30', estado: 'en_curado' });
    expect(llamadas[0].args).toEqual({
      p_producto_id: 'j1',
      p_formula_id: 'f1',
      p_piezas: 12,
      p_elaborado_en: null,
      p_caduca_en: null,
      p_notas: 'Primer lote',
      p_items: null,
    });

    // Con lo que realmente se usó y fechas
    llamadas.length = 0;
    await api.admin.registrarLote({
      producto_id: 'v1',
      piezas: null,
      elaborado_en: '2026-11-01',
      caduca_en: '2027-11-01',
      items: [{ insumo_id: 'soya', cantidad: 900 }],
    });
    expect(llamadas[0].args).toEqual({
      p_producto_id: 'v1',
      p_formula_id: null,
      p_piezas: null,
      p_elaborado_en: '2026-11-01',
      p_caduca_en: '2027-11-01',
      p_notas: null,
      p_items: [{ insumo_id: 'soya', cantidad: 900 }],
    });

    const msg = 'No alcanza el inventario de Aceite de oliva: hay 200 ml y se necesitan 500 ml.';
    const mala = apiCon(() => ({ error: { code: 'P0001', message: msg }, data: null, status: 400 }));
    await expect(mala.api.admin.registrarLote({ producto_id: 'j1', formula_id: 'f1', piezas: 12 })).rejects.toMatchObject({ message: msg, codigo: 'P0001' });
  });

  it('liberarLote (con p_forzar) y descartarLote', async () => {
    const { api, llamadas } = apiCon();
    await api.admin.liberarLote('l1');
    await api.admin.liberarLote('l1', 11, true);
    await api.admin.descartarLote('l2', '  Se cortó la mezcla ');
    expect(llamadas.map((l) => [l.rpc, l.args])).toEqual([
      ['liberar_lote', { p_lote_id: 'l1', p_piezas_obtenidas: null, p_forzar: false }],
      ['liberar_lote', { p_lote_id: 'l1', p_piezas_obtenidas: 11, p_forzar: true }],
      ['descartar_lote', { p_lote_id: 'l2', p_motivo: 'Se cortó la mezcla' }],
    ]);

    const msg = 'Este lote sigue en curado hasta el 30 de noviembre de 2026.';
    const curado = apiCon(() => ({ error: { code: 'P0001', message: msg }, data: null, status: 400 }));
    await expect(curado.api.admin.liberarLote('l1')).rejects.toThrow(msg);
  });

  it('getResumenHoy: pedidos por entregar y lotes listos para liberar', async () => {
    const { api, llamadas } = apiCon(
      (l) => {
        if (l.rpc === 'es_admin') return { data: false };
        if (l.tabla === 'v_pedidos_detalle') return { data: null, count: 4 };
        if (l.tabla === 'v_lotes') return { data: [LOTE] };
        return undefined;
      },
      { ahora: () => AHORA },
    );
    const r = await api.admin.getResumenHoy();
    expect(r.pedidos_por_entregar).toBe(4);
    expect(r.lotes_listos).toEqual([aLote(LOTE)]);

    const pe = llamadas.find((l) => l.tabla === 'v_pedidos_detalle');
    expect(ops(pe, 'select')).toEqual([['id', { count: 'exact', head: true }]]);
    expect(ops(pe, 'eq')).toEqual([
      ['estado', 'pagado'],
      ['tiene_productos', true],
    ]);
    expect(ops(pe, 'is')).toEqual([['entregado_en', null]]);

    const lo = llamadas.find((l) => l.tabla === 'v_lotes');
    expect(ops(lo, 'eq')).toEqual([['estado', 'en_curado']]);
    expect(ops(lo, 'lte')).toEqual([['dias_para_listo', 0]]);
  });
});

// ---------------------------------------------------------------------------
// GRANT por columnas y tablas que anon no lee (ESPEC §5.1, migración 1100_seguridad)
// ---------------------------------------------------------------------------

describe('el adaptador respeta los permisos por columna de la base', () => {
  /** Columnas que la sesión (authenticated) ya no puede leer. */
  const NO_LEGIBLES: Record<string, string[]> = {
    clientes: ['notas_internas'],
    citas: ['notas_internas', 'creada_por'],
    pagos: ['recibido_por', 'notas'],
  };
  /** Tablas que anon no lee: el sitio público usa personal_publico y capacitaciones_publicas. */
  const SOLO_CON_SESION = ['personal', 'capacitaciones', 'horarios', 'cabinas', 'personal_servicios'];

  /** Columnas de primer nivel de un select de PostgREST ('a, b, rel(c, d)' → ['a', 'b', 'rel']). */
  function columnas(sel: string): string[] {
    let nivel = 0;
    let actual = '';
    const r: string[] = [];
    for (const ch of sel) {
      if (ch === '(') nivel++;
      if (ch === ')') nivel--;
      if (ch === ',' && nivel === 0) {
        r.push(actual.trim());
        actual = '';
      } else if (nivel === 0 && ch !== ')') actual += ch;
    }
    r.push(actual.trim());
    return r.map((c) => c.replace(/^.*:/, '').replace(/::.*$/, '').trim()).filter(Boolean);
  }

  const FIRMA = { nombre_firmante: 'Mariana López', firma_svg: '<svg/>' };

  function publicas(api: OpaloApi): (() => Promise<unknown>)[] {
    return [
      () => api.getConfiguracion(),
      () => api.getCatalogo(),
      () => api.getEquipo(),
      () => api.getPoliticasVigentes(),
      () => api.getContraindicaciones(),
      () => api.getProductosTienda(),
      () => api.getHorariosDisponibles('2026-11-03', 60),
      () => api.getDuracionReserva([{ servicio_id: 's1' }]),
    ];
  }

  function todas(api: OpaloApi): (() => Promise<unknown>)[] {
    const a = api.admin;
    return [
      ...publicas(api),
      () => api.getCatalogo({ incluirInactivos: true }),
      () => api.getSesion(),
      () =>
        api.actualizarMisDatos({ nombre: 'Mariana', apellidos: null, telefono: null, fecha_nacimiento: '1995-04-12', acepta_promociones: true }),
      () => api.getMiFicha(),
      () => api.getMisAceptaciones(),
      () => api.reservarCita({ items: [{ servicio_id: 's1' }], inicio: '2026-11-03T16:00:00Z', firma: FIRMA }),
      () => api.getMisCitas(),
      () => api.firmarConsentimientoCita('c1', FIRMA),
      () => api.getMisPedidos(),
      () => api.getMisCreditos(),
      () => api.getMisConsentimientos(),
      () => a.getResumenHoy(),
      () => a.getAgenda('2026-11-02', '2026-11-08'),
      () => a.getBloqueos('2026-11-02', '2026-11-08'),
      () => a.guardarBloqueo({ personal_id: null, inicio: '2026-11-02T16:00:00Z', fin: '2026-11-02T18:00:00Z', motivo: 'Junta' }),
      () => a.guardarBloqueo({ id: 'b1', personal_id: null, inicio: '2026-11-02T16:00:00Z', fin: '2026-11-02T18:00:00Z', motivo: null }),
      () => a.eliminarBloqueo('b1'),
      () => a.getClientes(),
      () => a.getClientes('mari'),
      () => a.getExpediente(CLIENTE_ID),
      () => a.crearCliente({ nombre: 'Sofía', apellidos: null, telefono: '4420000000', email: null, fecha_nacimiento: null, notas_internas: 'WhatsApp' }),
      () => a.guardarNotasCliente(CLIENTE_ID, 'Piel sensible'),
      () => a.getPedidos(),
      () => a.getPedidos('pendiente_pago'),
      () => a.getProductos(),
      () =>
        a.guardarProducto({
          id: 'x1',
          nombre: 'Cera',
          marca: null,
          categoria: 'cera',
          unidad_medida: 'g',
          presentacion: null,
          contenido_presentacion: 800,
          costo_presentacion: 400,
          stock_minimo: 200,
          proveedor_id: null,
          uso: 'cabina',
          precio_venta: null,
          vendible_en_linea: false,
          activo: true,
          notas: null,
          ...FICHA_VACIA,
        }),
      () => a.getReposicion(),
      () => a.getMovimientos('x1', 10),
      () => a.getProveedores(),
      () => a.guardarProveedor({ nombre: 'Proveedor', contacto: null, telefono: null, email: null, ciudad: null, notas: null, activo: true }),
      () => a.getReceta('s1'),
      () => a.getCostosServicios(),
      () => a.getCategoriasGasto(),
      () => a.getGastos('2026-10-01', '2026-10-31'),
      () =>
        a.guardarGasto({
          categoria_id: 'g1',
          concepto: 'Luz',
          monto: 800,
          fecha: '2026-10-08',
          metodo_pago: null,
          proveedor: null,
          comprobante_url: null,
          recurrente_id: null,
          notas: null,
        }),
      () => a.eliminarGasto('gx'),
      () => a.getGastosRecurrentes(),
      () =>
        a.guardarGastoRecurrente({
          categoria_id: 'g1',
          concepto: 'Renta',
          monto_estimado: 9000,
          frecuencia: 'mensual',
          dia_pago: 5,
          proximo_vencimiento: null,
          activo: true,
          notas: null,
        }),
      () => a.getGastosPorVencer(),
      () => a.getResultados(3),
      () =>
        a.guardarServicio({
          categoria_id: 'c1',
          slug: 'cejas',
          nombre: 'Cejas',
          descripcion: null,
          zonas_incluye: null,
          duracion_min: null,
          duracion_primera_vez_min: null,
          precio: 130,
          etapa: 'disponible',
          es_complemento: false,
          reservable_en_linea: true,
          vendible_en_linea: true,
          tipo_consentimiento: null,
          activo: true,
          orden: 1,
        }),
      () => a.getPersonal(),
      () =>
        a.guardarPersonal({
          slug: 'ana',
          nombre: 'Ana',
          titulo: null,
          bio: null,
          foto_url: null,
          color_agenda: '#5C6B3F',
          activo: true,
          mostrar_en_sitio: true,
          orden: 1,
        }),
      () =>
        a.guardarCapacitacion({
          personal_id: 'a',
          nombre: 'Cera tibia',
          institucion: null,
          tipo: 'curso',
          fecha: null,
          horas: null,
          constancia_url: null,
          mostrar_en_sitio: true,
          notas: null,
        }),
      () => a.eliminarCapacitacion('k1'),
      () => a.getPoliticasTodas(),
      () => api.reservarCita({ items: [{ servicio_id: 's1' }], inicio: '2026-11-03T16:00:00Z' }),
      () => a.getFormulas(),
      () => a.guardarFormula({ producto_id: 'j1', nombre: 'Jabón de avena', rendimiento_piezas: 12, dias_curado: 28, instrucciones: null, activa: true, items: [{ insumo_id: 'aceite', cantidad: 500 }] }),
      () => a.getCostosFormulas(),
      () => a.getLotes(),
      () => a.getLotes('en_curado'),
      () => a.registrarLote({ producto_id: 'j1', formula_id: 'f1', piezas: 12 }),
      () => a.liberarLote('l1'),
      () => a.descartarLote('l1', 'Se cortó la mezcla'),
      () => a.getMargenesProductos(),
      () => a.ventaMostrador({ items: [{ tipo: 'producto', id: 'j1', cantidad: 1 }], metodo: 'efectivo' }),
      () => a.marcarEntregado('pe1'),
    ];
  }

  async function recorrer(pasos: (() => Promise<unknown>)[]) {
    for (const paso of pasos) {
      try {
        await paso();
      } catch {
        // El cliente simulado no siempre devuelve datos completos: aquí sólo importan las consultas.
      }
    }
  }

  it('ningún select pide * (ni select() vacío) ni columnas sin SELECT para la sesión', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { api, llamadas, estado } = apiCon(responderSesion('admin'));
    estado.sesion = SESION;
    await recorrer(todas(api));
    const selects = llamadas.flatMap((l) => ops(l, 'select').map((a) => ({ tabla: l.tabla ?? '', sel: typeof a[0] === 'string' ? a[0] : '' })));
    expect(selects.length).toBeGreaterThan(40);
    for (const { tabla, sel } of selects) {
      expect(sel.trim(), `select vacío en ${tabla}`).not.toBe('');
      expect(sel, `select con * en ${tabla}`).not.toContain('*');
      const prohibidas = NO_LEGIBLES[tabla] ?? [];
      for (const c of columnas(sel)) expect(prohibidas, `${tabla}.${c} no tiene SELECT para authenticated`).not.toContain(c);
    }
  });

  it('las vistas internas se piden con las columnas exactas de ESPEC §7', async () => {
    const { api, llamadas, estado } = apiCon(responderSesion('admin', (l) => (l.rpc === 'es_admin' ? { data: true } : undefined)));
    estado.sesion = SESION;
    await recorrer(todas(api));
    // Los conteos (head: true) sólo piden 'id'; las filas se piden con las columnas exactas.
    const esConteo = (a: unknown[]) => !!(a[1] as { head?: boolean } | undefined)?.head;
    const conteos = llamadas.flatMap((l) => ops(l, 'select').filter(esConteo).map((a) => `${l.tabla}:${String(a[0])}`));
    expect(conteos.every((c) => c.endsWith(':id')), conteos.join(' | ')).toBe(true);
    const pedidas = (tabla: string) =>
      new Set(
        llamadas
          .filter((l) => l.tabla === tabla)
          .flatMap((l) => ops(l, 'select').filter((a) => !esConteo(a)).map((a) => String(a[0]))),
      );
    expect([...pedidas('v_clientes_resumen')]).toEqual([
      'id, nombre, apellidos, telefono, email, fecha_nacimiento, tiene_cuenta, citas_completadas, ultima_visita, proxima_cita, total_pagado, creado_en, es_personal',
    ]);
    expect([...pedidas('v_clientes_notas')]).toEqual(['id, notas_internas']);
    expect([...pedidas('v_reposicion')]).toEqual([
      'id, nombre, marca, unidad_medida, stock_actual, stock_minimo, faltante, presentacion, contenido_presentacion, presentaciones_sugeridas, costo_estimado, proveedor_nombre',
    ]);
    for (const v of ['v_citas_detalle', 'v_pedidos_detalle', 'v_creditos', 'v_costo_servicio', 'v_gastos_por_vencer', 'v_resultado_mensual'])
      expect(pedidas(v).size, v).toBe(1);
    // ESPEC §10
    expect([...pedidas('v_pedidos_detalle')][0]).toContain('origen, entregado_en, tiene_productos');
    expect([...pedidas('v_resultado_mensual')][0]).toContain('costo_ventas, mermas');
    expect([...pedidas('v_lotes')]).toEqual([
      'id, codigo, producto_id, producto_nombre, categoria, formula_nombre, elaborado_en, listo_desde, dias_para_listo, caduca_en, piezas_planeadas, piezas_obtenidas, costo_materiales, costo_unitario, estado, liberado_en, notas',
    ]);
    expect([...pedidas('v_costo_formulas')]).toEqual([
      'formula_id, producto_id, producto_nombre, nombre, rendimiento_piezas, dias_curado, costo_lote, costo_pieza, precio_venta, margen_pieza, margen_pct, insumos',
    ]);
    expect([...pedidas('v_margen_productos')]).toEqual([
      'id, nombre, categoria, precio_venta, costo_unitario, margen, margen_pct, stock_actual, piezas_en_curado, vendidas_30d',
    ]);
    expect([...pedidas('productos_tienda')]).toEqual([
      'id, slug, nombre, categoria, marca, presentacion, descripcion, aroma, ingredientes, modo_uso, advertencias, contenido_neto, foto_url, color_hex, destacado, hecho_en_opalo, precio_venta, stock_disponible, hay_stock, proximo_lote_listo',
    ]);
    expect([...pedidas('formulas')]).toEqual([
      'id, producto_id, nombre, rendimiento_piezas, dias_curado, instrucciones, activa, formula_items(insumo_id, cantidad)',
    ]);
  });

  it('lo público no lee tablas que anon no puede leer', async () => {
    const { api, llamadas } = apiCon();
    await recorrer(publicas(api));
    expect(llamadas.length).toBeGreaterThan(5);
    expect(llamadas.filter((l) => l.tabla && SOLO_CON_SESION.includes(l.tabla)).map((l) => l.tabla)).toEqual([]);
    expect(llamadas.filter((l) => l.tabla?.startsWith('v_'))).toEqual([]);
  });
});
