import { Link } from 'react-router-dom';
import { api, type Capacitacion, type PersonalPublico } from '../../lib/api';
import { fechaLocal, mesNombre, numero } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { Gema } from '../../components/ui/Gema';
import { EncabezadoPagina, useTitulo } from '../../components/publico/EncabezadoPagina';
import { ETIQUETA_CAPACITACION } from '../../components/publico/catalogo';
import { IconoBirrete, IconoEscudo, IconoCorazon } from '../../components/publico/Iconos';
import './equipo.css';

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(p));
  return (partes[0]?.[0] ?? 'Ó').toUpperCase() + (partes[1]?.[0] ?? '').toUpperCase();
}

export default function Equipo() {
  useTitulo('Nosotras');
  const equipo = useAsync(() => api.getEquipo(), []);

  return (
    <>
      <EncabezadoPagina eyebrow="Nosotras" titulo="Un equipo que nunca deja de aprender">
        <p>
          En Ópalo creemos que una buena sesión empieza mucho antes de que llegues: en la preparación de quien te atiende.
          Por eso nos capacitamos de forma constante y aquí te mostramos cada curso, taller y certificación que tomamos.
        </p>
      </EncabezadoPagina>

      <div className="contenedor seccion">
        <ul className="eq-compromisos" aria-label="Nuestro compromiso">
          <li>
            <span className="sp-medallon" aria-hidden="true">
              <IconoBirrete tam={24} />
            </span>
            <div>
              <h2>Capacitación constante</h2>
              <p>Actualizamos técnicas y protocolos, y registramos cada capacitación con su fecha e institución.</p>
            </div>
          </li>
          <li>
            <span className="sp-medallon" aria-hidden="true">
              <IconoEscudo tam={24} />
            </span>
            <div>
              <h2>Tu seguridad primero</h2>
              <p>Revisamos tu ficha de salud antes de cada cita y firmas tu consentimiento informado.</p>
            </div>
          </li>
          <li>
            <span className="sp-medallon sp-medallon-oro" aria-hidden="true">
              <IconoCorazon tam={24} />
            </span>
            <div>
              <h2>Atención sin prisas</h2>
              <p>Sesiones de 1 hora con cita, para dedicarte el tiempo que mereces.</p>
            </div>
          </li>
        </ul>

        <h2 className="eq-titulo-equipo">Quién te atiende</h2>
        {equipo.cargando && <Cargando texto="Cargando al equipo…" />}
        <MensajeError error={equipo.error} onReintentar={equipo.recargar} />
        {equipo.datos &&
          (equipo.datos.length === 0 ? (
            <Vacio titulo="Muy pronto conocerás al equipo">
              <p>Estamos preparando esta sección.</p>
            </Vacio>
          ) : (
            <div className="eq-lista">
              {equipo.datos.map((p) => (
                <TarjetaPersona key={p.id} persona={p} />
              ))}
            </div>
          ))}

        <div className="eq-cierre">
          <Gema tam={32} className="eq-cierre-gema" />
          <p>Cuando reservas, ves quién te atenderá desde antes.</p>
          <Link className="btn btn-primario" to="/reservar">
            Reserva tu cita
          </Link>
        </div>
      </div>
    </>
  );
}

function TarjetaPersona({ persona: p }: { persona: PersonalPublico }) {
  const caps = p.capacitaciones;
  const horas = caps.reduce((s, c) => s + (c.horas ?? 0), 0);
  return (
    <article className="eq-persona" aria-labelledby={`eq-${p.id}`}>
      <div className="eq-persona-cabeza">
        {p.foto_url ? (
          <img className="eq-foto" src={p.foto_url} alt="" width={112} height={112} loading="lazy" />
        ) : (
          <span className="eq-monograma" aria-hidden="true">
            <span className="eq-monograma-letras">{iniciales(p.nombre)}</span>
            <span className="eq-monograma-insignia">
              <Gema tam={22} />
            </span>
          </span>
        )}
        <div className="eq-persona-texto">
          <h3 id={`eq-${p.id}`} className="eq-nombre">
            {p.nombre}
          </h3>
          {p.titulo && <p className="eq-cargo">{p.titulo}</p>}
          {p.bio && <p className="eq-bio">{p.bio}</p>}
          {caps.length > 0 && (
            <p className="eq-resumen">
              {caps.length} {caps.length === 1 ? 'capacitación registrada' : 'capacitaciones registradas'}
              {horas > 0 ? ` · ${numero(horas, 1)} horas de formación` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="eq-formacion">
        <h4 className="eq-formacion-titulo">Formación y capacitaciones</h4>
        {caps.length === 0 ? (
          <p className="eq-formacion-vacia">Sus capacitaciones aparecerán aquí conforme las registremos.</p>
        ) : (
          <LineaTiempo capacitaciones={caps} />
        )}
      </div>
    </article>
  );
}

function LineaTiempo({ capacitaciones }: { capacitaciones: Capacitacion[] }) {
  const hoy = fechaLocal();
  const ordenadas = [...capacitaciones].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
  return (
    <ol className="eq-linea">
      {ordenadas.map((c) => {
        const proxima = !!c.fecha && c.fecha > hoy;
        return (
          <li key={c.id}>
            <span className="eq-linea-punto" aria-hidden="true" />
            <p className="eq-linea-fecha">
              {c.fecha ? <time dateTime={c.fecha}>{mesNombre(c.fecha)}</time> : 'Sin fecha'}
              {proxima && <span className="eq-proxima">Próxima</span>}
            </p>
            <p className="eq-linea-nombre">{c.nombre}</p>
            <p className="eq-linea-detalle">
              <span className="eq-tipo">{ETIQUETA_CAPACITACION[c.tipo] ?? c.tipo}</span>
              {c.institucion && <span>{c.institucion}</span>}
              {c.horas ? <span>{numero(c.horas, 1)} h</span> : null}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
