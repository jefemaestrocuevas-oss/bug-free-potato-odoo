// Paso 4: ficha de salud (preguntas según los servicios elegidos) + consentimiento expreso (LFPDPPP).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Contraindicacion } from '../../lib/api/tipos';
import { fechaCorta } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError } from '../ui/Estado';
import { borradorDesdeFicha, type FichaBorrador } from './estado';
import { PieAsistente } from './Piezas';
import { contraindicacionesAplicables, unirConY } from './utilidades';

const MSG_CONSENTIMIENTO = 'Para guardar tu ficha de salud necesitamos tu consentimiento expreso para tratar datos de salud.';

interface Props {
  /** Slugs de las categorías elegidas. */
  categorias: string[];
  ficha: FichaBorrador | null;
  onFicha: (f: FichaBorrador) => void;
  onAtras: () => void;
  onListo: () => void;
}

export function PasoFicha({ categorias, ficha, onFicha, onAtras, onListo }: Props) {
  const datos = useAsync(
    () => Promise.all([api.getContraindicaciones(), ficha ? Promise.resolve(undefined) : api.getMiFicha()]),
    // Sólo se carga al entrar al paso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Precarga con la ficha vigente (una sola vez).
  useEffect(() => {
    if (!ficha && datos.datos) onFicha(borradorDesdeFicha(datos.datos[1] ?? null));
  }, [datos.datos, ficha, onFicha]);

  if (datos.cargando || (!ficha && !datos.error)) return <Cargando texto="Cargando tu ficha…" />;
  if (datos.error || !datos.datos || !ficha)
    return (
      <div className="rv-paso-cuerpo">
        <MensajeError error={datos.error ?? 'No pudimos cargar tu ficha.'} onReintentar={datos.recargar} />
        <PieAsistente onAtras={onAtras} />
      </div>
    );

  return (
    <FormularioFicha
      preguntas={contraindicacionesAplicables(datos.datos[0], categorias)}
      ficha={ficha}
      onFicha={onFicha}
      onAtras={onAtras}
      onListo={onListo}
    />
  );
}

function FormularioFicha({
  preguntas,
  ficha,
  onFicha,
  onAtras,
  onListo,
}: {
  preguntas: Contraindicacion[];
  ficha: FichaBorrador;
  onFicha: (f: FichaBorrador) => void;
  onAtras: () => void;
  onListo: () => void;
}) {
  const [errores, setErrores] = useState<Record<string, true>>({});
  const [errorConsentimiento, setErrorConsentimiento] = useState(false);
  const [resumenError, setResumenError] = useState<string | null>(null);
  const primeraRef = useRef<HTMLFieldSetElement>(null);
  const consentimientoRef = useRef<HTMLInputElement>(null);

  const cambiar = (patch: Partial<FichaBorrador>) => onFicha({ ...ficha, ...patch });

  function responder(clave: string, valor: boolean) {
    cambiar({ respuestas: { ...ficha.respuestas, [clave]: valor } });
    if (errores[clave]) {
      const resto = { ...errores };
      delete resto[clave];
      setErrores(resto);
    }
  }

  const marcadasSi = preguntas.filter((p) => ficha.respuestas[p.clave] === true);
  const pendientes = preguntas.filter((p) => typeof ficha.respuestas[p.clave] !== 'boolean');

  function continuar() {
    const errs: Record<string, true> = {};
    for (const p of pendientes) errs[p.clave] = true;
    setErrores(errs);
    const sinConsentimiento = !ficha.acepta_datos_sensibles;
    setErrorConsentimiento(sinConsentimiento);
    if (pendientes.length || sinConsentimiento) {
      // Resumen corto: el detalle (p. ej. el texto del consentimiento) ya aparece en rojo junto a cada campo.
      const partes: string[] = [];
      if (pendientes.length) partes.push(pendientes.length === 1 ? 'contestar 1 pregunta' : `contestar ${pendientes.length} preguntas`);
      if (sinConsentimiento) partes.push('marcar la casilla de consentimiento');
      setResumenError(`Para continuar falta ${unirConY(partes)}. Te lo marcamos en rojo.`);
      requestAnimationFrame(() => {
        if (pendientes.length) document.getElementById(`rv-preg-${pendientes[0].clave}-si`)?.focus();
        else consentimientoRef.current?.focus();
      });
      return;
    }
    setResumenError(null);
    onListo();
  }

  // Si ya no falta nada, se limpia el resumen de errores.
  useEffect(() => {
    if (resumenError && pendientes.length === 0 && ficha.acepta_datos_sensibles) setResumenError(null);
  }, [resumenError, pendientes.length, ficha.acepta_datos_sensibles]);

  return (
    <div className="rv-paso-cuerpo">
      <p className="texto-2">
        Estas preguntas son por tu seguridad: nos ayudan a saber si el servicio es adecuado para ti hoy. Sólo las ve tu
        especialista. Contesta cada una con Sí o No.
      </p>

      {ficha.anterior_en !== null && !ficha.revisada && (
        <div className="aviso aviso-info rv-sigue-igual" role="region" aria-label="Tu ficha anterior">
          <span>
            Precargamos tu ficha{ficha.anterior_en ? ` del ${fechaCorta(ficha.anterior_en)}` : ''}. <strong>¿Sigue igual?</strong>
          </span>
          <span className="fila">
            <button
              type="button"
              className="btn btn-secundario btn-sm"
              onClick={() => {
                cambiar({ revisada: true });
                requestAnimationFrame(() => consentimientoRef.current?.focus());
              }}
            >
              Sí, sigue igual
            </button>
            <button
              type="button"
              className="btn btn-texto btn-sm"
              onClick={() => {
                cambiar({ revisada: true });
                requestAnimationFrame(() => primeraRef.current?.querySelector('input')?.focus());
              }}
            >
              Algo cambió
            </button>
          </span>
        </div>
      )}

      <div className="rv-preguntas">
        {preguntas.map((p, i) => {
          const valor = ficha.respuestas[p.clave];
          const conError = !!errores[p.clave];
          const idAyuda = p.ayuda ? `rv-preg-${p.clave}-ayuda` : '';
          const idError = conError ? `rv-preg-${p.clave}-error` : '';
          const describe = [idAyuda, idError].filter(Boolean).join(' ') || undefined;
          return (
            <fieldset
              key={p.id}
              ref={i === 0 ? primeraRef : undefined}
              className={`rv-pregunta${conError ? ' rv-pregunta-error' : ''}${valor === true ? ' rv-pregunta-si' : ''}`}
              aria-describedby={describe}
            >
              <legend className="rv-pregunta-texto">{p.pregunta}</legend>
              {p.ayuda && (
                <p className="ayuda" id={idAyuda}>
                  {p.ayuda}
                </p>
              )}
              <div className="rv-si-no">
                <label className="rv-si-no-opcion">
                  <input
                    type="radio"
                    id={`rv-preg-${p.clave}-si`}
                    name={`rv-preg-${p.clave}`}
                    checked={valor === true}
                    onChange={() => responder(p.clave, true)}
                    required
                  />
                  <span>Sí</span>
                </label>
                <label className="rv-si-no-opcion">
                  <input type="radio" name={`rv-preg-${p.clave}`} checked={valor === false} onChange={() => responder(p.clave, false)} />
                  <span>No</span>
                </label>
              </div>
              {conError && (
                <span className="rv-campo-error" id={idError}>
                  Contesta Sí o No.
                </span>
              )}
              {valor === true && (
                <div className="campo rv-pregunta-detalle">
                  {p.mensaje_cliente && <p className="ayuda">{p.mensaje_cliente}</p>}
                  <label className="etiqueta" htmlFor={`rv-preg-${p.clave}-detalle`}>
                    Cuéntanos un poco más (opcional)
                  </label>
                  <input
                    id={`rv-preg-${p.clave}-detalle`}
                    className="input"
                    value={ficha.detalles[p.clave] ?? ''}
                    onChange={(e) => cambiar({ detalles: { ...ficha.detalles, [p.clave]: e.target.value } })}
                  />
                </div>
              )}
            </fieldset>
          );
        })}
      </div>

      {marcadasSi.length > 0 && (
        <p className="aviso aviso-info" role="status">
          Gracias por contarnos. Tu especialista revisará tu ficha y te confirmará por WhatsApp.
        </p>
      )}

      <div className="rv-campos-ficha">
        <div className="campo">
          <label className="etiqueta" htmlFor="rv-ficha-alergias">
            Alergias (opcional)
          </label>
          <textarea
            id="rv-ficha-alergias"
            className="input rv-textarea-corta"
            value={ficha.alergias}
            onChange={(e) => cambiar({ alergias: e.target.value })}
            placeholder="Por ejemplo: látex, algún medicamento, perfumes"
          />
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="rv-ficha-medicamentos">
            Medicamentos que tomas (opcional)
          </label>
          <textarea
            id="rv-ficha-medicamentos"
            className="input rv-textarea-corta"
            value={ficha.medicamentos}
            onChange={(e) => cambiar({ medicamentos: e.target.value })}
          />
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="rv-ficha-observaciones">
            ¿Algo más que tu especialista deba saber? (opcional)
          </label>
          <textarea
            id="rv-ficha-observaciones"
            className="input rv-textarea-corta"
            value={ficha.observaciones}
            onChange={(e) => cambiar({ observaciones: e.target.value })}
          />
        </div>
      </div>

      <div className={`rv-consentimiento${errorConsentimiento && !ficha.acepta_datos_sensibles ? ' rv-consentimiento-error' : ''}`}>
        <label className="check">
          <input
            ref={consentimientoRef}
            type="checkbox"
            checked={ficha.acepta_datos_sensibles}
            onChange={(e) => {
              cambiar({ acepta_datos_sensibles: e.target.checked });
              if (e.target.checked) setErrorConsentimiento(false);
            }}
            aria-invalid={(errorConsentimiento && !ficha.acepta_datos_sensibles) || undefined}
            aria-describedby={errorConsentimiento && !ficha.acepta_datos_sensibles ? 'rv-consentimiento-error' : undefined}
          />
          <span>
            Doy mi consentimiento expreso para que Ópalo trate mis datos de salud con el único fin de atenderme de forma segura, como
            explica el{' '}
            <Link to="/politicas/privacidad" target="_blank" rel="noopener">
              aviso de privacidad
            </Link>{' '}
            (se abre en otra pestaña).
          </span>
        </label>
        {errorConsentimiento && !ficha.acepta_datos_sensibles && (
          <span className="rv-campo-error" id="rv-consentimiento-error">
            {MSG_CONSENTIMIENTO}
          </span>
        )}
      </div>

      {resumenError && (
        <div className="aviso aviso-error rv-error" role="alert">
          {resumenError}
        </div>
      )}

      <PieAsistente onAtras={onAtras} onContinuar={continuar} />
    </div>
  );
}

