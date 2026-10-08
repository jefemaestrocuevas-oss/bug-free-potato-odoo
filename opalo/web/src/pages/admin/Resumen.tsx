import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { dinero, fechaCorta, fechaLarga, fechaLocal, hora, isoDesdeLocal, numero, sumarDias } from '../../lib/format';
import { useSesion } from '../../lib/sesion';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { Bloque, EncabezadoAdmin, Kpi, PillEstadoCita, PillFirma } from '../../components/admin/Piezas';
import { cantidadConUnidad } from '../../components/admin/util';
import { curadoCubre, curadoPorProducto, esTerminado, textoFaltan, textoLoteEnCurado } from '../../components/admin/TallerPiezas';
import './paginas.css';

const ESTADO_GASTO = {
  vencido: { clase: 'pill-error', texto: 'Vencido' },
  proximo: { clase: 'pill-alerta', texto: 'Próximo' },
  al_corriente: { clase: 'pill-exito', texto: 'Al corriente' },
} as const;

export default function Resumen() {
  const { sesion, esAdmin } = useSesion();
  const hoy = fechaLocal();
  const resumen = useAsync(() => api.admin.getResumenHoy(), []);
  const porRevisar = useAsync(
    () => api.admin.getAgenda(hoy, sumarDias(hoy, 90)).then((cs) => cs.filter((c) => c.requiere_revision && c.estado === 'pendiente')),
    [hoy],
  );
  // Para distinguir lo que se compra de lo que se hace en el taller (jabones, velas y sets).
  const productos = useAsync(() => api.admin.getProductos().catch(() => []), []);
  const delTaller = new Set((productos.datos ?? []).filter((p) => esTerminado(p.categoria)).map((p) => p.id));
  // Lotes que ya curan: si alcanzan para pasar del mínimo, no hace falta otro lote (sólo esperar).
  const curando = useAsync(() => Promise.resolve().then(() => api.admin.getLotes('en_curado')).catch(() => []), []);
  const curado = curadoPorProducto(curando.datos ?? []);
  const r = resumen.datos;
  const nombre = sesion?.cliente?.nombre?.split(' ')[0];
  const citasActivas = r?.citas_hoy.filter((c) => c.estado !== 'cancelada') ?? [];
  const sinFirma = citasActivas.filter((c) => c.consentimientos_firmados === 0 && ['pendiente', 'confirmada', 'en_curso'].includes(c.estado)).length;

  return (
    <div className="adm-pagina">
      <EncabezadoAdmin titulo={nombre ? `Hola, ${nombre}` : 'Resumen del día'} descripcion={`Hoy es ${fechaLarga(isoDesdeLocal(hoy, '12:00'))}.`}>
        <Link className="btn btn-primario" to="/admin/agenda">
          Ir a la agenda
        </Link>
      </EncabezadoAdmin>

      {resumen.cargando && !r && <Cargando texto="Preparando el resumen…" />}
      <MensajeError error={resumen.error} onReintentar={resumen.recargar} />

      {r && (
        <>
          <div className="adm-kpis adm-kpis-hoy">
            <Kpi
              etiqueta="Citas de hoy"
              valor={citasActivas.length}
              detalle={
                citasActivas.length === 0
                  ? 'Sin citas por ahora'
                  : sinFirma
                    ? `${sinFirma} ${sinFirma === 1 ? 'falta' : 'faltan'} de firmar en cabina`
                    : 'Todas con firma'
              }
              tono={sinFirma ? 'alerta' : undefined}
            />
            <Kpi etiqueta="Por revisar" valor={r.por_revisar} detalle="Citas pendientes por la ficha de salud" tono={r.por_revisar ? 'alerta' : undefined} />
            <Kpi etiqueta="Pedidos por cobrar" valor={r.pedidos_pendientes} detalle="Pendientes de pago" />
            <Kpi
              etiqueta="Por entregar"
              valor={r.pedidos_por_entregar}
              detalle="Pedidos pagados que se recogen en el spa"
              tono={r.pedidos_por_entregar ? 'alerta' : undefined}
            />
            <Kpi etiqueta="Hay que reponer" valor={r.reposicion.length} detalle={r.reposicion.length === 1 ? 'producto' : 'productos'} tono={r.reposicion.length ? 'alerta' : undefined} />
          </div>

          {esAdmin && r.mes_actual && (
            <section aria-labelledby="titulo-mes" className="adm-seccion-mes">
              <div className="entre">
                <h2 id="titulo-mes" className="adm-subtitulo">
                  Este mes
                </h2>
                <Link className="btn btn-texto btn-sm" to="/admin/resultados">
                  Ver resultados →
                </Link>
              </div>
              <div className="adm-kpis">
                <Kpi etiqueta="Ingresos" valor={dinero(r.mes_actual.ingresos)} detalle={`Propinas aparte: ${dinero(r.mes_actual.propinas)}`} />
                <Kpi
                  etiqueta="Gastos y costos"
                  valor={dinero(r.mes_actual.gastos + r.mes_actual.costo_insumos + r.mes_actual.costo_ventas + r.mes_actual.mermas)}
                  detalle={`Gastos ${dinero(r.mes_actual.gastos)} · insumos ${dinero(r.mes_actual.costo_insumos)} · lo vendido ${dinero(r.mes_actual.costo_ventas)}${
                    r.mes_actual.mermas ? ` · mermas ${dinero(r.mes_actual.mermas)}` : ''
                  }`}
                />
                <Kpi
                  etiqueta="Utilidad"
                  valor={dinero(r.mes_actual.utilidad)}
                  detalle="Ingresos − costos − gastos"
                  tono={r.mes_actual.utilidad < 0 ? 'error' : r.mes_actual.utilidad > 0 ? 'exito' : undefined}
                />
              </div>
            </section>
          )}

          <Bloque titulo="Citas de hoy" id="b-hoy" enlace={{ to: `/admin/agenda?fecha=${hoy}`, texto: 'Ver agenda' }}>
            {sinFirma > 0 && (
              <p className="aviso aviso-alerta adm-res-firma">
                <span>
                  <strong>
                    {sinFirma === 1 ? 'A 1 cita le falta la firma' : `A ${sinFirma} citas les falta la firma`} del consentimiento.
                  </strong>{' '}
                  La firma se hace en la tablet de la cabina antes de empezar: abre la cita en la agenda y toca «Firmar en cabina».
                </span>
              </p>
            )}
            {r.citas_hoy.length === 0 ? (
              <Vacio titulo="No hay citas para hoy">Cuando alguien reserve, aparecerá aquí.</Vacio>
            ) : (
              // En pantallas angostas cada cita es una tarjeta: «10:00–11:00 · Clienta», y abajo estado y firma.
              <div className="tabla-envoltura adm-hoy-envoltura">
                <table className="tabla adm-hoy">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Clienta</th>
                      <th>Servicios</th>
                      <th>Atiende</th>
                      <th>Estado</th>
                      <th>Firma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.citas_hoy.map((c) => {
                      const sinFirmaQueAplique = c.estado === 'cancelada' || c.estado === 'no_asistio';
                      return (
                        <tr key={c.id}>
                          <td className="adm-nowrap adm-hoy-hora">
                            <span className="num">
                              {hora(c.inicio)}–{hora(c.fin)}
                            </span>
                          </td>
                          <td className="adm-hoy-clienta">
                            <Link to={`/admin/clientes/${c.cliente_id}`}>{c.cliente_nombre}</Link>
                            {c.primera_vez && <span className="pill pill-oro adm-pill-junto">Primera vez</span>}
                          </td>
                          <td className="adm-hoy-servicios">{c.items.map((i) => i.nombre).join(', ')}</td>
                          <td className="adm-hoy-atiende" data-etiqueta="Atiende">
                            {c.personal_nombre}
                          </td>
                          <td className="adm-hoy-estado">
                            <PillEstadoCita estado={c.estado} />
                          </td>
                          <td className={sinFirmaQueAplique ? 'adm-hoy-firma adm-hoy-firma-vacia' : 'adm-hoy-firma'}>
                            {sinFirmaQueAplique ? (
                              <span className="texto-3">—</span>
                            ) : c.consentimientos_firmados > 0 || c.estado === 'completada' ? (
                              <PillFirma firmados={c.consentimientos_firmados} />
                            ) : (
                              <span className="adm-res-falta-firma">
                                <PillFirma firmados={0} />
                                <Link to={`/admin/agenda?fecha=${hoy}`} className="adm-res-firmar">
                                  Firmar en cabina<span className="sr-only"> la cita de {c.cliente_nombre}</span>
                                </Link>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Bloque>

          <div className="adm-rejilla-2">
            <Bloque titulo="Citas por revisar" id="b-revisar" enlace={{ to: '/admin/agenda', texto: 'Agenda' }}>
              <p className="ayuda">La clienta marcó algo en su ficha de salud. Revísalo con ella por WhatsApp y confirma o reprograma.</p>
              {porRevisar.cargando && !porRevisar.datos && <Cargando />}
              <MensajeError error={porRevisar.error} onReintentar={porRevisar.recargar} />
              {porRevisar.datos && porRevisar.datos.length === 0 && <Vacio titulo="Nada por revisar" />}
              {porRevisar.datos && porRevisar.datos.length > 0 && (
                <ul className="adm-lista">
                  {porRevisar.datos.slice(0, 6).map((c) => (
                    <li key={c.id} className="adm-lista-item adm-lista-item-arriba">
                      <div>
                        <Link to={`/admin/agenda?fecha=${fechaLocal(new Date(c.inicio))}`}>
                          <strong>{c.cliente_nombre}</strong>
                        </Link>
                        <span className="adm-sub">
                          {fechaCorta(c.inicio)} · {hora(c.inicio)} · {c.items.map((i) => i.nombre).join(', ')}
                        </span>
                        {c.alertas.length > 0 && (
                          <ul className="adm-lista-alertas pequeno">
                            {c.alertas.map((a) => (
                              <li key={a}>{a}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <span className="pill pill-alerta">Por confirmar</span>
                    </li>
                  ))}
                </ul>
              )}
            </Bloque>

            <Bloque titulo="Hay que reponer" id="b-reponer" enlace={{ to: '/admin/inventario?pestana=reposicion', texto: 'Lista de compra' }}>
              {r.reposicion.length === 0 ? (
                <Vacio titulo="Todo en orden">Ningún producto está por debajo de su mínimo.</Vacio>
              ) : (
                <ul className="adm-lista">
                  {r.reposicion.slice(0, 6).map((p) => (
                    <li key={p.id} className="adm-lista-item">
                      <div>
                        <strong>{p.nombre}</strong>
                        <span className="adm-sub">
                          Quedan {cantidadConUnidad(p.stock_actual, p.unidad_medida)} · mínimo {cantidadConUnidad(p.stock_minimo, p.unidad_medida)}
                        </span>
                      </div>
                      {delTaller.has(p.id) && curadoCubre(p.stock_actual, p.stock_minimo, curado.get(p.id)) ? (
                        <span className="pequeno texto-2">{textoLoteEnCurado(curado.get(p.id)!)}</span>
                      ) : delTaller.has(p.id) ? (
                        <Link className="adm-nowrap pequeno" to="/admin/taller?pestana=lotes">
                          Hacer otro lote
                        </Link>
                      ) : (
                        <span className="num adm-nowrap">
                          {p.presentaciones_sugeridas} × {p.presentacion ?? 'presentación'}
                        </span>
                      )}
                    </li>
                  ))}
                  {r.reposicion.length > 6 && <li className="adm-lista-item texto-3">y {r.reposicion.length - 6} más…</li>}
                </ul>
              )}
            </Bloque>

            {esAdmin && (
              <Bloque titulo="Gastos por vencer" id="b-gastos" enlace={{ to: '/admin/gastos', texto: 'Gastos' }}>
                {r.gastos_por_vencer.length === 0 ? (
                  <Vacio titulo="Nada por vencer esta semana" />
                ) : (
                  <ul className="adm-lista">
                    {r.gastos_por_vencer.map((g) => (
                      <li key={g.id} className="adm-lista-item">
                        <div>
                          <strong>{g.concepto}</strong>
                          <span className="adm-sub">
                            {g.proximo_vencimiento ? `Vence ${fechaCorta(g.proximo_vencimiento)}` : 'Sin fecha'}
                            {g.dias_restantes !== null && g.dias_restantes >= 0 ? ` · en ${g.dias_restantes} ${g.dias_restantes === 1 ? 'día' : 'días'}` : ''}
                            {' · '}
                            {g.monto_estimado !== null ? dinero(g.monto_estimado) : 'monto por definir'}
                          </span>
                        </div>
                        <span className={`pill ${ESTADO_GASTO[g.estado].clase}`}>{ESTADO_GASTO[g.estado].texto}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Bloque>
            )}

            <Bloque titulo="Listos para liberar" id="b-lotes" enlace={{ to: '/admin/taller?pestana=lotes', texto: 'Ir al taller' }}>
              <p className="ayuda">Lotes de jabones y velas que ya terminaron su curado: revísalos y libéralos para que se puedan vender.</p>
              {r.lotes_listos.length === 0 ? (
                <Vacio titulo="Ningún lote espera">Cuando un lote termine su curado, aparecerá aquí.</Vacio>
              ) : (
                <ul className="adm-lista">
                  {r.lotes_listos.slice(0, 6).map((l) => (
                    <li key={l.id} className="adm-lista-item">
                      <div>
                        <strong>{l.producto_nombre}</strong>
                        <span className="adm-sub">
                          <span className="num">{l.codigo}</span> · {numero(l.piezas_planeadas)} {l.piezas_planeadas === 1 ? 'pieza' : 'piezas'} ·{' '}
                          {textoFaltan(l.dias_para_listo)}
                        </span>
                      </div>
                      <span className="pill pill-alerta">Listo para liberar</span>
                    </li>
                  ))}
                  {r.lotes_listos.length > 6 && <li className="adm-lista-item texto-3">y {r.lotes_listos.length - 6} más…</li>}
                </ul>
              )}
            </Bloque>

            <Bloque titulo="Pedidos por entregar" id="b-entregar" enlace={{ to: '/admin/pedidos?estado=por_entregar', texto: 'Ver cuáles' }}>
              {r.pedidos_por_entregar === 0 ? (
                <Vacio titulo="Nada por entregar">Todos los productos pagados ya están en manos de sus clientas.</Vacio>
              ) : (
                <p className="adm-sin-margen">
                  Hay <strong>{r.pedidos_por_entregar}</strong> {r.pedidos_por_entregar === 1 ? 'pedido pagado' : 'pedidos pagados'} con jabones, velas u otros
                  productos que la clienta recoge en el spa. Cuando se los entregues, márcalos como entregados.
                </p>
              )}
            </Bloque>

            <Bloque titulo="Pedidos pendientes de pago" id="b-pedidos" enlace={{ to: '/admin/pedidos?estado=pendiente_pago', texto: 'Ver pedidos' }}>
              {r.pedidos_pendientes === 0 ? (
                <Vacio titulo="Sin pedidos por cobrar" />
              ) : (
                <p className="adm-sin-margen">
                  Hay <strong>{r.pedidos_pendientes}</strong> {r.pedidos_pendientes === 1 ? 'pedido' : 'pedidos'} de la tienda en línea esperando pago en el spa o
                  por transferencia. Al registrar el pago se activan sus servicios prepagados y los productos quedan listos para entregar.
                </p>
              )}
            </Bloque>
          </div>
        </>
      )}
    </div>
  );
}
