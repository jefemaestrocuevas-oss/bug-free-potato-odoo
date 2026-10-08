// Mis citas: próximas y pasadas, con quién te atiende, tiempo estimado, firma pendiente,
// cancelación (con la anticipación de la política) y "Agregar a mi calendario".
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { CitaDetalle, Configuracion, EstadoCita } from '../../lib/api/tipos';
import { dinero, duracion, enlaceWhatsApp, ETIQUETA_ESTADO_CITA, fechaHora, fechaLarga, hora, telefonoBonito, ZONA } from '../../lib/format';
import { useAccion, useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../ui/Estado';
import { descargarIcs } from '../reserva/ics';
import { horasHasta, totalCita, unirConY } from '../reserva/utilidades';
import { Modal } from './Modal';

const PILL_ESTADO: Record<EstadoCita, string> = {
  pendiente: 'pill-alerta',
  confirmada: 'pill-exito',
  en_curso: 'pill-info',
  completada: 'pill-verde',
  cancelada: 'pill-gris',
  no_asistio: 'pill-error',
};

const ACTIVAS: EstadoCita[] = ['pendiente', 'confirmada', 'en_curso'];

export function PillEstadoCita({ estado }: { estado: EstadoCita }) {
  return <span className={`pill ${PILL_ESTADO[estado] ?? 'pill-gris'}`}>{ETIQUETA_ESTADO_CITA[estado] ?? estado}</span>;
}

export function SeccionCitas({ config, avisoInicial }: { config: Configuracion; avisoInicial?: string | null }) {
  const citas = useAsync(() => api.getMisCitas(), []);
  const [aCancelar, setACancelar] = useState<CitaDetalle | null>(null);
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<string | null>(avisoInicial ?? null);
  const cancelar = useAccion(async (id: string, m: string | null) => {
    await api.cancelarCita(id, m);
    return true;
  });

  if (citas.cargando && !citas.datos) return <Cargando texto="Cargando tus citas…" />;
  if (citas.error) return <MensajeError error={citas.error} onReintentar={citas.recargar} />;
  const lista = citas.datos ?? [];
  const ahora = new Date();
  const proximas = lista
    .filter((c) => ACTIVAS.includes(c.estado) && new Date(c.fin).getTime() >= ahora.getTime())
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  const ids = new Set(proximas.map((c) => c.id));
  const pasadas = lista.filter((c) => !ids.has(c.id)).sort((a, b) => b.inicio.localeCompare(a.inicio));

  async function confirmarCancelacion() {
    if (!aCancelar) return;
    const c = aCancelar;
    const ok = await cancelar.ejecutar(c.id, motivo.trim() || null);
    // Si hubo error, el modal sigue abierto y muestra el mensaje.
    if (!ok) return;
    setACancelar(null);
    setMotivo('');
    setAviso(`Cancelamos tu cita del ${fechaHora(c.inicio)}.`);
    citas.recargar();
  }

  return (
    <div className="cu-seccion">
      {aviso && (
        <div className="aviso aviso-exito" role="status">
          <span>{aviso}</span>
          <button type="button" className="btn btn-texto btn-sm" onClick={() => setAviso(null)}>
            Cerrar aviso
          </button>
        </div>
      )}

      <section aria-labelledby="cu-proximas">
        <div className="entre cu-seccion-cabeza">
          <h2 id="cu-proximas" className="cu-h2">
            Próximas citas
          </h2>
          <Link className="btn btn-primario btn-sm" to="/reservar">
            Reservar otra cita
          </Link>
        </div>
        {proximas.length === 0 ? (
          <Vacio titulo="No tienes citas próximas">
            <p>
              Cuando reserves, aquí verás el día, la hora, quién te atiende y el tiempo estimado. <Link to="/reservar">Reserva tu cita</Link>.
            </p>
          </Vacio>
        ) : (
          <ul className="cu-lista">
            {proximas.map((c) => (
              <li key={c.id}>
                <TarjetaCita cita={c} config={config} proxima onCancelar={() => { cancelar.setError(null); setMotivo(''); setACancelar(c); }} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {pasadas.length > 0 && (
        <section aria-labelledby="cu-pasadas" className="cu-bloque">
          <h2 id="cu-pasadas" className="cu-h2">
            Citas pasadas y canceladas
          </h2>
          <ul className="cu-lista">
            {pasadas.map((c) => (
              <li key={c.id}>
                <TarjetaCita cita={c} config={config} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {aCancelar && (
        <Modal
          titulo="¿Cancelar tu cita?"
          onCerrar={() => setACancelar(null)}
          bloqueado={cancelar.enviando}
          pie={
            <>
              <button type="button" className="btn btn-secundario" onClick={() => setACancelar(null)} disabled={cancelar.enviando} data-autofocus>
                No, conservarla
              </button>
              <button type="button" className="btn btn-peligro" onClick={() => void confirmarCancelacion()} disabled={cancelar.enviando}>
                {cancelar.enviando ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
            </>
          }
        >
          <p>
            Vas a cancelar tu cita del <strong>{fechaHora(aCancelar.inicio)}</strong> ({unirConY(aCancelar.items.map((i) => i.nombre))}). Tu
            horario quedará libre para alguien más.
          </p>
          <div className="campo">
            <label className="etiqueta" htmlFor="cu-motivo">
              ¿Nos cuentas por qué? (opcional)
            </label>
            <textarea id="cu-motivo" className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
          </div>
          {cancelar.error && (
            <p className="aviso aviso-error" role="alert">
              {cancelar.error}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function TarjetaCita({ cita, config, proxima = false, onCancelar }: { cita: CitaDetalle; config: Configuracion; proxima?: boolean; onCancelar?: () => void }) {
  const total = totalCita(cita.items);
  const faltan = horasHasta(cita.inicio);
  const cancelable = proxima && (cita.estado === 'pendiente' || cita.estado === 'confirmada');
  const aTiempo = faltan >= config.horas_cancelacion;
  const firmable = proxima && cita.consentimientos_firmados === 0 && ACTIVAS.includes(cita.estado);
  const servicios = cita.items.map((i) => i.nombre);
  const whatsapp = enlaceWhatsApp(
    config.telefono_whatsapp,
    `Hola, Ópalo. Quiero cancelar o cambiar mi cita del ${fechaHora(cita.inicio)} (${unirConY(servicios)}).`,
  );

  function agregarCalendario() {
    descargarIcs(
      {
        uid: cita.id,
        inicio: cita.inicio,
        fin: cita.fin,
        titulo: `Cita en ${config.nombre_negocio}: ${unirConY(servicios)}`,
        descripcion: [
          `Te atiende ${cita.personal_nombre}.`,
          `Llega puntual: tienes ${config.tolerancia_retraso_min} minutos de tolerancia.`,
          `Para cancelar, hazlo con ${config.horas_cancelacion} horas de anticipación o escríbenos por WhatsApp al ${telefonoBonito(config.telefono_whatsapp)}.`,
        ].join('\n'),
        lugar: config.direccion,
      },
      `cita-opalo-${cita.inicio.slice(0, 10)}.ics`,
    );
  }

  return (
    <article className={`cu-tarjeta cu-cita${proxima ? ' cu-cita-proxima' : ''}`} aria-labelledby={`cita-${cita.id}`}>
      <div className="cu-cita-fecha" aria-hidden="true">
        <span className="cu-cita-dia num">{new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, day: 'numeric' }).format(new Date(cita.inicio))}</span>
        <span className="cu-cita-mes">{new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, month: 'short' }).format(new Date(cita.inicio)).replace('.', '')}</span>
      </div>
      <div className="cu-cita-cuerpo">
        <div className="entre cu-cita-cabeza">
          <h3 className="cu-cita-titulo" id={`cita-${cita.id}`}>
            <span className="cu-mayuscula">{fechaLarga(cita.inicio)}</span> · {hora(cita.inicio)}
          </h3>
          <PillEstadoCita estado={cita.estado} />
        </div>
        <dl className="cu-datos">
          <div>
            <dt>Te atiende</dt>
            <dd>
              {cita.personal_nombre}
              {cita.personal_titulo ? <span className="texto-3"> · {cita.personal_titulo}</span> : null}
            </dd>
          </div>
          <div>
            <dt>Tiempo estimado</dt>
            <dd>
              {duracion(cita.duracion_min)} <span className="texto-3">({hora(cita.inicio)} a {hora(cita.fin)})</span>
            </dd>
          </div>
          <div>
            <dt>Servicios</dt>
            <dd>{unirConY(servicios) || '—'}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd className="num">
              {total.texto}
              {total.todoPrepagado ? (
                <span className="texto-3"> · no pagas nada en el spa</span>
              ) : cita.pagado > 0 ? (
                <span className="texto-3"> · pagado {dinero(cita.pagado)}</span>
              ) : null}
            </dd>
          </div>
        </dl>

        {proxima && cita.requiere_revision && cita.estado === 'pendiente' && (
          <div className="aviso aviso-info cu-aviso-cita">
            <div>
              <p>
                Tu especialista está revisando tu ficha de salud, por tu seguridad. Te escribiremos por WhatsApp para confirmar tu cita; tu
                horario queda apartado.
              </p>
              {cita.alertas.length > 0 && (
                <details>
                  <summary>Ver qué vamos a revisar</summary>
                  <ul>
                    {cita.alertas.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        )}

        {firmable && (
          <div className="aviso aviso-alerta cu-aviso-cita">
            <span>Falta tu firma del consentimiento informado. Fírmalo antes de tu cita para empezar a tiempo.</span>
            <Link className="btn btn-oro btn-sm" to={`/cuenta/firmar/${cita.id}`}>
              Firmar consentimiento
            </Link>
          </div>
        )}

        {proxima && (
          <div className="cu-acciones">
            {ACTIVAS.includes(cita.estado) && (
              <button type="button" className="btn btn-secundario btn-sm" onClick={agregarCalendario}>
                Agregar a mi calendario
              </button>
            )}
            {cancelable && aTiempo && (
              <button type="button" className="btn btn-peligro btn-sm" onClick={onCancelar}>
                Cancelar cita
              </button>
            )}
          </div>
        )}
        {cancelable && !aTiempo && (
          <p className="ayuda cu-nota-cancelar">
            Faltan menos de {config.horas_cancelacion} horas para tu cita, así que ya no se puede cancelar desde aquí. Si necesitas
            cancelarla o cambiarla,{' '}
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              escríbenos por WhatsApp al {telefonoBonito(config.telefono_whatsapp)}
            </a>
            .
          </p>
        )}
      </div>
    </article>
  );
}
