// Pestaña «Márgenes» del taller: precio, costo por pieza y margen de cada producto de venta, con lo que
// hay, lo que está curando y lo vendido en 30 días. Marca margen bajo (< 50 %), productos sin costo y los que
// todavía no tienen costo propio (la vista usa el de su fórmula: es un costo estimado).
import { useState } from 'react';
import type { MargenProducto, Producto } from '../../lib/api';
import { numero, porcentaje } from '../../lib/format';
import { Vacio } from '../ui/Estado';
import { Kpi } from './Piezas';
import { pesos } from './InventarioPiezas';
import { MARGEN_MINIMO_PCT } from './CostosReceta';
import { ETIQUETA_CATEGORIA_PRODUCTO, dineroUnitario, porTexto } from './util';

export const sinCosto = (m: MargenProducto) => !(m.costo_unitario > 0);
export const margenBajo = (m: MargenProducto) => !sinCosto(m) && m.margen_pct !== null && m.margen_pct < MARGEN_MINIMO_PCT;
const sinPrecio = (m: MargenProducto) => m.precio_venta === null;

export function TallerMargenes({ margenes, productos = [] }: { margenes: MargenProducto[]; productos?: Producto[] }) {
  const [soloAlertas, setSoloAlertas] = useState(false);
  // v_margen_productos toma el costo del producto (último lote liberado o compra) y, si todavía no tiene,
  // el de su fórmula con los precios actuales de la materia prima: ése es sólo un estimado.
  const costoPropio = new Map(productos.map((p) => [p.id, p.costo_unitario]));
  const estimado = (m: MargenProducto) => !sinCosto(m) && costoPropio.has(m.id) && !((costoPropio.get(m.id) ?? 0) > 0);
  const conAlerta = (m: MargenProducto) => sinCosto(m) || estimado(m) || margenBajo(m) || sinPrecio(m);
  const lista = [...margenes]
    .filter((m) => !soloAlertas || conAlerta(m))
    .sort((a, b) => Number(conAlerta(b)) - Number(conAlerta(a)) || porTexto<MargenProducto>((x) => x.nombre)(a, b));
  const conMargen = margenes.filter((m) => !sinCosto(m) && m.margen_pct !== null);
  const promedio = conMargen.length ? Math.round((conMargen.reduce((s, m) => s + (m.margen_pct ?? 0), 0) / conMargen.length) * 10) / 10 : null;
  const vendidas = margenes.reduce((s, m) => s + m.vendidas_30d, 0);
  const nBajo = margenes.filter(margenBajo).length;
  const nSinCosto = margenes.filter(sinCosto).length;
  const nEstimado = margenes.filter(estimado).length;
  const nSinReal = nSinCosto + nEstimado;

  if (margenes.length === 0)
    return <Vacio titulo="Aún no hay productos de venta">Cuando des de alta jabones, velas u otros productos de venta, verás aquí su margen.</Vacio>;

  return (
    <>
      <div className="adm-kpis inv-kpis">
        <Kpi etiqueta="Margen promedio" valor={promedio === null ? '—' : porcentaje(promedio)} detalle="De los productos con costo y precio" />
        <Kpi etiqueta="Margen bajo" valor={nBajo} detalle={`Menos de ${MARGEN_MINIMO_PCT} % sobre el precio`} tono={nBajo ? 'alerta' : undefined} />
        <Kpi
          etiqueta="Sin costo real"
          valor={nSinReal}
          detalle={
            nEstimado
              ? `${nEstimado} con costo estimado (fórmula)${nSinCosto ? ` · ${nSinCosto} sin costo` : ''}`
              : 'Sin lote liberado ni costo registrado'
          }
          tono={nSinReal ? 'alerta' : undefined}
        />
        <Kpi etiqueta="Vendidas en 30 días" valor={numero(vendidas)} detalle="Piezas, en línea y en mostrador" />
      </div>
      <label className="check pequeno tal-casilla">
        <input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} />
        <span>Sólo los que tienen alguna alerta</span>
      </label>

      {lista.length === 0 ? (
        <Vacio titulo="Ningún producto con alertas">Todos tienen costo, precio y un margen sano.</Vacio>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla inv-tabla inv-tabla-tarjetas tal-tabla-margenes">
            <caption className="sr-only">Margen por pieza de cada producto de venta</caption>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col" className="num">
                  Precio
                </th>
                <th scope="col" className="num">
                  Costo por pieza
                </th>
                <th scope="col" className="num">
                  Margen
                </th>
                <th scope="col" className="num">
                  Margen %
                </th>
                <th scope="col" className="num">
                  Hay
                </th>
                <th scope="col" className="num">
                  En curado
                </th>
                <th scope="col" className="num">
                  Vendidas (30 días)
                </th>
                <th scope="col">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => {
                const sc = sinCosto(m);
                const est = estimado(m);
                const tono = sc || m.margen_pct === null ? '' : m.margen_pct < 0 ? 'cos-negativo' : margenBajo(m) ? 'cos-bajo' : 'cos-bien';
                return (
                  <tr key={m.id}>
                    <td className="inv-celda-titulo">
                      <span className="inv-nombre">{m.nombre}</span>
                      <span className="adm-sub">{ETIQUETA_CATEGORIA_PRODUCTO[m.categoria] ?? m.categoria}</span>
                    </td>
                    <td data-etiqueta="Precio" className="num">
                      {m.precio_venta === null ? <span className="texto-3">Sin precio</span> : pesos(m.precio_venta)}
                    </td>
                    <td data-etiqueta="Costo" className="num">
                      {sc ? <span className="texto-3">Sin costo</span> : dineroUnitario(Math.round(m.costo_unitario * 100) / 100)}
                      {est && <span className="adm-sub">estimado (fórmula)</span>}
                    </td>
                    <td data-etiqueta="Margen" className={`num ${tono}`}>
                      {sc || m.margen === null ? <span className="texto-3">—</span> : pesos(m.margen)}
                    </td>
                    <td data-etiqueta="Margen %" className={`num ${tono}`}>
                      {sc || m.margen_pct === null ? <span className="texto-3">—</span> : porcentaje(m.margen_pct)}
                    </td>
                    <td data-etiqueta="Hay" className="num">
                      {numero(Math.max(0, Math.floor(m.stock_actual)))} pz
                    </td>
                    <td data-etiqueta="En curado" className="num">
                      {m.piezas_en_curado > 0 ? `${numero(m.piezas_en_curado)} pz` : <span className="texto-3">—</span>}
                    </td>
                    <td data-etiqueta="Vendidas 30 d" className="num">
                      {numero(m.vendidas_30d)}
                    </td>
                    <td className="cos-celda-alertas tal-celda-alertas">
                      <span className="sr-only">Alertas: </span>
                      {conAlerta(m) ? (
                        <span className="cos-pills">
                          {sc && <span className="pill pill-error">Sin costo</span>}
                          {est && <span className="pill pill-info">Costo estimado</span>}
                          {margenBajo(m) && <span className="pill pill-alerta">Margen bajo</span>}
                          {sinPrecio(m) && <span className="pill pill-gris">Sin precio</span>}
                        </span>
                      ) : (
                        <span className="pill pill-exito">En orden</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="ayuda inv-nota-pie">
        El costo por pieza es el del último lote liberado (o el de su compra, si es de reventa). «Costo estimado»: todavía no se libera ningún lote; se
        calcula con su fórmula y los precios actuales de la materia prima, así que su margen aún no es real. «Sin costo»: no hay lote liberado, compra
        ni fórmula con qué calcularlo.
      </p>
    </>
  );
}
