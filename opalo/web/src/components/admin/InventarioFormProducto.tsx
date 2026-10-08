// Alta y edición de un producto (insumo de cabina, materia prima del taller o producto de venta).
// El stock no se edita aquí. Los jabones, velas y sets se manejan por pieza (ESPEC §10.2) y su ficha
// pública (descripción, aroma, ingredientes…) se edita en el Taller; aquí se conserva tal cual.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type CategoriaProducto, type Producto, type ProductoEditable, type Proveedor, type UnidadMedida, type UsoProducto } from '../../lib/api';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { Modal } from './Modal';
import { Casilla } from './Piezas';
import { CATEGORIAS_PRODUCTO, EJEMPLO_PRESENTACION, EntradaConUnidad, UNIDAD_PLURAL, equivalencia, pesos } from './InventarioPiezas';
import { ETIQUETA_CATEGORIA_PRODUCTO, ETIQUETA_UNIDAD, ETIQUETA_USO, aNumero, aTexto, cantidadConUnidad, dineroUnitario, porTexto, textoONulo } from './util';
import { esMateriaPrima, esTerminado, fichaDe } from './TallerPiezas';

const UNIDADES = Object.keys(ETIQUETA_UNIDAD) as UnidadMedida[];
const USOS = Object.keys(ETIQUETA_USO) as UsoProducto[];

interface Props {
  /** null = producto nuevo */
  producto: Producto | null;
  /** Categoría inicial de un producto nuevo (p. ej. materia prima desde el filtro del taller). */
  categoriaInicial?: CategoriaProducto;
  proveedores: Proveedor[];
  onCerrar: () => void;
  onGuardado: (p: Producto, nuevo: boolean) => void;
}

export function InventarioFormProducto({ producto, categoriaInicial, proveedores, onCerrar, onGuardado }: Props) {
  const p = producto;
  const cat0: CategoriaProducto = p?.categoria ?? categoriaInicial ?? 'cera';
  const [nombre, setNombre] = useState(p?.nombre ?? '');
  const [marca, setMarca] = useState(p?.marca ?? '');
  const [categoria, setCategoriaEstado] = useState<CategoriaProducto>(cat0);
  const [unidadElegida, setUnidad] = useState<UnidadMedida>(p?.unidad_medida ?? (esTerminado(cat0) ? 'pz' : 'g'));
  const [presentacion, setPresentacion] = useState(p?.presentacion ?? '');
  const [contenidoEscrito, setContenido] = useState(aTexto(p?.contenido_presentacion ?? (esTerminado(cat0) ? 1 : undefined)));
  const [costo, setCosto] = useState(aTexto(p?.costo_presentacion));
  const [minimo, setMinimo] = useState(aTexto(p?.stock_minimo));
  const [proveedorId, setProveedorId] = useState(p?.proveedor_id ?? '');
  const [uso, setUso] = useState<UsoProducto>(p?.uso ?? (esTerminado(cat0) ? 'venta' : esMateriaPrima(cat0) ? 'produccion' : 'cabina'));
  const [precioVenta, setPrecioVenta] = useState(aTexto(p?.precio_venta));
  const [enLinea, setEnLinea] = useState(p?.vendible_en_linea ?? false);
  const [activo, setActivo] = useState(p?.activo ?? true);
  const [notas, setNotas] = useState(p?.notas ?? '');
  const [intentado, setIntentado] = useState(false);

  // Jabón, vela y set: siempre por pieza y de una en una (el costo de una pieza sale de sus lotes).
  const terminado = esTerminado(categoria);
  const unidad: UnidadMedida = terminado ? 'pz' : unidadElegida;
  const contenido = terminado ? '1' : contenidoEscrito;
  const setCategoria = (c: CategoriaProducto) => {
    setCategoriaEstado(c);
    // Sugiere el uso que corresponde a la categoría nueva (se puede cambiar).
    if (esTerminado(c) && (uso === 'cabina' || uso === 'produccion')) setUso('venta');
    else if (esMateriaPrima(c) && uso === 'cabina') setUso('produccion');
    else if (!esTerminado(c) && !esMateriaPrima(c) && uso === 'produccion') setUso('cabina');
  };

  const nContenido = aNumero(contenido);
  const nCosto = costo.trim() === '' ? 0 : aNumero(costo);
  const nMinimo = minimo.trim() === '' ? 0 : aNumero(minimo);
  const nPrecio = aNumero(precioVenta);
  const seVende = uso === 'venta' || uso === 'ambos';
  const contenidoValido = nContenido !== null && nContenido > 0;
  const costoUnitario = contenidoValido && nCosto !== null && nCosto >= 0 ? nCosto / nContenido! : null;
  const vista = { presentacion: textoONulo(presentacion), contenido_presentacion: nContenido ?? 0, unidad_medida: unidad };

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    if (!nombre.trim()) throw new Error('Escribe el nombre del producto.');
    if (!contenidoValido) throw new Error(`Escribe cuántos ${UNIDAD_PLURAL[unidad]} trae una presentación (mayor a cero).`);
    if (nCosto === null || nCosto < 0) throw new Error('El costo por presentación no puede ser negativo.');
    if (nMinimo === null || nMinimo < 0) throw new Error('El stock mínimo no puede ser negativo.');
    if (seVende && precioVenta.trim() !== '' && (nPrecio === null || nPrecio < 0)) throw new Error('Revisa el precio de venta.');
    if (seVende && enLinea && (nPrecio === null || nPrecio <= 0)) throw new Error('Para venderlo en línea, escribe su precio de venta.');
    const datos: ProductoEditable = {
      ...fichaDe(p),
      id: p?.id,
      nombre: nombre.trim(),
      marca: textoONulo(marca),
      categoria,
      unidad_medida: unidad,
      presentacion: textoONulo(presentacion),
      contenido_presentacion: nContenido!,
      costo_presentacion: nCosto,
      stock_minimo: nMinimo,
      proveedor_id: proveedorId || null,
      uso,
      precio_venta: seVende ? nPrecio : null,
      vendible_en_linea: seVende && enLinea,
      activo,
      notas: textoONulo(notas),
    };
    return api.admin.guardarProducto(datos);
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    setError(null);
    const r = await ejecutar();
    if (r) onGuardado(r, !p);
  };

  const opcionesProveedor = proveedores.filter((x) => x.activo || x.id === proveedorId).sort(porTexto((x) => x.nombre));
  const equivMinimo = nMinimo !== null && nMinimo > 0 && contenidoValido ? equivalencia(nMinimo, vista) : null;

  return (
    <Modal
      titulo={p ? `Editar ${p.nombre}` : 'Nuevo producto'}
      onCerrar={onCerrar}
      bloqueado={enviando}
      ancho="amplio"
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="inv-form-producto" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : p ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </>
      }
    >
      <form id="inv-form-producto" className="inv-modal-ancho" onSubmit={enviar} noValidate>
        <div className="aviso aviso-info inv-aviso-compacto">
          <span>
            {p ? (
              <>
                Hay <strong className="num">{cantidadConUnidad(p.stock_actual, p.unidad_medida, 3)}</strong> en existencia. El stock no se edita aquí: se mueve
                con las compras, los consumos de cada cita y los ajustes o mermas.
              </>
            ) : (
              <>El producto empieza con 0 en existencia. El stock no se edita aquí: súbelo registrando una compra (o un ajuste si ya lo tienes en el spa).</>
            )}
          </span>
        </div>

        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="prod-nombre">
              Nombre
            </label>
            <input
              id="prod-nombre"
              className="input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              aria-invalid={intentado && !nombre.trim() ? true : undefined}
              placeholder="Cera elástica de chocolate"
            />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="prod-marca">
              Marca (opcional)
            </label>
            <input id="prod-marca" className="input" value={marca} onChange={(e) => setMarca(e.target.value)} />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="prod-categoria">
              Categoría
            </label>
            <select id="prod-categoria" className="input" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaProducto)}>
              {CATEGORIAS_PRODUCTO.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETA_CATEGORIA_PRODUCTO[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="prod-unidad">
              Unidad de medida
            </label>
            <select
              id="prod-unidad"
              className="input"
              value={unidad}
              onChange={(e) => setUnidad(e.target.value as UnidadMedida)}
              aria-describedby="prod-unidad-ayuda"
              disabled={terminado}
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {ETIQUETA_UNIDAD[u]}
                </option>
              ))}
            </select>
            <span className="ayuda" id="prod-unidad-ayuda">
              {terminado
                ? 'Los jabones, velas y sets se cuentan por pieza: así el costo es el de una pieza.'
                : 'El stock, el mínimo y las recetas se cuentan en esta unidad.'}
            </span>
          </div>
        </div>

        <fieldset className="adm-paso inv-paso">
          <legend>Presentación y costo</legend>
          <div className="adm-form-3">
            <div className="campo">
              <label className="etiqueta" htmlFor="prod-presentacion">
                Presentación
              </label>
              <input
                id="prod-presentacion"
                className="input"
                value={presentacion}
                onChange={(e) => setPresentacion(e.target.value)}
                placeholder={EJEMPLO_PRESENTACION[unidad]}
              />
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor="prod-contenido">
                Contenido por presentación
              </label>
              <EntradaConUnidad
                id="prod-contenido"
                valor={contenido}
                onCambio={setContenido}
                unidad={unidad}
                requerido
                invalido={intentado && !contenidoValido}
                descrita="prod-contenido-ayuda"
                deshabilitado={terminado}
              />
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor="prod-costo">
                Costo por presentación
              </label>
              <EntradaConUnidad id="prod-costo" valor={costo} onCambio={setCosto} antes="$" placeholder="0" descrita="prod-costo-ayuda" invalido={intentado && (nCosto === null || nCosto < 0)} />
            </div>
          </div>
          <p className="ayuda adm-sin-margen" id="prod-contenido-ayuda">
            {terminado
              ? 'Una pieza por presentación. El costo de una pieza se actualiza solo cada vez que liberas un lote en el Taller.'
              : `Contenido: cuántos ${UNIDAD_PLURAL[unidad]} trae una presentación; así calculamos el costo por servicio.`}
          </p>
          <p className="inv-calculo" id="prod-costo-ayuda" aria-live="polite">
            {costoUnitario !== null ? (
              <>
                Costo por {unidad}: <strong className="num">{dineroUnitario(costoUnitario)}</strong>
                {p && p.costo_presentacion !== nCosto && <span className="texto-3"> · Cada compra lo actualiza al último precio.</span>}
              </>
            ) : (
              <span className="texto-3">Con el contenido y el costo te mostramos el costo por {unidad}.</span>
            )}
          </p>
        </fieldset>

        <div className="adm-form-2 adm-margen-arriba">
          <div className="campo">
            <label className="etiqueta" htmlFor="prod-minimo">
              Stock mínimo
            </label>
            <EntradaConUnidad id="prod-minimo" valor={minimo} onCambio={setMinimo} unidad={unidad} placeholder="0" descrita="prod-minimo-ayuda" invalido={intentado && (nMinimo === null || nMinimo < 0)} />
            <span className="ayuda" id="prod-minimo-ayuda">
              Cuando quede esto o menos, aparece en “Reposición”.{equivMinimo ? ` (${equivMinimo})` : ''}
            </span>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="prod-proveedor">
              Proveedor
            </label>
            <select id="prod-proveedor" className="input" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Sin proveedor asignado</option>
              {opcionesProveedor.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                  {x.activo ? '' : ' (inactivo)'}
                </option>
              ))}
            </select>
            {proveedores.length === 0 && <span className="ayuda">Puedes darlos de alta en la pestaña “Proveedores”.</span>}
          </div>
        </div>

        <fieldset className="adm-paso inv-paso">
          <legend>¿Para qué se usa?</legend>
          <div className="adm-chips" role="radiogroup" aria-label="Uso del producto">
            {USOS.map((u) => (
              <label key={u} className={`adm-chip ${uso === u ? 'adm-chip-activo' : ''}`}>
                <input type="radio" name="prod-uso" value={u} checked={uso === u} onChange={() => setUso(u)} />
                {ETIQUETA_USO[u]}
              </label>
            ))}
          </div>
          {seVende ? (
            <div className="adm-form-2">
              <div className="campo">
                <label className="etiqueta" htmlFor="prod-precio">
                  Precio de venta
                </label>
                <EntradaConUnidad id="prod-precio" valor={precioVenta} onCambio={setPrecioVenta} antes="$" descrita="prod-precio-ayuda" />
                <span className="ayuda" id="prod-precio-ayuda">
                  {unidad === 'pz' && nPrecio !== null && nPrecio > 0 && costoUnitario !== null && costoUnitario > 0
                    ? `Por pieza vendida. Te deja ${pesos(nPrecio - costoUnitario)} sobre su costo (${pesos(costoUnitario)}).`
                    : 'Precio por pieza vendida en el spa o en la tienda en línea.'}
                </span>
              </div>
              <div className="campo inv-campo-casilla">
                <Casilla
                  etiqueta="Vender en la tienda en línea"
                  checked={enLinea}
                  onChange={setEnLinea}
                  ayuda="Aparece en la tienda del sitio mientras haya stock y tenga precio."
                />
              </div>
            </div>
          ) : (
            <p className="ayuda adm-sin-margen">
              {uso === 'produccion'
                ? 'Se usa en el taller para hacer jabones y velas (en sus fórmulas): no tiene precio de venta.'
                : 'Sólo se usa en cabina: no tiene precio de venta.'}
            </p>
          )}
          {seVende && unidad !== 'pz' && (
            <p className="aviso aviso-alerta inv-aviso-compacto adm-sin-margen">
              Cada venta descuenta 1 {unidad} del stock. Para lo que se vende por pieza, conviene medirlo en piezas (pz) con contenido 1.
            </p>
          )}
        </fieldset>

        {terminado && (
          <p className="aviso aviso-info inv-aviso-compacto adm-margen-arriba">
            <span>
              Lo hacemos en Ópalo: su ficha para la tienda (descripción, aroma, ingredientes, foto…), sus fórmulas y sus lotes se manejan en{' '}
              <Link to="/admin/taller">Taller</Link>.
            </span>
          </p>
        )}

        <div className="campo adm-margen-arriba">
          <label className="etiqueta" htmlFor="prod-notas">
            Notas (opcional)
          </label>
          <textarea id="prod-notas" className="input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Dónde se guarda, cómo se usa, alergias…" />
        </div>

        <Casilla
          etiqueta="Producto activo"
          checked={activo}
          onChange={setActivo}
          ayuda="Si ya no lo usas, desactívalo: deja de pedir reposición y no aparece al registrar compras, pero conserva su historial."
        />
        <MensajeError error={error} />
      </form>
    </Modal>
  );
}
