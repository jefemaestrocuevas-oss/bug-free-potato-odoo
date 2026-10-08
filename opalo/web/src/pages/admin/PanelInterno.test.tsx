// Marco del panel interno (LayoutAdmin): reinicio de la demo con ventana propia (sin window.confirm)
// y modo cabina por encima de todo, sólo para la cuenta que entregó la tablet.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entrarCabina, salirCabina } from '../../components/admin/cabina';
import { LayoutAdmin } from '../../layouts/LayoutAdmin';

const m = vi.hoisted(() => ({ reiniciarDemo: vi.fn(), cerrarSesion: vi.fn() }));
vi.mock('../../lib/api', async () => ({ ...(await vi.importActual<object>('../../lib/api/tipos')), api: { modo: 'demo', cerrarSesion: m.cerrarSesion } }));
vi.mock('../../lib/api/demo', () => ({ reiniciarDemo: m.reiniciarDemo }));
vi.mock('../../lib/sesion', () => ({
  useSesion: () => ({
    sesion: { user_id: 'u-admin', email: 'admin@ejemplo.mx', rol: 'admin', cliente: { id: 'cl-admin', nombre: 'Socia', apellidos: null } },
    cargando: false,
    refrescar: async () => undefined,
    esPersonal: true,
    esAdmin: true,
  }),
}));

let contenedor: HTMLDivElement;
let raiz: Root;

async function montar() {
  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<LayoutAdmin />}>
            <Route index element={<p>Resumen de prueba</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  });
}

function boton(texto: string): HTMLButtonElement {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim().startsWith(texto));
  if (!b) throw new Error(`No encontré el botón «${texto}»`);
  return b;
}

const CABINA = {
  email: 'admin@ejemplo.mx',
  cita_id: 'cita-9',
  cuando: 'viernes, 9 de octubre · 17:00',
  servicios: 'Axilas',
  nombre: 'Fernanda Ríos',
  menor: false,
  anios: 28,
  consentimientos: [],
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  act(() => salirCabina());
  window.sessionStorage.clear();
  contenedor.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('LayoutAdmin', () => {
  it('«Reiniciar datos» pide confirmación con una ventana del panel, no con window.confirm', async () => {
    const confirmar = vi.spyOn(window, 'confirm');
    await montar();
    await act(async () => boton('Reiniciar datos').click());
    const dialogo = document.querySelector('[role=dialog]')!;
    expect(dialogo.textContent).toContain('Reiniciar la demostración');
    expect(confirmar).not.toHaveBeenCalled();
    expect(m.reiniciarDemo).not.toHaveBeenCalled();

    await act(async () => boton('Sí, reiniciar').click());
    expect(m.reiniciarDemo).toHaveBeenCalledTimes(1);
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('el modo cabina tapa el panel de quien entregó la tablet', async () => {
    await montar();
    await act(async () => entrarCabina({ ...CABINA, user_id: 'u-admin' }));
    expect(document.querySelector('.adm-cabina')?.textContent).toContain('Hola, Fernanda');
    expect(contenedor.hasAttribute('inert')).toBe(true);
  });

  it('un modo cabina que dejó otra cuenta en la pestaña no aplica', async () => {
    await act(async () => entrarCabina({ ...CABINA, user_id: 'otra-cuenta' }));
    await montar();
    expect(document.querySelector('.adm-cabina')).toBeNull();
    expect(contenedor.hasAttribute('inert')).toBe(false);
    expect(window.sessionStorage.getItem('opalo-modo-cabina')).toBeNull();
  });
});
