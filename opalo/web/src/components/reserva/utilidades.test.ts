import { describe, expect, it } from 'vitest';
import { calcularTotal, notaPago, totalCita, volverSeguro } from './utilidades';

describe('volverSeguro', () => {
  it('acepta rutas internas', () => {
    expect(volverSeguro('/reservar')).toBe('/reservar');
    expect(volverSeguro('/reservar?servicio=axilas')).toBe('/reservar?servicio=axilas');
    expect(volverSeguro('/cuenta/firmar/abc#firma')).toBe('/cuenta/firmar/abc#firma');
  });

  it('rechaza otros sitios y rutas que el navegador convierte en otro sitio', () => {
    const malas = [
      null,
      undefined,
      '',
      'https://evil.com',
      'evil.com',
      '//evil.com',
      '/\\evil.com',
      '/\\\\evil.com',
      '\\/evil.com',
      '/\t/evil.com/',
      '/\n/evil.com',
      '/\nevil',
      '/\r/evil.com',
      '/\u0000/evil.com',
      '/\u007F/evil.com',
      '/a/..//evil.com',
      'javascript:alert(1)',
    ];
    for (const v of malas) expect(volverSeguro(v), JSON.stringify(v)).toBeNull();
  });

  it('rechaza ?volver=%2F%09%2Fevil.com%2F (tabulador codificado)', () => {
    const v = new URLSearchParams('volver=%2F%09%2Fevil.com%2F').get('volver');
    expect(volverSeguro(v)).toBeNull();
  });

  it('lo que acepta se queda en el mismo sitio', () => {
    for (const v of ['/', '/cuenta', '/reservar?credito=x', '/a/../cuenta']) {
      const r = volverSeguro(v);
      expect(r).not.toBeNull();
      expect(new URL(r!, 'https://opalo.mx').origin).toBe('https://opalo.mx');
    }
  });
});

describe('calcularTotal', () => {
  it('suma precios conocidos', () => {
    const t = calcularTotal([{ precio: 150 }, { precio: 200 }]);
    expect(t.texto).toBe(calcularTotal([{ precio: 350 }]).texto);
    expect(t.todoPrepagado).toBe(false);
    expect(notaPago(t)).toBe('Pagas en el spa el día de tu cita.');
  });

  it('todo prepagado: no dice $0 ni "Pagas en el spa"', () => {
    const t = calcularTotal([{ precio: 450, prepagado: true }]);
    expect(t.todoPrepagado).toBe(true);
    expect(t.texto).toBe('Prepagado');
    expect(notaPago(t)).not.toMatch(/Pagas en el spa/);
  });

  it('mixto: menciona lo prepagado', () => {
    const t = calcularTotal([{ precio: 450, prepagado: true }, { precio: 200 }]);
    expect(t.todoPrepagado).toBe(false);
    expect(t.prepagados).toBe(1);
    expect(t.texto).toMatch(/más tu servicio prepagado/);
  });

  it('por confirmar', () => {
    expect(calcularTotal([{ precio: null }]).texto).toBe('Por confirmar en cabina');
    expect(calcularTotal([{ precio: null }, { precio: 450, prepagado: true }]).texto).toBe('Por confirmar en cabina');
    expect(calcularTotal([{ precio: null }, { precio: 100 }]).texto).toMatch(/\+ lo que se confirme en cabina$/);
  });

  it('cita ya creada: precio 0 es prepagado (R4)', () => {
    const item = { nombre: 'Paquete Express', precio: 0, duracion_min: 60, servicio_id: null, paquete_id: 'p' };
    const t = totalCita([item]);
    expect(t.todoPrepagado).toBe(true);
    expect(t.texto).toBe('Prepagado');
  });
});
