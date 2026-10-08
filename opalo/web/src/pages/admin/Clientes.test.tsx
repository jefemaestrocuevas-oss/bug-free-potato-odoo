// Clientas (/admin/clientes): las cuentas del equipo (es_personal) no se listan por defecto y se
// pueden mostrar con «Mostrar cuentas del equipo»; en su expediente llevan la píldora «Cuenta del equipo».
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteResumen, ExpedienteCliente } from '../../lib/api';
import Clientes from './Clientes';
import Expediente from './Expediente';

const m = vi.hoisted(() => ({
  admin: { getClientes: vi.fn(), getExpediente: vi.fn(), guardarNotasCliente: vi.fn() },
  getContraindicaciones: vi.fn(),
  getCatalogo: vi.fn(),
  getConfiguracion: vi.fn(),
}));
vi.mock('../../lib/api', () => ({ api: { modo: 'demo', ...m } }));

function cliente(id: string, nombre: string, extra: Partial<ClienteResumen> = {}): ClienteResumen {
  return {
    id,
    nombre,
    apellidos: null,
    telefono: null,
    email: null,
    fecha_nacimiento: null,
    tiene_cuenta: true,
    citas_completadas: 0,
    ultima_visita: null,
    proxima_cita: null,
    total_pagado: 0,
    creado_en: '2026-10-01T12:00:00Z',
    es_personal: false,
    ...extra,
  };
}

const LISTA = [cliente('1', 'María'), cliente('2', 'Marco', { es_personal: true }), cliente('3', 'Lucía')];

let contenedor: HTMLDivElement;
let raiz: Root;

async function esperar() {
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
}

async function montar(ruta: string) {
  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/admin/clientes" element={<Clientes />} />
          <Route path="/admin/clientes/:id" element={<Expediente />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await esperar();
}

const nombres = () => [...contenedor.querySelectorAll('.adm-cl-tabla tbody .adm-cl-nombre')].map((a) => a.textContent);
const casilla = () =>
  [...contenedor.querySelectorAll<HTMLLabelElement>('label.check')].find((l) => l.textContent?.includes('Mostrar cuentas del equipo'))?.querySelector('input');

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  m.admin.getClientes.mockReset().mockResolvedValue(LISTA);
  m.getContraindicaciones.mockResolvedValue([]);
  m.getCatalogo.mockResolvedValue(null);
  m.getConfiguracion.mockResolvedValue({ edad_minima: 15, edad_mayoria: 18 });
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
});

describe('Clientas', () => {
  it('oculta las cuentas del equipo y las muestra a pedido', async () => {
    await montar('/admin/clientes');
    expect(nombres()).toEqual(['Lucía', 'María']);
    expect(contenedor.querySelector('.adm-cl-conteo')?.textContent).toContain('1 cuenta del equipo oculta');

    await act(async () => casilla()!.click());
    await esperar();
    expect(nombres()).toEqual(['Lucía', 'Marco', 'María']);
    const fila = [...contenedor.querySelectorAll('.adm-cl-tabla tbody tr')].find((tr) => tr.textContent?.includes('Marco'))!;
    expect(fila.querySelector('.pill')?.textContent).toBe('Equipo');
    expect(contenedor.querySelector('.adm-cl-conteo')?.textContent).toBe('3 clientas · una es cuenta del equipo');
  });

  it('si sólo coinciden cuentas del equipo, lo dice y ofrece mostrarlas', async () => {
    m.admin.getClientes.mockResolvedValue([LISTA[1]]);
    await montar('/admin/clientes?q=Marco');
    expect(nombres()).toEqual([]);
    expect(contenedor.textContent).toContain('Sólo hay una cuenta del equipo que coincide.');
    const boton = [...contenedor.querySelectorAll('button')].find((b) => b.textContent === 'Mostrar cuentas del equipo')!;
    await act(async () => boton.click());
    await esperar();
    expect(nombres()).toEqual(['Marco']);
  });

  it('sin cuentas del equipo no aparece la casilla', async () => {
    m.admin.getClientes.mockResolvedValue([LISTA[0]]);
    await montar('/admin/clientes');
    expect(casilla()).toBeUndefined();
  });

  it('el expediente de una cuenta del equipo lleva la píldora «Cuenta del equipo»', async () => {
    const exp: ExpedienteCliente = {
      cliente: { ...LISTA[1], notas_internas: null },
      ficha: null,
      citas: [],
      pedidos: [],
      creditos: [],
      consentimientos: [],
    };
    m.admin.getExpediente.mockResolvedValue(exp);
    await montar('/admin/clientes/2');
    const pills = [...contenedor.querySelectorAll('.adm-ex-descripcion .pill')].map((p) => p.textContent);
    expect(pills).toContain('Cuenta del equipo');

    m.admin.getExpediente.mockResolvedValue({ ...exp, cliente: { ...exp.cliente, es_personal: false } });
    act(() => raiz.unmount());
    raiz = createRoot(contenedor);
    await montar('/admin/clientes/2');
    expect([...contenedor.querySelectorAll('.adm-ex-descripcion .pill')].map((p) => p.textContent)).not.toContain('Cuenta del equipo');
  });
});
