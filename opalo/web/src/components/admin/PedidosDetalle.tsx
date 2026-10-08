// Pedidos (tienda en línea y ventas de mostrador): tabla, detalle con artículos, registrar pago,
// cancelar y marcar como entregados los productos que se recogen en el spa.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, type ItemPedido, type PedidoDetalle, type TipoItemPedido } from '../../lib/api';
import { dinero, ETIQUETA_METODO_PAGO, fechaCorta, fechaHora, hora } from '../../lib/format';
import { Modal, useConfirmar, type OpcionesConfirmar } from './Modal';
import { PillEstadoPedido } from './Piezas';
import { RegistrarPago } from './RegistrarPago';
import { ETIQUETA_ORIGEN_PEDIDO } from './util';
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

/** Pagado, con productos y todavía sin entregar en el spa (ESPEC §10.3). */
export function pedidoPorEntregar(p: Pick<PedidoDetalle, 'estado' | 'tiene_productos' | 'entregado_en'>): boolean {
  return p.estado === 'pagado' && p.tiene_productos && !p.entregado_en;
}

/** Pill «En línea» / «Mostrador». */
export function PillOrigenPedido({ origen }: { origen: PedidoDetalle['origen'] }) {
  return <span className={`pill ${origen === 'mostrador' ? 'pill-oro' : 'pill-verde'}`}>{ETIQUETA_ORIGEN_PEDIDO[origen] ?? origen}</span>;
}

/** Nombre de la clienta con enlace a su expediente; «Venta de mostrador» (sin enlace) si no hay clienta. */
export function ClientaPedido({ pedido: p, enlace = true }: { pedido: Pick<PedidoDetalle, 'cliente_id' | 'cliente_nombre'>; enlace?: boolean }) {
  if (!p.cliente_id) return <span className="texto-2">{p.cliente_nombre || 'Venta de mostrador'}</span>;
  if (!enlace) return <>{p.cliente_nombre}</>;
  return <Link to={`/admin/clientes/${p.cliente_id}`}>{p.cliente_nombre || 'Ver expediente'}</Link>;
}

/** Opciones de la confirmación «Marcar entregado» (la usan la tabla y el detalle). */
export function confirmacionEntrega(p: PedidoDetalle, onListo: (mensaje: string) => void): OpcionesConfirmar {
  const productos = p.items.filter((i) => i.tipo === 'producto');
  const quien = p.cliente_id ? p.cliente_nombre : 'la clienta';
  return {
    titulo: `¿Ya entregaste el pedido ${p.folio}?`,
    mensaje: (
      <>
        <p>
          Confirma que <strong>{quien}</strong> ya recogió en el spa:
        </p>
        <ul className="adm-lista-alertas">
          {productos.map((i, n) => (
            <li key={`${i.descripcion}-${n}`}>
              {i.cantidad} × {i.descripcion}
            </li>
          ))}
        </ul>
      </>
    ),
    textoBoton: 'Sí, ya se entregó',
    accion: () => api.admin.marcarEntregado(p.id),
    alTerminar: () => onListo(`Pedido ${p.folio} marcado como entregado.`),
  };
}

/** "2 × Bono express, Bikini brasileño y 1 más" */
export function pedidosResumenArticulos(items: ItemPedido[], max = 2): string {
  if (items.length === 0) return 'Sin artículos';
  const partes = items.slice(0, max).map((i) => (i.cantidad > 1 ? `${i.cantidad} × ${i.descripcion}` : i.descripcion));
  const resto = items.length - max;
  return resto > 0 ? `${partes.join(', ')} y ${resto} más` : partes.join(', ');
}

/** Tabla de pedidos (en la página de pedidos y en el expediente). */
export function PedidosTabla({
  pedidos,
  onVer,
  conClienta = true,
  onEntregado,
}: {
  pedidos: PedidoDetalle[];
  onVer: (p: PedidoDetalle) => void;
  conClienta?: boolean;
  /** Si viene, los pedidos por entregar llevan el botón «Marcar entregado» (con confirmación). */
  onEntregado?: (mensaje: string) => void;
}) {
  const { confirmar, dialogo } = useConfirmar();
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
            const entregar = pedidoPorEntregar(p);
            return (
              <tr key={p.id}>
                <td className="adm-pedidos-col-folio adm-clientas-celda-titulo">
                  <span className="adm-pedidos-folio-celda">
                    <button type="button" className="adm-pedidos-folio num" onClick={() => onVer(p)}>
                      {p.folio}
                    </button>
                    <span className="adm-pedidos-origen">
                      <span className="sr-only">Origen: </span>
                      <PillOrigenPedido origen={p.origen} />
                    </span>
                  </span>
                </td>
                <td className="adm-nowrap" data-etiqueta="Fecha">
                  <span className="num">{fechaCorta(p.creado_en)}</span>
                  <span className="adm-sub num">{hora(p.creado_en)}</span>
                </td>
                {conClienta && (
                  <td data-etiqueta="Clienta">
                    <ClientaPedido pedido={p} />
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
                  <span className="adm-pedidos-estado">
                    <PillEstadoPedido estado={p.estado} />
                    {entregar && <span className="pill pill-alerta">Por entregar</span>}
                    {p.estado === 'pagado' && p.tiene_productos && p.entregado_en && <span className="adm-sub">Entregado {fechaCorta(p.entregado_en)}</span>}
                  </span>
                </td>
                <td className="adm-celda-acciones adm-clientas-celda-ancha">
                  <span className="adm-pedidos-acciones">
                    {entregar && onEntregado && (
                      <button type="button" className="btn btn-secundario btn-sm" onClick={() => confirmar(confirmacionEntrega(p, onEntregado))}>
                        Marcar entregado<span className="sr-only"> el pedido {p.folio}</span>
                      </button>
                    )}
                    <button type="button" className="btn btn-texto btn-sm" onClick={() => onVer(p)}>
                      {p.estado === 'pendiente_pago' ? 'Cobrar' : 'Ver'}
                      <span className="sr-only"> el pedido {p.folio}</span>
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {dialogo}
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

/** Dónde y cuándo se entregan los productos: siempre se recogen en el spa (no hay envíos todavía). */
function AvisoEntrega({ pedido: p }: { pedido: PedidoDetalle }) {
  if (!p.tiene_productos || p.estado === 'cancelado' || p.estado === 'reembolsado') return null;
  let contenido: ReactNode;
  let tipo = 'info';
  if (p.estado === 'pendiente_pago') {
    contenido = 'Los productos se recogen en el spa: se entregan cuando el pedido esté pagado (por ahora no hacemos envíos).';
  } else if (!p.entregado_en) {
    tipo = 'alerta';
    contenido = (
      <>
        <strong>Por entregar.</strong> La clienta recoge sus productos en el spa. Cuando se los des, márcalo como entregado.
      </>
    );
  } else {
    tipo = 'exito';
    contenido = p.origen === 'mostrador' ? 'Se entregó en el mostrador al momento de la venta.' : `Productos entregados en el spa el ${fechaHora(p.entregado_en)}.`;
  }
  return (
    <p className={`aviso aviso-${tipo} adm-sin-margen`}>
      <span>{contenido}</span>
    </p>
  );
}

/** Detalle de un pedido en ventana modal, con cobro, cancelación y entrega. */
export function PedidosDetalleModal({ pedido, onCerrar, onCambio, sinEnlaceClienta = false }: PropsDetalle) {
  const [pagando, setPagando] = useState(false);
  // Pago que acaba de liquidar un pedido con productos: el detalle sigue abierto para entregarlos en el acto
  // (la clienta paga en el spa y se los lleva). Mientras, el pedido se muestra ya pagado.
  const [pagoHecho, setPagoHecho] = useState<string | null>(null);
  const p: PedidoDetalle = pagoHecho ? { ...pedido, estado: 'pagado', pagado: Math.max(pedido.pagado, pedido.total) } : pedido;
  const cerrar = () => (pagoHecho ? onCambio(pagoHecho) : onCerrar());
  const { confirmar, dialogo } = useConfirmar();
  const saldo = pedidoSaldo(p);
  const pendiente = p.estado === 'pendiente_pago';
  const conServicios = p.items.some((i) => i.tipo !== 'producto');
  const entregar = pedidoPorEntregar(p);
  const mostrador = p.origen === 'mostrador';

  const cancelar = () =>
    confirmar({
      titulo: `¿Cancelar el pedido ${p.folio}?`,
      mensaje: (
        <>
          <p>
            El pedido de <strong>{p.cliente_id ? p.cliente_nombre : 'mostrador'}</strong> por <strong>{dinero(p.total)}</strong> quedará cancelado y ya no
            se podrá cobrar. Esta acción no se puede deshacer.
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
        onCerrar={cerrar}
        pie={
          <>
            <button type="button" className="btn btn-texto" onClick={cerrar}>
              {pagoHecho ? 'Todavía no, cerrar' : 'Cerrar'}
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
            {entregar && (
              <button
                type="button"
                className="btn btn-primario"
                onClick={() => confirmar(confirmacionEntrega(p, (m) => onCambio(pagoHecho ? `${pagoHecho} ${m}` : m)))}
                data-autofoco
              >
                Marcar entregado
              </button>
            )}
          </>
        }
      >
        <div className="pila">
          {pagoHecho && (
            <p className="aviso aviso-exito adm-sin-margen" role="status">
              <span>
                {pagoHecho} Si {p.cliente_id ? p.cliente_nombre : 'la clienta'} se lleva sus productos ahora, márcalo como entregado.
              </span>
            </p>
          )}
          <dl className="adm-pedidos-datos">
            <div>
              <dt>Clienta</dt>
              <dd>
                <ClientaPedido pedido={p} enlace={!sinEnlaceClienta} />
              </dd>
            </div>
            <div>
              <dt>{mostrador ? 'Fecha de la venta' : 'Fecha del pedido'}</dt>
              <dd className="adm-capitalizar">{fechaHora(p.creado_en)}</dd>
            </div>
            <div>
              <dt>Origen</dt>
              <dd>
                <PillOrigenPedido origen={p.origen} />
              </dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>
                <PillEstadoPedido estado={p.estado} />
              </dd>
            </div>
            <div>
              <dt>{pendiente ? 'Pagará con' : 'Método preferido'}</dt>
              <dd>{p.metodo_pago_preferido ? ETIQUETA_METODO_PAGO[p.metodo_pago_preferido] : 'Sin indicar'}</dd>
            </div>
            {p.pagado_en && (
              <div>
                <dt>Pagado el</dt>
                <dd className="adm-capitalizar">{fechaHora(p.pagado_en)}</dd>
              </div>
            )}
            {p.tiene_productos && p.entregado_en && (
              <div>
                <dt>Entregado el</dt>
                <dd className="adm-capitalizar">{fechaHora(p.entregado_en)}</dd>
              </div>
            )}
          </dl>

          {p.notas && (
            <p className="adm-pedidos-nota">
              <span className="etiqueta">{mostrador ? 'Nota' : 'Nota de la clienta'}</span>“{p.notas}”
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
          <AvisoEntrega pedido={p} />
          {p.estado === 'pagado' && conServicios && (
            <div className="aviso aviso-exito adm-sin-margen">
              <p className="adm-sin-margen">
                Sus servicios ya están activos como servicios prepagados
                {sinEnlaceClienta || !p.cliente_id ? (
                  sinEnlaceClienta ? ' (los ves más abajo en este expediente).' : '.'
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
          onListo={(mensaje, liquidado) => {
            setPagando(false);
            if (liquidado && p.tiene_productos && !p.entregado_en) setPagoHecho(mensaje);
            else onCambio(mensaje);
          }}
        />
      )}
      {dialogo}
    </>
  );
}
