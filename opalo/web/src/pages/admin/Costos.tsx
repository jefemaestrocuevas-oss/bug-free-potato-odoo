// /admin/costos: costo de material y margen de cada servicio según su receta.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CostoServicio, type Producto } from '../../lib/api';
import { porcentaje } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { EncabezadoAdmin, Exito, Kpi } from '../../components/admin/Piezas';
import { CostosReceta, MARGEN_MINIMO_PCT } from '../../components/admin/CostosReceta';
import './Inventario.css';
import './Costos.css';
import { pesos } from '../../components/admin/InventarioPiezas';

type Filtro = '' | 'alertas' | 'sin_receta' | 'margen_bajo' | 'por_confirmar';

const FILTROS: { id: Filtro; texto: string }[] = [
  { id: '', texto: 'Todos los servicios' },
  { id: 'alertas', texto: 'Con alguna alerta' },
  { id: 'sin_receta', texto: 'Sin receta' },
  { id: 'margen_bajo', texto: `Margen bajo (< ${MARGEN_MINIMO_PCT} %)` },
  { id: 'por_confirmar', texto: 'Precio por confirmar' },
];

const margenBajo = (c: CostoServicio) => c.margen_pct !== null && c.margen_pct < MARGEN_MINIMO_PCT;
const sinReceta = (c: CostoServicio) => !c.tiene_receta;
const porConfirmar = (c: CostoServicio) => c.precio === null;

function normal(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function KpiFiltro({
  etiqueta,
  valor,
  detalle,
  tono,
  activo,
  onClick,
}: {
  etiqueta: string;
  valor: number;
  detalle: string;
  tono?: 'error' | 'alerta';
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`adm-kpi cos-kpi-boton ${tono ? `adm-kpi-${tono}` : ''} ${activo ? 'cos-kpi-activo' : ''}`} onClick={onClick} aria-pressed={activo}>
      <span className="adm-kpi-etiqueta">{etiqueta}</span>
      <span className="adm-kpi-valor num">{valor}</span>
      <span className="adm-kpi-detalle">{detalle}</span>
      <span className="cos-kpi-accion">{activo ? 'Mostrando sólo estos · quitar filtro' : 'Ver cuáles'}</span>
    </button>
  );
}

function Alertas({ c }: { c: CostoServicio }) {
  const hay = sinReceta(c) || margenBajo(c) || porConfirmar(c);
  if (!hay) return <span className="pill pill-exito">En orden</span>;
  return (
    <span className="cos-pills">
      {sinReceta(c) && <span className="pill pill-error">Sin receta</span>}
      {margenBajo(c) && <span className="pill pill-alerta">Margen bajo</span>}
      {porConfirmar(c) && <span className="pill pill-gris">Precio por confirmar</span>}
    </span>
  );
}

export default function Costos() {
  const costos = useAsync(() => api.admin.getCostosServicios(), []);
  const productos = useAsync(() => api.admin.getProductos().catch((): Producto[] => []), []);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('');
  const [elegido, setElegido] = useState<CostoServicio | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const lista = costos.datos ?? [];
  const q = normal(busqueda.trim());
  const visibles = lista
    .filter((c) => !q || normal(`${c.nombre} ${c.categoria}`).includes(q))
    .filter((c) => {
      if (filtro === 'alertas') return sinReceta(c) || margenBajo(c) || porConfirmar(c);
      if (filtro === 'sin_receta') return sinReceta(c);
      if (filtro === 'margen_bajo') return margenBajo(c);
      if (filtro === 'por_confirmar') return porConfirmar(c);
      return true;
    });

  // Agrupa por categoría respetando el orden que trae la vista (orden del catálogo).
  const grupos: { categoria: string; filas: CostoServicio[] }[] = [];
  for (const c of visibles) {
    const g = grupos.find((x) => x.categoria === c.categoria);
    if (g) g.filas.push(c);
    else grupos.push({ categoria: c.categoria, filas: [c] });
  }

  const nSinReceta = lista.filter(sinReceta).length;
  const nBajo = lista.filter(margenBajo).length;
  const nConfirmar = lista.filter(porConfirmar).length;
  const conMargen = lista.filter((c) => c.tiene_receta && c.margen_pct !== null);
  const promedio = conMargen.length ? Math.round((conMargen.reduce((s, c) => s + (c.margen_pct ?? 0), 0) / conMargen.length) * 10) / 10 : null;

  const ver = (f: Filtro) => setFiltro((actual) => (actual === f ? '' : f));

  return (
    <div className="adm-pagina cos-pagina">
      <EncabezadoAdmin
        titulo="Costos y márgenes"
        descripcion={
          <>
            La <strong>receta</strong> de un servicio es cuánto se gasta de cada producto en una sesión; sin receta, su costo de material sale en $0.
          </>
        }
      >
        <Link className="btn btn-secundario" to="/admin/inventario">
          Ir a inventario
        </Link>
      </EncabezadoAdmin>

      {costos.cargando && !costos.datos && <Cargando texto="Calculando costos…" />}
      <MensajeError error={costos.error} onReintentar={costos.recargar} />
      <Exito texto={aviso} onCerrar={() => setAviso(null)} />

      {costos.datos && (
        <>
          <div className="adm-kpis inv-kpis cos-kpis">
            <KpiFiltro
              etiqueta="Sin receta"
              valor={nSinReceta}
              detalle={nSinReceta ? 'Su costo sale en $0' : 'Todos tienen receta'}
              tono={nSinReceta ? 'error' : undefined}
              activo={filtro === 'sin_receta'}
              onClick={() => ver('sin_receta')}
            />
            <KpiFiltro
              etiqueta="Margen bajo"
              valor={nBajo}
              detalle={`Menos de ${MARGEN_MINIMO_PCT} % sobre el precio`}
              tono={nBajo ? 'alerta' : undefined}
              activo={filtro === 'margen_bajo'}
              onClick={() => ver('margen_bajo')}
            />
            <KpiFiltro
              etiqueta="Precio por confirmar"
              valor={nConfirmar}
              detalle="Sin precio no hay margen"
              activo={filtro === 'por_confirmar'}
              onClick={() => ver('por_confirmar')}
            />
            <Kpi etiqueta="Margen promedio" valor={promedio === null ? '—' : porcentaje(promedio)} detalle="De los servicios con receta y precio" />
          </div>

          <div className="adm-filtros">
            <div className="campo adm-busqueda">
              <label className="etiqueta" htmlFor="cos-buscar">
                Buscar servicio
              </label>
              <input id="cos-buscar" type="search" className="input" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Axilas, facial…" />
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor="cos-filtro">
                Mostrar
              </label>
              <select id="cos-filtro" className="input" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
                {FILTROS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.texto}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {lista.length === 0 ? (
            <Vacio titulo="No hay servicios activos">Cuando haya servicios en el catálogo, aquí verás su costo y su margen.</Vacio>
          ) : visibles.length === 0 ? (
            <Vacio titulo="Ningún servicio coincide">
              <button
                type="button"
                className="btn btn-texto"
                onClick={() => {
                  setBusqueda('');
                  setFiltro('');
                }}
              >
                Quitar filtros
              </button>
            </Vacio>
          ) : (
            <div className={`tabla-envoltura ${costos.cargando ? 'inv-recargando' : ''}`}>
              <table className="tabla inv-tabla inv-tabla-tarjetas cos-tabla">
                <caption className="sr-only">Costo de material y margen por servicio, agrupados por categoría</caption>
                <thead>
                  <tr>
                    <th scope="col">Servicio</th>
                    <th scope="col" className="num">
                      Precio
                    </th>
                    <th scope="col" className="num">
                      Costo de material
                    </th>
                    <th scope="col" className="num">
                      Margen
                    </th>
                    <th scope="col" className="num">
                      Margen %
                    </th>
                    <th scope="col">Alertas</th>
                    <th scope="col">
                      <span className="sr-only">Receta</span>
                    </th>
                  </tr>
                </thead>
                {grupos.map((g) => (
                  <tbody key={g.categoria}>
                    <tr className="cos-grupo">
                      <th scope="colgroup" colSpan={7}>
                        {g.categoria || 'Sin categoría'}
                      </th>
                    </tr>
                    {g.filas.map((c) => {
                      // Sin receta el margen no es real (el material sale en $0): se muestra apagado.
                      const tono = !c.tiene_receta ? 'cos-sin-receta' : c.margen !== null && c.margen < 0 ? 'cos-negativo' : margenBajo(c) ? 'cos-bajo' : '';
                      return (
                        <tr key={c.servicio_id}>
                          <td className="inv-celda-titulo">
                            <button type="button" className="cos-servicio" onClick={() => setElegido(c)}>
                              {c.nombre}
                            </button>
                          </td>
                          <td data-etiqueta="Precio" className="num">
                            {c.precio === null ? <span className="texto-3">Por confirmar</span> : pesos(c.precio)}
                          </td>
                          <td data-etiqueta="Material" className="num">
                            {c.tiene_receta ? pesos(c.costo_material) : <span className="texto-3">$0</span>}
                          </td>
                          <td data-etiqueta="Margen" className={`num ${tono}`}>
                            {c.margen === null ? <span className="texto-3">—</span> : pesos(c.margen)}
                          </td>
                          <td data-etiqueta="Margen %" className={`num ${tono}`}>
                            {c.margen_pct === null ? <span className="texto-3">—</span> : porcentaje(c.margen_pct)}
                          </td>
                          <td className="cos-celda-alertas">
                            <span className="sr-only">Alertas: </span>
                            <Alertas c={c} />
                          </td>
                          <td className="adm-celda-acciones inv-celda-acciones">
                            <button
                              type="button"
                              className={`btn btn-sm ${c.tiene_receta ? 'btn-texto' : 'btn-secundario'}`}
                              onClick={() => setElegido(c)}
                              aria-label={`${c.tiene_receta ? 'Editar receta' : 'Crear receta'} de ${c.nombre}`}
                            >
                              {c.tiene_receta ? 'Editar receta' : 'Crear receta'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          )}
          <p className="ayuda inv-nota-pie">
            Margen = precio − costo de material. No incluye renta, sueldos ni otros gastos fijos: esos se ven en Resultados. Los servicios inactivos no aparecen.
          </p>
        </>
      )}

      {elegido && (
        <CostosReceta
          servicio={elegido}
          productos={productos.datos}
          onCerrar={() => setElegido(null)}
          onGuardado={(m) => {
            setElegido(null);
            setAviso(m);
            costos.recargar();
          }}
        />
      )}
    </div>
  );
}
