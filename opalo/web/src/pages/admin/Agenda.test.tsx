// Agenda: tarjetas de cita, «Firmar en cabina» en modo kiosco (sin salida al panel sin contraseña)
// y pagos mayores al saldo.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CitaDetalle, Configuracion, ExpedienteCliente, Politica } from '../../lib/api';
import { ErrorOpalo } from '../../lib/api/tipos';
import { salirCabina } from '../../components/admin/cabina';
import { ModoCabina } from '../../components/admin/ModoCabina';
import { aNumero } from '../../components/admin/util';
import Agenda from './Agenda';

const m = vi.hoisted(() => ({
  admin: {
    getAgenda: vi.fn(),
    getBloqueos: vi.fn(),
    getPersonal: vi.fn(),
    getExpediente: vi.fn(),
    registrarPago: vi.fn(),
    cambiarEstadoCita: vi.fn(),
    completarCita: vi.fn(),
  },
  getPoliticasVigentes: vi.fn(),
  getCatalogo: vi.fn(),
  getConfiguracion: vi.fn(),
  firmarConsentimientoCita: vi.fn(),
  iniciarSesion: vi.fn(),
  cerrarSesion: vi.fn(),
  cancelarCita: vi.fn(),
}));
vi.mock('../../lib/api', async () => ({ ...(await vi.importActual<object>('../../lib/api/tipos')), api: { modo: 'demo', ...m } }));
vi.mock('../../lib/sesion', () => ({
  useSesion: () => ({
    sesion: { user_id: 'u-esp', email: 'especialista@ejemplo.mx', rol: 'personal', cliente: null },
    cargando: false,
    refrescar: async () => undefined,
    esPersonal: true,
    esAdmin: false,
  }),
}));

const FECHA = '2026-10-09';

function cita(extra: Partial<CitaDetalle> = {}): CitaDetalle {
  return {
    id: 'cita-1',
    cliente_id: 'cl-1',
    cliente_nombre: 'Fernanda Ríos',
    cliente_telefono: '4420000003',
    inicio: '2026-10-09T23:00:00Z',
    fin: '2026-10-10T00:00:00Z',
    duracion_min: 60,
    estado: 'confirmada',
    origen: 'whatsapp',
    primera_vez: false,
    requiere_revision: false,
    alertas: [],
    notas_cliente: null,
    total: 280,
    personal_id: 'p-1',
    personal_nombre: 'Especialista',
    personal_titulo: null,
    cabina_nombre: 'Cabina 1',
    consentimientos_firmados: 0,
    pagado: 0,
    items: [{ nombre: 'Bikini brasileño', precio: 280, duracion_min: 60, servicio_id: 's-bikini', paquete_id: null }],
    ...extra,
  };
}

const POLITICA: Politica = {
  id: 'pol-dep',
  tipo: 'consentimiento_depilacion',
  version: 1,
  titulo: 'Consentimiento de depilación',
  contenido_md: 'Texto del consentimiento.',
  hash_sha256: null,
  vigente_desde: null,
};

let contenedor: HTMLDivElement;
let raiz: Root;

async function esperar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function montar(citas: CitaDetalle[]) {
  m.admin.getAgenda.mockResolvedValue(citas);
  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={[`/admin/agenda?fecha=${FECHA}`]}>
        <Agenda />
        <ModoCabina />
      </MemoryRouter>,
    );
  });
  await esperar();
}

function boton(texto: string | RegExp, dentro: ParentNode = document.body): HTMLButtonElement {
  const b = [...dentro.querySelectorAll('button')].find((x) => {
    const t = x.textContent?.trim() ?? '';
    return typeof texto === 'string' ? t.startsWith(texto) : texto.test(t);
  });
  if (!b) throw new Error(`No encontré el botón «${texto}»`);
  return b;
}

function escribir(el: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function enviar(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await esperar();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  m.admin.getBloqueos.mockResolvedValue([]);
  m.admin.getPersonal.mockResolvedValue([]);
  m.admin.getExpediente.mockResolvedValue({
    cliente: { id: 'cl-1', nombre: 'Fernanda', apellidos: 'Ríos', telefono: '4420000003', email: null, fecha_nacimiento: '1998-01-01', tiene_cuenta: false },
    ficha: null,
    citas: [],
    pedidos: [],
    creditos: [],
    consentimientos: [],
  } as unknown as ExpedienteCliente);
  m.getPoliticasVigentes.mockResolvedValue([POLITICA]);
  m.getCatalogo.mockResolvedValue({ categorias: [], servicios: [{ id: 's-bikini', tipo_consentimiento: 'consentimiento_depilacion' }], paquetes: [] });
  m.getConfiguracion.mockResolvedValue({ edad_mayoria: 18 } as Configuracion);
  m.admin.registrarPago.mockResolvedValue(undefined);
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  act(() => salirCabina());
  window.sessionStorage.clear();
  contenedor.remove();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('Agenda', () => {
  it('muestra la tarjeta de la cita con su saldo y sus acciones', async () => {
    await montar([cita()]);
    const tarjeta = contenedor.querySelector('article.adm-cita')!;
    expect(tarjeta).toBeTruthy();
    expect(tarjeta.textContent).toContain('Fernanda Ríos');
    expect(tarjeta.textContent).toContain('Saldo $280');
    expect(boton('Firmar en cabina', tarjeta)).toBeTruthy();
    expect(boton('Registrar pago', tarjeta)).toBeTruthy();
  });

  it('«Firmar en cabina» deja el panel inerte y sólo se sale con la contraseña de quien entregó la tablet', async () => {
    await montar([cita()]);
    await act(async () => boton('Firmar en cabina', contenedor).click());
    await esperar();
    await act(async () => boton('Entregar la tablet a la clienta').click());
    await esperar();

    const cabina = document.querySelector('.adm-cabina')!;
    expect(cabina).toBeTruthy();
    expect(cabina.textContent).toContain('Hola, Fernanda');
    expect(cabina.textContent).toContain('Texto del consentimiento.');
    // Ni la ventana del personal ni el panel quedan a la mano.
    expect(document.querySelector('.adm-modal')).toBeNull();
    expect(contenedor.hasAttribute('inert')).toBe(true);
    expect(window.sessionStorage.getItem('opalo-modo-cabina')).toContain('cita-1');

    // Escape no la cierra.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('.adm-cabina')).toBeTruthy();

    // Contraseña equivocada: sigue bloqueada.
    await act(async () => boton('Soy del equipo').click());
    const clave = document.querySelector<HTMLInputElement>('#cabina-clave')!;
    expect(clave.type).toBe('password');
    m.iniciarSesion.mockRejectedValueOnce(new ErrorOpalo('Correo o contraseña incorrectos.', 'credenciales'));
    await act(async () => escribir(clave, 'otra'));
    await enviar(clave.form!);
    expect(document.querySelector('.adm-cabina')?.textContent).toContain('La contraseña no es correcta');

    // Contraseña correcta: vuelve el panel y se recarga la agenda.
    const lecturas = m.admin.getAgenda.mock.calls.length;
    m.iniciarSesion.mockResolvedValueOnce({});
    await act(async () => escribir(clave, 'la-buena'));
    await enviar(clave.form!);
    expect(m.iniciarSesion).toHaveBeenLastCalledWith('especialista@ejemplo.mx', 'la-buena');
    expect(document.querySelector('.adm-cabina')).toBeNull();
    expect(contenedor.hasAttribute('inert')).toBe(false);
    expect(window.sessionStorage.getItem('opalo-modo-cabina')).toBeNull();
    expect(m.admin.getAgenda.mock.calls.length).toBeGreaterThan(lecturas);
    expect(m.firmarConsentimientoCita).not.toHaveBeenCalled();
  });

  it('un pago mayor al saldo no se registra sin confirmar y la diferencia puede pasar a propina', async () => {
    await montar([cita()]);
    await act(async () => boton('Registrar pago', contenedor).click());
    const dialogo = document.querySelector('[role=dialog]')!;
    const monto = dialogo.querySelector<HTMLInputElement>('#pago-monto')!;
    expect(monto.value).toBe('280');

    await act(async () => escribir(monto, '1,200'));
    expect(dialogo.querySelector('#pago-exceso')?.textContent).toContain('Es $920 más que el saldo ($280)');
    await enviar(dialogo.querySelector('form')!);
    expect(m.admin.registrarPago).not.toHaveBeenCalled();
    expect(dialogo.textContent).toContain('El monto es $920 mayor que el saldo');

    await act(async () => boton(/dejar \$920 de propina/, dialogo).click());
    expect(monto.value).toBe('280');
    expect(dialogo.querySelector<HTMLInputElement>('#pago-propina')!.value).toBe('920');
    expect(dialogo.querySelector('#pago-exceso')).toBeNull();
    await enviar(dialogo.querySelector('form')!);
    expect(m.admin.registrarPago).toHaveBeenCalledTimes(1);
    expect(m.admin.registrarPago.mock.calls[0][0]).toMatchObject({ monto: 280, propina: 920, cita_id: 'cita-1' });
  });

  it('una cita ya liquidada no ofrece «Registrar pago» y una pagada de más lo dice', async () => {
    await montar([cita({ id: 'c-a', pagado: 280 }), cita({ id: 'c-b', cliente_nombre: 'Lucía Campos', pagado: 1200, inicio: '2026-10-09T17:00:00Z', fin: '2026-10-09T18:00:00Z' })]);
    const [a, b] = [...contenedor.querySelectorAll('article.adm-cita')];
    expect(b.textContent).toContain('Fernanda');
    expect(a.textContent).toContain('Lucía');
    expect(a.textContent).toContain('Pagado de más $920');
    for (const t of [a, b]) expect([...t.querySelectorAll('button')].some((x) => x.textContent?.includes('Registrar pago'))).toBe(false);
  });
});

describe('aNumero', () => {
  it('lee montos como se escriben en México', () => {
    expect(aNumero('1,200')).toBe(1200);
    expect(aNumero('$12,500.50')).toBe(12500.5);
    expect(aNumero('1,5')).toBe(1.5);
    expect(aNumero('120')).toBe(120);
    expect(aNumero('')).toBeNull();
    expect(aNumero('abc')).toBeNull();
  });
});
