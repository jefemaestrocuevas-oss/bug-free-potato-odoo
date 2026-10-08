// /admin/mostrador: punto de venta en el spa (ESPEC §10.3). Jabones, velas y demás productos (y, si
// hace falta, servicios o paquetes prepagados) con carrito, clienta opcional, método de pago y propina
// aparte. Al cobrar se registra el pedido pagado y entregado, y se muestra el ticket. Pensado para tablet.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ItemPedidoNuevo, type MetodoPago, type Paquete, type Producto, type Servicio } from '../../lib/api';
import { dinero, ETIQUETA_METODO_PAGO, numero } from '../../lib/format';
import { useAccion, useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { EncabezadoAdmin } from '../../components/admin/Piezas';
import { ElegirClienta, Ticket, type DatosTicket } from '../../components/admin/MostradorPiezas';
import type { ClienteElegido } from '../../components/admin/NuevaCita';
import { EntradaConUnidad } from '../../components/admin/InventarioPiezas';
import { MiniaturaProducto, esDeVenta, esTerminado } from '../../components/admin/TallerPiezas';
import { aNumero, porTexto, textoONulo } from '../../components/admin/util';
import './Inventario.css';
import './Taller.css';
import './Mostrador.css';

type Tipo = ItemPedidoNuevo['tipo'];
interface Linea {
  tipo: Tipo;
  id: string;
  cantidad: number;
}
type Filtro = '' | 'jabon' | 'vela' | 'set' | 'otros';
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: '', texto: 'Todo' },
  { id: 'jabon', texto: 'Jabones' },
  { id: 'vela', texto: 'Velas' },
  { id: 'set', texto: 'Sets' },
  { id: 'otros', texto: 'Otros' },
];
const METODOS: MetodoPago[] = ['efectivo', 'tarjeta', 'transferencia', 'cortesia'];
const MAXIMO = 99;

const normal = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const centavos = (n: number) => Math.round(n * 100) / 100;
/** Piezas que se pueden vender (el stock en pz, sin fracciones ni negativos). */
const piezas = (p: Producto) => Math.max(0, Math.floor(p.stock_actual + 1e-9));

export default function Mostrador() {
  const datos = useAsync(() => Promise.all([api.admin.getProductos(), api.getCatalogo()]), []);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('');
  const [verServicios, setVerServicios] = useState(false);
  const [clienta, setClienta] = useState<ClienteElegido | null>(null);
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [propina, setPropina] = useState('');
  const [pagaCon, setPagaCon] = useState('');
  const [notas, setNotas] = useState('');
  const [ticket, setTicket] = useState<DatosTicket | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const carritoRef = useRef<HTMLElement>(null);

  // La venta (a la derecha, pegada arriba al bajar) no pasa del borde inferior de la ventana aunque todavía
  // no se haya pegado: así «Cobrar» (pegado al pie de la venta) siempre se ve sin desplazar la página.
  const listo = !!datos.datos && !ticket;
  useEffect(() => {
    const el = carritoRef.current;
    if (!listo || !el) return;
    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      el.style.setProperty('--mos-tope', `${Math.max(16, Math.round(el.getBoundingClientRect().top)) + 16}px`);
    };
    const pedir = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir);
    };
    medir();
    document.addEventListener('scroll', pedir, { passive: true, capture: true });
    window.addEventListener('resize', pedir);
    return () => {
      if (cuadro) cancelAnimationFrame(cuadro);
      document.removeEventListener('scroll', pedir, { capture: true });
      window.removeEventListener('resize', pedir);
    };
  }, [listo]);

  const [productos, catalogo] = datos.datos ?? [[], null];
  const vendibles = useMemo(
    () =>
      productos
        .filter((p) => p.activo && p.precio_venta !== null && esDeVenta(p))
        .sort(
          (a, b) =>
            Number(esTerminado(b.categoria)) - Number(esTerminado(a.categoria)) ||
            Number(b.destacado) - Number(a.destacado) ||
            a.orden - b.orden ||
            porTexto<Producto>((x) => x.nombre)(a, b),
        ),
    [productos],
  );
  const servicios = useMemo(
    () => (catalogo?.servicios ?? []).filter((s) => s.activo && s.etapa === 'disponible' && s.precio !== null).sort((a, b) => a.orden - b.orden),
    [catalogo],
  );
  const paquetes = useMemo(() => (catalogo?.paquetes ?? []).filter((p) => p.activo && p.precio !== null).sort((a, b) => a.orden - b.orden), [catalogo]);
  const porId = {
    producto: new Map(productos.map((p) => [p.id, p])),
    servicio: new Map<string, Servicio>(servicios.map((s) => [s.id, s])),
    paquete: new Map<string, Paquete>(paquetes.map((p) => [p.id, p])),
  };

  const info = (l: Linea) => {
    if (l.tipo === 'producto') {
      const p = porId.producto.get(l.id);
      return { nombre: p?.nombre ?? 'Producto', precio: p?.precio_venta ?? 0, maximo: p ? Math.min(MAXIMO, piezas(p)) : 0, sub: p?.presentacion ?? null };
    }
    if (l.tipo === 'servicio') {
      const s = porId.servicio.get(l.id);
      return { nombre: s?.nombre ?? 'Servicio', precio: s?.precio ?? 0, maximo: MAXIMO, sub: 'Servicio prepagado' };
    }
    const q = porId.paquete.get(l.id);
    return { nombre: q?.nombre ?? 'Paquete', precio: q?.precio ?? 0, maximo: MAXIMO, sub: 'Paquete prepagado' };
  };

  const enCarrito = (tipo: Tipo, id: string) => lineas.find((l) => l.tipo === tipo && l.id === id)?.cantidad ?? 0;
  const total = centavos(lineas.reduce((s, l) => s + info(l).precio * l.cantidad, 0));
  const articulos = lineas.reduce((s, l) => s + l.cantidad, 0);
  const conServicios = lineas.some((l) => l.tipo !== 'producto');
  const nPropina = propina.trim() === '' ? 0 : aNumero(propina);
  const nPagaCon = metodo === 'efectivo' && pagaCon.trim() !== '' ? aNumero(pagaCon) : null;
  const cambio = nPagaCon !== null && nPropina !== null ? centavos(nPagaCon - total - nPropina) : null;
  const cortesia = metodo === 'cortesia';

  const agregar = (tipo: Tipo, id: string, nombre: string, maximo: number) => {
    const actual = enCarrito(tipo, id);
    if (actual >= maximo) {
      setAnuncio(`Ya no hay más piezas de ${nombre}.`);
      return;
    }
    setLineas((xs) => (actual ? xs.map((l) => (l.tipo === tipo && l.id === id ? { ...l, cantidad: l.cantidad + 1 } : l)) : [...xs, { tipo, id, cantidad: 1 }]));
    setAnuncio(`${nombre} en el carrito: ${actual + 1}.`);
  };
  const fijar = (l: Linea, cantidad: number) => {
    const { maximo, nombre } = info(l);
    const c = Math.max(0, Math.min(maximo, Math.floor(cantidad)));
    setLineas((xs) => (c === 0 ? xs.filter((x) => !(x.tipo === l.tipo && x.id === l.id)) : xs.map((x) => (x.tipo === l.tipo && x.id === l.id ? { ...x, cantidad: c } : x))));
    setAnuncio(c === 0 ? `${nombre} fuera del carrito.` : `${nombre}: ${c}.`);
  };

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    if (lineas.length === 0) throw new Error('Agrega al menos un artículo.');
    if (conServicios && !clienta) throw new Error('Para vender servicios prepagados elige a la clienta.');
    if (nPropina === null || nPropina < 0) throw new Error('Revisa la propina: un número mayor o igual a cero.');
    if (nPagaCon !== null && cambio !== null && cambio < 0) throw new Error(`Con ${dinero(nPagaCon)} no alcanza: faltan ${dinero(-cambio)}.`);
    if (metodo === 'efectivo' && pagaCon.trim() !== '' && nPagaCon === null) throw new Error('Revisa con cuánto paga.');
    for (const l of lineas) {
      const { maximo, nombre } = info(l);
      if (l.cantidad > maximo) throw new Error(maximo === 0 ? `Ya no tenemos ${nombre}.` : `Sólo quedan ${maximo} piezas de ${nombre}.`);
    }
    const items: ItemPedidoNuevo[] = lineas.map((l) => ({ tipo: l.tipo, id: l.id, cantidad: l.cantidad }));
    const r = await api.admin.ventaMostrador({ items, metodo, cliente_id: clienta?.id ?? null, propina: nPropina, notas: textoONulo(notas) });
    const t: DatosTicket = {
      pedido_id: r.id,
      folio: r.folio,
      total: r.total,
      fecha: new Date().toISOString(),
      metodo,
      propina: nPropina,
      clienta: clienta?.nombre ?? null,
      articulos: lineas.map((l) => {
        const i = info(l);
        return { descripcion: i.nombre, cantidad: l.cantidad, precio: i.precio, servicio: l.tipo !== 'producto' };
      }),
      pagaCon: nPagaCon,
      notas: textoONulo(notas),
    };
    return t;
  });

  const cobrar = async () => {
    setError(null);
    const t = await ejecutar();
    if (t) {
      setTicket(t);
      datos.recargar();
      window.scrollTo?.(0, 0);
    }
  };

  const nueva = () => {
    setTicket(null);
    setLineas([]);
    setClienta(null);
    setMetodo('efectivo');
    setPropina('');
    setPagaCon('');
    setNotas('');
    setBusqueda('');
    setError(null);
    setAnuncio('Carrito vacío, lista para otra venta.');
  };

  const q = normal(busqueda.trim());
  const visibles = vendibles
    .filter((p) => (!filtro ? true : filtro === 'otros' ? !esTerminado(p.categoria) : p.categoria === filtro))
    .filter((p) => !q || normal(`${p.nombre} ${p.aroma ?? ''} ${p.marca ?? ''}`).includes(q));

  const verCarrito = () => {
    carritoRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    carritoRef.current?.focus({ preventScroll: true });
  };

  if (ticket)
    return (
      <div className="adm-pagina mos-pagina">
        <Ticket t={ticket} onNueva={nueva} />
        <p className="sr-only" aria-live="polite">
          {anuncio}
        </p>
      </div>
    );

  return (
    <div className="adm-pagina mos-pagina">
      <EncabezadoAdmin titulo="Mostrador" descripcion="Vende en el spa: toca un producto para agregarlo, elige cómo paga y cobra. Se descuenta del inventario al momento.">
        <Link className="btn btn-secundario" to="/admin/pedidos">
          Ver pedidos
        </Link>
      </EncabezadoAdmin>

      {datos.cargando && !datos.datos && <Cargando texto="Preparando el mostrador…" />}
      <MensajeError error={datos.error} onReintentar={datos.recargar} />
      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>

      {datos.datos && (
        <div className="mos-marco">
          <section className="mos-catalogo" aria-label="Productos">
            <div className="mos-buscar">
              <div className="campo adm-sin-margen mos-buscar-campo">
                <label className="sr-only" htmlFor="mos-buscar">
                  Buscar producto
                </label>
                <input
                  id="mos-buscar"
                  className="input"
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Busca un producto o aroma"
                  autoComplete="off"
                />
              </div>
              <div className="tal-chips" role="group" aria-label="Filtrar por tipo">
                {FILTROS.map((f) => (
                  <button
                    key={f.id || 'todo'}
                    type="button"
                    className={`tal-chip ${filtro === f.id ? 'tal-chip-activo' : ''}`}
                    aria-pressed={filtro === f.id}
                    onClick={() => setFiltro(f.id)}
                  >
                    {f.texto}
                  </button>
                ))}
              </div>
            </div>

            {vendibles.length === 0 ? (
              <Vacio titulo="No hay productos a la venta">
                Da de alta tus jabones y velas en el <Link to="/admin/taller">Taller</Link> (con precio) para venderlos aquí.
              </Vacio>
            ) : visibles.length === 0 ? (
              <Vacio titulo={`No encontramos “${busqueda.trim() || 'eso'}”`}>Prueba con otro nombre o quita el filtro.</Vacio>
            ) : (
              <ul className="mos-productos">
                {visibles.map((p) => {
                  const hay = piezas(p);
                  const lleva = enCarrito('producto', p.id);
                  const agotado = hay === 0;
                  const tope = !agotado && lleva >= Math.min(MAXIMO, hay);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`mos-producto ${lleva ? 'mos-producto-elegido' : ''}`}
                        disabled={agotado || tope}
                        onClick={() => agregar('producto', p.id, p.nombre, Math.min(MAXIMO, hay))}
                        aria-label={`Agregar ${p.nombre}, ${dinero(p.precio_venta)}, ${agotado ? 'agotado' : `quedan ${hay}`}${lleva ? `, llevas ${lleva}` : ''}`}
                      >
                        <MiniaturaProducto producto={p} className="mos-producto-imagen" />
                        <span className="mos-producto-nombre">{p.nombre}</span>
                        <span className="mos-producto-pie">
                          <strong className="num">{dinero(p.precio_venta)}</strong>
                          <span className={`mos-producto-stock ${agotado ? 'mos-agotado' : hay <= 3 ? 'mos-pocas' : ''}`}>
                            {agotado ? 'Agotado' : tope ? 'Todas en el carrito' : `Quedan ${numero(hay)}`}
                          </span>
                        </span>
                        {lleva > 0 && (
                          <span className="mos-producto-cuenta num" aria-hidden="true">
                            {lleva}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mos-servicios">
              <button type="button" className="btn btn-secundario" aria-expanded={verServicios} aria-controls="mos-servicios-lista" onClick={() => setVerServicios((v) => !v)}>
                {verServicios ? 'Ocultar servicios y paquetes' : '+ Agregar servicios o paquetes prepagados'}
              </button>
              {verServicios && (
                <div id="mos-servicios-lista" className="mos-servicios-lista">
                  <p className="ayuda adm-sin-margen">Se guardan en la cuenta de la clienta como servicios prepagados; los usa al reservar. Hay que elegir a la clienta.</p>
                  {servicios.length + paquetes.length === 0 ? (
                    <p className="texto-3 adm-sin-margen">No hay servicios ni paquetes con precio.</p>
                  ) : (
                    <ul className="mos-lista-servicios">
                      {paquetes.map((q) => (
                        <li key={`q-${q.id}`}>
                          <span>
                            <strong>{q.nombre}</strong>
                            <span className="adm-sub">Paquete · {dinero(q.precio)}</span>
                          </span>
                          <button type="button" className="btn btn-secundario btn-sm" onClick={() => agregar('paquete', q.id, q.nombre, MAXIMO)}>
                            Agregar<span className="sr-only"> {q.nombre}</span>
                            {enCarrito('paquete', q.id) ? ` (${enCarrito('paquete', q.id)})` : ''}
                          </button>
                        </li>
                      ))}
                      {servicios.map((s) => (
                        <li key={`s-${s.id}`}>
                          <span>
                            <strong>{s.nombre}</strong>
                            <span className="adm-sub">Servicio · {dinero(s.precio)}</span>
                          </span>
                          <button type="button" className="btn btn-secundario btn-sm" onClick={() => agregar('servicio', s.id, s.nombre, MAXIMO)}>
                            Agregar<span className="sr-only"> {s.nombre}</span>
                            {enCarrito('servicio', s.id) ? ` (${enCarrito('servicio', s.id)})` : ''}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="mos-carrito" aria-labelledby="mos-carrito-titulo" ref={carritoRef} tabIndex={-1}>
            <h2 id="mos-carrito-titulo" className="mos-carrito-titulo">
              Venta {articulos > 0 && <span className="mos-carrito-cuenta num">{articulos}</span>}
            </h2>
            {lineas.length === 0 ? (
              <p className="texto-3 mos-carrito-vacio">Toca un producto para agregarlo.</p>
            ) : (
              <ul className="mos-lineas">
                {lineas.map((l) => {
                  const i = info(l);
                  return (
                    <li key={`${l.tipo}-${l.id}`} className="mos-linea">
                      <div className="mos-linea-texto">
                        <span className="mos-linea-nombre">{i.nombre}</span>
                        <span className="adm-sub">
                          {dinero(i.precio)} c/u{i.sub && l.tipo !== 'producto' ? ` · ${i.sub}` : ''}
                        </span>
                      </div>
                      <div className="mos-cantidad" role="group" aria-label={`Cantidad de ${i.nombre}`}>
                        <button type="button" className="mos-paso" onClick={() => fijar(l, l.cantidad - 1)} aria-label={`Una menos de ${i.nombre}`}>
                          −
                        </button>
                        <span className="mos-cantidad-num num" aria-live="polite">
                          {l.cantidad}
                        </span>
                        <button
                          type="button"
                          className="mos-paso"
                          onClick={() => fijar(l, l.cantidad + 1)}
                          disabled={l.cantidad >= i.maximo}
                          aria-label={`Una más de ${i.nombre}`}
                        >
                          +
                        </button>
                      </div>
                      <span className="mos-linea-importe num">{dinero(i.precio * l.cantidad)}</span>
                      <button type="button" className="btn btn-texto btn-sm adm-texto-peligro mos-quitar" onClick={() => fijar(l, 0)} aria-label={`Quitar ${i.nombre}`}>
                        Quitar
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mos-total">
              <span>Total</span>
              <strong className="num">{dinero(total)}</strong>
            </div>

            <fieldset className="mos-bloque">
              <legend>Clienta</legend>
              <ElegirClienta clienta={clienta} onCambio={setClienta} obligatoria={conServicios} />
            </fieldset>

            <fieldset className="mos-bloque">
              <legend>¿Cómo paga?</legend>
              <div className="mos-metodos" role="radiogroup" aria-label="Método de pago">
                {METODOS.map((m) => (
                  <label key={m} className={`mos-metodo ${metodo === m ? 'mos-metodo-activo' : ''}`}>
                    <input type="radio" name="mos-metodo" value={m} checked={metodo === m} onChange={() => setMetodo(m)} />
                    {ETIQUETA_METODO_PAGO[m]}
                  </label>
                ))}
              </div>
              {cortesia && (
                <p className="aviso aviso-info adm-sin-margen mos-aviso" role="status">
                  La cortesía no cuenta como ingreso del spa: los productos salen del inventario y su costo cuenta, pero no entra dinero.
                </p>
              )}
              <div className="mos-pago-campos">
                {metodo === 'efectivo' && (
                  <div className="campo adm-sin-margen">
                    <label className="etiqueta" htmlFor="mos-paga-con">
                      Paga con (opcional)
                    </label>
                    <EntradaConUnidad id="mos-paga-con" valor={pagaCon} onCambio={setPagaCon} antes="$" placeholder={total ? String(total) : '0'} descrita="mos-cambio" />
                    <span className="ayuda mos-cambio" id="mos-cambio" aria-live="polite">
                      {cambio === null ? 'Para calcular el cambio.' : cambio >= 0 ? `Cambio: ${dinero(cambio)}` : `Faltan ${dinero(-cambio)}`}
                    </span>
                  </div>
                )}
                <div className="campo adm-sin-margen">
                  <label className="etiqueta" htmlFor="mos-propina">
                    Propina (aparte)
                  </label>
                  <EntradaConUnidad id="mos-propina" valor={propina} onCambio={setPropina} antes="$" placeholder="0" invalido={nPropina === null} descrita="mos-propina-ayuda" />
                  <span className="ayuda" id="mos-propina-ayuda">
                    Es de quien atendió: no cuenta como ingreso del spa.
                  </span>
                </div>
              </div>
              <div className="campo adm-sin-margen">
                <label className="etiqueta" htmlFor="mos-notas">
                  Nota (opcional)
                </label>
                <input
                  id="mos-notas"
                  className="input"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder={metodo === 'tarjeta' || metodo === 'transferencia' ? 'Últimos dígitos o clave de rastreo' : 'Para regalo, a quién atendió…'}
                />
              </div>
            </fieldset>

            <div className="mos-cobrar-pie">
              <MensajeError error={error} />
              <button
                type="button"
                className="btn btn-primario btn-bloque mos-cobrar"
                onClick={() => void cobrar()}
                disabled={enviando || lineas.length === 0 || (conServicios && !clienta)}
              >
                {enviando ? 'Cobrando…' : cortesia ? `Registrar cortesía de ${dinero(total)}` : `Cobrar ${dinero(total)}`}
              </button>
              {conServicios && !clienta && <p className="ayuda adm-sin-margen mos-falta">Elige a la clienta para cobrar los servicios prepagados.</p>}
            </div>
          </section>

          {lineas.length > 0 && (
            <div className="mos-barra-fija">
              <span>
                <strong className="num">{articulos}</strong> {articulos === 1 ? 'artículo' : 'artículos'} · <strong className="num">{dinero(total)}</strong>
              </span>
              <button type="button" className="btn btn-primario" onClick={verCarrito}>
                Ver venta y cobrar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
