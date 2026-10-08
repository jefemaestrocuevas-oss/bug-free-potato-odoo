// Botones de acción de una cita según su estado (confirmar, iniciar, completar, pago, firma…).
import { useState } from 'react';
import { api, type CitaDetalle, type EstadoCita } from '../../lib/api';
import { fechaHora } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { FirmarCabina } from './FirmarCabina';
import { Modal, useConfirmar } from './Modal';
import { RegistrarPago } from './RegistrarPago';

interface Props {
  cita: CitaDetalle;
  /** Recargar después de cualquier cambio. */
  onCambio: () => void;
  /** Mensaje de éxito para mostrar arriba de la agenda. */
  onAviso?: (texto: string) => void;
}

const ACTIVAS: EstadoCita[] = ['pendiente', 'confirmada', 'en_curso'];

function CancelarCita({ cita, onCerrar, onListo }: { cita: CitaDetalle; onCerrar: () => void; onListo: () => void }) {
  const [motivo, setMotivo] = useState('');
  const { ejecutar, enviando, error } = useAccion(async () => {
    await api.cancelarCita(cita.id, motivo.trim() || null);
    return true;
  });
  return (
    <Modal
      titulo="Cancelar cita"
      onCerrar={onCerrar}
      bloqueado={enviando}
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            No, regresar
          </button>
          <button
            type="button"
            className="btn btn-peligro"
            disabled={enviando}
            onClick={async () => {
              if (await ejecutar()) onListo();
            }}
          >
            {enviando ? 'Cancelando…' : 'Sí, cancelar la cita'}
          </button>
        </>
      }
    >
      <p>
        ¿Cancelar la cita de <strong>{cita.cliente_nombre}</strong> del {fechaHora(cita.inicio)}? El horario queda libre y, si usó créditos prepagados, se le
        devuelven.
      </p>
      <div className="campo">
        <label className="etiqueta" htmlFor="motivo-cancelacion">
          Motivo (opcional)
        </label>
        <textarea
          id="motivo-cancelacion"
          className="input"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej. La clienta pidió cambiar de día por WhatsApp"
        />
      </div>
      <MensajeError error={error} />
    </Modal>
  );
}

export function AccionesCita({ cita, onCambio, onAviso }: Props) {
  const [modal, setModal] = useState<null | 'pago' | 'firma' | 'firma-iniciar' | 'firma-completar' | 'cancelar'>(null);
  const { confirmar, dialogo } = useConfirmar();
  const accion = useAccion(async (estado: EstadoCita) => {
    await api.admin.cambiarEstadoCita(cita.id, estado);
    return true;
  });
  const completar = () =>
    confirmar({
      titulo: 'Completar cita',
      mensaje: (
        <>
          <p>
            Se marcará como completada la cita de <strong>{cita.cliente_nombre}</strong> y se descontarán del inventario los insumos según la receta de cada
            servicio.
          </p>
          {cita.pagado < cita.total && <p className="aviso aviso-alerta">Ojo: aún tiene saldo pendiente. Puedes registrar el pago antes o después.</p>}
        </>
      ),
      textoBoton: 'Sí, completar',
      accion: () => api.admin.completarCita(cita.id),
      alTerminar: () => {
        onAviso?.(`Cita de ${cita.cliente_nombre} completada. Los insumos se descontaron del inventario.`);
        onCambio();
      },
    });

  const cambiar = async (estado: EstadoCita, aviso: string) => {
    if (await accion.ejecutar(estado)) {
      onAviso?.(aviso);
      onCambio();
    }
  };

  const firmada = cita.consentimientos_firmados > 0;
  const activa = ACTIVAS.includes(cita.estado);
  const saldo = cita.total - cita.pagado;
  // Ya liquidada (con precio definido): sin botón de pago, para no cobrar dos veces.
  const liquidada = cita.total > 0 && saldo <= 0.005;
  const b = 'btn btn-sm';

  return (
    <div className="adm-acciones-cita">
      <div className="adm-acciones-fila">
        {cita.estado === 'pendiente' && (
          <button type="button" className={`${b} btn-primario`} disabled={accion.enviando} onClick={() => cambiar('confirmada', `Cita de ${cita.cliente_nombre} confirmada.`)}>
            Confirmar
          </button>
        )}
        {(cita.estado === 'confirmada' || cita.estado === 'pendiente') && (
          <button
            type="button"
            className={`${b} ${cita.estado === 'confirmada' ? 'btn-primario' : 'btn-secundario'}`}
            disabled={accion.enviando}
            onClick={() => (firmada ? cambiar('en_curso', `Cita de ${cita.cliente_nombre} en curso.`) : setModal('firma-iniciar'))}
          >
            Iniciar
          </button>
        )}
        {(cita.estado === 'en_curso' || cita.estado === 'confirmada') && (
          <button
            type="button"
            className={`${b} ${cita.estado === 'en_curso' ? 'btn-primario' : 'btn-secundario'}`}
            disabled={accion.enviando}
            onClick={() => (firmada ? completar() : setModal('firma-completar'))}
          >
            Completar
          </button>
        )}
        {activa && !firmada && (
          <button type="button" className={`${b} btn-oro`} onClick={() => setModal('firma')}>
            Firmar en cabina
          </button>
        )}
        {cita.estado !== 'cancelada' && cita.estado !== 'no_asistio' && !liquidada && (
          <button type="button" className={`${b} ${saldo > 0 && cita.estado === 'completada' ? 'btn-primario' : 'btn-secundario'}`} onClick={() => setModal('pago')}>
            Registrar pago
          </button>
        )}
        {(cita.estado === 'pendiente' || cita.estado === 'confirmada') && (
          <button
            type="button"
            className={`${b} btn-texto`}
            disabled={accion.enviando}
            onClick={() =>
              confirmar({
                titulo: 'Marcar como “No asistió”',
                mensaje: (
                  <p>
                    ¿<strong>{cita.cliente_nombre}</strong> no llegó a su cita del {fechaHora(cita.inicio)}? El horario queda libre para otra clienta.
                  </p>
                ),
                textoBoton: 'Sí, no asistió',
                peligro: true,
                accion: () => api.admin.cambiarEstadoCita(cita.id, 'no_asistio'),
                alTerminar: () => {
                  onAviso?.(`Se marcó que ${cita.cliente_nombre} no asistió.`);
                  onCambio();
                },
              })
            }
          >
            No asistió
          </button>
        )}
        {activa && (
          <button type="button" className={`${b} btn-texto adm-texto-peligro`} onClick={() => setModal('cancelar')}>
            Cancelar
          </button>
        )}
        {cita.estado === 'no_asistio' && (
          <button type="button" className={`${b} btn-secundario`} disabled={accion.enviando} onClick={() => cambiar('confirmada', 'La cita volvió a quedar confirmada.')}>
            Volver a confirmar
          </button>
        )}
      </div>
      <MensajeError error={accion.error} />

      {modal === 'pago' && (
        <RegistrarPago
          destino={{ tipo: 'cita', id: cita.id, descripcion: `${cita.cliente_nombre} · ${fechaHora(cita.inicio)} · ${cita.items.map((i) => i.nombre).join(', ')}` }}
          total={cita.total}
          pagado={cita.pagado}
          onCerrar={() => setModal(null)}
          onListo={(m) => {
            setModal(null);
            onAviso?.(m);
            onCambio();
          }}
        />
      )}
      {(modal === 'firma' || modal === 'firma-iniciar' || modal === 'firma-completar') && (
        <FirmarCabina
          cita={cita}
          aviso={modal === 'firma' ? undefined : 'Sin consentimiento firmado no hay servicio: pide a la clienta que firme primero.'}
          onCerrar={() => setModal(null)}
          onListo={async () => {
            const siguiente = modal;
            setModal(null);
            if (siguiente === 'firma-iniciar') {
              await cambiar('en_curso', `Firma guardada. La cita de ${cita.cliente_nombre} está en curso.`);
            } else if (siguiente === 'firma-completar') {
              onAviso?.('Firma guardada.');
              onCambio();
              completar();
            } else {
              onAviso?.(`Firma de ${cita.cliente_nombre} guardada.`);
              onCambio();
            }
          }}
        />
      )}
      {modal === 'cancelar' && (
        <CancelarCita
          cita={cita}
          onCerrar={() => setModal(null)}
          onListo={() => {
            setModal(null);
            onAviso?.(`Cita de ${cita.cliente_nombre} cancelada.`);
            onCambio();
          }}
        />
      )}
      {dialogo}
    </div>
  );
}
