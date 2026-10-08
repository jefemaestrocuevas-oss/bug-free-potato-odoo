// Página de Gastos: pago de un gasto fijo (prellenado y ligado), confirmación al borrar y piezas de formato.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategoriaGasto, Gasto, GastoPorVencer, GastoRecurrente } from '../../lib/api';
import { fechaLocal, sumarDias } from '../../lib/format';
import { dineroCentavos, textoDias, urlSegura } from '../../components/admin/GastosPiezas';
import Gastos from './Gastos';

const admin = vi.hoisted(() => ({
  getCategoriasGasto: vi.fn(),
  getGastosPorVencer: vi.fn(),
  getGastosRecurrentes: vi.fn(),
  getGastos: vi.fn(),
  guardarGasto: vi.fn(),
  eliminarGasto: vi.fn(),
  guardarGastoRecurrente: vi.fn(),
}));
vi.mock('../../lib/api', () => ({ api: { modo: 'demo', admin } }));

const HOY = fechaLocal();
const CATEGORIAS: CategoriaGasto[] = [
  { id: 'c-luz', slug: 'luz', nombre: 'Luz (CFE)', es_fijo: true },
  { id: 'c-pub', slug: 'publicidad', nombre: 'Publicidad y redes', es_fijo: false },
];
const LUZ: GastoRecurrente = {
  id: 'r-luz',
  categoria_id: 'c-luz',
  concepto: 'Recibo de luz CFE',
  monto_estimado: 1150,
  frecuencia: 'bimestral',
  dia_pago: 15,
  proximo_vencimiento: sumarDias(HOY, -2),
  activo: true,
  notas: null,
};
const LUZ_POR_VENCER: GastoPorVencer = {
  id: 'r-luz',
  concepto: 'Recibo de luz CFE',
  categoria: 'Luz (CFE)',
  monto_estimado: 1150,
  frecuencia: 'bimestral',
  proximo_vencimiento: LUZ.proximo_vencimiento,
  dias_restantes: -2,
  estado: 'vencido',
};
const ANUNCIO: Gasto = {
  id: 'g-1',
  categoria_id: 'c-pub',
  concepto: 'Anuncio en redes',
  monto: 850,
  fecha: HOY,
  periodo: `${HOY.slice(0, 7)}-01`,
  metodo_pago: 'tarjeta',
  proveedor: 'Meta',
  comprobante_url: 'javascript:alert(1)',
  recurrente_id: null,
  notas: null,
};

let contenedor: HTMLDivElement;
let raiz: Root;

async function esperar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function montar() {
  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={['/admin/gastos']}>
        <Gastos />
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

function escribir(el: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  admin.getCategoriasGasto.mockResolvedValue(CATEGORIAS);
  admin.getGastosRecurrentes.mockResolvedValue([LUZ]);
  admin.getGastosPorVencer.mockResolvedValue([LUZ_POR_VENCER]);
  admin.getGastos.mockResolvedValue([]);
  admin.guardarGasto.mockResolvedValue(undefined);
  admin.eliminarGasto.mockResolvedValue(undefined);
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

describe('Gastos', () => {
  it('muestra lo vencido y registra el pago de un gasto fijo prellenado y ligado', async () => {
    await montar();
    expect(contenedor.textContent).toContain('vencido hace 2 días');
    expect(contenedor.querySelector('tbody .pill-error')?.textContent).toBe('Vencido');
    expect(contenedor.querySelector('.gas-conteos')?.textContent).toBe('1 vencido');

    await act(async () => boton('Registrar pago', contenedor).click());
    const dialogo = document.querySelector('[role=dialog]')!;
    expect(dialogo).toBeTruthy();
    const monto = dialogo.querySelector<HTMLInputElement>('#gas-monto')!;
    expect(monto.value).toBe('1150');
    expect(dialogo.querySelector<HTMLInputElement>('#gas-concepto')!.value).toBe('Recibo de luz CFE');
    expect(dialogo.querySelector<HTMLSelectElement>('#gas-categoria')!.value).toBe('c-luz');
    expect(dialogo.querySelector<HTMLInputElement>('#gas-fecha')!.value).toBe(HOY);
    expect(document.activeElement).toBe(monto);

    await act(async () => escribir(monto, '1234.5'));
    await act(async () => {
      dialogo.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await esperar();

    expect(admin.guardarGasto).toHaveBeenCalledTimes(1);
    expect(admin.guardarGasto.mock.calls[0][0]).toMatchObject({
      categoria_id: 'c-luz',
      concepto: 'Recibo de luz CFE',
      monto: 1234.5,
      fecha: HOY,
      recurrente_id: 'r-luz',
      metodo_pago: null,
    });
    expect(admin.guardarGasto.mock.calls[0][0].periodo).toBeUndefined();
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(contenedor.textContent).toContain('Su próximo vencimiento avanzó dos meses');
    expect(admin.getGastosPorVencer).toHaveBeenCalledTimes(2);
  });

  it('valida el formulario antes de guardar', async () => {
    await montar();
    await act(async () => boton('+ Registrar gasto', contenedor).click());
    const dialogo = document.querySelector('[role=dialog]')!;
    await act(async () => {
      dialogo.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(dialogo.querySelector('[role=alert]')?.textContent).toContain('Elige una categoría.');
    expect(admin.guardarGasto).not.toHaveBeenCalled();
    // Sin campos marcados, el foco va al aviso de error (que queda a la vista).
    expect(document.activeElement).toBe(dialogo.querySelector('[role=alert]'));
  });

  it('pide confirmación antes de borrar y no convierte en enlace un comprobante inseguro', async () => {
    admin.getGastos.mockResolvedValue([ANUNCIO]);
    await montar();
    expect(contenedor.textContent).toContain('Anuncio en redes');
    expect([...contenedor.querySelectorAll('a')].some((a) => a.getAttribute('href')?.startsWith('javascript'))).toBe(false);

    await act(async () => boton('Borrar', contenedor).click());
    const dialogo = document.querySelector('[role=dialog]')!;
    expect(dialogo.textContent).toContain('¿Borrar este gasto?');
    expect(admin.eliminarGasto).not.toHaveBeenCalled();

    await act(async () => boton('Sí, borrar', dialogo).click());
    await esperar();
    expect(admin.eliminarGasto).toHaveBeenCalledWith('g-1');
    expect(contenedor.textContent).toContain('Se borró «Anuncio en redes».');
  });
});

describe('Piezas de gastos', () => {
  it('describe los días al vencimiento', () => {
    expect(textoDias(0)).toBe('vence hoy');
    expect(textoDias(1)).toBe('mañana');
    expect(textoDias(5)).toBe('en 5 días');
    expect(textoDias(-1)).toBe('venció ayer');
    expect(textoDias(-3)).toBe('vencido hace 3 días');
    expect(textoDias(null)).toBeNull();
  });

  it('sólo acepta enlaces http(s)', () => {
    expect(urlSegura('https://drive.google.com/x')).toBe('https://drive.google.com/x');
    expect(urlSegura('javascript:alert(1)')).toBeNull();
    expect(urlSegura('data:text/html,hola')).toBeNull();
    expect(urlSegura('recibo.pdf')).toBeNull();
    expect(urlSegura('   ')).toBeNull();
  });

  it('muestra centavos completos', () => {
    expect(dineroCentavos(1234.5)).toBe('$1,234.50');
    expect(dineroCentavos(12000)).toBe('$12,000');
    expect(dineroCentavos(0.1 + 0.2)).toBe('$0.30');
  });
});
