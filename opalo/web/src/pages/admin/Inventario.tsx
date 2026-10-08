// /admin/inventario: productos, reposición, compras, movimientos y proveedores.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError } from '../../components/ui/Estado';
import { EncabezadoAdmin, Exito, Kpi } from '../../components/admin/Piezas';
import { InventarioCompra, type PrecargaCompra } from '../../components/admin/InventarioCompra';
import { InventarioMovimientos } from '../../components/admin/InventarioMovimientos';
import { InventarioProductos } from '../../components/admin/InventarioProductos';
import { InventarioProveedores } from '../../components/admin/InventarioProveedores';
import { InventarioReposicion } from '../../components/admin/InventarioReposicion';
import { centavos, necesitaReponer, pesos } from '../../components/admin/InventarioPiezas';
import './Inventario.css';

type Pestana = 'productos' | 'reposicion' | 'compra' | 'movimientos' | 'proveedores';

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'productos', texto: 'Productos' },
  { id: 'reposicion', texto: 'Reposición' },
  { id: 'compra', texto: 'Registrar compra' },
  { id: 'movimientos', texto: 'Movimientos' },
  { id: 'proveedores', texto: 'Proveedores' },
];

const esPestana = (v: string | null): v is Pestana => PESTANAS.some((p) => p.id === v);

export default function Inventario() {
  const [params, setParams] = useSearchParams();
  const pp = params.get('pestana');
  const pestana: Pestana = esPestana(pp) ? pp : 'productos';
  const datos = useAsync(() => Promise.all([api.admin.getProductos(), api.admin.getProveedores()]), []);
  const [version, setVersion] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [precarga, setPrecarga] = useState<PrecargaCompra | null>(null);
  const avisoRef = useRef<HTMLDivElement>(null);
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Las pestañas ya visitadas se quedan montadas (ocultas) para no perder lo capturado.
  const visitadas = useRef(new Set<Pestana>());
  visitadas.current.add(pestana);

  // En celular la fila de pestañas se desliza: deja visible la pestaña activa (sin mover la página).
  useEffect(() => {
    const el = tabs.current[pestana];
    const lista = el?.parentElement;
    if (!el || !lista || lista.scrollWidth <= lista.clientWidth) return;
    const r = el.getBoundingClientRect();
    const l = lista.getBoundingClientRect();
    if (r.left < l.left || r.right > l.right) lista.scrollLeft = Math.max(0, lista.scrollLeft + r.left - l.left - 24);
  }, [pestana, datos.datos]);

  useEffect(() => {
    if (aviso) avisoRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [aviso]);

  const ir = (p: Pestana, enfocar = false) => {
    const n = new URLSearchParams(params);
    if (p === 'productos') n.delete('pestana');
    else n.set('pestana', p);
    setParams(n, { replace: true });
    if (p !== pestana) setAviso(null);
    if (enfocar) tabs.current[p]?.focus();
  };

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = PESTANAS.findIndex((p) => p.id === pestana);
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % PESTANAS.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + PESTANAS.length) % PESTANAS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = PESTANAS.length - 1;
    if (j < 0) return;
    e.preventDefault();
    ir(PESTANAS[j].id, true);
  };

  /** Algo cambió el inventario: recarga productos y lo que dependa de ellos. */
  const cambio = (mensaje: string) => {
    datos.recargar();
    setVersion((v) => v + 1);
    setAviso(mensaje);
  };

  const [productos, proveedores] = datos.datos ?? [[], []];
  const activos = productos.filter((p) => p.activo);
  const porReponer = activos.filter(necesitaReponer).length;
  const valor = centavos(activos.reduce((s, p) => s + Math.max(0, p.stock_actual) * p.costo_unitario, 0));

  return (
    <div className="adm-pagina inv-pagina">
      <EncabezadoAdmin
        titulo="Inventario"
        descripcion="Existencias de cabina, de venta y del taller. El stock sube con las compras y los lotes liberados; baja solo al completar citas (según la receta de cada servicio), con las ventas y con la materia prima de cada lote."
      />

      {datos.cargando && !datos.datos && <Cargando texto="Cargando inventario…" />}
      <MensajeError error={datos.error} onReintentar={datos.recargar} />

      {datos.datos && (
        <>
          <div className="adm-kpis inv-kpis">
            <Kpi etiqueta="Productos activos" valor={activos.length} detalle={productos.length > activos.length ? `${productos.length - activos.length} inactivos` : 'Insumos, taller y venta'} />
            <Kpi
              etiqueta="Hay que reponer"
              valor={porReponer}
              detalle={porReponer ? 'En su mínimo o por debajo' : 'Todo arriba del mínimo'}
              tono={porReponer ? 'alerta' : undefined}
            />
            <Kpi etiqueta="Valor del inventario" valor={pesos(valor)} detalle="Stock × último costo" />
          </div>

          <div className="pestanas inv-pestanas" role="tablist" aria-label="Secciones del inventario" onKeyDown={alTeclear}>
            {PESTANAS.map((p) => (
              <button
                key={p.id}
                ref={(el) => {
                  tabs.current[p.id] = el;
                }}
                type="button"
                role="tab"
                id={`inv-tab-${p.id}`}
                aria-controls={`inv-panel-${p.id}`}
                aria-selected={pestana === p.id}
                tabIndex={pestana === p.id ? 0 : -1}
                className="pestana"
                onClick={() => ir(p.id)}
              >
                {p.texto}
                {p.id === 'reposicion' && porReponer > 0 && (
                  <>
                    <span className="inv-contador" aria-hidden="true">
                      {porReponer}
                    </span>
                    <span className="sr-only"> ({porReponer} por reponer)</span>
                  </>
                )}
              </button>
            ))}
          </div>

          <div ref={avisoRef} className="inv-aviso-zona">
            <Exito texto={aviso} onCerrar={() => setAviso(null)} />
          </div>

          {PESTANAS.filter((p) => visitadas.current.has(p.id)).map((p) => (
            <div
              key={p.id}
              role="tabpanel"
              id={`inv-panel-${p.id}`}
              aria-labelledby={`inv-tab-${p.id}`}
              hidden={pestana !== p.id}
              className={`inv-panel ${datos.cargando ? 'inv-recargando' : ''}`}
            >
              {p.id === 'productos' && <InventarioProductos productos={productos} proveedores={proveedores} onCambio={cambio} recargando={datos.cargando} />}
              {p.id === 'reposicion' && (
                <InventarioReposicion
                  productos={productos}
                  proveedores={proveedores}
                  version={version}
                  onPrecargar={(c) => {
                    setAviso(null);
                    setPrecarga((prev) => ({ ...c, n: (prev?.n ?? 0) + 1 }));
                    ir('compra');
                  }}
                />
              )}
              {p.id === 'compra' && <InventarioCompra productos={productos} proveedores={proveedores} precarga={precarga} onRegistrada={cambio} />}
              {p.id === 'movimientos' && <InventarioMovimientos productos={productos} version={version} />}
              {p.id === 'proveedores' && <InventarioProveedores proveedores={proveedores} productos={productos} onCambio={cambio} />}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
