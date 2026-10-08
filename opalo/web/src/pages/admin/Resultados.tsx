// /admin/resultados: cómo le va al spa mes con mes (últimos 12 meses, desde el primero con actividad).
// Las cifras salen de v_resultado_mensual: pagos, gastos, consumos de insumos y compras de inventario.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ResultadoMensual } from '../../lib/api';
import { numero } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { Bloque, EncabezadoAdmin, Kpi } from '../../components/admin/Piezas';
import { GraficaResultados } from '../../components/admin/GraficaResultados';
import { dineroCentavos } from '../../components/admin/GastosPiezas';
import { mesActual, mesCorto, nombreDeMes, sumarMeses } from '../../components/admin/util';
import './Resultados.css';

type Cifra = Exclude<keyof ResultadoMensual, 'mes'>;
const CIFRAS: Cifra[] = ['ingresos', 'costo_insumos', 'gastos', 'utilidad', 'flujo', 'compras', 'propinas', 'citas_completadas'];

const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const centavos = (n: number) => Math.round(n * 100) / 100;
const vacio = (mes: string): ResultadoMensual => ({
  mes: `${mes}-01`,
  ingresos: 0,
  propinas: 0,
  costo_insumos: 0,
  compras: 0,
  gastos: 0,
  utilidad: 0,
  flujo: 0,
  citas_completadas: 0,
});
const tieneActividad = (f: ResultadoMensual) => CIFRAS.some((k) => k !== 'utilidad' && k !== 'flujo' && f[k] !== 0);

/**
 * Meses en orden, desde el primero con actividad: antes de abrir (o de empezar a registrar), los
 * meses en cero sólo hacen ruido en la gráfica y en la tabla.
 */
export function desdePrimeraActividad(filas: ResultadoMensual[]): ResultadoMensual[] {
  const orden = [...filas].sort((a, b) => a.mes.localeCompare(b.mes));
  const i = orden.findIndex(tieneActividad);
  return i <= 0 ? orden : orden.slice(i);
}

const textoMeses = (n: number) => (n === 1 ? 'este mes' : `los últimos ${n} meses`);

/** Celda de dinero; utilidad y flujo negativos se marcan. */
function CeldaDinero({ valor, signo = false, fuerte = false, extra = '' }: { valor: number; signo?: boolean; fuerte?: boolean; extra?: string }) {
  const clase = [signo && valor < 0 ? 'res-negativo' : '', extra].filter(Boolean).join(' ');
  const texto = dineroCentavos(valor);
  return <td className={`num ${clase}`.trim()}>{fuerte ? <strong>{texto}</strong> : texto}</td>;
}

function Explicacion() {
  return (
    <Bloque titulo="Cómo leer estas cifras" id="res-b-explicacion">
      <div className="res-formulas">
        <div className="res-formula">
          <p className="res-formula-nombre">Utilidad: lo que se ganó</p>
          <p className="res-formula-cuenta">Ingresos − costo de los insumos usados − gastos</p>
          <p className="texto-2 adm-sin-margen">
            Cuenta el material conforme se usa en cabina, no cuando se compra. Es la mejor medida de si el spa gana dinero.
          </p>
        </div>
        <div className="res-formula">
          <p className="res-formula-nombre">Flujo: cuánto dinero entró menos lo que salió</p>
          <p className="res-formula-cuenta">Ingresos − compras de inventario − gastos</p>
          <p className="texto-2 adm-sin-margen">
            Si un mes surtes cera para tres meses, el flujo de ese mes baja aunque la utilidad no. Sirve para saber si alcanza para pagar.
          </p>
        </div>
      </div>
      <dl className="res-glosario">
        <div>
          <dt>Ingresos</dt>
          <dd>Lo que se cobró en el mes por citas y pedidos (los pagos registrados), sin propinas ni cortesías.</dd>
        </div>
        <div>
          <dt>Costo de insumos</dt>
          <dd>Lo que costó el material usado: al completar una cita, se descuenta del inventario según la receta de cada servicio.</dd>
        </div>
        <div>
          <dt>Gastos</dt>
          <dd>
            Renta, recibos, publicidad y todo lo que registras en <Link to="/admin/gastos">Gastos</Link>, en el mes al que corresponden.
          </dd>
        </div>
        <div>
          <dt>Compras</dt>
          <dd>
            Lo que pagaste al surtir el <Link to="/admin/inventario">inventario</Link>. No resta a la utilidad (eso lo hace el consumo), pero sí al flujo.
          </dd>
        </div>
        <div>
          <dt>Propinas</dt>
          <dd>Son de quien atiende, no del spa: se registran aparte y no cuentan como ingreso.</dd>
        </div>
        <div>
          <dt>Citas</dt>
          <dd>Citas completadas en el mes.</dd>
        </div>
      </dl>
    </Bloque>
  );
}

/** ¿El contenido de este elemento es más ancho que él (hay que desplazarlo de lado)? */
function useDesborda<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [desborda, setDesborda] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setDesborda(el.scrollWidth - el.clientWidth > 4);
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return [ref, desborda] as const;
}

export default function Resultados() {
  const resultados = useAsync(() => api.admin.getResultados(12), []);
  const [envoltura, desborda] = useDesborda<HTMLDivElement>();
  const actual = mesActual();
  const filas = resultados.datos ?? [];
  const hayDatos = filas.some(tieneActividad);
  const porMes = new Map(filas.map((f) => [f.mes.slice(0, 7), f]));
  const delMes = porMes.get(actual) ?? vacio(actual);
  const mesPasado = porMes.get(sumarMeses(actual, -1)) ?? null;
  const serie = desdePrimeraActividad(filas);
  const nMeses = serie.length;
  const recientes = [...serie].reverse();
  const totales = CIFRAS.reduce(
    (acc, k) => ({ ...acc, [k]: centavos(serie.reduce((s, f) => s + f[k], 0)) }),
    {} as Record<Cifra, number>,
  );
  const egresos = centavos(delMes.gastos + delMes.costo_insumos);

  return (
    <div className="adm-pagina res-pagina">
      <EncabezadoAdmin
        titulo="Resultados"
        descripcion="Cómo le va al spa mes con mes: lo que entró, lo que costó y lo que quedó. Se calcula solo con los pagos, gastos y consumos que registras en el panel."
      >
        <Link className="btn btn-secundario" to="/admin/gastos">
          Ir a gastos
        </Link>
      </EncabezadoAdmin>

      {resultados.cargando && !resultados.datos && <Cargando texto="Sumando los resultados…" />}
      <MensajeError error={resultados.error} onReintentar={resultados.recargar} />

      {resultados.datos && !hayDatos && (
        <>
          <Vacio titulo="Todavía no hay resultados">
            <p>Los resultados se arman solos con lo que registras en el panel:</p>
            <ul className="res-fuentes">
              <li>
                Los <strong>pagos</strong> de citas y pedidos (ingresos y propinas), en la <Link to="/admin/agenda">Agenda</Link> y en{' '}
                <Link to="/admin/pedidos">Pedidos y pagos</Link>.
              </li>
              <li>
                Los <strong>gastos</strong>, como la renta y los recibos, en <Link to="/admin/gastos">Gastos</Link>.
              </li>
              <li>
                Los <strong>consumos</strong> de insumos que se descuentan del inventario al completar cada cita, y las <strong>compras</strong> de{' '}
                <Link to="/admin/inventario">Inventario</Link>.
              </li>
            </ul>
          </Vacio>
          <Explicacion />
        </>
      )}

      {resultados.datos && hayDatos && (
        <>
          <section aria-labelledby="res-titulo-mes" className="res-mes">
            <div className="res-mes-cabeza">
              <h2 id="res-titulo-mes" className="res-subtitulo">
                Este mes · {capital(nombreDeMes(actual))}
              </h2>
              <span className="pill pill-oro">En curso</span>
            </div>
            <p className="ayuda res-mes-nota">Las cifras se actualizan conforme registras pagos, gastos y citas completadas.</p>
            <div className="adm-kpis res-kpis">
              <Kpi
                etiqueta="Ingresos"
                valor={<span className="num">{dineroCentavos(delMes.ingresos)}</span>}
                detalle={mesPasado ? `Mes pasado: ${dineroCentavos(mesPasado.ingresos)}` : 'Pagos registrados, sin propinas'}
              />
              <Kpi
                etiqueta="Gastos + costo de insumos"
                valor={<span className="num">{dineroCentavos(egresos)}</span>}
                detalle={`Gastos ${dineroCentavos(delMes.gastos)} · insumos ${dineroCentavos(delMes.costo_insumos)}`}
              />
              <Kpi
                etiqueta="Utilidad"
                valor={<span className="num">{dineroCentavos(delMes.utilidad)}</span>}
                detalle="Ingresos − insumos − gastos"
                tono={delMes.utilidad > 0 ? 'exito' : delMes.utilidad < 0 ? 'error' : undefined}
              />
              <Kpi
                etiqueta="Citas completadas"
                valor={<span className="num">{numero(delMes.citas_completadas)}</span>}
                detalle={mesPasado ? `Mes pasado: ${numero(mesPasado.citas_completadas)}` : undefined}
              />
            </div>
            <div className="res-aparte">
              <div className="res-kpi-aparte">
                <Kpi etiqueta="Propinas del mes" valor={<span className="num">{dineroCentavos(delMes.propinas)}</span>} detalle="Son de quien atiende, no del spa" />
              </div>
              <p className="texto-2 pequeno res-aparte-texto">
                Las propinas se registran junto con cada pago, pero no son ingreso del spa: son de quien atendió. Por eso van aparte y no suman en los ingresos
                ni en la utilidad.
              </p>
            </div>
          </section>

          <Bloque titulo={nMeses === 1 ? 'Este mes' : `Últimos ${nMeses} meses`} id="res-b-grafica">
            <GraficaResultados datos={serie} idTabla="res-tabla" />
          </Bloque>

          <Bloque titulo="Mes por mes" id="res-b-tabla">
            <p className="ayuda res-tabla-nota">
              <strong>Utilidad</strong> = ingresos − costo de insumos − gastos. <strong>Flujo</strong> = ingresos − compras − gastos. Las cifras negativas
              aparecen en rojo.
            </p>
            {desborda && <p className="ayuda res-deslizar">Desliza la tabla hacia los lados para ver todas las columnas.</p>}
            <div ref={envoltura} className="tabla-envoltura res-envoltura" tabIndex={0} role="region" aria-labelledby="res-b-tabla">
              <table className="tabla res-tabla" id="res-tabla">
                <caption className="sr-only">Resultados de {textoMeses(nMeses)}, del más reciente al más antiguo</caption>
                <thead>
                  <tr>
                    <th scope="col">Mes</th>
                    {/* En pantallas angostas la utilidad pasa a ser la segunda columna (sin deslizar). */}
                    <th scope="col" className="num res-col-angosta">
                      Utilidad
                    </th>
                    <th scope="col" className="num">
                      Ingresos
                    </th>
                    <th scope="col" className="num">
                      Costo de insumos
                    </th>
                    <th scope="col" className="num">
                      Gastos
                    </th>
                    <th scope="col" className="num res-col-ancha">
                      Utilidad
                    </th>
                    <th scope="col" className="num">
                      Flujo
                    </th>
                    <th scope="col" className="num">
                      Compras
                    </th>
                    <th scope="col" className="num">
                      Propinas
                    </th>
                    <th scope="col" className="num">
                      Citas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recientes.map((f) => {
                    const m = f.mes.slice(0, 7);
                    const clase = [m === actual ? 'res-fila-actual' : '', tieneActividad(f) ? '' : 'res-fila-sin'].join(' ').trim();
                    return (
                      <tr key={f.mes} className={clase || undefined}>
                        <th scope="row">
                          <span className="res-mes-largo">{capital(nombreDeMes(m))}</span>
                          <span className="res-mes-corto" aria-hidden="true">
                            {capital(mesCorto(m))}
                          </span>
                          {m === actual && <span className="adm-sub">en curso</span>}
                        </th>
                        <CeldaDinero valor={f.utilidad} signo fuerte extra="res-col-angosta" />
                        <CeldaDinero valor={f.ingresos} />
                        <CeldaDinero valor={f.costo_insumos} />
                        <CeldaDinero valor={f.gastos} />
                        <CeldaDinero valor={f.utilidad} signo fuerte extra="res-col-ancha" />
                        <CeldaDinero valor={f.flujo} signo />
                        <CeldaDinero valor={f.compras} />
                        <CeldaDinero valor={f.propinas} />
                        <td className="num">{numero(f.citas_completadas)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="res-fila-total">
                    <th scope="row">Total {nMeses === 1 ? 'del mes' : `${nMeses} meses`}</th>
                    <CeldaDinero valor={totales.utilidad} signo fuerte extra="res-col-angosta" />
                    <CeldaDinero valor={totales.ingresos} fuerte />
                    <CeldaDinero valor={totales.costo_insumos} fuerte />
                    <CeldaDinero valor={totales.gastos} fuerte />
                    <CeldaDinero valor={totales.utilidad} signo fuerte extra="res-col-ancha" />
                    <CeldaDinero valor={totales.flujo} signo fuerte />
                    <CeldaDinero valor={totales.compras} fuerte />
                    <CeldaDinero valor={totales.propinas} fuerte />
                    <td className="num">
                      <strong>{numero(totales.citas_completadas)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Bloque>

          <Explicacion />
        </>
      )}
    </div>
  );
}
