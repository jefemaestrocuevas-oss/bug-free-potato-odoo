// Pestaña «Lotes» del taller: cada tanda de jabones o velas, de su elaboración a la venta.
// En curado → listo para liberar → disponible (o descartado). Liberar y descartar piden confirmación.
import { useState, type FormEvent, type ReactNode } from 'react';
import { api, type Lote } from '../../lib/api';
import { fechaCorta, fechaEnLetra, numero } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { MensajeError, Vacio } from '../ui/Estado';
import { Modal } from './Modal';
import { Casilla } from './Piezas';
import { EntradaConUnidad, pesos } from './InventarioPiezas';
import { BarraCurado, PillEstadoLote, textoFaltan } from './TallerPiezas';
import { aNumero, aTexto, dineroUnitario, textoONulo } from './util';

/** Lotes por mostrar antes de «Ver todos» en disponibles y descartados. */
const CORTE = 6;

/** «Liberar»: confirma las piezas que salieron y, si sigue en curado, que se libera antes de tiempo. */
export function TallerLiberar({ lote, onCerrar, onListo }: { lote: Lote; onCerrar: () => void; onListo: (mensaje: string) => void }) {
  const [piezas, setPiezas] = useState(aTexto(lote.piezas_planeadas));
  const [forzar, setForzar] = useState(false);
  const enCurado = lote.dias_para_listo > 0;
  const n = aNumero(piezas);
  const valido = n !== null && n > 0;
  const costoPieza = valido ? lote.costo_materiales / n! : null;

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    if (!valido) throw new Error('Escribe cuántas piezas salieron (mayor a cero).');
    if (enCurado && !forzar) throw new Error(`Este lote sigue en curado hasta el ${fechaEnLetra(lote.listo_desde, false)}. Para liberarlo antes, confírmalo abajo.`);
    await api.admin.liberarLote(lote.id, n, enCurado && forzar);
    return true;
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (await ejecutar())
      onListo(
        `Lote ${lote.codigo} liberado: ${numero(n!)} ${n === 1 ? 'pieza' : 'piezas'} de ${lote.producto_nombre} ya se pueden vender (${dineroUnitario(
          Math.round(costoPieza! * 100) / 100,
        )} cada una).`,
      );
  };

  return (
    <Modal
      titulo={`Liberar lote ${lote.codigo}`}
      onCerrar={onCerrar}
      bloqueado={enviando}
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="tal-form-liberar" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Liberando…' : 'Liberar lote'}
          </button>
        </>
      }
    >
      <form id="tal-form-liberar" className="pila" onSubmit={enviar} noValidate>
        <p className="texto-2 adm-sin-margen">
          {lote.producto_nombre} · hecho el {fechaCorta(lote.elaborado_en)}. Al liberarlo, sus piezas pasan al inventario y se pueden vender en el spa y en
          línea.
        </p>
        <div className="campo adm-sin-margen">
          <label className="etiqueta" htmlFor="tal-piezas-obtenidas">
            Piezas que salieron
          </label>
          <EntradaConUnidad
            id="tal-piezas-obtenidas"
            valor={piezas}
            onCambio={setPiezas}
            unidad="pz"
            invalido={!valido}
            descrita="tal-piezas-ayuda"
          />
          <span className="ayuda" id="tal-piezas-ayuda">
            Se planearon {numero(lote.piezas_planeadas, 2)}. Si alguna salió mal, escribe sólo las buenas: el costo se reparte entre ellas
            {costoPieza !== null ? ` (${dineroUnitario(Math.round(costoPieza * 100) / 100)} por pieza)` : ''}.
          </span>
        </div>
        {enCurado && (
          <div className="aviso aviso-alerta adm-sin-margen">
            <div className="pila">
              <p className="adm-sin-margen">
                <strong>Este lote sigue en curado hasta el {fechaEnLetra(lote.listo_desde, false)}</strong> ({textoFaltan(lote.dias_para_listo).toLowerCase()}).
                Un jabón sin curar puede salir blando o irritar la piel; una vela, con poco aroma.
              </p>
              <Casilla etiqueta="Sí, liberarlo antes de tiempo" checked={forzar} onChange={setForzar} />
            </div>
          </div>
        )}
        <MensajeError error={error} />
      </form>
    </Modal>
  );
}

/** «Descartar»: el lote no se vende; su costo cuenta como merma del mes. */
export function TallerDescartar({ lote, onCerrar, onListo }: { lote: Lote; onCerrar: () => void; onListo: (mensaje: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const [intentado, setIntentado] = useState(false);
  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    const m = textoONulo(motivo);
    if (!m) throw new Error('Escribe por qué se descarta (queda en el historial del lote).');
    await api.admin.descartarLote(lote.id, m);
    return true;
  });
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    setError(null);
    if (await ejecutar()) onListo(`Lote ${lote.codigo} descartado. Sus ${pesos(lote.costo_materiales)} de materiales cuentan como merma del mes.`);
  };
  return (
    <Modal
      titulo={`Descartar lote ${lote.codigo}`}
      onCerrar={onCerrar}
      bloqueado={enviando}
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            No, regresar
          </button>
          <button type="submit" form="tal-form-descartar" className="btn btn-peligro" disabled={enviando}>
            {enviando ? 'Descartando…' : 'Descartar lote'}
          </button>
        </>
      }
    >
      <form id="tal-form-descartar" className="pila" onSubmit={enviar} noValidate>
        <p className="adm-sin-margen">
          Las {numero(lote.piezas_planeadas)} piezas de <strong>{lote.producto_nombre}</strong> no se venderán. La materia prima ya se usó: sus{' '}
          <strong>{pesos(lote.costo_materiales)}</strong> cuentan como merma del mes en Resultados. No se puede deshacer.
        </p>
        <div className="campo adm-sin-margen">
          <label className="etiqueta" htmlFor="tal-motivo">
            Motivo
          </label>
          <textarea
            id="tal-motivo"
            className="input"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            aria-invalid={intentado && !motivo.trim() ? true : undefined}
            placeholder="Se cortó la mezcla, salió con manchas, se contaminó…"
          />
        </div>
        <MensajeError error={error} />
      </form>
    </Modal>
  );
}

function Seccion({ titulo, ayuda, cuenta, children, id }: { titulo: string; ayuda?: ReactNode; cuenta: number; children: ReactNode; id: string }) {
  return (
    <section className="tal-seccion" aria-labelledby={id}>
      <h3 className="tal-seccion-titulo" id={id}>
        {titulo} <span className="tal-seccion-cuenta num">{cuenta}</span>
      </h3>
      {ayuda && <p className="ayuda tal-seccion-ayuda">{ayuda}</p>}
      {children}
    </section>
  );
}

interface Props {
  lotes: Lote[];
  onRegistrar: () => void;
  onLiberar: (l: Lote) => void;
  onDescartar: (l: Lote) => void;
}

export function TallerLotes({ lotes, onRegistrar, onLiberar, onDescartar }: Props) {
  const [todosDisponibles, setTodosDisponibles] = useState(false);
  const [todosDescartados, setTodosDescartados] = useState(false);
  const orden = (a: Lote, b: Lote) => b.elaborado_en.localeCompare(a.elaborado_en) || b.codigo.localeCompare(a.codigo);
  const listos = lotes.filter((l) => l.estado === 'en_curado' && l.dias_para_listo <= 0).sort((a, b) => a.listo_desde.localeCompare(b.listo_desde));
  const curando = lotes.filter((l) => l.estado === 'en_curado' && l.dias_para_listo > 0).sort((a, b) => a.dias_para_listo - b.dias_para_listo);
  const disponibles = lotes.filter((l) => l.estado === 'disponible').sort(orden);
  const descartados = lotes.filter((l) => l.estado === 'descartado').sort(orden);

  const tarjeta = (l: Lote) => (
    <li key={l.id} className={`tal-lote tal-lote-${l.estado === 'en_curado' && l.dias_para_listo <= 0 ? 'listo' : l.estado}`}>
      <div className="tal-lote-cabeza">
        <div className="tal-lote-titulo">
          <strong>{l.producto_nombre}</strong>
          <span className="tal-lote-codigo num">{l.codigo}</span>
        </div>
        <PillEstadoLote lote={l} />
      </div>
      {l.estado === 'en_curado' && (
        <div className="tal-lote-curado">
          <BarraCurado lote={l} />
          <span className={l.dias_para_listo <= 0 ? 'tal-listo-texto' : 'texto-2'}>
            {l.dias_para_listo > 0 ? `${textoFaltan(l.dias_para_listo)} · listo el ${fechaCorta(l.listo_desde)}` : textoFaltan(l.dias_para_listo)}
          </span>
        </div>
      )}
      <dl className="tal-lote-datos">
        <div>
          <dt>Elaborado</dt>
          <dd className="num">{fechaCorta(l.elaborado_en)}</dd>
        </div>
        <div>
          <dt>Piezas</dt>
          <dd className="num">
            {l.piezas_obtenidas !== null ? (
              <>
                {numero(l.piezas_obtenidas, 2)}
                {l.piezas_obtenidas !== l.piezas_planeadas && <span className="adm-sub">de {numero(l.piezas_planeadas, 2)} planeadas</span>}
              </>
            ) : (
              <>
                {numero(l.piezas_planeadas, 2)} <span className="adm-sub">planeadas</span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Materiales</dt>
          <dd className="num">{pesos(l.costo_materiales)}</dd>
        </div>
        <div>
          <dt>Costo por pieza</dt>
          <dd className="num">
            {l.costo_unitario === null ? '—' : dineroUnitario(Math.round(l.costo_unitario * 100) / 100)}
            {l.estado === 'en_curado' && l.costo_unitario !== null && <span className="adm-sub">provisional</span>}
          </dd>
        </div>
        {l.caduca_en && (
          <div>
            <dt>Caduca</dt>
            <dd className="num">{fechaCorta(l.caduca_en)}</dd>
          </div>
        )}
        {l.formula_nombre && (
          <div>
            <dt>Fórmula</dt>
            <dd>{l.formula_nombre}</dd>
          </div>
        )}
      </dl>
      {l.notas && <p className="tal-lote-notas">{l.notas}</p>}
      {l.estado === 'en_curado' && (
        <div className="tal-lote-acciones">
          <button
            type="button"
            className={`btn btn-sm ${l.dias_para_listo <= 0 ? 'btn-primario' : 'btn-secundario'}`}
            onClick={() => onLiberar(l)}
            aria-label={`Liberar el lote ${l.codigo} de ${l.producto_nombre}`}
          >
            Liberar
          </button>
          <button type="button" className="btn btn-texto btn-sm adm-texto-peligro" onClick={() => onDescartar(l)} aria-label={`Descartar el lote ${l.codigo}`}>
            Descartar
          </button>
        </div>
      )}
    </li>
  );

  return (
    <>
      <div className="tal-barra">
        <p className="texto-2 adm-sin-margen">
          <strong>El curado</strong> es el reposo que necesita cada lote antes de venderse: el jabón termina de saponificar y endurece (≈ 4 a 6 semanas) y la
          vela asienta su aroma. Mientras cura, sus piezas no se venden.
        </p>
        <button type="button" className="btn btn-primario" onClick={onRegistrar}>
          + Registrar lote
        </button>
      </div>

      {lotes.length === 0 ? (
        <Vacio titulo="Aún no hay lotes">
          <p>Registra cada tanda que hagas: el taller descuenta la materia prima, calcula el costo por pieza y te avisa cuando termine su curado.</p>
          <button type="button" className="btn btn-primario" onClick={onRegistrar}>
            + Registrar lote
          </button>
        </Vacio>
      ) : (
        <>
          {listos.length > 0 && (
            <Seccion
              id="tal-s-listos"
              titulo="Listos para liberar"
              cuenta={listos.length}
              ayuda="Ya cumplieron su curado. Revisa las piezas (textura, olor, que no suden) y libéralas para venderlas."
            >
              <ul className="tal-lotes">{listos.map(tarjeta)}</ul>
            </Seccion>
          )}
          <Seccion id="tal-s-curado" titulo="En curado" cuenta={curando.length}>
            {curando.length === 0 ? <p className="texto-3 adm-sin-margen">Ningún lote está curando ahora.</p> : <ul className="tal-lotes">{curando.map(tarjeta)}</ul>}
          </Seccion>
          <Seccion id="tal-s-disponibles" titulo="Disponibles" cuenta={disponibles.length} ayuda="Lotes liberados: sus piezas ya están en el inventario.">
            {disponibles.length === 0 ? (
              <p className="texto-3 adm-sin-margen">Todavía no se libera ningún lote.</p>
            ) : (
              <>
                <ul className="tal-lotes">{(todosDisponibles ? disponibles : disponibles.slice(0, CORTE)).map(tarjeta)}</ul>
                {disponibles.length > CORTE && (
                  <button type="button" className="btn btn-texto btn-sm tal-ver-todos" onClick={() => setTodosDisponibles((v) => !v)}>
                    {todosDisponibles ? 'Ver menos' : `Ver los ${disponibles.length}`}
                  </button>
                )}
              </>
            )}
          </Seccion>
          {descartados.length > 0 && (
            <Seccion id="tal-s-descartados" titulo="Descartados" cuenta={descartados.length} ayuda="Su costo contó como merma del mes en que se descartaron.">
              <ul className="tal-lotes">{(todosDescartados ? descartados : descartados.slice(0, CORTE)).map(tarjeta)}</ul>
              {descartados.length > CORTE && (
                <button type="button" className="btn btn-texto btn-sm tal-ver-todos" onClick={() => setTodosDescartados((v) => !v)}>
                  {todosDescartados ? 'Ver menos' : `Ver los ${descartados.length}`}
                </button>
              )}
            </Seccion>
          )}
        </>
      )}
    </>
  );
}
