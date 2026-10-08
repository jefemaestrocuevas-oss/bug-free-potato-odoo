// Editor de una fórmula del taller: insumos (materia prima y envases) para un lote completo, rendimiento
// en piezas, días de curado e instrucciones; calcula en vivo el costo por lote y por pieza.
import { useState } from 'react';
import { api, type Formula, type FormulaEditable, type Producto } from '../../lib/api';
import { porcentaje } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { Modal, useConfirmar } from './Modal';
import { Casilla } from './Piezas';
import { EntradaConUnidad, SelectorProducto, centavos, nombrePresentacion, pesos } from './InventarioPiezas';
import { MARGEN_MINIMO_PCT } from './CostosReceta';
import { esDeVenta, esMateriaPrima, margenPct } from './TallerPiezas';
import { aNumero, aTexto, dineroUnitario, porTexto, textoONulo } from './util';

interface Linea {
  clave: number;
  insumo_id: string;
  cantidad: string;
}

let siguiente = 1;
const lineaVacia = (): Linea => ({ clave: siguiente++, insumo_id: '', cantidad: '' });

/** Costo de los insumos a costo actual: Σ cantidad × costo por unidad. */
export function costoInsumos(lineas: { insumo_id: string; cantidad: number | null }[], porId: Map<string, Producto>): number {
  return centavos(lineas.reduce((s, l) => s + (l.cantidad && l.cantidad > 0 ? l.cantidad * (porId.get(l.insumo_id)?.costo_unitario ?? 0) : 0), 0));
}

interface Props {
  /** null = fórmula nueva */
  formula: Formula | null;
  /** Producto ya elegido para una fórmula nueva. */
  productoId?: string | null;
  productos: Producto[];
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void;
}

export function TallerFormFormula({ formula, productoId, productos, onCerrar, onGuardado }: Props) {
  const f = formula;
  const [producto, setProducto] = useState(f?.producto_id ?? productoId ?? '');
  const [nombre, setNombre] = useState(f?.nombre ?? '');
  const [rendimiento, setRendimiento] = useState(aTexto(f?.rendimiento_piezas));
  const [dias, setDias] = useState(aTexto(f?.dias_curado ?? 0));
  const [instrucciones, setInstrucciones] = useState(f?.instrucciones ?? '');
  const [activa, setActiva] = useState(f?.activa ?? true);
  const [lineas, setLineas] = useState<Linea[]>(() =>
    f?.items.length ? f.items.map((i) => ({ clave: siguiente++, insumo_id: i.insumo_id, cantidad: aTexto(i.cantidad) })) : [lineaVacia(), lineaVacia()],
  );
  const [intentado, setIntentado] = useState(false);
  const { confirmar, dialogo } = useConfirmar();
  const firma = () =>
    JSON.stringify([
      producto,
      nombre.trim(),
      aNumero(rendimiento),
      aNumero(dias),
      instrucciones.trim(),
      activa,
      lineas.filter((l) => l.insumo_id || l.cantidad.trim()).map((l) => [l.insumo_id, aNumero(l.cantidad)]),
    ]);
  const [original] = useState(firma);

  const porId = new Map(productos.map((p) => [p.id, p]));
  const terminados = productos.filter((p) => esDeVenta(p) && (p.activo || p.id === producto)).sort(porTexto((p) => p.nombre));
  // Insumos: materia prima y envases (y lo que la fórmula ya use, aunque sea de otra categoría).
  const enUso = new Set(lineas.map((l) => l.insumo_id).filter(Boolean));
  const insumos = productos.filter((p) => esMateriaPrima(p.categoria) || p.uso === 'produccion' || enUso.has(p.id));
  const elegido = porId.get(producto);

  const calculadas = lineas.map((l) => {
    const p = porId.get(l.insumo_id);
    const cant = aNumero(l.cantidad);
    return { l, p, cant, costo: p && cant !== null && cant > 0 ? cant * p.costo_unitario : null };
  });
  const nRend = aNumero(rendimiento);
  const nDias = dias.trim() === '' ? 0 : aNumero(dias);
  const costoLote = costoInsumos(
    calculadas.map((c) => ({ insumo_id: c.l.insumo_id, cantidad: c.cant })),
    porId,
  );
  const costoPieza = nRend && nRend > 0 ? costoLote / nRend : null;
  const precio = elegido?.precio_venta ?? null;
  const margen = costoPieza !== null && costoLote > 0 ? margenPct(precio, costoPieza) : null;
  const sinCosto = calculadas.filter((c) => c.p && c.cant && c.p.costo_unitario <= 0).map((c) => c.p!.nombre);

  const cambiar = (clave: number, cambios: Partial<Linea>) => setLineas((xs) => xs.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  const quitar = (clave: number) => setLineas((xs) => (xs.length <= 1 ? [lineaVacia()] : xs.filter((l) => l.clave !== clave)));

  const errores = {
    producto: !producto ? 'Elige el producto que sale de esta fórmula.' : null,
    nombre: !nombre.trim() ? 'Ponle nombre a la fórmula (p. ej. «Avena y miel, lote de 12»).' : null,
    rendimiento: nRend === null || nRend <= 0 ? 'Escribe cuántas piezas salen de un lote (mayor a cero).' : null,
    dias: nDias === null || nDias < 0 || !Number.isInteger(nDias) ? 'Los días de curado son un número entero (0 si no lleva).' : null,
  };
  const marca = (k: keyof typeof errores) => (intentado ? errores[k] : null);

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    const primero = Object.values(errores).find(Boolean);
    if (primero) throw new Error(primero);
    const items: FormulaEditable['items'] = [];
    for (const c of calculadas) {
      if (!c.l.insumo_id && !c.l.cantidad.trim()) continue;
      if (!c.l.insumo_id) throw new Error('Elige el insumo de cada renglón o quita los que no uses.');
      if (c.cant === null || c.cant <= 0) throw new Error(`Escribe cuánto lleva de ${c.p?.nombre ?? 'cada insumo'} (mayor a cero).`);
      items.push({ insumo_id: c.l.insumo_id, cantidad: c.cant });
    }
    if (items.length === 0) throw new Error('La fórmula necesita al menos un insumo.');
    await api.admin.guardarFormula({
      id: f?.id,
      producto_id: producto,
      nombre: nombre.trim(),
      rendimiento_piezas: nRend!,
      dias_curado: nDias!,
      instrucciones: textoONulo(instrucciones),
      activa,
      items,
    });
    return true;
  });

  const guardar = async () => {
    setIntentado(true);
    setError(null);
    if (await ejecutar())
      onGuardado(
        `Fórmula «${nombre.trim()}» guardada. Cuesta ${pesos(costoLote)} por lote${costoPieza !== null ? ` (${dineroUnitario(costoPieza)} por pieza)` : ''}.`,
      );
  };

  const cerrar = () => {
    if (enviando) return;
    if (firma() === original) return onCerrar();
    confirmar({
      titulo: '¿Salir sin guardar?',
      mensaje: <p>Si sales ahora, se pierden los cambios de esta fórmula.</p>,
      textoBoton: 'Salir sin guardar',
      peligro: true,
      accion: async () => undefined,
      alTerminar: onCerrar,
    });
  };

  const tono = margen === null ? '' : margen < 0 ? 'cos-negativo' : margen < MARGEN_MINIMO_PCT ? 'cos-bajo' : 'cos-bien';

  return (
    <Modal
      titulo={f ? `Fórmula · ${f.nombre}` : 'Nueva fórmula'}
      onCerrar={cerrar}
      bloqueado={enviando}
      ancho="completo"
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={cerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="for-form" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar fórmula'}
          </button>
        </>
      }
    >
      <form
        id="for-form"
        className="inv-modal-ancho inv-lineas-contenedor"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <p className="texto-2 cos-modal-intro">
          Escribe lo que lleva <strong>un lote completo</strong>, en la unidad de cada insumo (g, ml o piezas), y cuántas piezas salen. Al registrar un lote,
          estos materiales se descuentan del inventario.
        </p>
        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="for-producto">
              Producto que sale
            </label>
            <select
              id="for-producto"
              className="input"
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              aria-invalid={marca('producto') ? true : undefined}
            >
              <option value="">Elige un producto…</option>
              {terminados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="for-nombre">
              Nombre de la fórmula
            </label>
            <input
              id="for-nombre"
              className="input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              aria-invalid={marca('nombre') ? true : undefined}
              placeholder="Avena y miel · molde de 12"
            />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="for-rendimiento">
              Rendimiento (piezas por lote)
            </label>
            <EntradaConUnidad id="for-rendimiento" valor={rendimiento} onCambio={setRendimiento} unidad="pz" invalido={!!marca('rendimiento')} placeholder="12" />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="for-dias">
              Días de curado
            </label>
            <EntradaConUnidad id="for-dias" valor={dias} onCambio={setDias} unidad="días" invalido={!!marca('dias')} descrita="for-dias-ayuda" />
            <span className="ayuda" id="for-dias-ayuda">
              Jabón en frío ≈ 28–42 días; vela ≈ 0–14 (para que asiente el aroma). 0 = se vende en cuanto se hace.
            </span>
          </div>
        </div>

        <fieldset className="inv-lineas cos-lineas">
          <legend className="inv-lineas-titulo">Insumos para un lote</legend>
          <div className="inv-linea tal-linea inv-linea-cabeza" aria-hidden="true">
            <span>Insumo</span>
            <span>Cantidad</span>
            <span className="inv-der">Costo</span>
            <span />
          </div>
          <ol className="inv-lineas-lista">
            {calculadas.map(({ l, p, costo }, i) => {
              const n = i + 1;
              return (
                <li key={l.clave} className="inv-linea tal-linea">
                  <div className="inv-linea-producto">
                    <label className="inv-etiqueta-linea" htmlFor={`for-ins-${l.clave}`}>
                      Insumo {n}
                    </label>
                    <SelectorProducto
                      id={`for-ins-${l.clave}`}
                      productos={insumos}
                      valor={l.insumo_id}
                      onCambio={(id) => cambiar(l.clave, { insumo_id: id })}
                      excluir={enUso}
                      textoVacio="Elige materia prima o envase…"
                    />
                    {p && (
                      <span className="adm-sub">
                        {nombrePresentacion(p)} a {pesos(p.costo_presentacion)} → {dineroUnitario(p.costo_unitario)} por {p.unidad_medida}
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="inv-etiqueta-linea" htmlFor={`for-cant-${l.clave}`}>
                      Cantidad
                    </label>
                    <EntradaConUnidad
                      id={`for-cant-${l.clave}`}
                      valor={l.cantidad}
                      onCambio={(v) => cambiar(l.clave, { cantidad: v })}
                      unidad={p?.unidad_medida ?? '—'}
                      etiquetaAccesible={`Cantidad del insumo ${n}${p ? ` en ${p.unidad_medida}` : ''}`}
                    />
                  </div>
                  <div className="inv-linea-subtotal num">
                    <span className="inv-etiqueta-linea">Costo</span>
                    <strong>{costo === null ? '—' : costo > 0 && costo < 0.01 ? dineroUnitario(costo) : pesos(costo)}</strong>
                  </div>
                  <div className="inv-linea-quitar">
                    <button type="button" className="btn btn-texto btn-sm adm-texto-peligro" onClick={() => quitar(l.clave)} aria-label={`Quitar el insumo ${n}`}>
                      Quitar
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <button type="button" className="btn btn-secundario btn-sm" onClick={() => setLineas((xs) => [...xs, lineaVacia()])}>
            + Agregar insumo
          </button>
          {insumos.length === 0 && (
            <p className="aviso aviso-info adm-margen-arriba adm-sin-margen">
              Aún no hay materia prima en el inventario. Dala de alta en Inventario → Productos (categoría «Materia prima» o «Envase»).
            </p>
          )}
        </fieldset>

        <dl className="cos-resumen" aria-live="polite">
          <div>
            <dt>Costo por lote</dt>
            <dd className="num">{pesos(costoLote)}</dd>
          </div>
          <div>
            <dt>Costo por pieza</dt>
            <dd className="num">{costoPieza === null ? '—' : dineroUnitario(Math.round(costoPieza * 100) / 100)}</dd>
          </div>
          <div>
            <dt>Precio actual</dt>
            <dd className="num">{precio === null ? <span className="texto-3">Sin precio</span> : pesos(precio)}</dd>
          </div>
          <div>
            <dt>Margen por pieza</dt>
            <dd className={`num ${tono}`}>
              {margen === null || costoPieza === null || precio === null ? (
                <span className="texto-3">—</span>
              ) : (
                <>
                  {pesos(precio - costoPieza)}
                  <span className="cos-resumen-pct"> · {porcentaje(margen)}</span>
                </>
              )}
            </dd>
          </div>
        </dl>
        {sinCosto.length > 0 && (
          <p className="aviso aviso-alerta adm-margen-arriba">
            {sinCosto.join(', ')} {sinCosto.length === 1 ? 'no tiene' : 'no tienen'} costo: registra su compra en Inventario para que el costo salga completo.
          </p>
        )}
        {margen !== null && margen < MARGEN_MINIMO_PCT && (
          <p className="aviso aviso-alerta adm-margen-arriba">
            La materia prima se lleva más de la mitad del precio. Revisa las cantidades, el rendimiento o el precio en la pestaña «Fórmulas».
          </p>
        )}

        <div className="campo adm-margen-arriba">
          <label className="etiqueta" htmlFor="for-instrucciones">
            Instrucciones (opcional)
          </label>
          <textarea
            id="for-instrucciones"
            className="input"
            rows={4}
            value={instrucciones}
            onChange={(e) => setInstrucciones(e.target.value)}
            placeholder="Temperaturas, orden de los ingredientes, molde, cuándo agregar los aceites esenciales…"
          />
        </div>
        <Casilla
          etiqueta="Fórmula activa"
          checked={activa}
          onChange={setActiva}
          ayuda="Las inactivas se guardan para consulta, pero ya no aparecen al registrar un lote."
        />
        <p className="ayuda adm-sin-margen">Los costos usan el último precio de compra de cada insumo; cambian solos al registrar una compra nueva.</p>
        <MensajeError error={error} />
      </form>
      {dialogo}
    </Modal>
  );
}
