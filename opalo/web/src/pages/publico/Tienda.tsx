import { Link } from 'react-router-dom';
import { api, type Catalogo, type ProductoTienda } from '../../lib/api';
import { dinero } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { Gema } from '../../components/ui/Gema';
import { ComprarConRegalo } from '../../components/publico/Comprar';
import { EncabezadoPagina, useTitulo } from '../../components/publico/EncabezadoPagina';
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
import { IconoBolsa, IconoCalendario, IconoCategoria, IconoCheck, IconoRegalo } from '../../components/publico/Iconos';
import './catalogo-paginas.css';

export default function Tienda() {
  useTitulo('Tienda y regalos');
  const contacto = useContacto();
  const catalogo = useAsync(() => api.getCatalogo(), []);
  const productos = useAsync(() => api.getProductosTienda(), []);
  const vigencia = textoVigencia(contacto.vigencia_creditos_dias);

  return (
    <>
      <EncabezadoPagina eyebrow="Tienda" titulo="Compra ahora, agenda cuando quieras">
        <p>
          Paga tus servicios y paquetes por adelantado y úsalos cuando quieras durante {vigencia}. También puedes
          regalarlos: te damos un código para que se lo entregues a quien quieras.
        </p>
      </EncabezadoPagina>

      <section className="contenedor tda-como" aria-labelledby="tda-como-titulo">
        <h2 id="tda-como-titulo" className="sr-only">
          Cómo funciona
        </h2>
        <ol className="tda-pasos">
          <li>
            <IconoBolsa tam={22} />
            <div>
              <strong>Aparta tu pedido</strong>
              <span>Todavía no cobramos en línea: eliges y apartas.</span>
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
      </section>

      <div className="contenedor seccion tda">
        {catalogo.cargando && <Cargando texto="Cargando la tienda…" />}
        <MensajeError error={catalogo.error} onReintentar={catalogo.recargar} />
        {catalogo.datos && <ServiciosEnVenta catalogo={catalogo.datos} vigenciaGeneral={contacto.vigencia_creditos_dias} />}

        <section className="srv-seccion" aria-labelledby="tda-productos">
          <header className="srv-seccion-cabeza">
            <span className="sp-medallon" aria-hidden="true">
              <IconoBolsa tam={24} />
            </span>
            <div>
              <h2 id="tda-productos">Para el cuidado en casa</h2>
              <p>Para que los resultados de tu sesión duren más, también en casa.</p>
            </div>
          </header>
          {productos.cargando && <Cargando texto="Cargando productos…" />}
          <MensajeError error={productos.error} onReintentar={productos.recargar} />
          {productos.datos && <Productos productos={productos.datos} />}
        </section>
      </div>
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
      <Vacio titulo="Muy pronto podrás comprar en línea">
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
              <h2 id="tda-paquetes">Paquetes</h2>
              <p>Varios servicios a un precio especial, listos para agendar cuando quieras.</p>
            </div>
          </header>
          <ul className="tda-rejilla">
            {paquetes.map((p) => {
              const ahorro = ahorroPaquete(p, porId);
              return (
                <li key={p.id} className="tda-item">
                  <p className="tda-item-tipo">{etiquetaTipoPaquete(p)}</p>
                  <h3 className="tda-item-nombre">{p.nombre}</h3>
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
              <h2 id={`tda-${c.slug}`}>{c.nombre}</h2>
              {c.descripcion && <p>{c.descripcion}</p>}
            </div>
          </header>
          <ul className="tda-rejilla">
            {servicios.map((s) => (
              <li key={s.id} className="tda-item">
                <h3 className="tda-item-nombre">{s.nombre}</h3>
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

function Productos({ productos }: { productos: ProductoTienda[] }) {
  if (productos.length === 0) {
    return (
      <Vacio titulo="Muy pronto: productos para el cuidado en casa">
        <p>Estamos eligiendo los productos que te recomendaremos para cuidar tu piel entre sesiones.</p>
      </Vacio>
    );
  }
  return (
    <ul className="tda-rejilla">
      {productos.map((p) => (
        <li key={p.id} className="tda-item">
          {p.marca && <p className="tda-item-tipo">{p.marca}</p>}
          <h3 className="tda-item-nombre">{p.nombre}</h3>
          {p.presentacion && <p className="tda-item-detalle">{p.presentacion}</p>}
          <p className="tda-item-precio">
            <Precio valor={p.precio_venta} />
            {!p.hay_stock && <span className="insignia-pronto">Agotado por ahora</span>}
          </p>
          {p.hay_stock ? (
            <ComprarConRegalo
              permitirRegalo={false}
              item={{ tipo: 'producto', id: p.id, nombre: p.nombre, precio: p.precio_venta, detalle: p.presentacion }}
            />
          ) : (
            <p className="tda-item-agotado">Escríbenos por WhatsApp y te avisamos cuando vuelva.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
