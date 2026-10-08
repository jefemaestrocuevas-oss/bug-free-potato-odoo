// Equipo (/admin/equipo): horario semanal con validación, capacitaciones (alta/borrado) y piezas.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonalInterno } from '../../lib/api';
import { enlaceSeguro, erroresDelDia, horarioPorDia, iniciales, minutosDelDia, minutosSemana, urlValida } from '../../components/admin/EquipoPiezas';
import EquipoAdmin from './EquipoAdmin';

const admin = vi.hoisted(() => ({
  getPersonal: vi.fn(),
  guardarPersonal: vi.fn(),
  guardarHorarios: vi.fn(),
  guardarCapacitacion: vi.fn(),
  eliminarCapacitacion: vi.fn(),
}));
vi.mock('../../lib/api', () => ({ api: { modo: 'demo', admin } }));

const ANA: PersonalInterno = {
  id: 'p-ana',
  usuario_id: null,
  slug: 'ana',
  nombre: 'Ana López',
  titulo: 'Cosmetóloga',
  bio: null,
  foto_url: 'javascript:alert(1)',
  color_agenda: '#5C6B3F',
  activo: true,
  mostrar_en_sitio: true,
  orden: 1,
  horarios: [
    { id: 'h1', dia_semana: 2, hora_inicio: '10:00:00', hora_fin: '19:00:00' },
    { id: 'h2', dia_semana: 6, hora_inicio: '09:00', hora_fin: '15:00' },
  ],
  capacitaciones: [
    {
      id: 'c1',
      personal_id: 'p-ana',
      nombre: 'Curso de cera',
      institucion: 'Academia',
      tipo: 'curso',
      fecha: '2026-02-09',
      horas: 20,
      mostrar_en_sitio: true,
      constancia_url: 'javascript:alert(1)',
      notas: null,
    },
  ],
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
      <MemoryRouter initialEntries={['/admin/equipo']}>
        <EquipoAdmin />
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

async function enviar(dialogo: Element) {
  await act(async () => {
    dialogo.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await esperar();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  admin.getPersonal.mockResolvedValue([ANA]);
  for (const f of [admin.guardarPersonal, admin.guardarHorarios, admin.guardarCapacitacion, admin.eliminarCapacitacion]) f.mockResolvedValue(undefined);
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

describe('Equipo', () => {
  it('resume el horario y no convierte en enlace ni imagen una dirección insegura', async () => {
    await montar();
    expect(contenedor.querySelector('.eqa-semana')?.textContent).toContain('Mar10:00–19:00');
    expect(contenedor.querySelector('.eqa-semana')?.textContent).toContain('DomCerrado');
    expect(contenedor.textContent).toContain('15 h a la semana');
    expect(contenedor.textContent).toContain('Nos capacitamos constantemente');
    expect([...contenedor.querySelectorAll('a')].some((a) => a.getAttribute('href')?.startsWith('javascript'))).toBe(false);
    expect(contenedor.querySelector('img')).toBeNull();
    expect(contenedor.querySelector('.eqa-foto-iniciales')?.textContent).toBe('AL');
  });

  it('no deja guardar rangos encimados y guarda el horario corregido', async () => {
    await montar();
    await act(async () => boton('Editar horario', contenedor).click());
    const dialogo = document.querySelector('[role=dialog]')!;
    const martes = dialogo.querySelectorAll('.eqa-dia')[2];
    await act(async () => boton('Otro rango', martes).click());
    const horas = martes.querySelectorAll<HTMLInputElement>('input[type=time]');
    await act(async () => escribir(horas[2], '18:00'));
    await act(async () => escribir(horas[3], '20:00'));
    expect(martes.querySelector('.eqa-error-campo')?.textContent).toContain('Se encima con');
    await enviar(dialogo);
    expect(admin.guardarHorarios).not.toHaveBeenCalled();
    expect(dialogo.querySelector('[role=alert]')?.textContent).toContain('Revisa los rangos');

    // Comida de 14 a 15: dos rangos que no se enciman.
    await act(async () => escribir(horas[1], '14:00'));
    await act(async () => escribir(horas[2], '15:00'));
    await act(async () => escribir(horas[3], '19:00'));
    await enviar(dialogo);
    expect(admin.guardarHorarios).toHaveBeenCalledWith('p-ana', [
      { dia_semana: 2, hora_inicio: '10:00', hora_fin: '14:00' },
      { dia_semana: 2, hora_inicio: '15:00', hora_fin: '19:00' },
      { dia_semana: 6, hora_inicio: '09:00', hora_fin: '15:00' },
    ]);
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(contenedor.textContent).toContain('guardamos el horario de Ana López');
  });

  it('agrega una capacitación visible y pide confirmación para borrar', async () => {
    await montar();
    await act(async () => boton('Agregar', contenedor.querySelector('.eqa-persona-cuerpo')!).click());
    const dialogo = document.querySelector('[role=dialog]')!;
    expect(dialogo.textContent).toContain('nos capacitamos constantemente');
    await act(async () => escribir(dialogo.querySelector<HTMLInputElement>('#cap-nombre')!, 'Taller de faciales'));
    await act(async () => escribir(dialogo.querySelector<HTMLInputElement>('#cap-horas')!, '7,5'));
    await act(async () => escribir(dialogo.querySelector<HTMLInputElement>('#cap-constancia')!, 'constancia.pdf'));
    await enviar(dialogo);
    expect(admin.guardarCapacitacion).not.toHaveBeenCalled();
    await act(async () => escribir(dialogo.querySelector<HTMLInputElement>('#cap-constancia')!, 'https://ejemplo.mx/c.pdf'));
    await enviar(dialogo);
    expect(admin.guardarCapacitacion).toHaveBeenCalledWith({
      id: undefined,
      personal_id: 'p-ana',
      nombre: 'Taller de faciales',
      institucion: null,
      tipo: 'curso',
      fecha: null,
      horas: 7.5,
      constancia_url: 'https://ejemplo.mx/c.pdf',
      mostrar_en_sitio: true,
      notas: null,
    });

    await act(async () => boton('Borrar', contenedor.querySelector('.eqa-cap')!).click());
    const confirmar = document.querySelector('[role=dialog]')!;
    expect(confirmar.textContent).toContain('Dejará de aparecer en el sitio');
    expect(admin.eliminarCapacitacion).not.toHaveBeenCalled();
    await act(async () => boton('Sí, borrar', confirmar).click());
    await esperar();
    expect(admin.eliminarCapacitacion).toHaveBeenCalledWith('c1');
  });
});

describe('Piezas del equipo', () => {
  it('detecta rangos incompletos, al revés y encimados (pegados sí se valen)', () => {
    expect(erroresDelDia([{ k: 1, inicio: '10:00', fin: '14:00' }, { k: 2, inicio: '14:00', fin: '19:00' }]).size).toBe(0);
    expect(erroresDelDia([{ k: 1, inicio: '10:00', fin: '09:00' }]).get(1)).toContain('después');
    expect(erroresDelDia([{ k: 1, inicio: '', fin: '09:00' }]).get(1)).toContain('Escribe');
    const e = erroresDelDia([{ k: 1, inicio: '10:00', fin: '15:00' }, { k: 2, inicio: '14:00', fin: '19:00' }]);
    expect([...e.keys()].sort()).toEqual([1, 2]);
  });

  it('agrupa por día y suma las horas de la semana', () => {
    const dias = horarioPorDia(ANA.horarios);
    expect(dias[0]).toEqual([]);
    expect(dias[2]).toHaveLength(1);
    expect(minutosSemana(ANA.horarios)).toBe(15 * 60);
  });

  it('el total del día no cuenta dos veces los rangos encimados', () => {
    // 10–14 y 12–19 cubren de 10 a 19: 9 h, no 11 h.
    expect(minutosDelDia([{ k: 1, inicio: '10:00', fin: '14:00' }, { k: 2, inicio: '12:00', fin: '19:00' }])).toBe(9 * 60);
    // Pegados y separados por la comida.
    expect(minutosDelDia([{ k: 1, inicio: '10:00', fin: '14:00' }, { k: 2, inicio: '15:00', fin: '19:00' }])).toBe(8 * 60);
    // Uno dentro de otro, uno incompleto y uno al revés no suman.
    expect(
      minutosDelDia([
        { k: 1, inicio: '09:00', fin: '18:00' },
        { k: 2, inicio: '10:00', fin: '11:00' },
        { k: 3, inicio: '', fin: '20:00' },
        { k: 4, inicio: '21:00', fin: '20:00' },
      ]),
    ).toBe(9 * 60);
  });

  it('sólo acepta direcciones seguras', () => {
    expect(enlaceSeguro('https://ejemplo.mx/a.pdf')).toBe('https://ejemplo.mx/a.pdf');
    expect(enlaceSeguro('javascript:alert(1)')).toBeNull();
    expect(enlaceSeguro('/fotos/ana.jpg')).toBeNull();
    expect(urlValida('/fotos/ana.jpg')).toBe(true);
    expect(urlValida('data:image/png;base64,xx')).toBe(false);
    expect(iniciales('María de la Luz Pérez')).toBe('MP');
  });
});
