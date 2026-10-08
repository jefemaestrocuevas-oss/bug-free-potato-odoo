// /admin/catalogo: servicios (agrupados por categoría) y paquetes, con sus precios y reglas en línea.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Categoria, type Paquete, type Servicio } from '../../lib/api';
import { dinero, duracion } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { EncabezadoAdmin, Exito } from '../../components/admin/Piezas';
import { IconoMas } from '../../components/admin/Iconos';
import { CatalogoFormServicio } from '../../components/admin/CatalogoFormServicio';
import { CatalogoFormPaquete } from '../../components/admin/CatalogoFormPaquete';
import { PillActivo, PillEtapa, reservaEnLinea, sumaPorSeparado, textoDuracionServicio, textoVigencia, ventaEnLinea } from '../../components/admin/CatalogoPiezas';
import { ETIQUETA_TIPO_PAQUETE } from '../../components/admin/util';
import './Catalogo.css';

type Pestana = 'servicios' | 'paquetes';
type Filtro = '' | 'por_confirmar' | 'no_reservables' | 'inactivos';

const FILTROS: { id: Filtro; texto: string }[] = [
  { id: '', texto: 'Todos los servicios' },
  { id: 'por_confirmar', texto: 'Precio por confirmar' },
  { id: 'no_reservables', texto: 'No se reservan en línea' },
  { id: 'inactivos', texto: 'Inactivos' },
];

function normal(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const porOrden = <T extends { orden: number; nombre: string }>(a: T, b: T) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es');

export default function Catalogo() {
  const [params, setParams] = useSearchParams();
  const pestana: Pestana = params.get('pestana') === 'paquetes' ? 'paquetes' : 'servicios';
  const catalogo = useAsync(() => api.getCatalogo({ incluirInactivos: true }), []);
  const config = useAsync(() => api.getConfiguracion().catch(() => null), []);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('');
  const [servicioAbierto, setServicioAbierto] = useState<{ servicio: Servicio | null; categoria?: string } | null>(null);
  const [paqueteAbierto, setPaqueteAbierto] = useState<{ paquete: Paquete | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const irA = (p: Pestana) => {
    const n = new URLSearchParams(params);
    if (p === 'servicios') n.delete('pestana');
    else n.set('pestana', p);
    setParams(n, { replace: true });
  };

  const c = catalogo.datos;
  const servicios = useMemo(() => (c ? [...c.servicios].sort(porOrden) : []), [c]);
  const paquetes = useMemo(() => (c ? [...c.paquetes].sort(porOrden) : []), [c]);
  const categorias = useMemo(() => (c ? [...c.categorias].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')) : []), [c]);
  const porId = useMemo(() => new Map(servicios.map((s) => [s.id, s])), [servicios]);
  const slugsServicios = useMemo(() => new Map(servicios.map((s) => [s.slug, s.nombre])), [servicios]);
  const slugsPaquetes = useMemo(() => new Map(paquetes.map((p) => [p.slug, p.nombre])), [paquetes]);

  // R1/R8: se reserva y se cobra en cabina, pero no se vende en línea hasta tener precio.
  const sinPrecio = (s: Servicio) => s.activo && s.etapa === 'disponible' && s.precio === null;
  const porConfirmar = servicios.filter(sinPrecio);
  const paquetesSinPrecio = paquetes.filter((p) => p.activo && p.precio === null).length;

  const q = normal(busqueda.trim());
  const visibles = servicios
    .filter((s) => !q || normal(`${s.nombre} ${s.zonas_incluye ?? ''} ${s.slug}`).includes(q))
    .filter((s) => {
      if (filtro === 'por_confirmar') return sinPrecio(s);
      if (filtro === 'no_reservables') return !reservaEnLinea(s).si;
      if (filtro === 'inactivos') return !s.activo;
      return true;
    });
  const grupos: { categoria: Categoria | null; lista: Servicio[] }[] = categorias.map((cat) => ({ categoria: cat, lista: visibles.filter((s) => s.categoria_id === cat.id) }));
  const huerfanos = visibles.filter((s) => !categorias.some((cat) => cat.id === s.categoria_id));
  if (huerfanos.length) grupos.push({ categoria: null, lista: huerfanos });
  const hayFiltro = !!q || !!filtro;

  const verPorConfirmar = () => {
    irA('servicios');
    setBusqueda('');
    setFiltro((f) => (f === 'por_confirmar' ? '' : 'por_confirmar'));
  };

  const guardado = (tipo: 'servicio' | 'paquete') => (nombre: string, nuevo: boolean) => {
    setServicioAbierto(null);
    setPaqueteAbierto(null);
    setAviso(nuevo ? `Listo: creamos el ${tipo} «${nombre}».` : `Listo: guardamos los cambios de «${nombre}».`);
    catalogo.recargar();
  };

  const vigenciaEstandar = config.datos?.vigencia_creditos_dias ?? null;

  return (
    <div className="adm-pagina cat-pagina">
      <EncabezadoAdmin
        titulo="Catálogo y precios"
        descripcion={
          <>
            Lo que ven las clientas en el sitio. Lo que no está <strong>disponible</strong> no se puede reservar, y sin precio no se vende en línea.
          </>
        }
      >
        {pestana === 'servicios' ? (
          <button type="button" className="btn btn-primario" onClick={() => setServicioAbierto({ servicio: null })} disabled={!c}>
            <IconoMas tam={18} /> Nuevo servicio
          </button>
        ) : (
          <button type="button" className="btn btn-primario" onClick={() => setPaqueteAbierto({ paquete: null })} disabled={!c}>
            <IconoMas tam={18} /> Nuevo paquete
          </button>
        )}
      </EncabezadoAdmin>

      {catalogo.cargando && !c && <Cargando texto="Cargando el catálogo…" />}
      <MensajeError error={catalogo.error} onReintentar={catalogo.recargar} />
      <Exito texto={aviso} onCerrar={() => setAviso(null)} />

      {c && (
        <>
          {porConfirmar.length > 0 ? (
            <div className="aviso aviso-alerta cat-aviso-precios" role="note">
              <div className="cat-aviso-texto">
                <span className="cat-aviso-cifra num" aria-hidden="true">
                  {porConfirmar.length}
                </span>
                <p className="adm-sin-margen">
                  <strong>
                    {porConfirmar.length === 1 ? '1 servicio activo tiene' : `${porConfirmar.length} servicios activos tienen`} «precio por confirmar».
                  </strong>{' '}
                  Se pueden reservar y se cobran en cabina, pero no se venden en línea hasta que tengan precio.
                </p>
              </div>
              <button type="button" className="btn btn-secundario btn-sm" onClick={verPorConfirmar} aria-pressed={pestana === 'servicios' && filtro === 'por_confirmar'}>
                {pestana === 'servicios' && filtro === 'por_confirmar' ? 'Ver todos' : 'Ver cuáles'}
              </button>
            </div>
          ) : (
            <div className="aviso aviso-exito" role="note">
              <span>Todos los servicios activos tienen precio.</span>
            </div>
          )}

          <div className="pestanas cat-pestanas" role="tablist" aria-label="Partes del catálogo">
            <button type="button" role="tab" id="cat-tab-servicios" aria-controls="cat-panel" className="pestana" aria-selected={pestana === 'servicios'} onClick={() => irA('servicios')}>
              Servicios <span className="cat-contador num">{servicios.length}</span>
            </button>
            <button type="button" role="tab" id="cat-tab-paquetes" aria-controls="cat-panel" className="pestana" aria-selected={pestana === 'paquetes'} onClick={() => irA('paquetes')}>
              Paquetes <span className="cat-contador num">{paquetes.length}</span>
            </button>
          </div>

          <div id="cat-panel" role="tabpanel" aria-labelledby={`cat-tab-${pestana}`} className={catalogo.cargando ? 'cat-recargando' : ''}>
            {pestana === 'servicios' ? (
              <>
                <div className="adm-filtros cat-filtros">
                  <div className="campo adm-busqueda">
                    <label className="etiqueta" htmlFor="cat-buscar">
                      Buscar
                    </label>
                    <input id="cat-buscar" className="input" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o zona" />
                  </div>
                  <div className="campo">
                    <label className="etiqueta" htmlFor="cat-filtro">
                      Mostrar
                    </label>
                    <select id="cat-filtro" className="input" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
                      {FILTROS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.texto}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {visibles.length === 0 ? (
                  hayFiltro ? (
                    <Vacio titulo="Nada coincide">
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
                    <Vacio titulo="Aún no hay servicios">Agrega el primero con «Nuevo servicio».</Vacio>
                  )
                ) : (
                  grupos
                    .filter((g) => g.lista.length > 0)
                    .map((g) => (
                      <GrupoServicios
                        key={g.categoria?.id ?? 'sin'}
                        categoria={g.categoria}
                        servicios={g.lista}
                        onEditar={(s) => setServicioAbierto({ servicio: s })}
                        onAgregar={g.categoria ? () => setServicioAbierto({ servicio: null, categoria: g.categoria!.id }) : undefined}
                      />
                    ))
                )}
              </>
            ) : (
              <>
                <p className="cat-intro">
                  <strong>Combo</strong>: varios servicios en una sola visita. <strong>Bono</strong>: varias sesiones para usar en distintas visitas. Al pagarse, la clienta recibe
                  sus créditos con la vigencia indicada.
                  {paquetesSinPrecio > 0 && ` ${paquetesSinPrecio === 1 ? 'Un paquete activo no tiene' : `${paquetesSinPrecio} paquetes activos no tienen`} precio: no se venden en línea.`}
                </p>
                {paquetes.length === 0 ? (
                  <Vacio titulo="Aún no hay paquetes">Crea uno con «Nuevo paquete».</Vacio>
                ) : (
                  <ul className="cat-paquetes">
                    {paquetes.map((p) => (
                      <li key={p.id}>
                        <TarjetaPaquete paquete={p} porId={porId} vigenciaEstandar={vigenciaEstandar} onEditar={() => setPaqueteAbierto({ paquete: p })} />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </>
      )}

      {servicioAbierto && c && (
        <CatalogoFormServicio
          servicio={servicioAbierto.servicio}
          categorias={categorias}
          categoriaInicial={servicioAbierto.categoria}
          slugsUsados={slugsServicios}
          onCerrar={() => setServicioAbierto(null)}
          onGuardado={guardado('servicio')}
        />
      )}
      {paqueteAbierto && c && (
        <CatalogoFormPaquete
          paquete={paqueteAbierto.paquete}
          servicios={servicios}
          categorias={categorias}
          slugsUsados={slugsPaquetes}
          vigenciaEstandar={vigenciaEstandar}
          onCerrar={() => setPaqueteAbierto(null)}
          onGuardado={guardado('paquete')}
        />
      )}
    </div>
  );
}

function EnLinea({ s }: { s: Servicio }) {
  const r = reservaEnLinea(s);
  const v = ventaEnLinea(s);
  return (
    <span className="cat-en-linea">
      <span className={r.si ? 'cat-si' : 'cat-no'} title={r.motivo}>
        {r.si ? 'Se reserva' : 'No se reserva'}
        {!r.si && <span className="cat-motivo">{r.motivo}</span>}
      </span>
      <span className={v.si ? 'cat-si' : 'cat-no'} title={v.motivo}>
        {v.si ? 'Se vende' : 'No se vende'}
        {!v.si && <span className="cat-motivo">{v.motivo}</span>}
      </span>
    </span>
  );
}

function GrupoServicios({ categoria, servicios, onEditar, onAgregar }: { categoria: Categoria | null; servicios: Servicio[]; onEditar: (s: Servicio) => void; onAgregar?: () => void }) {
  const id = `cat-grupo-${categoria?.id ?? 'sin'}`;
  const sinPrecio = servicios.filter((s) => s.activo && s.etapa === 'disponible' && s.precio === null).length;
  return (
    <section className="cat-categoria" aria-labelledby={id}>
      <div className="cat-categoria-cabeza">
        <h2 className="cat-categoria-titulo" id={id}>
          {categoria?.nombre ?? 'Sin categoría'}
        </h2>
        <span className="texto-3 pequeno">
          {servicios.length} {servicios.length === 1 ? 'servicio' : 'servicios'}
          {sinPrecio > 0 && ` · ${sinPrecio} por confirmar`}
        </span>
        {onAgregar && (
          <button type="button" className="btn btn-texto btn-sm cat-agregar-aqui" onClick={onAgregar}>
            <IconoMas tam={16} /> Agregar aquí
          </button>
        )}
      </div>
      <div className="tabla-envoltura cat-envoltura">
        <table className="tabla cat-tabla">
          <thead>
            <tr>
              <th scope="col">Servicio</th>
              <th scope="col" className="num">
                Precio
              </th>
              <th scope="col">Duración</th>
              <th scope="col">Etapa</th>
              <th scope="col">En línea</th>
              <th scope="col">Estado</th>
              <th scope="col">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {servicios.map((s) => (
              <tr key={s.id} className={s.activo ? '' : 'cat-inactivo'}>
                <td className="cat-celda-nombre">
                  <span className="cat-nombre">{s.nombre}</span>
                  {s.es_complemento && <span className="pill pill-oro cat-pill-junto">Complemento</span>}
                  {s.zonas_incluye && <span className="adm-sub">{s.zonas_incluye}</span>}
                </td>
                <td className="num cat-celda-precio" data-etiqueta="Precio">
                  {s.precio === null ? <span className="pill pill-alerta">Por confirmar</span> : <strong>{dinero(s.precio)}</strong>}
                </td>
                <td className="cat-celda-duracion" data-etiqueta="Duración">
                  <span className={s.duracion_min === null ? 'texto-3' : ''}>{textoDuracionServicio(s.duracion_min)}</span>
                  {s.duracion_primera_vez_min !== null && <span className="adm-sub">Primera vez: {duracion(s.duracion_primera_vez_min)}</span>}
                </td>
                <td data-etiqueta="Etapa">
                  <PillEtapa etapa={s.etapa} />
                </td>
                <td data-etiqueta="En línea">
                  <EnLinea s={s} />
                </td>
                <td data-etiqueta="Estado">
                  <PillActivo activo={s.activo} />
                </td>
                <td className="adm-celda-acciones cat-celda-acciones">
                  <button type="button" className="btn btn-secundario btn-sm" onClick={() => onEditar(s)} aria-label={`Editar ${s.nombre}`}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** R1 (paquete activo con todo disponible) y R8 (paquete activo con precio). */
function textoEnLineaPaquete(p: Paquete, todoDisponible: boolean): string {
  if (!p.activo) return 'No (inactivo)';
  const reserva = todoDisponible;
  const venta = p.precio !== null;
  if (reserva && venta) return 'Se reserva y se vende';
  if (reserva) return 'Se reserva; no se vende (sin precio)';
  if (venta) return 'Se vende; no se reserva';
  return 'Ni se reserva ni se vende';
}

function TarjetaPaquete({ paquete: p, porId, vigenciaEstandar, onEditar }: { paquete: Paquete; porId: Map<string, Servicio>; vigenciaEstandar: number | null; onEditar: () => void }) {
  const separado = sumaPorSeparado(p.items, porId);
  const ahorro = separado !== null && p.precio !== null ? Math.round((separado - p.precio) * 100) / 100 : null;
  const noReservables = p.items.map((it) => porId.get(it.servicio_id)).filter((s) => !s || !s.activo || s.etapa !== 'disponible');
  const titulo = `cat-paq-${p.id}`;
  return (
    <article className={`tarjeta-plana cat-paquete ${p.activo ? '' : 'cat-paquete-inactivo'}`} aria-labelledby={titulo}>
      <div className="cat-paquete-pills">
        <span className={`pill ${p.tipo === 'bono' ? 'pill-info' : 'pill-verde'}`}>
          {ETIQUETA_TIPO_PAQUETE[p.tipo]} · {p.tipo === 'bono' ? 'varias visitas' : 'una visita'}
        </span>
        <PillActivo activo={p.activo} />
      </div>
      <div className="cat-paquete-cabeza">
        <h3 className="cat-paquete-nombre" id={titulo}>
          {p.nombre}
        </h3>
        <span className="cat-paquete-precio num">{p.precio === null ? <span className="pill pill-alerta">Precio por confirmar</span> : dinero(p.precio)}</span>
      </div>
      {p.descripcion && <p className="cat-paquete-desc">{p.descripcion}</p>}

      {p.items.length === 0 ? (
        <p className="aviso aviso-alerta cat-aviso-compacto">Este paquete no tiene servicios. Edítalo para agregarlos.</p>
      ) : (
        <ul className="cat-paquete-items">
          {p.items.map((it) => {
            const s = porId.get(it.servicio_id);
            return (
              <li key={it.servicio_id}>
                <span>
                  <span className="num cat-cantidad">{it.cantidad} ×</span> {s?.nombre ?? 'Servicio que ya no existe'}
                  {s && !s.activo && <span className="texto-3 pequeno"> (inactivo)</span>}
                </span>
                <span className="num texto-2">{s ? (s.precio === null ? 'por confirmar' : dinero(s.precio * it.cantidad)) : '—'}</span>
              </li>
            );
          })}
        </ul>
      )}

      {separado !== null ? (
        <p className="cat-paquete-separado">
          Por separado suman <strong className="num">{dinero(separado)}</strong>
          {ahorro !== null && ahorro > 0 && (
            <>
              {' '}
              · la clienta ahorra <strong className="num cat-cuenta-bien">{dinero(ahorro)}</strong>
            </>
          )}
          {ahorro !== null && ahorro <= 0 && <span className="cat-cuenta-mal"> · el paquete no sale más barato</span>}
        </p>
      ) : (
        p.items.length > 0 && <p className="cat-paquete-separado texto-3">Por separado: aún no se puede sumar (hay precios por confirmar).</p>
      )}

      <dl className="cat-paquete-datos">
        <div>
          <dt>Duración</dt>
          <dd>{p.duracion_min === null ? 'Según sus servicios' : duracion(p.duracion_min)}</dd>
        </div>
        <div>
          <dt>Vigencia</dt>
          <dd>{textoVigencia(p, vigenciaEstandar)}</dd>
        </div>
        <div>
          <dt>En línea</dt>
          <dd>{textoEnLineaPaquete(p, noReservables.length === 0 && p.items.length > 0)}</dd>
        </div>
      </dl>
      {p.activo && noReservables.length > 0 && <p className="ayuda adm-sin-margen">No se puede reservar mientras incluya servicios no disponibles.</p>}

      <div className="cat-paquete-pie">
        <button type="button" className="btn btn-secundario btn-sm" onClick={onEditar} aria-label={`Editar ${p.nombre}`}>
          Editar
        </button>
      </div>
    </article>
  );
}
