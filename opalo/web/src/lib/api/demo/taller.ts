// Taller del modo demostración: fórmulas y lotes de jabones y velas (ESPEC §10.2).
// Imita guardar_formula, registrar_lote, liberar_lote y descartar_lote con los mismos mensajes y el mismo
// orden de validaciones que la base. Los productos terminados (jabón, vela, set) se manejan por pieza.
import { fechaLocal, sumarDias } from '../../format';
import type { CategoriaProducto, FormulaEditable, FormulaItem, NuevoLote, ResultadoLote } from '../tipos';
import type { Db, FormulaFila, LoteFila } from './modelo';
import { type Ctx, exigirPersonal, LIMITES, MSG, MSG_EXTRA } from './permisos';
import { insertarMovimiento } from './reglas';
import { cantidadLegible, esFecha, falla, fechaLegible, numeroONulo, numeroOpcional, redondear, textoONulo, uuid } from './utilidades';
import { costoUnitario } from './vistas';

const ahoraIso = (ctx: Ctx) => ctx.ahora.toISOString();
const hoyDe = (ctx: Ctx) => fechaLocal(ctx.ahora);

/** Prefijo del código de lote según la categoría del producto (como tg_lotes_codigo). */
function prefijoLote(categoria: CategoriaProducto | undefined): string {
  return categoria === 'jabon' ? 'JAB' : categoria === 'vela' ? 'VEL' : categoria === 'set' ? 'SET' : 'PRD';
}

/** JAB|VEL|SET|PRD-AAMMDD-NN: NN sigue al mayor número ya usado ese día para ese tipo. */
export function codigoLote(db: Db, categoria: CategoriaProducto | undefined, elaborado: string): string {
  const prefijo = `${prefijoLote(categoria)}-${elaborado.slice(2, 4)}${elaborado.slice(5, 7)}${elaborado.slice(8, 10)}-`;
  let mayor = 0;
  for (const l of db.lotes_produccion) {
    if (!l.codigo.startsWith(prefijo)) continue;
    const resto = l.codigo.slice(prefijo.length);
    if (/^[0-9]+$/.test(resto)) mayor = Math.max(mayor, Number(resto));
  }
  return `${prefijo}${String(mayor + 1).padStart(2, '0')}`;
}

/**
 * insumos_interna: [{insumo_id, cantidad}] → insumo_id → cantidad (redondeada a 3 decimales, más de cero;
 * los repetidos se suman). El producto que se elabora no puede ser su propio insumo.
 */
function insumosDe(db: Db, items: FormulaItem[], productoId: string | null, de: 'de la fórmula' | 'del lote'): Map<string, number> {
  const r = new Map<string, number>();
  for (const it of items) {
    const insumoId = it && typeof it === 'object' ? textoONulo(it.insumo_id) : null;
    if (!insumoId || !db.productos.some((p) => p.id === insumoId)) falla(MSG.insumoNoExiste(de));
    if (insumoId === productoId) falla(MSG.insumoPropio);
    const n = numeroOpcional(it.cantidad);
    const cantidad = n === null || !Number.isFinite(n) ? NaN : redondear(n, 3);
    if (!(cantidad > 0) || cantidad >= LIMITES.cantidadInsumo) falla(MSG.insumoCantidad);
    const suma = redondear((r.get(insumoId) ?? 0) + cantidad, 3);
    if (suma >= LIMITES.cantidadInsumo) falla(MSG.insumoCantidad);
    r.set(insumoId, suma);
  }
  return r;
}

/** guardar_formula (personal): upsert de la fórmula y reemplazo de sus insumos en un solo paso. Devuelve el id. */
export function guardarFormula(ctx: Ctx, f: FormulaEditable): string {
  exigirPersonal(ctx);
  const { db } = ctx;
  const fila = f.id ? db.formulas.find((x) => x.id === f.id) : undefined;
  if (f.id && !fila) falla(MSG.formulaNoExiste);

  const productoId = textoONulo(f.producto_id);
  if (!productoId) falla(MSG.formulaProducto);
  if (!db.productos.some((p) => p.id === productoId)) falla(MSG_EXTRA.productoNoExiste);

  const nombre = textoONulo(f.nombre);
  if (!nombre) falla(MSG.formulaNombre);
  if (nombre.length > LIMITES.nombre) falla(MSG.nombreLargo);

  const rend = numeroOpcional(f.rendimiento_piezas);
  const rendimiento = rend === null || !Number.isFinite(rend) ? NaN : redondear(rend, 2);
  if (!(rendimiento > 0) || rendimiento >= LIMITES.piezas) falla(MSG.rendimiento);

  // Sin dato, 0 días (como el adaptador); con dato, días enteros de 0 a 3650.
  const dias = numeroONulo(f.dias_curado) ?? 0;
  if (!Number.isInteger(dias) || dias < 0 || dias > LIMITES.diasCurado) falla(MSG.diasCurado);

  const instrucciones = textoONulo(f.instrucciones);
  if (instrucciones && instrucciones.length > LIMITES.instrucciones) falla(MSG.instruccionesLargas);

  if (!Array.isArray(f.items) || f.items.length === 0) falla(MSG.formulaSinInsumos);
  const insumos = insumosDe(db, f.items, productoId, 'de la fórmula');

  const t = ahoraIso(ctx);
  const datos = {
    producto_id: productoId,
    nombre,
    rendimiento_piezas: rendimiento,
    dias_curado: dias,
    instrucciones,
    activa: f.activa !== false,
  };
  let id: string;
  if (fila) {
    Object.assign(fila, datos, { actualizado_en: t });
    id = fila.id;
  } else {
    id = uuid();
    const nueva: FormulaFila = { id, ...datos, creado_en: t, actualizado_en: t };
    db.formulas.push(nueva);
  }
  db.formula_items = db.formula_items.filter((x) => x.formula_id !== id);
  for (const [insumo_id, cantidad] of insumos) db.formula_items.push({ formula_id: id, insumo_id, cantidad });
  return id;
}

/** liberar_lote_interna: las piezas entran al inventario con el costo real por pieza, que pasa a ser el del producto. */
function liberarLoteInterno(ctx: Ctx, lote: LoteFila, piezasObtenidas: number | null): void {
  const { db } = ctx;
  const piezas = redondear(piezasObtenidas ?? lote.piezas_planeadas, 2);
  if (!(piezas > 0) || piezas >= LIMITES.piezas) falla(MSG.piezasObtenidas);
  const costo = redondear(lote.costo_materiales / piezas, 4);
  lote.estado = 'disponible';
  lote.piezas_obtenidas = piezas;
  lote.costo_unitario = costo;
  lote.liberado_en = ahoraIso(ctx);
  insertarMovimiento(ctx, {
    producto_id: lote.producto_id,
    tipo: 'produccion',
    cantidad: piezas,
    costo_unitario: costo,
    lote_id: lote.id,
    nota: `Lote ${lote.codigo}`,
  });
  const p = db.productos.find((x) => x.id === lote.producto_id);
  if (p) {
    p.costo_presentacion = redondear(costo * p.contenido_presentacion, 2);
    p.actualizado_en = ahoraIso(ctx);
  }
}

/**
 * registrar_lote (personal). Materiales: `items` (lo que realmente se usó) o, si no viene, los de la fórmula
 * escalados a piezas / rendimiento. Valida existencias, descuenta la materia prima con su costo
 * (insumo_produccion) y, si la fórmula no pide curado (o no hay fórmula), libera el lote en el acto.
 */
export function registrarLote(ctx: Ctx, l: NuevoLote): ResultadoLote {
  const u = exigirPersonal(ctx);
  const { db } = ctx;
  const producto = db.productos.find((p) => p.id === l.producto_id);
  if (!producto) falla(MSG_EXTRA.productoNoExiste);
  let formula: FormulaFila | null = null;
  if (l.formula_id) {
    formula = db.formulas.find((f) => f.id === l.formula_id) ?? null;
    if (!formula) falla(MSG.formulaNoExiste);
    if (formula.producto_id !== producto.id) falla(MSG.formulaOtroProducto);
  }
  const items = Array.isArray(l.items) ? l.items.filter(Boolean) : [];
  if (!formula && items.length === 0) falla(MSG.loteSinMateriales);
  // Un jabón sin fórmula no tendría días de curado y quedaría a la venta el mismo día.
  if (!formula && producto.categoria === 'jabon') falla(MSG.jabonSinFormula);

  const pedidas = numeroONulo(l.piezas);
  const piezasBase = pedidas ?? formula?.rendimiento_piezas ?? null;
  if (piezasBase === null) falla(MSG.lotePiezasFalta);
  const piezas = redondear(piezasBase, 2);
  if (!(piezas > 0) || piezas >= LIMITES.piezas) falla(MSG.lotePiezas);

  const hoy = hoyDe(ctx);
  const elaborado = l.elaborado_en && esFecha(l.elaborado_en) ? l.elaborado_en : hoy;
  if (elaborado > hoy) falla(MSG.elaboracionFutura);
  const caduca = l.caduca_en && esFecha(l.caduca_en) ? l.caduca_en : null;
  if (caduca && caduca < elaborado) falla(MSG.caducidad);
  const notas = textoONulo(l.notas);
  if (notas && notas.length > LIMITES.notas) falla(MSG.notasLargas);

  // Materiales: lo que se usó o la fórmula escalada a las piezas.
  let materiales: Map<string, number>;
  if (items.length > 0) materiales = insumosDe(db, items, producto.id, 'del lote');
  else {
    materiales = new Map();
    for (const fi of db.formula_items.filter((x) => x.formula_id === formula!.id))
      materiales.set(fi.insumo_id, redondear((fi.cantidad * piezas) / formula!.rendimiento_piezas, 3));
    if (materiales.size === 0) falla(MSG.formulaVacia);
  }

  // Existencias (en orden, como el "for update" de SQL) y costo con el costo unitario vigente.
  const orden = [...materiales.keys()].sort();
  let costo = 0;
  for (const insumoId of orden) {
    const insumo = db.productos.find((p) => p.id === insumoId)!;
    const cantidad = materiales.get(insumoId)!;
    if (redondear(insumo.stock_actual, 3) < cantidad)
      falla(MSG.noAlcanza(insumo.nombre, cantidadLegible(Math.max(insumo.stock_actual, 0)), cantidadLegible(cantidad), insumo.unidad_medida));
    costo += cantidad * costoUnitario(insumo);
  }

  const dias = formula?.dias_curado ?? 0;
  const costoMateriales = redondear(costo, 2);
  const lote: LoteFila = {
    id: uuid(),
    codigo: codigoLote(db, producto.categoria, elaborado),
    producto_id: producto.id,
    formula_id: formula?.id ?? null,
    elaborado_en: elaborado,
    piezas_planeadas: piezas,
    piezas_obtenidas: null,
    dias_curado: dias,
    listo_desde: sumarDias(elaborado, dias),
    caduca_en: caduca,
    costo_materiales: costoMateriales,
    costo_unitario: redondear(costoMateriales / piezas, 4),
    estado: 'en_curado',
    liberado_en: null,
    descartado_en: null,
    motivo_descarte: null,
    notas,
    creado_por: u.id,
    creado_en: ahoraIso(ctx),
  };
  db.lotes_produccion.push(lote);

  for (const insumoId of orden) {
    const insumo = db.productos.find((p) => p.id === insumoId)!;
    insertarMovimiento(ctx, {
      producto_id: insumoId,
      tipo: 'insumo_produccion',
      cantidad: -materiales.get(insumoId)!,
      costo_unitario: costoUnitario(insumo),
      lote_id: lote.id,
      nota: `Lote ${lote.codigo}`,
    });
  }

  if (lote.dias_curado === 0) liberarLoteInterno(ctx, lote, null);

  return {
    id: lote.id,
    codigo: lote.codigo,
    costo_materiales: lote.costo_materiales,
    costo_unitario: lote.costo_unitario,
    listo_desde: lote.listo_desde,
    estado: lote.estado,
  };
}

function loteEnCurado(db: Db, loteId: string): LoteFila {
  const lote = db.lotes_produccion.find((x) => x.id === loteId);
  if (!lote) falla(MSG.loteNoExiste);
  if (lote.estado === 'disponible') falla(MSG.loteLiberado);
  if (lote.estado === 'descartado') falla(MSG.loteDescartado);
  return lote;
}

/**
 * liberar_lote (personal): sólo en curado; antes de que termine el curado, sólo con `forzar` (p. ej. un lote
 * de velas que ya está bien). Piezas obtenidas: las planeadas si no se dicen.
 */
export function liberarLote(ctx: Ctx, loteId: string, piezasObtenidas?: number | null, forzar?: boolean): void {
  exigirPersonal(ctx);
  const lote = loteEnCurado(ctx.db, loteId);
  if (hoyDe(ctx) < lote.listo_desde && forzar !== true) falla(MSG.loteEnCurado(fechaLegible(lote.listo_desde)));
  liberarLoteInterno(ctx, lote, numeroONulo(piezasObtenidas));
}

/** descartar_lote (personal): sólo en curado; no entra al inventario y su costo cuenta como merma del mes. */
export function descartarLote(ctx: Ctx, loteId: string, motivo: string): void {
  exigirPersonal(ctx);
  const lote = loteEnCurado(ctx.db, loteId);
  const texto = textoONulo(motivo);
  if (!texto) falla(MSG.motivoDescarte);
  if (texto.length > LIMITES.notas) falla(MSG.notasLargas);
  lote.estado = 'descartado';
  lote.descartado_en = ahoraIso(ctx);
  lote.motivo_descarte = texto;
}
