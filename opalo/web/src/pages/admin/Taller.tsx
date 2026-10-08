// /admin/taller: jabones y velas hechos en Ópalo (ESPEC §10). Ficha de la tienda, fórmulas con su costo,
// lotes con su curado y márgenes. Lo usan el personal y la administración.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Formula, type Lote, type Producto } from '../../lib/api';
import { numero } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError } from '../../components/ui/Estado';
import { EncabezadoAdmin, Exito, Kpi } from '../../components/admin/Piezas';
import { TallerProductos, publicadoEnLinea } from '../../components/admin/TallerProductos';
import { TallerFormProducto } from '../../components/admin/TallerFormProducto';
import { TallerFormulas } from '../../components/admin/TallerFormulas';
import { TallerFormFormula } from '../../components/admin/TallerFormFormula';
import { TallerDescartar, TallerLiberar, TallerLotes } from '../../components/admin/TallerLotes';
import { TallerRegistrarLote } from '../../components/admin/TallerRegistrarLote';
import { TallerMargenes } from '../../components/admin/TallerMargenes';
import { esTerminado } from '../../components/admin/TallerPiezas';
import './Inventario.css';
import './Costos.css';
import './Taller.css';

type Pestana = 'productos' | 'formulas' | 'lotes' | 'margenes';

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'productos', texto: 'Productos de la tienda' },
  { id: 'formulas', texto: 'Fórmulas' },
  { id: 'lotes', texto: 'Lotes' },
  { id: 'margenes', texto: 'Márgenes' },
];

const esPestana = (v: string | null): v is Pestana => PESTANAS.some((p) => p.id === v);

type Ventana =
  | { tipo: 'producto'; producto: Producto | null }
  | { tipo: 'formula'; formula: Formula | null; productoId?: string | null }
  | { tipo: 'lote' }
  | { tipo: 'liberar'; lote: Lote }
  | { tipo: 'descartar'; lote: Lote };

export default function Taller() {
  const [params, setParams] = useSearchParams();
  const pp = params.get('pestana');
  const pestana: Pestana = esPestana(pp) ? pp : 'productos';
  const datos = useAsync(
    () =>
      Promise.all([
        api.admin.getProductos(),
        api.admin.getFormulas(),
        api.admin.getCostosFormulas(),
        api.admin.getLotes(null),
        api.admin.getMargenesProductos(),
      ]),
    [],
  );
  const [ventana, setVentana] = useState<Ventana | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const avisoRef = useRef<HTMLDivElement>(null);
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (aviso) avisoRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [aviso]);

  // En celular la fila de pestañas se desliza: deja visible la activa.
  useEffect(() => {
    const el = tabs.current[pestana];
    const lista = el?.parentElement;
    if (!el || !lista || lista.scrollWidth <= lista.clientWidth) return;
    const r = el.getBoundingClientRect();
    const l = lista.getBoundingClientRect();
    if (r.left < l.left || r.right > l.right) lista.scrollLeft = Math.max(0, lista.scrollLeft + r.left - l.left - 24);
  }, [pestana, datos.datos]);

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

  /** Algo cambió: cierra la ventana, avisa y recarga todo (stock, costos y lotes van juntos). */
  const cambio = (mensaje: string) => {
    setVentana(null);
    setAviso(mensaje);
    datos.recargar();
  };

  const [productos, formulas, costos, lotes, margenes] = datos.datos ?? [[], [], [], [], []];
  const terminados = productos.filter((p) => p.activo && esTerminado(p.categoria));
  const listos = lotes.filter((l) => l.estado === 'en_curado' && l.dias_para_listo <= 0);
  const curando = lotes.filter((l) => l.estado === 'en_curado' && l.dias_para_listo > 0);
  const piezasCurando = curando.reduce((s, l) => s + l.piezas_planeadas, 0);
  const disponibles = terminados.reduce((s, p) => s + Math.max(0, Math.floor(p.stock_actual)), 0);
  const publicados = terminados.filter(publicadoEnLinea).length;

  return (
    <div className="adm-pagina inv-pagina tal-pagina">
      <EncabezadoAdmin
        titulo="Taller"
        descripcion="Jabones y velas hechos en Ópalo: su ficha para la tienda, sus fórmulas y costos, y cada lote desde que se hace hasta que se vende."
      >
        <Link className="btn btn-secundario" to="/admin/mostrador">
          Ir al mostrador
        </Link>
        <button type="button" className="btn btn-primario" onClick={() => setVentana({ tipo: 'lote' })} disabled={!datos.datos}>
          + Registrar lote
        </button>
      </EncabezadoAdmin>

      {datos.cargando && !datos.datos && <Cargando texto="Abriendo el taller…" />}
      <MensajeError error={datos.error} onReintentar={datos.recargar} />

      {datos.datos && (
        <>
          <div className="adm-kpis inv-kpis tal-kpis">
            <Kpi
              etiqueta="Listos para liberar"
              valor={listos.length}
              detalle={listos.length ? 'Ya cumplieron su curado' : 'Ningún lote espera'}
              tono={listos.length ? 'alerta' : undefined}
            />
            <Kpi
              etiqueta="En curado"
              valor={curando.length}
              detalle={curando.length ? `${numero(piezasCurando)} piezas en camino` : 'Ningún lote curando'}
            />
            <Kpi etiqueta="Piezas disponibles" valor={numero(disponibles)} detalle="Jabones, velas y sets para vender" />
            <Kpi etiqueta="En la tienda en línea" valor={publicados} detalle={`de ${terminados.length} productos hechos en Ópalo`} />
          </div>

          <div className="pestanas inv-pestanas" role="tablist" aria-label="Secciones del taller" onKeyDown={alTeclear}>
            {PESTANAS.map((p) => (
              <button
                key={p.id}
                ref={(el) => {
                  tabs.current[p.id] = el;
                }}
                type="button"
                role="tab"
                id={`tal-tab-${p.id}`}
                aria-controls={`tal-panel-${p.id}`}
                aria-selected={pestana === p.id}
                tabIndex={pestana === p.id ? 0 : -1}
                className="pestana"
                onClick={() => ir(p.id)}
              >
                {p.texto}
                {p.id === 'lotes' && listos.length > 0 && (
                  <>
                    <span className="inv-contador" aria-hidden="true">
                      {listos.length}
                    </span>
                    <span className="sr-only"> ({listos.length} listos para liberar)</span>
                  </>
                )}
              </button>
            ))}
          </div>

          <div ref={avisoRef} className="inv-aviso-zona">
            <Exito texto={aviso} onCerrar={() => setAviso(null)} />
          </div>

          <div role="tabpanel" id={`tal-panel-${pestana}`} aria-labelledby={`tal-tab-${pestana}`} className={`inv-panel ${datos.cargando ? 'inv-recargando' : ''}`}>
            {pestana === 'productos' && (
              <TallerProductos productos={productos} lotes={lotes} onEditar={(p) => setVentana({ tipo: 'producto', producto: p === 'nuevo' ? null : p })} />
            )}
            {pestana === 'formulas' && (
              <TallerFormulas
                productos={productos}
                formulas={formulas}
                costos={costos}
                onEditar={(f, productoId) => setVentana({ tipo: 'formula', formula: f, productoId })}
                onCambio={cambio}
              />
            )}
            {pestana === 'lotes' && (
              <TallerLotes
                lotes={lotes}
                onRegistrar={() => setVentana({ tipo: 'lote' })}
                onLiberar={(lote) => setVentana({ tipo: 'liberar', lote })}
                onDescartar={(lote) => setVentana({ tipo: 'descartar', lote })}
              />
            )}
            {pestana === 'margenes' && <TallerMargenes margenes={margenes} productos={productos} />}
          </div>
        </>
      )}

      {ventana?.tipo === 'producto' && (
        <TallerFormProducto
          producto={ventana.producto}
          productos={productos}
          onCerrar={() => setVentana(null)}
          onGuardado={(p, nuevo) =>
            cambio(nuevo ? `«${p.nombre}» ya está en el taller. Anota su fórmula y registra su primer lote.` : `Ficha de «${p.nombre}» guardada.`)
          }
        />
      )}
      {ventana?.tipo === 'formula' && (
        <TallerFormFormula
          formula={ventana.formula}
          productoId={ventana.productoId}
          productos={productos}
          onCerrar={() => setVentana(null)}
          onGuardado={cambio}
        />
      )}
      {ventana?.tipo === 'lote' && (
        <TallerRegistrarLote
          productos={productos}
          formulas={formulas}
          onCerrar={() => setVentana(null)}
          onCrearFormula={(productoId) => {
            ir('formulas');
            setVentana({ tipo: 'formula', formula: null, productoId });
          }}
          onListo={(m) => {
            ir('lotes');
            cambio(m);
          }}
        />
      )}
      {ventana?.tipo === 'liberar' && <TallerLiberar lote={ventana.lote} onCerrar={() => setVentana(null)} onListo={cambio} />}
      {ventana?.tipo === 'descartar' && <TallerDescartar lote={ventana.lote} onCerrar={() => setVentana(null)} onListo={cambio} />}
    </div>
  );
}
