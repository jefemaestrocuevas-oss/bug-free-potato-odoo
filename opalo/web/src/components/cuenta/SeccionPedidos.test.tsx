// Mi cuenta → Pedidos: un pedido sólo de productos no habla de servicios; dice dónde se recogen, si ya están
// por recoger y cuándo se entregaron. Antes de la apertura dice desde cuándo se puede pagar y recoger.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Configuracion, PedidoDetalle } from '../../lib/api/tipos';
import { fechaLocal, sumarDias } from '../../lib/format';
import { SeccionPedidos } from './SeccionPedidos';

const m = vi.hoisted(() => ({ getMisPedidos: vi.fn(), cancelarPedido: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: { modo: 'demo', getMisPedidos: m.getMisPedidos, cancelarPedido: m.cancelarPedido } }));

const CONFIG: Configuracion = {
  nombre_negocio: 'Ópalo',
  lema: null,
  telefono_whatsapp: '4421701466',
  direccion: 'Momentum Centro Sur, Torre 2, Int. 207, Querétaro, Qro.',
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
  fecha_apertura: null,
  firma_en_linea: false,
};

function pedido(c: Partial<PedidoDetalle> & Pick<PedidoDetalle, 'id' | 'folio'>): PedidoDetalle {
  return {
    cliente_id: 'c-1',
    cliente_nombre: 'Mariana López (ejemplo)',
    estado: 'pendiente_pago',
    total: 470,
    pagado: 0,
    metodo_pago_preferido: 'efectivo',
    notas: null,
    creado_en: '2026-10-08T17:00:00Z',
    pagado_en: null,
    origen: 'web',
    entregado_en: null,
    tiene_productos: true,
    items: [
      { tipo: 'producto', descripcion: 'Set de regalo (ejemplo)', cantidad: 1, precio_unitario: 350, importe: 350, regalo_para: null },
      { tipo: 'producto', descripcion: 'Jabón de avena (ejemplo)', cantidad: 1, precio_unitario: 120, importe: 120, regalo_para: null },
    ],
    ...c,
  };
}

let contenedor: HTMLDivElement;
let raiz: Root;

async function montar(config: Configuracion = CONFIG) {
  await act(async () => {
    raiz.render(
      <MemoryRouter>
        <SeccionPedidos config={config} />
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
const tarjeta = (folio: string) => [...contenedor.querySelectorAll('.cu-tarjeta')].find((t) => t.textContent?.includes(folio))!;

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

describe('Mi cuenta · pedidos de productos', () => {
  it('pendiente: dice dónde se recogen y no habla de servicios; pagado: por recoger; entregado: la fecha', async () => {
    m.getMisPedidos.mockResolvedValue([
      pedido({ id: 'p1', folio: 'OP-00012', creado_en: '2026-10-08T18:00:00Z' }),
      pedido({ id: 'p2', folio: 'OP-00011', estado: 'pagado', pagado: 470, pagado_en: '2026-10-08T17:30:00Z' }),
      pedido({ id: 'p3', folio: 'OP-00010', estado: 'pagado', pagado: 470, pagado_en: '2026-10-07T17:30:00Z', entregado_en: '2026-10-08T16:00:00Z', creado_en: '2026-10-07T17:00:00Z' }),
    ]);
    await montar();

    const pendiente = tarjeta('OP-00012');
    expect(pendiente.textContent).toContain('Recoges tus productos en Ópalo (Momentum Centro Sur, Torre 2, Int. 207) al pagar.');
    expect(pendiente.textContent).not.toContain('servicios');

    const porRecoger = tarjeta('OP-00011');
    expect([...porRecoger.querySelectorAll('.pill')].map((p) => p.textContent)).toEqual(['Pagado', 'Por recoger']);
    expect(porRecoger.textContent).toContain('Tus productos ya están listos; pasa por ellos a Ópalo');
    expect(porRecoger.textContent).not.toContain('servicios');

    const entregado = tarjeta('OP-00010');
    expect(entregado.textContent).toContain('Productos entregados el 8 oct 2026');
    expect(entregado.textContent).not.toContain('Por recoger');
  });

  it('antes de la apertura dice desde cuándo se puede pagar y recoger', async () => {
    const apertura = sumarDias(fechaLocal(), 20);
    m.getMisPedidos.mockResolvedValue([pedido({ id: 'p1', folio: 'OP-00012' })]);
    await montar({ ...CONFIG, fecha_apertura: apertura });
    expect(tarjeta('OP-00012').textContent).toMatch(/al pagar, a partir del \S+ \d+ de \S+, cuando abrimos\./);
  });

  it('con servicios, sí avisa que aparecen en la pestaña Servicios', async () => {
    m.getMisPedidos.mockResolvedValue([
      pedido({
        id: 'p1',
        folio: 'OP-00013',
        tiene_productos: false,
        items: [{ tipo: 'servicio', descripcion: 'Axilas', cantidad: 1, precio_unitario: 250, importe: 250, regalo_para: null }],
      }),
    ]);
    await montar();
    const t = tarjeta('OP-00013');
    expect(t.textContent).toContain('los servicios aparecerán en la pestaña');
    expect(t.textContent).not.toContain('Recoges tus productos');
  });
});
