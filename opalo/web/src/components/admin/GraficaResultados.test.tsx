// Gráfica de resultados: a lo ancho de un celular (390 px) las etiquetas del eje X no se enciman,
// el último mes siempre lleva etiqueta y cada mes se puede leer con el teclado o el lector de pantalla.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ResultadoMensual } from '../../lib/api';
import { GraficaResultados, pasoEtiquetas } from './GraficaResultados';

function mes(m: string, ingresos: number, gastos: number): ResultadoMensual {
  return {
    mes: `${m}-01`,
    ingresos,
    propinas: 0,
    costo_insumos: 0,
    compras: 0,
    gastos,
    utilidad: ingresos - gastos,
    flujo: ingresos - gastos,
    citas_completadas: 0,
  };
}

/** Doce meses: de noviembre de 2025 a octubre de 2026. */
const DOCE = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((m, i) =>
  mes(m, 10_000 + i * 1000, 8_000),
);

let contenedor: HTMLDivElement;
let raiz: Root;
let anchoCaja = 0;
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => anchoCaja });
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  if (original) Object.defineProperty(HTMLElement.prototype, 'clientWidth', original);
});

async function montar(ancho: number, datos = DOCE) {
  anchoCaja = ancho;
  await act(async () => {
    raiz.render(<GraficaResultados datos={datos} idTabla="tabla" />);
  });
}

/** Etiquetas del eje X (las de abajo, centradas) con su posición. */
function meses() {
  const svg = contenedor.querySelector('svg')!;
  const alto = Number(svg.getAttribute('height'));
  return [...svg.querySelectorAll('text')]
    .filter((t) => t.getAttribute('text-anchor') === 'middle' && Number(t.getAttribute('y')) > alto - 30)
    .map((t) => ({ texto: t.textContent ?? '', x: Number(t.getAttribute('x')) }));
}

describe('GraficaResultados', () => {
  it('a 390 px no encima las etiquetas de los meses y siempre muestra el último', async () => {
    // 390 px de pantalla menos los márgenes de la página y de la tarjeta.
    await montar(326);
    const svg = contenedor.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('326');
    expect(svg.getAttribute('viewBox')).toBe('0 0 326 300');
    const lista = meses();
    expect(lista.length).toBeGreaterThan(1);
    expect(lista.length).toBeLessThan(12);
    expect(lista[lista.length - 1].texto).toMatch(/^oct\.? 26$/);
    for (let i = 1; i < lista.length; i++) {
      const anchoTexto = Math.max(lista[i].texto.length, lista[i - 1].texto.length) * 6.6;
      expect(lista[i].x - lista[i - 1].x).toBeGreaterThanOrEqual(anchoTexto);
    }
  });

  it('con espacio de sobra pone los doce meses', async () => {
    await montar(1000);
    expect(meses()).toHaveLength(12);
  });

  it('cada mes se lee completo con el teclado (no queda escondido dentro de una imagen)', async () => {
    await montar(326);
    const svg = contenedor.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('group');
    const zonas = [...svg.querySelectorAll('[tabindex="0"]')];
    expect(zonas).toHaveLength(12);
    expect(zonas[11].getAttribute('aria-label')).toBe('octubre de 2026: ingresos $21,000, egresos $8,000, utilidad $13,000');
    // Lo dibujado no se lee dos veces.
    expect(svg.querySelector('g[aria-hidden="true"]')?.querySelectorAll('text').length).toBeGreaterThan(0);
  });

  it('calcula cada cuántos meses cabe una etiqueta', () => {
    expect(pasoEtiquetas(80, ['ago 26'])).toBe(1);
    expect(pasoEtiquetas(30, ['ago 26'])).toBe(2);
    expect(pasoEtiquetas(15, ['ago 26', 'sept 26'])).toBe(4);
    expect(pasoEtiquetas(0, [])).toBeGreaterThanOrEqual(1);
  });
});
