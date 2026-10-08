// Paso 6 con configuracion.firma_en_linea = false (decisión de Ópalo, ESPEC §9): "Revisa y confirma".
// Resumen final (servicios, día, hora, quién te atiende, tiempo estimado y total), notas opcionales y,
// si la clienta es menor de edad, el nombre de quien la acompaña. El consentimiento informado se
// revisa en el spa: este paso no lo menciona.
import { useEffect, useRef, useState } from 'react';
import type { Slot } from '../../lib/api/tipos';
import { DatosFinales, ErrorReserva, PieAsistente, type LineaResumen } from './Piezas';
import type { Total } from './utilidades';

/** Mismo texto que la base (reservar_cita). */
export const MSG_TUTOR = 'Por ser menor de edad, escribe el nombre de mamá, papá o tutor que te acompañará.';
const MIN_TUTOR = 3;
const MAX_TUTOR = 200;

interface Props {
  lineas: LineaResumen[];
  total: Total;
  duracionMin: number | null;
  slot: Slot;
  requiereTutor: boolean;
  notas: string;
  onNotas: (t: string) => void;
  enviando: boolean;
  error: string | null;
  onAtras: () => void;
  /** Nombre de mamá, papá o tutor (sólo si requiereTutor). */
  onConfirmar: (tutor: string | null) => void;
}

export function PasoConfirmar(p: Props) {
  const [tutor, setTutor] = useState('');
  const [errorTutor, setErrorTutor] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const tutorRef = useRef<HTMLInputElement>(null);

  // Un error del servidor (p. ej. 'Ya tienes 3 citas próximas…') se enfoca para que no pase desapercibido.
  useEffect(() => {
    if (p.error) requestAnimationFrame(() => errorRef.current?.focus());
  }, [p.error]);

  function confirmar() {
    if (p.requiereTutor && tutor.trim().length < MIN_TUTOR) {
      setErrorTutor(true);
      requestAnimationFrame(() => tutorRef.current?.focus());
      return;
    }
    setErrorTutor(false);
    p.onConfirmar(p.requiereTutor ? tutor.trim() : null);
  }

  const faltaTutor = errorTutor && tutor.trim().length < MIN_TUTOR;

  return (
    <div className="rv-paso-cuerpo">
      <p className="texto-2 rv-sin-margen">Revisa que todo esté bien. Al confirmar apartamos tu horario.</p>

      <DatosFinales lineas={p.lineas} total={p.total} duracionMin={p.duracionMin} slot={p.slot} />

      {p.requiereTutor && (
        <div className="campo">
          <label className="etiqueta" htmlFor="rv-tutor">
            Nombre de mamá, papá o tutor que te acompañará
          </label>
          <input
            id="rv-tutor"
            ref={tutorRef}
            className="input"
            value={tutor}
            maxLength={MAX_TUTOR}
            autoComplete="off"
            onChange={(e) => setTutor(e.target.value)}
            aria-invalid={faltaTutor || undefined}
            aria-describedby={faltaTutor ? 'rv-tutor-error rv-tutor-ayuda' : 'rv-tutor-ayuda'}
          />
          {faltaTutor && (
            <span className="rv-campo-error" id="rv-tutor-error">
              {MSG_TUTOR}
            </span>
          )}
          <span className="ayuda" id="rv-tutor-ayuda">
            Como eres menor de edad, esa persona debe acompañarte en cabina toda la sesión, con una identificación oficial.
          </span>
        </div>
      )}

      <div className="campo">
        <label className="etiqueta" htmlFor="rv-notas">
          ¿Algo que quieras decirnos antes de tu cita? (opcional)
        </label>
        <textarea
          id="rv-notas"
          className="input rv-textarea-corta"
          value={p.notas}
          maxLength={500}
          onChange={(e) => p.onNotas(e.target.value)}
          placeholder="Por ejemplo: es mi primera vez, o prefiero que me escriban por la tarde"
        />
      </div>

      {p.error && <ErrorReserva error={p.error} ref={errorRef} />}

      <PieAsistente
        onAtras={p.onAtras}
        onContinuar={confirmar}
        textoContinuar="Confirmar mi cita"
        enviando={p.enviando}
        textoEnviando="Reservando…"
      />
    </div>
  );
}
