import { describe, expect, it } from 'vitest';
import type { Politica, ProductoTienda } from '../../lib/api/tipos';
import { esConsentimiento, politicasPublicas, seRevisaEnSpa } from './politicas';
import {
  buscarProducto,
  cuandoAbrimos,
  destacadosHechosEnOpalo,
  direccionCorta,
  estadoExistencias,
  gruposConProductos,
  mensajeAvisame,
  piezasDisponibles,
  productosDelGrupo,
  relacionados,
  rutaProducto,
} from './tienda';

function producto(id: string, extra: Partial<ProductoTienda> = {}): ProductoTienda {
  return {
    id,
    slug: id,
    nombre: `Producto ${id}`,
    categoria: 'jabon',
    marca: null,
    presentacion: null,
    descripcion: null,
    aroma: null,
    ingredientes: null,
    modo_uso: null,
    advertencias: null,
    contenido_neto: '100 g',
    foto_url: null,
    color_hex: '#d9ccae',
    destacado: false,
    hecho_en_opalo: true,
    precio_venta: 120,
    stock_disponible: 10,
    hay_stock: true,
    proximo_lote_listo: null,
    ...extra,
  };
}

const HOY = '2026-10-08';

describe('estado de existencias en la tienda', () => {
  it('con más de 3 piezas está disponible', () => {
    expect(estadoExistencias(producto('a', { stock_disponible: 4 }), HOY)).toMatchObject({ tipo: 'disponible', piezas: 4, texto: 'Disponible' });
  });

  it('de 1 a 3 piezas avisa "Últimas N piezas"', () => {
    expect(estadoExistencias(producto('a', { stock_disponible: 3 }), HOY)).toMatchObject({ tipo: 'ultimas', texto: 'Últimas 3 piezas' });
    expect(estadoExistencias(producto('a', { stock_disponible: 2 }), HOY).texto).toBe('Últimas 2 piezas');
    expect(estadoExistencias(producto('a', { stock_disponible: 1 }), HOY).texto).toBe('Última pieza');
  });

  it('sin piezas y sin lote en curado: agotado', () => {
    expect(estadoExistencias(producto('a', { stock_disponible: 0, hay_stock: false }), HOY)).toMatchObject({ tipo: 'agotado', piezas: 0, texto: 'Agotado' });
  });

  it('sin piezas con un lote curándose: "Disponible desde el {fecha}"', () => {
    const e = estadoExistencias(producto('a', { stock_disponible: 0, hay_stock: false, proximo_lote_listo: '2026-11-12' }), HOY);
    expect(e).toMatchObject({ tipo: 'proximo', fecha: '2026-11-12' });
    expect(e.texto).toBe('Disponible desde el 12 de noviembre');
    // Otro año: con año.
    expect(estadoExistencias(producto('a', { stock_disponible: 0, hay_stock: false, proximo_lote_listo: '2027-01-05' }), HOY).texto).toBe(
      'Disponible desde el 5 de enero de 2027',
    );
  });

  it('no anuncia una fecha que ya pasó (lote curado sin liberar)', () => {
    const e = estadoExistencias(producto('a', { stock_disponible: 0, hay_stock: false, proximo_lote_listo: '2026-10-01' }), HOY);
    expect(e.tipo).toBe('proximo');
    expect(e.texto).toBe('Disponible muy pronto');
  });

  it('cuenta piezas completas y no confía en stock si hay_stock es false', () => {
    expect(piezasDisponibles(producto('a', { stock_disponible: 2.7 }))).toBe(2);
    expect(piezasDisponibles(producto('a', { stock_disponible: 5, hay_stock: false }))).toBe(0);
    expect(piezasDisponibles(producto('a', { stock_disponible: -3, hay_stock: true }))).toBe(0);
  });
});

describe('pastilla corta, apertura y «Avísame por WhatsApp»', () => {
  it('la tarjeta lleva el texto corto del lote en curado; la ficha, el completo', () => {
    const e = estadoExistencias(producto('a', { stock_disponible: 0, hay_stock: false, proximo_lote_listo: '2026-10-18' }), HOY);
    expect(e.texto).toBe('Disponible desde el 18 de octubre');
    expect(e.corto).toBe('Desde el 18 oct');
    expect(estadoExistencias(producto('a', { stock_disponible: 0, hay_stock: false, proximo_lote_listo: '2026-10-01' }), HOY).corto).toBe('Muy pronto');
    expect(estadoExistencias(producto('a', { stock_disponible: 2 }), HOY).corto).toBe('Últimas 2 piezas');
  });

  it('mientras no abrimos dice desde cuándo se paga y se recoge', () => {
    expect(cuandoAbrimos('2026-10-31', HOY)).toBe('a partir del sábado 31 de octubre, cuando abrimos');
    expect(cuandoAbrimos('2026-10-31', '2026-10-31')).toBeNull();
    expect(cuandoAbrimos(null, HOY)).toBeNull();
  });

  it('el mensaje no supone que el producto ya estuvo a la venta y, con lote en curado, dice cuándo sale', () => {
    expect(mensajeAvisame('Sérum hidratante para casa (ejemplo)', null, HOY)).toBe(
      'Hola, Ópalo. Me interesa Sérum hidratante para casa (ejemplo). ¿Me avisan cuando esté disponible?',
    );
    const proximo = estadoExistencias(producto('a', { nombre: 'Jabón de carbón', stock_disponible: 0, hay_stock: false, proximo_lote_listo: '2026-10-18' }), HOY);
    expect(mensajeAvisame('Jabón de carbón', proximo, HOY)).toBe('Hola, Ópalo. Me interesa Jabón de carbón. ¿Me avisan cuando esté listo? Vi que sale el 18 de octubre.');
    expect(mensajeAvisame('Jabón de carbón', proximo, HOY)).not.toContain('vuelva');
  });
});

describe('grupos, orden y relacionados', () => {
  const lista = [
    producto('j1', { categoria: 'jabon' }),
    producto('j2', { categoria: 'jabon', destacado: true }),
    producto('v1', { categoria: 'vela' }),
    producto('crema', { categoria: 'post', hecho_en_opalo: false, marca: 'Marca X' }),
  ];

  it('agrupa jabones, velas, sets y "para tu cuidado" (sólo los que tienen productos)', () => {
    expect(gruposConProductos(lista).map((g) => g.valor)).toEqual(['jabones', 'velas', 'cuidado']);
    expect(productosDelGrupo(lista, 'cuidado').map((p) => p.id)).toEqual(['crema']);
  });

  it('pone los destacados primero sin perder el orden del servidor', () => {
    expect(productosDelGrupo(lista, 'jabones').map((p) => p.id)).toEqual(['j2', 'j1']);
    expect(productosDelGrupo(lista, 'todo')[0].id).toBe('j2');
  });

  it('relaciona productos de la misma categoría, primero los que hay', () => {
    const otros = [
      producto('j1'),
      producto('j3', { stock_disponible: 0, hay_stock: false }),
      producto('j4'),
      producto('v1', { categoria: 'vela' }),
    ];
    expect(relacionados(otros, otros[0]).map((p) => p.id)).toEqual(['j4', 'j3']);
  });

  it('en Inicio sólo muestra lo hecho en Ópalo (y nada si aún no hay)', () => {
    expect(destacadosHechosEnOpalo(lista).map((p) => p.id)).toEqual(['j2', 'j1', 'v1']);
    expect(destacadosHechosEnOpalo([producto('crema', { hecho_en_opalo: false })])).toEqual([]);
  });

  it('arma la ruta /tienda/:slug y encuentra el producto (o null para la página 404)', () => {
    expect(rutaProducto(producto('jabon-avena'))).toBe('/tienda/jabon-avena');
    expect(rutaProducto(producto('id-1', { slug: null }))).toBe('/tienda/id-1');
    expect(buscarProducto(lista, 'j2')?.id).toBe('j2');
    expect(buscarProducto(lista, 'no-existe')).toBeNull();
  });

  it('acorta la dirección para el aviso de recoger en Ópalo', () => {
    expect(direccionCorta('Momentum Centro Sur, Torre 2, Int. 207, Querétaro, Qro.')).toBe('Momentum Centro Sur, Torre 2, Int. 207');
  });
});

describe('políticas públicas (ESPEC §9)', () => {
  const politica = (tipo: Politica['tipo']): Politica => ({
    id: tipo,
    tipo,
    version: 1,
    titulo: tipo,
    contenido_md: '',
    hash_sha256: null,
    vigente_desde: null,
  });
  const todas = [politica('terminos'), politica('privacidad'), politica('cancelacion'), politica('consentimiento_depilacion'), politica('consentimiento_facial')];

  it('sin firma en línea el índice no lista los consentimientos', () => {
    expect(politicasPublicas(todas, false).map((p) => p.tipo)).toEqual(['terminos', 'privacidad', 'cancelacion']);
  });

  it('con firma en línea vuelve a mostrarlos', () => {
    expect(politicasPublicas(todas, true)).toHaveLength(5);
  });

  it('el enlace directo a un consentimiento se revisa en el spa', () => {
    expect(esConsentimiento('consentimiento_corporal')).toBe(true);
    expect(seRevisaEnSpa('consentimiento_facial', false)).toBe(true);
    expect(seRevisaEnSpa('consentimiento_facial', true)).toBe(false);
    expect(seRevisaEnSpa('terminos', false)).toBe(false);
  });
});
