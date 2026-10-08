// Pedidos de la tienda en línea: tabla, detalle con artículos, registrar pago y cancelar.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ItemPedido, type PedidoDetalle, type TipoItemPedido } from '../../lib/api';
import { dinero, ETIQUETA_METODO_PAGO, fechaCorta, fechaHora, hora } from '../../lib/format';
import { Modal, useConfirmar } from './Modal';
import { PillEstadoPedido } from './Piezas';
import { RegistrarPago } from './RegistrarPago';
import './ClientasPiezas.css';
import './PedidosDetalle.css';

const ETIQUETA_TIPO_ITEM: Record<TipoItemPedido, string> = {
  servicio: 'Servicio',
  paquete: 'Paquete',
  producto: 'Producto',
};

export function pedidoSaldo(p: Pick<PedidoDetalle, 'total' | 'pagado'>): number {
  return Math.max(0, Math.round((p.total - p.pagado) * 100) / 100);
}

/** "2 × Bono express, Bikini brasileño y 1 más" */
export function pedidosResumenArticulos(items: ItemPedido[], max = 2): string {
  if (items.length === 0) return 'Sin artículos';
  const partes = items.slice(0, max).map((i) => (i.cantidad > 1 ? `${i.cantidad} × ${i.descripcion}` : i.descripcion));
  const resto = items.length - max;
  return resto > 0 ? `${partes.join(', ')} y ${resto} más` : partes.join(', ');
}

/** Tabla de pedidos (en la página de pedidos y en el expediente). */
export function PedidosTabla({ pedidos, onVer, conClienta = true }: { pedidos: PedidoDetalle[]; onVer: (p: PedidoDetalle) => void; conClienta?: boolean }) {
  return (
    <div className="tabla-envoltura adm-clientas-envoltura">
      <table className="tabla adm-pedidos-tabla adm-clientas-adaptable">
        <thead>
          <tr>
            <th>Folio</th>
            <th>Fecha</th>
            {conClienta && <th>Clienta</th>}
            <th>Artículos</th>
            <th className="num">Total</th>
            <th className="num">Pagado</th>
            <th>Estado</th>
            <th>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => {
            const saldo = pedidoSaldo(p);
            const regalo = p.items.some((i) => i.regalo_para);
            return (
              <tr key={p.id}>
                <td className="adm-pedidos-col-folio adm-clientas-celda-titulo">
                  <button type="button" className="adm-pedidos-folio num" onClick={() => onVer(p)}>
                    {p.folio}
                  </button>
                </td>
                <td className="adm-nowrap" data-etiqueta="Fecha">
                  <span className="num">{fechaCorta(p.creado_en)}</span>
                  <span className="adm-sub num">{hora(p.creado_en)}</span>
                </td>
                {conClienta && (
                  <td data-etiqueta="Clienta">
                    <Link to={`/admin/clientes/${p.cliente_id}`}>{p.cliente_nombre || 'Clienta'}</Link>
                  </td>
                )}
                <td className="adm-pedidos-col-articulos adm-clientas-celda-ancha" data-etiqueta="Artículos">
                  {pedidosResumenArticulos(p.items)}
                  {regalo && <span className="pill pill-oro adm-pedidos-pill-junto">Incluye regalo</span>}
                </td>
                <td className="num adm-nowrap" data-etiqueta="Total">
                  {dinero(p.total)}
                </td>
                <td className="num adm-nowrap" data-etiqueta="Pagado">
                  {dinero(p.pagado)}
                  {p.estado === 'pendiente_pago' && saldo > 0 && p.pagado > 0 && <span className="adm-sub">Falta {dinero(saldo)}</span>}
                </td>
                <td data-etiqueta="Estado">
                  <PillEstadoPedido estado={p.estado} />
                </td>
                <td className="adm-celda-acciones adm-clientas-celda-ancha">
                  <button type="button" className="btn btn-texto btn-sm" onClick={() => onVer(p)}>
                    {p.estado === 'pendiente_pago' ? 'Cobrar' : 'Ver'}
                    <span className="sr-only"> el pedido {p.folio}</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface PropsDetalle {
  pedido: PedidoDetalle;
  onCerrar: () => void;
  /** Después de registrar un pago o cancelar: el padre cierra, recarga y muestra el mensaje. */
  onCambio: (mensaje: string) => void;
  /** Oculta el enlace al expediente (cuando ya estás en él). */
  sinEnlaceClienta?: boolean;
}

/** Detalle de un pedido en ventana modal, con cobro y cancelación. */
export function PedidosDetalleModal({ pedido: p, onCerrar, onCambio, sinEnlaceClienta = false }: PropsDetalle) {
  const [pagando, setPagando] = useState(false);
  const { confirmar, dialogo } = useConfirmar();
  const saldo = pedidoSaldo(p);
  const pendiente = p.estado === 'pendiente_pago';
  const conServicios = p.items.some((i) => i.tipo !== 'producto');

  const cancelar = () =>
    confirmar({
      titulo: `¿Cancelar el pedido ${p.folio}?`,
      mensaje: (
        <>
          <p>
            El pedido de <strong>{p.cliente_nombre || 'la clienta'}</strong> por <strong>{dinero(p.total)}</strong> quedará cancelado y ya no se podrá
            cobrar. Esta acción no se puede deshacer.
          </p>
          {p.pagado > 0 && (
            <p className="aviso aviso-alerta">
              Ya tiene {dinero(p.pagado)} en pagos registrados. Cancelarlo no los devuelve: acuerda el reembolso con la clienta.
            </p>
          )}
        </>
      ),
      textoBoton: 'Sí, cancelar pedido',
      peligro: true,
      accion: () => api.admin.cancelarPedido(p.id),
      alTerminar: () => onCambio(`El pedido ${p.folio} quedó cancelado.`),
    });

  return (
    <>
      <Modal
        titulo={`Pedido ${p.folio}`}
        ancho="amplio"
        onCerrar={onCerrar}
        pie={
          <>
            <button type="button" className="btn btn-texto" onClick={onCerrar}>
              Cerrar
            </button>
            {pendiente && (
              <>
                <button type="button" className="btn btn-peligro" onClick={cancelar}>
                  Cancelar pedido
                </button>
                <button type="button" className="btn btn-primario" onClick={() => setPagando(true)} data-autofoco>
                  Registrar pago
                </button>
              </>
            )}
          </>
        }
      >
        <div className="pila">
          <dl className="adm-pedidos-datos">
            <div>
              <dt>Clienta</dt>
              <dd>{sinEnlaceClienta ? p.cliente_nombre : <Link to={`/admin/clientes/${p.cliente_id}`}>{p.cliente_nombre || 'Ver expediente'}</Link>}</dd>
            </div>
            <div>
              <dt>Fecha del pedido</dt>
              <dd className="adm-capitalizar">{fechaHora(p.creado_en)}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>
                <PillEstadoPedido estado={p.estado} />
              </dd>
            </div>
            <div>
              <dt>Pagará con</dt>
              <dd>{p.metodo_pago_preferido ? ETIQUETA_METODO_PAGO[p.metodo_pago_preferido] : 'Sin indicar'}</dd>
            </div>
            {p.pagado_en && (
              <div>
                <dt>Pagado el</dt>
                <dd className="adm-capitalizar">{fechaHora(p.pagado_en)}</dd>
              </div>
            )}
          </dl>

          {p.notas && (
            <p className="adm-pedidos-nota">
              <span className="etiqueta">Nota de la clienta</span>“{p.notas}”
            </p>
          )}

          <div className="tabla-envoltura adm-pedidos-items-envoltura">
            <table className="tabla adm-pedidos-items">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th className="num">Cant.</th>
                  <th className="num">Precio</th>
                  <th className="num">Importe</th>
                </tr>
              </thead>
              <tbody>
                {p.items.map((i, n) => (
                  <tr key={`${i.descripcion}-${n}`}>
                    <td>
                      <span className="adm-pedidos-articulo">{i.descripcion}</span>
                      <span className="adm-sub">
                        {ETIQUETA_TIPO_ITEM[i.tipo]}
                        {i.regalo_para && (
                          <>
                            {' · '}
                            <strong className="adm-pedidos-regalo">Para regalo: {i.regalo_para}</strong>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="num" data-etiqueta="Cant.">
                      {i.cantidad}
                    </td>
                    <td className="num adm-nowrap" data-etiqueta="Precio">
                      {dinero(i.precio_unitario)}
                    </td>
                    <td className="num adm-nowrap" data-etiqueta="Importe">
                      {dinero(i.importe)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="adm-totales adm-pedidos-totales">
            <div>
              <dt>Total</dt>
              <dd className="num">{dinero(p.total)}</dd>
            </div>
            <div>
              <dt>Pagado</dt>
              <dd className="num">{dinero(p.pagado)}</dd>
            </div>
            {p.estado !== 'cancelado' && (
              <div>
                <dt>Saldo</dt>
                <dd className="num">
                  <strong>{dinero(saldo)}</strong>
                </dd>
              </div>
            )}
          </dl>

          {pendiente && (
            <p className="aviso aviso-info adm-sin-margen">
              Se paga en el spa o por transferencia. Cuando los pagos cubren el total, el pedido queda pagado
              {conServicios ? ' y sus servicios y paquetes se activan como servicios prepagados de la clienta (los regalos reciben su código para compartir)' : ''}
              {p.items.some((i) => i.tipo === 'producto') ? '; los productos se descuentan del inventario' : ''}.
            </p>
          )}
          {p.estado === 'pagado' && conServicios && (
            <div className="aviso aviso-exito adm-sin-margen">
              <p className="adm-sin-margen">
                Sus servicios ya están activos como servicios prepagados
                {sinEnlaceClienta ? (
                  ' (los ves más abajo en este expediente).'
                ) : (
                  <>
                    {' '}
                    en su <Link to={`/admin/clientes/${p.cliente_id}`}>expediente</Link>.
                  </>
                )}
              </p>
            </div>
          )}
          {p.estado === 'cancelado' && <p className="aviso aviso-info adm-sin-margen">Este pedido está cancelado: ya no se puede cobrar.</p>}
        </div>
      </Modal>

      {pagando && (
        <RegistrarPago
          destino={{ tipo: 'pedido', id: p.id, descripcion: `Pedido ${p.folio} · ${p.cliente_nombre}` }}
          total={p.total}
          pagado={p.pagado}
          metodoSugerido={p.metodo_pago_preferido}
          soloProductos={!conServicios}
          onCerrar={() => setPagando(false)}
          onListo={(mensaje) => {
            setPagando(false);
            onCambio(mensaje);
          }}
        />
      )}
      {dialogo}
    </>
  );
}
