import { describe, expect, it } from 'vitest';
import {
  agregarA,
  ajustarAExistencias,
  CANTIDAD_MAXIMA,
  cambiarCantidadEn,
  claveItem,
  leerItemsGuardados,
  puedenAgregarseA,
  textoAviso,
  topeLinea,
  type ItemCarrito,
  type NuevoItemCarrito,
} from './carrito';

const jabon = (extra: Partial<NuevoItemCarrito> = {}): NuevoItemCarrito => ({
  tipo: 'producto',
  id: 'jabon-avena',
  nombre: 'Jabón de avena',
  precio: 120,
  maximo: 3,
  miniatura: { categoria: 'jabon', color_hex: '#d9ccae', foto_url: null },
  slug: 'jabon-avena',
  ...extra,
});

function con(items: ItemCarrito[], ...nuevos: NuevoItemCarrito[]): ItemCarrito[] {
  return nuevos.reduce((acc, n) => agregarA(acc, n).items, items);
}

describe('carrito: límite por existencias', () => {
  it('no deja agregar más piezas de las disponibles', () => {
    let r = agregarA([], jabon({ cantidad: 2 }));
    expect(r).toMatchObject({ agregadas: 2, limite: null });
    r = agregarA(r.items, jabon({ cantidad: 5 }));
    expect(r.agregadas).toBe(1);
    expect(r.limite).toBe('existencias');
    expect(r.items[0].cantidad).toBe(3);
    r = agregarA(r.items, jabon());
    expect(r).toMatchObject({ agregadas: 0, limite: 'existencias' });
    expect(r.items[0].cantidad).toBe(3);
  });

  it('la línea para regalo comparte existencias con la propia', () => {
    const items = con([], jabon({ cantidad: 2 }), jabon({ regalo_para: 'Ana', cantidad: 2 }));
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.cantidad)).toEqual([2, 1]);
    expect(puedenAgregarseA(items, { tipo: 'producto', id: 'jabon-avena', regalo_para: null, maximo: 3 })).toBe(0);
    expect(topeLinea(items, items[0])).toBe(2);
    expect(topeLinea(items, items[1])).toBe(1);
  });

  it('cambiar la cantidad respeta el tope de la línea', () => {
    const items = con([], jabon({ cantidad: 1 }));
    const clave = claveItem(items[0]);
    expect(cambiarCantidadEn(items, clave, 10)[0].cantidad).toBe(3);
    expect(cambiarCantidadEn(items, clave, 0)[0].cantidad).toBe(1);
  });

  it('servicios y paquetes sólo tienen el máximo por artículo', () => {
    const servicio: NuevoItemCarrito = { tipo: 'servicio', id: 's1', nombre: 'Facial', precio: 600, cantidad: 15 };
    const r = agregarA(agregarA([], servicio).items, servicio);
    expect(r.items[0].cantidad).toBe(CANTIDAD_MAXIMA);
    expect(r.limite).toBe('maximo');
  });

  it('las existencias más recientes reemplazan a las anteriores', () => {
    let items = con([], jabon({ cantidad: 3 }));
    items = agregarA(items, jabon({ maximo: 6, cantidad: 2 })).items;
    expect(items[0]).toMatchObject({ cantidad: 5, maximo: 6 });
  });

  it('ajusta el carrito si el servidor reporta menos piezas', () => {
    const items = con([], jabon({ maximo: 5, cantidad: 3 }), jabon({ maximo: 5, regalo_para: 'Ana', cantidad: 2 }));
    const a = ajustarAExistencias(items, 'jabon-avena', 3);
    expect(a.reducido).toBe(true);
    expect(a.items.map((i) => [i.regalo_para, i.cantidad])).toEqual([[null, 3]]);
    // Sin cambios: misma referencia (no provoca renders de más).
    expect(ajustarAExistencias(a.items, 'jabon-avena', 3).items).toBe(a.items);
    // Agotado: se conservan las líneas para que la clienta decida quitarlas.
    const agotado = ajustarAExistencias(items, 'jabon-avena', 0);
    expect(agotado.reducido).toBe(false);
    expect(agotado.items.every((i) => i.maximo === 0)).toBe(true);
  });

  it('lee lo guardado aunque venga de una versión sin existencias, y descarta datos raros', () => {
    const viejo = JSON.stringify([
      { tipo: 'producto', id: 'p1', nombre: 'Crema', precio: 200, cantidad: 2, regalo_para: null },
      { tipo: 'producto', id: 'p2', nombre: 'Vela', precio: 300, cantidad: 1, regalo_para: null, maximo: 4.6, miniatura: { categoria: 'vela', color_hex: 'rojo', foto_url: 'javascript:alert(1)' } },
      { tipo: 'otro', id: 'x' },
    ]);
    const items = leerItemsGuardados(viejo);
    expect(items).toHaveLength(2);
    expect(items[0].maximo).toBeNull();
    expect(items[1].maximo).toBe(4);
    expect(items[1].miniatura).toEqual({ categoria: 'vela', color_hex: null, foto_url: null });
  });

  it('explica en el aviso cuando las existencias no alcanzaron', () => {
    const base = { n: 1, nombre: 'Jabón de avena', regalo_para: null };
    expect(textoAviso({ ...base, agregadas: 0, limite: 'existencias' }).resto).toMatch(/todas las piezas que tenemos/);
    expect(textoAviso({ ...base, agregadas: 1, limite: 'existencias' }).resto).toBe(': 1 pieza, las que tenemos por ahora.');
    expect(textoAviso({ ...base, agregadas: 2, limite: null }).resto).toBe(' al carrito.');
  });
});
