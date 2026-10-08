// Sitio público: tienda de jabones y velas (ESPEC §10) y la firma fuera del discurso público (§9).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Configuracion, Politica, ProductoTienda } from '../../lib/api/tipos';
import { CarritoProvider, useCarrito } from '../../lib/carrito';
import Inicio from './Inicio';
import Politicas from './Politicas';
import Tienda from './Tienda';
import TiendaProducto from './TiendaProducto';

const m = vi.hoisted(() => ({
  productos: [] as unknown[],
  politicas: [] as unknown[],
}));

vi.mock('../../lib/api', () => {
  const config: Configuracion = {
    nombre_negocio: 'Ópalo',
    lema: null,
    telefono_whatsapp: '4421701466',
    direccion: 'Momentum Centro Sur, Torre 2, Int. 207, Querétaro, Qro.',
    zona_horaria: 'America/Mexico_City',
    duracion_sesion_min: 60,
    intervalo_slots_min: 60,
    anticipacion_min_horas: 2,
    ventana_reserva_dias: 60,
    horas_cancelacion: 24,
    tolerancia_retraso_min: 15,
    edad_minima: 15,
    edad_mayoria: 18,
    vigencia_creditos_dias: 365,
    fecha_apertura: '2026-10-31',
    firma_en_linea: false,
  };
  return {
    POLITICAS_GENERALES: ['terminos', 'privacidad', 'cancelacion'],
    api: {
      modo: 'demo',
      getConfiguracion: async () => config,
      getProductosTienda: async () => m.productos,
      getPoliticasVigentes: async () => m.politicas,
      getCatalogo: async () => ({ categorias: [], servicios: [], paquetes: [] }),
      getEquipo: async () => [],
    },
  };
});

function producto(id: string, extra: Partial<ProductoTienda> = {}): ProductoTienda {
  return {
    id,
    slug: id,
    nombre: `Jabón ${id} (ejemplo)`,
    categoria: 'jabon',
    marca: null,
    presentacion: null,
    descripcion: 'Descripción de ejemplo.',
    aroma: 'Avena y miel',
    ingredientes: 'Aceite de oliva, avena.',
    modo_uso: 'Úsalo en la ducha.',
    advertencias: 'Evita el contacto con los ojos.',
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

const politica = (tipo: Politica['tipo'], titulo: string): Politica => ({
  id: tipo,
  tipo,
  version: 1,
  titulo,
  contenido_md: `# ${titulo}\n\nTexto.`,
  hash_sha256: 'abc123abc123abc123',
  vigente_desde: '2026-10-01',
});

let contenedor: HTMLDivElement;
let raiz: Root;
let carritoActual: ReturnType<typeof useCarrito> | null = null;

function EspiaCarrito() {
  carritoActual = useCarrito();
  return null;
}

let rutaActual = '';
function EspiaRuta() {
  rutaActual = useLocation().pathname;
  return null;
}

async function esperar() {
  for (let i = 0; i < 5; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
}

async function montar(ruta: string) {
  await act(async () => {
    raiz.render(
      <MemoryRouter initialEntries={[ruta]}>
        <CarritoProvider>
          <EspiaCarrito />
          <EspiaRuta />
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/tienda" element={<Tienda />} />
            <Route path="/tienda/:slug" element={<TiendaProducto />} />
            <Route path="/politicas" element={<Politicas />} />
            <Route path="/politicas/:tipo" element={<Politicas />} />
          </Routes>
        </CarritoProvider>
      </MemoryRouter>,
    );
  });
  await esperar();
}

function boton(texto: string | RegExp): HTMLButtonElement {
  const b = [...contenedor.querySelectorAll('button')].find((x) =>
    typeof texto === 'string' ? x.textContent?.includes(texto) || x.getAttribute('aria-label')?.includes(texto) : texto.test(x.textContent ?? ''),
  );
  if (!b) throw new Error(`No hay botón "${texto}"`);
  return b as HTMLButtonElement;
}

async function clic(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
  carritoActual = null;
  m.productos = [];
  m.politicas = [];
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
});

describe('tienda pública', () => {
  it('muestra existencias, la insignia "Hecho en Ópalo" y la ilustración con el nombre del producto', async () => {
    m.productos = [
      producto('avena', { stock_disponible: 2, destacado: true }),
      producto('carbon', { stock_disponible: 0, hay_stock: false, proximo_lote_listo: '2099-11-12' }),
      producto('rosa', { stock_disponible: 0, hay_stock: false }),
      producto('vela', { categoria: 'vela', nombre: 'Vela de lavanda (ejemplo)' }),
    ];
    await montar('/tienda');
    const texto = contenedor.textContent ?? '';
    expect(texto).toContain('Jabones y velas hechos a mano');
    expect(texto).toContain('Últimas 2 piezas');
    expect(texto).toContain('Disponible desde el 12 de noviembre de 2099');
    expect(texto).toContain('Agotado');
    expect(texto).toContain('Hecho en Ópalo');
    expect(texto).toContain('Regala o prepaga servicios');
    expect(contenedor.querySelectorAll('a[href^="https://wa.me/"]').length).toBeGreaterThanOrEqual(2);
    expect(contenedor.querySelector('[role="img"][aria-label="Vela de lavanda (ejemplo)"]')).not.toBeNull();
    // Pestañas: sólo los grupos que tienen productos.
    expect([...contenedor.querySelectorAll('.srv-filtro')].map((b) => b.textContent)).toEqual(['Todo', 'Jabones', 'Velas']);
    await clic(boton('Velas'));
    expect(contenedor.textContent).not.toContain('Jabón avena (ejemplo)');
  });

  it('"Agregar" no pasa de las piezas disponibles', async () => {
    m.productos = [producto('avena', { stock_disponible: 2 })];
    await montar('/tienda');
    for (let i = 0; i < 3; i++) await clic(boton('Agregar Jabón avena'));
    expect(carritoActual?.items[0]).toMatchObject({ cantidad: 2, maximo: 2 });
    expect(carritoActual?.aviso).toMatchObject({ agregadas: 0, limite: 'existencias' });
  });

  it('sin productos dice "Muy pronto" sin inventar productos', async () => {
    await montar('/tienda');
    expect(contenedor.textContent).toContain('Muy pronto: jabones y velas hechos en Ópalo');
    expect(contenedor.querySelectorAll('.prod-tarjeta')).toHaveLength(0);
  });
});

describe('ficha de producto', () => {
  it('muestra todo lo de la etiqueta, el aviso de recoger en Ópalo y limita la cantidad', async () => {
    m.productos = [producto('avena', { stock_disponible: 3 }), producto('miel')];
    await montar('/tienda/avena');
    const texto = contenedor.textContent ?? '';
    expect(contenedor.querySelector('h1')?.textContent).toBe('Jabón avena (ejemplo)');
    for (const t of ['Avena y miel', '100 g', 'Ingredientes', 'Modo de uso', 'Advertencias', 'Recoges tu pedido en Ópalo', 'Torre 2, Int. 207', 'transferencia', 'También te puede gustar', 'Jabón miel (ejemplo)', 'Regálalo']) {
      expect(texto).toContain(t);
    }
    const mas = boton('Agregar una pieza');
    await clic(mas);
    await clic(mas);
    await clic(mas);
    expect((contenedor.querySelector('.prod-cantidad-input') as HTMLInputElement).value).toBe('3');
    expect(mas.disabled).toBe(true);
    await clic(boton(/Agregar ·/));
    expect(carritoActual?.items[0]).toMatchObject({ id: 'avena', cantidad: 3, maximo: 3, slug: 'avena' });
  });

  it('si el producto no existe muestra una página amable', async () => {
    m.productos = [producto('avena')];
    await montar('/tienda/no-existe');
    expect(contenedor.textContent).toContain('No encontramos este producto');
    expect(contenedor.querySelector('a[href="/tienda"]')).not.toBeNull();
  });
});

describe('la firma no se menciona en el sitio público (ESPEC §9)', () => {
  it('el índice de políticas no lista los consentimientos', async () => {
    m.politicas = [
      politica('terminos', 'Términos y condiciones'),
      politica('privacidad', 'Aviso de privacidad'),
      politica('cancelacion', 'Política de cancelación'),
      politica('consentimiento_depilacion', 'Consentimiento de depilación'),
    ];
    await montar('/politicas');
    const texto = contenedor.textContent ?? '';
    expect(texto).toContain('Términos y condiciones');
    expect(texto).not.toContain('Consentimiento de depilación');
    expect(texto).not.toMatch(/firm/i);
  });

  it('un consentimiento abierto por enlace se revisa en el spa', async () => {
    m.politicas = [politica('terminos', 'Términos y condiciones'), politica('consentimiento_facial', 'Consentimiento facial')];
    await montar('/politicas/consentimiento_facial');
    const texto = contenedor.textContent ?? '';
    expect(texto).toContain('Este documento se revisa contigo en el spa');
    expect(texto).not.toContain('Texto.');
    expect(texto).not.toMatch(/firm/i);
    expect(rutaActual).toBe('/politicas/consentimiento_facial');
  });

  it('Inicio no habla de firmar y anuncia la tienda sin inventar productos', async () => {
    await montar('/');
    const texto = contenedor.textContent ?? '';
    expect(texto).not.toMatch(/firm/i);
    expect(texto).toContain('Tu cita en tres pasos');
    expect(texto).toContain('Hecho a mano en Ópalo');
    expect(texto).toContain('Muy pronto: jabones y velas hechos en Ópalo');
  });

  it('Inicio muestra hasta 3 productos hechos en Ópalo', async () => {
    m.productos = ['a', 'b', 'c', 'd'].map((id) => producto(id));
    await montar('/');
    expect(contenedor.querySelectorAll('.ini-taller .prod-tarjeta')).toHaveLength(3);
  });
});
