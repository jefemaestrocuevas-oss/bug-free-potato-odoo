// Catálogo (/admin/catalogo): aviso de precios por confirmar, edición de servicios, paquetes y reglas R1/R8.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalogo as TCatalogo, Paquete, Servicio } from '../../lib/api';
import { enteroDe, reservaEnLinea, slugDe, sumaPorSeparado, textoVigencia, ventaEnLinea } from '../../components/admin/CatalogoPiezas';
import Catalogo from './Catalogo';

const mocks = vi.hoisted(() => ({
  admin: { guardarServicio: vi.fn(), guardarPaquete: vi.fn() },
  getCatalogo: vi.fn(),
  getConfiguracion: vi.fn(),
}));
vi.mock('../../lib/api', () => ({
  api: { modo: 'demo', admin: mocks.admin, getCatalogo: mocks.getCatalogo, getConfiguracion: mocks.getConfiguracion },
}));

function servicio(id: string, nombre: string, precio: number | null, extra: Partial<Servicio> = {}): Servicio {
  return {
    id,
    categoria_id: 'dep',
    slug: id,
    nombre,
    descripcion: null,
    zonas_incluye: null,
    duracion_min: null,
    duracion_primera_vez_min: null,
    precio,
    etapa: 'disponible',
    es_complemento: false,
    reservable_en_linea: true,
    vendible_en_linea: true,
    tipo_consentimiento: 'consentimiento_depilacion',
    activo: true,
    orden: 1,
    ...extra,
  };
}

const CEJAS = servicio('cejas', 'Cejas', 120);
const AXILAS = servicio('axilas', 'Axilas', 120, { orden: 2 });
const BIGOTE = servicio('bigote', 'Labio superior', null, { orden: 3 });
const VIEJO = servicio('viejo', 'Servicio retirado', null, { activo: false, orden: 4 });
const PRONTO = servicio('pronto', 'Láser', null, { etapa: 'segunda_etapa', orden: 5 });
const ROSTRO: Paquete = {
  id: 'p-rostro',
  slug: 'rostro',
  nombre: 'Paquete Rostro',
  descripcion: null,
  tipo: 'combo',
  precio: 200,
  duracion_min: null,
  vigencia_dias: null,
  activo: true,
  orden: 1,
  items: [
    { servicio_id: 'cejas', cantidad: 1 },
    { servicio_id: 'axilas', cantidad: 1 },
  ],
};
const CATALOGO: TCatalogo = {
  categorias: [{ id: 'dep', slug: 'depilacion', nombre: 'Depilación con cera', descripcion: null, orden: 1 }],
  servicios: [CEJAS, AXILAS, BIGOTE, VIEJO, PRONTO],
  paquetes: [ROSTRO],
};

let contenedor: HTMLDivElement;
let raiz: Root;

async function esperar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function montar(ruta = '/admin/catalogo') {
  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={[ruta]}>
        <Catalogo />
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

function elegir(el: HTMLSelectElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
  setter.call(el, valor);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function enviar(dialogo: Element) {
  await act(async () => {
    dialogo.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await esperar();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.getCatalogo.mockResolvedValue(CATALOGO);
  mocks.getConfiguracion.mockResolvedValue({ vigencia_creditos_dias: 365 });
  mocks.admin.guardarServicio.mockResolvedValue(undefined);
  mocks.admin.guardarPaquete.mockResolvedValue(undefined);
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

describe('Catálogo', () => {
  it('pide todo el catálogo y avisa cuántos servicios activos y disponibles no tienen precio', async () => {
    await montar();
    expect(mocks.getCatalogo).toHaveBeenCalledWith({ incluirInactivos: true });
    // Sólo «Labio superior»: el inactivo y el de segunda etapa no cuentan.
    expect(contenedor.querySelector('.cat-aviso-cifra')?.textContent).toBe('1');
    expect(contenedor.querySelector('.cat-aviso-precios')?.textContent).toContain('1 servicio activo tiene «precio por confirmar»');

    await act(async () => boton('Ver cuáles', contenedor).click());
    const filas = [...contenedor.querySelectorAll('.cat-tabla tbody tr')].map((tr) => tr.querySelector('.cat-nombre')?.textContent);
    expect(filas).toEqual(['Labio superior']);
  });

  it('guarda el servicio completo con precio y duración normalizados', async () => {
    await montar();
    const fila = [...contenedor.querySelectorAll('.cat-tabla tbody tr')].find((tr) => tr.textContent?.includes('Labio superior'))!;
    await act(async () => boton('Editar', fila).click());
    const dialogo = document.querySelector('[role=dialog]')!;
    expect(dialogo.textContent).toContain('bigote'); // slug de sólo lectura
    expect(dialogo.querySelector('#srv-slug')).toBeNull();

    await act(async () => escribir(dialogo.querySelector<HTMLInputElement>('#srv-precio')!, '95,5'));
    await act(async () => escribir(dialogo.querySelector<HTMLInputElement>('#srv-dur')!, '45'));
    expect(dialogo.querySelector('.cat-vista-lista')?.textContent).toContain('Se vende en línea a $95.5');
    await enviar(dialogo);

    expect(mocks.admin.guardarServicio).toHaveBeenCalledTimes(1);
    expect(mocks.admin.guardarServicio.mock.calls[0][0]).toEqual({
      ...BIGOTE,
      precio: 95.5,
      duracion_min: 45,
    });
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(contenedor.textContent).toContain('guardamos los cambios de «Labio superior»');
    expect(mocks.getCatalogo).toHaveBeenCalledTimes(2);
  });

  it('valida un servicio nuevo antes de enviarlo (nombre y slug repetido)', async () => {
    await montar();
    await act(async () => boton('Nuevo servicio', contenedor).click());
    const dialogo = document.querySelector('[role=dialog]')!;
    await enviar(dialogo);
    expect(dialogo.querySelector('[role=alert]')?.textContent).toContain('Escribe el nombre del servicio.');

    await act(async () => escribir(dialogo.querySelector<HTMLInputElement>('#srv-nombre')!, 'Cejas'));
    expect(dialogo.querySelector('.cat-error-campo')?.textContent).toContain('«cejas»');
    await enviar(dialogo);
    expect(mocks.admin.guardarServicio).not.toHaveBeenCalled();
  });

  it('muestra los paquetes con lo que suman por separado y crea un bono', async () => {
    await montar('/admin/catalogo?pestana=paquetes');
    const tarjeta = contenedor.querySelector('.cat-paquete')!;
    expect(tarjeta.textContent).toContain('Por separado suman $240');
    expect(tarjeta.textContent).toContain('ahorra $40');
    expect(tarjeta.textContent).toContain('365 días (estándar)');

    await act(async () => boton('Nuevo paquete', contenedor).click());
    const dialogo = document.querySelector('[role=dialog]')!;
    await act(async () => escribir(dialogo.querySelector<HTMLInputElement>('#paq-nombre')!, 'Bono axila x5'));
    await act(async () => dialogo.querySelector<HTMLInputElement>('input[value=bono]')!.click());
    await act(async () => elegir(dialogo.querySelector<HTMLSelectElement>('.cat-linea select')!, 'axilas'));
    await act(async () => escribir(dialogo.querySelector<HTMLInputElement>('.cat-linea-cantidad input')!, '5'));
    await act(async () => escribir(dialogo.querySelector<HTMLInputElement>('#paq-precio')!, '500'));
    await act(async () => escribir(dialogo.querySelector<HTMLInputElement>('#paq-vigencia')!, '180'));
    expect(dialogo.querySelector('.cat-cuentas')?.textContent).toContain('$600');
    await enviar(dialogo);

    expect(mocks.admin.guardarPaquete).toHaveBeenCalledTimes(1);
    expect(mocks.admin.guardarPaquete.mock.calls[0][0]).toEqual({
      id: undefined,
      slug: 'bono-axila-x5',
      nombre: 'Bono axila x5',
      descripcion: null,
      tipo: 'bono',
      precio: 500,
      duracion_min: null,
      vigencia_dias: 180,
      activo: true,
      orden: 0,
      items: [{ servicio_id: 'axilas', cantidad: 5 }],
    });
  });

  it('no guarda un paquete sin servicios', async () => {
    await montar('/admin/catalogo?pestana=paquetes');
    await act(async () => boton('Nuevo paquete', contenedor).click());
    const dialogo = document.querySelector('[role=dialog]')!;
    await act(async () => escribir(dialogo.querySelector<HTMLInputElement>('#paq-nombre')!, 'Vacío'));
    await enviar(dialogo);
    expect(dialogo.querySelector('[role=alert]')?.textContent).toContain('Agrega al menos un servicio');
    expect(mocks.admin.guardarPaquete).not.toHaveBeenCalled();
  });
});

describe('Piezas del catálogo', () => {
  it('aplica R1 y R8: sin precio se reserva pero no se vende; otra etapa no se reserva', () => {
    expect(reservaEnLinea(BIGOTE).si).toBe(true);
    expect(ventaEnLinea(BIGOTE)).toEqual({ si: false, motivo: 'Falta el precio' });
    expect(reservaEnLinea(PRONTO).si).toBe(false);
    expect(ventaEnLinea({ ...CEJAS, etapa: 'requiere_curso' }).si).toBe(false);
    expect(reservaEnLinea(VIEJO).motivo).toBe('Está inactivo');
    expect(reservaEnLinea({ ...CEJAS, reservable_en_linea: false }).si).toBe(false);
    expect(ventaEnLinea(CEJAS).si).toBe(true);
  });

  it('suma los servicios sueltos sólo cuando se conocen todos los precios', () => {
    const porId = new Map(CATALOGO.servicios.map((s) => [s.id, s]));
    expect(sumaPorSeparado(ROSTRO.items, porId)).toBe(240);
    expect(sumaPorSeparado([{ servicio_id: 'axilas', cantidad: 5 }], porId)).toBe(600);
    expect(sumaPorSeparado([...ROSTRO.items, { servicio_id: 'bigote', cantidad: 1 }], porId)).toBeNull();
    expect(sumaPorSeparado([], porId)).toBeNull();
  });

  it('genera slugs como el servidor y lee enteros', () => {
    expect(slugDe('  Depilación: Media pierna ')).toBe('depilacion-media-pierna');
    expect(slugDe('Ñoño & Cía')).toBe('nono-cia');
    expect(enteroDe('')).toBeNull();
    expect(enteroDe('45')).toBe(45);
    expect(enteroDe('4.5')).toBeNaN();
    expect(enteroDe('0', 1)).toBeNaN();
    expect(textoVigencia({ vigencia_dias: null }, 365)).toBe('365 días (estándar)');
    expect(textoVigencia({ vigencia_dias: 1 }, 365)).toBe('1 día');
  });
});
