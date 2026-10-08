// Pruebas del adaptador de Supabase con un cliente simulado (sin red ni base real).
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isoDesdeLocal } from '../format';
import { crearApiSupabaseCon } from './supabase';
import { coincideBusqueda, filtroBusquedaClientes, primerVencimiento, slugLimpio } from './supabase/admin';
import {
  aCitaDetalle,
  aCredito,
  aFichaSalud,
  aPedidoDetalle,
  aProducto,
  completarMeses,
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
    expect(r).toEqual({ citas_hoy: [], por_revisar: 3, reposicion: [], gastos_por_vencer: [], mes_actual: null, pedidos_pendientes: 2 });
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
    });
    const [datos] = ops(llamadas[0], 'insert')[0] as [Record<string, unknown>];
    expect(datos).not.toHaveProperty('stock_actual');
    expect(datos).not.toHaveProperty('costo_unitario');
    expect(p.costo_unitario).toBe(0.5);
  });

  it('guardarPaquete hace upsert del paquete y reemplaza paquete_servicios', async () => {
    const { api, llamadas } = apiCon((l) => (l.tabla === 'paquetes' ? { data: { id: 'p1' } } : undefined));
    await api.admin.guardarPaquete({
      id: 'p1',
      slug: '',
      nombre: 'Combo Piernas y Axila',
      descripcion: null,
      tipo: 'combo',
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
    });
    const paq = llamadas.find((l) => l.tabla === 'paquetes');
    expect(ops(paq, 'update')[0][0]).toMatchObject({ slug: 'combo-piernas-y-axila', precio: 500 });
    const [ups, del] = llamadas.filter((l) => l.tabla === 'paquete_servicios');
    expect(ops(ups, 'upsert')[0]).toEqual([
      [
        { paquete_id: 'p1', servicio_id: 's1', cantidad: 2 },
        { paquete_id: 'p1', servicio_id: 's2', cantidad: 1 },
      ],
      { onConflict: 'paquete_id,servicio_id' },
    ]);
    expect(ops(del, 'delete')).toHaveLength(1);
    expect(ops(del, 'not')).toEqual([['servicio_id', 'in', '(s1,s2)']]);
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

  it('guardarHorarios inserta los nuevos y luego borra los anteriores', async () => {
    const { api, llamadas } = apiCon((l) =>
      l.tabla === 'horarios' && ops(l, 'select').length ? { data: [{ id: 'h-viejo' }] } : undefined,
    );
    await api.admin.guardarHorarios('a', [{ dia_semana: 2, hora_inicio: '10:00:00', hora_fin: '19:00' }]);
    const hs = llamadas.filter((l) => l.tabla === 'horarios');
    expect(ops(hs[1], 'insert')[0][0]).toEqual([{ personal_id: 'a', dia_semana: 2, hora_inicio: '10:00', hora_fin: '19:00' }]);
    expect(ops(hs[2], 'in')).toEqual([['id', ['h-viejo']]]);
    await expect(api.admin.guardarHorarios('a', [{ dia_semana: 2, hora_inicio: '19:00', hora_fin: '10:00' }])).rejects.toThrow(
      'La hora de salida debe ser después de la de entrada.',
    );
  });

  it('guardarHorarios conserva los rangos que no cambian y limpia los repetidos', async () => {
    const previos = [
      { id: 'h-mar', dia_semana: 2, hora_inicio: '10:00:00', hora_fin: '19:00:00' },
      { id: 'h-mar-copia', dia_semana: 2, hora_inicio: '10:00:00', hora_fin: '19:00:00' },
      { id: 'h-mie', dia_semana: 3, hora_inicio: '10:00:00', hora_fin: '19:00:00' },
    ];
    const { api, llamadas } = apiCon((l) => (l.tabla === 'horarios' && ops(l, 'select').length ? { data: previos } : undefined));
    await api.admin.guardarHorarios('a', [
      { dia_semana: 2, hora_inicio: '10:00', hora_fin: '19:00' },
      { dia_semana: 3, hora_inicio: '10:00', hora_fin: '18:00' },
      { dia_semana: 3, hora_inicio: '10:00', hora_fin: '18:00' },
    ]);
    const hs = llamadas.filter((l) => l.tabla === 'horarios');
    expect(hs).toHaveLength(3);
    expect(ops(hs[1], 'insert')[0][0]).toEqual([{ personal_id: 'a', dia_semana: 3, hora_inicio: '10:00', hora_fin: '18:00' }]);
    expect(ops(hs[2], 'in')).toEqual([['id', ['h-mar-copia', 'h-mie']]]);

    // Sin cambios: no se escribe nada.
    const sinCambios = apiCon((l) => (l.tabla === 'horarios' && ops(l, 'select').length ? { data: previos.slice(0, 1) } : undefined));
    await sinCambios.api.admin.guardarHorarios('a', [{ dia_semana: 2, hora_inicio: '10:00', hora_fin: '19:00' }]);
    expect(sinCambios.llamadas).toHaveLength(1);
  });

  describe('guardados de varios pasos que fallan a medias', () => {
    const SIN_RED = () => {
      throw new TypeError('Failed to fetch');
    };
    const A_MEDIAS = 'Solo se guardó una parte de los cambios: vuelve a guardar para completarlos.';
    const PAQUETE = {
      slug: 'combo',
      nombre: 'Combo',
      descripcion: null,
      tipo: 'combo' as const,
      precio: 500,
      duracion_min: null,
      vigencia_dias: null,
      activo: true,
      orden: 1,
      items: [{ servicio_id: 's1', cantidad: 1 }],
    };
    const esBorrado = (l: Llamada) => ops(l, 'delete').length > 0;
    const esUpsert = (l: Llamada) => ops(l, 'upsert').length > 0;

    it('guardarHorarios: si no se pudieron quitar los rangos viejos, pide volver a guardar', async () => {
      const { api } = apiCon((l) => {
        if (l.tabla !== 'horarios') return undefined;
        if (ops(l, 'select').length) return { data: [{ id: 'h-viejo', dia_semana: 2, hora_inicio: '10:00:00', hora_fin: '19:00:00' }] };
        if (esBorrado(l)) SIN_RED();
        return undefined;
      });
      const e = await api.admin.guardarHorarios('a', [{ dia_semana: 2, hora_inicio: '10:00', hora_fin: '18:00' }]).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ErrorOpalo);
      expect((e as ErrorOpalo).message).toBe(`${M.red} ${A_MEDIAS}`);
      expect((e as ErrorOpalo).codigo).toBe('red');
    });

    it('guardarHorarios: si sólo había que borrar, el error es el de siempre', async () => {
      const { api } = apiCon((l) => {
        if (l.tabla !== 'horarios') return undefined;
        if (ops(l, 'select').length) return { data: [{ id: 'h-viejo', dia_semana: 2, hora_inicio: '10:00:00', hora_fin: '19:00:00' }] };
        return SIN_RED();
      });
      await expect(api.admin.guardarHorarios('a', [])).rejects.toThrow(new ErrorOpalo(M.red));
    });

    it('guardarReceta: si falla el borrado de lo que sobra, pide volver a guardar', async () => {
      const { api } = apiCon((l) => (l.tabla === 'recetas_servicio' && esBorrado(l) ? SIN_RED() : undefined));
      await expect(api.admin.guardarReceta('s1', [{ producto_id: 'cera', cantidad: 20, notas: null }])).rejects.toThrow(`${M.red} ${A_MEDIAS}`);
      const vacia = apiCon((l) => (l.tabla === 'recetas_servicio' ? SIN_RED() : undefined));
      await expect(vacia.api.admin.guardarReceta('s1', [])).rejects.toThrow(new ErrorOpalo(M.red));
    });

    it('guardarPaquete (edición): si fallan los servicios o el borrado, pide volver a guardar', async () => {
      for (const falla of [esUpsert, esBorrado]) {
        const { api } = apiCon((l) => {
          if (l.tabla === 'paquetes') return { data: { id: 'p1' } };
          if (l.tabla === 'paquete_servicios' && falla(l)) return SIN_RED();
          return undefined;
        });
        await expect(api.admin.guardarPaquete({ ...PAQUETE, id: 'p1' })).rejects.toThrow(`${M.red} ${A_MEDIAS}`);
      }
    });

    it('guardarPaquete (nuevo): si fallan los servicios, quita el paquete recién creado', async () => {
      const { api, llamadas } = apiCon((l) => {
        if (l.tabla === 'paquetes' && !esBorrado(l)) return { data: { id: 'p-nuevo' } };
        if (l.tabla === 'paquete_servicios') return { error: { code: '23503', message: 'insert or update violates foreign key constraint' }, status: 409 };
        return undefined;
      });
      await expect(api.admin.guardarPaquete(PAQUETE)).rejects.toThrow(new ErrorOpalo('Uno de los datos elegidos ya no existe.'));
      const quitar = llamadas.find((l) => l.tabla === 'paquetes' && esBorrado(l));
      expect(ops(quitar, 'eq')).toEqual([['id', 'p-nuevo']]);
      expect(llamadas.filter((l) => l.tabla === 'paquete_servicios')).toHaveLength(1);
    });

    it('guardarPaquete (nuevo): si tampoco se puede quitar, explica cómo terminarlo', async () => {
      const { api } = apiCon((l) => {
        if (l.tabla === 'paquetes' && !esBorrado(l)) return { data: { id: 'p-nuevo' } };
        return SIN_RED();
      });
      await expect(api.admin.guardarPaquete(PAQUETE)).rejects.toThrow(
        `${M.red} El paquete se creó sin sus servicios: cierra este formulario, ábrelo desde la lista y vuelve a guardar.`,
      );
    });

    it('guardarPaquete (nuevo): no hay borrado de servicios sobrantes', async () => {
      const { api, llamadas } = apiCon((l) => (l.tabla === 'paquetes' ? { data: { id: 'p-nuevo' } } : undefined));
      await api.admin.guardarPaquete(PAQUETE);
      expect(llamadas.filter((l) => l.tabla === 'paquete_servicios').map((l) => l.ops[0][0])).toEqual(['upsert']);
    });
  });

  it('getClientes filtra en el servidor y afina sin acentos en el navegador', async () => {
    const { api, llamadas } = apiCon((l) =>
      l.tabla === 'v_clientes_resumen'
        ? {
            data: [
              { id: '1', nombre: 'María', apellidos: 'Peña', telefono: null, email: null, citas_completadas: '2', total_pagado: '300.00', creado_en: '2026-10-01T00:00:00Z' },
              { id: '2', nombre: 'Marco', apellidos: null, telefono: null, email: null, creado_en: '2026-10-01T00:00:00Z' },
            ],
          }
        : undefined,
    );
    const r = await api.admin.getClientes('maria');
    expect(r.map((c) => c.id)).toEqual(['1']);
    expect(r[0]).toMatchObject({ citas_completadas: 2, total_pagado: 300 });
    expect(ops(llamadas[0], 'or')[0][0]).toContain('nombre.ilike.*m_r__*');
  });
});
