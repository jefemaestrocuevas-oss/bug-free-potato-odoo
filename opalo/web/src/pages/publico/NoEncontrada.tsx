import { Link } from 'react-router-dom';
import { enlaceWhatsApp } from '../../lib/format';
import { ArteHero } from '../../components/publico/Decoracion';
import { useTitulo } from '../../components/publico/EncabezadoPagina';
import { useContacto } from '../../components/publico/contacto';
import './noencontrada.css';

export default function NoEncontrada() {
  useTitulo('Página no encontrada');
  const contacto = useContacto();
  return (
    <section className="contenedor seccion nf" aria-labelledby="nf-titulo">
      <div className="nf-arte">
        <ArteHero />
      </div>
      <div className="nf-texto">
        <p className="eyebrow">Error 404</p>
        <h1 id="nf-titulo">No encontramos esta página</h1>
        <p className="subtitulo">
          Puede que el enlace esté incompleto o que la página haya cambiado de lugar. Te dejamos algunos caminos para seguir.
        </p>
        <ul className="nf-enlaces">
          <li>
            <Link className="btn btn-primario" to="/">
              Ir al inicio
            </Link>
          </li>
          <li>
            <Link className="btn btn-secundario" to="/servicios">
              Ver servicios
            </Link>
          </li>
          <li>
            <Link className="btn btn-secundario" to="/reservar">
              Reservar
            </Link>
          </li>
        </ul>
        <p className="nf-ayuda">
          ¿Buscabas algo en particular?{' '}
          <a href={enlaceWhatsApp(contacto.telefono_whatsapp, 'Hola, Ópalo. No encontré una página en su sitio.')} target="_blank" rel="noopener noreferrer">
            Escríbenos por WhatsApp<span className="sr-only"> (se abre en una pestaña nueva)</span>
          </a>
          .
        </p>
      </div>
    </section>
  );
}
