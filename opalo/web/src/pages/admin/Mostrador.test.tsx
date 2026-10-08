// Mostrador (/admin/mostrador): cuadrícula con agotados deshabilitados, carrito con tope de stock,
// cortesía con aviso, propina aparte y cambio, venta con ticket; servicios sólo con clienta.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalogo, ClienteResumen, Producto } from '../../lib/api';
import Mostrador from './Mostrador';

const m = vi.hoisted(() => ({
  getCatalogo: vi.fn(),
  admin: { getProductos: vi.fn(), ventaMostrador: vi.fn(), getClientes: vi.fn(), crearCliente: vi.fn() },
}));
vi.mock('../../lib/api', async () => ({
  ...(await vi.importActual<object>('../../lib/api/tipos')),
  api: { modo: 'demo', getCatalogo: m.getCatalogo, admin: m.admin },
}));

function producto(c: Partial<Producto> & Pick<Producto, 'id' | 'nombre' | 'categoria'>): Producto {
  return {
    marca: null,
    unidad_medida: 'pz',
    presentacion: null,
    contenido_presentacion: 1,
    costo_presentacion: 20,
    costo_unitario: 20,
    stock_actual: 0,
    stock_minimo: 0,
    proveedor_id: null,
    uso: 'venta',
    precio_venta: null,
    vendible_en_linea: false,
    activo: true,
    notas: null,
    slug: null,
    descripcion: null,
    aroma: null,
    ingredientes: null,
    modo_uso: null,
    advertencias: null,
    contenido_neto: null,
    foto_url: null,
    color_hex: null,
    destacado: false,
    hecho_en_opalo: true,
    orden: 0,
    ...c,
  };
}

const PRODUCTOS: Producto[] = [
  producto({ id: 'j-avena', nombre: 'Jabón de avena', categoria: 'jabon', stock_actual: 2, precio_venta: 120 }),
  producto({ id: 'v-lavanda', nombre: 'Vela de lavanda', categoria: 'vela', stock_actual: 0, precio_venta: 280 }),
  producto({ id: 'm-oliva', nombre: 'Aceite de oliva', categoria: 'materia_prima', unidad_medida: 'ml', stock_actual: 4000, uso: 'produccion' }),
  producto({ id: 'j-sin-precio', nombre: 'Jabón sin precio', categoria: 'jabon', stock_actual: 5 }),
];
const CATALOGO: Catalogo = {
  categorias: [{ id: 'c1', slug: 'depilacion', nombre: 'Depilación', descripcion: null, orden: 1 }],
  servicios: [
    {
      id: 's-axilas',
      categoria_id: 'c1',
      slug: 'axilas',
      nombre: 'Axilas',
      descripcion: null,
      zonas_incluye: null,
      duracion_min: null,
      duracion_primera_vez_min: null,
      precio: 250,
      etapa: 'disponible',
      es_complemento: false,
      reservable_en_linea: true,
      vendible_en_linea: true,
      tipo_consentimiento: 'consentimiento_depilacion',
      activo: true,
      orden: 1,
    },
  ],
  paquetes: [],
};
const ANA: ClienteResumen = {
  id: 'cl-ana',
  nombre: 'Ana',
  apellidos: 'López (ejemplo)',
  telefono: '4421234567',
  email: null,
  fecha_nacimiento: null,
  tiene_cuenta: false,
  citas_completadas: 0,
  ultima_visita: null,
  proxima_cita: null,
  total_pagado: 0,
  creado_en: '2026-10-01T12:00:00Z',
  es_personal: false,
};

let contenedor: HTMLDivElement;
let raiz: Root;

async function esperar(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function montar() {
  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={['/admin/mostrador']}>
        <Mostrador />
      </MemoryRouter>,
    );
  });
  await esperar();
}

function boton(texto: string, dentro: ParentNode = contenedor): HTMLButtonElement {
  const b = [...dentro.querySelectorAll('button')].find((x) => x.textContent?.trim().startsWith(texto));
  if (!b) throw new Error(`No encontré el botón «${texto}»`);
  return b;
}
const tarjeta = (nombre: string) => [...contenedor.querySelectorAll<HTMLButtonElement>('.mos-producto')].find((b) => b.textContent?.includes(nombre))!;
const opcion = (texto: string) => [...contenedor.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith(texto))!.querySelector('input')!;

function escribir(el: HTMLInputElement, valor: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  m.admin.getProductos.mockResolvedValue(PRODUCTOS);
  m.getCatalogo.mockResolvedValue(CATALOGO);
  m.admin.ventaMostrador.mockResolvedValue({ id: 'pe-42', folio: 'OP-00042', total: 240 });
  m.admin.getClientes.mockResolvedValue([ANA]);
  // jsdom no implementa el desplazamiento de la ventana.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
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

describe('Mostrador', () => {
  it('muestra sólo lo que se vende; los agotados no se pueden agregar', async () => {
    await montar();
    const nombres = [...contenedor.querySelectorAll('.mos-producto-nombre')].map((n) => n.textContent);
    expect(nombres).toEqual(['Jabón de avena', 'Vela de lavanda']);
    expect(tarjeta('Vela de lavanda').disabled).toBe(true);
    expect(tarjeta('Vela de lavanda').textContent).toContain('Agotado');
    expect(tarjeta('Jabón de avena').textContent).toContain('Quedan 2');
    expect(tarjeta('Jabón de avena').querySelector('svg.ilustracion-producto')).toBeTruthy();
  });

  it('el carrito no pasa del stock; cobra en efectivo con propina aparte y muestra el ticket', async () => {
    await montar();
    await act(async () => tarjeta('Jabón de avena').click());
    await act(async () => tarjeta('Jabón de avena').click());
    expect(tarjeta('Jabón de avena').disabled).toBe(true);
    expect(contenedor.querySelector<HTMLButtonElement>('[aria-label="Una más de Jabón de avena"]')!.disabled).toBe(true);
    expect(contenedor.querySelector('.mos-cantidad-num')!.textContent).toBe('2');
    expect(boton('Cobrar').textContent).toBe('Cobrar $240');

    await act(async () => opcion('Cortesía').click());
    expect(contenedor.textContent).toContain('La cortesía no cuenta como ingreso del spa');
    expect(boton('Registrar cortesía').textContent).toBe('Registrar cortesía de $240');
    await act(async () => opcion('Efectivo').click());

    await act(async () => escribir(contenedor.querySelector<HTMLInputElement>('#mos-propina')!, '30'));
    await act(async () => escribir(contenedor.querySelector<HTMLInputElement>('#mos-paga-con')!, '300'));
    expect(contenedor.querySelector('#mos-cambio')!.textContent).toBe('Cambio: $30');

    await act(async () => boton('Cobrar $240').click());
    await esperar();
    expect(m.admin.ventaMostrador).toHaveBeenCalledWith({
      items: [{ tipo: 'producto', id: 'j-avena', cantidad: 2 }],
      metodo: 'efectivo',
      cliente_id: null,
      propina: 30,
      notas: null,
    });
    const ticket = contenedor.querySelector('.mos-ticket')!;
    expect(ticket.textContent).toContain('OP-00042');
    expect(ticket.textContent).toContain('2 × Jabón de avena');
    expect(ticket.textContent).toContain('Venta de mostrador');
    expect(ticket.textContent).not.toContain('sin registrar');
    expect(ticket.textContent).toContain('Efectivo');
    expect(ticket.textContent).toContain('Propina (aparte)');
    expect(ticket.querySelector('.mos-ticket-cambio')!.textContent).toContain('$30');
    expect(m.admin.getProductos).toHaveBeenCalledTimes(2);

    await act(async () => boton('Nueva venta').click());
    expect(contenedor.querySelector('.mos-ticket')).toBeNull();
    expect(contenedor.querySelector('.mos-carrito-vacio')?.textContent).toContain('Toca un producto');
  });

  it('los servicios prepagados exigen elegir a la clienta', async () => {
    await montar();
    await act(async () => boton('+ Agregar servicios o paquetes prepagados').click());
    await act(async () => boton('Agregar', contenedor.querySelector('.mos-lista-servicios')!).click());
    expect(boton('Cobrar').disabled).toBe(true);
    expect(contenedor.textContent).toContain('Para vender servicios prepagados elige a la clienta');

    await act(async () => opcion('Elegir clienta').click());
    await act(async () => escribir(contenedor.querySelector<HTMLInputElement>('#mos-buscar-clienta')!, 'Ana'));
    await esperar(320);
    expect(m.admin.getClientes).toHaveBeenCalledWith('Ana');
    await act(async () => boton('Ana López (ejemplo)', contenedor.querySelector('.adm-resultados-busqueda')!).click());
    expect(contenedor.querySelector('.mos-clienta')!.textContent).toContain('Ana López (ejemplo)');

    m.admin.ventaMostrador.mockResolvedValue({ id: 'pe-43', folio: 'OP-00043', total: 250 });
    await act(async () => opcion('Tarjeta').click());
    expect(boton('Cobrar').disabled).toBe(false);
    await act(async () => boton('Cobrar $250').click());
    await esperar();
    expect(m.admin.ventaMostrador).toHaveBeenCalledWith({
      items: [{ tipo: 'servicio', id: 's-axilas', cantidad: 1 }],
      metodo: 'tarjeta',
      cliente_id: 'cl-ana',
      propina: 0,
      notas: null,
    });
    const ticket = contenedor.querySelector('.mos-ticket')!;
    expect(ticket.textContent).toContain('Ana López (ejemplo)');
    expect(ticket.textContent).toContain('servicios prepagados');
  });

  it('muestra el error de la base tal cual', async () => {
    m.admin.ventaMostrador.mockRejectedValue(new Error('Por ahora sólo quedan 1 piezas de Jabón de avena.'));
    await montar();
    await act(async () => tarjeta('Jabón de avena').click());
    await act(async () => boton('Cobrar').click());
    await esperar();
    expect(contenedor.querySelector('[role=alert]')?.textContent).toContain('Por ahora sólo quedan 1 piezas de Jabón de avena.');
    expect(contenedor.querySelector('.mos-ticket')).toBeNull();
  });
});
