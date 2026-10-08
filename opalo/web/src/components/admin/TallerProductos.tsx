// Pestaña «Productos de la tienda» del taller: jabones, velas, sets y otros productos de venta,
// con su ilustración (o foto), precio, piezas disponibles, piezas en curado y si se ven en línea.
import { useState } from 'react';
import { Link, useHref } from 'react-router-dom';
import type { Lote, Producto } from '../../lib/api';
import { fechaCorta, numero } from '../../lib/format';
import { Vacio } from '../ui/Estado';
import { pesos } from './InventarioPiezas';
import { MiniaturaProducto, curadoCubre, curadoPorProducto, esDeVenta, esTerminado, textoLoteEnCurado } from './TallerPiezas';
import { ETIQUETA_CATEGORIA_PRODUCTO, porTexto } from './util';

type Filtro = '' | 'jabon' | 'vela' | 'set' | 'otros';
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: '', texto: 'Todos' },
  { id: 'jabon', texto: 'Jabones' },
  { id: 'vela', texto: 'Velas' },
  { id: 'set', texto: 'Sets' },
  { id: 'otros', texto: 'Otros de venta' },
];

const normal = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Se ve en la tienda en línea: activo, a la venta en línea y con precio. */
export function publicadoEnLinea(p: Pick<Producto, 'activo' | 'vendible_en_linea' | 'precio_venta'>): boolean {
  return p.activo && p.vendible_en_linea && p.precio_venta !== null;
}

/** Abre la ficha pública en otra pestaña (con la ruta que use el sitio: normal o con #). */
function VerEnTienda({ slug, nombre }: { slug: string; nombre: string }) {
  const href = useHref(`/tienda/${slug}`);
  return (
    <a className="btn btn-texto btn-sm" href={href} target="_blank" rel="noreferrer">
      Ver en la tienda<span className="sr-only"> {nombre} (se abre en otra pestaña)</span>
    </a>
  );
}

interface Props {
  productos: Producto[];
  lotes: Lote[];
  onEditar: (p: Producto | 'nuevo') => void;
}

export function TallerProductos({ productos, lotes, onEditar }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('');
  const [busqueda, setBusqueda] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);

  // Piezas en curado y fecha del próximo lote, por producto.
  const curado = curadoPorProducto(lotes);

  const deVenta = productos.filter(esDeVenta);
  const inactivos = deVenta.filter((p) => !p.activo).length;
  const q = normal(busqueda.trim());
  const visibles = deVenta
    .filter((p) => verInactivos || p.activo)
    .filter((p) => (!filtro ? true : filtro === 'otros' ? !esTerminado(p.categoria) : p.categoria === filtro))
    .filter((p) => !q || normal(`${p.nombre} ${p.aroma ?? ''} ${p.slug ?? ''}`).includes(q))
    .sort(
      (a, b) =>
        Number(b.activo) - Number(a.activo) ||
        Number(esTerminado(b.categoria)) - Number(esTerminado(a.categoria)) ||
        Number(b.destacado) - Number(a.destacado) ||
        a.orden - b.orden ||
        porTexto<Producto>((x) => x.nombre)(a, b),
    );

  return (
    <>
      <div className="adm-filtros tal-filtros">
        <div className="campo adm-busqueda">
          <label className="etiqueta" htmlFor="tal-buscar">
            Buscar
          </label>
          <input id="tal-buscar" type="search" className="input" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o aroma" />
        </div>
        <div className="tal-chips" role="group" aria-label="Filtrar por tipo">
          {FILTROS.map((f) => (
            <button key={f.id || 'todos'} type="button" className={`tal-chip ${filtro === f.id ? 'tal-chip-activo' : ''}`} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
              {f.texto}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primario tal-boton-nuevo" onClick={() => onEditar('nuevo')}>
          + Nuevo producto
        </button>
      </div>
      {inactivos > 0 && (
        <label className="check pequeno tal-casilla">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          <span>Mostrar inactivos ({inactivos})</span>
        </label>
      )}

      {deVenta.length === 0 ? (
        <Vacio titulo="Aún no hay productos en la tienda">
          <p>Da de alta tus jabones, velas y sets: su ficha es lo que verán las clientas en la tienda.</p>
          <button type="button" className="btn btn-primario" onClick={() => onEditar('nuevo')}>
            + Nuevo producto
          </button>
        </Vacio>
      ) : visibles.length === 0 ? (
        <Vacio titulo="Nada coincide con tu búsqueda">
          <button
            type="button"
            className="btn btn-texto"
            onClick={() => {
              setFiltro('');
              setBusqueda('');
            }}
          >
            Quitar filtros
          </button>
        </Vacio>
      ) : (
        <ul className="tal-productos">
          {visibles.map((p) => {
            const c = curado.get(p.id);
            const stock = Math.max(0, Math.floor(p.stock_actual));
            const enLinea = publicadoEnLinea(p);
            return (
              <li key={p.id} className={`tal-producto ${p.activo ? '' : 'tal-inactivo'}`}>
                <MiniaturaProducto producto={p} className="tal-producto-imagen" />
                <div className="tal-producto-cuerpo">
                  <div className="tal-producto-cabeza">
                    <h3 className="tal-producto-nombre">{p.nombre}</h3>
                    <span className="tal-producto-precio num">{p.precio_venta !== null ? pesos(p.precio_venta) : <span className="texto-3">Sin precio</span>}</span>
                  </div>
                  <p className="adm-sub adm-sin-margen">
                    {ETIQUETA_CATEGORIA_PRODUCTO[p.categoria]}
                    {p.aroma ? ` · ${p.aroma}` : ''}
                    {p.contenido_neto ? ` · ${p.contenido_neto}` : ''}
                  </p>
                  <dl className="tal-producto-cifras">
                    <div>
                      <dt>Disponibles</dt>
                      <dd className={`num ${stock === 0 ? 'tal-agotado' : ''}`}>{stock === 0 ? 'Agotado' : `${numero(stock)} pz`}</dd>
                    </div>
                    <div>
                      <dt>En curado</dt>
                      <dd className="num">
                        {c ? (
                          <>
                            {numero(c.piezas)} pz<span className="adm-sub">listo {fechaCorta(c.listo)}</span>
                          </>
                        ) : (
                          <span className="texto-3">—</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div className="tal-pills">
                    {enLinea ? <span className="pill pill-exito">En la tienda en línea</span> : <span className="pill pill-gris">No se publica en línea</span>}
                    {p.destacado && <span className="pill pill-oro">Destacado</span>}
                    {p.hecho_en_opalo && <span className="pill pill-verde">Hecho en Ópalo</span>}
                    {!p.activo && <span className="pill pill-gris">Inactivo</span>}
                    {p.activo &&
                      stock <= p.stock_minimo &&
                      (esTerminado(p.categoria) && curadoCubre(stock, p.stock_minimo, c) ? (
                        <span className="pill pill-info">{textoLoteEnCurado(c)}</span>
                      ) : (
                        <span className="pill pill-alerta">{esTerminado(p.categoria) ? 'Hacer otro lote' : 'Reponer'}</span>
                      ))}
                  </div>
                  <div className="tal-producto-acciones">
                    <button type="button" className="btn btn-secundario btn-sm" onClick={() => onEditar(p)}>
                      Editar ficha<span className="sr-only"> de {p.nombre}</span>
                    </button>
                    {enLinea && p.slug && <VerEnTienda slug={p.slug} nombre={p.nombre} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="ayuda inv-nota-pie">
        Las piezas disponibles suben al liberar un lote y bajan con cada venta (en línea o en el mostrador). La materia prima se maneja en{' '}
        <Link to="/admin/inventario">Inventario</Link>.
      </p>
    </>
  );
}
