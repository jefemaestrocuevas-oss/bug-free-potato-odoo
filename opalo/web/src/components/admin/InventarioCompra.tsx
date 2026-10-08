// Pestaña "Registrar compra": líneas dinámicas de producto × presentaciones × costo.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type ItemCompra, type Producto, type Proveedor } from '../../lib/api';
import { fechaLocal } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { useConfirmar } from './Modal';
import { EntradaConUnidad, SelectorProducto, centavos, nombrePresentacion, pesos } from './InventarioPiezas';
import { aNumero, aTexto, cantidadConUnidad, porTexto, textoONulo } from './util';

/** Compra sugerida desde "Reposición". `n` cambia en cada precarga. */
export interface PrecargaCompra {
  n: number;
  proveedor_id: string | null;
  lineas: ItemCompra[];
}

interface Linea {
  clave: number;
  producto_id: string;
  presentaciones: string;
  costo: string;
}

let siguiente = 1;
const lineaVacia = (): Linea => ({ clave: siguiente++, producto_id: '', presentaciones: '', costo: '' });
const tieneDatos = (l: Linea) => !!(l.producto_id || l.presentaciones.trim() || l.costo.trim());

interface Props {
  productos: Producto[];
  proveedores: Proveedor[];
  precarga: PrecargaCompra | null;
  onRegistrada: (mensaje: string) => void;
}

export function InventarioCompra({ productos, proveedores, precarga, onRegistrada }: Props) {
  const hoy = fechaLocal();
  const [proveedorId, setProveedorId] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [folio, setFolio] = useState('');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<Linea[]>(() => [lineaVacia()]);
  const [avisoPrecarga, setAvisoPrecarga] = useState<string | null>(null);
  const { confirmar, dialogo } = useConfirmar();
  const lineasRef = useRef(lineas);
  lineasRef.current = lineas;

  const porId = new Map(productos.map((p) => [p.id, p]));

  // Precarga desde "Reposición" (pide confirmación si ya había una compra a medio capturar).
  useEffect(() => {
    if (!precarga) return;
    const aplicar = () => {
      setProveedorId(precarga.proveedor_id ?? '');
      setLineas(
        precarga.lineas.length
          ? precarga.lineas.map((l) => ({ clave: siguiente++, producto_id: l.producto_id, presentaciones: aTexto(l.presentaciones), costo: aTexto(l.costo_presentacion) }))
          : [lineaVacia()],
      );
      setAvisoPrecarga(
        `Precargamos ${precarga.lineas.length} ${precarga.lineas.length === 1 ? 'producto' : 'productos'} de la lista de reposición. Ajusta cantidades y costos con lo que realmente compraste.`,
      );
    };
    if (lineasRef.current.some(tieneDatos)) {
      confirmar({
        titulo: '¿Reemplazar la compra en curso?',
        mensaje: <p>Ya tienes una compra a medio capturar. Si continúas, la cambiamos por la lista de reposición.</p>,
        textoBoton: 'Sí, reemplazar',
        accion: async () => aplicar(),
      });
    } else aplicar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precarga?.n]);

  const cambiar = (clave: number, cambios: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  const quitar = (clave: number) => setLineas((ls) => (ls.length === 1 ? [lineaVacia()] : ls.filter((l) => l.clave !== clave)));
  const elegirProducto = (l: Linea, id: string) => {
    const p = porId.get(id);
    cambiar(l.clave, {
      producto_id: id,
      presentaciones: l.presentaciones.trim() ? l.presentaciones : id ? '1' : '',
      costo: p ? aTexto(p.costo_presentacion) : l.costo,
    });
  };

  const calculadas = lineas.map((l) => {
    const pres = aNumero(l.presentaciones);
    const costo = aNumero(l.costo);
    const subtotal = pres !== null && costo !== null && pres > 0 && costo >= 0 ? centavos(pres * costo) : null;
    return { l, pres, costo, subtotal, producto: porId.get(l.producto_id) };
  });
  const total = centavos(calculadas.reduce((s, c) => s + (c.subtotal ?? 0), 0));
  const conProducto = calculadas.filter((c) => c.l.producto_id);

  const proveedor = proveedores.find((p) => p.id === proveedorId);
  const delProveedor = proveedorId ? new Set(productos.filter((p) => p.proveedor_id === proveedorId).map((p) => p.id)) : null;

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    if (conProducto.length === 0) throw new Error('Agrega al menos un producto a la compra.');
    if (calculadas.some((c) => !c.l.producto_id && tieneDatos(c.l))) throw new Error('Elige el producto de cada línea o quita las que no uses.');
    for (const c of conProducto) {
      const nombre = c.producto?.nombre ?? 'un producto';
      if (c.pres === null || c.pres <= 0) throw new Error(`Escribe cuántas presentaciones compraste de ${nombre}.`);
      if (c.costo === null || c.costo < 0) throw new Error(`Escribe el costo por presentación de ${nombre} (puede ser 0 si fue regalo).`);
    }
    await api.admin.registrarCompra({
      items: conProducto.map((c) => ({ producto_id: c.l.producto_id, presentaciones: c.pres!, costo_presentacion: c.costo! })),
      proveedor_id: proveedorId || null,
      fecha: fecha || undefined,
      folio: textoONulo(folio),
      notas: textoONulo(notas),
    });
    return { n: conProducto.length, total };
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = await ejecutar();
    if (!r) return;
    setLineas([lineaVacia()]);
    setFolio('');
    setNotas('');
    setAvisoPrecarga(null);
    onRegistrada(
      `Compra registrada por ${pesos(r.total)} (${r.n} ${r.n === 1 ? 'producto' : 'productos'}). El stock ya subió y el costo de cada producto quedó al último precio.`,
    );
  };

  if (productos.filter((p) => p.activo).length === 0) {
    return <p className="aviso aviso-info">Primero da de alta tus productos en la pestaña “Productos”; luego aquí registras lo que compras.</p>;
  }

  return (
    <form onSubmit={enviar} noValidate className="inv-compra inv-lineas-contenedor">
      <p className="texto-2 inv-intro">
        Registra lo que compraste tal como viene en el ticket o la factura. Al guardar, el stock sube (presentaciones × contenido) y el costo por presentación de
        cada producto se actualiza al último precio, así el costo de cada servicio se mantiene al día.
      </p>
      {avisoPrecarga && (
        <div className="aviso aviso-info" role="status">
          <span>{avisoPrecarga}</span>
          <button type="button" className="btn btn-texto btn-sm" onClick={() => setAvisoPrecarga(null)}>
            Entendido
          </button>
        </div>
      )}

      <div className="adm-form-3">
        <div className="campo">
          <label className="etiqueta" htmlFor="compra-proveedor">
            Proveedor (opcional)
          </label>
          <select id="compra-proveedor" className="input" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            <option value="">Sin proveedor / varios</option>
            {proveedores
              .filter((p) => p.activo || p.id === proveedorId)
              .sort(porTexto((p) => p.nombre))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </select>
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="compra-fecha">
            Fecha de la compra
          </label>
          <input id="compra-fecha" type="date" className="input" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="compra-folio">
            Folio o factura (opcional)
          </label>
          <input id="compra-folio" className="input" value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="A-1234" />
        </div>
      </div>

      <fieldset className="inv-lineas">
        <legend className="inv-lineas-titulo">Productos comprados</legend>
        <div className="inv-linea inv-linea-cabeza" aria-hidden="true">
          <span>Producto</span>
          <span>Presentaciones</span>
          <span>Costo por presentación</span>
          <span className="inv-der">Subtotal</span>
          <span />
        </div>
        <ol className="inv-lineas-lista">
          {calculadas.map(({ l, pres, subtotal, producto }, i) => {
            const n = i + 1;
            return (
              <li key={l.clave} className="inv-linea">
                <div className="inv-linea-producto">
                  <label className="inv-etiqueta-linea" htmlFor={`compra-prod-${l.clave}`}>
                    Producto {n}
                  </label>
                  <SelectorProducto
                    id={`compra-prod-${l.clave}`}
                    productos={productos}
                    valor={l.producto_id}
                    onCambio={(id) => elegirProducto(l, id)}
                    primero={delProveedor && proveedor ? { etiqueta: `De ${proveedor.nombre}`, ids: delProveedor } : undefined}
                  />
                  {producto && (
                    <span className="adm-sub">
                      {nombrePresentacion(producto)}
                      {pres !== null && pres > 0 ? ` · entran ${cantidadConUnidad(pres * producto.contenido_presentacion, producto.unidad_medida, 3)}` : ''}
                      {` · último costo ${pesos(producto.costo_presentacion)}`}
                    </span>
                  )}
                </div>
                <div>
                  <label className="inv-etiqueta-linea" htmlFor={`compra-pres-${l.clave}`}>
                    Presentaciones
                  </label>
                  <EntradaConUnidad
                    id={`compra-pres-${l.clave}`}
                    valor={l.presentaciones}
                    onCambio={(v) => cambiar(l.clave, { presentaciones: v })}
                    placeholder="1"
                    etiquetaAccesible={`Presentaciones del producto ${n}`}
                  />
                </div>
                <div>
                  <label className="inv-etiqueta-linea" htmlFor={`compra-costo-${l.clave}`}>
                    Costo por presentación
                  </label>
                  <EntradaConUnidad
                    id={`compra-costo-${l.clave}`}
                    valor={l.costo}
                    onCambio={(v) => cambiar(l.clave, { costo: v })}
                    antes="$"
                    placeholder="0"
                    etiquetaAccesible={`Costo por presentación del producto ${n}`}
                  />
                </div>
                <div className="inv-linea-subtotal num">
                  <span className="inv-etiqueta-linea">Subtotal</span>
                  <strong>{subtotal !== null ? pesos(subtotal) : '—'}</strong>
                </div>
                <div className="inv-linea-quitar">
                  <button type="button" className="btn btn-texto btn-sm adm-texto-peligro" onClick={() => quitar(l.clave)} aria-label={`Quitar el producto ${n}`}>
                    Quitar
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <button type="button" className="btn btn-secundario btn-sm" onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>
          + Agregar otro producto
        </button>
      </fieldset>

      <div className="campo adm-margen-arriba">
        <label className="etiqueta" htmlFor="compra-notas">
          Notas (opcional)
        </label>
        <input id="compra-notas" className="input" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Pagado en efectivo, llegó incompleto…" />
      </div>

      <div className="inv-compra-pie">
        <dl className="adm-totales">
          <div>
            <dt>Productos</dt>
            <dd className="num">{conProducto.length}</dd>
          </div>
          <div>
            <dt>Total de la compra</dt>
            <dd className="num">
              <strong>{pesos(total)}</strong>
            </dd>
          </div>
        </dl>
        <button type="submit" className="btn btn-primario" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Registrar compra'}
        </button>
      </div>
      <MensajeError error={error} />
      {dialogo}
    </form>
  );
}
