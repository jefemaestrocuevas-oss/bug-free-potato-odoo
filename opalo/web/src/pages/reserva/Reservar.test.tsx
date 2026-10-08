// /reservar con el modo demostración: preselección desde ?servicio= (sin avisos repetidos) y
// "Elegiste: …" arriba del paso 1.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SesionProvider } from '../../lib/sesion';
import Reservar from './Reservar';

let contenedor: HTMLDivElement;
let raiz: Root;

async function esperar(veces = 8) {
  for (let i = 0; i < veces; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
}

/** El modo demostración simula ~100 ms de red: espera hasta que se cumpla la condición. */
async function hasta(condicion: () => boolean, ms = 4000) {
  const fin = Date.now() + ms;
  while (!condicion() && Date.now() < fin)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
}

async function montar(url: string) {
  await act(async () => {
    raiz.render(
      <SesionProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/reservar" element={<Reservar />} />
          </Routes>
        </MemoryRouter>
      </SesionProvider>,
    );
  });
  await esperar();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  sessionStorage.clear();
});

describe('Reservar (modo demostración)', () => {
  it('?servicio=axilas: se ve lo elegido arriba del paso 1', async () => {
    await montar('/reservar?servicio=axilas');
    await hasta(() => !!contenedor.querySelector('.rv-elegidos'));
    expect(contenedor.querySelector('.rv-elegidos')?.textContent).toBe('Elegiste: Axilas');
  });

  it('?servicio=shot-hidratante: un solo aviso de que falta el servicio principal', async () => {
    await montar('/reservar?servicio=shot-hidratante');
    await hasta(() => !!contenedor.querySelector('.rv-elegidos'));
    await esperar();
    const avisos = [...contenedor.querySelectorAll('.aviso')].map((a) => a.textContent ?? '');
    expect(avisos.filter((t) => /se agrega(n)? a un servicio/.test(t))).toHaveLength(1);
  });
});
