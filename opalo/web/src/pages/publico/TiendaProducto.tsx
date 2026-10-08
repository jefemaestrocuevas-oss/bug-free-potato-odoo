// Ficha de un producto de la tienda (/tienda/:slug): imagen grande, todo lo que dice su etiqueta,
// cantidad limitada a las existencias, opción de regalo y otros productos de la misma categoría.
import { useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type ProductoTienda } from '../../lib/api';
import { useCarrito } from '../../lib/carrito';
import { dinero, enlaceWhatsApp } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError } from '../../components/ui/Estado';
import { Gema } from '../../components/ui/Gema';
import { IlustracionProducto } from '../../components/ui/IlustracionProducto';
import { useTitulo } from '../../components/publico/EncabezadoPagina';
import {
  AvisameWhatsApp,
  EstadoProducto,
  ImagenProducto,
  InsigniaHechoEnOpalo,
  itemDeProducto,
  SelectorCantidad,
  TarjetaProducto,
  useConfirmacion,
} from '../../components/publico/Producto';
import { useContacto } from '../../components/publico/contacto';
import {
  buscarProducto,
  cuandoAbrimos,
  estadoExistencias,
  etiquetaProducto,
  grupoDe,
  GRUPOS_TIENDA,
  piezasDisponibles,
  relacionados,
  type EstadoExistencias,
} from '../../components/publico/tienda';
import { IconoBolsa, IconoCheck, IconoFlecha, IconoMensaje, IconoRegalo, IconoUbicacion } from '../../components/publico/Iconos';
import './tienda-producto.css';

export default function TiendaProducto() {
  const { slug } = useParams<{ slug: string }>();
  const productos = useAsync(() => api.getProductosTienda(), []);
  const producto = productos.datos ? buscarProducto(productos.datos, slug) : null;
  useTitulo(producto ? producto.nombre : productos.datos ? 'Producto no encontrado' : 'Tienda');

  if (!productos.datos) {
    return (
      <div className="contenedor seccion">
        {productos.cargando && <Cargando texto="Cargando el producto…" />}
        <MensajeError error={productos.error} onReintentar={productos.recargar} />
      </div>
    );
  }
  if (!producto) return <ProductoNoEncontrado />;
  return <Ficha key={producto.id} producto={producto} productos={productos.datos} />;
}

function Ficha({ producto: p, productos }: { producto: ProductoTienda; productos: ProductoTienda[] }) {
  const contacto = useContacto();
  const estado = estadoExistencias(p);
  const grupo = GRUPOS_TIENDA.find((g) => g.valor === grupoDe(p.categoria)) ?? GRUPOS_TIENDA[0];
  const otros = relacionados(productos, p, 3);
  const contenido = p.contenido_neto || p.presentacion;
  const apertura = cuandoAbrimos(contacto.fecha_apertura);
  const detalles = [
    { titulo: 'Ingredientes', texto: p.ingredientes, clase: '' },
    { titulo: 'Modo de uso', texto: p.modo_uso, clase: '' },
    { titulo: 'Advertencias', texto: p.advertencias, clase: 'pf-detalle-aviso' },
  ].filter((d) => d.texto && d.texto.trim());

  return (
    <article className="pf" aria-labelledby="pf-nombre">
      <div className="contenedor">
        <nav className="pf-migas" aria-label="Ruta">
          <Link to="/tienda">Tienda</Link>
          <span aria-hidden="true"> / </span>
          <Link to={`/tienda?ver=${grupo.valor}`}>{grupo.texto}</Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{p.nombre}</span>
        </nav>

        <div className="pf-rejilla">
          <div className="pf-imagen">
            <ImagenProducto categoria={p.categoria} color={p.color_hex} foto={p.foto_url} nombre={p.nombre} alt={p.nombre} />
            {p.hecho_en_opalo && <InsigniaHechoEnOpalo className="pf-insignia" />}
          </div>

          <div className="pf-info">
            <p className="eyebrow pf-tipo">{etiquetaProducto(p)}</p>
            <h1 id="pf-nombre" className="pf-nombre">
              {p.nombre}
            </h1>
            {(p.aroma || contenido) && (
              <dl className="pf-datos">
                {p.aroma && (
                  <div>
                    <dt>Aroma</dt>
                    <dd>{p.aroma}</dd>
                  </div>
                )}
                {contenido && (
                  <div>
                    <dt>Contenido</dt>
                    <dd>{contenido}</dd>
                  </div>
                )}
              </dl>
            )}
            <p className="pf-precio">
              <span className="pf-precio-valor num">{dinero(p.precio_venta)}</span>
              <EstadoProducto estado={estado} />
            </p>
            {p.descripcion && <p className="pf-descripcion">{p.descripcion}</p>}

            {estado.piezas > 0 ? <ComprarProducto producto={p} /> : <SinExistencias producto={p} estado={estado} />}

            <div className="pf-recoger">
              <IconoUbicacion tam={22} />
              <div>
                <strong>Recoges tu pedido en Ópalo</strong>
                <span>{contacto.direccion}</span>
                {apertura && <span className="pf-apertura">Puedes pagar y recoger {apertura}.</span>}
                <span>Lo pagas en el spa o por transferencia. Por ahora no hacemos envíos a domicilio.</span>
              </div>
            </div>
            {p.hecho_en_opalo && (
              <p className="pf-hecho">
                <Gema tam={18} /> Hecho a mano en Ópalo, en lotes pequeños.
              </p>
            )}
          </div>
        </div>

        {detalles.length > 0 && (
          <div className="pf-detalles">
            {detalles.map((d) => (
              <section key={d.titulo} className={`pf-detalle ${d.clase}`} aria-labelledby={`pf-${d.titulo}`}>
                <h2 id={`pf-${d.titulo}`}>{d.titulo}</h2>
                <p>{d.texto}</p>
              </section>
            ))}
          </div>
        )}

        <section className="pf-relacionados" aria-labelledby="pf-relacionados-titulo">
          <div className="sp-encabezado-seccion sp-entre-alineado">
            <div>
              <p className="eyebrow">{grupo.texto}</p>
              <h2 id="pf-relacionados-titulo">{otros.length ? 'También te puede gustar' : 'Conoce el resto de la tienda'}</h2>
            </div>
            <Link className="btn btn-texto" to="/tienda">
              Ver toda la tienda <IconoFlecha tam={18} />
            </Link>
          </div>
          {otros.length > 0 && (
            <ul className="prod-rejilla prod-carrusel pf-relacionados-lista">
              {otros.map((o) => (
                <li key={o.id}>
                  <TarjetaProducto producto={o} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}

/** Más de esto no vale la pena avisar ("Puedes agregar hasta N piezas"). */
const CANTIDAD_VISIBLE = 6;

function ComprarProducto({ producto: p }: { producto: ProductoTienda }) {
  const carrito = useCarrito();
  const id = useId();
  const piezas = piezasDisponibles(p);
  const [cantidad, setCantidad] = useState(1);
  const [esRegalo, setEsRegalo] = useState(false);
  const [para, setPara] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listo, confirmar] = useConfirmacion();
  const caben = carrito.puedenAgregarse({ tipo: 'producto', id: p.id, regalo_para: esRegalo ? para : null, maximo: piezas });
  const elegidas = Math.min(cantidad, Math.max(1, caben));

  if (caben === 0 && !listo) {
    return (
      <div className="pf-comprar pf-comprar-lleno">
        <p>
          <IconoCheck tam={18} /> Ya tienes en tu carrito {piezas === 1 ? 'la última pieza' : `las ${piezas} piezas que tenemos`}.
        </p>
        <Link className="btn btn-secundario" to="/carrito">
          Ver mi carrito
        </Link>
      </div>
    );
  }

  const agregar = () => {
    if (esRegalo && !para.trim()) {
      setError('Escribe el nombre de quien recibe el regalo.');
      return;
    }
    const r = carrito.agregar(itemDeProducto(p, { cantidad: elegidas, regalo_para: esRegalo ? para.trim() : null }));
    if (r.agregadas > 0) {
      confirmar();
      setCantidad(1);
      setEsRegalo(false);
      setPara('');
      setError(null);
    }
  };

  return (
    <div className="pf-comprar">
      <div className="pf-comprar-fila">
        <SelectorCantidad id={`${id}-cantidad`} valor={elegidas} maximo={caben} onCambio={setCantidad} etiqueta={`Piezas de ${p.nombre}`} />
        <button type="button" className="btn btn-primario pf-agregar" onClick={agregar}>
          {listo ? <IconoCheck tam={20} /> : <IconoBolsa tam={20} />}
          {listo ? 'Agregado al carrito' : `Agregar · ${dinero(p.precio_venta * elegidas)}`}
        </button>
      </div>
      {caben < CANTIDAD_VISIBLE && (
        <p className="pf-comprar-limite">
          {caben === 1 ? 'Puedes agregar 1 pieza más.' : `Puedes agregar hasta ${caben} piezas.`}
        </p>
      )}
      <div className="pf-regalo">
        <label className="check">
          <input
            type="checkbox"
            checked={esRegalo}
            onChange={(e) => {
              setEsRegalo(e.target.checked);
              setError(null);
            }}
            aria-controls={`${id}-para`}
          />
          <span className="pf-regalo-texto">
            <IconoRegalo tam={18} /> Regálalo
          </span>
        </label>
        {esRegalo && (
          <div className="campo pf-regalo-campo">
            <label className="etiqueta" htmlFor={`${id}-para`}>
              ¿Para quién es?
            </label>
            <input
              id={`${id}-para`}
              className="input"
              value={para}
              maxLength={80}
              autoComplete="off"
              placeholder="Nombre de quien lo recibe"
              onChange={(e) => {
                setPara(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  agregar();
                }
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-ayuda`}
            />
            <span id={`${id}-ayuda`} className={error ? 'ayuda pf-error' : 'ayuda pf-ayuda'}>
              {error ?? 'Anotamos su nombre en tu pedido para tenerlo listo cuando pases por él.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SinExistencias({ producto: p, estado }: { producto: ProductoTienda; estado: EstadoExistencias }) {
  return (
    <div className="pf-sin">
      <p>
        {estado.tipo === 'proximo' ? (
          <>
            <strong>Tenemos un lote nuevo en curado.</strong> Escríbenos y te avisamos en cuanto esté listo.
          </>
        ) : (
          <>
            <strong>Por ahora no lo tenemos.</strong> Escríbenos y te avisamos cuando esté disponible.
          </>
        )}
      </p>
      <AvisameWhatsApp nombre={p.nombre} estado={estado} className="btn btn-primario" />
    </div>
  );
}

function ProductoNoEncontrado() {
  const contacto = useContacto();
  return (
    <section className="contenedor seccion pf-404" aria-labelledby="pf-404-titulo">
      <div className="pf-404-arte" aria-hidden="true">
        <IlustracionProducto categoria="jabon" color="#d9ccae" nombre="no-encontrado" />
      </div>
      <p className="eyebrow">Tienda</p>
      <h1 id="pf-404-titulo">No encontramos este producto</h1>
      <p className="subtitulo">
        Puede que ya no esté a la venta o que el enlace esté incompleto. Te invitamos a ver lo que tenemos hoy en la tienda.
      </p>
      <div className="pf-404-acciones">
        <Link className="btn btn-primario" to="/tienda">
          Ver la tienda
        </Link>
        <a
          className="btn btn-secundario"
          href={enlaceWhatsApp(contacto.telefono_whatsapp, 'Hola, Ópalo. Busco un producto de su tienda.')}
          target="_blank"
          rel="noopener noreferrer"
        >
          <IconoMensaje tam={20} /> Pregúntanos por WhatsApp<span className="sr-only"> (se abre en una pestaña nueva)</span>
        </a>
      </div>
    </section>
  );
}
