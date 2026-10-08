// «Registrar lote»: una tanda de jabones o velas. Descuenta la materia prima (la de la fórmula escalada a
// las piezas, o lo que realmente se usó), calcula el costo por pieza y dice desde cuándo estará lista.
import { useEffect, useState, type FormEvent } from 'react';
import { api, type Formula, type NuevoLote, type Producto, type ResultadoLote } from '../../lib/api';
import { fechaEnLetra, numero, sumarDias } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { Modal } from './Modal';
import { Casilla } from './Piezas';
import { EntradaConUnidad, SelectorProducto, centavos, pesos } from './InventarioPiezas';
import { esDeVenta, esMateriaPrima, hoyLocal } from './TallerPiezas';
import { aNumero, aTexto, cantidadConUnidad, dineroUnitario, porTexto, textoONulo } from './util';

interface Linea {
  clave: number;
  insumo_id: string;
  cantidad: string;
}
let siguiente = 1;
const redondear = (n: number) => Math.round(n * 1000) / 1000;

interface Props {
  productos: Producto[];
  formulas: Formula[];
  /** Producto ya elegido (p. ej. desde su ficha). */
  productoId?: string | null;
  onCerrar: () => void;
  /** Abre el editor de fórmulas para ese producto (un jabón no se registra sin fórmula). */
  onCrearFormula?: (productoId: string) => void;
  /** Se llama al cerrar la pantalla de resultado (para recargar el taller). */
  onListo: (mensaje: string) => void;
}

export function TallerRegistrarLote({ productos, formulas, productoId, onCerrar, onCrearFormula, onListo }: Props) {
  const hoy = hoyLocal();
  const conFormula = new Set(formulas.filter((f) => f.activa).map((f) => f.producto_id));
  const terminados = productos
    .filter((p) => p.activo && esDeVenta(p))
    .sort((a, b) => Number(conFormula.has(b.id)) - Number(conFormula.has(a.id)) || porTexto<Producto>((x) => x.nombre)(a, b));
  const primero = productoId ?? terminados.find((p) => conFormula.has(p.id))?.id ?? '';

  const [producto, setProducto] = useState(primero);
  const formulasDe = (id: string) => formulas.filter((f) => f.producto_id === id && f.activa);
  const [formulaId, setFormulaId] = useState(formulasDe(primero)[0]?.id ?? '');
  const formula = formulas.find((f) => f.id === formulaId) ?? null;
  const [piezas, setPiezas] = useState(aTexto(formula?.rendimiento_piezas));
  const [elaborado, setElaborado] = useState(hoy);
  const [caduca, setCaduca] = useState('');
  const [notas, setNotas] = useState('');
  const [ajustar, setAjustar] = useState(false);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);
  const [intentado, setIntentado] = useState(false);

  const porId = new Map(productos.map((p) => [p.id, p]));
  // Un jabón necesita su fórmula: de ahí salen los días de curado. Sin ella quedaría a la venta sin curar.
  const exigeFormula = porId.get(producto)?.categoria === 'jabon';
  const faltaFormula = exigeFormula && !formula;
  const nPiezas = aNumero(piezas);
  const piezasOk = nPiezas !== null && nPiezas > 0;
  const factor = formula && piezasOk ? nPiezas! / formula.rendimiento_piezas : null;
  const escalados = formula && factor !== null ? formula.items.map((i) => ({ insumo_id: i.insumo_id, cantidad: redondear(i.cantidad * factor) })) : [];
  // Sin fórmula hay que anotar los materiales a mano (salvo un jabón: primero va su fórmula).
  const manual = !faltaFormula && (ajustar || !formula);

  // Al cambiar de producto: su primera fórmula activa y su rendimiento.
  const elegirProducto = (id: string) => {
    setProducto(id);
    const f = formulasDe(id)[0] ?? null;
    setFormulaId(f?.id ?? '');
    setPiezas(aTexto(f?.rendimiento_piezas));
    setLineas([]);
  };
  const elegirFormula = (id: string) => {
    setFormulaId(id);
    const f = formulas.find((x) => x.id === id);
    if (f) setPiezas(aTexto(f.rendimiento_piezas));
    setLineas([]);
  };

  // Al activar «ajustar» se parte de la fórmula escalada a las piezas (y al cambiar de producto sin fórmula,
  // de un renglón vacío).
  useEffect(() => {
    if (!manual || lineas.length) return;
    const base = escalados.length ? escalados : [{ insumo_id: '', cantidad: 0 }];
    setLineas(base.map((i) => ({ clave: siguiente++, insumo_id: i.insumo_id, cantidad: i.cantidad ? aTexto(i.cantidad) : '' })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual, formulaId, producto]);

  const usados = manual
    ? lineas.map((l) => ({ insumo_id: l.insumo_id, cantidad: aNumero(l.cantidad) }))
    : escalados.map((i) => ({ insumo_id: i.insumo_id, cantidad: i.cantidad as number | null }));
  const filas = usados
    .filter((u) => u.insumo_id)
    .map((u) => {
      const p = porId.get(u.insumo_id);
      const falta = p && u.cantidad !== null && u.cantidad > p.stock_actual + 1e-9;
      return { ...u, p, costo: p && u.cantidad ? u.cantidad * p.costo_unitario : 0, falta };
    });
  const costoMateriales = centavos(filas.reduce((s, f) => s + f.costo, 0));
  const costoPieza = piezasOk && costoMateriales > 0 ? costoMateriales / nPiezas! : null;
  const dias = formula?.dias_curado ?? 0;
  const listoDesde = elaborado ? sumarDias(elaborado, dias) : null;
  const faltantes = filas.filter((f) => f.falta);
  const insumos = productos.filter((p) => esMateriaPrima(p.categoria) || p.uso === 'produccion' || lineas.some((l) => l.insumo_id === p.id));
  const enUso = new Set(lineas.map((l) => l.insumo_id).filter(Boolean));

  const cambiar = (clave: number, c: Partial<Linea>) => setLineas((xs) => xs.map((l) => (l.clave === clave ? { ...l, ...c } : l)));
  const quitar = (clave: number) =>
    setLineas((xs) => (xs.length <= 1 ? [{ clave: siguiente++, insumo_id: '', cantidad: '' }] : xs.filter((l) => l.clave !== clave)));

  const errores = {
    producto: !producto ? 'Elige qué producto vas a hacer.' : null,
    formula: faltaFormula ? 'Los jabones necesitan una fórmula con sus días de curado; elígela o créala primero.' : null,
    piezas: !piezasOk ? 'Escribe cuántas piezas planeas sacar (mayor a cero).' : null,
    elaborado: !elaborado ? 'Escribe la fecha de elaboración.' : elaborado > hoy ? 'La fecha de elaboración no puede ser futura.' : null,
    caduca: caduca && elaborado && caduca <= elaborado ? 'La caducidad debe ser después de la elaboración.' : null,
  };
  const marca = (k: keyof typeof errores) => (intentado ? errores[k] : null);

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    const primero = Object.values(errores).find(Boolean);
    if (primero) throw new Error(primero);
    let items: NuevoLote['items'] = null;
    if (manual) {
      items = [];
      for (const l of lineas) {
        if (!l.insumo_id && !l.cantidad.trim()) continue;
        if (!l.insumo_id) throw new Error('Elige el insumo de cada renglón o quita los que no uses.');
        const c = aNumero(l.cantidad);
        if (c === null || c <= 0) throw new Error(`Escribe cuánto se usó de ${porId.get(l.insumo_id)?.nombre ?? 'cada insumo'} (mayor a cero).`);
        items.push({ insumo_id: l.insumo_id, cantidad: c });
      }
      if (items.length === 0) throw new Error('Anota al menos un material usado.');
    }
    return api.admin.registrarLote({
      producto_id: producto,
      formula_id: formula?.id ?? null,
      piezas: nPiezas,
      elaborado_en: elaborado,
      caduca_en: caduca || null,
      notas: textoONulo(notas),
      items,
    });
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    setError(null);
    const r = await ejecutar();
    if (r) setResultado(r);
  };

  const nombreProducto = porId.get(producto)?.nombre ?? 'el producto';

  // ---------- Lote registrado ----------
  if (resultado) {
    const disponible = resultado.estado === 'disponible';
    const mensaje = `Lote ${resultado.codigo} de ${nombreProducto} registrado${disponible ? ': ya está disponible para venta' : `: listo desde el ${fechaEnLetra(resultado.listo_desde, false)}`}.`;
    const cerrar = () => onListo(mensaje);
    return (
      <Modal
        titulo="Lote registrado"
        onCerrar={cerrar}
        pie={
          <button type="button" className="btn btn-primario" onClick={cerrar} data-autofoco>
            Listo
          </button>
        }
      >
        <div className="pila">
          <div className="tal-resultado">
            <span className="tal-resultado-etiqueta">Código del lote</span>
            <span className="tal-resultado-codigo num">{resultado.codigo}</span>
            <span className="texto-2">Escríbelo en la etiqueta o en el molde: así sabes de qué tanda es cada pieza.</span>
          </div>
          <dl className="cos-resumen">
            <div>
              <dt>Materiales</dt>
              <dd className="num">{pesos(resultado.costo_materiales)}</dd>
            </div>
            <div>
              <dt>Costo por pieza</dt>
              <dd className="num">{resultado.costo_unitario === null ? '—' : dineroUnitario(Math.round(resultado.costo_unitario * 100) / 100)}</dd>
            </div>
            <div>
              <dt>{disponible ? 'Disponible' : 'Listo desde'}</dt>
              <dd className="tal-resultado-fecha">{disponible ? 'Ya, sin curado' : fechaEnLetra(resultado.listo_desde, false)}</dd>
            </div>
          </dl>
          <p className="aviso aviso-info adm-sin-margen">
            {disponible
              ? 'No lleva curado: sus piezas ya están en el inventario y se pueden vender.'
              : 'La materia prima ya se descontó del inventario. El costo por pieza es provisional: al liberar el lote se reparte entre las piezas que salgan.'}
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      titulo="Registrar lote"
      onCerrar={onCerrar}
      bloqueado={enviando}
      ancho="amplio"
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="tal-form-lote" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Registrando…' : 'Registrar lote'}
          </button>
        </>
      }
    >
      <form id="tal-form-lote" className="inv-modal-ancho inv-lineas-contenedor" onSubmit={enviar} noValidate>
        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="lote-producto">
              Producto
            </label>
            <select
              id="lote-producto"
              className="input"
              value={producto}
              onChange={(e) => elegirProducto(e.target.value)}
              aria-invalid={marca('producto') ? true : undefined}
            >
              <option value="">Elige un producto…</option>
              {terminados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {conFormula.has(p.id) ? '' : p.categoria === 'jabon' ? ' (falta su fórmula)' : ' (sin fórmula)'}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="lote-formula">
              Fórmula
            </label>
            <select
              id="lote-formula"
              className="input"
              value={formulaId}
              onChange={(e) => elegirFormula(e.target.value)}
              disabled={!producto || (faltaFormula && formulasDe(producto).length === 0)}
              aria-invalid={marca('formula') ? true : undefined}
              aria-describedby={faltaFormula ? 'lote-formula-ayuda' : undefined}
            >
              {formulasDe(producto).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre} · rinde {numero(f.rendimiento_piezas, 2)} pz
                </option>
              ))}
              {exigeFormula ? (
                formulasDe(producto).length === 0 && <option value="">Aún no tiene fórmula</option>
              ) : (
                <option value="">Sin fórmula (anoto los materiales)</option>
              )}
            </select>
            {!exigeFormula && producto && formulasDe(producto).length === 0 && (
              <span className="ayuda">Este producto aún no tiene fórmula: anota abajo los materiales que usaste.</span>
            )}
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="lote-piezas">
              Piezas planeadas
            </label>
            <EntradaConUnidad id="lote-piezas" valor={piezas} onCambio={setPiezas} unidad="pz" invalido={!!marca('piezas')} descrita="lote-piezas-ayuda" />
            <span className="ayuda" id="lote-piezas-ayuda">
              {formula && factor !== null && Math.abs(factor - 1) > 1e-9
                ? `Es ${numero(factor, 2)} veces la fórmula: los materiales se escalan.`
                : formula
                  ? 'Un lote completo de la fórmula.'
                  : 'Cuántas piezas esperas sacar.'}
            </span>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="lote-elaborado">
              Fecha de elaboración
            </label>
            <input
              id="lote-elaborado"
              className="input"
              type="date"
              value={elaborado}
              max={hoy}
              onChange={(e) => setElaborado(e.target.value)}
              aria-invalid={marca('elaborado') ? true : undefined}
            />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="lote-caduca">
              Caducidad (opcional)
            </label>
            <input
              id="lote-caduca"
              className="input"
              type="date"
              value={caduca}
              min={elaborado || undefined}
              onChange={(e) => setCaduca(e.target.value)}
              aria-invalid={marca('caduca') ? true : undefined}
            />
          </div>
          <div className="campo">
            <span className="etiqueta">Listo para vender</span>
            <p className="tal-listo-desde adm-sin-margen" aria-live="polite">
              {!listoDesde
                ? '—'
                : faltaFormula
                  ? 'Depende del curado de su fórmula'
                  : dias > 0
                  ? `Desde el ${fechaEnLetra(listoDesde, false)} (${dias} días de curado)`
                  : 'En cuanto lo registres (sin curado)'}
            </p>
          </div>
        </div>

        {faltaFormula && (
          <div className="aviso aviso-alerta adm-margen-arriba" id="lote-formula-ayuda">
            <p className="adm-sin-margen">
              Los jabones necesitan su fórmula: de ahí salen los días de curado, y sin curar no se pueden vender. Antes de registrar un lote de{' '}
              {nombreProducto}, anota su fórmula (el jabón en frío cura de 28 a 42 días).
            </p>
            {onCrearFormula && (
              <button type="button" className="btn btn-secundario btn-sm adm-margen-arriba" onClick={() => onCrearFormula(producto)}>
                Crear su fórmula
              </button>
            )}
          </div>
        )}

        {!faltaFormula && (
          <Casilla
            etiqueta="Ajustar materiales usados"
            checked={manual}
            onChange={setAjustar}
            disabled={!formula}
            ayuda={
              formula
                ? 'Si usaste cantidades distintas a la fórmula (o cambiaste un insumo), anótalas para que el inventario y el costo queden exactos.'
                : 'Sin fórmula, anota lo que usaste.'
            }
          />
        )}

        {manual ? (
          <fieldset className="inv-lineas cos-lineas">
            <legend className="inv-lineas-titulo">Materiales usados</legend>
            <div className="inv-linea tal-linea inv-linea-cabeza" aria-hidden="true">
              <span>Insumo</span>
              <span>Cantidad</span>
              <span className="inv-der">Costo</span>
              <span />
            </div>
            <ol className="inv-lineas-lista">
              {lineas.map((l, i) => {
                const p = porId.get(l.insumo_id);
                const c = aNumero(l.cantidad);
                const n = i + 1;
                const falta = p && c !== null && c > p.stock_actual + 1e-9;
                return (
                  <li key={l.clave} className="inv-linea tal-linea">
                    <div className="inv-linea-producto">
                      <label className="inv-etiqueta-linea" htmlFor={`lote-ins-${l.clave}`}>
                        Insumo {n}
                      </label>
                      <SelectorProducto
                        id={`lote-ins-${l.clave}`}
                        productos={insumos}
                        valor={l.insumo_id}
                        onCambio={(id) => cambiar(l.clave, { insumo_id: id })}
                        excluir={enUso}
                        textoVacio="Elige materia prima o envase…"
                      />
                      {p && (
                        <span className={`adm-sub ${falta ? 'tal-falta' : ''}`}>
                          Hay {cantidadConUnidad(p.stock_actual, p.unidad_medida, 3)}
                          {falta ? ' · no alcanza' : ''}
                        </span>
                      )}
                    </div>
                    <div>
                      <label className="inv-etiqueta-linea" htmlFor={`lote-cant-${l.clave}`}>
                        Cantidad
                      </label>
                      <EntradaConUnidad
                        id={`lote-cant-${l.clave}`}
                        valor={l.cantidad}
                        onCambio={(v) => cambiar(l.clave, { cantidad: v })}
                        unidad={p?.unidad_medida ?? '—'}
                        etiquetaAccesible={`Cantidad usada del insumo ${n}${p ? ` en ${p.unidad_medida}` : ''}`}
                        invalido={!!falta}
                      />
                    </div>
                    <div className="inv-linea-subtotal num">
                      <span className="inv-etiqueta-linea">Costo</span>
                      <strong>{p && c ? pesos(c * p.costo_unitario) : '—'}</strong>
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
            <button type="button" className="btn btn-secundario btn-sm" onClick={() => setLineas((xs) => [...xs, { clave: siguiente++, insumo_id: '', cantidad: '' }])}>
              + Agregar insumo
            </button>
          </fieldset>
        ) : (
          formula && (
            <div className="tal-materiales">
              <p className="etiqueta adm-sin-margen">Se descontará del inventario</p>
              <ul className="tal-materiales-lista">
                {filas.map((f) => (
                  <li key={f.insumo_id} className={f.falta ? 'tal-falta' : ''}>
                    <span>{f.p?.nombre ?? 'Insumo'}</span>
                    <span className="num">
                      {f.p ? cantidadConUnidad(f.cantidad, f.p.unidad_medida, 3) : numero(f.cantidad, 3)}
                      {f.falta && f.p ? ` · hay ${cantidadConUnidad(f.p.stock_actual, f.p.unidad_medida, 3)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}

        {faltantes.length > 0 && (
          <p className="aviso aviso-alerta adm-margen-arriba">
            No alcanza el inventario de {faltantes.map((f) => f.p?.nombre).join(', ')}. Registra la compra en Inventario o ajusta las cantidades.
          </p>
        )}

        <dl className="cos-resumen" aria-live="polite">
          <div>
            <dt>Costo de materiales</dt>
            <dd className="num">{pesos(costoMateriales)}</dd>
          </div>
          <div>
            <dt>Costo por pieza</dt>
            <dd className="num">{costoPieza === null ? '—' : dineroUnitario(Math.round(costoPieza * 100) / 100)}</dd>
          </div>
        </dl>

        <div className="campo adm-margen-arriba">
          <label className="etiqueta" htmlFor="lote-notas">
            Notas (opcional)
          </label>
          <textarea
            id="lote-notas"
            className="input"
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Molde, temperatura, quién lo hizo, algo que cambiaste…"
          />
        </div>
        <MensajeError error={error} />
      </form>
    </Modal>
  );
}
