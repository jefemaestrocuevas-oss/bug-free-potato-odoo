import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearApiDemo, FUENTES_DEMO } from './demo';
import { CUENTAS_DEMO, PASSWORD_DEMO } from './cuentasDemo';
import { crearApiDemoCon } from './demo/api';
import type { FuentesDemo } from './demo/modelo';
import type { Ctx } from './demo/permisos';
import * as R from './demo/reglas';
import { FIRMA_EJEMPLO, sembrar } from './demo/sembrado';
import { FICHA_VACIA } from './demo/sembradoTaller';
import { cantidadLegible, fechaLegible, firmaValida, sha256, slugDe } from './demo/utilidades';
import { fechaLocal, isoDesdeLocal, sumarDias } from '../format';
import {
  CATEGORIAS_TIENDA,
  POLITICAS_GENERALES,
  type DatosFirma,
  type ItemPedidoNuevo,
  type MetodoPago,
  type OpaloApi,
  type PaqueteEditable,
  type ProductoEditable,
  type Rol,
} from './tipos';

// Lunes 2 de noviembre de 2026, 12:00 en Querétaro. El horario cargado es mar–vie 10–19 y sáb 9–15.
const LUNES = '2026-11-02';
const MARTES = '2026-11-03';
const MIERCOLES = '2026-11-04';
const AHORA = new Date(isoDesdeLocal(LUNES, '12:00'));

const M = {
  sesion: 'Inicia sesión para continuar.',
  politicas: 'Antes de reservar necesitas aceptar los términos, el aviso de privacidad y la política de cancelación.',
  ficha: 'Antes de reservar necesitas llenar tu ficha de salud.',
  datosSensibles: 'Para guardar tu ficha de salud necesitamos tu consentimiento expreso para tratar datos de salud.',
  edad: 'Atendemos a partir de los 15 años.',
  tutor: 'Por ser menor de edad, escribe el nombre de mamá, papá o tutor que te acompañará.',
  firma: 'Falta tu firma o tu nombre completo.',
  ocupado: 'Ese horario se acaba de ocupar, elige otro.',
  noDisponible: 'Ese horario no está disponible.',
  noReservable: 'Uno de los servicios elegidos no se puede reservar en línea.',
  complementos: 'Los complementos se agregan a un servicio; elige al menos un servicio.',
  sinServicios: 'Elige al menos un servicio.',
  tarde: 'Faltan menos de 24 horas para tu cita. Escríbenos por WhatsApp al 442 170 1466.',
  noCancelable: 'Esta cita ya no se puede cancelar.',
  sinConsentimiento: 'Sin consentimiento firmado no hay servicio: pide a la clienta que firme primero.',
  noVendible: 'Uno de los productos ya no está disponible para compra en línea.',
  credito: 'Ese crédito no es válido o ya se usó.',
  regalo: 'Ese código de regalo no existe o ya se canjeó.',
  permiso: 'No tienes permiso para hacer esto.',
  // Endurecimiento (ESPEC §5.1)
  nacimientoReservar: 'Para reservar necesitamos tu fecha de nacimiento.',
  nacimientoFirmar: 'Para firmar necesitamos tu fecha de nacimiento.',
  maxCitas: 'Ya tienes 3 citas próximas; para agendar otra escríbenos por WhatsApp al 442 170 1466.',
  maxPedidos: 'Tienes 5 pedidos por pagar; págalos o cancela alguno antes de hacer otro.',
  metodoPago: 'Elige efectivo, tarjeta o transferencia.',
  firmaInvalida: 'No pudimos leer tu firma; bórrala y vuelve a firmar.',
  nombreLargo: 'El nombre es muy largo; escríbelo en máximo 200 caracteres.',
  notasLargas: 'Las notas son muy largas; escríbelas en máximo 1000 caracteres.',
  nacimientoRegistrado: 'Tu fecha de nacimiento ya está registrada; si hay un error, escríbenos por WhatsApp al 442 170 1466.',
  servicioSinConsentimiento: 'Elige qué consentimiento firma la clienta para este servicio.',
  noAsistio: 'Esta cita se marcó como no asistió.',
  fichaLarga: 'Tu ficha de salud es muy larga; resume cada respuesta en máximo 2000 caracteres.',
  cantidad: 'Revisa las cantidades.',
  cantidadMinima: 'La cantidad debe ser al menos 1.',
  regaloLargo: 'El nombre de quien recibe el regalo es muy largo (máximo 120 caracteres).',
  // ESPEC §9 y §10
  firmaEnSpa: 'La firma se hace en el spa, el día de tu cita.',
  noALaVenta: 'Uno de los productos ya no está a la venta.',
  serviciosSinClienta: 'Para vender servicios prepagados elige a la clienta.',
  jabonSinFormula: 'Los jabones necesitan una fórmula con sus días de curado; elígela o créala primero.',
};

const FIRMA: DatosFirma = {
  nombre_firmante: 'Mariana López',
  firma_svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200"><path d="M10 10 L50 60"/></svg>',
};

/** Fuentes del catálogo real con configuracion.firma_en_linea cambiada (el catálogo trae false, ESPEC §9). */
function fuentesConFirma(firmaEnLinea: boolean): FuentesDemo {
  return { ...FUENTES_DEMO, catalogo: { ...FUENTES_DEMO.catalogo, configuracion: { ...FUENTES_DEMO.catalogo.configuracion, firma_en_linea: firmaEnLinea } } };
}

/**
 * API de demostración para pruebas. Por defecto usa la configuración real del catálogo (firma en cabina);
 * `firmaEnLinea: true` vuelve al comportamiento anterior (la clienta firma al reservar o desde su portal).
 */
function entorno(
  op: { ahora?: Date; ejemplos?: boolean; firmaEnLinea?: boolean; almacenamiento?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null } = {},
) {
  let ahora = op.ahora ?? AHORA;
  const opciones = {
    latenciaMs: 0,
    almacenamiento: op.almacenamiento ?? null,
    ahora: () => ahora,
    datosEjemplo: op.ejemplos ?? false,
  };
  const api = op.firmaEnLinea === undefined ? crearApiDemo(opciones) : crearApiDemoCon(fuentesConFirma(op.firmaEnLinea), opciones);
  return {
    api,
    fijarHora(d: Date) {
      ahora = d;
    },
  };
}

const emailDe = (rol: Rol) => CUENTAS_DEMO.find((c) => c.rol === rol)!.email;

async function entrar(api: OpaloApi, rol: Rol) {
  await api.cerrarSesion();
  return api.iniciarSesion(emailDe(rol), PASSWORD_DEMO);
}

async function servicio(api: OpaloApi, slug: string) {
  const cat = await api.getCatalogo({ incluirInactivos: true });
  const s = cat.servicios.find((x) => x.slug === slug);
  if (!s) throw new Error(`No existe ${slug}`);
  return s;
}

async function paquete(api: OpaloApi, slug: string) {
  const cat = await api.getCatalogo({ incluirInactivos: true });
  return cat.paquetes.find((x) => x.slug === slug)!;
}

async function aceptarGenerales(api: OpaloApi) {
  const pols = await api.getPoliticasVigentes();
  await api.aceptarPoliticas(pols.filter((p) => POLITICAS_GENERALES.includes(p.tipo)).map((p) => p.id));
}

async function fichaCon(api: OpaloApi, marcadas: string[] = [], acepta = true) {
  const contras = await api.getContraindicaciones();
  await api.guardarFicha({
    respuestas: Object.fromEntries(contras.map((c) => [c.clave, marcadas.includes(c.clave)])),
    detalles: {},
    alergias: null,
    medicamentos: null,
    observaciones: null,
    acepta_datos_sensibles: acepta,
  });
}

/** Clienta lista para reservar (políticas aceptadas y ficha). */
async function clientaLista(api: OpaloApi, marcadas: string[] = []) {
  await entrar(api, 'cliente');
  await aceptarGenerales(api);
  await fichaCon(api, marcadas);
}

/** Otra clienta registrada y lista para reservar (devuelve su sesión). */
async function otraClienta(api: OpaloApi, email = 'otra@ejemplo.mx', fecha_nacimiento: string | null = '1990-01-01') {
  await api.cerrarSesion();
  const sesion = await api.registrarse({ email, password: 'secreta1', nombre: 'Otra', apellidos: 'Clienta', telefono: '4429999999', fecha_nacimiento });
  await aceptarGenerales(api);
  await fichaCon(api);
  return sesion!;
}

const a = (fecha: string, hhmm: string) => isoDesdeLocal(fecha, hhmm);

/** Producto de cabina sin ficha pública (para las pruebas de inventario). */
function productoDe(datos: Partial<ProductoEditable> & Pick<ProductoEditable, 'nombre'>): ProductoEditable {
  return {
    ...FICHA_VACIA,
    marca: null,
    categoria: 'cera',
    unidad_medida: 'g',
    presentacion: null,
    contenido_presentacion: 1,
    costo_presentacion: 0,
    stock_minimo: 0,
    proveedor_id: null,
    uso: 'cabina',
    precio_venta: null,
    vendible_en_linea: false,
    activo: true,
    notas: null,
    ...datos,
  };
}

/** Firma en la tablet de la cabina: entra el personal y firma (ESPEC §9). */
async function firmarEnCabina(api: OpaloApi, citaId: string, firma: DatosFirma = FIRMA) {
  await entrar(api, 'personal');
  await api.firmarConsentimientoCita(citaId, firma);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('utilidades', () => {
  it('sha256 coincide con SHA-256 real', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('Ópalo ñ 🌿'.repeat(30))).toBe('3d9d01ba32bb8ca9ef41b720d68f47d0c9d9e0a752216f293a23c099da4d196a');
  });

  it('siembra las seis políticas con título de la primera línea y hash', async () => {
    const { api } = entorno();
    const pols = await api.getPoliticasVigentes();
    expect(pols.map((p) => p.tipo)).toEqual([
      'terminos',
      'privacidad',
      'cancelacion',
      'consentimiento_depilacion',
      'consentimiento_facial',
      'consentimiento_corporal',
    ]);
    for (const p of pols) {
      expect(p.version).toBe(1);
      expect(p.titulo.length).toBeGreaterThan(3);
      expect(p.titulo.startsWith('#')).toBe(false);
      expect(p.hash_sha256).toBe(sha256(p.contenido_md));
    }
  });

  it('firmaValida acepta sólo un <svg> de trazos (como public.firma_valida)', () => {
    expect(firmaValida(FIRMA_EJEMPLO)).toBe(true); // mismo formato que PanelFirma
    expect(firmaValida(FIRMA.firma_svg)).toBe(true);
    expect(firmaValida('  <svg><g><polyline points="0 0 1 1"/><line x1="0"/><circle r="1"/></g></svg>\n')).toBe(true);
    for (const mala of [
      null,
      '',
      'hola',
      '<div><svg></svg></div>',
      '<svg><path d="M0 0"/></svg> y algo más',
      '<svg><script>alert(1)</script></svg>',
      '<svg onload="alert(1)"><path d="M0 0"/></svg>',
      '<svg><path d="M0 0" ONCLICK ="x()"/></svg>',
      '<svg><a href="https://ejemplo.mx"><path d="M0 0"/></a></svg>',
      '<svg><path xlink:href="#x" d="M0 0"/></svg>',
      '<svg><path style="fill: url(#x)" d="M0 0"/></svg>',
      '<svg><path d="javascript:alert(1)"/></svg>',
      '<svg><foreignObject/></svg>',
      `<svg><path d="${'M0 0 '.repeat(40_000)}"/></svg>`, // más de 200 000 caracteres
    ])
      expect(firmaValida(mala)).toBe(false);
  });

  it('documento_hash: misma fórmula que el trigger de SQL', () => {
    // Valor calculado en PostgreSQL con tg_consentimiento_hash (concat_ws('|', …) y firmado_en en UTC con microsegundos).
    expect(
      R.documentoHash({
        hash_politica: 'abc',
        cliente_id: 'c1',
        cita_id: null,
        ficha_salud_id: 'f1',
        nombre_firmante: 'Ana Pérez',
        tutor_nombre: null,
        es_menor: false,
        firma_svg: '<svg/>',
        firmado_en: '2026-11-02T18:00:00.123Z',
      }),
    ).toBe('c6db26485529531d167eb266ab5d975eec0c464f2f95723b3c385697c5e206cd');
  });
});

describe('R2 duración y R3 horarios disponibles', () => {
  it('martes de 10 a 19 da 9 sesiones de 1 hora; lunes no hay', async () => {
    const { api } = entorno();
    const martes = await api.getHorariosDisponibles(MARTES, 60);
    expect(martes).toHaveLength(9);
    expect(martes[0].inicio).toBe(a(MARTES, '10:00'));
    expect(martes[0].fin).toBe(a(MARTES, '11:00'));
    expect(martes[8].inicio).toBe(a(MARTES, '18:00'));
    expect(martes[0].personal_nombre).toBe('Especialista de Ópalo');
    expect(await api.getHorariosDisponibles(LUNES, 60)).toEqual([]);
  });

  it('una duración de 2 horas debe caber completa en el rango', async () => {
    const { api } = entorno();
    const slots = await api.getHorariosDisponibles(MARTES, 120);
    expect(slots).toHaveLength(8);
    expect(slots[slots.length - 1].inicio).toBe(a(MARTES, '17:00'));
  });

  it('respeta la anticipación mínima (2 h) con la hora real', async () => {
    const { api } = entorno({ ahora: new Date(a(MARTES, '11:30')) });
    const slots = await api.getHorariosDisponibles(MARTES, 60);
    expect(slots[0].inicio).toBe(a(MARTES, '14:00'));
    expect(slots).toHaveLength(5);
  });

  it('respeta la ventana de 60 días', async () => {
    const { api } = entorno();
    expect(await api.getHorariosDisponibles(sumarDias(LUNES, 60), 60)).not.toHaveLength(0); // viernes
    expect(await api.getHorariosDisponibles(sumarDias(LUNES, 61), 60)).toEqual([]); // sábado fuera de ventana
  });

  it('los bloqueos globales quitan horarios', async () => {
    const { api } = entorno();
    await entrar(api, 'admin');
    await api.admin.guardarBloqueo({ personal_id: null, inicio: a(MARTES, '10:00'), fin: a(MARTES, '12:00'), motivo: 'Junta' });
    const slots = await api.getHorariosDisponibles(MARTES, 60);
    expect(slots[0].inicio).toBe(a(MARTES, '12:00'));
    expect(await api.admin.getBloqueos(MARTES, MARTES)).toHaveLength(1);
  });

  it('duración: sesión estándar, redondeo al intervalo y paquetes', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    const axilas = await servicio(api, 'axilas');
    const shot = await servicio(api, 'shot-hidratante');
    expect(await api.getDuracionReserva([{ servicio_id: cejas.id }])).toBe(60);
    expect(await api.getDuracionReserva([{ servicio_id: cejas.id }, { servicio_id: axilas.id }, { servicio_id: shot.id }])).toBe(60);
    await entrar(api, 'admin');
    await api.admin.guardarServicio({ ...cejas, duracion_min: 50 });
    await api.admin.guardarServicio({ ...axilas, duracion_min: 40 });
    expect(await api.getDuracionReserva([{ servicio_id: cejas.id }, { servicio_id: axilas.id }])).toBe(120);
    const express = await paquete(api, 'express'); // cejas + axilas + bigote (null)
    expect(await api.getDuracionReserva([{ paquete_id: express.id }])).toBe(120);
  });
});

describe('R4 reservar', () => {
  it('reserva feliz (con firma en línea): confirmada, con consentimiento, precio del servidor y el horario se ocupa', async () => {
    const { api } = entorno({ firmaEnLinea: true });
    await clientaLista(api);
    const cejas = await servicio(api, 'cejas');
    const facial = await servicio(api, 'facial-hidratante');
    const r = await api.reservarCita({ items: [{ servicio_id: cejas.id }, { servicio_id: facial.id }], inicio: a(MARTES, '10:00'), firma: FIRMA });
    expect(r).toMatchObject({ estado: 'confirmada', requiere_revision: false, alertas: [] });

    const [cita] = await api.getMisCitas();
    expect(cita.total).toBe(870);
    expect(cita.duracion_min).toBe(60);
    expect(cita.primera_vez).toBe(true);
    expect(cita.personal_nombre).toBe('Especialista de Ópalo');
    expect(cita.cabina_nombre).toBe('Cabina 1');
    expect(cita.consentimientos_firmados).toBe(2); // depilación + facial
    const docs = await api.getMisConsentimientos();
    expect(docs.map((d) => d.politica_tipo).sort()).toEqual(['consentimiento_depilacion', 'consentimiento_facial']);
    expect(docs[0].documento_hash).toMatch(/^[0-9a-f]{64}$/);

    const slots = await api.getHorariosDisponibles(MARTES, 60);
    expect(slots.some((s) => s.inicio === a(MARTES, '10:00'))).toBe(false);
  });

  it('pide sesión, políticas, ficha y consentimiento para datos de salud (y la firma, si es en línea)', async () => {
    const { api } = entorno({ firmaEnLinea: true });
    const cejas = await servicio(api, 'cejas');
    const pedir = () => api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: FIRMA });
    await expect(pedir()).rejects.toThrow(M.sesion);
    await entrar(api, 'cliente');
    await expect(pedir()).rejects.toThrow(M.politicas);
    await aceptarGenerales(api);
    await expect(pedir()).rejects.toThrow(M.ficha);
    await expect(fichaCon(api, [], false)).rejects.toThrow(M.datosSensibles);
    await fichaCon(api);
    await expect(api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: { nombre_firmante: ' ', firma_svg: FIRMA.firma_svg } })).rejects.toThrow(M.firma);
    await expect(api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: { nombre_firmante: 'Mariana', firma_svg: '' } })).rejects.toThrow(M.firma);
    await expect(pedir()).resolves.toMatchObject({ estado: 'confirmada' });
  });

  it('edad mínima y tutor para menores (firma en línea)', async () => {
    const { api } = entorno({ firmaEnLinea: true });
    const cejas = await servicio(api, 'cejas');
    const pedir = (firma: DatosFirma) => api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma });
    await otraClienta(api, 'catorce@ejemplo.mx', '2012-01-01'); // 14 años
    await expect(pedir(FIRMA)).rejects.toThrow(M.edad);
    await otraClienta(api, 'dieciseis@ejemplo.mx', '2010-06-01'); // 16 años
    await expect(pedir(FIRMA)).rejects.toThrow(M.tutor);
    await expect(pedir({ ...FIRMA, tutor_nombre: 'Rosa López' })).resolves.toMatchObject({ estado: 'confirmada' });
    const [doc] = await api.getMisConsentimientos();
    expect(doc.tutor_nombre).toBe('Rosa López');
  });

  it('servicios: vacío, sólo complementos y no reservables', async () => {
    const { api } = entorno();
    await clientaLista(api);
    const shot = await servicio(api, 'shot-hidratante');
    const facial = await servicio(api, 'facial-hidratante');
    const inicio = a(MARTES, '10:00');
    await expect(api.reservarCita({ items: [], inicio, firma: FIRMA })).rejects.toThrow(M.sinServicios);
    await expect(api.reservarCita({ items: [{ servicio_id: shot.id }], inicio, firma: FIRMA })).rejects.toThrow(M.complementos);
    await expect(api.reservarCita({ items: [{ servicio_id: 'no-existe' }], inicio, firma: FIRMA })).rejects.toThrow(M.noReservable);
    await entrar(api, 'admin');
    await api.admin.guardarServicio({ ...facial, etapa: 'segunda_etapa' });
    await entrar(api, 'cliente');
    await expect(api.reservarCita({ items: [{ servicio_id: facial.id }, { servicio_id: shot.id }], inicio, firma: FIRMA })).rejects.toThrow(M.noReservable);
    const cejas = await servicio(api, 'cejas');
    await expect(api.reservarCita({ items: [{ servicio_id: cejas.id }, { servicio_id: shot.id }], inicio, firma: FIRMA })).resolves.toMatchObject({ estado: 'confirmada' });
  });

  it('horario ocupado vs. no disponible', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    await clientaLista(api);
    await api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: FIRMA });
    await otraClienta(api);
    const pedir = (inicio: string) => api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio, firma: FIRMA });
    await expect(pedir(a(MARTES, '10:00'))).rejects.toThrow(M.ocupado);
    await expect(pedir(a(LUNES, '15:00'))).rejects.toThrow(M.noDisponible); // lunes cerrado
    await expect(pedir(a(MARTES, '03:00'))).rejects.toThrow(M.noDisponible);
    await expect(pedir(a(MARTES, '10:30'))).rejects.toThrow(M.noDisponible); // fuera del intervalo
    await expect(pedir(a(LUNES, '13:00'))).rejects.toThrow(M.noDisponible); // pasado/anticipación
    await expect(pedir(a(MARTES, '11:00'))).resolves.toMatchObject({ estado: 'confirmada' });
    await entrar(api, 'personal');
    const clientes = await api.admin.getClientes('otra');
    await expect(
      api.admin.reservarParaCliente({ cliente_id: clientes[0].id, items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '11:00'), origen: 'whatsapp' }),
    ).rejects.toThrow(M.ocupado);
  });

  it('contraindicaciones: "revisar" deja la cita pendiente; "precaución" sólo avisa', async () => {
    const { api } = entorno();
    const facial = await servicio(api, 'facial-hidratante');
    await clientaLista(api, ['embarazo_lactancia']);
    const r = await api.reservarCita({ items: [{ servicio_id: facial.id }], inicio: a(MARTES, '10:00'), firma: FIRMA });
    expect(r.estado).toBe('pendiente');
    expect(r.requiere_revision).toBe(true);
    expect(r.alertas).toEqual(['¿Estás embarazada o en periodo de lactancia?']);

    await fichaCon(api, ['alergias_productos', 'diabetes']); // diabetes no aplica a faciales
    const r2 = await api.reservarCita({ items: [{ servicio_id: facial.id }], inicio: a(MARTES, '11:00'), firma: FIRMA });
    expect(r2.estado).toBe('confirmada');
    expect(r2.requiere_revision).toBe(false);
    expect(r2.alertas).toEqual([]); // como SQL: "precaución" no entra en las alertas de la cita
  });

  it('R13: una política nueva se debe volver a aceptar', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    await entrar(api, 'cliente');
    await expect(api.admin.publicarPolitica('terminos', 'Términos', '# Términos\n\nNuevo')).rejects.toThrow(M.permiso);
    await entrar(api, 'admin');
    await api.admin.publicarPolitica('terminos', 'Términos y condiciones v2', '# Términos y condiciones v2\n\nTexto nuevo.');
    const todas = await api.admin.getPoliticasTodas();
    const terminos = todas.filter((p) => p.tipo === 'terminos');
    expect(terminos.map((p) => [p.version, p.activa])).toEqual([
      [2, true],
      [1, false],
    ]);
    await entrar(api, 'cliente');
    const vigentes = await api.getPoliticasVigentes();
    const v1 = todas.find((p) => p.tipo === 'terminos' && p.version === 1)!;
    await api.aceptarPoliticas([v1.id, ...vigentes.filter((p) => p.tipo !== 'terminos' && POLITICAS_GENERALES.includes(p.tipo)).map((p) => p.id)]);
    await fichaCon(api);
    const pedir = () => api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: FIRMA });
    await expect(pedir()).rejects.toThrow(M.politicas);
    await aceptarGenerales(api);
    await expect(pedir()).resolves.toMatchObject({ estado: 'confirmada' });
  });
});

describe('R5 cancelar', () => {
  it('la clienta cancela con 24 h; después escribe por WhatsApp; el personal siempre puede', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    await clientaLista(api);
    const pronto = await api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: FIRMA }); // en 22 h
    const luego = await api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MIERCOLES, '12:00'), firma: FIRMA }); // en 48 h
    await expect(api.cancelarCita(pronto.id)).rejects.toThrow(M.tarde);
    await api.cancelarCita(luego.id, 'Me salió un viaje');
    await expect(api.cancelarCita(luego.id)).rejects.toThrow(M.noCancelable);

    await otraClienta(api);
    await expect(api.cancelarCita(pronto.id)).rejects.toThrow(M.permiso);

    await entrar(api, 'personal');
    await api.admin.cambiarEstadoCita(pronto.id, 'cancelada');
    const agenda = await api.admin.getAgenda(MARTES, MIERCOLES);
    expect(agenda.map((c) => c.estado)).toEqual(['cancelada', 'cancelada']);
    expect((await api.getHorariosDisponibles(MARTES, 60))[0].inicio).toBe(a(MARTES, '10:00'));
  });
});

describe('R6 consentimiento obligatorio y R7 completar', () => {
  it('sin firma no hay servicio; completar descuenta insumos una sola vez', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    const sesionClienta = await entrar(api, 'cliente');

    await entrar(api, 'personal');
    const cera = await api.admin.guardarProducto(
      productoDe({ nombre: 'Cera de prueba', presentacion: 'Lata 800 g', contenido_presentacion: 800, costo_presentacion: 400, stock_minimo: 100 }),
    );
    expect(cera.costo_unitario).toBe(0.5);
    expect(cera.slug).toBeNull(); // insumo de cabina: sin ficha en la tienda
    await api.admin.registrarCompra({ items: [{ producto_id: cera.id, presentaciones: 1, costo_presentacion: 480 }], folio: 'X1' });
    let [p] = await api.admin.getProductos();
    expect(p.stock_actual).toBe(800);
    expect(p.costo_presentacion).toBe(480); // último costo (R11)
    expect(p.costo_unitario).toBe(0.6);
    await api.admin.guardarReceta(cejas.id, [{ producto_id: cera.id, cantidad: 15 }]);
    const costo = (await api.admin.getCostosServicios()).find((c) => c.slug === 'cejas')!;
    expect(costo).toMatchObject({ costo_material: 9, margen: 111, tiene_receta: true });

    const r = await api.admin.reservarParaCliente({
      cliente_id: sesionClienta.cliente!.id,
      items: [{ servicio_id: cejas.id }],
      inicio: a(MARTES, '12:00'),
      origen: 'whatsapp',
    });
    let [cita] = await api.admin.getAgenda(MARTES, MARTES);
    expect(cita.consentimientos_firmados).toBe(0);
    expect(cita.origen).toBe('whatsapp');
    await expect(api.admin.cambiarEstadoCita(r.id, 'en_curso')).rejects.toThrow(M.sinConsentimiento);
    await expect(api.admin.completarCita(r.id)).rejects.toThrow(M.sinConsentimiento);

    // La firma se hace en la tablet de la cabina (ESPEC §9): desde su cuenta, la clienta no firma.
    await entrar(api, 'cliente');
    await expect(api.firmarConsentimientoCita(r.id, FIRMA)).rejects.toThrow(M.firmaEnSpa);
    // Una cita que no existe responde como en SQL: igual que una ajena.
    await expect(api.firmarConsentimientoCita('no-existe', FIRMA)).rejects.toThrow(M.permiso);
    await firmarEnCabina(api, r.id);
    await api.admin.cambiarEstadoCita(r.id, 'en_curso');
    await api.admin.completarCita(r.id);
    await api.admin.completarCita(r.id); // idempotente
    await api.admin.cambiarEstadoCita(r.id, 'completada');
    [p] = await api.admin.getProductos();
    expect(p.stock_actual).toBe(785);
    const consumos = (await api.admin.getMovimientos(cera.id)).filter((m) => m.tipo === 'consumo');
    expect(consumos).toHaveLength(1);
    expect(consumos[0]).toMatchObject({ cantidad: -15, costo_unitario: 0.6 });
    [cita] = await api.admin.getAgenda(MARTES, MARTES);
    expect(cita.estado).toBe('completada');

    // Ajustes, mermas y reposición (R12)
    await api.admin.ajustarInventario(cera.id, 700, 'merma', 'Se derramó');
    [p] = await api.admin.getProductos();
    expect(p.stock_actual).toBe(85);
    const repo = await api.admin.getReposicion();
    expect(repo).toHaveLength(1);
    expect(repo[0]).toMatchObject({ faltante: 15, presentaciones_sugeridas: 1, costo_estimado: 480 });
  });
});

describe('R8–R10 pedidos, pagos y regalos', () => {
  it('precios del servidor, pago parcial/total, créditos, regalo y uso del crédito', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    const bigote = await servicio(api, 'labio-superior');
    const express = await paquete(api, 'express');
    await clientaLista(api);
    await expect(api.crearPedido([{ tipo: 'servicio', id: bigote.id, cantidad: 1 }], 'efectivo')).rejects.toThrow(M.noVendible);
    const ped = await api.crearPedido(
      [
        { tipo: 'paquete', id: express.id, cantidad: 1 },
        { tipo: 'servicio', id: cejas.id, cantidad: 2, regalo_para: 'Ana' },
      ],
      'transferencia',
    );
    expect(ped).toMatchObject({ folio: 'OP-00001', total: 540 });
    await expect(api.admin.registrarPago({ monto: 540, metodo: 'efectivo', pedido_id: ped.id })).rejects.toThrow(M.permiso);

    await entrar(api, 'personal');
    await api.admin.registrarPago({ monto: 200, metodo: 'transferencia', pedido_id: ped.id });
    expect((await api.admin.getPedidos('pendiente_pago'))[0].pagado).toBe(200);
    await api.admin.registrarPago({ monto: 340, metodo: 'transferencia', pedido_id: ped.id });
    const [pagado] = await api.admin.getPedidos('pagado');
    expect(pagado.pagado).toBe(540);
    expect(pagado.pagado_en).not.toBeNull();

    await entrar(api, 'cliente');
    const creditos = await api.getMisCreditos();
    const credPaquete = creditos.find((c) => c.paquete_id === express.id)!;
    const regalo = creditos.find((c) => c.servicio_id === cejas.id)!;
    expect(credPaquete).toMatchObject({ cantidad: 1, restantes: 1, vigente: true, vence_en: sumarDias(LUNES, 365) });
    expect(regalo).toMatchObject({ cantidad: 2, regalo_para: 'Ana' });
    expect(regalo.codigo_regalo).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    // Reservar con crédito: precio 0 y usados += 1; cancelar lo devuelve.
    const r = await api.reservarCita({ items: [{ paquete_id: express.id, credito_id: credPaquete.id }], inicio: a(MIERCOLES, '12:00'), firma: FIRMA });
    let [cita] = await api.getMisCitas();
    expect(cita.total).toBe(0);
    expect(cita.items[0].precio).toBe(0);
    expect((await api.getMisCreditos()).find((c) => c.id === credPaquete.id)!.usados).toBe(1);
    await expect(
      api.reservarCita({ items: [{ paquete_id: express.id, credito_id: credPaquete.id }], inicio: a(MIERCOLES, '13:00'), firma: FIRMA }),
    ).rejects.toThrow(M.credito);
    await api.cancelarCita(r.id);
    expect((await api.getMisCreditos()).find((c) => c.id === credPaquete.id)!.usados).toBe(0);
    [cita] = await api.getMisCitas();
    expect(cita.estado).toBe('cancelada');

    // Canjear el regalo en otra cuenta.
    await otraClienta(api);
    await expect(
      api.reservarCita({ items: [{ paquete_id: express.id, credito_id: credPaquete.id }], inicio: a(MIERCOLES, '13:00'), firma: FIRMA }),
    ).rejects.toThrow(M.credito);
    await api.canjearRegalo(` ${regalo.codigo_regalo!.toLowerCase()} `);
    const suyos = await api.getMisCreditos();
    expect(suyos).toHaveLength(1);
    expect(suyos[0]).toMatchObject({ servicio_id: cejas.id, codigo_regalo: null, restantes: 2 });
    await expect(api.canjearRegalo(regalo.codigo_regalo!)).rejects.toThrow(M.regalo);
    await expect(api.canjearRegalo('NOEXISTE')).rejects.toThrow(M.regalo);
  });

  it('productos: sólo vendibles; al pagarse salen del inventario; la dueña cancela si está pendiente', async () => {
    const { api } = entorno();
    await entrar(api, 'personal');
    const crema = await api.admin.guardarProducto(
      productoDe({
        nombre: 'Crema para casa',
        categoria: 'venta',
        unidad_medida: 'pz',
        presentacion: 'Tubo',
        costo_presentacion: 100,
        stock_minimo: 1,
        uso: 'venta',
        precio_venta: 250,
        vendible_en_linea: true,
      }),
    );
    await api.admin.ajustarInventario(crema.id, 5, 'ajuste', 'Inventario inicial');
    expect(await api.getProductosTienda()).toEqual([
      {
        id: crema.id,
        slug: 'crema-para-casa', // se vende en línea: su ficha vive en /tienda/:slug
        nombre: 'Crema para casa',
        categoria: 'venta',
        marca: null,
        presentacion: 'Tubo',
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
        precio_venta: 250,
        stock_disponible: 5,
        hay_stock: true,
        proximo_lote_listo: null,
      },
    ]);
    await clientaLista(api);
    const p1 = await api.crearPedido([{ tipo: 'producto', id: crema.id, cantidad: 2 }], 'efectivo');
    const p2 = await api.crearPedido([{ tipo: 'producto', id: crema.id, cantidad: 1 }], 'efectivo');
    expect(p1.total).toBe(500);
    await api.cancelarPedido(p2.id);
    await expect(api.cancelarPedido(p2.id)).rejects.toThrow('Este pedido ya no se puede cancelar.');
    expect((await api.getMisPedidos()).map((p) => p.estado).sort()).toEqual(['cancelado', 'pendiente_pago']);
    await entrar(api, 'personal');
    await api.admin.registrarPago({ monto: 500, metodo: 'tarjeta', pedido_id: p1.id });
    const [prod] = await api.admin.getProductos();
    expect(prod.stock_actual).toBe(3);
    const ventas = (await api.admin.getMovimientos(crema.id)).filter((m) => m.tipo === 'venta');
    expect(ventas[0].cantidad).toBe(-2);
    await api.admin.guardarProducto({ ...prod, vendible_en_linea: false });
    await entrar(api, 'cliente');
    await expect(api.crearPedido([{ tipo: 'producto', id: crema.id, cantidad: 1 }], 'efectivo')).rejects.toThrow(M.noVendible);
  });
});

describe('permisos por rol', () => {
  it('visitante, clienta, personal y admin', async () => {
    const { api } = entorno();
    await expect(api.admin.getAgenda(MARTES, MARTES)).rejects.toThrow(M.sesion);
    await expect(api.getMisCitas()).rejects.toThrow(M.sesion);
    await entrar(api, 'cliente');
    await expect(api.admin.getAgenda(MARTES, MARTES)).rejects.toThrow(M.permiso);
    await expect(api.admin.getClientes()).rejects.toThrow(M.permiso);
    await entrar(api, 'personal');
    await expect(api.admin.getAgenda(MARTES, MARTES)).resolves.toEqual([]);
    await expect(api.admin.getGastos(LUNES, MARTES)).rejects.toThrow(M.permiso);
    await expect(api.admin.getResultados(3)).rejects.toThrow(M.permiso);
    expect((await api.admin.getResumenHoy()).mes_actual).toBeNull();
    await entrar(api, 'admin');
    await expect(api.admin.getGastos(LUNES, MARTES)).resolves.toEqual([]);
    expect((await api.admin.getResumenHoy()).mes_actual).not.toBeNull();
  });

  it('sesión: iniciar, registrarse, avisar a suscriptores y cerrar', async () => {
    const { api } = entorno();
    const vistos: (string | null)[] = [];
    const quitar = api.onCambioSesion((s) => vistos.push(s ? s.rol : null));
    await expect(api.iniciarSesion(emailDe('cliente'), 'mala')).rejects.toThrow('Correo o contraseña incorrectos.');
    const s = await api.iniciarSesion(emailDe('personal').toUpperCase(), PASSWORD_DEMO);
    expect(s.rol).toBe('personal');
    await api.cerrarSesion();
    const nueva = await api.registrarse({ email: 'nueva@ejemplo.mx', password: 'secreta1', nombre: 'Nueva', apellidos: 'Clienta', telefono: '4421112233', fecha_nacimiento: null });
    expect(nueva).toMatchObject({ rol: 'cliente', email: 'nueva@ejemplo.mx', cliente: { nombre: 'Nueva' } });
    await expect(api.registrarse({ email: 'nueva@ejemplo.mx', password: 'secreta1', nombre: 'X', apellidos: '', telefono: '', fecha_nacimiento: null })).rejects.toThrow(
      'Ya existe una cuenta con ese correo. Inicia sesión.',
    );
    quitar();
    await api.cerrarSesion();
    expect(vistos).toEqual(['personal', null, 'cliente']);
    expect(await api.getSesion()).toBeNull();
  });
});

describe('gastos y resultados', () => {
  it('un gasto ligado a un recurrente avanza su próximo vencimiento', async () => {
    const { api } = entorno();
    await entrar(api, 'admin');
    const recurrentes = await api.admin.getGastosRecurrentes();
    const renta = recurrentes.find((r) => r.concepto.startsWith('Renta'))!;
    const luz = recurrentes.find((r) => r.frecuencia === 'bimestral')!;
    expect(renta.proximo_vencimiento).toBe('2026-11-01');
    const base = { metodo_pago: 'transferencia' as const, proveedor: null, comprobante_url: null, notas: null };
    await api.admin.guardarGasto({ ...base, categoria_id: renta.categoria_id, concepto: 'Renta noviembre', monto: 12000, fecha: LUNES, recurrente_id: renta.id });
    await api.admin.guardarGasto({ ...base, categoria_id: luz.categoria_id, concepto: 'Luz', monto: 900, fecha: LUNES, recurrente_id: luz.id });
    const despues = await api.admin.getGastosRecurrentes();
    expect(despues.find((r) => r.id === renta.id)!.proximo_vencimiento).toBe('2026-12-01');
    expect(despues.find((r) => r.id === luz.id)!.proximo_vencimiento).toBe('2027-01-15');
    const gastos = await api.admin.getGastos('2026-11-01', '2026-11-30');
    expect(gastos.map((g) => g.periodo)).toEqual(['2026-11-01', '2026-11-01']);
    const porVencer = await api.admin.getGastosPorVencer();
    expect(porVencer.find((g) => g.id === renta.id)).toMatchObject({ dias_restantes: 29, estado: 'al_corriente' });
  });

  it('resultados del mes: ingresos sin propina, insumos, compras, gastos, utilidad y flujo', async () => {
    const { api, fijarHora } = entorno();
    const cejas = await servicio(api, 'cejas');
    const cliente = await entrar(api, 'cliente');
    await entrar(api, 'personal');
    const cera = await api.admin.guardarProducto(productoDe({ nombre: 'Cera', presentacion: 'Lata', contenido_presentacion: 1000, costo_presentacion: 500 }));
    await api.admin.registrarCompra({ items: [{ producto_id: cera.id, presentaciones: 2, costo_presentacion: 500 }], fecha: LUNES });
    await api.admin.guardarReceta(cejas.id, [{ producto_id: cera.id, cantidad: 20 }]);
    const r = await api.admin.reservarParaCliente({ cliente_id: cliente.cliente!.id, items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), origen: 'mostrador' });
    await api.firmarConsentimientoCita(r.id, FIRMA); // firma en la tablet de cabina
    fijarHora(new Date(a(MARTES, '11:05')));
    await api.admin.completarCita(r.id);
    await api.admin.registrarPago({ monto: 120, propina: 20, metodo: 'efectivo', cita_id: r.id });
    await entrar(api, 'admin');
    const renta = (await api.admin.getCategoriasGasto()).find((c) => c.slug === 'renta')!;
    await api.admin.guardarGasto({ categoria_id: renta.id, concepto: 'Renta', monto: 1000, fecha: LUNES, metodo_pago: 'efectivo', proveedor: null, comprobante_url: null, recurrente_id: null, notas: null });

    const res = await api.admin.getResultados(3);
    expect(res.map((x) => x.mes)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
    expect(res[2]).toEqual({
      mes: '2026-11-01',
      ingresos: 120,
      propinas: 20,
      costo_insumos: 10,
      costo_ventas: 0,
      mermas: 0,
      compras: 1000,
      gastos: 1000,
      utilidad: -890,
      flujo: -1880,
      citas_completadas: 1,
    });
    expect(res[0].ingresos).toBe(0);
    const [detalle] = await api.admin.getAgenda(MARTES, MARTES);
    expect(detalle.pagado).toBe(120);
    const [resumenCliente] = await api.admin.getClientes('mariana');
    expect(resumenCliente).toMatchObject({ citas_completadas: 1, total_pagado: 120, tiene_cuenta: true });
  });
});

describe('escrituras del panel', () => {
  it('equipo, horarios, cabinas compartidas, capacitaciones, paquetes y clientas', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    const axilas = await servicio(api, 'axilas');
    await entrar(api, 'personal');
    await expect(api.admin.guardarPersonal({ slug: 'x', nombre: 'X', titulo: null, bio: null, foto_url: null, color_agenda: '#000', activo: true, mostrar_en_sitio: true, orden: 2 })).rejects.toThrow(M.permiso);

    await entrar(api, 'admin');
    await api.admin.guardarPersonal({ slug: 'auxiliar', nombre: 'Auxiliar (ejemplo)', titulo: 'Cosmetóloga', bio: null, foto_url: null, color_agenda: '#8a6d3b', activo: true, mostrar_en_sitio: true, orden: 2 });
    const aux = (await api.admin.getPersonal()).find((p) => p.slug === 'auxiliar')!;
    await expect(api.admin.guardarHorarios(aux.id, [{ dia_semana: 2, hora_inicio: '12:00', hora_fin: '10:00' }])).rejects.toThrow(
      'La salida debe ser después de la entrada.',
    );
    await api.admin.guardarHorarios(aux.id, [{ dia_semana: 2, hora_inicio: '10:00', hora_fin: '12:00' }]);
    await api.admin.guardarCapacitacion({ personal_id: aux.id, nombre: 'Curso (ejemplo)', institucion: null, tipo: 'curso', fecha: '2026-01-10', horas: 10, constancia_url: null, mostrar_en_sitio: true, notas: null });
    const equipo = await api.getEquipo();
    expect(equipo.map((p) => p.slug)).toEqual(['especialista', 'auxiliar']);
    expect(equipo[1].capacitaciones).toHaveLength(1);
    await api.admin.eliminarCapacitacion(equipo[1].capacitaciones[0].id);
    expect((await api.getEquipo())[1].capacitaciones).toHaveLength(0);

    // Dos personas, una sola cabina: a las 10 hay dos opciones; al reservar una, la cabina se ocupa.
    let slots = await api.getHorariosDisponibles(MARTES, 60);
    expect(slots.filter((s) => s.inicio === a(MARTES, '10:00')).map((s) => s.personal_nombre)).toEqual(['Especialista de Ópalo', 'Auxiliar (ejemplo)']);
    expect(await api.getHorariosDisponibles(MARTES, 60, aux.id)).toHaveLength(2);
    const nueva = await api.admin.crearCliente({ nombre: 'Paola', apellidos: 'Sin cuenta', telefono: '442 555 1234', email: 'paola@ejemplo.mx', fecha_nacimiento: null, notas_internas: 'Piel sensible' });
    await expect(api.admin.crearCliente({ nombre: 'Otra', apellidos: null, telefono: null, email: 'PAOLA@ejemplo.mx', fecha_nacimiento: null })).rejects.toThrow(
      'Ya hay una clienta registrada con ese correo.',
    );
    await api.admin.reservarParaCliente({ cliente_id: nueva, items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), personal_id: aux.id, origen: 'telefono' });
    slots = await api.getHorariosDisponibles(MARTES, 60);
    expect(slots.some((s) => s.inicio === a(MARTES, '10:00'))).toBe(false);
    expect((await api.admin.getClientes('5551234')).map((c) => c.id)).toEqual([nueva]);
    await api.admin.guardarNotasCliente(nueva, 'Prefiere cera tibia');
    const exp = await api.admin.getExpediente(nueva);
    expect(exp.cliente).toMatchObject({ nombre: 'Paola', tiene_cuenta: false, notas_internas: 'Prefiere cera tibia' });
    expect(exp.citas[0]).toMatchObject({ personal_nombre: 'Auxiliar (ejemplo)', origen: 'telefono', consentimientos_firmados: 0 });
    expect(exp.ficha).toBeNull();

    // Si la clienta crea su cuenta con el mismo correo, se vincula su ficha de clienta.
    await api.cerrarSesion();
    const s = await api.registrarse({ email: 'paola@ejemplo.mx', password: 'secreta1', nombre: 'Paola', apellidos: 'Sin cuenta', telefono: '', fecha_nacimiento: null });
    expect(s?.cliente?.id).toBe(nueva);
    expect(await api.getMisCitas()).toHaveLength(1);

    // Paquetes y servicios (admin)
    await entrar(api, 'admin');
    await api.admin.guardarPaquete({ slug: 'duo', nombre: 'Dúo (ejemplo)', descripcion: null, tipo: 'bono', precio: 200, duracion_min: null, vigencia_dias: 90, activo: true, orden: 9, items: [{ servicio_id: cejas.id, cantidad: 2 }] });
    await expect(api.admin.guardarPaquete({ slug: 'duo', nombre: 'Otro', descripcion: null, tipo: 'combo', precio: 1, duracion_min: null, vigencia_dias: null, activo: true, orden: 1, items: [] })).rejects.toThrow(
      'Ya existe otro paquete con ese identificador (slug).',
    );
    await api.admin.guardarServicio({ ...axilas, activo: false });
    expect((await api.getCatalogo()).servicios.some((x) => x.id === axilas.id)).toBe(false);
    expect((await api.getCatalogo({ incluirInactivos: true })).servicios.some((x) => x.id === axilas.id)).toBe(true);

    // Un bono genera créditos del servicio × cantidad, con su vigencia.
    await entrar(api, 'cliente');
    const duo = (await api.getCatalogo()).paquetes.find((p) => p.slug === 'duo')!;
    expect(duo.items).toEqual([{ servicio_id: cejas.id, cantidad: 2 }]);
    const ped = await api.crearPedido([{ tipo: 'paquete', id: duo.id, cantidad: 3 }], 'efectivo');
    await entrar(api, 'personal');
    await api.admin.registrarPago({ monto: 600, metodo: 'efectivo', pedido_id: ped.id });
    await entrar(api, 'cliente');
    const [cred] = await api.getMisCreditos();
    expect(cred).toMatchObject({ servicio_id: cejas.id, cantidad: 6, vence_en: sumarDias(LUNES, 90) });
  });
});

describe('datos de ejemplo', () => {
  it('se siembran sin errores cualquier día de la semana', async () => {
    const aviso = vi.spyOn(console, 'warn');
    for (let i = 0; i < 7; i++) {
      const { api } = entorno({ ejemplos: true, ahora: new Date(a(sumarDias(LUNES, i), '08:30')) });
      await api.getConfiguracion();
    }
    expect(aviso).not.toHaveBeenCalled();
  });

  it('dejan ver todo el sitio: agenda, alertas, reposición, pedidos, créditos, capacitaciones y resultados', async () => {
    const { api } = entorno({ ejemplos: true, ahora: new Date(a(MIERCOLES, '09:00')) });
    const equipo = await api.getEquipo();
    expect(equipo[0].capacitaciones.length).toBeGreaterThanOrEqual(3);
    expect(equipo[0].capacitaciones.every((c) => c.nombre.endsWith('(ejemplo)'))).toBe(true);
    expect((await api.getProductosTienda()).some((p) => !p.hay_stock)).toBe(true);

    await entrar(api, 'cliente');
    const misCitas = await api.getMisCitas();
    expect(misCitas.filter((c) => c.estado === 'completada').length).toBeGreaterThanOrEqual(3);
    // Una sola cita próxima: así puede probar varias reservas antes del límite de 3.
    expect(misCitas.filter((c) => c.estado === 'confirmada').length).toBe(1);
    const creditos = await api.getMisCreditos();
    expect(creditos.some((c) => c.codigo_regalo)).toBe(true);
    expect(creditos.some((c) => c.paquete_id && c.usados === 1 && c.restantes === 1)).toBe(true);

    await entrar(api, 'admin');
    const resumen = await api.admin.getResumenHoy();
    expect(resumen.citas_hoy).toHaveLength(1);
    expect(resumen.por_revisar).toBe(1);
    expect(resumen.reposicion.length).toBeGreaterThanOrEqual(3);
    expect(resumen.pedidos_pendientes).toBe(1);
    expect(resumen.pedidos_por_entregar).toBe(1);
    expect(resumen.lotes_listos.length).toBeGreaterThanOrEqual(1);
    expect(resumen.gastos_por_vencer.length).toBeGreaterThan(0);

    const agenda = await api.admin.getAgenda(sumarDias(MIERCOLES, -80), sumarDias(MIERCOLES, 20));
    expect(agenda.some((c) => c.estado === 'pendiente' && c.requiere_revision && c.alertas.length > 0)).toBe(true);
    expect(agenda.some((c) => c.estado === 'confirmada' && c.consentimientos_firmados === 0)).toBe(true);
    expect(agenda.some((c) => c.estado === 'no_asistio')).toBe(true);
    for (const c of agenda.filter((x) => x.estado === 'completada')) expect(c.consentimientos_firmados).toBeGreaterThan(0);
    // Lo anterior a la apertura son ensayos: los agendó el personal (nunca "web") y no se cobraron.
    const previas = agenda.filter((c) => fechaLocal(new Date(c.inicio)) < APERTURA);
    expect(previas.length).toBeGreaterThan(0);
    expect(previas.every((c) => c.origen !== 'web' && c.pagado === 0)).toBe(true);
    // Las reservas en línea de ejemplo son del día de apertura en adelante.
    expect(agenda.filter((c) => c.origen === 'web').every((c) => fechaLocal(new Date(c.inicio)) >= APERTURA)).toBe(true);
    expect((await api.admin.getBloqueos(MIERCOLES, sumarDias(MIERCOLES, 20))).length).toBe(1);

    const pagados = await api.admin.getPedidos('pagado');
    expect(pagados.filter((p) => p.origen === 'web')).toHaveLength(3);
    expect(pagados.filter((p) => p.origen === 'mostrador').length).toBeGreaterThanOrEqual(5);
    expect((await api.admin.getProductos()).every((p) => p.stock_actual >= 0)).toBe(true);
    expect((await api.admin.getCostosServicios()).filter((c) => c.tiene_receta).length).toBeGreaterThanOrEqual(8);
    expect((await api.admin.getProveedores()).every((p) => p.nombre.endsWith('(ejemplo)'))).toBe(true);
    expect((await api.admin.getGastosRecurrentes()).every((g) => g.monto_estimado !== null)).toBe(true);

    const resultados = await api.admin.getResultados(4);
    expect(resultados).toHaveLength(4);
    expect(resultados.some((r) => r.ingresos > 0 && r.citas_completadas > 0 && r.costo_insumos > 0)).toBe(true);
    expect(resultados.slice(0, 3).every((r) => r.gastos > 0)).toBe(true);
    expect(resultados.some((r) => r.compras > 0)).toBe(true);

    const clientes = await api.admin.getClientes();
    expect(clientes.filter((c) => !c.tiene_cuenta).length).toBe(2);
    const fernanda = clientes.find((c) => c.nombre === 'Fernanda')!;
    const exp = await api.admin.getExpediente(fernanda.id);
    expect(exp.cliente.notas_internas).toContain('WhatsApp');
    expect(exp.ficha).not.toBeNull();
  });
});

describe('persistencia y copias', () => {
  function almacenEnMemoria() {
    const m = new Map<string, string>();
    return {
      m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  }

  it('guarda base y sesión bajo opalo-demo-v1 y las recupera', async () => {
    const almacen = almacenEnMemoria();
    const uno = entorno({ almacenamiento: almacen }).api;
    await clientaLista(uno);
    const cejas = await servicio(uno, 'cejas');
    await uno.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: FIRMA });
    expect([...almacen.m.keys()]).toEqual(['opalo-demo-v1']);

    const dos = entorno({ almacenamiento: almacen }).api;
    expect((await dos.getSesion())?.email).toBe(emailDe('cliente'));
    expect(await dos.getMisCitas()).toHaveLength(1);

    almacen.m.set('opalo-demo-v1', '{no es json');
    const tres = entorno({ almacenamiento: almacen }).api;
    expect(await tres.getSesion()).toBeNull();
    expect((await tres.getCatalogo()).servicios.length).toBeGreaterThan(20);
  });

  it('funciona aunque el almacenamiento falle', async () => {
    const roto = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    const { api } = entorno({ almacenamiento: roto });
    await clientaLista(api);
    expect((await api.getMiFicha())?.acepta_datos_sensibles).toBe(true);
  });

  it('devuelve copias: mutar lo recibido no cambia la base', async () => {
    const { api } = entorno();
    const cat = await api.getCatalogo();
    cat.servicios[0].nombre = 'Cambiado';
    cat.servicios.pop();
    const otra = await api.getCatalogo();
    expect(otra.servicios[0].nombre).not.toBe('Cambiado');
    expect(otra.servicios.length).toBe(cat.servicios.length + 1);
    const conf = await api.getConfiguracion();
    conf.edad_minima = 1;
    expect((await api.getConfiguracion()).edad_minima).toBe(15);
  });

  it('una escritura con error no deja cambios a medias', async () => {
    const { api } = entorno();
    await clientaLista(api);
    const express = await paquete(api, 'express');
    const bigote = await servicio(api, 'labio-superior');
    await expect(
      api.crearPedido(
        [
          { tipo: 'paquete', id: express.id, cantidad: 1 },
          { tipo: 'servicio', id: bigote.id, cantidad: 1 },
        ],
        'efectivo',
      ),
    ).rejects.toThrow(M.noVendible);
    expect(await api.getMisPedidos()).toEqual([]);
    const ok = await api.crearPedido([{ tipo: 'paquete', id: express.id, cantidad: 1 }], 'efectivo');
    expect(ok.folio).toBe('OP-00001');
  });
});

it('fechaLocal y la zona fija de Querétaro', () => {
  expect(fechaLocal(new Date('2026-11-03T05:59:00Z'))).toBe('2026-11-02');
  expect(fechaLocal(new Date('2026-11-03T06:00:00Z'))).toBe(MARTES);
});

/** Base sembrada (sin ejemplos) con un Ctx por rol, para preparar estados que la API no expone. */
function baseDirecta(ahora = AHORA, firmaEnLinea = false) {
  const db = sembrar(FUENTES_DEMO, ahora, { ejemplos: false });
  db.configuracion.firma_en_linea = firmaEnLinea;
  const como = (rol: Rol): Ctx => ({ db, ahora, usuarioId: db.usuarios.find((u) => u.email === emailDe(rol))!.id, userAgent: null });
  return { db, como };
}

describe('paridad con SQL (hallazgos de revisión)', () => {
  it('una cita "no asistió" no se completa: no queda encimada con la que tomó su lugar', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    await clientaLista(api);
    const ausente = await api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: FIRMA });
    await entrar(api, 'personal');
    await api.admin.cambiarEstadoCita(ausente.id, 'no_asistio');
    await otraClienta(api);
    await expect(
      api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: FIRMA }),
    ).resolves.toMatchObject({ estado: 'confirmada' });
    await entrar(api, 'personal');
    await expect(api.admin.completarCita(ausente.id)).rejects.toThrow('Esta cita se marcó como no asistió.');
    await expect(api.admin.cambiarEstadoCita(ausente.id, 'completada')).rejects.toThrow('Esta cita se marcó como no asistió.');
    await expect(api.admin.cambiarEstadoCita(ausente.id, 'cancelada')).rejects.toThrow(M.noCancelable);
    const agenda = await api.admin.getAgenda(MARTES, MARTES);
    expect(agenda.map((c) => c.estado).sort()).toEqual(['confirmada', 'no_asistio']);
  });

  it('una cita completada ya no cambia de estado', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    await clientaLista(api);
    const r = await api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00') });
    await firmarEnCabina(api, r.id);
    await api.admin.completarCita(r.id);
    for (const estado of ['confirmada', 'pendiente', 'en_curso', 'no_asistio', 'cancelada'] as const)
      await expect(api.admin.cambiarEstadoCita(r.id, estado)).rejects.toThrow('Esta cita ya se completó.');
    await api.admin.cambiarEstadoCita(r.id, 'completada'); // mismo estado: no hace nada
    const [cita] = await api.admin.getAgenda(MARTES, MARTES);
    expect(cita.estado).toBe('completada');
  });

  it('confirmar una cita pendiente quita "por revisar" y conserva las alertas', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    await clientaLista(api, ['diabetes']);
    const r = await api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: FIRMA });
    expect(r).toMatchObject({ estado: 'pendiente', requiere_revision: true });
    await entrar(api, 'personal');
    await api.admin.cambiarEstadoCita(r.id, 'confirmada');
    const [cita] = await api.admin.getAgenda(MARTES, MARTES);
    expect(cita).toMatchObject({ estado: 'confirmada', requiere_revision: false });
    expect(cita.alertas).toHaveLength(1);
  });

  it('contraindicación con categorias = [] no aplica a ninguna; null aplica a todas', () => {
    const { db, como } = baseDirecta();
    const clienta = como('cliente');
    R.aceptarPoliticas(clienta, db.politicas.filter((p) => p.activa).map((p) => p.id));
    R.guardarFicha(clienta, { respuestas: { diabetes: true }, detalles: {}, alergias: null, medicamentos: null, observaciones: null, acepta_datos_sensibles: true });
    const diabetes = db.contraindicaciones.find((c) => c.clave === 'diabetes')!;
    const cejas = db.servicios.find((s) => s.slug === 'cejas')!;
    const pedir = (hhmm: string) => R.reservarCita(clienta, { items: [{ servicio_id: cejas.id }], inicio: a(MARTES, hhmm), firma: FIRMA });
    diabetes.categorias = [];
    expect(pedir('10:00')).toMatchObject({ estado: 'confirmada', requiere_revision: false, alertas: [] });
    diabetes.categorias = null;
    expect(pedir('11:00')).toMatchObject({ estado: 'pendiente', requiere_revision: true, alertas: [diabetes.pregunta] });
  });

  it('un crédito de regalo sin canjear no sirve para reservar; ya canjeado, sí', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    await clientaLista(api);
    const ped = await api.crearPedido([{ tipo: 'servicio', id: cejas.id, cantidad: 1, regalo_para: 'Ana' }], 'efectivo');
    await entrar(api, 'personal');
    await api.admin.registrarPago({ monto: ped.total, metodo: 'efectivo', pedido_id: ped.id });
    await entrar(api, 'cliente');
    const [regalo] = await api.getMisCreditos();
    expect(regalo.codigo_regalo).not.toBeNull();
    const pedir = () => api.reservarCita({ items: [{ servicio_id: cejas.id, credito_id: regalo.id }], inicio: a(MARTES, '10:00'), firma: FIRMA });
    await expect(pedir()).rejects.toThrow(M.credito);
    expect((await api.getMisCreditos())[0].usados).toBe(0);

    await otraClienta(api);
    await api.canjearRegalo(regalo.codigo_regalo!);
    await expect(pedir()).resolves.toMatchObject({ estado: 'confirmada' });
    expect((await api.getMisCreditos())[0]).toMatchObject({ usados: 1, restantes: 0 });
  });

  it('edad mínima y tutor se miden el día de la cita, no hoy (firma en línea)', async () => {
    // Hoy es lunes 2 de noviembre de 2026; las citas son el martes 3. La fecha de nacimiento no cambia
    // una vez registrada, así que cada caso es una clienta distinta.
    const { api } = entorno({ firmaEnLinea: true });
    const cejas = await servicio(api, 'cejas');
    const conTutor: DatosFirma = { ...FIRMA, tutor_nombre: 'Rosa López' };
    const pedir = (hhmm: string, firma: DatosFirma) => api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, hhmm), firma });

    const catorce = await otraClienta(api, 'catorce@ejemplo.mx', '2011-11-04'); // 14 hoy y 14 el martes
    await expect(pedir('10:00', conTutor)).rejects.toThrow(M.edad);
    const quinceMartes = await otraClienta(api, 'quince@ejemplo.mx', '2011-11-03'); // 14 hoy, 15 el martes
    await expect(pedir('10:00', FIRMA)).rejects.toThrow(M.tutor);
    const quince = await pedir('10:00', conTutor);
    expect((await api.getMisConsentimientos()).find((d) => d.cita_id === quince.id)!.tutor_nombre).toBe('Rosa López');
    const dieciochoMartes = await otraClienta(api, 'dieciocho@ejemplo.mx', '2008-11-03'); // 17 hoy, 18 el martes
    const dieciocho = await pedir('11:00', FIRMA);
    expect((await api.getMisConsentimientos()).find((d) => d.cita_id === dieciocho.id)!.tutor_nombre).toBeNull();

    // El personal agenda y la clienta firma después: también cuenta la fecha de la cita.
    await entrar(api, 'personal');
    const staff = (cliente_id: string, hhmm: string) =>
      api.admin.reservarParaCliente({ cliente_id, items: [{ servicio_id: cejas.id }], inicio: a(MARTES, hhmm), origen: 'whatsapp' });
    const porWhatsApp = await staff(dieciochoMartes.cliente!.id, '12:00');
    await api.cerrarSesion();
    await api.iniciarSesion('dieciocho@ejemplo.mx', 'secreta1');
    await api.firmarConsentimientoCita(porWhatsApp.id, conTutor);
    expect((await api.getMisConsentimientos()).find((d) => d.cita_id === porWhatsApp.id)!.tutor_nombre).toBeNull();
    await entrar(api, 'personal');
    await expect(staff(quinceMartes.cliente!.id, '13:00')).resolves.toMatchObject({ estado: 'confirmada' });
    await expect(staff(catorce.cliente!.id, '14:00')).rejects.toThrow(M.edad);
  });

  it('se puede firmar una cita completada y cada versión nueva de la política se firma aparte (firma en línea)', async () => {
    const { api } = entorno({ firmaEnLinea: true });
    const cejas = await servicio(api, 'cejas');
    await clientaLista(api);
    const r = await api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: FIRMA });
    await entrar(api, 'personal');
    await api.admin.completarCita(r.id);
    await entrar(api, 'admin');
    await api.admin.publicarPolitica('consentimiento_depilacion', 'Consentimiento v2', '# Consentimiento v2\n\nTexto nuevo.');
    await entrar(api, 'cliente');
    await api.firmarConsentimientoCita(r.id, FIRMA);
    await api.firmarConsentimientoCita(r.id, FIRMA); // la misma versión no se firma dos veces
    const docs = await api.getMisConsentimientos();
    expect(docs.map((d) => d.politica_version).sort()).toEqual([1, 2]);

    const otra = await api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MIERCOLES, '12:00'), firma: FIRMA });
    await api.cancelarCita(otra.id);
    await expect(api.firmarConsentimientoCita(otra.id, FIRMA)).rejects.toThrow('Esta cita está cancelada.');
  });

  it('no acepta pagos a un pedido reembolsado', () => {
    const { db, como } = baseDirecta();
    const express = db.paquetes.find((p) => p.slug === 'express')!;
    const ped = R.crearPedido(como('cliente'), [{ tipo: 'paquete', id: express.id, cantidad: 1 }], 'efectivo');
    db.pedidos.find((p) => p.id === ped.id)!.estado = 'reembolsado';
    expect(() => R.registrarPago(como('personal'), { monto: 100, metodo: 'efectivo', pedido_id: ped.id })).toThrow('Ese pedido está cancelado.');
    expect(db.pagos).toHaveLength(0);
  });

  it('las cortesías no cuentan como ingreso ni como total pagado; sus propinas sí', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    const sesion = await entrar(api, 'cliente');
    await entrar(api, 'personal');
    const r = await api.admin.reservarParaCliente({ cliente_id: sesion.cliente!.id, items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), origen: 'mostrador' });
    await api.admin.registrarPago({ monto: 500, metodo: 'efectivo', cita_id: r.id });
    await api.admin.registrarPago({ monto: 200, propina: 50, metodo: 'cortesia', cita_id: r.id });
    await entrar(api, 'admin');
    const [mes] = await api.admin.getResultados(1);
    expect(mes).toMatchObject({ mes: '2026-11-01', ingresos: 500, propinas: 50, utilidad: 500, flujo: 500 });
    expect((await api.admin.getResumenHoy()).mes_actual).toMatchObject({ ingresos: 500 });
    const [clienta] = await api.admin.getClientes('mariana');
    expect(clienta.total_pagado).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Apertura (configuracion.fecha_apertura) y endurecimiento (ESPEC §5.1)
// ---------------------------------------------------------------------------

// Jueves 8 de octubre de 2026: el spa abre el sábado 31 (horario de sábado 9–15).
const HOY_PREVIO = '2026-10-08';
const VIERNES_PREVIO = '2026-10-09';
const VIERNES_30 = '2026-10-30';
const APERTURA = '2026-10-31';
const ANTES_DE_ABRIR = new Date(isoDesdeLocal(HOY_PREVIO, '09:00'));

/** Clienta con sesión en un Ctx de la base directa (para revisar columnas que la API no expone). */
function ctxDeUsuario(db: ReturnType<typeof baseDirecta>['db'], usuarioId: string, ahora = AHORA): Ctx {
  return { db, ahora, usuarioId, userAgent: null };
}

function clientaListaDirecta(ctx: Ctx): void {
  R.aceptarPoliticas(ctx, ctx.db.politicas.filter((p) => p.activa).map((p) => p.id));
  R.guardarFicha(ctx, { respuestas: {}, detalles: {}, alergias: null, medicamentos: null, observaciones: null, acepta_datos_sensibles: true });
}

describe('fecha de apertura', () => {
  it('viene del catálogo; antes de ella visitantes y clientas no ven horarios ni reservan; el personal sí agenda', async () => {
    const { api } = entorno({ ahora: ANTES_DE_ABRIR });
    expect((await api.getConfiguracion()).fecha_apertura).toBe(APERTURA);
    const cejas = await servicio(api, 'cejas');

    // Visitante
    expect(await api.getHorariosDisponibles(VIERNES_PREVIO, 60)).toEqual([]);
    expect(await api.getHorariosDisponibles(VIERNES_30, 60)).toEqual([]);
    expect(await api.getHorariosDisponibles(APERTURA, 60)).toHaveLength(6);

    // Clienta: la fecha de apertura se revisa antes que todo lo demás (como en SQL).
    const mariana = await entrar(api, 'cliente');
    expect(await api.getHorariosDisponibles(VIERNES_30, 60)).toEqual([]);
    const pedir = (inicio: string) => api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio, firma: FIRMA });
    await expect(pedir(a(VIERNES_30, '10:00'))).rejects.toThrow(M.noDisponible); // aún sin políticas ni ficha
    await aceptarGenerales(api);
    await fichaCon(api);
    await expect(pedir(a(VIERNES_30, '18:00'))).rejects.toThrow(M.noDisponible);
    await expect(pedir(a(APERTURA, '09:00'))).resolves.toMatchObject({ estado: 'confirmada' });

    // El personal ve los horarios previos y agenda el ensayo de apertura.
    await entrar(api, 'personal');
    expect(await api.getHorariosDisponibles(VIERNES_30, 60)).toHaveLength(9);
    const ensayo = await api.admin.reservarParaCliente({
      cliente_id: mariana.cliente!.id,
      items: [{ servicio_id: cejas.id }],
      inicio: a(VIERNES_30, '10:00'),
      origen: 'mostrador',
      notas: 'Ensayo de apertura',
    });
    expect(ensayo.estado).toBe('confirmada');
    await entrar(api, 'admin');
    const slots = await api.getHorariosDisponibles(VIERNES_30, 60);
    expect(slots).toHaveLength(8);
    expect(slots.some((x) => x.inicio === a(VIERNES_30, '10:00'))).toBe(false);
    await entrar(api, 'cliente');
    expect((await api.getMisCitas()).map((c) => c.inicio).sort()).toEqual([a(VIERNES_30, '10:00'), a(APERTURA, '09:00')]);
  });

  it('sin fecha de apertura (null) no hay restricción', () => {
    const { db, como } = baseDirecta(ANTES_DE_ABRIR);
    const visitante: Ctx = { db, ahora: ANTES_DE_ABRIR, usuarioId: null, userAgent: null };
    expect(R.horariosDisponibles(visitante, VIERNES_30, 60, null)).toEqual([]);
    expect(R.horariosDisponibles(como('cliente'), VIERNES_30, 60, null)).toEqual([]);
    expect(R.horariosDisponibles(como('admin'), VIERNES_30, 60, null)).toHaveLength(9);
    db.configuracion.fecha_apertura = null;
    expect(R.horariosDisponibles(visitante, VIERNES_30, 60, null)).toHaveLength(9);
  });

  it('los datos de ejemplo respetan la apertura: reservas en línea desde ese día y, antes, sólo ensayos sin cobro', async () => {
    const aviso = vi.spyOn(console, 'warn');
    for (const inicio of [HOY_PREVIO, '2026-10-26'])
      for (let i = 0; i < 7; i++) {
        const { api } = entorno({ ejemplos: true, ahora: new Date(a(sumarDias(inicio, i), '08:30')) });
        await api.getConfiguracion();
      }
    expect(aviso).not.toHaveBeenCalled();

    const { api } = entorno({ ejemplos: true, ahora: ANTES_DE_ABRIR });
    await entrar(api, 'cliente');
    const proximas = (await api.getMisCitas()).filter((c) => c.estado === 'confirmada');
    expect(proximas).toHaveLength(1);
    expect(proximas.every((c) => fechaLocal(new Date(c.inicio)) >= APERTURA)).toBe(true);
    // ESPEC §9: reservó sin firmar; firmará en la tablet de la cabina el día de su cita.
    expect(proximas.every((c) => c.consentimientos_firmados === 0)).toBe(true);
    // Aun así, la clienta no ve horarios ni reserva antes de la apertura.
    expect(await api.getHorariosDisponibles(VIERNES_PREVIO, 60)).toEqual([]);
    const cejas = await servicio(api, 'cejas');
    await expect(api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(VIERNES_30, '12:00'), firma: FIRMA })).rejects.toThrow(M.noDisponible);
    // Desde la apertura sí, y le quedan dos lugares antes del límite de 3 citas próximas.
    await expect(api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(APERTURA, '10:00'), firma: FIRMA })).resolves.toMatchObject({ estado: 'confirmada' });
    await entrar(api, 'admin');
    expect((await api.admin.getResumenHoy()).citas_hoy).toHaveLength(1);
    const agenda = await api.admin.getAgenda(sumarDias(HOY_PREVIO, -90), sumarDias(HOY_PREVIO, 60));
    const previas = agenda.filter((c) => fechaLocal(new Date(c.inicio)) < APERTURA);
    expect(previas.length).toBeGreaterThan(0);
    expect(previas.every((c) => c.origen !== 'web' && c.pagado === 0)).toBe(true);
    // Antes de abrir no hay ingresos por citas: los únicos son de la tienda (pedidos en línea y ventas de
    // mostrador pagados; las cortesías no son ingreso).
    const pagados = await api.admin.getPedidos('pagado');
    expect(pagados.length).toBeGreaterThan(1);
    const resultados = await api.admin.getResultados(4);
    const ingresos = resultados.reduce((s, r) => s + r.ingresos, 0);
    const deTienda = pagados.filter((p) => p.metodo_pago_preferido !== 'cortesia').reduce((s, p) => s + p.total, 0);
    expect(ingresos).toBeCloseTo(deTienda, 2);
    expect(resultados.reduce((s, r) => s + r.costo_ventas, 0)).toBeGreaterThan(0);
    expect((await api.getHorariosDisponibles(VIERNES_PREVIO, 60)).length).toBeGreaterThan(0);
  });
});

describe('mensajes iguales a SQL en pagos, compras, ajustes, políticas y registro', () => {
  it('responde con el mismo texto (y en el mismo orden) que las funciones de la base', async () => {
    const { api } = entorno();
    await expect(api.registrarse({ email: 'corta@ejemplo.mx', password: 'abc1234', nombre: 'Corta', apellidos: '', telefono: '', fecha_nacimiento: null })).rejects.toThrow(
      'La contraseña debe tener al menos 8 caracteres.',
    );
    await entrar(api, 'admin');
    // registrar_pago: primero pide a qué se aplica, aunque el monto también esté mal.
    await expect(api.admin.registrarPago({ monto: 0, metodo: 'efectivo' })).rejects.toThrow('Indica el pedido o la cita que se está pagando.');

    const producto = await api.admin.guardarProducto(productoDe({ nombre: 'Cera de prueba', contenido_presentacion: 800, costo_presentacion: 400 }));
    const compra = (it: { producto_id?: string; presentaciones?: number; costo_presentacion?: number }, proveedor_id: string | null = null) =>
      api.admin.registrarCompra({ items: [{ producto_id: producto.id, presentaciones: 1, costo_presentacion: 100, ...it }], proveedor_id });
    await expect(compra({}, 'no-existe')).rejects.toThrow('No encontramos ese proveedor.');
    await expect(compra({ producto_id: 'no-existe' })).rejects.toThrow('Uno de los productos de la compra no existe.');
    await expect(compra({ presentaciones: 0 })).rejects.toThrow('Las presentaciones compradas deben ser más de cero.');
    await expect(compra({ costo_presentacion: -1 })).rejects.toThrow('El costo no puede ser negativo.');
    // El tipo lo limita TypeScript, pero la regla es la de la base.
    await expect(api.admin.ajustarInventario(producto.id, 5, 'compra' as 'ajuste')).rejects.toThrow('Sólo se registran ajustes o mermas.');
    await expect(api.admin.ajustarInventario('no-existe', 0, 'ajuste')).rejects.toThrow('La cantidad no puede ser cero.');
    await expect(api.admin.ajustarInventario('no-existe', 3, 'ajuste')).rejects.toThrow('No encontramos ese producto.');
    await expect(api.admin.publicarPolitica('terminos', ' ', 'Texto')).rejects.toThrow('Escribe el título y el contenido de la política.');
  });
});

describe('endurecimiento: reservar (ESPEC §5.1)', () => {
  it('pide fecha de nacimiento y permite a lo más 3 citas próximas (el personal no tiene límite)', async () => {
    const { api, fijarHora } = entorno();
    const cejas = await servicio(api, 'cejas');
    const sin = await otraClienta(api, 'sinfecha@ejemplo.mx', null);
    const pedir = (fecha: string, hhmm: string) => api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(fecha, hhmm), firma: FIRMA });
    await expect(pedir(MIERCOLES, '10:00')).rejects.toThrow(M.nacimientoReservar);
    await api.actualizarMisDatos({ nombre: 'Otra', apellidos: 'Clienta', telefono: null, fecha_nacimiento: '1990-01-01', acepta_promociones: false });
    const r1 = await pedir(MIERCOLES, '10:00');
    const r2 = await pedir(MIERCOLES, '11:00');
    await pedir(MIERCOLES, '12:00');
    await expect(pedir(MIERCOLES, '13:00')).rejects.toThrow(M.maxCitas);

    await entrar(api, 'personal');
    await expect(
      api.admin.reservarParaCliente({ cliente_id: sin.cliente!.id, items: [{ servicio_id: cejas.id }], inicio: a(MIERCOLES, '13:00'), origen: 'whatsapp' }),
    ).resolves.toMatchObject({ estado: 'confirmada' });

    await api.cerrarSesion();
    await api.iniciarSesion('sinfecha@ejemplo.mx', 'secreta1');
    await api.cancelarCita(r1.id);
    await expect(pedir(MIERCOLES, '14:00')).rejects.toThrow(M.maxCitas); // cuenta también la que agendó el personal
    await api.cancelarCita(r2.id);
    await expect(pedir(MIERCOLES, '14:00')).resolves.toMatchObject({ estado: 'confirmada' });
    await expect(pedir(MIERCOLES, '15:00')).rejects.toThrow(M.maxCitas);

    // Las que ya pasaron no cuentan.
    fijarHora(new Date(a('2026-11-05', '09:00')));
    await expect(pedir('2026-11-06', '10:00')).resolves.toMatchObject({ estado: 'confirmada' });
  });

  it('firma sólo de trazos; nombres de 200 y notas de 1000 caracteres como máximo (firma en línea)', async () => {
    const { api } = entorno({ firmaEnLinea: true });
    const cejas = await servicio(api, 'cejas');
    await clientaLista(api);
    const pedir = (firma: DatosFirma, notas?: string) =>
      api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma, notas });
    for (const firma_svg of ['hola', '<svg><script>alert(1)</script></svg>', '<svg onload="x()"><path d="M0 0"/></svg>', `<svg><path d="${'M0 0 '.repeat(40_000)}"/></svg>`])
      await expect(pedir({ ...FIRMA, firma_svg })).rejects.toThrow(M.firmaInvalida);
    await expect(pedir({ ...FIRMA, nombre_firmante: 'A'.repeat(201) })).rejects.toThrow(M.nombreLargo);
    await expect(pedir(FIRMA, 'n'.repeat(1001))).rejects.toThrow(M.notasLargas);
    expect(await api.getMisCitas()).toEqual([]);
    await expect(pedir({ ...FIRMA, nombre_firmante: 'A'.repeat(200) }, 'n'.repeat(1000))).resolves.toMatchObject({ estado: 'confirmada' });

    // Tutor de una menor
    await otraClienta(api, 'menor@ejemplo.mx', '2010-06-01');
    const menor = (tutor_nombre: string) =>
      api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '11:00'), firma: { ...FIRMA, tutor_nombre } });
    await expect(menor('B'.repeat(201))).rejects.toThrow(M.nombreLargo);
    await expect(menor('Rosa López')).resolves.toMatchObject({ estado: 'confirmada' });

    // El personal también tiene el límite de notas.
    await entrar(api, 'personal');
    const [mariana] = await api.admin.getClientes('mariana');
    await expect(
      api.admin.reservarParaCliente({ cliente_id: mariana.id, items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '12:00'), origen: 'whatsapp', notas: 'n'.repeat(1001) }),
    ).rejects.toThrow(M.notasLargas);
  });

  it('el crédito debe estar vigente el día de la cita, no sólo hoy', () => {
    const { db, como } = baseDirecta();
    const clienta = como('cliente');
    clientaListaDirecta(clienta);
    const mariana = db.clientes.find((c) => c.usuario_id === clienta.usuarioId)!;
    const cejas = db.servicios.find((s) => s.slug === 'cejas')!;
    db.creditos.push({
      id: 'credito-prueba',
      cliente_id: mariana.id,
      servicio_id: cejas.id,
      paquete_id: null,
      cantidad: 3,
      usados: 0,
      pedido_item_id: null,
      codigo_regalo: null,
      regalo_para: null,
      vence_en: MARTES, // vigente hoy (lunes) y el martes; vencido el miércoles
      creado_en: AHORA.toISOString(),
    });
    const items = [{ servicio_id: cejas.id, credito_id: 'credito-prueba' }];
    expect(() => R.reservarCita(clienta, { items, inicio: a(MIERCOLES, '12:00'), firma: FIRMA })).toThrow(M.credito);
    expect(() => R.reservarCitaStaff(como('personal'), { cliente_id: mariana.id, items, inicio: a(MIERCOLES, '13:00'), origen: 'whatsapp' })).toThrow(M.credito);
    expect(R.reservarCita(clienta, { items, inicio: a(MARTES, '10:00'), firma: FIRMA })).toMatchObject({ estado: 'confirmada' });
    expect(db.creditos[0].usados).toBe(1);
  });

  it('sin una política activa del consentimiento de algún servicio, la cita no se puede crear', () => {
    const { db, como } = baseDirecta(AHORA, true);
    const clienta = como('cliente');
    clientaListaDirecta(clienta);
    const mariana = db.clientes.find((c) => c.usuario_id === clienta.usuarioId)!;
    const cejas = db.servicios.find((s) => s.slug === 'cejas')!;
    const facial = db.servicios.find((s) => s.slug === 'facial-hidratante')!;
    db.politicas.find((p) => p.tipo === 'consentimiento_depilacion' && p.activa)!.activa = false;
    expect(() => R.reservarCita(clienta, { items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: FIRMA })).toThrow(M.noReservable);
    expect(() =>
      R.reservarCitaStaff(como('personal'), { cliente_id: mariana.id, items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), origen: 'whatsapp' }),
    ).toThrow(M.noReservable);
    // Con al menos un consentimiento por firmar, sí (se firma el facial).
    const r = R.reservarCita(clienta, { items: [{ servicio_id: cejas.id }, { servicio_id: facial.id }], inicio: a(MARTES, '10:00'), firma: FIRMA });
    expect(db.consentimientos.filter((k) => k.cita_id === r.id)).toHaveLength(1);
  });
});

describe('endurecimiento: firma, datos y ficha (ESPEC §5.1)', () => {
  it('firmar (en línea): la clienta necesita su fecha de nacimiento; se guarda quién capturó la firma y por qué canal', () => {
    const { db, como } = baseDirecta(AHORA, true);
    const personal = como('personal');
    const clienta = como('cliente');
    clientaListaDirecta(clienta);
    const cejas = db.servicios.find((s) => s.slug === 'cejas')!;
    const items = [{ servicio_id: cejas.id }];

    const u = R.crearUsuario({ db, ahora: AHORA, usuarioId: null, userAgent: null }, { email: 'sinfecha@ejemplo.mx', password: 'secreta1', nombre: 'Sin fecha' });
    const sinFecha = ctxDeUsuario(db, u.id);
    const suFila = db.clientes.find((c) => c.usuario_id === u.id)!;
    const porWhatsApp = R.reservarCitaStaff(personal, { cliente_id: suFila.id, items, inicio: a(MARTES, '10:00'), origen: 'whatsapp' });
    expect(() => R.firmarConsentimientoCita(sinFecha, porWhatsApp.id, FIRMA)).toThrow(M.nacimientoFirmar);
    expect(() => R.firmarConsentimientoCita(personal, porWhatsApp.id, { ...FIRMA, firma_svg: '<svg><script/></svg>' })).toThrow(M.firmaInvalida);
    expect(() => R.firmarConsentimientoCita(personal, porWhatsApp.id, { ...FIRMA, nombre_firmante: 'A'.repeat(201) })).toThrow(M.nombreLargo);
    R.firmarConsentimientoCita(personal, porWhatsApp.id, FIRMA); // en la tablet de la cabina
    const enCabina = db.consentimientos.filter((k) => k.cita_id === porWhatsApp.id);
    expect(enCabina).toHaveLength(1);
    expect(enCabina[0]).toMatchObject({ canal: 'cabina', capturado_por: personal.usuarioId });

    const web = R.reservarCita(clienta, { items, inicio: a(MARTES, '11:00'), firma: FIRMA });
    expect(db.consentimientos.find((k) => k.cita_id === web.id)).toMatchObject({ canal: 'reserva_web', capturado_por: clienta.usuarioId });

    const mariana = db.clientes.find((c) => c.usuario_id === clienta.usuarioId)!;
    const paraFirmar = R.reservarCitaStaff(personal, { cliente_id: mariana.id, items, inicio: a(MARTES, '12:00'), origen: 'telefono' });
    R.firmarConsentimientoCita(clienta, paraFirmar.id, FIRMA);
    const k = db.consentimientos.find((x) => x.cita_id === paraFirmar.id)!;
    expect(k).toMatchObject({ canal: 'portal', capturado_por: clienta.usuarioId });
    const pol = db.politicas.find((p) => p.id === k.politica_id)!;
    expect(k.documento_hash).toBe(
      R.documentoHash({ ...k, hash_politica: pol.hash_sha256 }), // cubre política, clienta, cita, ficha, firmante, tutor, menor, trazo y fecha
    );
    expect(k.documento_hash).not.toBe(R.documentoHash({ ...k, hash_politica: pol.hash_sha256, firma_svg: FIRMA_EJEMPLO }));
  });

  it('la clienta captura su fecha de nacimiento una sola vez; el personal sí puede cambiar la suya', async () => {
    const { api } = entorno();
    await entrar(api, 'cliente'); // nació el 1994-05-12
    const datos = { nombre: 'Mariana', apellidos: 'López', telefono: '4420000001', acepta_promociones: true };
    await expect(api.actualizarMisDatos({ ...datos, fecha_nacimiento: '1995-05-12' })).rejects.toThrow(M.nacimientoRegistrado);
    await expect(api.actualizarMisDatos({ ...datos, fecha_nacimiento: null })).rejects.toThrow(M.nacimientoRegistrado);
    expect((await api.getSesion())?.cliente).toMatchObject({ fecha_nacimiento: '1994-05-12', acepta_promociones: false });
    await expect(api.actualizarMisDatos({ ...datos, fecha_nacimiento: '1994-05-12' })).resolves.toMatchObject({ acepta_promociones: true });

    await otraClienta(api, 'sinfecha@ejemplo.mx', null);
    const suyos = { nombre: 'Otra', apellidos: 'Clienta', telefono: null, acepta_promociones: false };
    await expect(api.actualizarMisDatos({ ...suyos, fecha_nacimiento: '1990-01-01' })).resolves.toMatchObject({ fecha_nacimiento: '1990-01-01' });
    await expect(api.actualizarMisDatos({ ...suyos, fecha_nacimiento: '1991-01-01' })).rejects.toThrow(M.nacimientoRegistrado);

    await entrar(api, 'personal');
    const equipo = { nombre: 'Especialista', apellidos: 'de Ópalo', telefono: null, acepta_promociones: false };
    await api.actualizarMisDatos({ ...equipo, fecha_nacimiento: '1990-01-01' });
    await expect(api.actualizarMisDatos({ ...equipo, fecha_nacimiento: '1991-02-02' })).resolves.toMatchObject({ fecha_nacimiento: '1991-02-02' });
  });

  it('ficha de salud: cada campo de texto en máximo 2000 caracteres', async () => {
    const { api } = entorno();
    await entrar(api, 'cliente');
    const base = { respuestas: {}, detalles: {}, alergias: null, medicamentos: null, observaciones: null, acepta_datos_sensibles: true };
    await expect(api.guardarFicha({ ...base, alergias: 'x'.repeat(2001) })).rejects.toThrow(M.fichaLarga);
    await expect(api.guardarFicha({ ...base, medicamentos: 'x'.repeat(2001) })).rejects.toThrow(M.fichaLarga);
    await expect(api.guardarFicha({ ...base, observaciones: 'x'.repeat(2001) })).rejects.toThrow(M.fichaLarga);
    await expect(api.guardarFicha({ ...base, detalles: { otra: 'x'.repeat(20_001) } })).rejects.toThrow(M.fichaLarga);
    expect(await api.getMiFicha()).toBeNull();
    await api.guardarFicha({ ...base, medicamentos: 'x'.repeat(2000) });
    expect((await api.getMiFicha())?.medicamentos).toHaveLength(2000);
  });
});

describe('endurecimiento: pedidos, regalos y catálogo (ESPEC §5.1)', () => {
  it('pedidos: efectivo, tarjeta o transferencia; cantidades enteras 1–99; a lo más 5 por pagar', async () => {
    const { api } = entorno();
    const express = await paquete(api, 'express');
    const cejas = await servicio(api, 'cejas');
    await clientaLista(api);
    const linea = (cantidad: unknown): ItemPedidoNuevo[] => [{ tipo: 'paquete', id: express.id, cantidad: cantidad as number }];
    await expect(api.crearPedido(linea(1), 'cortesia')).rejects.toThrow(M.metodoPago);
    await expect(api.crearPedido(linea(1), 'mercado_pago')).rejects.toThrow(M.metodoPago);
    await expect(api.crearPedido(linea(1.5), 'efectivo')).rejects.toThrow(M.cantidad);
    await expect(api.crearPedido(linea(100), 'efectivo')).rejects.toThrow(M.cantidad);
    await expect(api.crearPedido(linea('dos'), 'efectivo')).rejects.toThrow(M.cantidad);
    await expect(api.crearPedido(linea(0), 'efectivo')).rejects.toThrow(M.cantidadMinima);
    await expect(api.crearPedido(linea(-2), 'efectivo')).rejects.toThrow(M.cantidadMinima);
    await expect(api.crearPedido([{ tipo: 'servicio', id: cejas.id, cantidad: 1, regalo_para: 'A'.repeat(121) }], 'efectivo')).rejects.toThrow(M.regaloLargo);
    await expect(api.crearPedido(linea(1), 'efectivo', 'n'.repeat(1001))).rejects.toThrow(M.notasLargas);
    expect(await api.getMisPedidos()).toEqual([]);

    const sinCantidad = await api.crearPedido([{ tipo: 'paquete', id: express.id } as ItemPedidoNuevo], undefined as unknown as MetodoPago);
    expect(sinCantidad.total).toBe(300); // falta = 1
    expect((await api.crearPedido(linea(99), 'tarjeta')).total).toBe(29_700);
    await api.crearPedido([{ tipo: 'servicio', id: cejas.id, cantidad: 1, regalo_para: ` ${'A'.repeat(120)} ` }], 'transferencia');
    await api.crearPedido(linea('2'), 'efectivo');
    await api.crearPedido(linea(3), 'efectivo');
    await expect(api.crearPedido(linea(1), 'efectivo')).rejects.toThrow(M.maxPedidos);
    await api.cancelarPedido(sinCantidad.id);
    await expect(api.crearPedido(linea(1), 'efectivo')).resolves.toMatchObject({ total: 300 });
    const pedidos = await api.getMisPedidos();
    expect(pedidos.find((p) => p.id === sinCantidad.id)).toMatchObject({ metodo_pago_preferido: 'efectivo', estado: 'cancelado' });
    expect(pedidos.flatMap((p) => p.items).find((i) => i.regalo_para)?.regalo_para).toBe('A'.repeat(120));
  });

  it('un regalo genera un solo código para todos sus créditos y al canjearlo pasan todos', () => {
    const { db, como } = baseDirecta();
    const cejas = db.servicios.find((s) => s.slug === 'cejas')!;
    const axilas = db.servicios.find((s) => s.slug === 'axilas')!;
    // Bono de dos servicios (guardarPaquete ya no lo permite; puede venir de datos anteriores).
    db.paquetes.push({ id: 'bono-doble', slug: 'bono-doble', nombre: 'Bono doble (prueba)', descripcion: null, tipo: 'bono', precio: 400, duracion_min: null, vigencia_dias: 180, activo: true, orden: 99 });
    db.paquete_servicios.push({ paquete_id: 'bono-doble', servicio_id: cejas.id, cantidad: 2 }, { paquete_id: 'bono-doble', servicio_id: axilas.id, cantidad: 1 });
    const ped = R.crearPedido(
      como('cliente'),
      [
        { tipo: 'paquete', id: 'bono-doble', cantidad: 2, regalo_para: '  Ana  ' },
        { tipo: 'servicio', id: cejas.id, cantidad: 1, regalo_para: 'Luz' },
      ],
      'efectivo',
    );
    R.registrarPago(como('personal'), { monto: ped.total, metodo: 'efectivo', pedido_id: ped.id });
    const [itemBono, itemCejas] = db.pedido_items.filter((i) => i.pedido_id === ped.id);
    const delBono = db.creditos.filter((c) => c.pedido_item_id === itemBono.id);
    expect(delBono.map((c) => [c.servicio_id, c.cantidad]).sort()).toEqual([[axilas.id, 2], [cejas.id, 4]].sort());
    expect(new Set(delBono.map((c) => c.codigo_regalo)).size).toBe(1);
    expect(delBono.every((c) => c.regalo_para === 'Ana' && c.vence_en === sumarDias(LUNES, 180))).toBe(true);
    const codigo = delBono[0].codigo_regalo!;
    const deLuz = db.creditos.find((c) => c.pedido_item_id === itemCejas.id)!;
    expect(deLuz.codigo_regalo).not.toBe(codigo);

    const u = R.crearUsuario({ db, ahora: AHORA, usuarioId: null, userAgent: null }, { email: 'ana@ejemplo.mx', password: 'secreta1', nombre: 'Ana', fecha_nacimiento: '1990-01-01' });
    const ana = ctxDeUsuario(db, u.id);
    const id = R.canjearRegalo(ana, codigo.toLowerCase());
    const suFila = db.clientes.find((c) => c.usuario_id === u.id)!;
    expect(delBono.map((c) => c.id)).toContain(id);
    expect(db.creditos.filter((c) => c.cliente_id === suFila.id).map((c) => c.id).sort()).toEqual(delBono.map((c) => c.id).sort());
    expect(db.creditos.filter((c) => c.cliente_id === suFila.id).every((c) => c.codigo_regalo === null)).toBe(true);
    expect(deLuz.codigo_regalo).not.toBeNull(); // el otro regalo sigue sin canjear
    expect(() => R.canjearRegalo(ana, codigo)).toThrow(M.regalo);
  });

  it('completar una cita que no asistió dice por qué', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    await clientaLista(api);
    const r = await api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: FIRMA });
    await entrar(api, 'personal');
    await api.admin.cambiarEstadoCita(r.id, 'no_asistio');
    await expect(api.admin.completarCita(r.id)).rejects.toThrow(M.noAsistio);
  });

  it('un servicio activo y disponible debe decir qué consentimiento se firma', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    await entrar(api, 'admin');
    await expect(api.admin.guardarServicio({ ...cejas, tipo_consentimiento: null })).rejects.toThrow(M.servicioSinConsentimiento);
    const { id: _id, ...nuevo } = cejas;
    await expect(api.admin.guardarServicio({ ...nuevo, slug: 'cejas-nuevas', tipo_consentimiento: null })).rejects.toThrow(M.servicioSinConsentimiento);
    await api.admin.guardarServicio({ ...cejas, tipo_consentimiento: null, etapa: 'segunda_etapa' });
    await api.admin.guardarServicio({ ...cejas, tipo_consentimiento: null, etapa: 'disponible', activo: false });
    expect((await servicio(api, 'cejas'))).toMatchObject({ activo: false, tipo_consentimiento: null });
  });

  it('paquetes: guardar_paquete valida nombre, servicios, cantidades, precio y bonos', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    const axilas = await servicio(api, 'axilas');
    await entrar(api, 'admin');
    const base: PaqueteEditable = {
      slug: '',
      nombre: 'Paquete Verano',
      descripcion: null,
      tipo: 'combo',
      precio: 500,
      duracion_min: null,
      vigencia_dias: null,
      activo: true,
      orden: 5,
      items: [{ servicio_id: cejas.id, cantidad: 1 }],
    };
    const guardar = (p: Partial<PaqueteEditable>) => api.admin.guardarPaquete({ ...base, ...p });
    await expect(guardar({ nombre: ' ' })).rejects.toThrow('Escribe el nombre del paquete.');
    await expect(guardar({ nombre: 'P'.repeat(201) })).rejects.toThrow(M.nombreLargo);
    await expect(guardar({ id: 'no-existe' })).rejects.toThrow('No encontramos ese paquete.');
    await expect(guardar({ slug: '¡¡!!', nombre: '¿?' })).rejects.toThrow('El identificador (slug) del paquete debe tener letras o números.');
    await expect(guardar({ slug: 'express' })).rejects.toThrow('Ya existe otro paquete con ese identificador (slug).');
    await expect(guardar({ precio: -1 })).rejects.toThrow('El precio no puede ser negativo.');
    await expect(guardar({ duracion_min: 30.5 })).rejects.toThrow('Revisa la duración: minutos enteros, cero o más.');
    await expect(guardar({ vigencia_dias: 0 })).rejects.toThrow('Revisa la vigencia: días enteros, uno o más.');
    await expect(guardar({ items: [] })).rejects.toThrow('Agrega al menos un servicio al paquete.');
    await expect(guardar({ items: [{ servicio_id: 'no-existe', cantidad: 1 }] })).rejects.toThrow('Uno de los servicios del paquete no existe.');
    await expect(guardar({ items: [{ servicio_id: cejas.id, cantidad: 100 }] })).rejects.toThrow(M.cantidad);
    await expect(guardar({ items: [{ servicio_id: cejas.id, cantidad: 60 }, { servicio_id: cejas.id, cantidad: 40 }] })).rejects.toThrow(M.cantidad);
    await expect(guardar({ tipo: 'bono', items: [{ servicio_id: cejas.id, cantidad: 2 }, { servicio_id: axilas.id, cantidad: 1 }] })).rejects.toThrow(
      'Un bono es de un solo servicio: elige sólo uno y cuántas sesiones incluye.',
    );
    await guardar({ items: [{ servicio_id: cejas.id, cantidad: 1 }, { servicio_id: cejas.id, cantidad: 2 }, { servicio_id: axilas.id, cantidad: 1 }] });
    const verano = (await api.getCatalogo()).paquetes.find((p) => p.slug === 'paquete-verano')!;
    expect(verano.items).toEqual([
      { servicio_id: cejas.id, cantidad: 3 },
      { servicio_id: axilas.id, cantidad: 1 },
    ]);
    // Editar reemplaza los servicios completos.
    await guardar({ id: verano.id, slug: 'paquete-verano', tipo: 'bono', items: [{ servicio_id: axilas.id, cantidad: 5 }] });
    expect((await paquete(api, 'paquete-verano')).items).toEqual([{ servicio_id: axilas.id, cantidad: 5 }]);
  });

  it('recetas: guardar_receta reemplaza la receta, suma repetidos y conserva la primera nota', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    await entrar(api, 'personal');
    const cera = await api.admin.guardarProducto(productoDe({ nombre: 'Cera', presentacion: 'Lata', contenido_presentacion: 800, costo_presentacion: 400 }));
    await expect(api.admin.guardarReceta('no-existe', [])).rejects.toThrow('No encontramos ese servicio.');
    await expect(api.admin.guardarReceta(cejas.id, [{ producto_id: 'no-existe', cantidad: 1 }])).rejects.toThrow('Uno de los productos de la receta no existe.');
    await expect(api.admin.guardarReceta(cejas.id, [{ producto_id: cera.id, cantidad: 0 }])).rejects.toThrow('La cantidad de cada producto debe ser mayor a cero.');
    await expect(api.admin.guardarReceta(cejas.id, [{ producto_id: cera.id, cantidad: 1, notas: 'n'.repeat(1001) }])).rejects.toThrow(M.notasLargas);
    await api.admin.guardarReceta(cejas.id, [
      { producto_id: cera.id, cantidad: 10, notas: 'Primera' },
      { producto_id: cera.id, cantidad: 5.0004, notas: 'Segunda' },
    ]);
    expect(await api.admin.getReceta(cejas.id)).toEqual([{ producto_id: cera.id, cantidad: 15, notas: 'Primera' }]);
    await api.admin.guardarReceta(cejas.id, []);
    expect(await api.admin.getReceta(cejas.id)).toEqual([]);
  });
});

describe('horarios del equipo (guardar_horarios)', () => {
  it('la salida después de la entrada y sin rangos encimados el mismo día', async () => {
    const { api } = entorno();
    await entrar(api, 'admin');
    const [esp] = await api.admin.getPersonal();
    const guardar = (h: { dia_semana: number; hora_inicio: string; hora_fin: string }[]) => api.admin.guardarHorarios(esp.id, h);
    await expect(guardar([{ dia_semana: 2, hora_inicio: '10:00', hora_fin: '10:00' }])).rejects.toThrow('La salida debe ser después de la entrada.');
    await expect(
      guardar([
        { dia_semana: 2, hora_inicio: '10:00', hora_fin: '14:00' },
        { dia_semana: 2, hora_inicio: '13:00', hora_fin: '19:00' },
      ]),
    ).rejects.toThrow('Dos horarios del martes se enciman (10:00–14:00 y 13:00–19:00).');
    await expect(
      guardar([
        { dia_semana: 3, hora_inicio: '12:00', hora_fin: '18:00' },
        { dia_semana: 3, hora_inicio: '10:00', hora_fin: '13:00' },
      ]),
    ).rejects.toThrow('Dos horarios del miércoles se enciman (10:00–13:00 y 12:00–18:00).');
    await expect(guardar([{ dia_semana: 7, hora_inicio: '10:00', hora_fin: '12:00' }])).rejects.toThrow('El día de la semana debe ir de 0 (domingo) a 6 (sábado).');
    await expect(guardar([{ dia_semana: 2, hora_inicio: '', hora_fin: '12:00' }])).rejects.toThrow('Escribe la hora de entrada y la de salida.');
    await expect(guardar([{ dia_semana: 2, hora_inicio: '25:00', hora_fin: '26:00' }])).rejects.toThrow('Escribe la hora de entrada y la de salida.');
    await expect(api.admin.guardarHorarios('no-existe', [])).rejects.toThrow('No encontramos a esa persona del equipo.');
    expect((await api.admin.getPersonal())[0].horarios).toHaveLength(5); // un error no deja el horario a medias

    // Rangos pegados (comida) sí; el mismo rango en otro día también.
    await guardar([
      { dia_semana: 2, hora_inicio: '14:00', hora_fin: '19:00' },
      { dia_semana: 2, hora_inicio: '9:00', hora_fin: '14:00' },
      { dia_semana: 3, hora_inicio: '09:00', hora_fin: '14:00' },
    ]);
    const horarios = (await api.admin.getPersonal())[0].horarios;
    expect(horarios.map((h) => [h.dia_semana, h.hora_inicio, h.hora_fin])).toEqual([
      [2, '09:00', '14:00'],
      [2, '14:00', '19:00'],
      [3, '09:00', '14:00'],
    ]);
    expect(await api.getHorariosDisponibles(MARTES, 60)).toHaveLength(10);
    await entrar(api, 'personal');
    await expect(guardar([])).rejects.toThrow(M.permiso);
  });
});

describe('clientas del equipo y reposición', () => {
  it('v_clientes_resumen.es_personal: las cuentas del equipo se distinguen de las clientas', async () => {
    const { api } = entorno();
    await entrar(api, 'personal');
    const nueva = await api.admin.crearCliente({ nombre: 'Paola', apellidos: null, telefono: null, email: null, fecha_nacimiento: null });
    const clientes = await api.admin.getClientes();
    const porCorreo = Object.fromEntries(clientes.map((c) => [c.email ?? c.id, c.es_personal]));
    expect(porCorreo).toEqual({ [emailDe('cliente')]: false, [emailDe('personal')]: true, [emailDe('admin')]: true, [nueva]: false });
    expect((await api.admin.getExpediente(clientes.find((c) => c.email === emailDe('admin'))!.id)).cliente.es_personal).toBe(true);

    // Con datos de ejemplo: el equipo sale marcado y las clientas de ejemplo no.
    const ejemplo = entorno({ ejemplos: true }).api;
    await entrar(ejemplo, 'admin');
    const todas = await ejemplo.admin.getClientes();
    expect(todas.filter((c) => c.es_personal).map((c) => c.email).sort()).toEqual([emailDe('admin'), emailDe('personal')].sort());
    expect(todas.filter((c) => !c.es_personal)).toHaveLength(4);
  });

  it('presentaciones sugeridas = floor((mínimo − stock) / contenido) + 1: comprarlas saca al producto de la lista', async () => {
    const { api } = entorno();
    await entrar(api, 'personal');
    const lata = await api.admin.guardarProducto(productoDe({ nombre: 'Cera en lata', contenido_presentacion: 800, costo_presentacion: 400, stock_minimo: 800 }));
    const caja = await api.admin.guardarProducto(
      productoDe({ nombre: 'Abatelenguas', unidad_medida: 'pz', contenido_presentacion: 100, costo_presentacion: 85, stock_minimo: 100 }),
    );
    const gotero = await api.admin.guardarProducto(
      productoDe({ nombre: 'Ampolleta', unidad_medida: 'ml', contenido_presentacion: 0.25, costo_presentacion: 30, stock_minimo: 0.75 }),
    );
    await api.admin.ajustarInventario(caja.id, 100, 'ajuste'); // justo en el mínimo
    await api.admin.ajustarInventario(gotero.id, 0.25, 'ajuste');
    const repo = await api.admin.getReposicion();
    // Los más urgentes primero (stock − mínimo).
    expect(repo.map((r) => [r.nombre, r.faltante, r.presentaciones_sugeridas, r.costo_estimado])).toEqual([
      ['Cera en lata', 800, 2, 800],
      ['Ampolleta', 0.5, 3, 90],
      ['Abatelenguas', 0, 1, 85],
    ]);
    const costos = new Map([
      [lata.id, 400],
      [caja.id, 85],
      [gotero.id, 30],
    ]);
    await api.admin.registrarCompra({
      items: repo.map((r) => ({ producto_id: r.id, presentaciones: r.presentaciones_sugeridas, costo_presentacion: costos.get(r.id)! })),
    });
    expect(await api.admin.getReposicion()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ESPEC §9 · la firma se hace en el spa (configuracion.firma_en_linea = false)
// ---------------------------------------------------------------------------

describe('firma en el spa (ESPEC §9)', () => {
  it('la reserva en línea no pide ni guarda firma; la clienta no firma desde su cuenta; en cabina sí', async () => {
    const { api } = entorno();
    expect((await api.getConfiguracion()).firma_en_linea).toBe(false); // viene de catalogo.json
    const cejas = await servicio(api, 'cejas');
    await clientaLista(api);
    const r = await api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00') });
    expect(r).toMatchObject({ estado: 'confirmada', requiere_revision: false });
    // Si llega una firma, se ignora: ni se valida ni se guarda.
    await api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '11:00'), firma: { nombre_firmante: '', firma_svg: '<svg><script/></svg>' } });
    await api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '12:00'), firma: FIRMA });
    expect((await api.getMisCitas()).map((c) => c.consentimientos_firmados)).toEqual([0, 0, 0]);
    expect(await api.getMisConsentimientos()).toEqual([]);

    await expect(api.firmarConsentimientoCita(r.id, FIRMA)).rejects.toThrow(M.firmaEnSpa);
    await otraClienta(api);
    await expect(api.firmarConsentimientoCita(r.id, FIRMA)).rejects.toThrow(M.permiso); // primero, de quién es la cita

    // R6 no cambia: sin consentimiento no hay servicio; en la tablet de la cabina se firma y se atiende.
    await entrar(api, 'personal');
    await expect(api.admin.cambiarEstadoCita(r.id, 'en_curso')).rejects.toThrow(M.sinConsentimiento);
    await api.firmarConsentimientoCita(r.id, FIRMA);
    await api.admin.cambiarEstadoCita(r.id, 'en_curso');
    const cita = (await api.admin.getAgenda(MARTES, MARTES)).find((c) => c.id === r.id)!;
    expect(cita).toMatchObject({ estado: 'en_curso', consentimientos_firmados: 1 });

    // Mi cuenta → Documentos: la clienta ve la copia de lo que firmó en el spa.
    await entrar(api, 'cliente');
    const docs = await api.getMisConsentimientos();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ cita_id: r.id, politica_tipo: 'consentimiento_depilacion', nombre_firmante: FIRMA.nombre_firmante });
  });

  it('en cabina se guarda canal "cabina" y quién la capturó; con firma_en_linea = true vuelve la firma del portal', () => {
    const { db, como } = baseDirecta();
    const clienta = como('cliente');
    const personal = como('personal');
    clientaListaDirecta(clienta);
    const cejas = db.servicios.find((s) => s.slug === 'cejas')!;
    const items = [{ servicio_id: cejas.id }];
    const web = R.reservarCita(clienta, { items, inicio: a(MARTES, '10:00'), firma: FIRMA });
    expect(db.consentimientos.filter((k) => k.cita_id === web.id)).toHaveLength(0);
    // Aunque esté cancelada, a la clienta se le dice primero que la firma es en el spa (como en SQL).
    const otra = R.reservarCita(clienta, { items, inicio: a(MARTES, '11:00') });
    R.cancelarCita(personal, otra.id);
    expect(() => R.firmarConsentimientoCita(clienta, otra.id, FIRMA)).toThrow(M.firmaEnSpa);
    expect(() => R.firmarConsentimientoCita(personal, otra.id, FIRMA)).toThrow('Esta cita está cancelada.');

    R.firmarConsentimientoCita(personal, web.id, FIRMA);
    expect(db.consentimientos.find((k) => k.cita_id === web.id)).toMatchObject({ canal: 'cabina', capturado_por: personal.usuarioId });

    db.configuracion.firma_en_linea = true;
    const conFirma = R.reservarCita(clienta, { items, inicio: a(MARTES, '12:00'), firma: FIRMA });
    expect(db.consentimientos.find((k) => k.cita_id === conFirma.id)).toMatchObject({ canal: 'reserva_web' });
    expect(() => R.reservarCita(clienta, { items, inicio: a(MARTES, '13:00') })).toThrow(M.firma);
  });

  it('una menor reserva sin trazo pero con el nombre de quien la acompaña; en cabina firma con su tutor', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    const menor = await otraClienta(api, 'menor@ejemplo.mx', '2010-06-01'); // 16 años
    const pedir = (firma?: DatosFirma) => api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma });
    await expect(pedir()).rejects.toThrow(M.tutor);
    const r = await pedir({ nombre_firmante: '', firma_svg: '', tutor_nombre: 'Rosa López' });
    expect(r.estado).toBe('confirmada');
    await entrar(api, 'personal');
    await expect(api.firmarConsentimientoCita(r.id, FIRMA)).rejects.toThrow(M.tutor);
    await api.firmarConsentimientoCita(r.id, { ...FIRMA, tutor_nombre: 'Rosa López' });
    const exp = await api.admin.getExpediente(menor.cliente!.id);
    expect(exp.consentimientos).toHaveLength(1);
    expect(exp.consentimientos[0].tutor_nombre).toBe('Rosa López');
  });
});

// ---------------------------------------------------------------------------
// ESPEC §10 · tienda de jabones y velas hechos en Ópalo
// ---------------------------------------------------------------------------

/** Productos terminados de la tienda propia: por pieza, a la venta en línea. */
function propio(datos: Partial<ProductoEditable> & Pick<ProductoEditable, 'nombre' | 'categoria'>): ProductoEditable {
  return productoDe({ unidad_medida: 'pz', uso: 'venta', vendible_en_linea: true, precio_venta: 100, hecho_en_opalo: true, ...datos });
}

/**
 * Taller de prueba (sesión de personal): aceite a $0.20/ml, sosa a $0.10/g, etiquetas a $0.50/pz y cera a $0.30/g,
 * comprados hoy; un jabón ($100) y una vela ($250) por pieza, y la fórmula del jabón
 * (10 piezas, 28 días de curado; lote = 500 ml + 100 g + 10 etiquetas = $115, $11.50 por pieza).
 */
async function tallerDePrueba(api: OpaloApi) {
  await entrar(api, 'personal');
  const insumo = (nombre: string, unidad_medida: 'g' | 'ml' | 'pz', contenido_presentacion: number, costo_presentacion: number) =>
    api.admin.guardarProducto(productoDe({ nombre, categoria: 'materia_prima', unidad_medida, contenido_presentacion, costo_presentacion, uso: 'produccion' }));
  const aceite = await insumo('Aceite de prueba', 'ml', 1000, 200);
  const sosa = await insumo('Sosa de prueba', 'g', 1000, 100);
  const etiqueta = await insumo('Etiqueta de prueba', 'pz', 100, 50);
  const cera = await insumo('Cera de prueba', 'g', 1000, 300);
  await api.admin.registrarCompra({
    items: [
      { producto_id: aceite.id, presentaciones: 2, costo_presentacion: 200 },
      { producto_id: sosa.id, presentaciones: 1, costo_presentacion: 100 },
      { producto_id: etiqueta.id, presentaciones: 1, costo_presentacion: 50 },
      { producto_id: cera.id, presentaciones: 1, costo_presentacion: 300 },
    ],
  });
  const jabon = await api.admin.guardarProducto(propio({ nombre: 'Jabón de prueba', categoria: 'jabon' }));
  const vela = await api.admin.guardarProducto(propio({ nombre: 'Vela de prueba', categoria: 'vela', precio_venta: 250 }));
  const formulaJabon = await api.admin.guardarFormula({
    producto_id: jabon.id,
    nombre: 'Jabón de prueba · lote de 10',
    rendimiento_piezas: 10,
    dias_curado: 28,
    instrucciones: null,
    activa: true,
    items: [
      { insumo_id: aceite.id, cantidad: 500 },
      { insumo_id: sosa.id, cantidad: 100 },
      { insumo_id: etiqueta.id, cantidad: 10 },
    ],
  });
  return { aceite, sosa, etiqueta, cera, jabon, vela, formulaJabon };
}

describe('tienda: ficha de productos y existencias (ESPEC §10.1 y §10.3)', () => {
  it('ficha pública, slug, piezas y orden de la tienda', async () => {
    const { api } = entorno();
    await entrar(api, 'personal');
    const guardar = (d: Partial<ProductoEditable> & Pick<ProductoEditable, 'nombre'>) => api.admin.guardarProducto(propio({ categoria: 'jabon', ...d }));
    const porPieza = 'Los jabones, velas y sets se manejan por pieza: unidad "pz" y contenido 1.';
    await expect(guardar({ nombre: 'Jabón X', unidad_medida: 'g' })).rejects.toThrow(porPieza);
    await expect(guardar({ nombre: 'Jabón X', contenido_presentacion: 100 })).rejects.toThrow(porPieza);

    const avena = await guardar({ nombre: 'Jabón de Avena', color_hex: '#abc', descripcion: '  Suave  ', orden: 2 });
    expect(avena).toMatchObject({ slug: 'jabon-de-avena', color_hex: '#aabbcc', descripcion: 'Suave', orden: 2, hecho_en_opalo: true, costo_unitario: 0 });
    const avena2 = await guardar({ nombre: 'Jabón de avena' });
    expect(avena2.slug).toBe('jabon-de-avena-2'); // el nombre se repite: se numera
    await expect(guardar({ nombre: 'Otro', slug: 'Jabón de Avena' })).rejects.toThrow('Ya existe otro producto con ese identificador (slug).');
    await expect(guardar({ nombre: 'Otro', slug: '¡¡!!' })).rejects.toThrow('El identificador (slug) del producto debe tener letras o números.');
    const vela = await guardar({ nombre: 'Vela Ámbar', categoria: 'vela', slug: ' Vela Ámbar Especial ', destacado: true, color_hex: 'rojo', precio_venta: 300 });
    expect(vela).toMatchObject({ slug: 'vela-ambar-especial', color_hex: null, destacado: true });
    const muestra = await guardar({ nombre: 'Jabón de muestra', vendible_en_linea: false });
    expect(muestra.slug).toBe('jabon-de-muestra'); // de la tienda propia: tiene ficha aunque no se venda en línea
    const editado = await api.admin.guardarProducto({ ...avena, precio_venta: 125 });
    expect(editado).toMatchObject({ slug: 'jabon-de-avena', precio_venta: 125 });

    await api.admin.ajustarInventario(avena.id, 3.5, 'ajuste');
    await api.admin.ajustarInventario(vela.id, 1, 'ajuste');
    const tienda = await api.getProductosTienda();
    // Destacados primero; luego categoría, orden y nombre. Lo que no se vende en línea no aparece.
    expect(tienda.map((p) => p.slug)).toEqual(['vela-ambar-especial', 'jabon-de-avena-2', 'jabon-de-avena']);
    expect(tienda.find((p) => p.id === avena.id)).toMatchObject({ stock_disponible: 3, hay_stock: true, precio_venta: 125, descripcion: 'Suave', proximo_lote_listo: null });
    expect(tienda.find((p) => p.id === avena2.id)).toMatchObject({ stock_disponible: 0, hay_stock: false });
    expect(Object.keys(tienda[0])).not.toContain('stock_minimo'); // nada de costos ni datos internos
    expect(Object.keys(tienda[0])).not.toContain('costo_unitario');
  });

  it('al pedir en línea se revisan existencias en piezas completas, sumando renglones repetidos', async () => {
    const { api } = entorno();
    await entrar(api, 'personal');
    const vela = await api.admin.guardarProducto(propio({ nombre: 'Vela de prueba', categoria: 'vela', precio_venta: 300 }));
    await clientaLista(api);
    const pedir = (cantidad: number, otra = 0) =>
      api.crearPedido(
        [{ tipo: 'producto', id: vela.id, cantidad }, ...(otra ? [{ tipo: 'producto' as const, id: vela.id, cantidad: otra }] : [])],
        'efectivo',
      );
    await expect(pedir(1)).rejects.toThrow('Por ahora no tenemos Vela de prueba.');
    await entrar(api, 'personal');
    await api.admin.ajustarInventario(vela.id, 2.5, 'ajuste');
    await entrar(api, 'cliente');
    await expect(pedir(3)).rejects.toThrow('Por ahora sólo quedan 2 piezas de Vela de prueba.');
    await expect(pedir(2, 1)).rejects.toThrow('Por ahora sólo quedan 2 piezas de Vela de prueba.');
    await entrar(api, 'personal');
    await api.admin.ajustarInventario(vela.id, 1, 'merma', 'Se cayó');
    await entrar(api, 'cliente');
    await expect(pedir(2)).rejects.toThrow('Por ahora sólo queda 1 pieza de Vela de prueba.');
    await expect(pedir(1)).resolves.toMatchObject({ total: 300 });
    expect(await api.getMisPedidos()).toHaveLength(1);
  });
});

describe('taller: fórmulas y lotes (ESPEC §10.2)', () => {
  it('fórmulas: validaciones, insumos repetidos sumados y costo con los precios actuales', async () => {
    const { api } = entorno();
    const t = await tallerDePrueba(api);
    const base = {
      producto_id: t.jabon.id,
      nombre: 'Jabón · lote nuevo',
      rendimiento_piezas: 10,
      dias_curado: 28,
      instrucciones: null,
      activa: true,
      items: [{ insumo_id: t.aceite.id, cantidad: 100 }],
    };
    const guardar = (f: Partial<typeof base> & { id?: string }) => api.admin.guardarFormula({ ...base, ...f });
    await expect(guardar({ id: 'no-existe' })).rejects.toThrow('No encontramos esa fórmula.');
    await expect(guardar({ producto_id: '' })).rejects.toThrow('Elige el producto que se elabora con esta fórmula.');
    await expect(guardar({ producto_id: 'no-existe' })).rejects.toThrow('No encontramos ese producto.');
    await expect(guardar({ nombre: '  ' })).rejects.toThrow('Escribe el nombre de la fórmula.');
    await expect(guardar({ nombre: 'F'.repeat(201) })).rejects.toThrow(M.nombreLargo);
    await expect(guardar({ rendimiento_piezas: 0 })).rejects.toThrow('Revisa el rendimiento: cuántas piezas salen de un lote (más de cero).');
    await expect(guardar({ dias_curado: 2.5 })).rejects.toThrow('Revisa los días de curado: días enteros, cero o más.');
    await expect(guardar({ dias_curado: -1 })).rejects.toThrow('Revisa los días de curado: días enteros, cero o más.');
    await expect(guardar({ instrucciones: 'x'.repeat(5001) as unknown as null })).rejects.toThrow(
      'Las instrucciones son muy largas; escríbelas en máximo 5000 caracteres.',
    );
    await expect(guardar({ items: [] })).rejects.toThrow('Agrega al menos un insumo a la fórmula.');
    await expect(guardar({ items: [{ insumo_id: 'no-existe', cantidad: 1 }] })).rejects.toThrow('Uno de los insumos de la fórmula no existe.');
    await expect(guardar({ items: [{ insumo_id: t.jabon.id, cantidad: 1 }] })).rejects.toThrow(
      'Un producto no puede ser insumo de sí mismo: elige la materia prima que lleva.',
    );
    await expect(guardar({ items: [{ insumo_id: t.aceite.id, cantidad: 0 }] })).rejects.toThrow('La cantidad de cada insumo debe ser mayor a cero.');
    expect(await api.admin.getFormulas()).toHaveLength(1); // sólo la del taller de prueba

    let [costo] = await api.admin.getCostosFormulas();
    expect(costo).toMatchObject({
      formula_id: t.formulaJabon,
      producto_nombre: 'Jabón de prueba',
      rendimiento_piezas: 10,
      dias_curado: 28,
      costo_lote: 115,
      costo_pieza: 11.5,
      precio_venta: 100,
      margen_pieza: 88.5,
      margen_pct: 88.5,
    });
    expect(costo.insumos.map((i) => [i.nombre, i.unidad_medida, i.cantidad, i.costo])).toEqual([
      ['Aceite de prueba', 'ml', 500, 100],
      ['Etiqueta de prueba', 'pz', 10, 5],
      ['Sosa de prueba', 'g', 100, 10],
    ]);
    // Con los precios actuales: si el aceite sube a $0.30/ml, el lote cuesta $165.
    await api.admin.registrarCompra({ items: [{ producto_id: t.aceite.id, presentaciones: 1, costo_presentacion: 300 }] });
    [costo] = await api.admin.getCostosFormulas();
    expect(costo).toMatchObject({ costo_lote: 165, costo_pieza: 16.5, margen_pieza: 83.5 });

    // Editar reemplaza los insumos; los repetidos se suman.
    await guardar({ id: t.formulaJabon, dias_curado: 30, items: [{ insumo_id: t.aceite.id, cantidad: 60 }, { insumo_id: t.aceite.id, cantidad: 40.0004 }] });
    const [f] = await api.admin.getFormulas();
    expect(f).toMatchObject({ id: t.formulaJabon, nombre: 'Jabón · lote nuevo', dias_curado: 30, items: [{ insumo_id: t.aceite.id, cantidad: 100 }] });

    await entrar(api, 'cliente');
    await expect(api.admin.getFormulas()).rejects.toThrow(M.permiso);
    await expect(api.admin.guardarFormula({ ...base })).rejects.toThrow(M.permiso);
  });

  it('registrar lote: fórmula escalada, existencias, consumos con su costo y código por tipo y día', async () => {
    const { api } = entorno();
    const t = await tallerDePrueba(api);
    const registrar = (l: Partial<Parameters<OpaloApi['admin']['registrarLote']>[0]>) =>
      api.admin.registrarLote({ producto_id: t.jabon.id, formula_id: t.formulaJabon, ...l });
    await expect(registrar({ producto_id: 'no-existe' })).rejects.toThrow('No encontramos ese producto.');
    await expect(registrar({ formula_id: 'no-existe' })).rejects.toThrow('No encontramos esa fórmula.');
    await expect(registrar({ producto_id: t.vela.id })).rejects.toThrow('Esa fórmula es de otro producto.');
    await expect(registrar({ formula_id: null })).rejects.toThrow('Elige la fórmula o escribe los insumos que usaste.');
    await expect(registrar({ producto_id: t.vela.id, formula_id: null, items: [{ insumo_id: t.aceite.id, cantidad: 100 }] })).rejects.toThrow(
      'Escribe cuántas piezas salen del lote.',
    );
    // Un jabón sin fórmula no tendría curado: se rechaza aunque traiga las piezas y lo que se usó.
    await expect(registrar({ formula_id: null, piezas: 4, items: [{ insumo_id: t.aceite.id, cantidad: 100 }] })).rejects.toThrow(M.jabonSinFormula);
    await expect(registrar({ piezas: -2 })).rejects.toThrow('Revisa las piezas: más de cero.');
    await expect(registrar({ elaborado_en: MARTES })).rejects.toThrow('La fecha de elaboración no puede ser futura.');
    await expect(registrar({ caduca_en: sumarDias(LUNES, -1) })).rejects.toThrow('La caducidad debe ser después de la elaboración.');
    await expect(registrar({ notas: 'n'.repeat(1001) })).rejects.toThrow(M.notasLargas);
    await expect(registrar({ items: [{ insumo_id: 'no-existe', cantidad: 1 }] })).rejects.toThrow('Uno de los insumos del lote no existe.');
    // Hay 2000 ml de aceite: para 45 piezas (500 ml por cada 10) se necesitan 2250.
    await expect(registrar({ piezas: 45 })).rejects.toThrow('No alcanza el inventario de Aceite de prueba: hay 2000 ml y se necesitan 2250 ml.');
    expect(await api.admin.getLotes()).toEqual([]);

    // 15 piezas: la fórmula × 1.5 → 750 ml, 150 g y 15 etiquetas = $172.50 ($11.50 por pieza), en curado 28 días.
    const r1 = await registrar({ piezas: 15, caduca_en: '2027-11-02', notas: 'Primer lote' });
    expect(r1).toEqual({ id: expect.any(String), codigo: 'JAB-261102-01', costo_materiales: 172.5, costo_unitario: 11.5, listo_desde: '2026-11-30', estado: 'en_curado' });
    const consumos = (await api.admin.getMovimientos(null, 100)).filter((m) => m.tipo === 'insumo_produccion');
    expect(consumos.map((m) => [m.producto_nombre, m.cantidad, m.costo_unitario, m.nota]).sort()).toEqual(
      [
        ['Aceite de prueba', -750, 0.2, 'Lote JAB-261102-01'],
        ['Etiqueta de prueba', -15, 0.5, 'Lote JAB-261102-01'],
        ['Sosa de prueba', -150, 0.1, 'Lote JAB-261102-01'],
      ].sort(),
    );
    const stock = async (id: string) => (await api.admin.getProductos()).find((p) => p.id === id)!.stock_actual;
    expect(await stock(t.aceite.id)).toBe(1250);
    expect(await stock(t.jabon.id)).toBe(0); // sigue en curado

    // Con lo que realmente se usó (materiales ajustados): el costo sale de esos materiales y cura igual que su fórmula.
    const r2 = await registrar({ piezas: 4, items: [{ insumo_id: t.aceite.id, cantidad: 200 }, { insumo_id: t.sosa.id, cantidad: 40 }] });
    expect(r2).toMatchObject({ codigo: 'JAB-261102-02', costo_materiales: 44, costo_unitario: 11, listo_desde: '2026-11-30', estado: 'en_curado' });
    expect(await stock(t.jabon.id)).toBe(0);

    // Vela: fórmula sin curado (se libera al registrarla) y elaborada ayer → VEL-261101-01.
    const formulaVela = await api.admin.guardarFormula({
      producto_id: t.vela.id,
      nombre: 'Vela de prueba · 4 frascos',
      rendimiento_piezas: 4,
      dias_curado: 0,
      instrucciones: null,
      activa: true,
      items: [{ insumo_id: t.cera.id, cantidad: 800 }, { insumo_id: t.etiqueta.id, cantidad: 4 }],
    });
    const r3 = await api.admin.registrarLote({ producto_id: t.vela.id, formula_id: formulaVela, elaborado_en: sumarDias(LUNES, -1) });
    expect(r3).toMatchObject({ codigo: 'VEL-261101-01', costo_materiales: 242, costo_unitario: 60.5, estado: 'disponible' });
    // Un producto que no es jabón, vela ni set → PRD.
    const aceiteCorporal = await api.admin.guardarProducto(propio({ nombre: 'Aceite corporal de prueba', categoria: 'corporal' }));
    const r4 = await api.admin.registrarLote({ producto_id: aceiteCorporal.id, piezas: 2, items: [{ insumo_id: t.aceite.id, cantidad: 100 }] });
    expect(r4.codigo).toBe('PRD-261102-01');

    const lotes = await api.admin.getLotes();
    expect(lotes.map((l) => l.codigo)).toEqual(['PRD-261102-01', 'JAB-261102-02', 'JAB-261102-01', 'VEL-261101-01']);
    const curando = await api.admin.getLotes('en_curado');
    expect(curando.map((l) => l.codigo)).toEqual(['JAB-261102-02', 'JAB-261102-01']);
    const enCurado = curando.find((l) => l.id === r1.id);
    expect(enCurado).toMatchObject({
      id: r1.id,
      producto_nombre: 'Jabón de prueba',
      categoria: 'jabon',
      formula_nombre: 'Jabón de prueba · lote de 10',
      elaborado_en: LUNES,
      dias_para_listo: 28,
      caduca_en: '2027-11-02',
      piezas_planeadas: 15,
      piezas_obtenidas: null,
      notas: 'Primer lote',
      liberado_en: null,
    });
    // La tienda avisa cuándo estará listo el lote que cura.
    expect((await api.getProductosTienda()).find((p) => p.id === t.jabon.id)).toMatchObject({ stock_disponible: 0, proximo_lote_listo: '2026-11-30' });
    const produccion = (await api.admin.getMovimientos(t.vela.id)).filter((m) => m.tipo === 'produccion');
    expect(produccion).toMatchObject([{ cantidad: 4, costo_unitario: 60.5, nota: 'Lote VEL-261101-01' }]);

    await entrar(api, 'cliente');
    await expect(api.admin.registrarLote({ producto_id: t.jabon.id, formula_id: t.formulaJabon })).rejects.toThrow(M.permiso);
  });

  it('liberar: respeta el curado (salvo forzar), fija las piezas obtenidas y el costo real; descartar', async () => {
    const { api, fijarHora } = entorno();
    const t = await tallerDePrueba(api);
    const l1 = await api.admin.registrarLote({ producto_id: t.jabon.id, formula_id: t.formulaJabon });
    expect(l1).toMatchObject({ costo_materiales: 115, costo_unitario: 11.5, listo_desde: '2026-11-30' });
    await expect(api.admin.liberarLote(l1.id)).rejects.toThrow('Este lote sigue en curado hasta el 30 de noviembre de 2026.');
    await expect(api.admin.liberarLote('no-existe')).rejects.toThrow('No encontramos ese lote.');
    expect((await api.admin.getResumenHoy()).lotes_listos).toEqual([]);

    // Ya cumplió su curado: aparece en el resumen del día como listo para liberar.
    fijarHora(new Date(a('2026-11-30', '09:00')));
    const resumen = await api.admin.getResumenHoy();
    expect(resumen.lotes_listos.map((l) => [l.id, l.dias_para_listo])).toEqual([[l1.id, 0]]);
    await expect(api.admin.liberarLote(l1.id, 0)).rejects.toThrow('Revisa las piezas obtenidas: más de cero.');
    await api.admin.liberarLote(l1.id, 8); // dos barras no salieron bien: el costo por pieza sube
    const [liberado] = await api.admin.getLotes('disponible');
    expect(liberado).toMatchObject({ id: l1.id, piezas_obtenidas: 8, costo_unitario: 14.375, estado: 'disponible' });
    expect(liberado.liberado_en).not.toBeNull();
    const jabon = (await api.admin.getProductos()).find((p) => p.id === t.jabon.id)!;
    expect(jabon).toMatchObject({ stock_actual: 8, costo_presentacion: 14.38, costo_unitario: 14.38 });
    expect((await api.admin.getMovimientos(t.jabon.id)).filter((m) => m.tipo === 'produccion')).toMatchObject([{ cantidad: 8, costo_unitario: 14.375 }]);
    await expect(api.admin.liberarLote(l1.id)).rejects.toThrow('Este lote ya se liberó.');
    await expect(api.admin.descartarLote(l1.id, 'x')).rejects.toThrow('Este lote ya se liberó.');
    expect((await api.admin.getResumenHoy()).lotes_listos).toEqual([]);

    // Forzar: un lote que todavía cura se puede liberar antes.
    const l2 = await api.admin.registrarLote({ producto_id: t.jabon.id, formula_id: t.formulaJabon, piezas: 5 });
    await expect(api.admin.liberarLote(l2.id)).rejects.toThrow('Este lote sigue en curado hasta el 28 de diciembre de 2026.');
    await api.admin.liberarLote(l2.id, null, true);
    expect((await api.admin.getProductos()).find((p) => p.id === t.jabon.id)!.stock_actual).toBe(13);

    // Descartar: no entra al inventario y su costo es merma del mes.
    const l3 = await api.admin.registrarLote({ producto_id: t.jabon.id, formula_id: t.formulaJabon, piezas: 5 });
    await expect(api.admin.descartarLote(l3.id, '  ')).rejects.toThrow('Escribe por qué se descarta el lote.');
    await expect(api.admin.descartarLote(l3.id, 'n'.repeat(1001))).rejects.toThrow(M.notasLargas);
    await api.admin.descartarLote(l3.id, 'Se cortó la mezcla');
    await expect(api.admin.liberarLote(l3.id, null, true)).rejects.toThrow('Este lote se descartó.');
    await expect(api.admin.descartarLote(l3.id, 'otra vez')).rejects.toThrow('Este lote se descartó.');
    expect((await api.admin.getLotes('descartado')).map((l) => l.id)).toEqual([l3.id]);
    expect((await api.admin.getProductos()).find((p) => p.id === t.jabon.id)!.stock_actual).toBe(13);
  });

  it('márgenes: costo por pieza (el de la fórmula mientras no hay lote), piezas en curado y vendidas en 30 días', async () => {
    const { api, fijarHora } = entorno();
    const t = await tallerDePrueba(api);
    const margen = async () => (await api.admin.getMargenesProductos()).find((m) => m.id === t.jabon.id)!;
    expect(await margen()).toMatchObject({ categoria: 'jabon', precio_venta: 100, costo_unitario: 11.5, margen: 88.5, margen_pct: 88.5, stock_actual: 0, piezas_en_curado: 0, vendidas_30d: 0 });
    const lista = await api.admin.getMargenesProductos();
    expect(lista.some((m) => m.id === t.aceite.id)).toBe(false); // la materia prima no se vende
    expect(lista.find((m) => m.id === t.vela.id)).toMatchObject({ costo_unitario: 0, margen: 250 }); // sin fórmula ni lote

    const l1 = await api.admin.registrarLote({ producto_id: t.jabon.id, formula_id: t.formulaJabon });
    expect(await margen()).toMatchObject({ piezas_en_curado: 10 });
    await api.admin.liberarLote(l1.id, 8, true);
    expect(await margen()).toMatchObject({ costo_unitario: 14.38, margen: 85.62, margen_pct: 85.6, stock_actual: 8, piezas_en_curado: 0 });

    await api.admin.ventaMostrador({ items: [{ tipo: 'producto', id: t.jabon.id, cantidad: 3 }], metodo: 'efectivo' });
    expect(await margen()).toMatchObject({ stock_actual: 5, vendidas_30d: 3 });
    fijarHora(new Date(a('2026-12-03', '12:00')));
    expect(await margen()).toMatchObject({ vendidas_30d: 0 });
  });
});

describe('mostrador y entregas (ESPEC §10.3)', () => {
  it('venta de mostrador: valida, cobra completo, entrega en el acto y sale en resultados (la cortesía no es ingreso)', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    await entrar(api, 'personal');
    const jabon = await api.admin.guardarProducto(propio({ nombre: 'Jabón de prueba', categoria: 'jabon', precio_venta: 120, costo_presentacion: 30 }));
    const soloSpa = await api.admin.guardarProducto(
      propio({ nombre: 'Aceite sólo en el spa', categoria: 'venta', precio_venta: 200, costo_presentacion: 80, vendible_en_linea: false, hecho_en_opalo: false }),
    );
    await api.admin.ajustarInventario(jabon.id, 5, 'ajuste');
    await api.admin.ajustarInventario(soloSpa.id, 1, 'ajuste');
    const vender = (v: Partial<Parameters<OpaloApi['admin']['ventaMostrador']>[0]>) =>
      api.admin.ventaMostrador({ items: [{ tipo: 'producto', id: jabon.id, cantidad: 1 }], metodo: 'efectivo', ...v });
    await expect(vender({ metodo: undefined as unknown as MetodoPago })).rejects.toThrow('Elige el método de pago.');
    await expect(vender({ propina: -5 })).rejects.toThrow('La propina no puede ser negativa.');
    await expect(vender({ notas: 'n'.repeat(1001) })).rejects.toThrow(M.notasLargas);
    await expect(vender({ cliente_id: 'no-existe' })).rejects.toThrow('No encontramos a esa clienta.');
    await expect(vender({ items: [] })).rejects.toThrow('Tu carrito está vacío.');
    await expect(vender({ items: [{ tipo: 'producto', id: 'no-existe', cantidad: 1 }] })).rejects.toThrow(M.noALaVenta);
    await expect(vender({ items: [{ tipo: 'servicio', id: cejas.id, cantidad: 1 }] })).rejects.toThrow(M.serviciosSinClienta);
    await expect(vender({ items: [{ tipo: 'producto', id: jabon.id, cantidad: 6 }] })).rejects.toThrow('Por ahora sólo quedan 5 piezas de Jabón de prueba.');
    await expect(vender({ items: [{ tipo: 'producto', id: jabon.id, cantidad: 0 }] })).rejects.toThrow(M.cantidadMinima);
    expect(await api.admin.getPedidos()).toEqual([]); // un error no deja nada a medias

    // En el spa se vende también lo que no está en la tienda en línea.
    const v = await vender({
      items: [{ tipo: 'producto', id: jabon.id, cantidad: 2 }, { tipo: 'producto', id: soloSpa.id, cantidad: 1 }],
      metodo: 'tarjeta',
      propina: 30,
      notas: 'Para regalo',
    });
    expect(v).toEqual({ id: expect.any(String), folio: 'OP-00001', total: 440 });
    const [p] = await api.admin.getPedidos('pagado');
    expect(p).toMatchObject({
      id: v.id,
      cliente_id: null,
      cliente_nombre: 'Venta de mostrador',
      origen: 'mostrador',
      estado: 'pagado',
      total: 440,
      pagado: 440,
      metodo_pago_preferido: 'tarjeta',
      notas: 'Para regalo',
      tiene_productos: true,
    });
    expect(p.pagado_en).not.toBeNull();
    expect(p.entregado_en).not.toBeNull();
    expect(p.items.map((i) => [i.descripcion, i.cantidad, i.importe])).toEqual([['Jabón de prueba', 2, 240], ['Aceite sólo en el spa', 1, 200]]);
    const ventas = (await api.admin.getMovimientos(jabon.id)).filter((m) => m.tipo === 'venta');
    expect(ventas).toMatchObject([{ cantidad: -2, costo_unitario: 30, nota: 'Venta del pedido OP-00001' }]);
    await expect(vender({ items: [{ tipo: 'producto', id: soloSpa.id, cantidad: 1 }] })).rejects.toThrow('Por ahora no tenemos Aceite sólo en el spa.');
    expect((await api.admin.getResumenHoy()).pedidos_por_entregar).toBe(0);

    await vender({ metodo: 'cortesia', notas: 'Cortesía' }); // un jabón de cortesía: su costo sí cuenta
    await entrar(api, 'admin');
    const [mes] = await api.admin.getResultados(1);
    expect(mes).toMatchObject({ ingresos: 440, propinas: 30, costo_ventas: 170, mermas: 0, utilidad: 270 });
    // Una venta sin clienta registrada no es de ninguna clienta.
    await entrar(api, 'cliente');
    expect(await api.getMisPedidos()).toEqual([]);
    await expect(vender({})).rejects.toThrow(M.permiso);
  });

  it('servicios y paquetes en mostrador: con la clienta elegida se vuelven sus créditos (aunque no se vendan en línea)', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    const express = await paquete(api, 'express');
    const sesion = await entrar(api, 'cliente');
    await entrar(api, 'admin');
    await api.admin.guardarServicio({ ...cejas, vendible_en_linea: false });
    const v = await api.admin.ventaMostrador({
      items: [
        { tipo: 'servicio', id: cejas.id, cantidad: 2 },
        { tipo: 'paquete', id: express.id, cantidad: 1, regalo_para: 'Ana' },
      ],
      metodo: 'efectivo',
      cliente_id: sesion.cliente!.id,
    });
    expect(v.total).toBe(540);
    const [p] = await api.admin.getPedidos();
    expect(p).toMatchObject({ origen: 'mostrador', cliente_nombre: 'Mariana López (ejemplo)', estado: 'pagado', tiene_productos: false, entregado_en: null });
    await expect(api.admin.marcarEntregado(v.id)).rejects.toThrow('Este pedido no tiene productos que entregar.');

    await entrar(api, 'cliente');
    const creditos = await api.getMisCreditos();
    expect(creditos.find((c) => c.servicio_id === cejas.id)).toMatchObject({ cantidad: 2, codigo_regalo: null });
    expect(creditos.find((c) => c.paquete_id === express.id)?.codigo_regalo).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect((await api.getMisPedidos()).map((x) => x.origen)).toEqual(['mostrador']);
    await expect(api.crearPedido([{ tipo: 'servicio', id: cejas.id, cantidad: 1 }], 'efectivo')).rejects.toThrow(M.noVendible);
  });

  it('pedido en línea con productos: pagado queda por entregar hasta que el personal lo entrega', async () => {
    const { api, fijarHora } = entorno();
    await entrar(api, 'personal');
    const jabon = await api.admin.guardarProducto(propio({ nombre: 'Jabón de prueba', categoria: 'jabon', precio_venta: 120 }));
    await api.admin.ajustarInventario(jabon.id, 3, 'ajuste');
    await clientaLista(api);
    const ped = await api.crearPedido([{ tipo: 'producto', id: jabon.id, cantidad: 2 }], 'transferencia');
    const [mio] = await api.getMisPedidos();
    expect(mio).toMatchObject({ origen: 'web', tiene_productos: true, entregado_en: null, cliente_nombre: 'Mariana López (ejemplo)' });
    await expect(api.admin.marcarEntregado(ped.id)).rejects.toThrow(M.permiso);

    await entrar(api, 'personal');
    await expect(api.admin.marcarEntregado('no-existe')).rejects.toThrow('No encontramos ese pedido.');
    await expect(api.admin.marcarEntregado(ped.id)).rejects.toThrow('Este pedido todavía no está pagado.');
    expect((await api.admin.getResumenHoy()).pedidos_por_entregar).toBe(0);
    await api.admin.registrarPago({ monto: 240, metodo: 'transferencia', pedido_id: ped.id });
    expect((await api.admin.getResumenHoy()).pedidos_por_entregar).toBe(1);
    await api.admin.marcarEntregado(ped.id);
    const [entregado] = await api.admin.getPedidos('pagado');
    expect(entregado.entregado_en).toBe(AHORA.toISOString());
    fijarHora(new Date(a(MARTES, '12:00')));
    await api.admin.marcarEntregado(ped.id); // otra vez: no cambia la fecha
    expect((await api.admin.getPedidos('pagado'))[0].entregado_en).toBe(AHORA.toISOString());
    expect((await api.admin.getResumenHoy()).pedidos_por_entregar).toBe(0);
  });

  it('un pedido en línea no aparta piezas: si se agotan antes de pagarlo, el pago no pasa y el stock no queda en negativo', async () => {
    const { api } = entorno();
    await entrar(api, 'personal');
    const jabon = await api.admin.guardarProducto(propio({ nombre: 'Jabón de prueba', categoria: 'jabon', precio_venta: 120 }));
    await api.admin.ajustarInventario(jabon.id, 3, 'ajuste');
    await clientaLista(api);
    const ped = await api.crearPedido([{ tipo: 'producto', id: jabon.id, cantidad: 2 }], 'efectivo');

    await entrar(api, 'personal');
    await api.admin.ventaMostrador({ items: [{ tipo: 'producto', id: jabon.id, cantidad: 2 }], metodo: 'efectivo' });
    await expect(api.admin.registrarPago({ monto: 240, metodo: 'efectivo', pedido_id: ped.id })).rejects.toThrow(
      'Por ahora sólo queda 1 pieza de Jabón de prueba.',
    );
    const [pendiente] = await api.admin.getPedidos('pendiente_pago');
    expect(pendiente).toMatchObject({ id: ped.id, pagado: 0 });
    expect((await api.admin.getProductos()).find((p) => p.id === jabon.id)!.stock_actual).toBe(1);
    // Un anticipo que no completa el total sí se registra (todavía no se entrega nada).
    await api.admin.registrarPago({ monto: 1, metodo: 'efectivo', pedido_id: ped.id });
    expect((await api.admin.getPedidos('pendiente_pago'))[0].pagado).toBe(1);
  });
});

describe('resultados con costo de ventas y mermas (ESPEC §10.4)', () => {
  it('la merma y el lote descartado cuentan en su mes; la materia prima de un lote no es gasto', async () => {
    const { api, fijarHora } = entorno({ ahora: new Date(a('2026-10-30', '12:00')) });
    const t = await tallerDePrueba(api);
    const lote = await api.admin.registrarLote({ producto_id: t.jabon.id, formula_id: t.formulaJabon }); // $115 en octubre
    fijarHora(new Date(a(LUNES, '12:00')));
    await api.admin.descartarLote(lote.id, 'Se cortó la mezcla'); // noviembre
    await api.admin.ajustarInventario(t.aceite.id, 100, 'merma', 'Se derramó'); // 100 ml × $0.20
    await entrar(api, 'admin');
    const [oct, nov] = await api.admin.getResultados(2);
    // Compra del taller de prueba: 2 × $200 + $100 + $50 + $300 = $850; los insumos del lote no son gasto del mes.
    expect(oct).toMatchObject({ mes: '2026-10-01', costo_insumos: 0, costo_ventas: 0, mermas: 0, compras: 850, utilidad: 0, flujo: -850 });
    expect(nov).toMatchObject({ mes: '2026-11-01', mermas: 135, utilidad: -135, flujo: 0 });
    expect((await api.admin.getResumenHoy()).mes_actual).toMatchObject({ mermas: 135 });
  });
});

describe('datos de ejemplo del taller y la tienda', () => {
  it('jabones, velas y set con ficha completa; materia prima, fórmulas, lotes, ventas y resultados', async () => {
    const aviso = vi.spyOn(console, 'warn');
    const { api } = entorno({ ejemplos: true, ahora: ANTES_DE_ABRIR });
    const tienda = await api.getProductosTienda();
    const propios = tienda.filter((p) => p.hecho_en_opalo);
    expect(propios.filter((p) => p.categoria === 'jabon')).toHaveLength(4);
    expect(propios.filter((p) => p.categoria === 'vela')).toHaveLength(3);
    expect(propios.filter((p) => p.categoria === 'set')).toHaveLength(1);
    expect(propios.every((p) => CATEGORIAS_TIENDA.includes(p.categoria) && p.nombre.endsWith('(ejemplo)'))).toBe(true);
    for (const p of propios) {
      for (const campo of ['slug', 'descripcion', 'aroma', 'ingredientes', 'modo_uso', 'advertencias', 'contenido_neto'] as const)
        expect(p[campo], `${p.nombre}: ${campo}`).toBeTruthy();
      expect(p.color_hex).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(p.precio_venta).toBeGreaterThan(0);
    }
    expect(new Set(propios.map((p) => p.color_hex)).size).toBe(propios.length);
    expect(propios.filter((p) => p.destacado)).toHaveLength(2);
    expect(tienda.slice(0, 2).every((p) => p.destacado)).toBe(true);
    for (const v of propios.filter((p) => p.categoria === 'vela')) {
      expect(v.advertencias).toContain('sin supervisión');
      expect(v.advertencias).toContain('mecha');
      expect(v.advertencias).toContain('niñas, niños y mascotas');
    }
    // Agotado, con un lote de jabón que estará listo en 10 días: "disponible desde…".
    const agotado = propios.find((p) => !p.hay_stock && p.proximo_lote_listo)!;
    expect(agotado).toMatchObject({ categoria: 'jabon', stock_disponible: 0, proximo_lote_listo: sumarDias(HOY_PREVIO, 10) });
    expect(propios.filter((p) => p.hay_stock).length).toBeGreaterThanOrEqual(6);

    await entrar(api, 'personal');
    const productos = await api.admin.getProductos();
    expect(productos.every((p) => p.stock_actual >= 0)).toBe(true);
    const materia = productos.filter((p) => p.uso === 'produccion');
    for (const nombre of [
      'Aceite de oliva',
      'Aceite de coco',
      'Manteca de karité',
      'Sosa cáustica',
      'Agua destilada',
      'Avena coloidal',
      'Aceite esencial de lavanda',
      'Carbón activado',
      'Arcilla rosa',
      'Cera de soya',
      'Mechas de algodón',
      'Fragancia de vainilla',
      'Frascos ámbar',
      'Etiquetas',
    ])
      expect(materia.some((m) => m.nombre.startsWith(nombre)), nombre).toBe(true);
    expect(materia.every((m) => m.nombre.endsWith('(ejemplo)') && m.costo_unitario > 0)).toBe(true);
    expect((await api.admin.getReposicion()).some((r) => materia.some((m) => m.id === r.id))).toBe(true); // "se acabó" algo del taller

    const formulas = await api.admin.getFormulas();
    expect(formulas).toHaveLength(8);
    const categoriaDe = new Map(productos.map((p) => [p.id, p.categoria]));
    expect(formulas.filter((f) => categoriaDe.get(f.producto_id) === 'jabon').every((f) => f.dias_curado === 28)).toBe(true);
    expect(formulas.filter((f) => categoriaDe.get(f.producto_id) === 'vela').every((f) => f.dias_curado === 2)).toBe(true);
    expect((await api.admin.getCostosFormulas()).every((c) => c.costo_pieza > 0 && (c.margen_pct ?? 0) > 0)).toBe(true);

    const lotes = await api.admin.getLotes();
    expect(lotes.every((l) => /^(JAB|VEL|SET)-\d{6}-\d{2}$/.test(l.codigo))).toBe(true);
    expect(lotes.some((l) => l.estado === 'en_curado' && l.categoria === 'jabon' && l.dias_para_listo === 10)).toBe(true);
    expect(lotes.filter((l) => l.estado === 'disponible').length).toBeGreaterThanOrEqual(5);
    expect(lotes.some((l) => l.estado === 'descartado')).toBe(true);
    expect(lotes.some((l) => l.codigo.startsWith('SET-'))).toBe(true);
    const resumen = await api.admin.getResumenHoy();
    expect(resumen.lotes_listos).toHaveLength(1);
    expect(resumen.lotes_listos[0].dias_para_listo).toBeLessThanOrEqual(0);
    expect(resumen.pedidos_por_entregar).toBe(1);

    const margenes = await api.admin.getMargenesProductos();
    expect(margenes.some((m) => m.vendidas_30d > 0)).toBe(true);
    expect(margenes.some((m) => m.piezas_en_curado > 0)).toBe(true);
    expect(margenes.filter((m) => propios.some((p) => p.id === m.id)).every((m) => m.costo_unitario > 0 && (m.margen ?? 0) > 0)).toBe(true);

    const pedidos = await api.admin.getPedidos();
    expect(pedidos.some((p) => p.origen === 'mostrador' && p.cliente_id === null && p.cliente_nombre === 'Venta de mostrador')).toBe(true);
    expect(pedidos.some((p) => p.origen === 'mostrador' && p.cliente_id !== null)).toBe(true);
    expect(pedidos.some((p) => p.origen === 'mostrador' && p.metodo_pago_preferido === 'cortesia')).toBe(true);
    expect(pedidos.filter((p) => p.origen === 'mostrador').every((p) => p.estado === 'pagado' && p.entregado_en !== null)).toBe(true);
    expect(pedidos.some((p) => p.origen === 'web' && p.estado === 'pagado' && p.tiene_productos && p.entregado_en === null)).toBe(true);
    expect(pedidos.some((p) => p.origen === 'web' && p.entregado_en !== null)).toBe(true);

    await entrar(api, 'admin');
    const resultados = await api.admin.getResultados(4);
    expect(resultados.some((r) => r.costo_ventas > 0)).toBe(true);
    expect(resultados.some((r) => r.mermas > 0)).toBe(true);
    for (const r of resultados) expect(r.utilidad).toBeCloseTo(r.ingresos - r.costo_insumos - r.costo_ventas - r.mermas - r.gastos, 1);
    expect(aviso).not.toHaveBeenCalled();
  });
});

describe('utilidades del taller', () => {
  it('fecha y cantidad legibles (como fecha_legible y cantidad_legible) y slug (como slug_de)', () => {
    expect(fechaLegible('2026-11-12')).toBe('12 de noviembre de 2026');
    expect(fechaLegible('2027-01-01')).toBe('1 de enero de 2027');
    expect(cantidadLegible(12.5)).toBe('12.5');
    expect(cantidadLegible(300)).toBe('300');
    expect(cantidadLegible(0.1 + 0.2)).toBe('0.3');
    expect(cantidadLegible(-0)).toBe('0');
    expect(slugDe('Jabón de Avena (ejemplo)')).toBe('jabon-de-avena-ejemplo');
    expect(slugDe('  ¡Vela Ñandú!  ')).toBe('vela-nandu');
    expect(slugDe('¿?')).toBe('');
  });
});
