// Taller (/admin/taller): ficha de la tienda con ilustración en vivo, fórmulas con costo y precio
// sugerido (que no cambia el precio solo), lotes con curado (registrar, liberar y descartar) y márgenes.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CostoFormula, Formula, Lote, MargenProducto, Producto } from '../../lib/api';
import { fechaLocal, sumarDias } from '../../lib/format';
import { precioSugerido, slugDe } from '../../components/admin/TallerPiezas';
import Taller from './Taller';

const admin = vi.hoisted(() => ({
  getProductos: vi.fn(),
  getFormulas: vi.fn(),
  getCostosFormulas: vi.fn(),
  getLotes: vi.fn(),
  getMargenesProductos: vi.fn(),
  guardarProducto: vi.fn(),
  guardarFormula: vi.fn(),
  registrarLote: vi.fn(),
  liberarLote: vi.fn(),
  descartarLote: vi.fn(),
}));
vi.mock('../../lib/api', async () => ({ ...(await vi.importActual<object>('../../lib/api/tipos')), api: { modo: 'demo', admin } }));

const HOY = fechaLocal();

function producto(cambios: Partial<Producto> & Pick<Producto, 'id' | 'nombre' | 'categoria'>): Producto {
  return {
    marca: null,
    unidad_medida: 'pz',
    presentacion: null,
    contenido_presentacion: 1,
    costo_presentacion: 0,
    costo_unitario: 0,
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
    hecho_en_opalo: false,
    orden: 0,
    ...cambios,
  };
}

const JABON = producto({
  id: 'j-avena',
  nombre: 'Jabón de avena',
  categoria: 'jabon',
  costo_presentacion: 18.5,
  costo_unitario: 18.5,
  stock_actual: 7,
  stock_minimo: 3,
  precio_venta: 120,
  vendible_en_linea: true,
  slug: 'jabon-de-avena',
  aroma: 'Avena y miel',
  contenido_neto: '100 g',
  color_hex: '#d9c7a1',
  hecho_en_opalo: true,
});
const VELA = producto({ id: 'v-lavanda', nombre: 'Vela de lavanda', categoria: 'vela', precio_venta: 280, vendible_en_linea: true, slug: 'vela-de-lavanda' });
const OLIVA = producto({
  id: 'm-oliva',
  nombre: 'Aceite de oliva',
  categoria: 'materia_prima',
  unidad_medida: 'ml',
  presentacion: 'Garrafa 5 L',
  contenido_presentacion: 5000,
  costo_presentacion: 900,
  costo_unitario: 0.18,
  stock_actual: 4000,
  uso: 'produccion',
});
const SOSA = producto({
  id: 'm-sosa',
  nombre: 'Sosa cáustica',
  categoria: 'materia_prima',
  unidad_medida: 'g',
  contenido_presentacion: 1000,
  costo_presentacion: 110,
  costo_unitario: 0.11,
  stock_actual: 50,
  uso: 'produccion',
});
const FORMULA: Formula = {
  id: 'f-avena',
  producto_id: 'j-avena',
  nombre: 'Avena y miel',
  rendimiento_piezas: 10,
  dias_curado: 30,
  instrucciones: null,
  activa: true,
  items: [
    { insumo_id: 'm-oliva', cantidad: 1000 },
    { insumo_id: 'm-sosa', cantidad: 100 },
  ],
};
const COSTO: CostoFormula = {
  formula_id: 'f-avena',
  producto_id: 'j-avena',
  producto_nombre: 'Jabón de avena',
  nombre: 'Avena y miel',
  rendimiento_piezas: 10,
  dias_curado: 30,
  costo_lote: 191,
  costo_pieza: 19.1,
  precio_venta: 120,
  margen_pieza: 100.9,
  margen_pct: 84.1,
  insumos: [
    { insumo_id: 'm-oliva', nombre: 'Aceite de oliva', unidad_medida: 'ml', cantidad: 1000, costo: 180 },
    { insumo_id: 'm-sosa', nombre: 'Sosa cáustica', unidad_medida: 'g', cantidad: 100, costo: 11 },
  ],
};
function lote(cambios: Partial<Lote> & Pick<Lote, 'id' | 'codigo' | 'estado'>): Lote {
  return {
    producto_id: 'j-avena',
    producto_nombre: 'Jabón de avena',
    categoria: 'jabon',
    formula_nombre: 'Avena y miel',
    elaborado_en: sumarDias(HOY, -18),
    listo_desde: sumarDias(HOY, 12),
    dias_para_listo: 12,
    caduca_en: null,
    piezas_planeadas: 20,
    piezas_obtenidas: null,
    costo_materiales: 382,
    costo_unitario: 19.1,
    liberado_en: null,
    notas: null,
    ...cambios,
  };
}
const LISTO = lote({ id: 'l-listo', codigo: 'JAB-260901-01', estado: 'en_curado', elaborado_en: sumarDias(HOY, -31), listo_desde: sumarDias(HOY, -1), dias_para_listo: -1 });
const CURANDO = lote({ id: 'l-curando', codigo: 'JAB-260920-01', estado: 'en_curado' });
const VENDIDO = lote({ id: 'l-disp', codigo: 'JAB-260801-01', estado: 'disponible', piezas_obtenidas: 9, elaborado_en: sumarDias(HOY, -60), listo_desde: sumarDias(HOY, -30), dias_para_listo: -30 });
const MARGENES: MargenProducto[] = [
  { id: 'j-avena', nombre: 'Jabón de avena', categoria: 'jabon', precio_venta: 120, costo_unitario: 18.5, margen: 101.5, margen_pct: 84.6, stock_actual: 7, piezas_en_curado: 40, vendidas_30d: 5 },
  { id: 'v-lavanda', nombre: 'Vela de lavanda', categoria: 'vela', precio_venta: 280, costo_unitario: 0, margen: null, margen_pct: null, stock_actual: 0, piezas_en_curado: 0, vendidas_30d: 0 },
  { id: 's-regalo', nombre: 'Set de regalo', categoria: 'set', precio_venta: 100, costo_unitario: 60, margen: 40, margen_pct: 40, stock_actual: 2, piezas_en_curado: 0, vendidas_30d: 1 },
];

let contenedor: HTMLDivElement;
let raiz: Root;

async function esperar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function montar(ruta = '/admin/taller') {
  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={[ruta]}>
        <Taller />
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

function escribir(el: HTMLInputElement | HTMLTextAreaElement, valor: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const dialogo = () => {
  const ds = document.querySelectorAll('[role=dialog]');
  return ds[ds.length - 1] as HTMLElement;
};

async function enviar(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await esperar();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  admin.getProductos.mockResolvedValue([JABON, VELA, OLIVA, SOSA]);
  admin.getFormulas.mockResolvedValue([FORMULA]);
  admin.getCostosFormulas.mockResolvedValue([COSTO]);
  admin.getLotes.mockResolvedValue([LISTO, CURANDO, VENDIDO]);
  admin.getMargenesProductos.mockResolvedValue(MARGENES);
  admin.guardarProducto.mockImplementation(async (p) => ({ ...JABON, ...p, id: p.id ?? 'nuevo' }));
  admin.guardarFormula.mockResolvedValue('f-avena');
  admin.registrarLote.mockResolvedValue({ id: 'l-nuevo', codigo: 'JAB-261008-01', costo_materiales: 95.5, costo_unitario: 19.1, listo_desde: sumarDias(HOY, 30), estado: 'en_curado' });
  admin.liberarLote.mockResolvedValue(undefined);
  admin.descartarLote.mockResolvedValue(undefined);
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

describe('Taller · productos de la tienda', () => {
  it('lista jabones y velas (no la materia prima) con su ilustración, piezas y si se ven en línea', async () => {
    await montar();
    const tarjetas = [...contenedor.querySelectorAll('.tal-producto')];
    expect(tarjetas.map((t) => t.querySelector('h3')?.textContent)).toEqual(['Jabón de avena', 'Vela de lavanda']);
    const jabon = tarjetas[0];
    expect(jabon.querySelector('svg.ilustracion-producto')).toBeTruthy();
    expect(jabon.textContent).toContain('7 pz');
    // 40 piezas curando (20 del lote listo + 20 del que cura).
    expect(jabon.textContent).toContain('40 pz');
    expect(jabon.textContent).toContain('En la tienda en línea');
    expect(tarjetas[1].textContent).toContain('Agotado');
    // KPI: un lote listo para liberar.
    expect(contenedor.querySelector('.adm-kpi-alerta')?.textContent).toContain('Listos para liberar');
  });

  it('edita la ficha: color con vista previa en vivo, INCI y se guarda por pieza', async () => {
    await montar();
    await act(async () => boton('Editar ficha', contenedor).click());
    const d = dialogo();
    expect(d.textContent).toContain('usa nombres INCI cuando aplique');
    const hex = d.querySelector<HTMLInputElement>('.tal-color-hex')!;
    await act(async () => escribir(hex, '#3a5f8c'));
    expect(d.querySelector('.tal-vista-imagen svg')!.innerHTML).toContain('#3a5f8c');
    await act(async () => escribir(d.querySelector<HTMLTextAreaElement>('#tal-ingredientes')!, 'Sodium Olivate, Aqua, Avena Sativa Kernel Flour'));
    await enviar(d.querySelector('form')!);

    expect(admin.guardarProducto).toHaveBeenCalledTimes(1);
    const datos = admin.guardarProducto.mock.calls[0][0];
    expect(datos).toMatchObject({
      id: 'j-avena',
      categoria: 'jabon',
      unidad_medida: 'pz',
      contenido_presentacion: 1,
      costo_presentacion: 18.5,
      color_hex: '#3a5f8c',
      ingredientes: 'Sodium Olivate, Aqua, Avena Sativa Kernel Flour',
      slug: 'jabon-de-avena',
      precio_venta: 120,
      vendible_en_linea: true,
    });
    expect(datos).not.toHaveProperty('stock_actual');
    expect(contenedor.textContent).toContain('Ficha de «Jabón de avena» guardada.');
  });

  it('un producto nuevo saca el slug del nombre y no deja repetirlo ni venderlo en línea sin precio', async () => {
    await montar();
    await act(async () => boton('+ Nuevo producto', contenedor).click());
    const d = dialogo();
    await act(async () => escribir(d.querySelector<HTMLInputElement>('#tal-nombre')!, 'Vela de lavanda'));
    expect(d.querySelector<HTMLInputElement>('#tal-slug')!.value).toBe('vela-de-lavanda');
    await enviar(d.querySelector('form')!);
    expect(d.querySelector('[role=alert]')?.textContent).toContain('Ese slug ya lo usa «Vela de lavanda»');
    expect(admin.guardarProducto).not.toHaveBeenCalled();

    await act(async () => escribir(d.querySelector<HTMLInputElement>('#tal-nombre')!, 'Vela de canela y naranja'));
    const enLinea = [...d.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Vender en la tienda en línea'))!.querySelector('input')!;
    await act(async () => enLinea.click());
    await enviar(d.querySelector('form')!);
    expect(d.querySelector('[role=alert]')?.textContent).toContain('Para venderlo en línea, escribe su precio.');

    await act(async () => escribir(d.querySelector<HTMLInputElement>('#tal-precio')!, '260'));
    await enviar(d.querySelector('form')!);
    expect(admin.guardarProducto.mock.calls[0][0]).toMatchObject({
      nombre: 'Vela de canela y naranja',
      slug: 'vela-de-canela-y-naranja',
      unidad_medida: 'pz',
      contenido_presentacion: 1,
      uso: 'venta',
      precio_venta: 260,
      vendible_en_linea: true,
      hecho_en_opalo: true,
    });
    expect(admin.guardarProducto.mock.calls[0][0].id).toBeUndefined();
  });
});

describe('Taller · fórmulas', () => {
  it('muestra el costo y sugiere un precio, pero sólo lo cambia al confirmar', async () => {
    await montar('/admin/taller?pestana=formulas');
    const fila = [...contenedor.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes('Avena y miel'))!;
    expect(fila.textContent).toContain('$191');
    expect(fila.textContent).toContain('$19.10');
    expect(fila.textContent).toContain('84.1 %');
    // 60 % por omisión: 19.10 ÷ 0.40 = 47.75 → $48.
    expect(fila.textContent).toContain('$48');

    await act(async () => escribir(contenedor.querySelector<HTMLInputElement>('#tal-margen')!, '85'));
    expect(fila.textContent).toContain('$128');
    await act(async () => boton('Aplicar', fila).click());
    const d = dialogo();
    expect(d.textContent).toContain('¿Cambiar el precio de Jabón de avena?');
    expect(admin.guardarProducto).not.toHaveBeenCalled();
    await act(async () => boton('Sí, cobrar $128', d).click());
    await esperar();
    expect(admin.guardarProducto).toHaveBeenCalledTimes(1);
    expect(admin.guardarProducto.mock.calls[0][0]).toMatchObject({ id: 'j-avena', precio_venta: 128, slug: 'jabon-de-avena', costo_presentacion: 18.5 });
    expect(contenedor.textContent).toContain('Precio de Jabón de avena actualizado a $128.');
  });

  it('el editor calcula en vivo el costo por lote y por pieza y guarda los insumos', async () => {
    await montar('/admin/taller?pestana=formulas');
    await act(async () => contenedor.querySelector<HTMLButtonElement>('[aria-label="Editar la fórmula Avena y miel"]')!.click());
    const d = dialogo();
    const resumen = () => d.querySelector('.cos-resumen')!.textContent!;
    expect(resumen()).toContain('$191');
    expect(resumen()).toContain('$19.10');
    const cantidad = d.querySelector<HTMLInputElement>('[aria-label^="Cantidad del insumo 1"]')!;
    await act(async () => escribir(cantidad, '2000'));
    expect(resumen()).toContain('$371');
    expect(resumen()).toContain('$37.10');
    await enviar(d.querySelector('form')!);
    expect(admin.guardarFormula).toHaveBeenCalledWith({
      id: 'f-avena',
      producto_id: 'j-avena',
      nombre: 'Avena y miel',
      rendimiento_piezas: 10,
      dias_curado: 30,
      instrucciones: null,
      activa: true,
      items: [
        { insumo_id: 'm-oliva', cantidad: 2000 },
        { insumo_id: 'm-sosa', cantidad: 100 },
      ],
    });
  });
});

describe('Taller · lotes', () => {
  it('explica el curado y ordena por estado con lo que falta de curado', async () => {
    await montar('/admin/taller?pestana=lotes');
    expect(contenedor.textContent).toContain('El curado es el reposo que necesita cada lote');
    const secciones = [...contenedor.querySelectorAll('.tal-seccion-titulo')].map((h) => h.textContent);
    expect(secciones).toEqual(['Listos para liberar 1', 'En curado 1', 'Disponibles 1']);
    const curando = contenedor.querySelector('#tal-s-curado')!.closest('section')!;
    expect(curando.textContent).toContain('Faltan 12 días');
    const barra = curando.querySelector('[role=progressbar]')!;
    expect(barra.getAttribute('aria-valuetext')).toBe('18 de 30 días de curado');
  });

  it('registra un lote: escala la fórmula, avisa si no alcanza y muestra código, costo y fecha', async () => {
    await montar('/admin/taller?pestana=lotes');
    await act(async () => boton('+ Registrar lote', contenedor.querySelector('.tal-barra')!).click());
    const d = dialogo();
    expect(d.querySelector<HTMLSelectElement>('#lote-producto')!.value).toBe('j-avena');
    expect(d.querySelector<HTMLInputElement>('#lote-piezas')!.value).toBe('10');
    expect(d.querySelector('.tal-listo-desde')!.textContent).toContain('30 días de curado');
    // 10 piezas piden 100 g de sosa y sólo hay 50.
    expect(d.textContent).toContain('No alcanza el inventario de Sosa cáustica');

    await act(async () => escribir(d.querySelector<HTMLInputElement>('#lote-piezas')!, '5'));
    expect(d.textContent).not.toContain('No alcanza el inventario');
    expect(d.querySelector('.cos-resumen')!.textContent).toContain('$95.50');
    await act(async () => escribir(d.querySelector<HTMLTextAreaElement>('#lote-notas')!, 'Molde redondo'));
    await enviar(d.querySelector('form')!);

    expect(admin.registrarLote).toHaveBeenCalledWith({
      producto_id: 'j-avena',
      formula_id: 'f-avena',
      piezas: 5,
      elaborado_en: HOY,
      caduca_en: null,
      notas: 'Molde redondo',
      items: null,
    });
    const r = dialogo();
    expect(r.textContent).toContain('JAB-261008-01');
    expect(r.textContent).toContain('$19.10');
    expect(r.textContent).toContain('Listo desde');
    await act(async () => boton('Listo', r).click());
    await esperar();
    expect(contenedor.textContent).toContain('Lote JAB-261008-01 de Jabón de avena registrado');
    expect(admin.getLotes).toHaveBeenCalledTimes(2);
  });

  it('con «ajustar materiales» manda lo que realmente se usó', async () => {
    await montar('/admin/taller?pestana=lotes');
    await act(async () => boton('+ Registrar lote', contenedor.querySelector('.tal-barra')!).click());
    const d = dialogo();
    await act(async () => escribir(d.querySelector<HTMLInputElement>('#lote-piezas')!, '5'));
    const ajustar = [...d.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Ajustar materiales usados'))!.querySelector('input')!;
    await act(async () => ajustar.click());
    const cantidades = [...d.querySelectorAll<HTMLInputElement>('[aria-label^="Cantidad usada"]')];
    expect(cantidades.map((c) => c.value)).toEqual(['500', '50']);
    await act(async () => escribir(cantidades[1], '45'));
    await enviar(d.querySelector('form')!);
    expect(admin.registrarLote.mock.calls[0][0].items).toEqual([
      { insumo_id: 'm-oliva', cantidad: 500 },
      { insumo_id: 'm-sosa', cantidad: 45 },
    ]);
  });

  it('un jabón sin fórmula no se registra (quedaría a la venta sin curar): pide crear su fórmula', async () => {
    const CARBON = producto({ id: 'j-carbon', nombre: 'Jabón de carbón', categoria: 'jabon', precio_venta: 150, hecho_en_opalo: true });
    admin.getProductos.mockResolvedValue([JABON, CARBON, VELA, OLIVA, SOSA]);
    await montar('/admin/taller?pestana=lotes');
    await act(async () => boton('+ Registrar lote', contenedor.querySelector('.tal-barra')!).click());
    let d = dialogo();
    const elegir = d.querySelector<HTMLSelectElement>('#lote-producto')!;
    expect([...elegir.options].find((o) => o.value === 'j-carbon')!.textContent).toContain('(falta su fórmula)');
    await act(async () => {
      elegir.value = 'j-carbon';
      elegir.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const formulas = [...d.querySelector<HTMLSelectElement>('#lote-formula')!.options].map((o) => o.textContent);
    expect(formulas.join(' ')).not.toContain('Sin fórmula');
    expect(d.textContent).toContain('Los jabones necesitan su fórmula');
    expect(d.querySelector('.tal-listo-desde')!.textContent).not.toContain('sin curado');
    expect(d.querySelector('[aria-label^="Cantidad usada"]')).toBeNull();
    await enviar(d.querySelector('form')!);
    expect(admin.registrarLote).not.toHaveBeenCalled();
    expect(d.querySelector('[role=alert]')?.textContent).toContain('Los jabones necesitan una fórmula con sus días de curado');

    // «Crear su fórmula» abre el editor con el producto ya elegido.
    await act(async () => boton('Crear su fórmula', d).click());
    d = dialogo();
    expect(d.querySelector<HTMLSelectElement>('#for-producto')!.value).toBe('j-carbon');
  });

  it('una vela sin fórmula sí se registra con los materiales que se anotan', async () => {
    admin.getFormulas.mockResolvedValue([]);
    await montar('/admin/taller?pestana=lotes');
    await act(async () => boton('+ Registrar lote', contenedor.querySelector('.tal-barra')!).click());
    const d = dialogo();
    const elegir = d.querySelector<HTMLSelectElement>('#lote-producto')!;
    await act(async () => {
      elegir.value = 'v-lavanda';
      elegir.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect([...d.querySelector<HTMLSelectElement>('#lote-formula')!.options].map((o) => o.textContent)).toContain('Sin fórmula (anoto los materiales)');
    expect(d.textContent).not.toContain('Los jabones necesitan su fórmula');
    expect(d.querySelector('[aria-label^="Cantidad usada"]')).not.toBeNull();
  });

  it('liberar un lote que sigue en curado pide confirmarlo y lo fuerza', async () => {
    await montar('/admin/taller?pestana=lotes');
    const curando = contenedor.querySelector('#tal-s-curado')!.closest('section')!;
    await act(async () => boton('Liberar', curando).click());
    const d = dialogo();
    expect(d.textContent).toContain('Este lote sigue en curado hasta el');
    await act(async () => escribir(d.querySelector<HTMLInputElement>('#tal-piezas-obtenidas')!, '18'));
    await enviar(d.querySelector('form')!);
    expect(admin.liberarLote).not.toHaveBeenCalled();
    expect(d.querySelector('[role=alert]')?.textContent).toContain('Para liberarlo antes, confírmalo abajo.');

    const forzar = [...d.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Sí, liberarlo antes de tiempo'))!.querySelector('input')!;
    await act(async () => forzar.click());
    await enviar(d.querySelector('form')!);
    expect(admin.liberarLote).toHaveBeenCalledWith('l-curando', 18, true);
    expect(contenedor.textContent).toContain('Lote JAB-260920-01 liberado: 18 piezas de Jabón de avena ya se pueden vender');
  });

  it('un lote listo se libera sin forzar; descartar pide el motivo', async () => {
    await montar('/admin/taller?pestana=lotes');
    const listos = contenedor.querySelector('#tal-s-listos')!.closest('section')!;
    await act(async () => boton('Liberar', listos).click());
    await enviar(dialogo().querySelector('form')!);
    expect(admin.liberarLote).toHaveBeenCalledWith('l-listo', 20, false);

    const curando = contenedor.querySelector('#tal-s-curado')!.closest('section')!;
    await act(async () => boton('Descartar', curando).click());
    const d = dialogo();
    expect(d.textContent).toContain('cuentan como merma del mes');
    await enviar(d.querySelector('form')!);
    expect(admin.descartarLote).not.toHaveBeenCalled();
    await act(async () => escribir(d.querySelector<HTMLTextAreaElement>('#tal-motivo')!, 'Se cortó la mezcla'));
    await enviar(d.querySelector('form')!);
    expect(admin.descartarLote).toHaveBeenCalledWith('l-curando', 'Se cortó la mezcla');
  });
});

describe('Taller · márgenes', () => {
  it('marca margen bajo y productos sin costo', async () => {
    await montar('/admin/taller?pestana=margenes');
    const filas = [...contenedor.querySelectorAll('.tal-tabla-margenes tbody tr')];
    const de = (n: string) => filas.find((f) => f.textContent?.includes(n))!.textContent!;
    expect(de('Vela de lavanda')).toContain('Sin costo');
    expect(de('Set de regalo')).toContain('Margen bajo');
    expect(de('Jabón de avena')).toContain('En orden');
    expect(de('Jabón de avena')).toContain('40 pz');
    const kpis = [...contenedor.querySelectorAll('.adm-kpi')].map((k) => k.textContent);
    expect(kpis.find((k) => k?.startsWith('Margen promedio'))).toContain('62.3 %');
  });

  it('un producto sin lote liberado (costo de su fórmula) se marca como costo estimado', async () => {
    const CARBON = producto({ id: 'j-carbon', nombre: 'Jabón de carbón', categoria: 'jabon', precio_venta: 150 }); // sin costo propio
    admin.getProductos.mockResolvedValue([JABON, CARBON, VELA, OLIVA, SOSA]);
    admin.getMargenesProductos.mockResolvedValue([
      ...MARGENES,
      { id: 'j-carbon', nombre: 'Jabón de carbón', categoria: 'jabon', precio_venta: 150, costo_unitario: 21.32, margen: 128.68, margen_pct: 85.8, stock_actual: 0, piezas_en_curado: 12, vendidas_30d: 0 },
    ]);
    await montar('/admin/taller?pestana=margenes');
    const filas = [...contenedor.querySelectorAll('.tal-tabla-margenes tbody tr')];
    const de = (n: string) => filas.find((f) => f.textContent?.includes(n))!.textContent!;
    expect(de('Jabón de carbón')).toContain('estimado (fórmula)');
    expect(de('Jabón de carbón')).toContain('Costo estimado');
    expect(de('Jabón de carbón')).not.toContain('En orden');
    expect(de('Jabón de avena')).not.toContain('estimado');
    expect(de('Set de regalo')).not.toContain('estimado'); // sin ficha a la mano: no se supone nada
    const kpi = [...contenedor.querySelectorAll('.adm-kpi')].find((k) => k.textContent?.startsWith('Sin costo real'))!;
    expect(kpi.textContent).toContain('2');
    expect(kpi.textContent).toContain('1 con costo estimado (fórmula) · 1 sin costo');
  });
});

describe('Piezas del taller', () => {
  it('slug sin acentos, ñ ni «(ejemplo)»', () => {
    expect(slugDe('Jabón de Avena y Miel')).toBe('jabon-de-avena-y-miel');
    expect(slugDe('Vela "Mañanita" (ejemplo)')).toBe('vela-mananita');
  });
  it('precio sugerido redondeado hacia arriba al peso', () => {
    expect(precioSugerido(19.1, 60)).toBe(48);
    expect(precioSugerido(30, 50)).toBe(60);
    expect(precioSugerido(0, 60)).toBeNull();
    expect(precioSugerido(10, 100)).toBeNull();
  });
});
