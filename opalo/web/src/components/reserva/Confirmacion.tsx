// Paso 7: "¡Listo!" con los datos de la cita, recordatorios, calendario y WhatsApp.
import { Link } from 'react-router-dom';
import type { Configuracion } from '../../lib/api/tipos';
import { duracion, enlaceWhatsApp, ETIQUETA_ESTADO_CITA, fechaHora, fechaLarga, hora, telefonoBonito } from '../../lib/format';
import type { Confirmacion as DatosConfirmacion } from './estado';
import { descargarIcs } from './ics';
import { unirConY } from './utilidades';

export function Confirmacion({ conf, config, onOtra }: { conf: DatosConfirmacion; config: Configuracion; onOtra: () => void }) {
  const pendiente = conf.estado === 'pendiente';
  const servicios = unirConY(conf.servicios);
  const mensaje = `Hola, Ópalo. Acabo de reservar mi cita del ${fechaHora(conf.inicio)} (${servicios}).`;

  function agregarCalendario() {
    descargarIcs(
      {
        uid: conf.resultado.id,
        inicio: conf.inicio,
        fin: conf.fin,
        titulo: `Cita en ${config.nombre_negocio}: ${servicios}`,
        descripcion: [
          `Te atiende ${conf.personal_nombre}.`,
          `Llega 10 minutos antes. Tolerancia de ${config.tolerancia_retraso_min} minutos.`,
          `Para cancelar o cambiar tu cita, hazlo con ${config.horas_cancelacion} horas de anticipación desde tu cuenta o por WhatsApp al ${telefonoBonito(config.telefono_whatsapp)}.`,
        ].join('\n'),
        lugar: config.direccion,
      },
      'cita-opalo.ics',
    );
  }

  return (
    <div className="rv-confirmacion">
      <div className="rv-confirmacion-cabeza">
        <span className="rv-confirmacion-icono" aria-hidden="true">
          ✓
        </span>
        <div>
          <p className="rv-confirmacion-listo">¡Listo!</p>
          <p className="texto-2">
            {pendiente
              ? 'Recibimos tu reserva. Está por confirmar: abajo te explicamos por qué.'
              : 'Tu cita quedó confirmada. Te esperamos.'}
          </p>
        </div>
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
          <li>Llega 10 minutos antes para empezar a tiempo.</li>
          <li>
            Tenemos una tolerancia de {config.tolerancia_retraso_min} minutos; después quizá debamos acortar o reagendar tu servicio.
          </li>
          <li>
            Si necesitas cancelar, hazlo con al menos {config.horas_cancelacion} horas de anticipación desde{' '}
            <Link to="/cuenta/citas">tu cuenta</Link>. Con menos tiempo, escríbenos por WhatsApp.
          </li>
          <li>
            Estamos en {config.direccion}. Pagas en el spa el día de tu cita.
          </li>
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
