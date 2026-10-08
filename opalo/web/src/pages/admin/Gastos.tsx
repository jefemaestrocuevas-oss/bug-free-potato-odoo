// /admin/gastos: lo que sale del spa. Arriba lo que está por pagar (gastos fijos), luego los
// gastos del mes elegido con su total por categoría y, al final, el calendario de gastos fijos.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Gasto, type GastoPorVencer, type GastoRecurrente } from '../../lib/api';
import { ETIQUETA_METODO_PAGO, fechaCorta } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { Bloque, EncabezadoAdmin, Exito, Kpi } from '../../components/admin/Piezas';
import { useConfirmar } from '../../components/admin/Modal';
import { IconoAnterior, IconoSiguiente } from '../../components/admin/Iconos';
import { GastosFormGasto } from '../../components/admin/GastosFormGasto';
import { GastosFormFijo } from '../../components/admin/GastosFormFijo';
import {
  capital,
  dineroCentavos,
  GastosBarrasCategoria,
  GastosPillVencimiento,
  textoDias,
  urlSegura,
  type GastosFilaCategoria,
} from '../../components/admin/GastosPiezas';
import { ETIQUETA_FRECUENCIA, mesActual, nombreDeMes, rangoDeMes, sumarMeses } from '../../components/admin/util';
import './Gastos.css';

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const centavos = (n: number) => Math.round(n * 100) / 100;

export default function Gastos() {
  const [params, setParams] = useSearchParams();
  const actual = mesActual();
  const mp = params.get('mes');
  const mes = mp && MES_RE.test(mp) ? mp : actual;
  const [desde, hasta] = rangoDeMes(mes);
  const nombreMes = nombreDeMes(mes);

  const categorias = useAsync(() => api.admin.getCategoriasGasto(), []);
  const porVencer = useAsync(() => api.admin.getGastosPorVencer(), []);
  const fijos = useAsync(() => api.admin.getGastosRecurrentes(), []);
  const gastos = useAsync(() => api.admin.getGastos(desde, hasta), [desde, hasta]);

  const [aviso, setAviso] = useState<string | null>(null);
  const [formGasto, setFormGasto] = useState<null | { gasto?: Gasto; fijo?: GastoRecurrente }>(null);
  const [formFijo, setFormFijo] = useState<null | { fijo?: GastoRecurrente }>(null);
  const { confirmar, dialogo } = useConfirmar();

  const irAMes = (m: string) => {
    const p = new URLSearchParams(params);
    if (m === actual) p.delete('mes');
    else p.set('mes', m);
    setParams(p, { replace: true });
  };

  const listaCategorias = categorias.datos ?? [];
  const cats = useMemo(() => new Map((categorias.datos ?? []).map((c) => [c.id, c])), [categorias.datos]);
  const fijosPorId = useMemo(() => new Map((fijos.datos ?? []).map((f) => [f.id, f])), [fijos.datos]);

  const resumen = useMemo(() => {
    const lista = gastos.datos ?? [];
    let total = 0;
    let fijo = 0;
    const porCat = new Map<string, GastosFilaCategoria>();
    for (const g of lista) {
      total += g.monto;
      const c = cats.get(g.categoria_id);
      if (c?.es_fijo) fijo += g.monto;
      const fila = porCat.get(g.categoria_id) ?? { id: g.categoria_id, nombre: c?.nombre ?? 'Sin categoría', total: 0, cuantos: 0 };
      fila.total += g.monto;
      fila.cuantos += 1;
      porCat.set(g.categoria_id, fila);
    }
    const filas = [...porCat.values()].map((f) => ({ ...f, total: centavos(f.total) })).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
    return { total: centavos(total), fijo: centavos(fijo), variable: centavos(total - fijo), cuantos: lista.length, filas };
  }, [gastos.datos, cats]);

  // Lo que falta pagar de gastos fijos con vencimiento en el mes actual (o ya vencidos).
  const pendientesMes = useMemo(() => {
    const finMes = rangoDeMes(actual)[1];
    const lista = (porVencer.datos ?? []).filter((v) => v.proximo_vencimiento && v.proximo_vencimiento <= finMes);
    return {
      cuantos: lista.length,
      vencidos: lista.filter((v) => v.estado === 'vencido').length,
      sinMonto: lista.filter((v) => v.monto_estimado === null).length,
      total: centavos(lista.reduce((s, v) => s + (v.monto_estimado ?? 0), 0)),
    };
  }, [porVencer.datos, actual]);

  const conteoPorVencer = useMemo(() => {
    const l = porVencer.datos ?? [];
    return { vencidos: l.filter((v) => v.estado === 'vencido').length, proximos: l.filter((v) => v.estado === 'proximo').length };
  }, [porVencer.datos]);

  const nuevoGasto = () => setFormGasto({});
  const pagarFijo = (v: GastoPorVencer) => {
    const f = fijosPorId.get(v.id);
    if (f) setFormGasto({ fijo: f });
  };

  const borrar = (g: Gasto) =>
    confirmar({
      titulo: '¿Borrar este gasto?',
      mensaje: (
        <>
          <p>
            Vas a borrar <strong>«{g.concepto}»</strong> por <strong className="num">{dineroCentavos(g.monto)}</strong> del {fechaCorta(g.fecha)}. Dejará de contar en
            los resultados de su mes.
          </p>
          {g.recurrente_id && (
            <p>Era el pago de un gasto fijo: su próximo vencimiento no regresa solo. Si hace falta, corrígelo en «Gastos fijos».</p>
          )}
          <p>Esta acción no se puede deshacer.</p>
        </>
      ),
      textoBoton: 'Sí, borrar',
      peligro: true,
      accion: () => api.admin.eliminarGasto(g.id),
      alTerminar: () => {
        setAviso(`Se borró «${g.concepto}».`);
        gastos.recargar();
      },
    });

  const listosParaFormulario = !!categorias.datos && listaCategorias.length > 0;

  return (
    <div className="adm-pagina gas-pagina">
      <EncabezadoAdmin
        titulo="Gastos"
        descripcion="Lo que sale del spa: renta, recibos, publicidad, cursos… Registra cada pago para que los resultados del mes cuadren."
      >
        <Link className="btn btn-secundario" to="/admin/resultados">
          Ver resultados
        </Link>
        <button type="button" className="btn btn-primario" onClick={nuevoGasto} disabled={!listosParaFormulario}>
          + Registrar gasto
        </button>
      </EncabezadoAdmin>

      {aviso && (
        <div className="gas-aviso">
          <Exito texto={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}
      <MensajeError error={categorias.error} onReintentar={categorias.recargar} />

      {/* ---------- Por pagar ---------- */}
      <Bloque
        titulo="Por pagar"
        id="gas-b-porpagar"
        extra={
          porVencer.datos && (conteoPorVencer.vencidos > 0 || conteoPorVencer.proximos > 0) ? (
            <span className="gas-conteos">
              {conteoPorVencer.vencidos > 0 && (
                <span className="pill pill-error">
                  {conteoPorVencer.vencidos} {conteoPorVencer.vencidos === 1 ? 'vencido' : 'vencidos'}
                </span>
              )}
              {conteoPorVencer.proximos > 0 && (
                <span className="pill pill-alerta">
                  {conteoPorVencer.proximos} {conteoPorVencer.proximos === 1 ? 'vence esta semana' : 'vencen esta semana'}
                </span>
              )}
            </span>
          ) : undefined
        }
      >
        <p className="ayuda gas-intro">Tus gastos fijos activos, del más urgente al más lejano. Al registrar su pago, el próximo vencimiento avanza solo.</p>
        {porVencer.cargando && !porVencer.datos && <Cargando texto="Revisando vencimientos…" />}
        <MensajeError error={porVencer.error} onReintentar={porVencer.recargar} />
        {porVencer.datos && porVencer.datos.length === 0 && (
          <Vacio titulo="No hay gastos fijos activos">
            Agrégalos abajo, en «Gastos fijos»: la renta, la cuota de mantenimiento, la luz de CFE, el agua, el internet.
          </Vacio>
        )}
        {porVencer.datos && porVencer.datos.length > 0 && (
          <div className="tabla-envoltura gas-envoltura">
            <table className="tabla gas-tabla gas-tabla-tarjetas">
              <thead>
                <tr>
                  <th scope="col">Concepto</th>
                  <th scope="col" className="num">
                    Monto estimado
                  </th>
                  <th scope="col">Vence</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {porVencer.datos.map((v) => {
                  const dias = textoDias(v.dias_restantes);
                  return (
                    <tr key={v.id}>
                      <td className="gas-celda-titulo">
                        <strong>{v.concepto}</strong>
                        <span className="adm-sub">
                          {v.categoria} · {ETIQUETA_FRECUENCIA[v.frecuencia]}
                        </span>
                      </td>
                      <td className="num" data-etiqueta="Monto estimado">
                        {v.monto_estimado !== null ? dineroCentavos(v.monto_estimado) : <span className="texto-3">Varía</span>}
                      </td>
                      <td data-etiqueta="Vence">
                        {v.proximo_vencimiento ? (
                          <span>
                            <span className="adm-nowrap">{fechaCorta(v.proximo_vencimiento)}</span>
                            {dias && <span className={`adm-sub ${v.estado === 'vencido' ? 'gas-texto-vencido' : v.estado === 'proximo' ? 'gas-texto-proximo' : ''}`}>{dias}</span>}
                          </span>
                        ) : (
                          <span className="texto-3">Sin fecha</span>
                        )}
                      </td>
                      <td data-etiqueta="Estado">
                        <GastosPillVencimiento estado={v.estado} />
                      </td>
                      <td className="gas-celda-acciones">
                        <button
                          type="button"
                          className={`btn btn-sm ${v.estado === 'al_corriente' ? 'btn-secundario' : 'btn-primario'}`}
                          onClick={() => pagarFijo(v)}
                          disabled={!listosParaFormulario || !fijosPorId.has(v.id)}
                        >
                          Registrar pago<span className="sr-only"> de {v.concepto}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Bloque>

      {/* ---------- Mes ---------- */}
      <section className="gas-mes" aria-labelledby="gas-titulo-mes">
        <div className="gas-mes-barra">
          <div className="gas-mes-nav">
            <button
              type="button"
              className="btn btn-secundario gas-btn-icono"
              onClick={() => irAMes(sumarMeses(mes, -1))}
              aria-label={`Mes anterior: ${nombreDeMes(sumarMeses(mes, -1))}`}
            >
              <IconoAnterior tam={18} />
            </button>
            <h2 id="gas-titulo-mes" className="gas-mes-titulo" aria-live="polite">
              {capital(nombreMes)}
            </h2>
            <button
              type="button"
              className="btn btn-secundario gas-btn-icono"
              onClick={() => irAMes(sumarMeses(mes, 1))}
              aria-label={`Mes siguiente: ${nombreDeMes(sumarMeses(mes, 1))}`}
            >
              <IconoSiguiente tam={18} />
            </button>
          </div>
          {mes !== actual && (
            <button type="button" className="btn btn-texto btn-sm" onClick={() => irAMes(actual)}>
              Ir a {nombreDeMes(actual)}
            </button>
          )}
        </div>

        <MensajeError error={gastos.error} onReintentar={gastos.recargar} />
        {gastos.cargando && !gastos.datos && <Cargando texto="Cargando los gastos del mes…" />}

        {gastos.datos && (
          <div className={`gas-mes-cuerpo ${gastos.cargando ? 'gas-recargando' : ''}`}>
            <div className="adm-kpis gas-kpis">
              <Kpi
                etiqueta="Total del mes"
                valor={<span className="num">{dineroCentavos(resumen.total)}</span>}
                detalle={resumen.cuantos === 0 ? 'Sin gastos registrados' : `${resumen.cuantos} ${resumen.cuantos === 1 ? 'gasto registrado' : 'gastos registrados'}`}
              />
              <Kpi etiqueta="Gastos fijos" valor={<span className="num">{dineroCentavos(resumen.fijo)}</span>} detalle="Renta, recibos y servicios" />
              <Kpi etiqueta="Gastos variables" valor={<span className="num">{dineroCentavos(resumen.variable)}</span>} detalle="Publicidad, cursos, reparaciones y más" />
              {mes === actual && porVencer.datos && (
                <Kpi
                  etiqueta="Falta por pagar"
                  valor={<span className="num">{dineroCentavos(pendientesMes.total)}</span>}
                  detalle={
                    pendientesMes.cuantos === 0
                      ? 'Ningún gasto fijo pendiente este mes'
                      : `${pendientesMes.cuantos} ${pendientesMes.cuantos === 1 ? 'gasto fijo' : 'gastos fijos'} (estimado)${
                          pendientesMes.sinMonto ? ` · ${pendientesMes.sinMonto} sin monto estimado` : ''
                        }`
                  }
                  tono={pendientesMes.vencidos > 0 ? 'alerta' : undefined}
                />
              )}
            </div>

            <Bloque titulo="Por categoría" id="gas-b-categorias">
              {resumen.filas.length === 0 ? (
                <p className="texto-3 adm-sin-margen">Cuando registres gastos de {nombreMes}, aquí verás en qué se va el dinero.</p>
              ) : (
                <GastosBarrasCategoria filas={resumen.filas} total={resumen.total} />
              )}
            </Bloque>

            <Bloque
              titulo="Gastos registrados"
              id="gas-b-lista"
              extra={
                <button type="button" className="btn btn-secundario btn-sm" onClick={nuevoGasto} disabled={!listosParaFormulario}>
                  + Registrar gasto
                </button>
              }
            >
              {gastos.datos.length === 0 ? (
                <Vacio titulo={`Sin gastos en ${nombreMes}`}>
                  {mes === actual
                    ? 'Registra la renta, los recibos o cualquier compra que no sea de inventario con «Registrar gasto».'
                    : 'No hay gastos con fecha en este mes.'}
                </Vacio>
              ) : (
                <div className="tabla-envoltura gas-envoltura">
                  <table className="tabla gas-tabla gas-tabla-tarjetas">
                    <caption className="sr-only">Gastos de {nombreMes}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Fecha</th>
                        <th scope="col">Concepto y categoría</th>
                        <th scope="col">Método</th>
                        <th scope="col">Proveedor</th>
                        <th scope="col" className="num">
                          Monto
                        </th>
                        <th scope="col">Comprobante</th>
                        <th scope="col">
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {gastos.datos.map((g) => {
                        const enlace = urlSegura(g.comprobante_url);
                        const otroPeriodo = g.periodo && g.periodo.slice(0, 7) !== g.fecha.slice(0, 7);
                        return (
                          <tr key={g.id}>
                            <td data-etiqueta="Fecha" className="adm-nowrap">
                              {fechaCorta(g.fecha)}
                            </td>
                            <td className="gas-celda-titulo">
                              <strong>{g.concepto}</strong>
                              {g.recurrente_id && <span className="pill pill-verde gas-pill-junto">Gasto fijo</span>}
                              <span className="adm-sub">{cats.get(g.categoria_id)?.nombre ?? 'Sin categoría'}</span>
                              {otroPeriodo && <span className="adm-sub">Cuenta en {nombreDeMes(g.periodo.slice(0, 7))}</span>}
                              {g.notas && <span className="adm-sub gas-notas-celda">{g.notas}</span>}
                            </td>
                            <td data-etiqueta="Método">{g.metodo_pago ? ETIQUETA_METODO_PAGO[g.metodo_pago] : <span className="texto-3">—</span>}</td>
                            <td data-etiqueta="Proveedor">{g.proveedor ?? <span className="texto-3">—</span>}</td>
                            <td className="num gas-monto" data-etiqueta="Monto">
                              {dineroCentavos(g.monto)}
                            </td>
                            <td data-etiqueta="Comprobante">
                              {enlace ? (
                                <a href={enlace} target="_blank" rel="noopener noreferrer">
                                  Ver<span className="sr-only"> comprobante de {g.concepto}</span>
                                </a>
                              ) : g.comprobante_url ? (
                                <span className="texto-3 gas-comprobante-texto" title={g.comprobante_url}>
                                  {g.comprobante_url}
                                </span>
                              ) : (
                                <span className="texto-3">—</span>
                              )}
                            </td>
                            <td className="gas-celda-acciones">
                              <button type="button" className="btn btn-texto btn-sm" onClick={() => setFormGasto({ gasto: g })} disabled={!listosParaFormulario}>
                                Editar<span className="sr-only"> {g.concepto}</span>
                              </button>
                              <button type="button" className="btn btn-texto btn-sm adm-texto-peligro" onClick={() => borrar(g)}>
                                Borrar<span className="sr-only"> {g.concepto}</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="gas-fila-total">
                        <th scope="row" colSpan={4}>
                          Total de {nombreMes}
                        </th>
                        <td className="num" data-etiqueta={`Total de ${nombreMes}`}>
                          <strong>{dineroCentavos(resumen.total)}</strong>
                        </td>
                        <td colSpan={2} className="gas-celda-vacia" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Bloque>
          </div>
        )}
      </section>

      {/* ---------- Gastos fijos ---------- */}
      <Bloque
        titulo="Gastos fijos"
        id="gas-b-fijos"
        extra={
          <button type="button" className="btn btn-secundario btn-sm" onClick={() => setFormFijo({})} disabled={!listosParaFormulario}>
            + Agregar gasto fijo
          </button>
        }
      >
        <p className="ayuda gas-intro">
          Los pagos que se repiten, con su calendario: renta, cuota de mantenimiento, luz de CFE (bimestral), agua, internet. Pausa los que ya no pagas en vez
          de borrarlos.
        </p>
        {fijos.cargando && !fijos.datos && <Cargando />}
        <MensajeError error={fijos.error} onReintentar={fijos.recargar} />
        {fijos.datos && fijos.datos.length === 0 && (
          <Vacio titulo="Aún no tienes gastos fijos">Agrega los que se repiten para que el panel te avise cuando se acerque su fecha.</Vacio>
        )}
        {fijos.datos && fijos.datos.length > 0 && (
          <div className="tabla-envoltura gas-envoltura">
            <table className="tabla gas-tabla gas-tabla-tarjetas">
              <thead>
                <tr>
                  <th scope="col">Concepto</th>
                  <th scope="col">Categoría</th>
                  <th scope="col" className="num">
                    Monto estimado
                  </th>
                  <th scope="col">Se paga</th>
                  <th scope="col">Próximo vencimiento</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {fijos.datos.map((f) => (
                  <tr key={f.id} className={f.activo ? '' : 'gas-inactivo'}>
                    <td className="gas-celda-titulo">
                      <strong>{f.concepto}</strong>
                      {f.notas && <span className="adm-sub gas-notas-celda">{f.notas}</span>}
                    </td>
                    <td data-etiqueta="Categoría">{cats.get(f.categoria_id)?.nombre ?? '—'}</td>
                    <td className="num" data-etiqueta="Monto estimado">
                      {f.monto_estimado !== null ? dineroCentavos(f.monto_estimado) : <span className="texto-3">Varía</span>}
                    </td>
                    <td data-etiqueta="Se paga">
                      <span className="adm-nowrap">{ETIQUETA_FRECUENCIA[f.frecuencia]}</span>
                      <span className="adm-sub adm-nowrap">el día {f.dia_pago}</span>
                    </td>
                    <td data-etiqueta="Próximo vencimiento" className="adm-nowrap">
                      {f.proximo_vencimiento ? fechaCorta(f.proximo_vencimiento) : <span className="texto-3">Sin fecha</span>}
                    </td>
                    <td data-etiqueta="Estado">{f.activo ? <span className="pill pill-verde">Activo</span> : <span className="pill pill-gris">Pausado</span>}</td>
                    <td className="gas-celda-acciones">
                      <button type="button" className="btn btn-texto btn-sm" onClick={() => setFormFijo({ fijo: f })} disabled={!listosParaFormulario}>
                        Editar<span className="sr-only"> {f.concepto}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloque>

      {formGasto && (
        <GastosFormGasto
          categorias={listaCategorias}
          gasto={formGasto.gasto}
          fijo={formGasto.fijo}
          onCerrar={() => setFormGasto(null)}
          onListo={({ mensaje, fecha }) => {
            setFormGasto(null);
            setAviso(mensaje);
            porVencer.recargar();
            fijos.recargar();
            gastos.recargar();
            const m = fecha.slice(0, 7);
            if (m !== mes) irAMes(m);
          }}
        />
      )}
      {formFijo && (
        <GastosFormFijo
          categorias={listaCategorias}
          fijo={formFijo.fijo}
          onCerrar={() => setFormFijo(null)}
          onListo={(mensaje) => {
            setFormFijo(null);
            setAviso(mensaje);
            porVencer.recargar();
            fijos.recargar();
          }}
        />
      )}
      {dialogo}
    </div>
  );
}
