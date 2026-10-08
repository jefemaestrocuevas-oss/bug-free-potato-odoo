// Registrar pago: la cortesía nunca se precarga, se avisa que no es ingreso y un pedido sólo de
// productos no habla de servicios prepagados al quedar pagado.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetodoPago } from '../../lib/api';
import { RegistrarPago } from './RegistrarPago';

const m = vi.hoisted(() => ({ registrarPago: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: { modo: 'demo', admin: { registrarPago: m.registrarPago } } }));

let contenedor: HTMLDivElement;
let raiz: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  m.registrarPago.mockReset().mockResolvedValue('pago-1');
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  document.body.innerHTML = '';
});

async function montar(props: { metodoSugerido?: MetodoPago | null; soloProductos?: boolean; tipo?: 'cita' | 'pedido' } = {}) {
  const onListo = vi.fn();
  await act(async () => {
    raiz.render(
      <RegistrarPago
        destino={{ tipo: props.tipo ?? 'pedido', id: 'p-1', descripcion: 'Pedido OP-00001 · Ana' }}
        total={350}
        pagado={0}
        metodoSugerido={props.metodoSugerido}
        soloProductos={props.soloProductos}
        onCerrar={() => {}}
        onListo={onListo}
      />,
    );
  });
  return { onListo };
}

const select = () => document.querySelector<HTMLSelectElement>('#pago-metodo')!;

function elegir(el: HTMLSelectElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
  setter.call(el, valor);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function enviar() {
  await act(async () => {
    document.querySelector('#form-pago')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('RegistrarPago', () => {
  it('usa el método preferido del pedido, pero nunca precarga la cortesía', async () => {
    await montar({ metodoSugerido: 'transferencia' });
    expect(select().value).toBe('transferencia');
    act(() => raiz.unmount());
    raiz = createRoot(contenedor);
    await montar({ metodoSugerido: 'cortesia' });
    expect(select().value).toBe('efectivo');
    expect(document.body.textContent).not.toContain('La cortesía no cuenta como ingreso.');
  });

  it('al elegir cortesía avisa que no cuenta como ingreso y lo registra así', async () => {
    const { onListo } = await montar({ tipo: 'cita' });
    await act(async () => elegir(select(), 'cortesia'));
    expect(document.querySelector('#pago-cortesia')?.textContent).toBe('La cortesía no cuenta como ingreso.');
    expect(select().getAttribute('aria-describedby')).toBe('pago-cortesia');
    await enviar();
    expect(m.registrarPago).toHaveBeenCalledWith(expect.objectContaining({ metodo: 'cortesia', monto: 350, cita_id: 'p-1' }));
    expect(onListo.mock.calls[0][0]).toBe('Cortesía de $350 registrada (no cuenta como ingreso).');
  });

  it('un pedido sólo de productos no promete servicios prepagados', async () => {
    const { onListo } = await montar({ soloProductos: true });
    expect(document.body.textContent).toContain('los productos se descuentan del inventario');
    expect(document.body.textContent).not.toContain('servicios prepagados');
    await enviar();
    const mensaje: string = onListo.mock.calls[0][0];
    expect(mensaje).toBe('Pago de $350 registrado. El pedido quedó pagado y los productos se descontaron del inventario.');
  });

  it('un pedido con servicios avisa que ya están como servicios prepagados', async () => {
    const { onListo } = await montar();
    await enviar();
    expect(onListo.mock.calls[0][0]).toContain('sus servicios ya están disponibles como servicios prepagados de la clienta');
  });
});
