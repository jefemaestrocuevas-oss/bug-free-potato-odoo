// Políticas (/admin/politicas): versión vigente e historial por tipo y publicación con advertencia y confirmación (R13).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Politica, TipoPolitica } from '../../lib/api';
import PoliticasAdmin from './PoliticasAdmin';

const mocks = vi.hoisted(() => ({
  admin: { getPoliticasTodas: vi.fn(), publicarPolitica: vi.fn() },
  getCatalogo: vi.fn(),
}));
vi.mock('../../lib/api', () => ({
  api: { modo: 'demo', admin: mocks.admin, getCatalogo: mocks.getCatalogo },
  POLITICAS_GENERALES: ['terminos', 'privacidad', 'cancelacion'],
}));

function politica(tipo: TipoPolitica, version: number, activa: boolean, desde: string, texto = `# ${tipo} v${version}\n\nTexto de la versión ${version}.`): Politica & { activa: boolean } {
  return { id: `${tipo}-${version}`, tipo, version, titulo: `Título ${tipo} v${version}`, contenido_md: texto, hash_sha256: `${version}abcdef0123456789`, vigente_desde: desde, activa };
}

const TODAS = [
  politica('terminos', 1, false, '2026-07-09T12:00:00Z'),
  politica('terminos', 2, true, '2026-09-01T12:00:00Z'),
  politica('privacidad', 1, true, '2026-07-09T12:00:00Z'),
  politica('consentimiento_depilacion', 1, true, '2026-07-09T12:00:00Z'),
];

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
      <MemoryRouter initialEntries={['/admin/politicas']}>
        <PoliticasAdmin />
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

function escribir(el: HTMLTextAreaElement | HTMLInputElement, valor: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const tarjeta = (titulo: string) => [...contenedor.querySelectorAll('.pola-tarjeta')].find((t) => t.textContent?.includes(titulo))!;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.admin.getPoliticasTodas.mockResolvedValue(TODAS);
  mocks.admin.publicarPolitica.mockResolvedValue(undefined);
  mocks.getCatalogo.mockResolvedValue({ categorias: [], paquetes: [], servicios: [] });
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

describe('Políticas', () => {
  it('muestra la versión vigente, el historial y avisa lo que falta publicar', async () => {
    await montar();
    const t = tarjeta('Términos y condiciones');
    expect(t.textContent).toContain('Título terminos v2');
    expect(t.textContent).toContain('Versión 2 vigente');
    expect(t.textContent).toContain('2abcdef012…');
    expect(t.querySelector('.pola-historial')?.textContent).toContain('Versión 1 · Título terminos v1');
    expect(t.querySelector('.pola-historial')?.textContent).toContain('al 1 sep 2026');
    // Cancelación no tiene versión: aviso y botón para la primera.
    expect(contenedor.querySelector('.aviso-error')?.textContent).toContain('Política de cancelación');
    expect(boton('Publicar primera versión', tarjeta('Política de cancelación'))).toBeTruthy();
  });

  it('abre el texto de una versión en una ventana', async () => {
    await montar();
    await act(async () => boton('Ver texto', tarjeta('Aviso de privacidad')).click());
    const dialogo = document.querySelector('[role=dialog]')!;
    expect(dialogo.querySelector('.markdown h2')?.textContent).toBe('privacidad v1');
    expect(dialogo.textContent).toContain('1abcdef0123456789');
  });

  it('precarga la versión vigente, advierte y publica sólo tras confirmar', async () => {
    await montar();
    await act(async () => boton('Publicar nueva versión', tarjeta('Términos y condiciones')).click());
    const editor = document.querySelector('[role=dialog]')!;
    const texto = editor.querySelector<HTMLTextAreaElement>('#pola-texto')!;
    expect(texto.value).toBe(TODAS[1].contenido_md);
    expect(editor.querySelector<HTMLInputElement>('#pola-titulo')!.value).toBe('Título terminos v2');
    expect(editor.textContent).toContain('las clientas tendrán que aceptarla de nuevo en su próxima reserva');
    expect(boton('Publicar versión 3', editor).disabled).toBe(true);

    await act(async () => escribir(texto, '# Términos\n\nNuevo **texto**.'));
    expect(editor.querySelector('.pola-vista .markdown strong')?.textContent).toBe('texto');
    await act(async () => boton('Publicar versión 3', editor).click());
    const dialogos = document.querySelectorAll('[role=dialog]');
    const confirmar = dialogos[dialogos.length - 1];
    expect(confirmar.textContent).toContain('Las clientas tendrán que aceptarla de nuevo en su próxima reserva.');
    expect(mocks.admin.publicarPolitica).not.toHaveBeenCalled();

    await act(async () => boton('Sí, publicar', confirmar).click());
    await esperar();
    expect(mocks.admin.publicarPolitica).toHaveBeenCalledWith('terminos', 'Título terminos v2', '# Términos\n\nNuevo **texto**.');
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(contenedor.textContent).toContain('publicamos la versión 3 de Términos y condiciones');
    expect(mocks.admin.getPoliticasTodas).toHaveBeenCalledTimes(2);
  });

  it('pregunta antes de descartar cambios sin publicar', async () => {
    await montar();
    await act(async () => boton('Publicar nueva versión', tarjeta('Aviso de privacidad')).click());
    const editor = document.querySelector('[role=dialog]')!;
    await act(async () => escribir(editor.querySelector<HTMLTextAreaElement>('#pola-texto')!, 'otro texto'));
    await act(async () => boton('Cancelar', editor).click());
    const dialogos = document.querySelectorAll('[role=dialog]');
    expect(dialogos).toHaveLength(2);
    expect(dialogos[1].textContent).toContain('Tienes cambios sin publicar');
    await act(async () => boton('Sí, descartar', dialogos[1]).click());
    await esperar();
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(mocks.admin.publicarPolitica).not.toHaveBeenCalled();
  });
});
