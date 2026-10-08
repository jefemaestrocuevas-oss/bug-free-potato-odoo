// Editor de la receta de un servicio: cuánto se gasta de cada producto en una sesión.
import { useEffect, useState } from 'react';
import { api, type CostoServicio, type Producto, type RecetaItem } from '../../lib/api';
import { porcentaje } from '../../lib/format';
import { useAccion, useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError } from '../ui/Estado';
import { Modal, useConfirmar } from './Modal';
import { EntradaConUnidad, SelectorProducto, centavos, nombrePresentacion, pesos } from './InventarioPiezas';
import { aNumero, aTexto, dineroUnitario, textoONulo } from './util';

/** Debajo de este margen (%) se marca "Margen bajo". */
export const MARGEN_MINIMO_PCT = 50;

interface Linea {
  clave: number;
  producto_id: string;
  cantidad: string;
  notas: string;
}

let siguiente = 1;
const lineaVacia = (): Linea => ({ clave: siguiente++, producto_id: '', cantidad: '', notas: '' });
const firma = (ls: Linea[]) =>
  JSON.stringify(
    ls
      .filter((l) => l.producto_id || l.cantidad.trim() || l.notas.trim())
      .map((l) => [l.producto_id, aNumero(l.cantidad), l.notas.trim()])
      .sort(),
  );

interface Props {
  servicio: CostoServicio;
  /** undefined mientras se cargan */
  productos: Producto[] | undefined;
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void;
}

export function CostosReceta({ servicio, productos: productosCargados, onCerrar, onGuardado }: Props) {
  const productos = productosCargados ?? [];
  const receta = useAsync(() => api.admin.getReceta(servicio.servicio_id), [servicio.servicio_id]);
  const [lineas, setLineas] = useState<Linea[] | null>(null);
  const [original, setOriginal] = useState('');
  const { confirmar, dialogo } = useConfirmar();
  const porId = new Map(productos.map((p) => [p.id, p]));

  useEffect(() => {
    if (!receta.datos) return;
    const ls = receta.datos.map((r) => ({ clave: siguiente++, producto_id: r.producto_id, cantidad: aTexto(r.cantidad), notas: r.notas ?? '' }));
    setOriginal(firma(ls));
    setLineas(ls.length ? ls : [lineaVacia()]);
  }, [receta.datos]);

  const ls = lineas ?? [];
  const calculadas = ls.map((l) => {
    const p = porId.get(l.producto_id);
    const cant = aNumero(l.cantidad);
    const costo = p && cant !== null && cant > 0 ? cant * p.costo_unitario : null;
    return { l, p, cant, costo };
  });
  const total = centavos(calculadas.reduce((s, c) => s + (c.costo ?? 0), 0));
  const precio = servicio.precio;
  // Sin ningún producto con cantidad el material sale en $0 y el margen sería un falso 100 %.
  const conProductos = calculadas.some((c) => c.costo !== null);
  const margen = precio === null || !conProductos ? null : centavos(precio - total);
  const margenPct = precio === null || precio === 0 || margen === null ? null : Math.round((margen / precio) * 1000) / 10;
  const usados = new Set(ls.map((l) => l.producto_id).filter(Boolean));
  const cambiado = lineas !== null && firma(ls) !== original;
  const habiaReceta = (receta.datos?.length ?? 0) > 0;

  const cambiar = (clave: number, cambios: Partial<Linea>) => setLineas((xs) => (xs ?? []).map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  const quitar = (clave: number) => setLineas((xs) => ((xs ?? []).length <= 1 ? [lineaVacia()] : (xs ?? []).filter((l) => l.clave !== clave)));

  const { ejecutar, enviando, error, setError } = useAccion(async (items: RecetaItem[]) => {
    await api.admin.guardarReceta(servicio.servicio_id, items);
    return true;
  });

  const validar = (): RecetaItem[] => {
    const items: RecetaItem[] = [];
    for (const c of calculadas) {
      const tiene = c.l.producto_id || c.l.cantidad.trim() || c.l.notas.trim();
      if (!tiene) continue;
      if (!c.l.producto_id) throw new Error('Elige el producto de cada línea o quita las que no uses.');
      if (c.cant === null || c.cant <= 0) throw new Error(`Escribe cuánto se usa de ${c.p?.nombre ?? 'cada producto'} (mayor a cero).`);
      items.push({ producto_id: c.l.producto_id, cantidad: c.cant, notas: textoONulo(c.l.notas) });
    }
    return items;
  };

  const guardar = async () => {
    setError(null);
    let items: RecetaItem[];
    try {
      items = validar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    const mensaje =
      items.length === 0
        ? `Quitamos la receta de ${servicio.nombre}: su costo de material queda en $0.`
        : `Receta de ${servicio.nombre} guardada. Costo de material: ${pesos(total)}${margenPct !== null ? ` · margen ${porcentaje(margenPct)}` : ''}.`;
    if (items.length === 0 && habiaReceta) {
      confirmar({
        titulo: '¿Quitar toda la receta?',
        mensaje: <p>{servicio.nombre} se quedará sin receta: su costo de material saldrá en $0 y las citas completadas ya no descontarán insumos.</p>,
        textoBoton: 'Sí, quitar receta',
        peligro: true,
        accion: () => api.admin.guardarReceta(servicio.servicio_id, []),
        alTerminar: () => onGuardado(mensaje),
      });
      return;
    }
    if (await ejecutar(items)) onGuardado(mensaje);
  };

  const cerrar = () => {
    if (enviando) return;
    if (!cambiado) return onCerrar();
    confirmar({
      titulo: '¿Salir sin guardar?',
      mensaje: <p>Hiciste cambios en la receta de {servicio.nombre}. Si sales ahora, se pierden.</p>,
      textoBoton: 'Salir sin guardar',
      peligro: true,
      accion: async () => undefined,
      alTerminar: onCerrar,
    });
  };

  const tonoMargen = margenPct === null ? '' : margen !== null && margen < 0 ? 'cos-negativo' : margenPct < MARGEN_MINIMO_PCT ? 'cos-bajo' : 'cos-bien';

  return (
    <Modal
      titulo={`Receta · ${servicio.nombre}`}
      onCerrar={cerrar}
      bloqueado={enviando}
      ancho="completo"
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={cerrar} disabled={enviando}>
            {cambiado ? 'Cancelar' : 'Cerrar'}
          </button>
          <button type="button" className="btn btn-primario" onClick={guardar} disabled={enviando || lineas === null || !productosCargados}>
            {enviando ? 'Guardando…' : 'Guardar receta'}
          </button>
        </>
      }
    >
      <div className="inv-modal-ancho inv-lineas-contenedor">
        <p className="texto-2 cos-modal-intro">
          Escribe cuánto se gasta de cada producto en <strong>una sesión</strong> de este servicio, en la unidad del producto (g, ml o piezas). Al completar una
          cita, el sistema descuenta estas cantidades del inventario.
        </p>

        {((receta.cargando && !receta.datos) || !productosCargados) && <Cargando texto="Cargando la receta…" />}
        <MensajeError error={receta.error} onReintentar={receta.recargar} />

        {lineas !== null && productosCargados && (
          <>
            {productos.filter((p) => p.activo).length === 0 && (
              <p className="aviso aviso-info">Aún no hay productos en el inventario. Dalos de alta en Inventario → Productos para armar la receta.</p>
            )}
            <fieldset className="inv-lineas cos-lineas">
              <legend className="inv-lineas-titulo">Productos por sesión</legend>
              <div className="inv-linea cos-linea inv-linea-cabeza" aria-hidden="true">
                <span>Producto</span>
                <span>Cantidad</span>
                <span>Nota</span>
                <span className="inv-der">Costo</span>
                <span />
              </div>
              <ol className="inv-lineas-lista">
                {calculadas.map(({ l, p, costo }, i) => {
                  const n = i + 1;
                  return (
                    <li key={l.clave} className="inv-linea cos-linea">
                      <div className="inv-linea-producto">
                        <label className="inv-etiqueta-linea" htmlFor={`receta-prod-${l.clave}`}>
                          Producto {n}
                        </label>
                        <SelectorProducto
                          id={`receta-prod-${l.clave}`}
                          productos={productos}
                          valor={l.producto_id}
                          onCambio={(id) => cambiar(l.clave, { producto_id: id })}
                          excluir={usados}
                        />
                        {p && (
                          <span className="adm-sub">
                            {nombrePresentacion(p)} a {pesos(p.costo_presentacion)} → {dineroUnitario(p.costo_unitario)} por {p.unidad_medida}
                            {!p.activo ? ' · producto inactivo' : ''}
                          </span>
                        )}
                      </div>
                      <div className="cos-linea-cantidad">
                        <label className="inv-etiqueta-linea" htmlFor={`receta-cant-${l.clave}`}>
                          Cantidad
                        </label>
                        <EntradaConUnidad
                          id={`receta-cant-${l.clave}`}
                          valor={l.cantidad}
                          onCambio={(v) => cambiar(l.clave, { cantidad: v })}
                          unidad={p?.unidad_medida ?? '—'}
                          etiquetaAccesible={`Cantidad del producto ${n}${p ? ` en ${p.unidad_medida}` : ''}`}
                        />
                      </div>
                      <div className="cos-linea-nota">
                        <label className="inv-etiqueta-linea" htmlFor={`receta-nota-${l.clave}`}>
                          Nota<span className="sr-only"> del producto {n}</span> (opcional)
                        </label>
                        <input
                          id={`receta-nota-${l.clave}`}
                          className="input"
                          value={l.notas}
                          onChange={(e) => cambiar(l.clave, { notas: e.target.value })}
                          placeholder="Opcional"
                        />
                      </div>
                      <div className="inv-linea-subtotal num">
                        <span className="inv-etiqueta-linea">Costo</span>
                        <strong>{costo === null ? '—' : costo > 0 && costo < 0.01 ? dineroUnitario(costo) : pesos(costo)}</strong>
                      </div>
                      <div className="inv-linea-quitar">
                        <button type="button" className="btn btn-texto btn-sm adm-texto-peligro" onClick={() => quitar(l.clave)} aria-label={`Quitar el producto ${n}`}>
                          Quitar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <button type="button" className="btn btn-secundario btn-sm" onClick={() => setLineas((xs) => [...(xs ?? []), lineaVacia()])}>
                + Agregar producto
              </button>
            </fieldset>

            <dl className="cos-resumen" aria-live="polite">
              <div>
                <dt>Costo de material</dt>
                <dd className="num">{pesos(total)}</dd>
              </div>
              <div>
                <dt>Precio actual</dt>
                <dd className="num">{precio === null ? <span className="texto-3">Por confirmar</span> : pesos(precio)}</dd>
              </div>
              <div>
                <dt>Margen</dt>
                <dd className={`num ${tonoMargen}`}>
                  {margen === null ? <span className="texto-3">—</span> : pesos(margen)}
                  {margenPct !== null && <span className="cos-resumen-pct"> · {porcentaje(margenPct)}</span>}
                </dd>
              </div>
            </dl>
            {precio === null && <p className="ayuda adm-sin-margen">Cuando el servicio tenga precio (en Catálogo y precios), verás aquí su margen.</p>}
            {margenPct !== null && margenPct < MARGEN_MINIMO_PCT && (
              <p className="aviso aviso-alerta adm-margen-arriba">
                El material se lleva más de la mitad del precio. Revisa las cantidades, el costo de los productos o el precio del servicio.
              </p>
            )}
            <p className="ayuda adm-margen-arriba adm-sin-margen">
              Los costos usan el último precio de compra de cada producto; cambian solos cuando registras una compra nueva.
            </p>
          </>
        )}
        <MensajeError error={error} />
      </div>
      {dialogo}
    </Modal>
  );
}
