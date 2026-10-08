// Resumen (/admin): lotes listos para liberar, pedidos por entregar y la firma que falta (se hace en cabina).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CitaDetalle, Lote, Producto, ProductoReposicion, ResumenHoy } from '../../lib/api';
import { fechaLocal, isoDesdeLocal, sumarDias } from '../../lib/format';
import Resumen from './Resumen';

const admin = vi.hoisted(() => ({ getResumenHoy: vi.fn(), getAgenda: vi.fn(), getProductos: vi.fn(), getLotes: vi.fn() }));
vi.mock('../../lib/api', async () => ({ ...(await vi.importActual<object>('../../lib/api/tipos')), api: { modo: 'demo', admin } }));
vi.mock('../../lib/sesion', () => ({
  useSesion: () => ({
    sesion: { user_id: 'u-1', email: 'especialista@ejemplo.mx', rol: 'personal', cliente: { id: 'c-1', nombre: 'Mariana', apellidos: null } },
    cargando: false,
    refrescar: async () => undefined,
    esPersonal: true,
    esAdmin: false,
  }),
}));

const HOY = fechaLocal();
const CITA: CitaDetalle = {
  id: 'ci-1',
  cliente_id: 'cl-ana',
  cliente_nombre: 'Ana López (ejemplo)',
  cliente_telefono: null,
  inicio: isoDesdeLocal(HOY, '11:00'),
  fin: isoDesdeLocal(HOY, '12:00'),
  duracion_min: 60,
  estado: 'confirmada',
  origen: 'web',
  primera_vez: false,
  requiere_revision: false,
  alertas: [],
  notas_cliente: null,
  total: 250,
  personal_id: 'p-1',
  personal_nombre: 'Mariana',
  personal_titulo: null,
  cabina_nombre: 'Cabina 1',
  consentimientos_firmados: 0,
  pagado: 0,
  items: [{ nombre: 'Axilas', precio: 250, duracion_min: null, servicio_id: 's-1', paquete_id: null }],
};
const LOTE: Lote = {
  id: 'l-1',
  codigo: 'JAB-260901-01',
  producto_id: 'j-avena',
  producto_nombre: 'Jabón de avena (ejemplo)',
  categoria: 'jabon',
  formula_nombre: 'Avena y miel',
  elaborado_en: sumarDias(HOY, -31),
  listo_desde: sumarDias(HOY, -1),
  dias_para_listo: -1,
  caduca_en: null,
  piezas_planeadas: 12,
  piezas_obtenidas: null,
  costo_materiales: 220,
  costo_unitario: 18.33,
  estado: 'en_curado',
  liberado_en: null,
  notas: null,
};
const RESUMEN: ResumenHoy = {
  citas_hoy: [CITA],
  por_revisar: 0,
  reposicion: [],
  gastos_por_vencer: [],
  mes_actual: null,
  pedidos_pendientes: 0,
  pedidos_por_entregar: 2,
  lotes_listos: [LOTE],
};

let contenedor: HTMLDivElement;
let raiz: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  admin.getResumenHoy.mockResolvedValue(RESUMEN);
  admin.getAgenda.mockResolvedValue([]);
  admin.getProductos.mockResolvedValue([]);
  admin.getLotes.mockResolvedValue([]);
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  vi.clearAllMocks();
});

describe('Resumen', () => {
  it('avisa de los lotes listos, los pedidos por entregar y la firma pendiente en cabina', async () => {
    await act(async () => {
      raiz.render(
        <MemoryRouter initialEntries={['/admin']}>
          <Resumen />
        </MemoryRouter>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const lotes = contenedor.querySelector('#b-lotes')!.closest('section')!;
    expect(lotes.textContent).toContain('Jabón de avena (ejemplo)');
    expect(lotes.textContent).toContain('JAB-260901-01');
    expect(lotes.querySelector('a')!.getAttribute('href')).toBe('/admin/taller?pestana=lotes');

    const entregar = contenedor.querySelector('#b-entregar')!.closest('section')!;
    expect(entregar.textContent).toContain('2 pedidos pagados');
    expect(entregar.querySelector('a')!.getAttribute('href')).toBe('/admin/pedidos?estado=por_entregar');

    const hoy = contenedor.querySelector('#b-hoy')!.closest('section')!;
    expect(hoy.textContent).toContain('A 1 cita le falta la firma');
    expect(hoy.textContent).toContain('La firma se hace en la tablet de la cabina');
    const firma = hoy.querySelector('.adm-hoy-firma')!;
    expect(firma.textContent).toContain('Falta firma');
    expect(firma.querySelector('a')!.textContent).toContain('Firmar en cabina');
    expect(contenedor.textContent).not.toContain('Sin firma');
  });

  it('«Hay que reponer»: si ya cura un lote que alcanza, no pide hacer otro; el texto de pedidos no habla sólo de créditos', async () => {
    const repo = (id: string, nombre: string): ProductoReposicion => ({
      id,
      nombre,
      marca: null,
      unidad_medida: 'pz',
      stock_actual: 0,
      stock_minimo: 4,
      faltante: 4,
      presentacion: null,
      contenido_presentacion: 1,
      presentaciones_sugeridas: 5,
      costo_estimado: 0,
      proveedor_nombre: null,
    });
    const jabon = (id: string, nombre: string) => ({ id, nombre, categoria: 'jabon', stock_actual: 0, stock_minimo: 4 }) as Producto;
    admin.getResumenHoy.mockResolvedValue({
      ...RESUMEN,
      pedidos_pendientes: 1,
      reposicion: [repo('j-carbon', 'Jabón de carbón (ejemplo)'), repo('j-rosa', 'Jabón de rosa (ejemplo)')],
    });
    admin.getProductos.mockResolvedValue([jabon('j-carbon', 'Jabón de carbón (ejemplo)'), jabon('j-rosa', 'Jabón de rosa (ejemplo)')]);
    // Carbón: 12 piezas curando (alcanzan); rosa: sólo 2 (no alcanzan para pasar del mínimo).
    admin.getLotes.mockResolvedValue([
      { ...LOTE, id: 'l-c', producto_id: 'j-carbon', piezas_planeadas: 12, listo_desde: sumarDias(HOY, 10), dias_para_listo: 10 },
      { ...LOTE, id: 'l-r', producto_id: 'j-rosa', piezas_planeadas: 2, listo_desde: sumarDias(HOY, 5), dias_para_listo: 5 },
    ]);
    await act(async () => {
      raiz.render(
        <MemoryRouter initialEntries={['/admin']}>
          <Resumen />
        </MemoryRouter>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(admin.getLotes).toHaveBeenCalledWith('en_curado');
    const reponer = contenedor.querySelector('#b-reponer')!.closest('section')!;
    const fila = (n: string) => [...reponer.querySelectorAll('li')].find((li) => li.textContent?.includes(n))!;
    expect(fila('carbón').textContent).toContain('Lote en curado · listo el');
    expect(fila('carbón').textContent).not.toContain('Hacer otro lote');
    expect(fila('rosa').textContent).toContain('Hacer otro lote');

    const pedidos = contenedor.querySelector('#b-pedidos')!.closest('section')!;
    expect(pedidos.textContent).toContain('se activan sus servicios prepagados y los productos quedan listos para entregar');
    expect(pedidos.textContent).not.toContain('créditos');
  });
});
