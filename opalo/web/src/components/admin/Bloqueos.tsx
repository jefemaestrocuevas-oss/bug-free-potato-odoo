// Bloqueos de agenda: vacaciones, días festivos, cursos… (todo el spa o una persona).
import { useState, type FormEvent } from 'react';
import { api, type BloqueoAgenda, type PersonalInterno } from '../../lib/api';
import { fechaCorta, fechaLocal, hora, isoDesdeLocal, sumarDias } from '../../lib/format';
import { useAccion, useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../ui/Estado';
import { Modal, useConfirmar } from './Modal';
import { textoONulo } from './util';

/** Texto legible del rango de un bloqueo. */
export function rangoBloqueo(b: BloqueoAgenda): string {
  const iniF = fechaLocal(new Date(b.inicio));
  const finF = fechaLocal(new Date(b.fin));
  const hi = hora(b.inicio);
  const hf = hora(b.fin);
  if (hi === '00:00' && hf === '00:00') {
    const ultimo = sumarDias(finF, -1);
    return ultimo === iniF ? `${fechaCorta(iniF)} · todo el día` : `${fechaCorta(iniF)} al ${fechaCorta(ultimo)} · días completos`;
  }
  return iniF === finF ? `${fechaCorta(iniF)} · ${hi} a ${hf}` : `${fechaCorta(iniF)} ${hi} al ${fechaCorta(finF)} ${hf}`;
}

export function quienBloqueo(b: BloqueoAgenda, personal: PersonalInterno[]): string {
  if (!b.personal_id) return 'Todo el spa';
  return personal.find((p) => p.id === b.personal_id)?.nombre ?? 'Una persona del equipo';
}

function NuevoBloqueo({ personal, onListo }: { personal: PersonalInterno[]; onListo: () => void }) {
  const hoy = fechaLocal();
  const [para, setPara] = useState('');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [diaCompleto, setDiaCompleto] = useState(true);
  const [horaIni, setHoraIni] = useState('10:00');
  const [horaFin, setHoraFin] = useState('14:00');
  const [motivo, setMotivo] = useState('');
  const { ejecutar, enviando, error } = useAccion(async () => {
    const inicio = diaCompleto ? isoDesdeLocal(desde, '00:00') : isoDesdeLocal(desde, horaIni);
    const fin = diaCompleto ? isoDesdeLocal(sumarDias(hasta < desde ? desde : hasta, 1), '00:00') : isoDesdeLocal(hasta, horaFin);
    await api.admin.guardarBloqueo({ personal_id: para || null, inicio, fin, motivo: textoONulo(motivo) });
    return true;
  });
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (await ejecutar()) {
      setMotivo('');
      onListo();
    }
  };
  return (
    <form onSubmit={enviar} className="tarjeta-plana adm-form-bloqueo">
      <h4 className="adm-sin-margen">Nuevo bloqueo</h4>
      <div className="adm-form-2">
        <div className="campo">
          <label className="etiqueta" htmlFor="bq-para">
            ¿A quién aplica?
          </label>
          <select id="bq-para" className="input" value={para} onChange={(e) => setPara(e.target.value)}>
            <option value="">Todo el spa (cerrado)</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="bq-motivo">
            Motivo
          </label>
          <input id="bq-motivo" className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Vacaciones, día festivo, curso…" />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={diaCompleto} onChange={(e) => setDiaCompleto(e.target.checked)} />
        <span>Días completos</span>
      </label>
      <div className="adm-form-2 adm-margen-arriba">
        <div className="campo">
          <label className="etiqueta" htmlFor="bq-desde">
            Desde
          </label>
          <div className="fila adm-fila-nowrap">
            <input id="bq-desde" className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required />
            {!diaCompleto && (
              <input className="input num adm-input-hora" type="time" value={horaIni} onChange={(e) => setHoraIni(e.target.value)} aria-label="Hora de inicio" required />
            )}
          </div>
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="bq-hasta">
            Hasta
          </label>
          <div className="fila adm-fila-nowrap">
            <input id="bq-hasta" className="input" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} required />
            {!diaCompleto && (
              <input className="input num adm-input-hora" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} aria-label="Hora de fin" required />
            )}
          </div>
        </div>
      </div>
      <p className="ayuda adm-sin-margen">Mientras dure el bloqueo no se ofrecen horarios en línea. Las citas que ya existían no se cancelan solas.</p>
      <MensajeError error={error} />
      <div className="fila adm-fila-fin">
        <button type="submit" className="btn btn-primario btn-sm" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar bloqueo'}
        </button>
      </div>
    </form>
  );
}

/** Ventana para ver, crear y borrar bloqueos próximos. */
export function BloqueosAgenda({ personal, onCerrar, onCambio }: { personal: PersonalInterno[]; onCerrar: () => void; onCambio: () => void }) {
  const hoy = fechaLocal();
  const lista = useAsync(() => api.admin.getBloqueos(hoy, sumarDias(hoy, 365)), []);
  const { confirmar, dialogo } = useConfirmar();
  return (
    <Modal
      titulo="Bloqueos de agenda"
      ancho="amplio"
      onCerrar={onCerrar}
      pie={
        <button type="button" className="btn btn-secundario" onClick={onCerrar}>
          Cerrar
        </button>
      }
    >
      <p className="ayuda">Usa los bloqueos para vacaciones, días festivos, cursos o cualquier rato en que no se atienda.</p>
      <NuevoBloqueo
        personal={personal}
        onListo={() => {
          lista.recargar();
          onCambio();
        }}
      />
      <h4 className="adm-margen-arriba">Próximos bloqueos</h4>
      {lista.cargando && !lista.datos && <Cargando />}
      <MensajeError error={lista.error} onReintentar={lista.recargar} />
      {lista.datos && lista.datos.length === 0 && <Vacio titulo="Sin bloqueos próximos">La agenda está abierta según el horario de cada persona.</Vacio>}
      {lista.datos && lista.datos.length > 0 && (
        <ul className="adm-lista">
          {lista.datos.map((b) => (
            <li key={b.id} className="adm-lista-item">
              <div>
                <strong>{rangoBloqueo(b)}</strong>
                <span className="texto-3 pequeno">
                  {' '}
                  · {quienBloqueo(b, personal)}
                  {b.motivo ? ` · ${b.motivo}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-texto btn-sm adm-texto-peligro"
                onClick={() =>
                  confirmar({
                    titulo: 'Borrar bloqueo',
                    mensaje: (
                      <p>
                        ¿Borrar el bloqueo <strong>{rangoBloqueo(b)}</strong> ({quienBloqueo(b, personal)})? Esos horarios volverán a ofrecerse para reservar.
                      </p>
                    ),
                    textoBoton: 'Sí, borrar',
                    peligro: true,
                    accion: () => api.admin.eliminarBloqueo(b.id),
                    alTerminar: () => {
                      lista.recargar();
                      onCambio();
                    },
                  })
                }
              >
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}
      {dialogo}
    </Modal>
  );
}
