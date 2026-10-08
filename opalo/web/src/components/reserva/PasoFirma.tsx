// Paso 6: resumen final + firma del consentimiento en pantalla + confirmar.
import { useRef, useState } from 'react';
import type { DatosFirma, Slot, TipoPolitica } from '../../lib/api/tipos';
import { duracion, ETIQUETA_POLITICA, fechaLarga, hora } from '../../lib/format';
import { PanelFirma } from '../ui/PanelFirma';
import { PieAsistente, type LineaResumen } from './Piezas';
import { notaPago, unirConY, type Total } from './utilidades';

const MSG_FIRMA = 'Falta tu firma o tu nombre completo.';

interface Props {
  lineas: LineaResumen[];
  total: Total;
  duracionMin: number | null;
  slot: Slot;
  tipos: TipoPolitica[];
  requiereTutor: boolean;
  nombreSugerido: string;
  notas: string;
  onNotas: (t: string) => void;
  enviando: boolean;
  error: string | null;
  onAtras: () => void;
  onConfirmar: (firma: DatosFirma) => void;
}

export function PasoFirma(p: Props) {
  const [firma, setFirma] = useState<DatosFirma | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const error = errorLocal ?? p.error;

  const documentos = p.tipos.map((t) => (ETIQUETA_POLITICA[t] ?? t).replace(/^Consentimiento informado · /, '').toLowerCase());
  const leyenda = documentos.length
    ? `Con tu firma aceptas el consentimiento informado de ${unirConY(documentos)} que leíste en el paso anterior. Firma con tu dedo o con el mouse dentro del recuadro.`
    : 'Con tu firma confirmas que tu ficha de salud es verdadera y aceptas las indicaciones de tu especialista. Firma con tu dedo o con el mouse dentro del recuadro.';

  function confirmar() {
    if (!firma) {
      setErrorLocal(MSG_FIRMA);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setErrorLocal(null);
    p.onConfirmar(firma);
  }

  return (
    <div className="rv-paso-cuerpo">
      <section className="tarjeta-plana rv-final" aria-labelledby="rv-final-titulo">
        <h3 className="rv-subtitulo" id="rv-final-titulo">
          Tu cita
        </h3>
        <dl className="rv-final-datos">
          <div>
            <dt>Día</dt>
            <dd>{fechaLarga(p.slot.inicio)}</dd>
          </div>
          <div>
            <dt>Hora</dt>
            <dd>{hora(p.slot.inicio)} (hora de Querétaro)</dd>
          </div>
          <div>
            <dt>Te atiende</dt>
            <dd>{p.slot.personal_nombre}</dd>
          </div>
          <div>
            <dt>Tiempo estimado</dt>
            <dd>{p.duracionMin ? duracion(p.duracionMin) : 'Calculando…'}</dd>
          </div>
          <div className="rv-final-servicios">
            <dt>Servicios</dt>
            <dd>
              <ul>
                {p.lineas.map((l) => (
                  <li key={l.clave}>
                    <span>{l.nombre}</span>
                    <span className="num texto-2">{l.prepagado ? 'Prepagado' : l.precio === null ? 'Por confirmar' : null}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="rv-final-total">
            <dt>Total estimado</dt>
            <dd className="num">{p.total.texto}</dd>
          </div>
        </dl>
        <p className="ayuda">{notaPago(p.total)}</p>
      </section>

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

      <section className="rv-bloque" aria-labelledby="rv-firma-titulo">
        <h3 className="rv-subtitulo" id="rv-firma-titulo">
          Tu firma
        </h3>
        <PanelFirma onCambio={setFirma} requiereTutor={p.requiereTutor} nombreSugerido={p.nombreSugerido} leyenda={leyenda} />
      </section>

      {error && (
        <p className="aviso aviso-error rv-error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}

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
