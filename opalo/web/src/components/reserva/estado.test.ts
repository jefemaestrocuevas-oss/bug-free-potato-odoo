import { afterEach, describe, expect, it } from 'vitest';
import { borrarEstado, cargarEstado, CLAVE_RESERVA, estadoInicial, guardarEstado } from './estado';

afterEach(() => sessionStorage.clear());

describe('estado de la reserva en sessionStorage', () => {
  it('las notas (texto libre, pueden traer datos de salud) no se guardan', () => {
    guardarEstado({ ...estadoInicial(), usuario: 'u1', notas: 'tengo dermatitis' });
    expect(sessionStorage.getItem(CLAVE_RESERVA)).not.toContain('dermatitis');
    expect(cargarEstado().notas).toBe('');
    expect(cargarEstado().usuario).toBe('u1');
  });

  it('ignora notas que haya dejado una versión anterior', () => {
    sessionStorage.setItem(CLAVE_RESERVA, JSON.stringify({ ...estadoInicial(), notas: 'tengo dermatitis' }));
    expect(cargarEstado().notas).toBe('');
  });

  it('borrarEstado deja el asistente vacío (se llama al cerrar sesión)', () => {
    guardarEstado({ ...estadoInicial(), usuario: 'u1', items: [{ tipo: 'servicio', id: 's1', credito_id: null }] });
    borrarEstado();
    expect(sessionStorage.getItem(CLAVE_RESERVA)).toBeNull();
    expect(cargarEstado()).toEqual(estadoInicial());
  });
});
