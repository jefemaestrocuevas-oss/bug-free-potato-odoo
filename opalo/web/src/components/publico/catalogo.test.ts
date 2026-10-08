import { describe, expect, it } from 'vitest';
import type { Paquete, Servicio } from '../../lib/api/tipos';
import { claveItem } from '../../lib/carrito';
import {
  ahorroPaquete,
  duracionPaquete,
  etiquetaTipoPaquete,
  listaIncluye,
  paqueteReservable,
  servicioReservable,
  servicioVendible,
  sumaPorSeparado,
  textoDuracion,
  unirConY,
} from './catalogo';
import { textoVigencia } from './contacto';

function servicio(id: string, precio: number | null, extra: Partial<Servicio> = {}): Servicio {
  return {
    id,
    categoria_id: 'c1',
    slug: id,
    nombre: id[0].toUpperCase() + id.slice(1),
    descripcion: null,
    zonas_incluye: null,
    duracion_min: null,
    duracion_primera_vez_min: null,
    precio,
    etapa: 'disponible',
    es_complemento: false,
    reservable_en_linea: true,
    vendible_en_linea: true,
    tipo_consentimiento: 'consentimiento_depilacion',
    activo: true,
    orden: 1,
    ...extra,
  };
}

function paquete(items: [string, number][], precio: number | null, extra: Partial<Paquete> = {}): Paquete {
  return {
    id: 'p1',
    slug: 'p1',
    nombre: 'Paquete',
    descripcion: null,
    tipo: 'combo',
    precio,
    duracion_min: null,
    vigencia_dias: null,
    activo: true,
    orden: 1,
    items: items.map(([servicio_id, cantidad]) => ({ servicio_id, cantidad })),
    ...extra,
  };
}

const porId = new Map<string, Servicio>([
  ['cara', servicio('cara', 330)],
  ['axilas', servicio('axilas', 120)],
  ['bigote', servicio('bigote', null)],
  ['pronto', servicio('pronto', 200, { etapa: 'segunda_etapa' })],
]);

describe('catálogo del sitio público', () => {
  it('suma los precios sueltos y calcula el ahorro (Paquete Rostro: 450 vs 420)', () => {
    const p = paquete([['cara', 1], ['axilas', 1]], 420);
    expect(sumaPorSeparado(p, porId)).toBe(450);
    expect(ahorroPaquete(p, porId)).toEqual({ separado: 450, ahorro: 30 });
  });

  it('no inventa ahorro si algún precio está por confirmar', () => {
    const p = paquete([['axilas', 1], ['bigote', 1]], 300);
    expect(sumaPorSeparado(p, porId)).toBeNull();
    expect(ahorroPaquete(p, porId)).toBeNull();
  });

  it('no muestra ahorro si el paquete no es más barato', () => {
    expect(ahorroPaquete(paquete([['axilas', 2]], 240), porId)).toBeNull();
  });

  it('las duraciones nulas caben en la sesión de 1 hora (R2)', () => {
    expect(duracionPaquete(paquete([['cara', 1], ['axilas', 1]], 420), porId)).toBe(60);
    expect(duracionPaquete(paquete([['cara', 1]], 1, { duracion_min: 90 }), porId)).toBe(120);
    expect(textoDuracion(servicio('x', 1))).toBe('Sesión de 1 h');
    expect(textoDuracion(servicio('x', 1, { es_complemento: true, duracion_min: 0 }))).toBe('Se suma a tu sesión');
  });

  it('respeta R1 y R8: precio null se reserva pero no se vende; otra etapa no se reserva', () => {
    expect(servicioReservable(porId.get('bigote')!)).toBe(true);
    expect(servicioVendible(porId.get('bigote')!)).toBe(false);
    expect(servicioReservable(porId.get('pronto')!)).toBe(false);
    expect(servicioVendible(porId.get('pronto')!)).toBe(false);
    expect(paqueteReservable(paquete([['cara', 1], ['pronto', 1]], 500), porId)).toBe(false);
  });

  it('describe lo que incluye y el tipo de paquete', () => {
    const bono = paquete([['axilas', 5]], 500, { tipo: 'bono' });
    expect(listaIncluye(bono, porId)).toEqual(['5 × Axilas']);
    expect(etiquetaTipoPaquete(bono)).toBe('Bono · 5 sesiones');
    expect(unirConY(['Cejas', 'Axilas', 'Bigote'])).toBe('Cejas, Axilas y Bigote');
  });

  it('expresa la vigencia de los créditos', () => {
    expect(textoVigencia(365)).toBe('12 meses');
    expect(textoVigencia(180)).toBe('6 meses');
    expect(textoVigencia(30)).toBe('30 días');
  });

  it('separa en el carrito el mismo servicio para ti y para regalo', () => {
    const base = { tipo: 'servicio' as const, id: 's1' };
    expect(claveItem({ ...base, regalo_para: null })).not.toBe(claveItem({ ...base, regalo_para: 'Ana' }));
    expect(claveItem({ ...base, regalo_para: ' Ana ' })).toBe(claveItem({ ...base, regalo_para: 'ana' }));
  });
});
