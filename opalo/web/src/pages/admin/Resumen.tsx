import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { dinero, fechaCorta, fechaLarga, fechaLocal, hora, isoDesdeLocal, sumarDias } from '../../lib/format';
import { useSesion } from '../../lib/sesion';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { Bloque, EncabezadoAdmin, Kpi, PillEstadoCita, PillFirma } from '../../components/admin/Piezas';
import { cantidadConUnidad } from '../../components/admin/util';
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
          <div className="adm-kpis">
            <Kpi
              etiqueta="Citas de hoy"
              valor={citasActivas.length}
              detalle={citasActivas.length === 0 ? 'Sin citas por ahora' : sinFirma ? `${sinFirma} sin consentimiento firmado` : 'Todas con firma'}
              tono={sinFirma ? 'alerta' : undefined}
            />
            <Kpi etiqueta="Por revisar" valor={r.por_revisar} detalle="Citas pendientes por la ficha de salud" tono={r.por_revisar ? 'alerta' : undefined} />
            <Kpi etiqueta="Pedidos por cobrar" valor={r.pedidos_pendientes} detalle="Pendientes de pago" />
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
                <Kpi etiqueta="Gastos" valor={dinero(r.mes_actual.gastos)} detalle={`Insumos usados: ${dinero(r.mes_actual.costo_insumos)}`} />
                <Kpi
                  etiqueta="Utilidad"
                  valor={dinero(r.mes_actual.utilidad)}
                  detalle="Ingresos − insumos − gastos"
                  tono={r.mes_actual.utilidad < 0 ? 'error' : r.mes_actual.utilidad > 0 ? 'exito' : undefined}
                />
              </div>
            </section>
          )}

          <Bloque titulo="Citas de hoy" id="b-hoy" enlace={{ to: `/admin/agenda?fecha=${hoy}`, texto: 'Ver agenda' }}>
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
                            {sinFirmaQueAplique ? <span className="texto-3">—</span> : <PillFirma firmados={c.consentimientos_firmados} />}
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
                      <span className="num adm-nowrap">
                        {p.presentaciones_sugeridas} × {p.presentacion ?? 'presentación'}
                      </span>
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

            <Bloque titulo="Pedidos pendientes de pago" id="b-pedidos" enlace={{ to: '/admin/pedidos?estado=pendiente_pago', texto: 'Ver pedidos' }}>
              {r.pedidos_pendientes === 0 ? (
                <Vacio titulo="Sin pedidos por cobrar" />
              ) : (
                <p className="adm-sin-margen">
                  Hay <strong>{r.pedidos_pendientes}</strong> {r.pedidos_pendientes === 1 ? 'pedido' : 'pedidos'} de la tienda en línea esperando pago en el spa o
                  por transferencia. Al registrar el pago, se activan los créditos de la clienta.
                </p>
              )}
            </Bloque>
          </div>
        </>
      )}
    </div>
  );
}
