import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Catalogo, type MetodoPago, type ProductoTienda, type ResultadoPedido } from '../../lib/api';
import { claveItem, useCarrito, type ItemCarrito } from '../../lib/carrito';
import { dinero, enlaceWhatsApp, ETIQUETA_METODO_PAGO } from '../../lib/format';
import { useSesion } from '../../lib/sesion';
import { useAccion, useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { Gema } from '../../components/ui/Gema';
import { Modal } from '../../components/cuenta/Modal';
import { EncabezadoPagina, useTitulo } from '../../components/publico/EncabezadoPagina';
import { paqueteVendible, servicioVendible, unirConY } from '../../components/publico/catalogo';
import { textoVigencia, useContacto } from '../../components/publico/contacto';
import { ImagenProducto } from '../../components/publico/Producto';
import {
  colorValido,
  cuandoAbrimos,
  direccionCorta,
  estadoExistencias,
  etiquetaProducto,
  fotoValida,
  piezasDisponibles,
} from '../../components/publico/tienda';
import { IconoBasura, IconoMas, IconoMenos, IconoMensaje, IconoRegalo, IconoUbicacion } from '../../components/publico/Iconos';
import './carrito.css';

type MetodoCarrito = Extract<MetodoPago, 'efectivo' | 'tarjeta' | 'transferencia'>;

interface PedidoHecho {
  pedido: ResultadoPedido;
  metodo: MetodoCarrito;
  regalos: boolean;
  productos: boolean;
  servicios: boolean;
}

const METODOS: { valor: MetodoCarrito; titulo: string; texto: string }[] = [
  { valor: 'efectivo', titulo: 'Efectivo en el spa', texto: 'Pagas en Ópalo, en tu próxima visita o cuando pases.' },
  { valor: 'tarjeta', titulo: 'Tarjeta en el spa', texto: 'Pagas con tarjeta de débito o crédito en Ópalo.' },
  { valor: 'transferencia', titulo: 'Transferencia', texto: 'Te compartimos los datos por WhatsApp y nos envías tu comprobante.' },
];

/** Mensajes del servidor sobre existencias ('Por ahora sólo quedan…', 'Por ahora no tenemos…'). */
const ERROR_EXISTENCIAS = /s[óo]lo queda|no tenemos/i;

/** Precio vigente de un ítem según el catálogo, o null si ya no se vende en línea. */
function precioVigente(i: ItemCarrito, cat: Catalogo, productos: ProductoTienda[]): number | null {
  if (i.tipo === 'servicio') {
    const s = cat.servicios.find((x) => x.id === i.id);
    return s && servicioVendible(s) ? s.precio : null;
  }
  if (i.tipo === 'paquete') {
    const p = cat.paquetes.find((x) => x.id === i.id);
    return p && paqueteVendible(p) ? p.precio : null;
  }
  const p = productos.find((x) => x.id === i.id);
  return p ? p.precio_venta : null;
}

export default function Carrito() {
  useTitulo('Tu carrito');
  const carrito = useCarrito();
  const [resultado, setResultado] = useState<PedidoHecho | null>(null);
  // Al vaciar desaparece el botón que tenía el foco: lo llevamos al aviso de carrito vacío.
  const [recienVaciado, setRecienVaciado] = useState(false);
  const vacio = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (recienVaciado) vacio.current?.focus();
  }, [recienVaciado]);

  if (resultado) return <PedidoListo {...resultado} />;

  return (
    <>
      <EncabezadoPagina eyebrow="Tienda" titulo="Tu carrito">
        <p>Revisa tu pedido, elige cómo prefieres pagar y envíanoslo. El pago se hace en el spa o por transferencia.</p>
      </EncabezadoPagina>
      <div className="contenedor seccion">
        {carrito.items.length === 0 ? (
          <div ref={vacio} tabIndex={-1} className="car-vacio">
            <Vacio titulo="Tu carrito está vacío">
              <p>Llévate un jabón o una vela hechos en Ópalo, o compra servicios y paquetes para usarlos cuando quieras o para regalar.</p>
              <div className="car-vacio-acciones">
                <Link className="btn btn-primario" to="/tienda">
                  Ir a la tienda
                </Link>
                <Link className="btn btn-secundario" to="/servicios">
                  Ver servicios
                </Link>
              </div>
            </Vacio>
          </div>
        ) : (
          <ContenidoCarrito onListo={setResultado} onVaciado={() => setRecienVaciado(true)} />
        )}
      </div>
    </>
  );
}

function ContenidoCarrito({ onListo, onVaciado }: { onListo: (r: PedidoHecho) => void; onVaciado: () => void }) {
  const carrito = useCarrito();
  const { sesion, cargando: cargandoSesion } = useSesion();
  const contacto = useContacto();
  const apertura = cuandoAbrimos(contacto.fecha_apertura);
  const idNotas = useId();
  const [metodo, setMetodo] = useState<MetodoCarrito>('efectivo');
  const [notas, setNotas] = useState('');
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false);

  // Revisa precios, disponibilidad y existencias actuales (el servidor vuelve a validar al confirmar).
  const vigentes = useAsync(() => Promise.all([api.getCatalogo(), api.getProductosTienda()]), []);
  const productosPorId = useMemo(() => new Map((vigentes.datos?.[1] ?? []).map((p) => [p.id, p])), [vigentes.datos]);
  const precios = useMemo(() => {
    const m = new Map<string, number | null>();
    if (!vigentes.datos) return m;
    const [cat, prods] = vigentes.datos;
    for (const i of carrito.items) m.set(claveItem(i), precioVigente(i, cat, prods));
    return m;
  }, [vigentes.datos, carrito.items]);

  const { actualizar, ajustarExistencias } = carrito;
  const [preciosCambiaron, setPreciosCambiaron] = useState(false);
  /** Productos cuya cantidad bajamos a las piezas que quedan (nombre → piezas). */
  const [ajustados, setAjustados] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    for (const i of carrito.items) {
      const clave = claveItem(i);
      const p = precios.get(clave);
      if (p !== undefined && p !== null && p !== i.precio) {
        actualizar(clave, { precio: p });
        setPreciosCambiaron(true);
      }
      const prod = i.tipo === 'producto' ? productosPorId.get(i.id) : undefined;
      if (!prod) continue;
      // Productos guardados antes de tener miniatura, o con foto/color nuevos.
      const miniatura = { categoria: prod.categoria, color_hex: colorValido(prod.color_hex), foto_url: fotoValida(prod.foto_url) };
      actualizar(clave, { miniatura, slug: prod.slug || prod.id });
      const piezas = piezasDisponibles(prod);
      if (ajustarExistencias(prod.id, piezas)) {
        setAjustados((prev) => new Map(prev).set(prod.nombre, piezas));
      }
    }
  }, [precios, productosPorId, carrito.items, actualizar, ajustarExistencias]);

  const noDisponibles = carrito.items.filter((i) => precios.get(claveItem(i)) === null);
  const agotados = carrito.items.filter((i) => {
    const p = i.tipo === 'producto' ? productosPorId.get(i.id) : undefined;
    return !!p && piezasDisponibles(p) === 0;
  });
  /** Servicios o paquetes para regalar (llevan código de regalo). */
  const hayRegalos = carrito.items.some((i) => i.regalo_para && i.tipo !== 'producto');
  const hayProductos = carrito.items.some((i) => i.tipo === 'producto');
  const hayServicios = carrito.items.some((i) => i.tipo !== 'producto');
  const bloqueado = noDisponibles.length > 0 || agotados.length > 0;

  const confirmar = useAccion(async () => {
    const pedido = await api.crearPedido(carrito.paraPedido(), metodo, notas.trim() || null);
    carrito.vaciar();
    onListo({ pedido, metodo, regalos: hayRegalos, productos: hayProductos, servicios: hayServicios });
    return pedido;
  });
  // Si el servidor dice que ya no alcanzan las piezas, volvemos a revisar existencias para ajustar el carrito.
  const { recargar } = vigentes;
  useEffect(() => {
    if (confirmar.error && ERROR_EXISTENCIAS.test(confirmar.error)) recargar();
  }, [confirmar.error, recargar]);

  const nombresAjustados = [...ajustados.entries()].filter(([nombre]) => carrito.items.some((i) => i.nombre === nombre));

  return (
    <div className="car-rejilla">
      <section aria-labelledby="car-titulo-lista">
        <h2 id="car-titulo-lista" className="sr-only">
          Artículos en tu carrito
        </h2>
        {preciosCambiaron && (
          <div className="aviso aviso-info" role="status">
            Actualizamos los precios de tu carrito con los vigentes.
          </div>
        )}
        {nombresAjustados.length > 0 && (
          <div className="aviso aviso-info" role="status">
            <span>
              Ajustamos tu carrito a las piezas que tenemos por ahora:{' '}
              {unirConY(nombresAjustados.map(([nombre, n]) => `${nombre} (${n} ${n === 1 ? 'pieza' : 'piezas'})`))}.
            </span>
          </div>
        )}
        {agotados.length > 0 && (
          <div className="aviso aviso-alerta" role="alert">
            Por ahora no tenemos {unirConY([...new Set(agotados.map((i) => i.nombre))])}. Quítalo de tu carrito para continuar.
          </div>
        )}
        {noDisponibles.length > 0 && (
          <div className="aviso aviso-alerta" role="alert">
            Uno de los artículos ya no está disponible para compra en línea. Quítalo para continuar.
          </div>
        )}
        <ul className="car-lista">
          {carrito.items.map((i) => (
            <FilaCarrito
              key={claveItem(i)}
              item={i}
              disponible={precios.get(claveItem(i)) !== null}
              producto={i.tipo === 'producto' ? productosPorId.get(i.id) : undefined}
            />
          ))}
        </ul>
        <div className="car-seguir">
          <Link className="btn btn-texto" to="/tienda">
            Seguir comprando
          </Link>
          <button type="button" className="btn btn-texto car-vaciar" onClick={() => setConfirmandoVaciar(true)}>
            Vaciar carrito
          </button>
        </div>
        {confirmandoVaciar && (
          <Modal
            titulo="¿Vaciar tu carrito?"
            onCerrar={() => setConfirmandoVaciar(false)}
            pie={
              <>
                <button type="button" className="btn btn-secundario" onClick={() => setConfirmandoVaciar(false)} data-autofocus>
                  No, conservarlo
                </button>
                <button
                  type="button"
                  className="btn btn-peligro"
                  onClick={() => {
                    setConfirmandoVaciar(false);
                    carrito.vaciar();
                    onVaciado();
                  }}
                >
                  Sí, vaciar
                </button>
              </>
            }
          >
            <p>
              Vas a quitar {carrito.contador === 1 ? 'el artículo' : `los ${carrito.contador} artículos`} de tu carrito. Si
              cambias de opinión, puedes volver a agregarlos desde la tienda.
            </p>
          </Modal>
        )}
      </section>

      <aside className="car-resumen" aria-labelledby="car-titulo-resumen">
        <h2 id="car-titulo-resumen" className="car-resumen-titulo">
          Resumen
        </h2>
        <dl className="car-total">
          <div>
            <dt>
              {carrito.contador} {carrito.contador === 1 ? 'artículo' : 'artículos'}
            </dt>
            <dd className="num">{dinero(carrito.total)}</dd>
          </div>
          <div className="car-total-final">
            <dt>Total</dt>
            <dd className="num">{dinero(carrito.total)}</dd>
          </div>
        </dl>

        <fieldset className="car-metodos">
          <legend>¿Cómo prefieres pagar?</legend>
          {METODOS.map((m) => (
            <label key={m.valor} className={`car-metodo ${metodo === m.valor ? 'es-elegido' : ''}`}>
              <input type="radio" name="metodo-pago" value={m.valor} checked={metodo === m.valor} onChange={() => setMetodo(m.valor)} />
              <span>
                <strong>{m.titulo}</strong>
                <span className="car-metodo-texto">{m.texto}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="campo">
          <label className="etiqueta" htmlFor={idNotas}>
            Notas para Ópalo <span className="car-opcional">(opcional)</span>
          </label>
          <textarea
            id={idNotas}
            className="input car-notas"
            rows={2}
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder={hayProductos ? 'Por ejemplo: cuándo pasarás por tus productos' : 'Por ejemplo: cuándo pasarás a pagar'}
          />
        </div>

        <div className="car-explica">
          <p>
            <strong>Todavía no hay pago en línea.</strong> Haces tu pedido aquí y lo pagas en el spa o por transferencia.
          </p>
          {hayProductos && (
            <p className="car-recoger">
              <IconoUbicacion tam={18} />
              <span>
                <strong>Recoges tus productos en Ópalo</strong>, {direccionCorta(contacto.direccion)}.
                {apertura ? <strong className="car-apertura"> Puedes pagar y recoger {apertura}.</strong> : null} Tus piezas
                quedan aseguradas en cuanto registramos tu pago. Por ahora no hacemos envíos a domicilio.
              </span>
            </p>
          )}
          {hayServicios && (
            <p>
              Cuando registremos tu pago, tus servicios se activan en "Mi cuenta" y tienes{' '}
              {textoVigencia(contacto.vigencia_creditos_dias)} para agendarlos.
              {hayRegalos ? ' Para los servicios de regalo te damos un código que la persona canjea en su cuenta.' : ''}
            </p>
          )}
        </div>

        <MensajeError error={confirmar.error} />
        {/pedidos por pagar/.test(confirmar.error ?? '') && (
          <p className="car-error-enlace">
            <Link to="/cuenta/pedidos">Ver mis pedidos por pagar</Link>
          </p>
        )}

        {cargandoSesion ? (
          <Cargando texto="Revisando tu sesión…" />
        ) : sesion ? (
          <button
            type="button"
            className="btn btn-primario btn-bloque car-confirmar"
            disabled={confirmar.enviando || bloqueado || carrito.items.length === 0}
            onClick={() => void confirmar.ejecutar()}
          >
            {confirmar.enviando ? 'Enviando tu pedido…' : `Hacer mi pedido · ${dinero(carrito.total)}`}
          </button>
        ) : (
          <div className="car-sin-sesion">
            <p>Para hacer tu pedido entra a tu cuenta o créala en un minuto. Tu carrito se queda guardado.</p>
            <Link className="btn btn-primario btn-bloque" to={`/entrar?volver=${encodeURIComponent('/carrito')}`}>
              Entrar o crear mi cuenta
            </Link>
          </div>
        )}
        <p className="car-letra-chica">
          El total final lo confirma el sistema con los precios vigentes. Al hacer tu pedido aceptas nuestros{' '}
          <Link to="/politicas/terminos">términos y condiciones</Link>.
        </p>
      </aside>
    </div>
  );
}

function FilaCarrito({ item: i, disponible, producto }: { item: ItemCarrito; disponible: boolean; producto?: ProductoTienda }) {
  const { cambiarCantidad, quitar, tope } = useCarrito();
  const clave = claveItem(i);
  const idCantidad = useId();
  const maximo = Math.max(1, tope(clave));
  const agotado = !!producto && piezasDisponibles(producto) === 0;
  const estado = producto ? estadoExistencias(producto) : null;
  const enTope = i.tipo === 'producto' && typeof i.maximo === 'number' && i.maximo > 0 && i.cantidad >= maximo;
  const miniatura = i.tipo === 'producto' ? (producto ?? i.miniatura) : null;
  const ruta = i.tipo === 'producto' && i.slug ? `/tienda/${encodeURIComponent(i.slug)}` : null;
  const categoria = miniatura?.categoria;
  const tipo =
    i.tipo === 'servicio'
      ? 'Servicio'
      : i.tipo === 'paquete'
        ? 'Paquete'
        : categoria === 'jabon' || categoria === 'vela' || categoria === 'set'
          ? etiquetaProducto({ categoria, marca: null })
          : 'Producto';

  return (
    <li className={`car-item ${disponible && !agotado ? '' : 'no-disponible'}`}>
      <div className={`car-item-info ${miniatura ? 'con-miniatura' : ''}`}>
        {miniatura && (
          <div className="prod-miniatura">
            <ImagenProducto
              categoria={miniatura.categoria}
              color={miniatura.color_hex}
              foto={miniatura.foto_url}
              nombre={i.nombre}
              alt=""
              conMarca={miniatura.hecho_en_opalo !== false}
            />
          </div>
        )}
        <div className="car-item-texto">
          <p className="car-item-tipo">{tipo}</p>
          <h3 className="car-item-nombre">{ruta ? <Link to={ruta}>{i.nombre}</Link> : i.nombre}</h3>
          {i.detalle && <p className="car-item-detalle">{i.detalle}</p>}
          {i.regalo_para && (
            <p className="car-item-regalo">
              <IconoRegalo tam={16} /> Regalo para <strong>{i.regalo_para}</strong>
            </p>
          )}
          {!disponible && <p className="car-item-aviso">Ya no está disponible para compra en línea.</p>}
          {disponible && agotado && (
            <p className="car-item-aviso">
              Por ahora no tenemos {i.nombre}.{estado?.tipo === 'proximo' ? ` ${estado.texto}.` : ''}
            </p>
          )}
          {disponible && !agotado && enTope && (
            <p className="car-item-limite">{maximo === 1 ? 'Es la última pieza que tenemos.' : `Son las ${maximo} piezas que tenemos por ahora.`}</p>
          )}
        </div>
      </div>
      <div className="car-item-controles">
        <div className="car-cantidad" role="group" aria-label={`Cantidad de ${i.nombre}`}>
          <button
            type="button"
            className="car-cantidad-boton"
            onClick={() => cambiarCantidad(clave, i.cantidad - 1)}
            disabled={i.cantidad <= 1}
            aria-label="Quitar uno"
          >
            <IconoMenos tam={18} />
          </button>
          <label htmlFor={idCantidad} className="sr-only">
            Cantidad
          </label>
          <input
            id={idCantidad}
            className="car-cantidad-input num"
            type="number"
            inputMode="numeric"
            min={1}
            max={maximo}
            value={i.cantidad}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value !== '' && Number.isFinite(n)) cambiarCantidad(clave, n);
            }}
          />
          <button
            type="button"
            className="car-cantidad-boton"
            onClick={() => cambiarCantidad(clave, i.cantidad + 1)}
            disabled={i.cantidad >= maximo || agotado}
            aria-label="Agregar uno"
          >
            <IconoMas tam={18} />
          </button>
        </div>
        <p className="car-item-importe num">
          {dinero(i.precio * i.cantidad)}
          {i.cantidad > 1 && <span className="car-item-unitario">{dinero(i.precio)} c/u</span>}
        </p>
        <button type="button" className="car-quitar" onClick={() => quitar(clave)} aria-label={`Quitar ${i.nombre} del carrito`}>
          <IconoBasura tam={20} />
        </button>
      </div>
    </li>
  );
}

function PedidoListo({ pedido, metodo, regalos, productos, servicios }: PedidoHecho) {
  const contacto = useContacto();
  useTitulo('Pedido recibido');
  const apertura = cuandoAbrimos(contacto.fecha_apertura);
  const forma: Record<MetodoCarrito, string> = { efectivo: 'en efectivo', tarjeta: 'con tarjeta', transferencia: 'por transferencia' };
  const mensaje = `Hola, Ópalo. Hice el pedido ${pedido.folio} por ${dinero(pedido.total)} y quiero pagarlo ${forma[metodo]}.`;
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    titulo.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="contenedor seccion car-listo">
      <div className="car-listo-tarjeta">
        <Gema tam={44} className="car-listo-gema" />
        <p className="eyebrow">Pedido recibido</p>
        <h1 className="car-listo-titulo" ref={titulo} tabIndex={-1}>
          ¡Gracias! Recibimos tu pedido
        </h1>
        <dl className="car-listo-datos">
          <div>
            <dt>Folio</dt>
            <dd className="num">{pedido.folio}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd className="num">{dinero(pedido.total)}</dd>
          </div>
          <div>
            <dt>Pago</dt>
            <dd>{ETIQUETA_METODO_PAGO[metodo]}</dd>
          </div>
        </dl>

        <h2 className="car-listo-subtitulo">Qué sigue</h2>
        <ol className="car-listo-pasos">
          {metodo === 'transferencia' ? (
            <li>
              Escríbenos por WhatsApp con tu folio <strong>{pedido.folio}</strong>: te compartimos los datos para transferir
              y nos envías tu comprobante.
            </li>
          ) : (
            <li>
              Paga con {metodo === 'tarjeta' ? 'tarjeta' : 'efectivo'} en Ópalo ({contacto.direccion}) mencionando tu folio{' '}
              <strong>{pedido.folio}</strong>
              {apertura ? `, ${apertura}` : ''}.
            </li>
          )}
          {productos && (
            <li>
              {metodo === 'transferencia'
                ? `Cuando registremos tu pago, tus piezas quedan aseguradas: pasa por ellas a Ópalo con tu folio${apertura ? `, ${apertura}` : ''}.`
                : 'Al pagar en el spa te entregamos tus productos.'}
            </li>
          )}
          {servicios && <li>Cuando registremos tu pago, tus servicios se activan en "Mi cuenta" y puedes agendarlos cuando quieras.</li>}
          {regalos && <li>Para cada servicio de regalo verás en "Mi cuenta" un código para entregárselo a quien lo recibe.</li>}
        </ol>

        <div className="car-listo-acciones">
          <Link className="btn btn-primario" to="/cuenta/pedidos">
            Ver mis pedidos
          </Link>
          <a className="btn btn-secundario" href={enlaceWhatsApp(contacto.telefono_whatsapp, mensaje)} target="_blank" rel="noopener noreferrer">
            <IconoMensaje tam={20} /> Escríbenos por WhatsApp<span className="sr-only"> (se abre en una pestaña nueva)</span>
          </a>
          <Link className="btn btn-texto" to="/tienda">
            Seguir comprando
          </Link>
        </div>
      </div>
    </div>
  );
}
