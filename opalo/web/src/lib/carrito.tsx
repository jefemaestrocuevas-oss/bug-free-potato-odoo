// Carrito de compras del sitio público. Vive en el navegador (localStorage) hasta que la
// clienta confirma su pedido con api.crearPedido; los precios finales y las existencias los
// valida el servidor.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CategoriaProducto, ItemPedidoNuevo, TipoItemPedido } from './api/tipos';

/** Lo necesario para dibujar la miniatura de un producto en el carrito. */
export interface MiniaturaProducto {
  categoria: CategoriaProducto;
  color_hex: string | null;
  foto_url: string | null;
}

export interface ItemCarrito {
  tipo: TipoItemPedido;
  id: string;
  nombre: string;
  /** Precio unitario mostrado (el servidor lo recalcula al confirmar). */
  precio: number;
  cantidad: number;
  /** Nombre de quien recibe el regalo; null si es para la propia clienta. */
  regalo_para: string | null;
  /** Texto corto opcional (p. ej. "Combo · 3 servicios" o el aroma y contenido de un producto). */
  detalle?: string | null;
  /** Productos: piezas disponibles la última vez que las revisamos (null = sin límite conocido). */
  maximo?: number | null;
  /** Productos: para la miniatura y el enlace a su ficha. */
  miniatura?: MiniaturaProducto | null;
  slug?: string | null;
}

export type NuevoItemCarrito = Omit<ItemCarrito, 'cantidad' | 'regalo_para'> & {
  cantidad?: number;
  regalo_para?: string | null;
};

/** Por qué se agregaron menos piezas de las pedidas. */
export type MotivoLimite = 'existencias' | 'maximo';

export interface ResultadoAgregar {
  items: ItemCarrito[];
  /** Piezas que sí se agregaron (0 si ya no cabía ninguna). */
  agregadas: number;
  /** null si se agregó todo lo pedido. */
  limite: MotivoLimite | null;
}

export interface AvisoCarrito {
  /** Cambia en cada agregado, para reiniciar el aviso aunque sea el mismo producto. */
  n: number;
  nombre: string;
  regalo_para: string | null;
  agregadas: number;
  limite: MotivoLimite | null;
}

export interface ValorCarrito {
  items: ItemCarrito[];
  /** Suma de precio × cantidad. */
  total: number;
  /** Número de piezas (suma de cantidades). */
  contador: number;
  /** Agrega respetando el máximo por artículo y, en productos, sus existencias. */
  agregar: (item: NuevoItemCarrito) => { agregadas: number; limite: MotivoLimite | null };
  quitar: (clave: string) => void;
  cambiarCantidad: (clave: string, cantidad: number) => void;
  /** Actualiza nombre/precio/detalle (p. ej. si cambió el precio en el catálogo). */
  actualizar: (clave: string, cambios: Partial<Pick<ItemCarrito, 'nombre' | 'precio' | 'detalle' | 'miniatura' | 'slug'>>) => void;
  /** Ajusta las líneas de un producto a sus existencias actuales; devuelve true si bajó alguna cantidad. */
  ajustarExistencias: (producto_id: string, piezas: number) => boolean;
  /** Cuántas piezas más caben de este artículo (máximo por artículo y existencias). */
  puedenAgregarse: (item: Pick<ItemCarrito, 'tipo' | 'id' | 'regalo_para'> & { maximo?: number | null }) => number;
  /** Cantidad más alta que puede tener una línea del carrito. */
  tope: (clave: string) => number;
  vaciar: () => void;
  /** Ítems en el formato que espera api.crearPedido. */
  paraPedido: () => ItemPedidoNuevo[];
  /** Último agregado (para el aviso flotante del layout). */
  aviso: AvisoCarrito | null;
  cerrarAviso: () => void;
}

export const CANTIDAD_MAXIMA = 20;
const CLAVE_ALMACEN = 'opalo-carrito-v1';
const TIPOS: TipoItemPedido[] = ['servicio', 'paquete', 'producto'];

/** Identificador estable de una línea del carrito (el mismo servicio para regalo va aparte). */
export function claveItem(i: Pick<ItemCarrito, 'tipo' | 'id' | 'regalo_para'>): string {
  return `${i.tipo}:${i.id}:${(i.regalo_para ?? '').trim().toLowerCase()}`;
}

function limitar(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(CANTIDAD_MAXIMA, Math.max(1, Math.round(n)));
}

function normalizarRegalo(r: string | null | undefined): string | null {
  const t = (r ?? '').trim().replace(/\s+/g, ' ');
  return t ? t.slice(0, 80) : null;
}

/** Existencias como entero ≥ 0, o null si no se conocen. */
function normalizarMaximo(m: unknown): number | null {
  return typeof m === 'number' && Number.isFinite(m) ? Math.max(0, Math.floor(m)) : null;
}

function normalizarMiniatura(m: unknown): MiniaturaProducto | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  if (typeof o.categoria !== 'string') return null;
  const color = typeof o.color_hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color_hex) ? o.color_hex : null;
  const foto = typeof o.foto_url === 'string' && /^(https?:\/\/|\/(?!\/))/i.test(o.foto_url) ? o.foto_url : null;
  return { categoria: o.categoria as CategoriaProducto, color_hex: color, foto_url: foto };
}

function esProductoConLimite(i: { tipo: TipoItemPedido; maximo?: number | null }): i is { tipo: 'producto'; maximo: number } {
  return i.tipo === 'producto' && typeof i.maximo === 'number';
}

/** Piezas de un artículo que ya están en el carrito (todas sus líneas, salvo `excepto`). */
export function piezasEnCarrito(items: ItemCarrito[], tipo: TipoItemPedido, id: string, excepto?: string): number {
  return items.reduce((s, i) => (i.tipo === tipo && i.id === id && claveItem(i) !== excepto ? s + i.cantidad : s), 0);
}

/**
 * Cuántas piezas más se pueden agregar: hasta CANTIDAD_MAXIMA por línea y, en productos con
 * existencias conocidas, hasta completar las piezas disponibles entre todas sus líneas
 * (la misma vela para ti y para regalo comparten existencias).
 */
export function puedenAgregarseA(
  items: ItemCarrito[],
  item: Pick<ItemCarrito, 'tipo' | 'id' | 'regalo_para'> & { maximo?: number | null },
): number {
  const clave = claveItem(item);
  const linea = items.find((i) => claveItem(i) === clave);
  const porLinea = CANTIDAD_MAXIMA - (linea?.cantidad ?? 0);
  const maximo = normalizarMaximo(item.maximo ?? linea?.maximo);
  if (item.tipo !== 'producto' || maximo === null) return Math.max(0, porLinea);
  return Math.max(0, Math.min(porLinea, maximo - piezasEnCarrito(items, item.tipo, item.id)));
}

/** Cantidad más alta que puede tener una línea (sin contar lo que ocupan sus otras líneas). */
export function topeLinea(items: ItemCarrito[], linea: ItemCarrito): number {
  if (!esProductoConLimite(linea)) return CANTIDAD_MAXIMA;
  const otras = piezasEnCarrito(items, linea.tipo, linea.id, claveItem(linea));
  return Math.max(0, Math.min(CANTIDAD_MAXIMA, linea.maximo - otras));
}

/** Agrega un artículo (función pura: la usa el proveedor y las pruebas). */
export function agregarA(items: ItemCarrito[], nuevo: NuevoItemCarrito): ResultadoAgregar {
  const regalo_para = normalizarRegalo(nuevo.regalo_para);
  const deseadas = limitar(nuevo.cantidad ?? 1);
  const delMismo = (i: ItemCarrito) => i.tipo === 'producto' && i.id === nuevo.id;
  const nuevoMaximo = nuevo.tipo === 'producto' ? normalizarMaximo(nuevo.maximo) : null;
  // Las existencias más recientes valen para todas las líneas del producto; si no vienen, las que ya conocíamos.
  const maximo = nuevo.tipo === 'producto' ? (nuevoMaximo ?? normalizarMaximo(items.find(delMismo)?.maximo)) : null;
  const base = nuevoMaximo === null ? items : items.map((i) => (delMismo(i) && i.maximo !== nuevoMaximo ? { ...i, maximo: nuevoMaximo } : i));
  const item: ItemCarrito = {
    tipo: nuevo.tipo,
    id: nuevo.id,
    nombre: nuevo.nombre,
    precio: nuevo.precio,
    cantidad: deseadas,
    regalo_para,
    detalle: nuevo.detalle ?? null,
    maximo,
    miniatura: nuevo.miniatura ?? null,
    slug: nuevo.slug ?? null,
  };
  const clave = claveItem(item);
  const existente = base.find((i) => claveItem(i) === clave);
  const agregadas = Math.min(deseadas, puedenAgregarseA(base, item));
  let limite: MotivoLimite | null = null;
  if (agregadas < deseadas) {
    const porLinea = CANTIDAD_MAXIMA - (existente?.cantidad ?? 0);
    const porExistencias = maximo === null ? Infinity : maximo - piezasEnCarrito(base, item.tipo, item.id);
    limite = porExistencias <= porLinea ? 'existencias' : 'maximo';
  }
  if (agregadas === 0) return { items: base, agregadas: 0, limite };
  if (!existente) return { items: [...base, { ...item, cantidad: agregadas }], agregadas, limite };
  return {
    items: base.map((i) =>
      claveItem(i) === clave
        ? {
            ...i,
            nombre: item.nombre,
            precio: item.precio,
            detalle: item.detalle,
            miniatura: item.miniatura ?? i.miniatura ?? null,
            slug: item.slug ?? i.slug ?? null,
            cantidad: i.cantidad + agregadas,
          }
        : i,
    ),
    agregadas,
    limite,
  };
}

/** Cambia la cantidad de una línea respetando su tope (mínimo 1). */
export function cambiarCantidadEn(items: ItemCarrito[], clave: string, cantidad: number): ItemCarrito[] {
  const linea = items.find((i) => claveItem(i) === clave);
  if (!linea) return items;
  const n = Math.min(limitar(cantidad), Math.max(1, topeLinea(items, linea)));
  return n === linea.cantidad ? items : items.map((i) => (i === linea ? { ...i, cantidad: n } : i));
}

/**
 * Ajusta las líneas de un producto a sus existencias: guarda el nuevo máximo y, si no alcanzan,
 * baja las cantidades en orden (una línea que se queda sin piezas se quita). Con 0 piezas las
 * líneas se conservan para que la clienta vea que se agotó y decida quitarlas.
 */
export function ajustarAExistencias(items: ItemCarrito[], producto_id: string, piezas: number): { items: ItemCarrito[]; reducido: boolean } {
  const disponibles = normalizarMaximo(piezas) ?? 0;
  let restante = disponibles;
  let reducido = false;
  let cambio = false;
  const sig: ItemCarrito[] = [];
  for (const i of items) {
    if (i.tipo !== 'producto' || i.id !== producto_id) {
      sig.push(i);
      continue;
    }
    if (i.maximo !== disponibles) cambio = true;
    if (disponibles === 0) {
      sig.push(i.maximo === 0 ? i : { ...i, maximo: 0 });
      continue;
    }
    const cantidad = Math.min(i.cantidad, restante);
    restante -= cantidad;
    if (cantidad < i.cantidad) reducido = cambio = true;
    if (cantidad === 0) continue;
    sig.push(cantidad === i.cantidad && i.maximo === disponibles ? i : { ...i, cantidad, maximo: disponibles });
  }
  return { items: cambio ? sig : items, reducido };
}

/** Texto del aviso flotante al agregar (también cuando las existencias no alcanzaron). */
export function textoAviso(a: AvisoCarrito): { titulo: string; resto: string } {
  const regalo = a.regalo_para ? ` (regalo para ${a.regalo_para})` : '';
  if (a.agregadas === 0) {
    return a.limite === 'existencias'
      ? { titulo: a.nombre, resto: ': ya tienes en tu carrito todas las piezas que tenemos por ahora.' }
      : { titulo: a.nombre, resto: `: ya tienes ${CANTIDAD_MAXIMA} en tu carrito, el máximo por artículo.` };
  }
  if (a.limite === 'existencias') {
    const piezas = a.agregadas === 1 ? 'pieza' : 'piezas';
    return { titulo: a.nombre, resto: `${regalo}: ${a.agregadas} ${piezas}, las que tenemos por ahora.` };
  }
  return { titulo: a.nombre, resto: `${regalo} al carrito.` };
}

function esItemValido(x: unknown): x is ItemCarrito {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    TIPOS.includes(o.tipo as TipoItemPedido) &&
    typeof o.id === 'string' &&
    typeof o.nombre === 'string' &&
    typeof o.precio === 'number' &&
    Number.isFinite(o.precio) &&
    typeof o.cantidad === 'number' &&
    (o.regalo_para === null || o.regalo_para === undefined || typeof o.regalo_para === 'string')
  );
}

/** Lee y sanea lo guardado (exportada para las pruebas). */
export function leerItemsGuardados(crudo: string | null): ItemCarrito[] {
  if (!crudo) return [];
  try {
    const datos: unknown = JSON.parse(crudo);
    if (!Array.isArray(datos)) return [];
    return datos.filter(esItemValido).map((i) => {
      const maximo = i.tipo === 'producto' ? normalizarMaximo(i.maximo) : null;
      return {
        tipo: i.tipo,
        id: i.id,
        nombre: i.nombre,
        precio: i.precio,
        cantidad: limitar(i.cantidad),
        regalo_para: normalizarRegalo(i.regalo_para),
        detalle: typeof i.detalle === 'string' ? i.detalle : null,
        maximo,
        miniatura: i.tipo === 'producto' ? normalizarMiniatura(i.miniatura) : null,
        slug: i.tipo === 'producto' && typeof i.slug === 'string' ? i.slug : null,
      };
    });
  } catch {
    return [];
  }
}

function leerAlmacen(): ItemCarrito[] {
  try {
    return leerItemsGuardados(window.localStorage.getItem(CLAVE_ALMACEN));
  } catch {
    return [];
  }
}

function guardarAlmacen(items: ItemCarrito[]): void {
  try {
    if (items.length) window.localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(items));
    else window.localStorage.removeItem(CLAVE_ALMACEN);
  } catch {
    // Sin almacenamiento (modo privado, bloqueado): el carrito vive sólo en esta pestaña.
  }
}

/** Borra el carrito guardado (p. ej. antes de reiniciar los datos de la demostración). */
export function borrarCarritoGuardado(): void {
  try {
    window.localStorage.removeItem(CLAVE_ALMACEN);
  } catch {
    // Nada que borrar.
  }
}

const Ctx = createContext<ValorCarrito | null>(null);

export function CarritoProvider({ children }: { children: ReactNode }) {
  const [items, setItemsEstado] = useState<ItemCarrito[]>(leerAlmacen);
  // Copia síncrona: agregar() calcula lo que cabe con lo último, aunque React aún no repinte.
  const actuales = useRef(items);
  const setItems = useCallback((sig: ItemCarrito[] | ((prev: ItemCarrito[]) => ItemCarrito[])) => {
    const nuevo = typeof sig === 'function' ? sig(actuales.current) : sig;
    if (nuevo === actuales.current) return;
    actuales.current = nuevo;
    setItemsEstado(nuevo);
  }, []);
  const [aviso, setAviso] = useState<AvisoCarrito | null>(null);
  const contadorAvisos = useRef(0);
  // Evita volver a escribir lo que acabamos de leer de otra pestaña.
  const desdeOtraPestana = useRef(false);

  useEffect(() => {
    if (desdeOtraPestana.current) {
      desdeOtraPestana.current = false;
      return;
    }
    guardarAlmacen(items);
  }, [items]);

  // Mantiene el carrito sincronizado si la clienta tiene el sitio abierto en otra pestaña.
  useEffect(() => {
    const alCambiar = (e: StorageEvent) => {
      if (e.key !== CLAVE_ALMACEN && e.key !== null) return;
      desdeOtraPestana.current = true;
      setItems(leerAlmacen());
    };
    window.addEventListener('storage', alCambiar);
    return () => window.removeEventListener('storage', alCambiar);
  }, [setItems]);

  const agregar = useCallback(
    (nuevo: NuevoItemCarrito) => {
      const r = agregarA(actuales.current, nuevo);
      setItems(r.items);
      contadorAvisos.current += 1;
      setAviso({ n: contadorAvisos.current, nombre: nuevo.nombre, regalo_para: normalizarRegalo(nuevo.regalo_para), agregadas: r.agregadas, limite: r.limite });
      return { agregadas: r.agregadas, limite: r.limite };
    },
    [setItems],
  );

  const quitar = useCallback((clave: string) => setItems((prev) => prev.filter((i) => claveItem(i) !== clave)), [setItems]);

  const cambiarCantidad = useCallback((clave: string, cantidad: number) => setItems((prev) => cambiarCantidadEn(prev, clave, cantidad)), [setItems]);

  const actualizar = useCallback(
    (clave: string, cambios: Partial<Pick<ItemCarrito, 'nombre' | 'precio' | 'detalle' | 'miniatura' | 'slug'>>) => {
      setItems((prev) => {
        let cambio = false;
        const sig = prev.map((i) => {
          if (claveItem(i) !== clave) return i;
          const n = { ...i, ...cambios };
          const distinto = (Object.keys(cambios) as (keyof typeof cambios)[]).some((k) => JSON.stringify(n[k]) !== JSON.stringify(i[k]));
          if (!distinto) return i;
          cambio = true;
          return n;
        });
        return cambio ? sig : prev;
      });
    },
    [setItems],
  );

  const ajustarExistencias = useCallback(
    (producto_id: string, piezas: number) => {
      const r = ajustarAExistencias(actuales.current, producto_id, piezas);
      setItems(r.items);
      return r.reducido;
    },
    [setItems],
  );

  const vaciar = useCallback(() => setItems([]), [setItems]);
  const cerrarAviso = useCallback(() => setAviso(null), []);

  const valor = useMemo<ValorCarrito>(() => {
    const total = Math.round(items.reduce((s, i) => s + i.precio * i.cantidad, 0) * 100) / 100;
    const contador = items.reduce((s, i) => s + i.cantidad, 0);
    return {
      items,
      total,
      contador,
      agregar,
      quitar,
      cambiarCantidad,
      actualizar,
      ajustarExistencias,
      puedenAgregarse: (item) => puedenAgregarseA(items, item),
      tope: (clave) => {
        const linea = items.find((i) => claveItem(i) === clave);
        return linea ? topeLinea(items, linea) : CANTIDAD_MAXIMA;
      },
      vaciar,
      paraPedido: () => items.map((i) => ({ tipo: i.tipo, id: i.id, cantidad: i.cantidad, regalo_para: i.regalo_para })),
      aviso,
      cerrarAviso,
    };
  }, [items, aviso, agregar, quitar, cambiarCantidad, actualizar, ajustarExistencias, vaciar, cerrarAviso]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useCarrito(): ValorCarrito {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCarrito fuera de CarritoProvider');
  return v;
}
