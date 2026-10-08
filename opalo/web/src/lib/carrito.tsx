// Carrito de compras del sitio público. Vive en el navegador (localStorage) hasta que la
// clienta confirma su pedido con api.crearPedido; los precios finales los calcula el servidor.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ItemPedidoNuevo, TipoItemPedido } from './api/tipos';

export interface ItemCarrito {
  tipo: TipoItemPedido;
  id: string;
  nombre: string;
  /** Precio unitario mostrado (el servidor lo recalcula al confirmar). */
  precio: number;
  cantidad: number;
  /** Nombre de quien recibe el regalo; null si es para la propia clienta. */
  regalo_para: string | null;
  /** Texto corto opcional (p. ej. "Combo · 3 servicios" o la presentación de un producto). */
  detalle?: string | null;
}

export type NuevoItemCarrito = Omit<ItemCarrito, 'cantidad' | 'regalo_para'> & {
  cantidad?: number;
  regalo_para?: string | null;
};

export interface AvisoCarrito {
  /** Cambia en cada agregado, para reiniciar el aviso aunque sea el mismo producto. */
  n: number;
  nombre: string;
  regalo_para: string | null;
}

export interface ValorCarrito {
  items: ItemCarrito[];
  /** Suma de precio × cantidad. */
  total: number;
  /** Número de piezas (suma de cantidades). */
  contador: number;
  agregar: (item: NuevoItemCarrito) => void;
  quitar: (clave: string) => void;
  cambiarCantidad: (clave: string, cantidad: number) => void;
  /** Actualiza nombre/precio/detalle (p. ej. si cambió el precio en el catálogo). */
  actualizar: (clave: string, cambios: Partial<Pick<ItemCarrito, 'nombre' | 'precio' | 'detalle'>>) => void;
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

function leerAlmacen(): ItemCarrito[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE_ALMACEN);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    if (!Array.isArray(datos)) return [];
    return datos.filter(esItemValido).map((i) => ({
      tipo: i.tipo,
      id: i.id,
      nombre: i.nombre,
      precio: i.precio,
      cantidad: limitar(i.cantidad),
      regalo_para: normalizarRegalo(i.regalo_para),
      detalle: typeof i.detalle === 'string' ? i.detalle : null,
    }));
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
  const [items, setItems] = useState<ItemCarrito[]>(leerAlmacen);
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
  }, []);

  const agregar = useCallback((nuevo: NuevoItemCarrito) => {
    const regalo_para = normalizarRegalo(nuevo.regalo_para);
    const cantidad = limitar(nuevo.cantidad ?? 1);
    const item: ItemCarrito = {
      tipo: nuevo.tipo,
      id: nuevo.id,
      nombre: nuevo.nombre,
      precio: nuevo.precio,
      cantidad,
      regalo_para,
      detalle: nuevo.detalle ?? null,
    };
    const clave = claveItem(item);
    setItems((prev) => {
      const existente = prev.find((i) => claveItem(i) === clave);
      if (!existente) return [...prev, item];
      return prev.map((i) =>
        claveItem(i) === clave ? { ...i, nombre: item.nombre, precio: item.precio, detalle: item.detalle, cantidad: limitar(i.cantidad + cantidad) } : i,
      );
    });
    contadorAvisos.current += 1;
    setAviso({ n: contadorAvisos.current, nombre: item.nombre, regalo_para });
  }, []);

  const quitar = useCallback((clave: string) => {
    setItems((prev) => prev.filter((i) => claveItem(i) !== clave));
  }, []);

  const cambiarCantidad = useCallback((clave: string, cantidad: number) => {
    setItems((prev) => prev.map((i) => (claveItem(i) === clave ? { ...i, cantidad: limitar(cantidad) } : i)));
  }, []);

  const actualizar = useCallback((clave: string, cambios: Partial<Pick<ItemCarrito, 'nombre' | 'precio' | 'detalle'>>) => {
    setItems((prev) => {
      let cambio = false;
      const sig = prev.map((i) => {
        if (claveItem(i) !== clave) return i;
        const n = { ...i, ...cambios };
        if (n.nombre !== i.nombre || n.precio !== i.precio || n.detalle !== i.detalle) cambio = true;
        return n;
      });
      return cambio ? sig : prev;
    });
  }, []);

  const vaciar = useCallback(() => setItems([]), []);
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
      vaciar,
      paraPedido: () => items.map((i) => ({ tipo: i.tipo, id: i.id, cantidad: i.cantidad, regalo_para: i.regalo_para })),
      aviso,
      cerrarAviso,
    };
  }, [items, aviso, agregar, quitar, cambiarCantidad, actualizar, vaciar, cerrarAviso]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useCarrito(): ValorCarrito {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCarrito fuera de CarritoProvider');
  return v;
}
