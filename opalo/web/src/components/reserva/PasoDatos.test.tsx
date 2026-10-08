// Fecha de nacimiento: si ya está registrada se ve fija (con la salida por WhatsApp) y se manda la
// misma; si falta, es obligatoria para reservar. También avisa del límite de 3 citas próximas.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CitaDetalle, Cliente, Configuracion, Sesion } from '../../lib/api/tipos';
import { SeccionDatos } from '../cuenta/SeccionDatos';
import { PasoDatos } from './PasoDatos';

const m = vi.hoisted(() => ({
  actualizarMisDatos: vi.fn(),
  getMisCitas: vi.fn(),
  getConfiguracion: vi.fn(),
  cerrarSesion: vi.fn(),
  sesion: null as unknown,
  refrescar: vi.fn(),
}));
vi.mock('../../lib/api', () => ({
  api: { modo: 'demo', actualizarMisDatos: m.actualizarMisDatos, getMisCitas: m.getMisCitas, getConfiguracion: m.getConfiguracion, cerrarSesion: m.cerrarSesion },
}));
vi.mock('../../lib/sesion', () => ({
  useSesion: () => ({ sesion: m.sesion, cargando: false, refrescar: m.refrescar, esPersonal: false, esAdmin: false }),
}));

const CONFIG: Configuracion = {
  nombre_negocio: 'Ópalo',
  lema: null,
  telefono_whatsapp: '4421701466',
  direccion: 'Querétaro, Qro.',
  zona_horaria: 'America/Mexico_City',
  duracion_sesion_min: 60,
  intervalo_slots_min: 60,
  anticipacion_min_horas: 2,
  ventana_reserva_dias: 60,
  horas_cancelacion: 24,
  tolerancia_retraso_min: 15,
  edad_minima: 15,
  edad_mayoria: 18,
  vigencia_creditos_dias: 365,
  fecha_apertura: '2026-10-31',
  firma_en_linea: false,
};

function sesion(extra: Partial<Cliente> = {}): Sesion {
  return {
    user_id: 'u-1',
    email: 'ana@ejemplo.mx',
    rol: 'cliente',
    cliente: {
      id: 'c-1',
      nombre: 'Ana',
      apellidos: 'López',
      telefono: '4421234567',
      email: 'ana@ejemplo.mx',
      fecha_nacimiento: '1995-04-12',
      acepta_promociones: false,
      ...extra,
    },
  };
}

function cita(inicio: string, estado: CitaDetalle['estado'] = 'confirmada'): CitaDetalle {
  return { id: inicio, inicio, estado } as CitaDetalle;
}

let contenedor: HTMLDivElement;
let raiz: Root;

async function esperar() {
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
}

async function montarPaso(s: Sesion | null, config: Configuracion = CONFIG) {
  const onListo = vi.fn();
  await act(async () => {
    raiz.render(
      <MemoryRouter>
        <PasoDatos config={config} sesion={s} refrescar={m.refrescar} onAtras={() => {}} onListo={onListo} />
      </MemoryRouter>,
    );
  });
  await esperar();
  return { onListo };
}

function escribir(el: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const continuar = () => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Continuar')!;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00-06:00'));
  m.actualizarMisDatos.mockReset().mockImplementation(async (d) => d);
  m.getMisCitas.mockReset().mockResolvedValue([]);
  m.getConfiguracion.mockReset().mockResolvedValue(CONFIG);
  m.refrescar.mockReset().mockResolvedValue(undefined);
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  vi.useRealTimers();
});

describe('PasoDatos (reserva)', () => {
  it('con fecha registrada la muestra fija, ofrece WhatsApp y manda la misma', async () => {
    const { onListo } = await montarPaso(sesion());
    expect(contenedor.querySelector('input[type=date]')).toBeNull();
    expect(contenedor.querySelector('#rv-dato-fecha_nacimiento')?.textContent).toBe('12 de abril de 1995');
    const wa = [...contenedor.querySelectorAll('a')].find((a) => a.textContent?.startsWith('escríbenos por WhatsApp'))!;
    expect(wa.closest('.ayuda')?.textContent).toContain('Si hay un error, escríbenos por WhatsApp');
    expect(wa.getAttribute('href')).toContain('wa.me/524421701466');

    await act(async () => escribir(contenedor.querySelector<HTMLInputElement>('#rv-dato-telefono')!, '442 765 4321'));
    await act(async () => continuar().click());
    await esperar();
    expect(m.actualizarMisDatos).toHaveBeenCalledWith(expect.objectContaining({ telefono: '4427654321', fecha_nacimiento: '1995-04-12' }));
    expect(onListo).toHaveBeenCalled();
  });

  it('sin fecha registrada la pide y explica que es obligatoria para reservar', async () => {
    const { onListo } = await montarPaso(sesion({ fecha_nacimiento: null }));
    const input = contenedor.querySelector<HTMLInputElement>('#rv-dato-fecha_nacimiento')!;
    expect(input.type).toBe('date');
    expect(input.required).toBe(true);
    expect(contenedor.querySelector('#rv-dato-fecha-ayuda')?.textContent).toContain('Es obligatoria para reservar');
    expect(input.getAttribute('aria-describedby')).toContain('rv-dato-fecha-ayuda');

    await act(async () => continuar().click());
    await esperar();
    expect(contenedor.querySelector('#rv-dato-fecha_nacimiento-error')?.textContent).toBe('Escribe tu fecha de nacimiento.');
    expect(m.actualizarMisDatos).not.toHaveBeenCalled();

    await act(async () => escribir(input, '2000-01-31'));
    await act(async () => continuar().click());
    await esperar();
    expect(m.actualizarMisDatos).toHaveBeenCalledWith(expect.objectContaining({ fecha_nacimiento: '2000-01-31' }));
    expect(onListo).toHaveBeenCalled();
  });

  it('con 3 citas próximas avisa antes de seguir (límite de la base)', async () => {
    m.getMisCitas.mockResolvedValue([
      cita('2026-11-03T16:00:00Z'),
      cita('2026-11-04T16:00:00Z', 'pendiente'),
      cita('2026-11-05T16:00:00Z'),
      cita('2026-11-06T16:00:00Z', 'cancelada'),
    ]);
    await montarPaso(sesion());
    const aviso = contenedor.querySelector('[role=alert]')!;
    expect(aviso.textContent).toContain('Ya tienes 3 citas próximas; para agendar otra escríbenos por WhatsApp al 442 170 1466.');
    expect(continuar().disabled).toBe(true);
  });

  it('con 2 citas próximas (y una pasada) sí deja seguir', async () => {
    m.getMisCitas.mockResolvedValue([cita('2026-11-03T16:00:00Z'), cita('2026-11-04T16:00:00Z'), cita('2026-10-01T16:00:00Z')]);
    await montarPaso(sesion());
    expect(contenedor.querySelector('[role=alert]')).toBeNull();
    expect(continuar().disabled).toBe(false);
  });

  // ESPEC §9: con firma_en_linea = false la reserva no menciona la firma (se hace en el spa).
  // "firm" al inicio de palabra: firma, firmar, firmes… (no "confirmar").
  const SIN_FIRMA = /\bfirm/i;
  it('firma_en_linea = false: ni la invitación a crear cuenta ni el aviso de menores hablan de firmar', async () => {
    await montarPaso(null);
    expect(contenedor.textContent).toContain('guardamos tu ficha de salud de forma segura');
    expect(contenedor.textContent).not.toMatch(SIN_FIRMA);

    await montarPaso(sesion({ fecha_nacimiento: null }));
    await act(async () => escribir(contenedor.querySelector<HTMLInputElement>('#rv-dato-fecha_nacimiento')!, '2010-02-01'));
    expect(contenedor.textContent).toContain('tu mamá, papá o tutor debe acompañarte a la cita. Antes de confirmar te pedimos su nombre.');
    expect(contenedor.querySelector('#rv-dato-fecha-ayuda')?.textContent).toContain('te acompaña a tu cita');
    expect(contenedor.textContent).not.toMatch(SIN_FIRMA);
  });

  it('firma_en_linea = true: conserva los textos de la firma en pantalla', async () => {
    const conFirma = { ...CONFIG, firma_en_linea: true };
    await montarPaso(null, conFirma);
    expect(contenedor.textContent).toContain('tu ficha de salud y tus firmas de forma segura');

    await montarPaso(sesion({ fecha_nacimiento: null }), conFirma);
    await act(async () => escribir(contenedor.querySelector<HTMLInputElement>('#rv-dato-fecha_nacimiento')!, '2010-02-01'));
    expect(contenedor.textContent).toContain('escribir su nombre cuando firmes el consentimiento');
    expect(contenedor.querySelector('#rv-dato-fecha-ayuda')?.textContent).toContain('firma contigo');
  });
});

describe('SeccionDatos (Mi cuenta)', () => {
  async function montarSeccion(s: Sesion) {
    m.sesion = s;
    await act(async () => {
      raiz.render(
        <MemoryRouter>
          <SeccionDatos />
        </MemoryRouter>,
      );
    });
    await esperar();
  }
  const guardar = () => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Guardar cambios')!;

  it('con fecha registrada no se puede editar y se guarda la misma', async () => {
    await montarSeccion(sesion());
    expect(contenedor.querySelector('input[type=date]')).toBeNull();
    expect(contenedor.querySelector('#cu-dato-fecha_nacimiento')?.textContent).toBe('12 de abril de 1995');
    expect(contenedor.textContent).toContain('Si hay un error, escríbenos por WhatsApp');
    await act(async () => guardar().click());
    await esperar();
    expect(m.actualizarMisDatos).toHaveBeenCalledWith(expect.objectContaining({ fecha_nacimiento: '1995-04-12' }));
    expect(contenedor.textContent).toContain('Guardamos tus datos.');
  });

  it('sin fecha la pide y avisa que la necesitamos para reservar', async () => {
    await montarSeccion(sesion({ fecha_nacimiento: null }));
    const input = contenedor.querySelector<HTMLInputElement>('#cu-dato-fecha_nacimiento')!;
    expect(input.type).toBe('date');
    expect(contenedor.querySelector('#cu-dato-fecha-ayuda')?.textContent).toContain('La necesitamos para reservar');
    await act(async () => guardar().click());
    await esperar();
    expect(m.actualizarMisDatos).toHaveBeenCalledWith(expect.objectContaining({ fecha_nacimiento: null }));
  });
});
