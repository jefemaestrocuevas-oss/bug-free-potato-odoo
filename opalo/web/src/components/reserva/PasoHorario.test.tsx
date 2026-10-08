// Paso 2 de la reserva: no se ofrece antes del día de apertura (configuracion.fecha_apertura),
// los días sin lugar se ven tachados y las horas se agrupan por especialista.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Configuracion, Slot } from '../../lib/api/tipos';
import { diaSemana } from '../../lib/format';
import { PasoHorario } from './PasoHorario';

const mocks = vi.hoisted(() => ({ getHorariosDisponibles: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: { modo: 'demo', getHorariosDisponibles: mocks.getHorariosDisponibles } }));

const CONFIG = {
  nombre_negocio: 'Ópalo',
  lema: null,
  telefono_whatsapp: '4421701466',
  direccion: 'Querétaro, Qro.',
  zona_horaria: 'America/Mexico_City',
  duracion_sesion_min: 60,
  intervalo_slots_min: 30,
  anticipacion_min_horas: 2,
  ventana_reserva_dias: 60,
  horas_cancelacion: 24,
  tolerancia_retraso_min: 10,
  edad_minima: 15,
  edad_mayoria: 18,
  vigencia_creditos_dias: 365,
  fecha_apertura: '2026-10-31',
  firma_en_linea: false,
} satisfies Configuracion;

function slot(fecha: string, hhmm: string, personal: string): Slot {
  const inicio = new Date(`${fecha}T${hhmm}:00-06:00`).toISOString();
  return { inicio, fin: new Date(new Date(inicio).getTime() + 3_600_000).toISOString(), personal_id: personal, personal_nombre: `Especialista ${personal}` };
}

/** Domingo y lunes cerrado; los demás días, dos especialistas. */
async function horarios(fecha: string): Promise<Slot[]> {
  const d = diaSemana(fecha);
  if (d === 0 || d === 1) return [];
  return [slot(fecha, '10:00', 'A'), slot(fecha, '11:00', 'A'), slot(fecha, '10:00', 'B')];
}

let contenedor: HTMLDivElement;
let raiz: Root;

async function esperar(veces = 5) {
  for (let i = 0; i < veces; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
}

async function montar(props: Partial<Parameters<typeof PasoHorario>[0]> = {}) {
  const onFecha = vi.fn();
  await act(async () => {
    raiz.render(
      <PasoHorario
        config={CONFIG}
        duracionMin={60}
        fecha={null}
        slot={null}
        onFecha={onFecha}
        onSlot={() => {}}
        onAtras={() => {}}
        onContinuar={() => {}}
        {...props}
      />,
    );
  });
  await esperar();
  return { onFecha };
}

const dia = (f: string) => contenedor.querySelector<HTMLButtonElement>(`button[data-fecha="${f}"]`);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00-06:00'));
  mocks.getHorariosDisponibles.mockReset().mockImplementation((f: string) => horarios(f));
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  vi.useRealTimers();
});

describe('PasoHorario', () => {
  it('antes de abrir, el primer día que se puede elegir es el de apertura', async () => {
    const { onFecha } = await montar();
    expect(contenedor.textContent).toContain('Abrimos el sábado, 31 de octubre');
    expect(dia('2026-10-08')?.getAttribute('aria-disabled')).toBe('true');
    expect(dia('2026-10-30')?.getAttribute('aria-disabled')).toBe('true');
    expect(dia('2026-10-31')?.getAttribute('aria-disabled')).toBeNull();
    // No se consulta ningún día antes de la apertura.
    for (const [f] of mocks.getHorariosDisponibles.mock.calls) expect(f >= '2026-10-31').toBe(true);

    const boton = [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Mostrarme el primer día con lugar')!;
    await act(async () => boton.click());
    await esperar();
    expect(onFecha).toHaveBeenCalledWith('2026-10-31');
  });

  it('la fecha de apertura sale de la configuración, no de una constante', async () => {
    const { onFecha } = await montar({ config: { ...CONFIG, fecha_apertura: '2026-11-05' } });
    expect(contenedor.textContent).toContain('Abrimos el jueves, 5 de noviembre');
    // El miércoles 4 tendría lugar, pero todavía no abrimos.
    expect(dia('2026-11-04')?.getAttribute('aria-disabled')).toBe('true');
    expect(dia('2026-11-05')?.getAttribute('aria-disabled')).toBeNull();
    for (const [f] of mocks.getHorariosDisponibles.mock.calls) expect(f >= '2026-11-05').toBe(true);
    const boton = [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Mostrarme el primer día con lugar')!;
    await act(async () => boton.click());
    await esperar();
    expect(onFecha).toHaveBeenCalledWith('2026-11-05');
  });

  it('sin fecha de apertura (null) se reserva desde hoy', async () => {
    await montar({ config: { ...CONFIG, fecha_apertura: null } });
    expect(contenedor.textContent).toContain('Puedes reservar desde hoy');
    expect(contenedor.textContent).not.toContain('Abrimos');
    // Jueves 8 de octubre (hoy) sí se puede elegir.
    expect(dia('2026-10-08')?.getAttribute('aria-disabled')).toBeNull();
    expect(dia('2026-10-07')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('un día guardado antes de la apertura no cuenta', async () => {
    await montar({ fecha: '2026-10-08' });
    expect(contenedor.textContent).toContain('Elige un día en el calendario');
    expect(mocks.getHorariosDisponibles).not.toHaveBeenCalledWith('2026-10-08', 60);
  });

  it('marca los días sin horarios libres y agrupa las horas por especialista', async () => {
    await montar({ fecha: '2026-11-03' });
    // Domingo 1 y lunes 2 de noviembre: cerrado.
    for (const f of ['2026-11-01', '2026-11-02']) {
      expect(dia(f)?.getAttribute('aria-disabled')).toBe('true');
      expect(dia(f)?.className).toContain('rv-cal-dia-sin-lugar');
      expect(dia(f)?.getAttribute('aria-label')).toContain('sin horarios libres');
    }
    expect(dia('2026-11-04')?.getAttribute('aria-disabled')).toBeNull();
    expect(contenedor.textContent).toContain('Los días tachados no tienen horarios libres.');

    const grupos = [...contenedor.querySelectorAll('.rv-horas-grupo')];
    expect(grupos.map((g) => g.querySelector('.rv-horas-quien')?.textContent)).toEqual(['Te atiende Especialista A', 'Te atiende Especialista B']);
    expect(grupos[0].querySelectorAll('button.rv-hora')).toHaveLength(2);
    expect(contenedor.textContent).not.toContain('te atiende Especialista A');
  });
});
