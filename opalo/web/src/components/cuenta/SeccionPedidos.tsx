// Mis pedidos: folio, fecha, estado, artículos, total, pagado; instrucciones si falta pagar.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Configuracion, EstadoPedido, PedidoDetalle } from '../../lib/api/tipos';
import { dinero, enlaceWhatsApp, ETIQUETA_ESTADO_PEDIDO, ETIQUETA_METODO_PAGO, fechaCorta, telefonoBonito } from '../../lib/format';
import { useAccion, useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../ui/Estado';
import { Modal } from './Modal';

const PILL_PEDIDO: Record<EstadoPedido, string> = {
  pendiente_pago: 'pill-alerta',
  pagado: 'pill-exito',
  cancelado: 'pill-gris',
  reembolsado: 'pill-info',
};

export function SeccionPedidos({ config }: { config: Configuracion }) {
  const pedidos = useAsync(() => api.getMisPedidos(), []);
  const [aCancelar, setACancelar] = useState<PedidoDetalle | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cancelar = useAccion(async (id: string) => {
    await api.cancelarPedido(id);
    return true;
  });

  if (pedidos.cargando && !pedidos.datos) return <Cargando texto="Cargando tus pedidos…" />;
  if (pedidos.error) return <MensajeError error={pedidos.error} onReintentar={pedidos.recargar} />;
  const lista = [...(pedidos.datos ?? [])].sort((a, b) => b.creado_en.localeCompare(a.creado_en));

  async function confirmarCancelacion() {
    if (!aCancelar) return;
    const p = aCancelar;
    if (!(await cancelar.ejecutar(p.id))) return;
    setACancelar(null);
    setAviso(`Cancelamos tu pedido ${p.folio}.`);
    pedidos.recargar();
  }

  return (
    <div className="cu-seccion">
      <div className="entre cu-seccion-cabeza">
        <h2 className="cu-h2">Mis pedidos</h2>
        <Link className="btn btn-secundario btn-sm" to="/tienda">
          Ir a la tienda
        </Link>
      </div>
      {aviso && (
        <div className="aviso aviso-exito" role="status">
          <span>{aviso}</span>
          <button type="button" className="btn btn-texto btn-sm" onClick={() => setAviso(null)}>
            Cerrar aviso
          </button>
        </div>
      )}
      {lista.length === 0 ? (
        <Vacio titulo="Aún no tienes pedidos">
          <p>
            En la <Link to="/tienda">tienda</Link> puedes comprar servicios, paquetes y productos, también para regalar.
          </p>
        </Vacio>
      ) : (
        <ul className="cu-lista">
          {lista.map((p) => {
            const falta = Math.max(0, Math.round((p.total - p.pagado) * 100) / 100);
            const mensaje = `Hola, Ópalo. Quiero pagar mi pedido ${p.folio} por ${dinero(p.total)}.`;
            return (
              <li key={p.id}>
                <article className="cu-tarjeta" aria-labelledby={`pedido-${p.id}`}>
                  <div className="entre cu-cita-cabeza">
                    <h3 className="cu-cita-titulo" id={`pedido-${p.id}`}>
                      Pedido <span className="num">{p.folio}</span>
                    </h3>
                    <span className={`pill ${PILL_PEDIDO[p.estado] ?? 'pill-gris'}`}>{ETIQUETA_ESTADO_PEDIDO[p.estado] ?? p.estado}</span>
                  </div>
                  <p className="ayuda cu-sin-margen">
                    Hecho el {fechaCorta(p.creado_en)}
                    {p.pagado_en ? ` · pagado el ${fechaCorta(p.pagado_en)}` : ''}
                    {p.metodo_pago_preferido ? ` · pago preferido: ${ETIQUETA_METODO_PAGO[p.metodo_pago_preferido] ?? p.metodo_pago_preferido}` : ''}
                  </p>
                  <ul className="cu-articulos">
                    {p.items.map((it, i) => (
                      <li key={i}>
                        <span>
                          {it.cantidad > 1 ? `${it.cantidad} × ` : ''}
                          {it.descripcion}
                          {it.regalo_para && <span className="cu-detalle">Regalo para {it.regalo_para}</span>}
                        </span>
                        <span className="num">{dinero(it.importe)}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="cu-totales">
                    <div>
                      <dt>Total</dt>
                      <dd className="num">{dinero(p.total)}</dd>
                    </div>
                    <div>
                      <dt>Pagado</dt>
                      <dd className="num">{dinero(p.pagado)}</dd>
                    </div>
                    {p.estado === 'pendiente_pago' && falta > 0 && (
                      <div className="cu-totales-falta">
                        <dt>Por pagar</dt>
                        <dd className="num">{dinero(falta)}</dd>
                      </div>
                    )}
                  </dl>

                  {p.estado === 'pendiente_pago' && (
                    <div className="aviso aviso-info cu-aviso-cita">
                      <div>
                        <p>
                          <strong>¿Cómo pagar?</strong> Todavía no cobramos en línea. Puedes pagar en el spa (efectivo o tarjeta) o por
                          transferencia: escríbenos por WhatsApp y te compartimos los datos. Menciona tu folio <strong>{p.folio}</strong>.
                        </p>
                        <p className="cu-sin-margen">
                          En cuanto registremos tu pago, los servicios aparecerán en la pestaña <Link to="/cuenta/servicios">Servicios</Link>.
                        </p>
                      </div>
                    </div>
                  )}
                  {p.estado === 'pagado' && p.items.some((it) => it.tipo !== 'producto') && (
                    <p className="ayuda cu-sin-margen">
                      Tus servicios ya están en la pestaña <Link to="/cuenta/servicios">Servicios</Link>, listos para reservar o regalar.
                    </p>
                  )}

                  {p.estado === 'pendiente_pago' && (
                    <div className="cu-acciones">
                      <a className="btn btn-primario btn-sm" href={enlaceWhatsApp(config.telefono_whatsapp, mensaje)} target="_blank" rel="noopener noreferrer">
                        Pagar por WhatsApp ({telefonoBonito(config.telefono_whatsapp)})
                      </a>
                      <button
                        type="button"
                        className="btn btn-peligro btn-sm"
                        onClick={() => {
                          cancelar.setError(null);
                          setACancelar(p);
                        }}
                      >
                        Cancelar pedido
                      </button>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {aCancelar && (
        <Modal
          titulo="¿Cancelar tu pedido?"
          onCerrar={() => setACancelar(null)}
          bloqueado={cancelar.enviando}
          pie={
            <>
              <button type="button" className="btn btn-secundario" onClick={() => setACancelar(null)} disabled={cancelar.enviando} data-autofocus>
                No, conservarlo
              </button>
              <button type="button" className="btn btn-peligro" onClick={() => void confirmarCancelacion()} disabled={cancelar.enviando}>
                {cancelar.enviando ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
            </>
          }
        >
          <p>
            Vas a cancelar el pedido <strong>{aCancelar.folio}</strong> por {dinero(aCancelar.total)}. Si cambias de opinión, puedes volver a
            comprar en la tienda.
          </p>
          {cancelar.error && (
            <p className="aviso aviso-error" role="alert">
              {cancelar.error}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
