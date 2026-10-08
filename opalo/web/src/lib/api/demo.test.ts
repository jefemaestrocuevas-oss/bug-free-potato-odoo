import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearApiDemo, FUENTES_DEMO } from './demo';
import { CUENTAS_DEMO, PASSWORD_DEMO } from './cuentasDemo';
import type { Ctx } from './demo/permisos';
import * as R from './demo/reglas';
import { sembrar } from './demo/sembrado';
import { sha256 } from './demo/utilidades';
import { fechaLocal, isoDesdeLocal, sumarDias } from '../format';
import { POLITICAS_GENERALES, type DatosFirma, type OpaloApi, type Rol } from './tipos';

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
};

const FIRMA: DatosFirma = {
  nombre_firmante: 'Mariana López',
  firma_svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200"><path d="M10 10 L50 60"/></svg>',
};

function entorno(op: { ahora?: Date; ejemplos?: boolean; almacenamiento?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null } = {}) {
  let ahora = op.ahora ?? AHORA;
  const api = crearApiDemo({
    latenciaMs: 0,
    almacenamiento: op.almacenamiento ?? null,
    ahora: () => ahora,
    datosEjemplo: op.ejemplos ?? false,
  });
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

/** Otra clienta registrada y lista para reservar. */
async function otraClienta(api: OpaloApi, email = 'otra@ejemplo.mx', fecha_nacimiento: string | null = '1990-01-01') {
  await api.cerrarSesion();
  await api.registrarse({ email, password: 'secreta1', nombre: 'Otra', apellidos: 'Clienta', telefono: '4429999999', fecha_nacimiento });
  await aceptarGenerales(api);
  await fichaCon(api);
}

const a = (fecha: string, hhmm: string) => isoDesdeLocal(fecha, hhmm);

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
  it('reserva feliz: confirmada, con consentimiento, precio del servidor y el horario se ocupa', async () => {
    const { api } = entorno();
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

  it('pide sesión, políticas, ficha y consentimiento para datos de salud', async () => {
    const { api } = entorno();
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

  it('edad mínima y tutor para menores', async () => {
    const { api } = entorno();
    await clientaLista(api);
    const cejas = await servicio(api, 'cejas');
    const datos = { nombre: 'Mariana', apellidos: 'López', telefono: null, acepta_promociones: false };
    await api.actualizarMisDatos({ ...datos, fecha_nacimiento: '2012-01-01' }); // 14 años
    const pedir = (firma: DatosFirma) => api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma });
    await expect(pedir(FIRMA)).rejects.toThrow(M.edad);
    await api.actualizarMisDatos({ ...datos, fecha_nacimiento: '2010-06-01' }); // 16 años
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
    const cera = await api.admin.guardarProducto({
      nombre: 'Cera de prueba',
      marca: null,
      categoria: 'cera',
      unidad_medida: 'g',
      presentacion: 'Lata 800 g',
      contenido_presentacion: 800,
      costo_presentacion: 400,
      stock_minimo: 100,
      proveedor_id: null,
      uso: 'cabina',
      precio_venta: null,
      vendible_en_linea: false,
      activo: true,
      notas: null,
    });
    expect(cera.costo_unitario).toBe(0.5);
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

    await entrar(api, 'cliente');
    await api.firmarConsentimientoCita(r.id, FIRMA);
    await entrar(api, 'personal');
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
    const crema = await api.admin.guardarProducto({
      nombre: 'Crema para casa',
      marca: null,
      categoria: 'venta',
      unidad_medida: 'pz',
      presentacion: 'Tubo',
      contenido_presentacion: 1,
      costo_presentacion: 100,
      stock_minimo: 1,
      proveedor_id: null,
      uso: 'venta',
      precio_venta: 250,
      vendible_en_linea: true,
      activo: true,
      notas: null,
    });
    await api.admin.ajustarInventario(crema.id, 5, 'ajuste', 'Inventario inicial');
    expect(await api.getProductosTienda()).toEqual([
      { id: crema.id, nombre: 'Crema para casa', marca: null, presentacion: 'Tubo', precio_venta: 250, hay_stock: true },
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
    const cera = await api.admin.guardarProducto({
      nombre: 'Cera',
      marca: null,
      categoria: 'cera',
      unidad_medida: 'g',
      presentacion: 'Lata',
      contenido_presentacion: 1000,
      costo_presentacion: 500,
      stock_minimo: 0,
      proveedor_id: null,
      uso: 'cabina',
      precio_venta: null,
      vendible_en_linea: false,
      activo: true,
      notas: null,
    });
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
      'La hora de salida debe ser después de la de entrada.',
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
      'Ya existe otro registro con ese identificador (slug).',
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
    expect(misCitas.filter((c) => c.estado === 'confirmada').length).toBe(2);
    const creditos = await api.getMisCreditos();
    expect(creditos.some((c) => c.codigo_regalo)).toBe(true);
    expect(creditos.some((c) => c.paquete_id && c.usados === 1 && c.restantes === 1)).toBe(true);

    await entrar(api, 'admin');
    const resumen = await api.admin.getResumenHoy();
    expect(resumen.citas_hoy).toHaveLength(1);
    expect(resumen.por_revisar).toBe(1);
    expect(resumen.reposicion.length).toBeGreaterThanOrEqual(3);
    expect(resumen.pedidos_pendientes).toBe(1);
    expect(resumen.gastos_por_vencer.length).toBeGreaterThan(0);

    const agenda = await api.admin.getAgenda(sumarDias(MIERCOLES, -80), sumarDias(MIERCOLES, 20));
    expect(agenda.some((c) => c.estado === 'pendiente' && c.requiere_revision && c.alertas.length > 0)).toBe(true);
    expect(agenda.some((c) => c.estado === 'confirmada' && c.consentimientos_firmados === 0)).toBe(true);
    expect(agenda.some((c) => c.estado === 'no_asistio')).toBe(true);
    for (const c of agenda.filter((x) => x.estado === 'completada')) expect(c.consentimientos_firmados).toBeGreaterThan(0);
    expect((await api.admin.getBloqueos(MIERCOLES, sumarDias(MIERCOLES, 20))).length).toBe(1);

    expect((await api.admin.getPedidos('pagado')).length).toBe(1);
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
function baseDirecta(ahora = AHORA) {
  const db = sembrar(FUENTES_DEMO, ahora, { ejemplos: false });
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
    await expect(api.admin.completarCita(ausente.id)).rejects.toThrow('Esta cita está cancelada');
    await expect(api.admin.cambiarEstadoCita(ausente.id, 'completada')).rejects.toThrow('Esta cita está cancelada');
    const agenda = await api.admin.getAgenda(MARTES, MARTES);
    expect(agenda.map((c) => c.estado).sort()).toEqual(['confirmada', 'no_asistio']);
  });

  it('una cita completada ya no cambia de estado', async () => {
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    await clientaLista(api);
    const r = await api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, '10:00'), firma: FIRMA });
    await entrar(api, 'personal');
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

  it('edad mínima y tutor se miden el día de la cita, no hoy', async () => {
    // Hoy es lunes 2 de noviembre de 2026; las citas son el martes 3.
    const { api } = entorno();
    const cejas = await servicio(api, 'cejas');
    const sesion = await entrar(api, 'cliente');
    await aceptarGenerales(api);
    await fichaCon(api);
    const datos = { nombre: 'Mariana', apellidos: 'López', telefono: null, acepta_promociones: false };
    const nacio = (fecha_nacimiento: string) => api.actualizarMisDatos({ ...datos, fecha_nacimiento });
    const conTutor: DatosFirma = { ...FIRMA, tutor_nombre: 'Rosa López' };
    const pedir = (hhmm: string, firma: DatosFirma) => api.reservarCita({ items: [{ servicio_id: cejas.id }], inicio: a(MARTES, hhmm), firma });

    await nacio('2011-11-04'); // 14 hoy y 14 el martes
    await expect(pedir('10:00', conTutor)).rejects.toThrow(M.edad);
    await nacio('2011-11-03'); // 14 hoy, 15 el martes
    await expect(pedir('10:00', FIRMA)).rejects.toThrow(M.tutor);
    const quince = await pedir('10:00', conTutor);
    await nacio('2008-11-03'); // 17 hoy, 18 el martes: ya no necesita tutor
    const dieciocho = await pedir('11:00', FIRMA);
    const docs = await api.getMisConsentimientos();
    expect(docs.find((d) => d.cita_id === quince.id)!.tutor_nombre).toBe('Rosa López');
    expect(docs.find((d) => d.cita_id === dieciocho.id)!.tutor_nombre).toBeNull();

    // El personal agenda y la clienta firma después: también cuenta la fecha de la cita.
    await entrar(api, 'personal');
    const staff = (hhmm: string) =>
      api.admin.reservarParaCliente({ cliente_id: sesion.cliente!.id, items: [{ servicio_id: cejas.id }], inicio: a(MARTES, hhmm), origen: 'whatsapp' });
    const porWhatsApp = await staff('12:00');
    await entrar(api, 'cliente');
    await api.firmarConsentimientoCita(porWhatsApp.id, conTutor);
    expect((await api.getMisConsentimientos()).find((d) => d.cita_id === porWhatsApp.id)!.tutor_nombre).toBeNull();
    await nacio('2011-11-03');
    await entrar(api, 'personal');
    await expect(staff('13:00')).resolves.toMatchObject({ estado: 'confirmada' });
    await entrar(api, 'cliente');
    await nacio('2011-11-04');
    await entrar(api, 'personal');
    await expect(staff('14:00')).rejects.toThrow(M.edad);
  });

  it('se puede firmar una cita completada y cada versión nueva de la política se firma aparte', async () => {
    const { api } = entorno();
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
    await expect(api.firmarConsentimientoCita(otra.id, FIRMA)).rejects.toThrow('Esta cita ya no admite firmas.');
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
