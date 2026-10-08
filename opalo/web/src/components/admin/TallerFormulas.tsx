// Pestaña «Fórmulas» del taller: costo por lote y por pieza de cada fórmula (con costos actuales de la
// materia prima), precio y margen, y una calculadora de precio sugerido que no cambia nada sola.
import { useState } from 'react';
import { api, type CostoFormula, type Formula, type Producto } from '../../lib/api';
import { numero, porcentaje } from '../../lib/format';
import { Vacio } from '../ui/Estado';
import { useConfirmar } from './Modal';
import { pesos } from './InventarioPiezas';
import { MARGEN_MINIMO_PCT } from './CostosReceta';
import { aEditable, esTerminado, precioSugerido } from './TallerPiezas';
import { aNumero, dineroUnitario, porTexto } from './util';

interface Props {
  productos: Producto[];
  formulas: Formula[];
  costos: CostoFormula[];
  onEditar: (f: Formula | null, productoId?: string | null) => void;
  onCambio: (mensaje: string) => void;
}

export function TallerFormulas({ productos, formulas, costos, onEditar, onCambio }: Props) {
  const [margenTexto, setMargenTexto] = useState('60');
  const { confirmar, dialogo } = useConfirmar();
  const margenObjetivo = aNumero(margenTexto);
  const margenOk = margenObjetivo !== null && margenObjetivo >= 0 && margenObjetivo < 100;

  const porProducto = new Map(productos.map((p) => [p.id, p]));
  const formulaPorId = new Map(formulas.map((f) => [f.id, f]));

  // Agrupadas por producto, en orden alfabético.
  const grupos: { producto_id: string; nombre: string; filas: CostoFormula[] }[] = [];
  for (const c of [...costos].sort(porTexto((x) => `${x.producto_nombre} ${x.nombre}`))) {
    const g = grupos.find((x) => x.producto_id === c.producto_id);
    if (g) g.filas.push(c);
    else grupos.push({ producto_id: c.producto_id, nombre: c.producto_nombre, filas: [c] });
  }
  const conFormula = new Set(formulas.map((f) => f.producto_id));
  const sinFormula = productos.filter((p) => p.activo && esTerminado(p.categoria) && !conFormula.has(p.id)).sort(porTexto((p) => p.nombre));

  const aplicar = (c: CostoFormula, precio: number) => {
    const p = porProducto.get(c.producto_id);
    if (!p) return;
    confirmar({
      titulo: `¿Cambiar el precio de ${p.nombre}?`,
      mensaje: (
        <>
          <p>
            Pasa de <strong>{p.precio_venta === null ? 'sin precio' : pesos(p.precio_venta)}</strong> a <strong>{pesos(precio)}</strong> por pieza: con
            la fórmula «{c.nombre}» (cuesta {dineroUnitario(c.costo_pieza)} cada pieza) te deja un margen de alrededor de {porcentaje(margenObjetivo)}.
          </p>
          <p>El precio nuevo se ve de inmediato en la tienda en línea y en el mostrador. Los pedidos ya hechos conservan su precio.</p>
        </>
      ),
      textoBoton: `Sí, cobrar ${pesos(precio)}`,
      accion: () => api.admin.guardarProducto({ ...aEditable(p), precio_venta: precio }),
      alTerminar: () => onCambio(`Precio de ${p.nombre} actualizado a ${pesos(precio)}.`),
    });
  };

  return (
    <>
      <div className="tal-barra">
        <p className="texto-2 adm-sin-margen">
          Cada fórmula dice qué lleva un lote completo y cuántas piezas salen. El costo usa el último precio de compra de cada insumo.
        </p>
        <button type="button" className="btn btn-primario" onClick={() => onEditar(null)}>
          + Nueva fórmula
        </button>
      </div>

      <section className="tal-calculadora" aria-labelledby="tal-calc-titulo">
        <h3 id="tal-calc-titulo" className="tal-calc-titulo">
          Calculadora de precio
        </h3>
        <div className="tal-calc-fila">
          <label className="etiqueta" htmlFor="tal-margen">
            Precio sugerido para un margen de
          </label>
          <div className="inv-entrada tal-calc-entrada">
            <input
              id="tal-margen"
              className="input num"
              inputMode="decimal"
              value={margenTexto}
              onChange={(e) => setMargenTexto(e.target.value)}
              aria-invalid={margenOk ? undefined : true}
              aria-describedby="tal-margen-ayuda"
            />
            <span className="inv-entrada-post" aria-hidden="true">
              %
            </span>
          </div>
        </div>
        <p className="ayuda adm-sin-margen" id="tal-margen-ayuda">
          {margenOk
            ? `Precio = costo por pieza ÷ ${numero(1 - margenObjetivo! / 100, 2)} (redondeado al peso). No cambia ningún precio: si te convence, usa «Aplicar» en su renglón.`
            : 'Escribe un margen entre 0 y 99 %.'}
        </p>
      </section>

      {costos.length === 0 ? (
        <Vacio titulo="Aún no hay fórmulas">
          <p>Anota la fórmula de cada jabón o vela: con ella sabes cuánto cuesta cada pieza y el taller descuenta la materia prima al hacer un lote.</p>
          <button type="button" className="btn btn-primario" onClick={() => onEditar(null)}>
            + Nueva fórmula
          </button>
        </Vacio>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla inv-tabla inv-tabla-tarjetas cos-tabla tal-tabla-formulas">
            <caption className="sr-only">Costo, precio y margen de cada fórmula, agrupadas por producto</caption>
            <thead>
              <tr>
                <th scope="col">Fórmula</th>
                <th scope="col" className="num">
                  Costo por lote
                </th>
                <th scope="col" className="num">
                  Costo por pieza
                </th>
                <th scope="col" className="num">
                  Precio actual
                </th>
                <th scope="col" className="num">
                  Margen
                </th>
                <th scope="col" className="num">
                  Precio sugerido
                </th>
              </tr>
            </thead>
            {grupos.map((g) => (
              <tbody key={g.producto_id}>
                <tr className="cos-grupo">
                  <th scope="colgroup" colSpan={6}>
                    {g.nombre}
                  </th>
                </tr>
                {g.filas.map((c) => {
                  const f = formulaPorId.get(c.formula_id);
                  const sugerido = margenOk ? precioSugerido(c.costo_pieza, margenObjetivo!) : null;
                  const tono = c.margen_pct === null ? '' : c.margen_pct < 0 ? 'cos-negativo' : c.margen_pct < MARGEN_MINIMO_PCT ? 'cos-bajo' : 'cos-bien';
                  const igual = sugerido !== null && c.precio_venta !== null && Math.abs(sugerido - c.precio_venta) < 0.005;
                  return (
                    <tr key={c.formula_id}>
                      <td className="inv-celda-titulo">
                        <button
                          type="button"
                          className="cos-servicio"
                          onClick={() => f && onEditar(f)}
                          disabled={!f}
                          aria-label={`Editar la fórmula ${c.nombre}`}
                          title="Editar la fórmula"
                        >
                          {c.nombre}
                        </button>
                        {f && !f.activa && <span className="pill pill-gris adm-pill-junto">Inactiva</span>}
                        <span className="adm-sub">
                          Rinde {numero(c.rendimiento_piezas, 2)} {c.rendimiento_piezas === 1 ? 'pieza' : 'piezas'} ·{' '}
                          {c.dias_curado > 0 ? `${c.dias_curado} días de curado` : 'sin curado'} · {c.insumos.length}{' '}
                          {c.insumos.length === 1 ? 'insumo' : 'insumos'}
                        </span>
                      </td>
                      <td data-etiqueta="Por lote" className="num">
                        {pesos(c.costo_lote)}
                      </td>
                      <td data-etiqueta="Por pieza" className="num">
                        {dineroUnitario(Math.round(c.costo_pieza * 100) / 100)}
                      </td>
                      <td data-etiqueta="Precio" className="num">
                        {c.precio_venta === null ? <span className="texto-3">Sin precio</span> : pesos(c.precio_venta)}
                      </td>
                      <td data-etiqueta="Margen" className={`num ${tono}`}>
                        {c.margen_pieza === null || c.margen_pct === null ? (
                          <span className="texto-3">—</span>
                        ) : (
                          <span className="inv-valor">
                            <span>{porcentaje(c.margen_pct)}</span>
                            <span className="adm-sub">{pesos(c.margen_pieza)} por pieza</span>
                          </span>
                        )}
                      </td>
                      <td data-etiqueta={`Sugerido (${margenOk ? porcentaje(margenObjetivo) : '—'})`} className="num tal-celda-sugerido">
                        {sugerido === null ? (
                          <span className="texto-3">—</span>
                        ) : (
                          <span className="tal-sugerido">
                            <strong>{pesos(sugerido)}</strong>
                            {igual ? (
                              <span className="adm-sub">Es el precio actual</span>
                            ) : (
                              porProducto.has(c.producto_id) && (
                                <button
                                  type="button"
                                  className="btn btn-secundario btn-sm"
                                  onClick={() => aplicar(c, sugerido)}
                                  aria-label={`Aplicar ${pesos(sugerido)} como precio de ${c.producto_nombre}`}
                                >
                                  Aplicar
                                </button>
                              )
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {sinFormula.length > 0 && (
        <div className="aviso aviso-info tal-sin-formula">
          <div>
            <p className="adm-sin-margen">
              <strong>Sin fórmula todavía:</strong> sin fórmula no sabemos cuánto cuesta cada pieza.
            </p>
            <div className="tal-sin-formula-lista">
              {sinFormula.map((p) => (
                <button key={p.id} type="button" className="btn btn-secundario btn-sm" onClick={() => onEditar(null, p.id)}>
                  Crear fórmula de {p.nombre}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <p className="ayuda inv-nota-pie">
        Margen = precio − costo de la materia prima por pieza. No incluye renta, sueldos ni el tiempo de elaboración: esos se ven en Resultados.
      </p>
      {dialogo}
    </>
  );
}
