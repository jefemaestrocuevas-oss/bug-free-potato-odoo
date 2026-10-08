// Pestaña "Productos" del inventario: existencias, mínimos y costos; alta, edición y ajustes.
import { useState } from 'react';
import type { CategoriaProducto, Producto, Proveedor } from '../../lib/api';
import { Vacio } from '../ui/Estado';
import { InventarioAjuste } from './InventarioAjuste';
import { InventarioFormProducto } from './InventarioFormProducto';
import { CATEGORIAS_PRODUCTO, equivalencia, necesitaReponer, nombrePresentacion, pesos } from './InventarioPiezas';
import { ETIQUETA_CATEGORIA_PRODUCTO, ETIQUETA_USO, cantidadConUnidad, dineroUnitario, porTexto } from './util';

function normal(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

interface Props {
  productos: Producto[];
  proveedores: Proveedor[];
  onCambio: (mensaje: string) => void;
  /** Mientras se recargan los productos no se abren ajustes (el stock mostrado podría ser viejo). */
  recargando?: boolean;
}

export function InventarioProductos({ productos, proveedores, onCambio, recargando = false }: Props) {
  const [categoria, setCategoria] = useState<CategoriaProducto | ''>('');
  const [busqueda, setBusqueda] = useState('');
  const [soloReponer, setSoloReponer] = useState(false);
  const [verInactivos, setVerInactivos] = useState(true);
  const [editando, setEditando] = useState<Producto | 'nuevo' | null>(null);
  const [ajustandoId, setAjustandoId] = useState<string | null>(null);
  // Siempre la versión más reciente del producto (el stock cambia tras cada movimiento).
  const ajustando = ajustandoId ? productos.find((p) => p.id === ajustandoId) ?? null : null;

  const nombresProveedor = new Map(proveedores.map((p) => [p.id, p.nombre]));
  const q = normal(busqueda.trim());
  const filtrados = productos
    .filter((p) => !categoria || p.categoria === categoria)
    .filter((p) => !q || normal(`${p.nombre} ${p.marca ?? ''} ${p.presentacion ?? ''}`).includes(q))
    .filter((p) => !soloReponer || necesitaReponer(p))
    .filter((p) => verInactivos || p.activo)
    .sort((a, b) => Number(b.activo) - Number(a.activo) || porTexto<Producto>((x) => x.nombre)(a, b));
  const inactivos = productos.filter((p) => !p.activo).length;
  const categoriasUsadas = CATEGORIAS_PRODUCTO.filter((c) => productos.some((p) => p.categoria === c));
  const hayFiltro = !!(categoria || q || soloReponer);

  return (
    <>
      <div className="adm-filtros inv-filtros">
        <div className="campo adm-busqueda">
          <label className="etiqueta" htmlFor="inv-buscar">
            Buscar
          </label>
          <input id="inv-buscar" type="search" className="input" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, marca o presentación" />
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="inv-categoria">
            Categoría
          </label>
          <select id="inv-categoria" className="input" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaProducto | '')}>
            <option value="">Todas</option>
            {categoriasUsadas.map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CATEGORIA_PRODUCTO[c]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-primario inv-boton-nuevo" onClick={() => setEditando('nuevo')}>
          + Nuevo producto
        </button>
      </div>
      <div className="fila inv-casillas">
        <label className="check pequeno">
          <input type="checkbox" checked={soloReponer} onChange={(e) => setSoloReponer(e.target.checked)} />
          <span>Sólo los que hay que reponer</span>
        </label>
        {inactivos > 0 && (
          <label className="check pequeno">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
            <span>Mostrar inactivos ({inactivos})</span>
          </label>
        )}
      </div>

      {productos.length === 0 ? (
        <Vacio titulo="Aún no hay productos">
          <p>Da de alta tus insumos de cabina (cera, lociones, desechables…) y los productos que vendes.</p>
          <button type="button" className="btn btn-primario" onClick={() => setEditando('nuevo')}>
            + Nuevo producto
          </button>
        </Vacio>
      ) : filtrados.length === 0 ? (
        <Vacio titulo="Nada coincide con tu búsqueda">
          {hayFiltro && (
            <button
              type="button"
              className="btn btn-texto"
              onClick={() => {
                setCategoria('');
                setBusqueda('');
                setSoloReponer(false);
              }}
            >
              Quitar filtros
            </button>
          )}
        </Vacio>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla inv-tabla inv-tabla-tarjetas inv-tabla-productos">
            <caption className="sr-only">Productos del inventario</caption>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Categoría</th>
                <th scope="col" className="num">
                  Stock
                </th>
                <th scope="col" className="num">
                  Mínimo
                </th>
                <th scope="col" className="num">
                  Costo
                </th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => {
                const reponer = necesitaReponer(p);
                const equiv = equivalencia(p.stock_actual, p);
                const proveedor = p.proveedor_id ? nombresProveedor.get(p.proveedor_id) : null;
                return (
                  <tr key={p.id} className={p.activo ? '' : 'inv-inactivo'}>
                    <td className="inv-celda-titulo">
                      <span className="inv-nombre">{p.nombre}</span>
                      <span className="inv-pills">
                        {reponer && <span className="pill pill-alerta">Reponer</span>}
                        {!p.activo && <span className="pill pill-gris">Inactivo</span>}
                        {p.uso !== 'cabina' && (
                          <span className="pill pill-oro" title={ETIQUETA_USO[p.uso]}>
                            {p.uso === 'venta' ? 'Venta' : 'Cabina y venta'}
                            {p.vendible_en_linea ? ' · en línea' : ''}
                          </span>
                        )}
                      </span>
                      {(p.marca || proveedor) && (
                        <span className="adm-sub">
                          {p.marca && (
                            <>
                              <span className="sr-only">Marca: </span>
                              <span className="inv-marca">{p.marca}</span>
                            </>
                          )}
                          {p.marca && proveedor ? ' · ' : ''}
                          {proveedor && <span title="Proveedor">{proveedor}</span>}
                        </span>
                      )}
                    </td>
                    <td data-etiqueta="Categoría">{ETIQUETA_CATEGORIA_PRODUCTO[p.categoria] ?? p.categoria}</td>
                    <td data-etiqueta="Stock" className="num">
                      <span className="inv-valor">
                        <strong className={reponer ? 'inv-texto-alerta' : ''}>{cantidadConUnidad(p.stock_actual, p.unidad_medida, 3)}</strong>
                        {equiv && <span className="adm-sub">{equiv}</span>}
                      </span>
                    </td>
                    <td data-etiqueta="Mínimo" className="num">
                      {cantidadConUnidad(p.stock_minimo, p.unidad_medida, 3)}
                    </td>
                    <td data-etiqueta="Costo" className="num">
                      <span className="inv-valor">
                        <span>
                          {pesos(p.costo_presentacion)}
                          <span className="texto-3 pequeno"> / {nombrePresentacion(p)}</span>
                        </span>
                        {!(p.unidad_medida === 'pz' && p.contenido_presentacion === 1) && (
                          <span className="adm-sub adm-nowrap">
                            {dineroUnitario(p.costo_unitario)} por {p.unidad_medida}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="adm-celda-acciones inv-celda-acciones">
                      <button type="button" className="btn btn-texto btn-sm" onClick={() => setEditando(p)} aria-label={`Editar ${p.nombre}`}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-secundario btn-sm"
                        onClick={() => setAjustandoId(p.id)}
                        disabled={recargando}
                        aria-label={`Ajuste o merma de ${p.nombre}`}
                      >
                        Ajuste o merma
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="ayuda inv-nota-pie">
        El stock se mueve solo: sube con cada compra, baja con los consumos de cada cita completada (según la receta del servicio) y con las ventas. Para
        corregirlo, usa “Ajuste o merma”.
      </p>

      {editando && (
        <InventarioFormProducto
          producto={editando === 'nuevo' ? null : editando}
          proveedores={proveedores}
          onCerrar={() => setEditando(null)}
          onGuardado={(p, nuevo) => {
            setEditando(null);
            onCambio(nuevo ? `Producto “${p.nombre}” creado. Registra una compra para darle existencia.` : `Cambios de “${p.nombre}” guardados.`);
          }}
        />
      )}
      {ajustando && (
        <InventarioAjuste
          producto={ajustando}
          onCerrar={() => setAjustandoId(null)}
          onListo={(m) => {
            setAjustandoId(null);
            onCambio(m);
          }}
        />
      )}
    </>
  );
}
