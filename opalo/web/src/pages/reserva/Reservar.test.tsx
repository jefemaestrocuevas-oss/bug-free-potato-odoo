// /reservar con el modo demostración: preselección desde ?servicio= (sin avisos repetidos),
// "Elegiste: …" arriba del paso 1 y la reserva completa en los dos modos de
// configuracion.firma_en_linea (ESPEC §9).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import type { SolicitudReserva } from '../../lib/api/tipos';
import { SesionProvider } from '../../lib/sesion';
import { CLAVE_RESERVA, estadoInicial } from '../../components/reserva/estado';
import { firmaItems, type ItemElegido } from '../../components/reserva/utilidades';
import Reservar from './Reservar';

let contenedor: HTMLDivElement;
let raiz: Root;

// jsdom no implementa scrollIntoView (el asistente lleva el título del paso a la vista al avanzar).
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

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
  vi.restoreAllMocks();
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

// ---------------- Reserva completa (ESPEC §9) ----------------

/** "firm" al inicio de palabra: firma, firmar, firmes… (no "confirmar"). */
const SIN_FIRMA = /\bfirm/i;

/** Texto que se ve: sin el contenido de los documentos plegados (las políticas se leen aparte, a propósito). */
function textoVisible(): string {
  const copia = contenedor.cloneNode(true) as HTMLElement;
  copia.querySelectorAll('.rv-documento').forEach((d) => d.remove());
  return copia.textContent ?? '';
}

const titulo = () => contenedor.querySelector('#rv-titulo-paso')?.textContent ?? '';
const boton = (texto: string) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === texto);

/**
 * Deja a la clienta de ejemplo con sesión y el asistente guardado en el paso de la ficha (servicios,
 * horario en noviembre y datos ya listos), como si regresara de iniciar sesión.
 */
async function prepararHastaFicha() {
  const sesion = await api.iniciarSesion('clienta@demo.opalo.mx', 'demo1234');
  const cat = await api.getCatalogo();
  const axilas = cat.servicios.find((s) => s.slug === 'axilas')!;
  const items: ItemElegido[] = [{ tipo: 'servicio', id: axilas.id, credito_id: null }];
  let fecha = '';
  let slots: Awaited<ReturnType<typeof api.getHorariosDisponibles>> = [];
  for (let d = 3; d <= 28 && slots.length === 0; d++) {
    fecha = `2026-11-${String(d).padStart(2, '0')}`;
    slots = await api.getHorariosDisponibles(fecha, 60);
  }
  expect(slots.length).toBeGreaterThan(0);
  sessionStorage.setItem(
    CLAVE_RESERVA,
    JSON.stringify({ ...estadoInicial(), paso: 4, items, fecha, slot: slots[0], slotPara: firmaItems(items), usuario: sesion.user_id, datosListos: true }),
  );
  return { slot: slots[0], axilas };
}

/** Paso 4: contesta "No" a todo y da el consentimiento para datos de salud. */
async function llenarFicha() {
  await hasta(() => titulo() === 'Tu ficha de salud' && !!contenedor.querySelector('.rv-consentimiento input'));
  const igual = boton('Sí, sigue igual');
  if (igual) await act(async () => igual.click());
  for (const f of contenedor.querySelectorAll('fieldset.rv-pregunta')) {
    const no = f.querySelectorAll<HTMLInputElement>('input[type=radio]')[1];
    if (!no.checked) await act(async () => no.click());
  }
  const consentimiento = contenedor.querySelector<HTMLInputElement>('.rv-consentimiento input[type=checkbox]')!;
  if (!consentimiento.checked) await act(async () => consentimiento.click());
  await act(async () => boton('Continuar')!.click());
}

/** Paso 5: marca las políticas pendientes (y, con firma en línea, que leyó el consentimiento). */
async function aceptarPoliticas(textoContinuar: string) {
  await hasta(() => !!boton(textoContinuar));
  for (const c of contenedor.querySelectorAll<HTMLInputElement>('.rv-politica-check input[type=checkbox]')) if (!c.checked) await act(async () => c.click());
  await act(async () => boton(textoContinuar)!.click());
}

describe('Reserva completa según configuracion.firma_en_linea', () => {
  it('false (lo de Ópalo): sin paso de firma ni consentimiento; confirma y reserva sin firma', { timeout: 20000 }, async () => {
    expect((await api.getConfiguracion()).firma_en_linea).toBe(false);
    const { slot } = await prepararHastaFicha();
    const reservar = vi.spyOn(api, 'reservarCita');
    await montar('/reservar');
    await hasta(() => contenedor.querySelectorAll('.rv-progreso-nombre').length === 6);

    // El indicador de pasos termina en "Confirmar".
    const pasos = [...contenedor.querySelectorAll('.rv-progreso-nombre')].map((e) => e.textContent);
    expect(pasos).toEqual(['Servicios', 'Día y hora', 'Tus datos', 'Ficha de salud', 'Políticas', 'Confirmar']);

    await llenarFicha();
    await hasta(() => titulo() === 'Nuestras políticas' && !!boton('Continuar'));
    expect(textoVisible()).not.toMatch(SIN_FIRMA);
    expect(textoVisible()).not.toMatch(/consentimiento informado/i);
    expect(boton('Continuar a la firma')).toBeUndefined();
    await aceptarPoliticas('Continuar');

    await hasta(() => titulo() === 'Revisa y confirma' && !!boton('Confirmar mi cita'));
    expect(contenedor.querySelector('canvas')).toBeNull();
    const texto = textoVisible();
    for (const esperado of ['Axilas', slot.personal_nombre, 'Tiempo estimado', 'Total estimado']) expect(texto).toContain(esperado);
    expect(texto).not.toMatch(SIN_FIRMA);

    await act(async () => boton('Confirmar mi cita')!.click());
    await hasta(() => titulo() === '¡Listo! Tu cita está reservada', 6000);
    expect(titulo()).toBe('¡Listo! Tu cita está reservada');
    expect(textoVisible()).not.toMatch(SIN_FIRMA);

    expect(reservar).toHaveBeenCalledTimes(1);
    const solicitud = reservar.mock.calls[0][0] as SolicitudReserva;
    expect(solicitud.firma).toBeUndefined();
    expect(solicitud.inicio).toBe(slot.inicio);

    // La cita quedó creada (sin consentimientos: se firman en la cabina) y el borrador se borró.
    const cita = (await api.getMisCitas()).find((c) => c.inicio === slot.inicio)!;
    expect(cita.consentimientos_firmados).toBe(0);
    expect(sessionStorage.getItem(CLAVE_RESERVA) ?? '').not.toContain(slot.inicio);
  });

  it('true: el paso 5 muestra el consentimiento y el 6 pide la firma en pantalla', { timeout: 20000 }, async () => {
    const real = await api.getConfiguracion();
    vi.spyOn(api, 'getConfiguracion').mockResolvedValue({ ...real, firma_en_linea: true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); // jsdom no dibuja
    await prepararHastaFicha();
    await montar('/reservar');
    await hasta(() => contenedor.querySelectorAll('.rv-progreso-nombre').length === 6);

    const pasos = [...contenedor.querySelectorAll('.rv-progreso-nombre')].map((e) => e.textContent);
    expect(pasos.at(-1)).toBe('Firma');

    await llenarFicha();
    await hasta(() => titulo() === 'Políticas y consentimiento' && !!boton('Continuar a la firma'));
    expect(textoVisible()).toMatch(/consentimiento informado/i);
    // La casilla "Leí el consentimiento…" también es .rv-politica-check: aceptarPoliticas la marca.
    await aceptarPoliticas('Continuar a la firma');

    await hasta(() => titulo() === 'Revisa y firma');
    expect(contenedor.querySelector('canvas[aria-label="Recuadro de firma"]')).not.toBeNull();
    expect(contenedor.textContent).toContain('Tu firma');
  });
});
