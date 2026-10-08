// Pestaña "Reposición": lo que está en su mínimo o por debajo, agrupado por proveedor.
import { useState } from 'react';
import { api, type Producto, type ProductoReposicion, type Proveedor } from '../../lib/api';
import { fechaCorta, fechaLocal, telefonoBonito } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../ui/Estado';
import { Modal } from './Modal';
import type { PrecargaCompra } from './InventarioCompra';
import { centavos, nombrePresentacion, pesos } from './InventarioPiezas';
import { cantidadConUnidad, copiarAlPortapapeles } from './util';

interface Grupo {
  clave: string;
  proveedor: Proveedor | null;
  nombre: string;
  filas: ProductoReposicion[];
  subtotal: number;
}

function agrupar(filas: ProductoReposicion[], productos: Producto[], proveedores: Proveedor[]): Grupo[] {
  const porProducto = new Map(productos.map((p) => [p.id, p]));
  const porProveedor = new Map(proveedores.map((p) => [p.id, p]));
  const grupos = new Map<string, Grupo>();
  for (const f of filas) {
    const provId = porProducto.get(f.id)?.proveedor_id ?? null;
    const proveedor = provId ? porProveedor.get(provId) ?? null : null;
    const nombre = proveedor?.nombre ?? f.proveedor_nombre ?? '';
    const clave = proveedor?.id ?? (nombre ? `n:${nombre}` : '');
    const g = grupos.get(clave) ?? { clave, proveedor, nombre: nombre || 'Sin proveedor asignado', filas: [], subtotal: 0 };
    g.filas.push(f);
    g.subtotal = centavos(g.subtotal + f.costo_estimado);
    grupos.set(clave, g);
  }
  // Primero los que tienen proveedor (por nombre), al final "Sin proveedor asignado".
  return [...grupos.values()].sort((a, b) => Number(!a.clave) - Number(!b.clave) || a.nombre.localeCompare(b.nombre, 'es'));
}

function textoLista(grupos: Grupo[], total: number): string {
  const lineas: string[] = [`Lista de compras de Ópalo · ${fechaCorta(fechaLocal())}`, ''];
  for (const g of grupos) {
    const contacto = [g.proveedor?.contacto, g.proveedor?.telefono ? `Tel. ${telefonoBonito(g.proveedor.telefono)}` : null].filter(Boolean).join(' · ');
    lineas.push(contacto ? `${g.nombre} (${contacto})` : g.nombre);
    for (const f of g.filas) {
      const pres = nombrePresentacion(f);
      lineas.push(`• ${f.presentaciones_sugeridas} × ${pres} — ${f.nombre}${f.marca ? ` (${f.marca})` : ''} · aprox. ${pesos(f.costo_estimado)}`);
    }
    lineas.push(`Subtotal aproximado: ${pesos(g.subtotal)}`, '');
  }
  lineas.push(`Total aproximado: ${pesos(total)}`);
  return lineas.join('\n');
}

interface Props {
  productos: Producto[];
  proveedores: Proveedor[];
  version: number;
  onPrecargar: (p: Omit<PrecargaCompra, 'n'>) => void;
}

export function InventarioReposicion({ productos, proveedores, version, onPrecargar }: Props) {
  const repo = useAsync(() => api.admin.getReposicion(), [version]);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [textoManual, setTextoManual] = useState<string | null>(null);

  if (repo.cargando && !repo.datos) return <Cargando texto="Revisando qué hace falta…" />;
  if (repo.error && !repo.datos) return <MensajeError error={repo.error} onReintentar={repo.recargar} />;
  const filas = repo.datos ?? [];
  if (filas.length === 0) {
    return (
      <Vacio titulo="Todo en orden">
        Ningún producto activo está en su mínimo o por debajo. Cuando alguno llegue, aparecerá aquí con la cantidad sugerida para reponer.
      </Vacio>
    );
  }

  const grupos = agrupar(filas, productos, proveedores);
  const total = centavos(filas.reduce((s, f) => s + f.costo_estimado, 0));
  const porProducto = new Map(productos.map((p) => [p.id, p]));

  const precargar = (gs: Grupo[]) => {
    const lineas = gs.flatMap((g) =>
      g.filas.map((f) => ({
        producto_id: f.id,
        presentaciones: f.presentaciones_sugeridas,
        costo_presentacion: porProducto.get(f.id)?.costo_presentacion ?? (f.presentaciones_sugeridas ? centavos(f.costo_estimado / f.presentaciones_sugeridas) : 0),
      })),
    );
    const conProveedor = gs.length === 1 ? gs[0].proveedor?.id ?? null : null;
    onPrecargar({ proveedor_id: conProveedor, lineas });
  };

  const copiar = async () => {
    const texto = textoLista(grupos, total);
    if (await copiarAlPortapapeles(texto)) {
      setCopiado('Lista copiada. Pégala en WhatsApp o en tus notas.');
      window.setTimeout(() => setCopiado(null), 5000);
    } else setTextoManual(texto);
  };

  return (
    <div className={repo.cargando ? 'inv-recargando' : ''}>
      <div className="inv-repo-cabeza">
        <p className="inv-repo-resumen">
          <strong className="num">{filas.length}</strong> {filas.length === 1 ? 'producto está' : 'productos están'} en su mínimo o por debajo. Reponerlos cuesta
          aproximadamente <strong className="num">{pesos(total)}</strong> con el último costo de cada uno.
        </p>
        <div className="inv-repo-acciones">
          <button type="button" className="btn btn-secundario" onClick={copiar}>
            Copiar lista de compras
          </button>
          <button type="button" className="btn btn-primario" onClick={() => precargar(grupos)}>
            Registrar esta compra
          </button>
        </div>
      </div>
      <p className="ayuda inv-intro">
        La sugerencia cubre lo que falta para volver al mínimo, en presentaciones completas (al menos una). Si compras de más o a otro precio, lo ajustas al
        registrar la compra.
      </p>
      {copiado && (
        <p className="aviso aviso-exito" role="status">
          {copiado}
        </p>
      )}
      <MensajeError error={repo.error} onReintentar={repo.recargar} />

      {grupos.map((g) => (
        <section key={g.clave || 'sin'} className="inv-grupo" aria-label={`Por comprar con ${g.nombre}`}>
          <div className="inv-grupo-cabeza">
            <div>
              <h3 className="inv-grupo-titulo">{g.nombre}</h3>
              {g.proveedor && (g.proveedor.contacto || g.proveedor.telefono) && (
                <span className="adm-sub">
                  {[g.proveedor.contacto, g.proveedor.telefono ? telefonoBonito(g.proveedor.telefono) : null].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            {grupos.length > 1 && (
              <button type="button" className="btn btn-texto btn-sm" onClick={() => precargar([g])}>
                Registrar sólo esta compra
              </button>
            )}
          </div>
          <div className="tabla-envoltura">
            <table className="tabla inv-tabla inv-tabla-tarjetas inv-tabla-repo">
              <caption className="sr-only">Productos por reponer de {g.nombre}</caption>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col" className="num">
                    Quedan
                  </th>
                  <th scope="col" className="num">
                    Mínimo
                  </th>
                  <th scope="col" className="num">
                    Faltan
                  </th>
                  <th scope="col" className="num">
                    Sugerido
                  </th>
                  <th scope="col" className="num">
                    Costo aprox.
                  </th>
                </tr>
              </thead>
              <tbody>
                {g.filas.map((f) => (
                  <tr key={f.id}>
                    <td className="inv-celda-titulo">
                      <span className="inv-nombre">{f.nombre}</span>
                      {f.marca && <span className="adm-sub">{f.marca}</span>}
                    </td>
                    <td data-etiqueta="Quedan" className="num">
                      <strong className="inv-texto-alerta">{cantidadConUnidad(f.stock_actual, f.unidad_medida, 3)}</strong>
                    </td>
                    <td data-etiqueta="Mínimo" className="num">
                      {cantidadConUnidad(f.stock_minimo, f.unidad_medida, 3)}
                    </td>
                    <td data-etiqueta="Faltan" className="num">
                      {f.faltante > 0 ? cantidadConUnidad(f.faltante, f.unidad_medida, 3) : <span className="texto-3">Justo en el mínimo</span>}
                    </td>
                    <td data-etiqueta="Sugerido" className="num">
                      <strong>
                        {f.presentaciones_sugeridas} × {nombrePresentacion(f)}
                      </strong>
                    </td>
                    <td data-etiqueta="Costo aprox." className="num">
                      {pesos(f.costo_estimado)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {grupos.length > 1 && (
                <tfoot>
                  <tr className="inv-fila-total">
                    <th scope="row" colSpan={5}>
                      Subtotal {g.nombre}
                    </th>
                    <td data-etiqueta="Subtotal" className="num">
                      <strong>{pesos(g.subtotal)}</strong>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      ))}

      <div className="inv-total-final">
        <span>Total aproximado</span>
        <strong className="num">{pesos(total)}</strong>
      </div>

      {textoManual && (
        <Modal
          titulo="Copia la lista"
          onCerrar={() => setTextoManual(null)}
          pie={
            <button type="button" className="btn btn-primario" onClick={() => setTextoManual(null)}>
              Listo
            </button>
          }
        >
          <p className="texto-2">Tu navegador no nos dejó copiar automáticamente. Selecciona el texto y cópialo:</p>
          <label className="sr-only" htmlFor="inv-lista-manual">
            Lista de compras
          </label>
          <textarea id="inv-lista-manual" className="input inv-texto-lista" readOnly value={textoManual} rows={12} onFocus={(e) => e.currentTarget.select()} />
        </Modal>
      )}
    </div>
  );
}
