// Paso 6 con configuracion.firma_en_linea = true: resumen final + firma del consentimiento en
// pantalla + confirmar. Con false (decisión de Ópalo, ESPEC §9) el paso 6 es PasoConfirmar.
import { useEffect, useRef, useState } from 'react';
import type { DatosFirma, Slot, TipoPolitica } from '../../lib/api/tipos';
import { ETIQUETA_POLITICA } from '../../lib/format';
import { PanelFirma } from '../ui/PanelFirma';
import { DatosFinales, ErrorReserva, PieAsistente, type LineaResumen } from './Piezas';
import { unirConY, type Total } from './utilidades';

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
  const errorRef = useRef<HTMLDivElement>(null);
  const error = errorLocal ?? p.error;

  // Un error del servidor (p. ej. 'Ya tienes 3 citas próximas…') también se enfoca para que no pase desapercibido.
  useEffect(() => {
    if (p.error) requestAnimationFrame(() => errorRef.current?.focus());
  }, [p.error]);

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
      <DatosFinales lineas={p.lineas} total={p.total} duracionMin={p.duracionMin} slot={p.slot} />

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

      {error && <ErrorReserva error={error} ref={errorRef} />}

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
