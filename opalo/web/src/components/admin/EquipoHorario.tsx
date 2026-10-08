// Editor del horario semanal de una persona: varios rangos por día (comida), "cerrado" sin rangos.
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type Horario, type PersonalInterno } from '../../lib/api';
import { DIAS } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { IconoCerrar, IconoMas } from './Iconos';
import { Modal } from './Modal';
import { aMinutos, deMinutos, erroresDelDia, horarioPorDia, horasTexto, type RangoEditable } from './EquipoPiezas';

interface Props {
  persona: PersonalInterno;
  onCerrar: () => void;
  onGuardado: () => void;
}

export function EquipoHorario({ persona, onCerrar, onGuardado }: Props) {
  const sig = useRef(1);
  const nuevo = (inicio: string, fin: string): RangoEditable => ({ k: sig.current++, inicio, fin });
  const [dias, setDias] = useState<RangoEditable[][]>(() => horarioPorDia(persona.horarios).map((d) => d.map((h) => nuevo(h.hora_inicio.slice(0, 5), h.hora_fin.slice(0, 5)))));
  const [intentado, setIntentado] = useState(false);

  const errores = dias.map(erroresDelDia);
  const hayErrores = errores.some((e) => e.size > 0);
  const totalMin = dias.flat().reduce((s, r) => {
    if (!/^\d{2}:\d{2}/.test(r.inicio) || !/^\d{2}:\d{2}/.test(r.fin)) return s;
    return s + Math.max(0, aMinutos(r.fin) - aMinutos(r.inicio));
  }, 0);
  const diasAbiertos = dias.filter((d) => d.length > 0).length;

  const cambiarDia = (i: number, f: (d: RangoEditable[]) => RangoEditable[]) => setDias((ds) => ds.map((d, j) => (j === i ? f(d) : d)));

  const agregar = (i: number) =>
    cambiarDia(i, (d) => {
      if (d.length === 0) return [nuevo('10:00', '19:00')];
      const ultimo = [...d].sort((a, b) => (a.fin || '').localeCompare(b.fin || ''))[d.length - 1];
      const desde = /^\d{2}:\d{2}/.test(ultimo.fin) ? aMinutos(ultimo.fin) + 60 : 15 * 60;
      return [...d, nuevo(deMinutos(desde), deMinutos(Math.min(desde + 4 * 60, 22 * 60)))];
    });

  const copiarDe = (i: number, origen: number) => cambiarDia(i, () => dias[origen].map((r) => nuevo(r.inicio, r.fin)));

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    const horarios: Horario[] = dias.flatMap((d, dia) =>
      [...d].sort((a, b) => aMinutos(a.inicio) - aMinutos(b.inicio)).map((r) => ({ dia_semana: dia, hora_inicio: r.inicio.slice(0, 5), hora_fin: r.fin.slice(0, 5) })),
    );
    await api.admin.guardarHorarios(persona.id, horarios);
    return true;
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    setError(null);
    if (hayErrores) return;
    if (await ejecutar()) onGuardado();
  };

  return (
    <Modal
      titulo={`Horario de ${persona.nombre}`}
      onCerrar={onCerrar}
      bloqueado={enviando}
      ancho="amplio"
      pie={
        <>
          <span className="eqa-horario-total texto-2 pequeno">
            {diasAbiertos === 0 ? 'Sin días de atención' : `${diasAbiertos} ${diasAbiertos === 1 ? 'día' : 'días'} · ${horasTexto(totalMin)} a la semana`}
          </span>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="eqa-form-horario" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar horario'}
          </button>
        </>
      }
    >
      <form id="eqa-form-horario" className="eqa-form" onSubmit={enviar} noValidate>
        <p className="ayuda eqa-horario-intro">
          Las citas en línea se ofrecen dentro de estos rangos y tienen que terminar antes de la hora de salida. Si hay comida a media jornada, usa dos rangos. Para
          vacaciones o días festivos usa los <Link to="/admin/agenda">bloqueos de la agenda</Link>.
        </p>
        <ol className="eqa-dias">
          {dias.map((rangos, i) => {
            const anterior = (i + 6) % 7;
            const erroresDia = errores[i];
            return (
              <li key={i} className={`eqa-dia ${rangos.length === 0 ? 'eqa-dia-cerrado' : ''}`}>
                <div className="eqa-dia-nombre" id={`eqa-dia-${i}`}>
                  {DIAS[i]}
                </div>
                <div className="eqa-dia-rangos">
                  {rangos.length === 0 ? (
                    <p className="eqa-cerrado">Cerrado</p>
                  ) : (
                    <ul className="eqa-rangos">
                      {rangos.map((r, j) => {
                        const err = erroresDia.get(r.k);
                        const mostrar = err && (intentado || (r.inicio && r.fin));
                        return (
                          <li key={r.k} className="eqa-rango">
                            <div className="eqa-rango-fila">
                              <input
                                type="time"
                                className="input num eqa-hora"
                                value={r.inicio}
                                step={900}
                                onChange={(e) => cambiarDia(i, (d) => d.map((x) => (x.k === r.k ? { ...x, inicio: e.target.value } : x)))}
                                aria-label={`${DIAS[i]}, rango ${j + 1}: entrada`}
                                aria-invalid={mostrar ? true : undefined}
                                aria-describedby={mostrar ? `eqa-err-${r.k}` : undefined}
                                required
                              />
                              <span className="texto-3" aria-hidden="true">
                                a
                              </span>
                              <input
                                type="time"
                                className="input num eqa-hora"
                                value={r.fin}
                                step={900}
                                onChange={(e) => cambiarDia(i, (d) => d.map((x) => (x.k === r.k ? { ...x, fin: e.target.value } : x)))}
                                aria-label={`${DIAS[i]}, rango ${j + 1}: salida`}
                                aria-invalid={mostrar ? true : undefined}
                                aria-describedby={mostrar ? `eqa-err-${r.k}` : undefined}
                                required
                              />
                              <button
                                type="button"
                                className="btn btn-texto btn-sm adm-texto-peligro eqa-quitar"
                                onClick={() => cambiarDia(i, (d) => d.filter((x) => x.k !== r.k))}
                                aria-label={`Quitar el rango ${j + 1} del ${DIAS[i].toLowerCase()}`}
                              >
                                <IconoCerrar tam={18} />
                              </button>
                            </div>
                            {mostrar && (
                              <span className="eqa-error-campo" id={`eqa-err-${r.k}`}>
                                {err}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="eqa-dia-acciones">
                  <button type="button" className="btn btn-texto btn-sm" onClick={() => agregar(i)} aria-describedby={`eqa-dia-${i}`}>
                    <IconoMas tam={16} /> {rangos.length === 0 ? 'Abrir' : 'Otro rango'}
                  </button>
                  {rangos.length === 0 && dias[anterior].length > 0 && (
                    <button type="button" className="btn btn-texto btn-sm" onClick={() => copiarDe(i, anterior)} aria-describedby={`eqa-dia-${i}`}>
                      Igual que el {DIAS[anterior].toLowerCase()}
                    </button>
                  )}
                  {rangos.length > 1 && (
                    <button type="button" className="btn btn-texto btn-sm adm-texto-peligro" onClick={() => cambiarDia(i, () => [])} aria-describedby={`eqa-dia-${i}`}>
                      Cerrar el día
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {intentado && hayErrores && <MensajeError error="Revisa los rangos marcados en rojo antes de guardar." />}
        <MensajeError error={error} />
      </form>
    </Modal>
  );
}
