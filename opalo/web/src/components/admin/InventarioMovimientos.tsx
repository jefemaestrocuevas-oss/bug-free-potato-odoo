// Pestaña "Movimientos": historial de entradas y salidas (no se edita ni se borra).
import { useState } from 'react';
import { api, type Producto, type TipoMovimiento } from '../../lib/api';
import { fechaCorta, hora } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../ui/Estado';
import { PillMovimiento, SelectorProducto, cantidadConSigno, pesos } from './InventarioPiezas';
import { ETIQUETA_MOVIMIENTO, dineroUnitario } from './util';

const LIMITE = 200;
const TIPOS = Object.keys(ETIQUETA_MOVIMIENTO) as TipoMovimiento[];

export function InventarioMovimientos({ productos, version }: { productos: Producto[]; version: number }) {
  const [productoId, setProductoId] = useState('');
  const [tipo, setTipo] = useState<TipoMovimiento | ''>('');
  const movs = useAsync(() => api.admin.getMovimientos(productoId || null, LIMITE), [productoId, version]);
  const porId = new Map(productos.map((p) => [p.id, p]));
  const lista = (movs.datos ?? []).filter((m) => !tipo || m.tipo === tipo);

  return (
    <>
      <div className="adm-filtros">
        <div className="campo adm-busqueda">
          <label className="etiqueta" htmlFor="mov-producto">
            Producto
          </label>
          <SelectorProducto id="mov-producto" productos={productos} valor={productoId} onCambio={setProductoId} textoVacio="Todos los productos" incluirInactivos />
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="mov-tipo">
            Tipo
          </label>
          <select id="mov-tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimiento | '')}>
            <option value="">Todos</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_MOVIMIENTO[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {movs.cargando && !movs.datos && <Cargando texto="Cargando movimientos…" />}
      <MensajeError error={movs.error} onReintentar={movs.recargar} />
      {movs.datos &&
        (lista.length === 0 ? (
          <Vacio titulo={movs.datos.length === 0 ? 'Sin movimientos todavía' : 'Ningún movimiento de ese tipo'}>
            {movs.datos.length === 0 ? 'Aquí verás cada compra, consumo en cita, venta, ajuste y merma.' : 'Prueba con otro tipo o quita el filtro.'}
          </Vacio>
        ) : (
          <div className={movs.cargando ? 'inv-recargando' : ''}>
            <div className="tabla-envoltura">
              <table className="tabla inv-tabla inv-tabla-tarjetas">
                <caption className="sr-only">Movimientos de inventario, del más reciente al más antiguo</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Producto</th>
                    <th scope="col">Tipo</th>
                    <th scope="col" className="num">
                      Cantidad
                    </th>
                    <th scope="col" className="num">
                      Costo
                    </th>
                    <th scope="col">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((m) => {
                    const p = porId.get(m.producto_id);
                    const unidad = p?.unidad_medida ?? null;
                    const valor = m.costo_unitario !== null ? Math.abs(m.cantidad) * m.costo_unitario : null;
                    return (
                      <tr key={m.id}>
                        <td className="inv-celda-titulo inv-celda-fecha">
                          <span className="num adm-nowrap">
                            {fechaCorta(m.creado_en)} · {hora(m.creado_en)}
                          </span>
                        </td>
                        <td data-etiqueta="Producto">{m.producto_nombre || p?.nombre || '—'}</td>
                        <td data-etiqueta="Tipo">
                          <PillMovimiento tipo={m.tipo} />
                        </td>
                        <td data-etiqueta="Cantidad" className="num">
                          <strong className={m.cantidad > 0 ? 'inv-entra' : m.cantidad < 0 ? 'inv-sale' : ''}>{cantidadConSigno(m.cantidad, unidad)}</strong>
                        </td>
                        <td data-etiqueta="Costo" className="num">
                          {m.costo_unitario !== null ? (
                            <span className="inv-valor">
                              <span className="adm-nowrap">
                                {dineroUnitario(m.costo_unitario)}
                                {unidad ? ` / ${unidad}` : ''}
                              </span>
                              {valor !== null && valor > 0 && <span className="adm-sub adm-nowrap">≈ {pesos(valor)} en total</span>}
                            </span>
                          ) : (
                            <span className="texto-3">—</span>
                          )}
                        </td>
                        <td data-etiqueta="Nota" className="inv-celda-nota">
                          {m.nota ?? <span className="texto-3">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="ayuda inv-nota-pie">
              {movs.datos.length >= LIMITE ? `Se muestran los últimos ${LIMITE} movimientos. ` : ''}
              Los movimientos no se editan ni se borran: para corregir, registra un ajuste desde la pestaña “Productos”.
            </p>
          </div>
        ))}
    </>
  );
}
