import { Link, useSearchParams } from 'react-router-dom';
import { api, type Catalogo, type Categoria } from '../../lib/api';
import { enlaceWhatsApp } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { EncabezadoPagina, useTitulo } from '../../components/publico/EncabezadoPagina';
import { FilaServicio, TarjetaPaquete } from '../../components/publico/TarjetasCatalogo';
import {
  categoriasOrdenadas,
  esCategoriaComplementos,
  mapaServicios,
  paquetesOrdenados,
  serviciosDeCategoria,
} from '../../components/publico/catalogo';
import { useContacto } from '../../components/publico/contacto';
import { IconoCategoria, IconoGota, IconoMensaje, IconoRegalo } from '../../components/publico/Iconos';
import { Gema } from '../../components/ui/Gema';
import './catalogo-paginas.css';

const TODO = 'todo';
const PAQUETES = 'paquetes';

export default function Servicios() {
  useTitulo('Servicios y paquetes');
  const contacto = useContacto();
  const [params, setParams] = useSearchParams();
  const catalogo = useAsync(() => api.getCatalogo(), []);

  return (
    <>
      <EncabezadoPagina eyebrow="Servicios y paquetes" titulo="Todo lo que necesitas, en un solo lugar">
        <p>
          Depilación con cera premium, faciales, corporales y complementos. Cada cita es una sesión de 1 hora: reserva en
          línea, o compra ahora y agenda cuando quieras.
        </p>
      </EncabezadoPagina>

      <div className="contenedor seccion srv">
        {catalogo.cargando && <Cargando texto="Cargando servicios…" />}
        <MensajeError error={catalogo.error} onReintentar={catalogo.recargar} />
        {catalogo.datos && (
          <ContenidoServicios
            catalogo={catalogo.datos}
            ver={params.get('ver') ?? TODO}
            onVer={(v) => {
              const p = new URLSearchParams(params);
              if (v === TODO) p.delete('ver');
              else p.set('ver', v);
              setParams(p, { replace: true });
            }}
            sesionMin={contacto.duracion_sesion_min}
          />
        )}

        <aside className="srv-cierre" aria-label="Más opciones">
          <div className="srv-cierre-item">
            <IconoRegalo tam={26} />
            <div>
              <h2>¿Quieres regalar o pagar por adelantado?</h2>
              <p>En la tienda compras servicios y paquetes para usarlos cuando quieras, o para regalarlos.</p>
              <Link className="btn btn-secundario btn-sm" to="/tienda">
                Ir a la tienda
              </Link>
            </div>
          </div>
          <div className="srv-cierre-item">
            <IconoMensaje tam={26} />
            <div>
              <h2>¿No sabes qué elegir?</h2>
              <p>Escríbenos y te ayudamos a armar tu sesión según tu piel y lo que buscas.</p>
              <a
                className="btn btn-secundario btn-sm"
                href={enlaceWhatsApp(contacto.telefono_whatsapp, 'Hola, Ópalo. ¿Me ayudan a elegir un servicio?')}
                target="_blank"
                rel="noopener noreferrer"
              >
                Escríbenos por WhatsApp<span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function ContenidoServicios({
  catalogo,
  ver,
  onVer,
  sesionMin,
}: {
  catalogo: Catalogo;
  ver: string;
  onVer: (v: string) => void;
  sesionMin: number;
}) {
  const categorias = categoriasOrdenadas(catalogo).filter((c) => serviciosDeCategoria(catalogo, c).length > 0);
  const paquetes = paquetesOrdenados(catalogo);
  const porId = mapaServicios(catalogo);
  const opciones = [
    { valor: TODO, texto: 'Todo' },
    ...categorias.map((c) => ({ valor: c.slug, texto: c.nombre })),
    ...(paquetes.length ? [{ valor: PAQUETES, texto: 'Paquetes' }] : []),
  ];
  const actual = opciones.some((o) => o.valor === ver) ? ver : TODO;
  const visibles = actual === TODO ? categorias : categorias.filter((c) => c.slug === actual);
  const verPaquetes = paquetes.length > 0 && (actual === TODO || actual === PAQUETES);
  const serviciosVisibles = visibles.flatMap((c) => serviciosDeCategoria(catalogo, c));
  const hayPorConfirmar = serviciosVisibles.some((s) => s.etapa === 'disponible' && s.precio === null);
  const hayPronto = serviciosVisibles.some((s) => s.etapa !== 'disponible');

  if (categorias.length === 0 && paquetes.length === 0) {
    return (
      <Vacio titulo="Estamos preparando nuestro menú de servicios">
        <p>Muy pronto verás aquí todo lo que ofrecemos. Mientras, escríbenos por WhatsApp.</p>
      </Vacio>
    );
  }

  return (
    <>
      <nav className="srv-filtros" aria-label="Filtrar servicios">
        <ul>
          {opciones.map((o) => (
            <li key={o.valor}>
              <button type="button" className="srv-filtro" aria-pressed={actual === o.valor} onClick={() => onVer(o.valor)}>
                {o.texto}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {(hayPorConfirmar || hayPronto) && (
        <p className="srv-leyenda">
          {hayPorConfirmar && (
            <>
              <strong>Precio por confirmar:</strong> esos servicios sí se reservan; te confirmamos el precio antes de tu
              sesión y se paga en cabina.{' '}
            </>
          )}
          {hayPronto && (
            <>
              <strong>Próximamente:</strong> servicios que estamos preparando y todavía no se reservan.
            </>
          )}
        </p>
      )}

      <p className="sr-only" role="status">
        {actual === TODO
          ? 'Mostrando todos los servicios y paquetes.'
          : actual === PAQUETES
            ? `Mostrando ${paquetes.length} ${paquetes.length === 1 ? 'paquete' : 'paquetes'}.`
            : `Mostrando ${visibles[0]?.nombre ?? ''}.`}
      </p>
      <div className="srv-contenido">
        {visibles.map((c) => (
          <SeccionCategoria key={c.id} catalogo={catalogo} categoria={c} />
        ))}

        {verPaquetes && (
          <section className="srv-seccion" aria-labelledby="srv-paquetes" id="paquetes">
            <header className="srv-seccion-cabeza">
              <span className="sp-medallon sp-medallon-oro" aria-hidden="true">
                <Gema tam={24} />
              </span>
              <div>
                <h2 id="srv-paquetes">Paquetes</h2>
                <p>
                  Varios servicios juntos a un precio especial.
                  {paquetes.some((p) => p.tipo === 'bono')
                    ? ' Los combos son en una sola visita; los bonos son varias sesiones del mismo servicio para usar en distintas visitas.'
                    : ' Todo en una sola visita.'}
                </p>
              </div>
            </header>
            <div className="sp-rejilla-paquetes">
              {paquetes.map((p) => (
                <TarjetaPaquete key={p.id} paquete={p} porId={porId} sesionMin={sesionMin} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function SeccionCategoria({ catalogo, categoria: c }: { catalogo: Catalogo; categoria: Categoria }) {
  const servicios = serviciosDeCategoria(catalogo, c);
  const complementos = esCategoriaComplementos(catalogo, c);
  const sinTiempoExtra = servicios.every((s) => !s.duracion_min);
  return (
    <section className="srv-seccion" aria-labelledby={`srv-${c.slug}`} id={c.slug}>
      <header className="srv-seccion-cabeza">
        <span className="sp-medallon" aria-hidden="true">
          <IconoCategoria slug={c.slug} />
        </span>
        <div>
          <h2 id={`srv-${c.slug}`}>{c.nombre}</h2>
          {c.descripcion && <p>{c.descripcion}</p>}
        </div>
      </header>
      {complementos && (
        <div className="srv-nota-complementos">
          <IconoGota tam={22} />
          <p>
            <strong>Los complementos se agregan a tu servicio.</strong> Elígelos al reservar junto con tu depilación o tu
            facial; no se reservan solos{sinTiempoExtra ? ' y caben en tu misma sesión' : ''}.
          </p>
        </div>
      )}
      <ul className="sp-menu-servicios">
        {servicios.map((s) => (
          <FilaServicio key={s.id} servicio={s} />
        ))}
      </ul>
    </section>
  );
}
