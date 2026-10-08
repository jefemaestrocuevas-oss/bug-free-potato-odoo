import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Catalogo, type ProductoTienda } from '../../lib/api';
import { dinero } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { Gema } from '../../components/ui/Gema';
import { IlustracionProducto } from '../../components/ui/IlustracionProducto';
import { ComprarConRegalo } from '../../components/publico/Comprar';
import { Destello, PatronFacetas } from '../../components/publico/Decoracion';
import { useTitulo } from '../../components/publico/EncabezadoPagina';
import { TarjetaProducto } from '../../components/publico/Producto';
import { Precio } from '../../components/publico/TarjetasCatalogo';
import {
  ahorroPaquete,
  categoriasOrdenadas,
  etiquetaTipoPaquete,
  listaIncluye,
  mapaServicios,
  paquetesOrdenados,
  paqueteVendible,
  serviciosDeCategoria,
  servicioVendible,
  textoDuracion,
  unirConY,
} from '../../components/publico/catalogo';
import { textoVigencia, useContacto } from '../../components/publico/contacto';
import { cuandoAbrimos, direccionCorta, gruposConProductos, productosDelGrupo, type GrupoTienda } from '../../components/publico/tienda';
import {
  IconoBolsa,
  IconoCalendario,
  IconoCategoria,
  IconoCheck,
  IconoFlecha,
  IconoHoja,
  IconoJabon,
  IconoRegalo,
  IconoReloj,
  IconoUbicacion,
  IconoVela,
} from '../../components/publico/Iconos';
import './catalogo-paginas.css';

const TODO = 'todo';

const ICONO_GRUPO: Record<GrupoTienda, ReactNode> = {
  jabones: <IconoJabon tam={24} />,
  velas: <IconoVela tam={24} />,
  sets: <IconoRegalo tam={24} />,
  cuidado: <IconoHoja tam={24} />,
};

export default function Tienda() {
  useTitulo('Tienda: jabones, velas y regalos');
  const contacto = useContacto();
  const [params, setParams] = useSearchParams();
  const catalogo = useAsync(() => api.getCatalogo(), []);
  const productos = useAsync(() => api.getProductosTienda(), []);
  const vigencia = textoVigencia(contacto.vigencia_creditos_dias);
  const apertura = cuandoAbrimos(contacto.fecha_apertura);

  return (
    <>
      <header className="sp-cabecera tda-hero">
        <PatronFacetas className="sp-cabecera-patron" />
        <Destello className="sp-cabecera-destello" />
        <div className="contenedor tda-hero-rejilla">
          <div className="sp-cabecera-contenido">
            <p className="eyebrow">Hecho en Ópalo · Tienda</p>
            <h1 className="sp-cabecera-titulo">Jabones y velas hechos a mano</h1>
            <div className="subtitulo sp-cabecera-texto">
              <p>
                Los hacemos aquí, en Ópalo, en lotes pequeños. Nuestros jabones se curan varias semanas antes de venderse,
                para que lleguen a ti en su punto.
              </p>
            </div>
            <div className="fila sp-cabecera-acciones">
              <Link className="btn btn-primario" to={{ hash: '#productos' }}>
                Ver jabones y velas
              </Link>
              <Link className="btn btn-texto" to={{ hash: '#servicios' }}>
                Regala o prepaga servicios <IconoFlecha tam={18} />
              </Link>
            </div>
          </div>
          <div className="tda-hero-arte" aria-hidden="true">
            <span className="tda-hero-halo" />
            <IlustracionProducto categoria="jabon" color="#d9ccae" nombre="opalo-jabon" className="tda-hero-jabon" />
            <IlustracionProducto categoria="vela" color="#efe3cc" nombre="opalo-vela" className="tda-hero-vela" />
          </div>
        </div>
      </header>

      <section className="contenedor tda-como" aria-labelledby="tda-promesas-titulo">
        <h2 id="tda-promesas-titulo" className="sr-only">
          Cómo los hacemos y cómo los recibes
        </h2>
        <ul className="tda-pasos">
          <li>
            <IconoHoja tam={22} />
            <div>
              <strong>Hechos a mano</strong>
              <span>En nuestro taller de Ópalo, en lotes pequeños.</span>
            </div>
          </li>
          <li>
            <IconoReloj tam={22} />
            <div>
              <strong>Curados sin prisa</strong>
              <span>Los jabones reposan semanas antes de llegar a la tienda.</span>
            </div>
          </li>
          <li>
            <IconoUbicacion tam={22} />
            <div>
              <strong>Recoges en Ópalo</strong>
              <span>
                {direccionCorta(contacto.direccion)}. Pagas en el spa o por transferencia.
                {apertura ? ` Puedes pagar y recoger ${apertura}.` : ''}
              </span>
            </div>
          </li>
        </ul>
      </section>

      <div className="contenedor seccion tda">
        <section id="productos" className="tda-productos" aria-labelledby="tda-productos-titulo">
          <h2 id="tda-productos-titulo" className="sr-only">
            Jabones, velas y más
          </h2>
          {productos.cargando && <Cargando texto="Cargando la tienda…" />}
          <MensajeError error={productos.error} onReintentar={productos.recargar} />
          {productos.datos && (
            <Productos
              productos={productos.datos}
              ver={params.get('ver') ?? TODO}
              onVer={(v) => {
                const p = new URLSearchParams(params);
                if (v === TODO) p.delete('ver');
                else p.set('ver', v);
                setParams(p, { replace: true });
              }}
            />
          )}
        </section>

        <section id="servicios" className="tda-servicios" aria-labelledby="tda-servicios-titulo">
          <header className="tda-servicios-cabeza">
            <span className="sp-medallon sp-medallon-oro" aria-hidden="true">
              <IconoRegalo tam={24} />
            </span>
            <div>
              <p className="eyebrow">Servicios y paquetes</p>
              <h2 id="tda-servicios-titulo">Regala o prepaga servicios</h2>
              <p>
                Paga tus servicios y paquetes por adelantado y úsalos cuando quieras durante {vigencia}. También puedes
                regalarlos: te damos un código para que se lo entregues a quien quieras.
              </p>
            </div>
          </header>
          <ol className="tda-pasos tda-pasos-servicios">
            <li>
              <IconoBolsa tam={22} />
              <div>
                <strong>Haz tu pedido</strong>
                <span>Todavía no cobramos en línea: eliges y nos lo pides aquí.</span>
              </div>
            </li>
            <li>
              <IconoCheck tam={22} />
              <div>
                <strong>Paga en el spa o por transferencia</strong>
                <span>Efectivo o tarjeta en Ópalo, o transferencia.</span>
              </div>
            </li>
            <li>
              <IconoCalendario tam={22} />
              <div>
                <strong>Agenda cuando quieras</strong>
                <span>Al registrar tu pago, tus servicios aparecen en "Mi cuenta" por {vigencia}.</span>
              </div>
            </li>
            <li>
              <IconoRegalo tam={22} />
              <div>
                <strong>¿Es un regalo?</strong>
                <span>Marca "Es para regalo" y te damos un código para entregarlo.</span>
              </div>
            </li>
          </ol>
          {catalogo.cargando && <Cargando texto="Cargando servicios…" />}
          <MensajeError error={catalogo.error} onReintentar={catalogo.recargar} />
          {catalogo.datos && <ServiciosEnVenta catalogo={catalogo.datos} vigenciaGeneral={contacto.vigencia_creditos_dias} />}
        </section>
      </div>
    </>
  );
}

function Productos({ productos, ver, onVer }: { productos: ProductoTienda[]; ver: string; onVer: (v: string) => void }) {
  const grupos = gruposConProductos(productos);
  if (grupos.length === 0) {
    return (
      <div className="tda-pronto">
        <div className="tda-pronto-arte" aria-hidden="true">
          <IlustracionProducto categoria="jabon" color="#d9ccae" nombre="pronto-jabon" />
          <IlustracionProducto categoria="vela" color="#efe3cc" nombre="pronto-vela" />
        </div>
        <Vacio titulo="Muy pronto: jabones y velas hechos en Ópalo">
          <p>Aquí vas a encontrar lo que hacemos a mano en nuestro taller. Mientras, puedes regalar o prepagar servicios.</p>
        </Vacio>
      </div>
    );
  }
  const actual = grupos.some((g) => g.valor === ver) ? (ver as GrupoTienda) : TODO;
  const visibles = actual === TODO ? grupos : grupos.filter((g) => g.valor === actual);
  const cuantos = actual === TODO ? productos.length : productosDelGrupo(productos, actual).length;

  return (
    <>
      {grupos.length > 1 && (
        <nav className="srv-filtros tda-filtros" aria-label="Filtrar productos">
          <ul>
            {[{ valor: TODO, texto: 'Todo' }, ...grupos].map((o) => (
              <li key={o.valor}>
                <button type="button" className="srv-filtro" aria-pressed={actual === o.valor} onClick={() => onVer(o.valor)}>
                  {o.texto}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <p className="sr-only" role="status">
        {`Mostrando ${cuantos} ${cuantos === 1 ? 'producto' : 'productos'}.`}
      </p>
      {visibles.map((g) => (
        <section key={g.valor} className="tda-grupo" aria-labelledby={`tda-grupo-${g.valor}`}>
          <header className="srv-seccion-cabeza">
            <span className={`sp-medallon ${g.valor === 'sets' ? 'sp-medallon-oro' : ''}`} aria-hidden="true">
              {ICONO_GRUPO[g.valor]}
            </span>
            <div>
              <h2 id={`tda-grupo-${g.valor}`}>{g.texto}</h2>
              <p>{g.descripcion}</p>
            </div>
          </header>
          <ul className="prod-rejilla">
            {productosDelGrupo(productos, g.valor).map((p) => (
              <li key={p.id}>
                <TarjetaProducto producto={p} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function ServiciosEnVenta({ catalogo, vigenciaGeneral }: { catalogo: Catalogo; vigenciaGeneral: number }) {
  const porId = mapaServicios(catalogo);
  const paquetes = paquetesOrdenados(catalogo).filter(paqueteVendible);
  const grupos = categoriasOrdenadas(catalogo)
    .map((c) => ({ categoria: c, servicios: serviciosDeCategoria(catalogo, c).filter(servicioVendible) }))
    .filter((g) => g.servicios.length > 0);
  const hayPendientes = catalogo.servicios.some((s) => s.activo && s.etapa === 'disponible' && s.precio === null);

  if (paquetes.length === 0 && grupos.length === 0) {
    return (
      <Vacio titulo="Muy pronto podrás comprar servicios en línea">
        <p>
          Mientras confirmamos precios, puedes <Link to="/reservar">reservar tu cita</Link> y pagar en cabina.
        </p>
      </Vacio>
    );
  }

  return (
    <>
      {paquetes.length > 0 && (
        <section className="srv-seccion" aria-labelledby="tda-paquetes">
          <header className="srv-seccion-cabeza">
            <span className="sp-medallon sp-medallon-oro" aria-hidden="true">
              <Gema tam={24} />
            </span>
            <div>
              <h3 id="tda-paquetes">Paquetes</h3>
              <p>Varios servicios a un precio especial, listos para agendar cuando quieras.</p>
            </div>
          </header>
          <ul className="tda-rejilla">
            {paquetes.map((p) => {
              const ahorro = ahorroPaquete(p, porId);
              return (
                <li key={p.id} className="tda-item">
                  <p className="tda-item-tipo">{etiquetaTipoPaquete(p)}</p>
                  <h4 className="tda-item-nombre">{p.nombre}</h4>
                  <p className="tda-item-detalle">Incluye {unirConY(listaIncluye(p, porId))}.</p>
                  <p className="tda-item-precio">
                    <Precio valor={p.precio} />
                    {ahorro && <span className="tda-item-ahorro">Ahorras {dinero(ahorro.ahorro)}</span>}
                  </p>
                  <p className="tda-item-vigencia">Vigencia: {textoVigencia(p.vigencia_dias ?? vigenciaGeneral)} desde que se registra tu pago.</p>
                  <ComprarConRegalo item={{ tipo: 'paquete', id: p.id, nombre: p.nombre, precio: p.precio as number, detalle: etiquetaTipoPaquete(p) }} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {grupos.map(({ categoria: c, servicios }) => (
        <section key={c.id} className="srv-seccion" aria-labelledby={`tda-${c.slug}`}>
          <header className="srv-seccion-cabeza">
            <span className="sp-medallon" aria-hidden="true">
              <IconoCategoria slug={c.slug} />
            </span>
            <div>
              <h3 id={`tda-${c.slug}`}>{c.nombre}</h3>
              {c.descripcion && <p>{c.descripcion}</p>}
            </div>
          </header>
          <ul className="tda-rejilla">
            {servicios.map((s) => (
              <li key={s.id} className="tda-item">
                <h4 className="tda-item-nombre">{s.nombre}</h4>
                {s.zonas_incluye && <p className="tda-item-detalle">Incluye: {s.zonas_incluye}</p>}
                <p className="tda-item-detalle">{s.es_complemento ? 'Complemento: se agrega a tu servicio' : textoDuracion(s)}</p>
                <p className="tda-item-precio">
                  <Precio valor={s.precio} />
                </p>
                <ComprarConRegalo
                  item={{ tipo: 'servicio', id: s.id, nombre: s.nombre, precio: s.precio as number, detalle: s.es_complemento ? 'Complemento' : textoDuracion(s) }}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {hayPendientes && (
        <p className="srv-leyenda">
          Algunos servicios todavía tienen el precio por confirmar; ésos no se venden en línea, pero sí puedes{' '}
          <Link to="/servicios">reservarlos</Link> y pagarlos en cabina.
        </p>
      )}
    </>
  );
}
