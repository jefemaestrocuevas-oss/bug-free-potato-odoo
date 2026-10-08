import { afterEach, describe, expect, it } from 'vitest';
import { borrarEstado, cargarEstado, CLAVE_RESERVA, estadoInicial, guardarEstado, nombresPasos, titulosPasos, TOTAL_PASOS } from './estado';

afterEach(() => sessionStorage.clear());

describe('pasos según configuracion.firma_en_linea (ESPEC §9)', () => {
  it('sin firma en línea el último paso es "Revisa y confirma" y ningún nombre habla de firmar', () => {
    const nombres = Object.values(nombresPasos(false));
    const titulos = Object.values(titulosPasos(false));
    expect(nombres).toHaveLength(TOTAL_PASOS);
    expect(nombresPasos(false)[6]).toBe('Confirmar');
    expect(titulosPasos(false)[5]).toBe('Nuestras políticas');
    expect(titulosPasos(false)[6]).toBe('Revisa y confirma');
    for (const t of [...nombres, ...titulos]) expect(t).not.toMatch(/\bfirm|consentimiento/i);
  });

  it('con firma en línea vuelve el paso de firma', () => {
    expect(nombresPasos(true)[6]).toBe('Firma');
    expect(titulosPasos(true)[5]).toBe('Políticas y consentimiento');
    expect(titulosPasos(true)[6]).toBe('Revisa y firma');
  });
});

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

  it('un borrador del flujo con firma (paso 6, consentimiento leído, campos de más) se abre sin romperse', () => {
    const slot = { inicio: '2026-11-03T16:00:00.000Z', fin: '2026-11-03T17:00:00.000Z', personal_id: 'p1', personal_nombre: 'Ana (ejemplo)' };
    sessionStorage.setItem(
      CLAVE_RESERVA,
      JSON.stringify({
        ...estadoInicial(),
        paso: 6,
        items: [{ tipo: 'servicio', id: 's1', credito_id: null }],
        fecha: '2026-11-03',
        slot,
        slotPara: 'servicio:s1:',
        usuario: 'u1',
        datosListos: true,
        fichaPara: 'u1|depilacion',
        politicasMarcadas: ['pol-1'],
        consentimientoLeido: true,
        politicasPara: 'u1|consentimiento_depilacion',
        firma: { nombre_firmante: 'Mariana', firma_svg: '<svg></svg>' },
        pasoFirma: true,
      }),
    );
    const e = cargarEstado();
    expect(e.paso).toBe(6);
    expect(e.slot).toEqual(slot);
    expect(e.consentimientoLeido).toBe(true);
    expect(e.politicasMarcadas).toEqual(['pol-1']);
    // Sólo los campos conocidos: lo de la firma no se arrastra.
    expect(Object.keys(e).sort()).toEqual(Object.keys(estadoInicial()).sort());
    expect(JSON.stringify(e)).not.toContain('svg');
  });

  it('campos con tipos equivocados se descartan en lugar de romper el asistente', () => {
    sessionStorage.setItem(
      CLAVE_RESERVA,
      JSON.stringify({ v: 1, paso: 7, items: [{ tipo: 'servicio', id: 's1', credito_id: null }, null, { tipo: 'otro', id: 2 }], slot: { inicio: 1 }, usuario: 5, datosListos: 'sí', politicasMarcadas: 'x' }),
    );
    const e = cargarEstado();
    expect(e.paso).toBe(1);
    expect(e.items).toEqual([{ tipo: 'servicio', id: 's1', credito_id: null }]);
    expect(e.slot).toBeNull();
    expect(e.usuario).toBeNull();
    expect(e.datosListos).toBe(false);
    expect(e.politicasMarcadas).toEqual([]);
  });

  it('borrarEstado deja el asistente vacío (se llama al cerrar sesión)', () => {
    guardarEstado({ ...estadoInicial(), usuario: 'u1', items: [{ tipo: 'servicio', id: 's1', credito_id: null }] });
    borrarEstado();
    expect(sessionStorage.getItem(CLAVE_RESERVA)).toBeNull();
    expect(cargarEstado()).toEqual(estadoInicial());
  });
});
