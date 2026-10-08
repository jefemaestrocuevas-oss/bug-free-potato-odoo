// Paso 7: la cita ya está reservada (el título "¡Listo! Tu cita está reservada" lo pone Reservar):
// datos de la cita, recordatorios, calendario y WhatsApp.
import { Link } from 'react-router-dom';
import type { Configuracion } from '../../lib/api/tipos';
import { duracion, enlaceWhatsApp, ETIQUETA_ESTADO_CITA, fechaHora, fechaLarga, hora } from '../../lib/format';
import type { Confirmacion as DatosConfirmacion } from './estado';
import { descargarIcs, eventoDeCita } from './ics';
import { unirConY } from './utilidades';

export function Confirmacion({ conf, config, onOtra }: { conf: DatosConfirmacion; config: Configuracion; onOtra: () => void }) {
  const pendiente = conf.estado === 'pendiente';
  const servicios = unirConY(conf.servicios);
  const mensaje = `Hola, Ópalo. Acabo de reservar mi cita del ${fechaHora(conf.inicio)} (${servicios}).`;

  function agregarCalendario() {
    descargarIcs(
      eventoDeCita({ id: conf.resultado.id, inicio: conf.inicio, fin: conf.fin, servicios: conf.servicios, personal_nombre: conf.personal_nombre }, config),
      'cita-opalo.ics',
    );
  }

  return (
    <div className="rv-confirmacion">
      <div className="rv-confirmacion-cabeza">
        <span className="rv-confirmacion-icono" aria-hidden="true">
          ✓
        </span>
        <p className="rv-confirmacion-estado">
          {pendiente ? 'Recibimos tu reserva. Está por confirmar: abajo te explicamos por qué.' : 'Tu cita quedó confirmada. Te esperamos.'}
        </p>
      </div>

      <dl className="rv-final-datos tarjeta-plana">
        <div>
          <dt>Día</dt>
          <dd>{fechaLarga(conf.inicio)}</dd>
        </div>
        <div>
          <dt>Hora</dt>
          <dd>
            {hora(conf.inicio)} a {hora(conf.fin)} (hora de Querétaro)
          </dd>
        </div>
        <div>
          <dt>Te atiende</dt>
          <dd>
            {conf.personal_nombre}
            {conf.personal_titulo ? <span className="texto-3"> · {conf.personal_titulo}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Tiempo estimado</dt>
          <dd>{duracion(conf.duracion_min)}</dd>
        </div>
        <div className="rv-final-servicios">
          <dt>Servicios</dt>
          <dd>{servicios}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>
            <span className={`pill ${pendiente ? 'pill-alerta' : 'pill-exito'}`}>{ETIQUETA_ESTADO_CITA[conf.estado] ?? conf.estado}</span>
          </dd>
        </div>
        <div className="rv-final-total">
          <dt>Total estimado</dt>
          <dd className="num">{conf.total_texto}</dd>
        </div>
      </dl>

      {pendiente && (
        <div className="aviso aviso-alerta rv-confirmacion-pendiente">
          <div>
            <p>
              <strong>Tu cita está por confirmar.</strong> En tu ficha de salud marcaste algo que tu especialista debe revisar antes de
              atenderte, por tu seguridad. Te escribiremos por WhatsApp para confirmarla; tu horario queda apartado mientras tanto.
            </p>
            {conf.resultado.alertas.length > 0 && (
              <details>
                <summary>Ver qué vamos a revisar</summary>
                <ul>
                  {conf.resultado.alertas.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}

      <section className="rv-recordatorios" aria-labelledby="rv-recordatorios-titulo">
        <h3 className="rv-subtitulo" id="rv-recordatorios-titulo">
          Para tu cita
        </h3>
        <ul>
          <li>Llega puntual: tienes {config.tolerancia_retraso_min} minutos de tolerancia. Si vas tarde, avísanos por WhatsApp.</li>
          <li>
            Si necesitas cancelar, hazlo con al menos {config.horas_cancelacion} horas de anticipación desde{' '}
            <Link to="/cuenta/citas">tu cuenta</Link>. Con menos tiempo, escríbenos por WhatsApp.
          </li>
          {/* La dirección ya puede terminar en punto ("Querétaro, Qro."): no se agrega otro. */}
          <li>Estamos en {config.direccion.trim().replace(/\.+$/, '')}.</li>
          <li>{conf.nota_pago}</li>
        </ul>
      </section>

      <div className="rv-confirmacion-acciones">
        <button type="button" className="btn btn-primario" onClick={agregarCalendario}>
          Agregar a mi calendario
        </button>
        <a className="btn btn-secundario" href={enlaceWhatsApp(config.telefono_whatsapp, mensaje)} target="_blank" rel="noopener noreferrer">
          Escribir por WhatsApp
        </a>
        <Link className="btn btn-secundario" to="/cuenta/citas">
          Ver mis citas
        </Link>
        <button type="button" className="btn btn-texto" onClick={onOtra}>
          Reservar otra cita
        </button>
      </div>
    </div>
  );
}
