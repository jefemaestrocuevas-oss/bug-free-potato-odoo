// Pedidos (/admin/pedidos): origen (en línea / mostrador), venta sin clienta sin enlace, filtro
// «Por entregar» y «Marcar entregado» con confirmación; el detalle avisa que se recoge en el spa.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PedidoDetalle } from '../../lib/api';
import Pedidos from './Pedidos';

const admin = vi.hoisted(() => ({ getPedidos: vi.fn(), marcarEntregado: vi.fn(), registrarPago: vi.fn(), cancelarPedido: vi.fn() }));
vi.mock('../../lib/api', async () => ({ ...(await vi.importActual<object>('../../lib/api/tipos')), api: { modo: 'demo', admin } }));

function pedido(c: Partial<PedidoDetalle> & Pick<PedidoDetalle, 'id' | 'folio'>): PedidoDetalle {
  return {
    cliente_id: 'cl-ana',
    cliente_nombre: 'Ana López (ejemplo)',
    estado: 'pagado',
    total: 240,
    pagado: 240,
    metodo_pago_preferido: 'efectivo',
    notas: null,
    creado_en: '2026-10-06T17:00:00Z',
    pagado_en: '2026-10-06T18:00:00Z',
    origen: 'web',
    entregado_en: null,
    tiene_productos: true,
    items: [{ tipo: 'producto', descripcion: 'Jabón de avena', cantidad: 2, precio_unitario: 120, importe: 240, regalo_para: null }],
    ...c,
  };
}

const POR_ENTREGAR = pedido({ id: 'pe-1', folio: 'OP-00001' });
const MOSTRADOR = pedido({
  id: 'pe-2',
  folio: 'OP-00002',
  cliente_id: null,
  cliente_nombre: 'Venta de mostrador',
  origen: 'mostrador',
  entregado_en: '2026-10-07T16:00:00Z',
  creado_en: '2026-10-07T16:00:00Z',
});
const PENDIENTE = pedido({ id: 'pe-3', folio: 'OP-00003', estado: 'pendiente_pago', pagado: 0, pagado_en: null });
const SOLO_SERVICIOS = pedido({
  id: 'pe-4',
  folio: 'OP-00004',
  tiene_productos: false,
  items: [{ tipo: 'servicio', descripcion: 'Axilas', cantidad: 1, precio_unitario: 250, importe: 250, regalo_para: null }],
  total: 250,
  pagado: 250,
});

let contenedor: HTMLDivElement;
let raiz: Root;

async function esperar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function montar(ruta = '/admin/pedidos') {
  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={[ruta]}>
        <Pedidos />
      </MemoryRouter>,
    );
  });
  await esperar();
}

function boton(texto: string, dentro: ParentNode = document.body): HTMLButtonElement {
  const b = [...dentro.querySelectorAll('button')].find((x) => x.textContent?.trim().startsWith(texto));
  if (!b) throw new Error(`No encontré el botón «${texto}»`);
  return b;
}
const filas = () => [...contenedor.querySelectorAll('.adm-pedidos-tabla tbody tr')];
const fila = (folio: string) => filas().find((f) => f.textContent?.includes(folio))!;
const dialogo = () => {
  const ds = document.querySelectorAll('[role=dialog]');
  return ds[ds.length - 1] as HTMLElement;
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  admin.getPedidos.mockResolvedValue([POR_ENTREGAR, MOSTRADOR, PENDIENTE, SOLO_SERVICIOS]);
  admin.marcarEntregado.mockResolvedValue(undefined);
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('Pedidos · origen y entregas', () => {
  it('marca el origen y la venta de mostrador sin clienta no lleva enlace', async () => {
    await montar();
    expect(fila('OP-00001').querySelector('.adm-pedidos-origen')!.textContent).toBe('Origen: En línea');
    const mostrador = fila('OP-00002');
    expect(mostrador.querySelector('.adm-pedidos-origen')!.textContent).toBe('Origen: Mostrador');
    expect(mostrador.querySelector('[data-etiqueta="Clienta"]')!.textContent).toBe('Venta de mostrador');
    expect(mostrador.querySelector('[data-etiqueta="Clienta"] a')).toBeNull();
    expect([...contenedor.querySelectorAll('a')].some((a) => a.getAttribute('href')?.includes('null'))).toBe(false);
    expect(fila('OP-00001').querySelector('[data-etiqueta="Clienta"] a')!.getAttribute('href')).toBe('/admin/clientes/cl-ana');
    // KPI de entregas pendientes.
    expect([...contenedor.querySelectorAll('.adm-kpi')].find((k) => k.textContent?.startsWith('Por entregar'))!.textContent).toContain('1');
  });

  it('«Por entregar» deja sólo los pagados con productos sin entregar y los marca con confirmación', async () => {
    await montar('/admin/pedidos?estado=por_entregar');
    const tab = [...contenedor.querySelectorAll('[role=tab]')].find((t) => t.textContent?.startsWith('Por entregar'))!;
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(tab.textContent).toContain('1');
    expect(filas().map((f) => f.querySelector('.adm-pedidos-folio')!.textContent)).toEqual(['OP-00001']);
    expect(fila('OP-00001').textContent).toContain('Por entregar');

    await act(async () => boton('Marcar entregado', fila('OP-00001')).click());
    const d = dialogo();
    expect(d.textContent).toContain('¿Ya entregaste el pedido OP-00001?');
    expect(d.textContent).toContain('2 × Jabón de avena');
    expect(admin.marcarEntregado).not.toHaveBeenCalled();
    await act(async () => boton('Sí, ya se entregó', d).click());
    await esperar();
    expect(admin.marcarEntregado).toHaveBeenCalledWith('pe-1');
    expect(contenedor.textContent).toContain('Pedido OP-00001 marcado como entregado.');
    expect(admin.getPedidos).toHaveBeenCalledTimes(2);
  });

  it('el detalle avisa que se recoge en el spa y permite marcarlo entregado', async () => {
    await montar();
    await act(async () => boton('OP-00001', contenedor).click());
    let d = dialogo();
    expect(d.textContent).toContain('Por entregar.');
    expect(d.textContent).toContain('recoge sus productos en el spa');
    await act(async () => boton('Marcar entregado', d).click());
    d = dialogo();
    await act(async () => boton('Sí, ya se entregó', d).click());
    await esperar();
    expect(admin.marcarEntregado).toHaveBeenCalledWith('pe-1');
    expect(document.querySelector('[role=dialog]')).toBeNull();

    // Venta de mostrador: sin enlace a expediente y entregada en el momento.
    await act(async () => boton('OP-00002', contenedor).click());
    d = dialogo();
    expect(d.querySelector('a[href*="/admin/clientes/"]')).toBeNull();
    expect(d.textContent).toContain('Se entregó en el mostrador al momento de la venta.');
    expect([...d.querySelectorAll('button')].some((b) => b.textContent?.startsWith('Marcar entregado'))).toBe(false);
  });

  it('un pedido pendiente dice que los productos se recogen al pagar', async () => {
    await montar();
    await act(async () => boton('OP-00003', contenedor).click());
    expect(dialogo().textContent).toContain('Los productos se recogen en el spa');
  });

  it('al cobrar un pedido con productos, el detalle sigue abierto para entregarlos en el acto', async () => {
    admin.registrarPago.mockResolvedValue('pago-1');
    await montar();
    await act(async () => boton('OP-00003', contenedor).click());
    await act(async () => boton('Registrar pago', dialogo()).click());
    await act(async () => {
      document.querySelector<HTMLFormElement>('#form-pago')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await esperar();
    expect(admin.registrarPago).toHaveBeenCalledWith(expect.objectContaining({ monto: 240, pedido_id: 'pe-3' }));
    // Sigue abierto el detalle (no se recargó la lista todavía) con «Marcar entregado» como acción principal.
    let d = dialogo();
    expect(d.textContent).toContain('Pedido OP-00003');
    expect(d.textContent).toContain('El pedido quedó pagado');
    expect(d.textContent).toContain('Por entregar.');
    expect(admin.getPedidos).toHaveBeenCalledTimes(1);
    expect([...d.querySelectorAll('button')].some((b) => b.textContent?.startsWith('Registrar pago'))).toBe(false);
    await act(async () => boton('Marcar entregado', d).click());
    d = dialogo();
    await act(async () => boton('Sí, ya se entregó', d).click());
    await esperar();
    expect(admin.marcarEntregado).toHaveBeenCalledWith('pe-3');
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(contenedor.textContent).toContain('Pedido OP-00003 marcado como entregado.');
    expect(admin.getPedidos).toHaveBeenCalledTimes(2);
  });

  it('si no se lleva sus productos todavía, cerrar el detalle recarga y avisa del pago', async () => {
    admin.registrarPago.mockResolvedValue('pago-1');
    await montar();
    await act(async () => boton('OP-00003', contenedor).click());
    await act(async () => boton('Registrar pago', dialogo()).click());
    await act(async () => {
      document.querySelector<HTMLFormElement>('#form-pago')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await esperar();
    await act(async () => boton('Todavía no, cerrar', dialogo()).click());
    await esperar();
    expect(admin.marcarEntregado).not.toHaveBeenCalled();
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(contenedor.textContent).toContain('El pedido quedó pagado');
    expect(admin.getPedidos).toHaveBeenCalledTimes(2);
  });
});
