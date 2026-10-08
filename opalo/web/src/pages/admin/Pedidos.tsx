// Pedidos y pagos (/admin/pedidos): pedidos de la tienda en línea, cobro y cancelación.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type EstadoPedido, type PedidoDetalle } from '../../lib/api';
import { dinero, fechaLocal } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { EncabezadoAdmin, Exito, Kpi } from '../../components/admin/Piezas';
import { PedidosDetalleModal, PedidosTabla, pedidoSaldo } from '../../components/admin/PedidosDetalle';
import { mesActual, nombreDeMes } from '../../components/admin/util';
import './Pedidos.css';

type Filtro = '' | Extract<EstadoPedido, 'pendiente_pago' | 'pagado' | 'cancelado'>;

const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: '', texto: 'Todos' },
  { valor: 'pendiente_pago', texto: 'Pendientes de pago' },
  { valor: 'pagado', texto: 'Pagados' },
  { valor: 'cancelado', texto: 'Cancelados' },
];

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export default function Pedidos() {
  const [params, setParams] = useSearchParams();
  const ep = params.get('estado') ?? '';
  const filtro: Filtro = FILTROS.some((f) => f.valor === ep) ? (ep as Filtro) : '';
  const [busqueda, setBusqueda] = useState('');
  const [verId, setVerId] = useState<string | null>(params.get('pedido'));
  const [aviso, setAviso] = useState<string | null>(null);

  // Se cargan todos para contar por estado y calcular los totales; el filtro es local.
  const pedidos = useAsync(() => api.admin.getPedidos(null), []);
  const todos = useMemo(() => pedidos.datos ?? [], [pedidos.datos]);

  // ?pedido=<id> abre su detalle (p. ej. desde otro lugar del panel).
  useEffect(() => {
    if (!params.get('pedido')) return;
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('pedido');
        return n;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elegirFiltro = (v: Filtro) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set('estado', v);
        else n.delete('estado');
        return n;
      },
      { replace: true },
    );

  const mes = mesActual();
  const totales = useMemo(() => {
    const pendientes = todos.filter((p) => p.estado === 'pendiente_pago');
    const delMes = todos.filter((p) => p.estado === 'pagado' && p.pagado_en && fechaLocal(new Date(p.pagado_en)).slice(0, 7) === mes);
    return {
      pendientes: pendientes.length,
      porCobrar: pendientes.reduce((s, p) => s + pedidoSaldo(p), 0),
      abonado: pendientes.reduce((s, p) => s + p.pagado, 0),
      pagadosMes: delMes.length,
      cobradoMes: delMes.reduce((s, p) => s + p.pagado, 0),
    };
  }, [todos, mes]);

  const cuenta = (v: Filtro) => (v ? todos.filter((p) => p.estado === v).length : todos.length);

  const q = normalizar(busqueda.trim());
  const visibles = todos.filter(
    (p) => (!filtro || p.estado === filtro) && (!q || normalizar(`${p.folio} ${p.cliente_nombre} ${p.items.map((i) => i.descripcion).join(' ')}`).includes(q)),
  );
  const elegido: PedidoDetalle | undefined = verId ? todos.find((p) => p.id === verId) : undefined;
  const textoFiltro = FILTROS.find((f) => f.valor === filtro)?.texto.toLowerCase() ?? '';

  return (
    <div className="adm-pagina adm-pe">
      <EncabezadoAdmin
        titulo="Pedidos y pagos"
        descripcion="Pedidos de la tienda en línea. Se pagan en el spa o por transferencia: al registrar el pago completo se activan los servicios prepagados de la clienta."
      />

      <MensajeError error={pedidos.error} onReintentar={pedidos.recargar} />
      {pedidos.cargando && !pedidos.datos && <Cargando texto="Cargando pedidos…" />}

      {pedidos.datos && (
        <>
          <div className="adm-kpis adm-pe-kpis">
            <Kpi
              etiqueta="Pendiente de cobro"
              valor={<span className="num">{dinero(totales.porCobrar)}</span>}
              detalle={
                totales.pendientes === 0
                  ? 'Ningún pedido por cobrar'
                  : `${totales.pendientes} ${totales.pendientes === 1 ? 'pedido' : 'pedidos'} por pagar${totales.abonado > 0 ? ` · ya abonaron ${dinero(totales.abonado)}` : ''}`
              }
              tono={totales.pendientes > 0 ? 'alerta' : undefined}
            />
            <Kpi
              etiqueta="Cobrado este mes"
              valor={<span className="num">{dinero(totales.cobradoMes)}</span>}
              detalle={`${totales.pagadosMes} ${totales.pagadosMes === 1 ? 'pedido liquidado' : 'pedidos liquidados'} en ${nombreDeMes(mes)}`}
            />
          </div>

          <div className="adm-pe-barra">
            <div className="campo adm-pe-busqueda">
              <label className="sr-only" htmlFor="pe-buscar">
                Buscar por folio, clienta o artículo
              </label>
              <input
                id="pe-buscar"
                className="input"
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Busca por folio, clienta o artículo"
                autoComplete="off"
              />
            </div>
            <div className="pestanas adm-pe-pestanas" role="tablist" aria-label="Filtrar por estado">
              {FILTROS.map((f) => (
                <button
                  key={f.valor || 'todos'}
                  type="button"
                  role="tab"
                  className="pestana"
                  aria-selected={filtro === f.valor}
                  aria-controls="pe-lista"
                  onClick={() => elegirFiltro(f.valor)}
                >
                  {f.texto} <span className="adm-pe-cuenta num">{cuenta(f.valor)}</span>
                </button>
              ))}
            </div>
          </div>

          <Exito texto={aviso} onCerrar={() => setAviso(null)} />

          <div id="pe-lista" role="tabpanel" className={pedidos.cargando ? 'adm-pe-recargando' : ''}>
            {visibles.length === 0 ? (
              todos.length === 0 ? (
                <Vacio titulo="Aún no hay pedidos">Cuando una clienta compre servicios, paquetes o productos en la tienda en línea, su pedido aparecerá aquí.</Vacio>
              ) : q ? (
                <Vacio titulo={`No encontramos “${busqueda.trim()}”`}>
                  Revisa el folio o el nombre{filtro ? `, o busca en todos los pedidos en lugar de sólo ${textoFiltro}` : ''}.
                </Vacio>
              ) : (
                <Vacio titulo={`No hay pedidos ${textoFiltro}`}>
                  {filtro === 'pendiente_pago' ? '¡Todo cobrado! No hay pedidos esperando pago.' : 'Prueba con otro estado.'}
                </Vacio>
              )
            ) : (
              <>
                <p className="ayuda adm-pe-conteo" aria-live="polite">
                  {visibles.length} {visibles.length === 1 ? 'pedido' : 'pedidos'}
                  {filtro ? ` · ${textoFiltro}` : ''}
                </p>
                <PedidosTabla pedidos={visibles} onVer={(p) => setVerId(p.id)} />
              </>
            )}
          </div>
        </>
      )}

      {elegido && (
        <PedidosDetalleModal
          pedido={elegido}
          onCerrar={() => setVerId(null)}
          onCambio={(mensaje) => {
            setVerId(null);
            setAviso(mensaje);
            pedidos.recargar();
          }}
        />
      )}
    </div>
  );
}
