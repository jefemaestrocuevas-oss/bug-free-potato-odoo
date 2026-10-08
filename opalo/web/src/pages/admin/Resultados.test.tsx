// Página de Resultados: estado vacío, indicadores del mes y totales de la tabla.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultadoMensual } from '../../lib/api';
import { mesActual, sumarMeses } from '../../components/admin/util';
import Resultados from './Resultados';

const admin = vi.hoisted(() => ({ getResultados: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: { modo: 'demo', admin } }));

const ACTUAL = mesActual();

/** 12 meses en ceros, del más antiguo al actual (como lo devuelve la API). */
function doceMeses(cambios: Record<string, Partial<ResultadoMensual>> = {}): ResultadoMensual[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = sumarMeses(ACTUAL, i - 11);
    return {
      mes: `${m}-01`,
      ingresos: 0,
      propinas: 0,
      costo_insumos: 0,
      compras: 0,
      gastos: 0,
      utilidad: 0,
      flujo: 0,
      citas_completadas: 0,
      ...cambios[m],
    };
  });
}

let contenedor: HTMLDivElement;
let raiz: Root;

async function montar() {
  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={['/admin/resultados']}>
        <Resultados />
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  vi.clearAllMocks();
});

describe('Resultados', () => {
  it('sin movimientos explica de dónde salen las cifras', async () => {
    admin.getResultados.mockResolvedValue(doceMeses());
    await montar();
    expect(admin.getResultados).toHaveBeenCalledWith(12);
    expect(contenedor.textContent).toContain('Todavía no hay resultados');
    expect(contenedor.textContent).toContain('pagos');
    expect(contenedor.textContent).toContain('consumos');
    expect(contenedor.querySelector('#res-tabla')).toBeNull();
  });

  it('muestra el mes actual, la utilidad con su tono y los totales de 12 meses', async () => {
    const anterior = sumarMeses(ACTUAL, -1);
    admin.getResultados.mockResolvedValue(
      doceMeses({
        [ACTUAL]: { ingresos: 1000, propinas: 150, costo_insumos: 200, gastos: 1500, utilidad: -700, flujo: -900, compras: 400, citas_completadas: 3 },
        [anterior]: { ingresos: 5000, costo_insumos: 300.5, gastos: 1200, utilidad: 3499.5, flujo: 3800, citas_completadas: 9 },
      }),
    );
    await montar();

    const kpis = [...contenedor.querySelectorAll('.adm-kpi')];
    const utilidad = kpis.find((k) => k.textContent?.startsWith('Utilidad'))!;
    expect(utilidad.className).toContain('adm-kpi-error');
    expect(utilidad.textContent).toContain('-$700');
    expect(kpis.find((k) => k.textContent?.startsWith('Gastos + costo de insumos'))!.textContent).toContain('$1,700');
    expect(kpis.find((k) => k.textContent?.startsWith('Propinas'))!.textContent).toContain('Son de quien atiende, no del spa');

    const tabla = contenedor.querySelector('#res-tabla')!;
    expect(tabla.querySelectorAll('tbody tr')).toHaveLength(12);
    // El mes más reciente va primero.
    expect(tabla.querySelector('tbody tr')!.textContent).toContain('en curso');
    const total = tabla.querySelector('tfoot tr')!.textContent!;
    expect(total).toContain('$6,000');
    expect(total).toContain('$500.50');
    expect(total).toContain('$2,799.50');
    expect(total).toContain('12');
  });
});
