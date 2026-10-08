// Paso 5: políticas generales pendientes de aceptar + consentimiento(s) informado(s) que se firmarán.
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { POLITICAS_GENERALES, type Politica, type TipoPolitica } from '../../lib/api/tipos';
import { ETIQUETA_POLITICA, fechaCorta } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError } from '../ui/Estado';
import { Markdown } from '../ui/Markdown';
import { PieAsistente } from './Piezas';
import { ORDEN_TIPOS } from './utilidades';

const MSG_POLITICAS = 'Antes de reservar necesitas aceptar los términos, el aviso de privacidad y la política de cancelación.';

interface Props {
  tipos: TipoPolitica[];
  marcadas: string[];
  consentimientoLeido: boolean;
  onAtras: () => void;
  onListo: (r: { marcadas: string[]; consentimientoLeido: boolean }) => void;
}

export function PasoPoliticas({ tipos, marcadas: marcadasIniciales, consentimientoLeido: leidoInicial, onAtras, onListo }: Props) {
  const datos = useAsync(() => Promise.all([api.getPoliticasVigentes(), api.getMisAceptaciones()]), []);
  const [marcadas, setMarcadas] = useState<string[]>(marcadasIniciales);
  const [leido, setLeido] = useState(leidoInicial);
  const [errores, setErrores] = useState<{ politicas?: boolean; consentimiento?: boolean }>({});
  const leidoRef = useRef<HTMLInputElement>(null);

  if (datos.cargando) return <Cargando texto="Cargando políticas…" />;
  if (datos.error || !datos.datos)
    return (
      <div className="rv-paso-cuerpo">
        <MensajeError error={datos.error ?? 'No pudimos cargar las políticas.'} onReintentar={datos.recargar} />
        <PieAsistente onAtras={onAtras} />
      </div>
    );

  const [vigentes, aceptadas] = datos.datos;
  const orden = (a: Politica, b: Politica) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo);
  const pendientes = vigentes.filter((p) => POLITICAS_GENERALES.includes(p.tipo) && !aceptadas.includes(p.id)).sort(orden);
  const consentimientos = vigentes.filter((p) => tipos.includes(p.tipo)).sort(orden);
  const faltanPoliticas = pendientes.filter((p) => !marcadas.includes(p.id));

  function alternar(id: string, si: boolean) {
    setMarcadas((m) => (si ? [...new Set([...m, id])] : m.filter((x) => x !== id)));
  }

  function continuar() {
    const errs = { politicas: faltanPoliticas.length > 0, consentimiento: consentimientos.length > 0 && !leido };
    setErrores(errs);
    if (errs.politicas) {
      requestAnimationFrame(() => document.getElementById(`rv-pol-${faltanPoliticas[0].id}`)?.focus());
      return;
    }
    if (errs.consentimiento) {
      requestAnimationFrame(() => leidoRef.current?.focus());
      return;
    }
    // Sólo se envían las pendientes (las que ya aceptó antes no hace falta repetirlas).
    onListo({ marcadas: pendientes.map((p) => p.id), consentimientoLeido: leido });
  }

  return (
    <div className="rv-paso-cuerpo">
      <section className="rv-bloque" aria-labelledby="rv-pol-generales">
        <h3 className="rv-subtitulo" id="rv-pol-generales">
          Nuestras políticas
        </h3>
        {pendientes.length === 0 ? (
          <p className="aviso aviso-exito">
            Ya aceptaste la versión vigente de nuestros términos, aviso de privacidad y política de cancelación. Gracias.
          </p>
        ) : (
          <>
            <p className="texto-2">
              Léelas con calma (toca cada una para abrirla) y marca que las aceptas. Sólo te las volvemos a pedir si cambian.
            </p>
            <ul className="rv-politicas">
              {pendientes.map((p) => {
                const falta = !!errores.politicas && !marcadas.includes(p.id);
                return (
                  <li key={p.id} className={`rv-politica${falta ? ' rv-politica-error' : ''}`}>
                    <details>
                      <summary>
                        <span className="rv-politica-titulo">{p.titulo || ETIQUETA_POLITICA[p.tipo]}</span>
                        <span className="ayuda">
                          Versión {p.version}
                          {p.vigente_desde ? ` · vigente desde el ${fechaCorta(p.vigente_desde)}` : ''}
                        </span>
                      </summary>
                      <div className="rv-documento" tabIndex={0} role="region" aria-label={p.titulo || ETIQUETA_POLITICA[p.tipo]}>
                        <Markdown texto={p.contenido_md} />
                      </div>
                    </details>
                    <label className="check rv-politica-check">
                      <input
                        id={`rv-pol-${p.id}`}
                        type="checkbox"
                        checked={marcadas.includes(p.id)}
                        onChange={(e) => alternar(p.id, e.target.checked)}
                        aria-invalid={falta || undefined}
                        aria-describedby={falta ? 'rv-pol-error' : undefined}
                      />
                      <span>
                        Leí y acepto: <strong>{ETIQUETA_POLITICA[p.tipo] ?? p.titulo}</strong>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {errores.politicas && faltanPoliticas.length > 0 && (
              <p className="aviso aviso-error rv-error" role="alert" id="rv-pol-error">
                {MSG_POLITICAS}
              </p>
            )}
          </>
        )}
      </section>

      {consentimientos.length > 0 && (
        <section className="rv-bloque" aria-labelledby="rv-pol-consentimiento">
          <h3 className="rv-subtitulo" id="rv-pol-consentimiento">
            {consentimientos.length === 1 ? 'Consentimiento informado' : 'Consentimientos informados'}
          </h3>
          <p className="texto-2">
            Explica en qué consiste tu tratamiento, sus beneficios, riesgos y cuidados. Léelo completo: en el siguiente paso lo
            firmas en pantalla. Si tienes dudas, pregúntanos antes de firmar.
          </p>
          {consentimientos.map((p) => (
            <article key={p.id} className="rv-consentimiento-doc">
              <p className="ayuda">
                {ETIQUETA_POLITICA[p.tipo]} · versión {p.version}
              </p>
              <div className="rv-documento rv-documento-largo" tabIndex={0} role="region" aria-label={p.titulo || ETIQUETA_POLITICA[p.tipo]}>
                <Markdown texto={p.contenido_md} />
              </div>
            </article>
          ))}
          <label className="check rv-politica-check">
            <input
              ref={leidoRef}
              type="checkbox"
              checked={leido}
              onChange={(e) => {
                setLeido(e.target.checked);
                if (e.target.checked) setErrores((x) => ({ ...x, consentimiento: false }));
              }}
              aria-invalid={(errores.consentimiento && !leido) || undefined}
              aria-describedby={errores.consentimiento && !leido ? 'rv-leido-error' : undefined}
            />
            <span>Leí el consentimiento informado completo y lo firmaré en el siguiente paso.</span>
          </label>
          {errores.consentimiento && !leido && (
            <span className="rv-campo-error" id="rv-leido-error">
              Marca que leíste el consentimiento para continuar.
            </span>
          )}
        </section>
      )}

      {consentimientos.length === 0 && tipos.length > 0 && (
        <p className="aviso aviso-info">
          El consentimiento informado de tu servicio aún no está publicado; te lo daremos a firmar en cabina antes de empezar.
        </p>
      )}

      <PieAsistente onAtras={onAtras} onContinuar={continuar} textoContinuar="Continuar a la firma" />
    </div>
  );
}
