// Alta y edición de un gasto. También registra el pago de un gasto fijo (recurrente):
// llega prellenado y, al guardarlo, el sistema avanza su próximo vencimiento un periodo.
import { useState, type FormEvent } from 'react';
import { api, type CategoriaGasto, type Gasto, type GastoRecurrente, type MetodoPago } from '../../lib/api';
import { ETIQUETA_METODO_PAGO, fechaCorta, fechaLocal } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { Modal } from './Modal';
import { AVANCE_FRECUENCIA, dineroCentavos, METODOS_GASTO, urlSegura } from './GastosPiezas';
import { aNumero, aTexto, ETIQUETA_FRECUENCIA, nombreDeMes, sumarMeses, textoONulo } from './util';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Props {
  categorias: CategoriaGasto[];
  /** Gasto a editar. */
  gasto?: Gasto | null;
  /** Pago de un gasto fijo: prellena categoría, concepto y monto estimado, y liga el gasto. */
  fijo?: GastoRecurrente | null;
  onCerrar: () => void;
  onListo: (r: { mensaje: string; fecha: string }) => void;
}

export function GastosFormGasto({ categorias, gasto, fijo, onCerrar, onListo }: Props) {
  const hoy = fechaLocal();
  const editando = !!gasto;
  const [categoriaId, setCategoriaId] = useState(gasto?.categoria_id ?? fijo?.categoria_id ?? '');
  const [concepto, setConcepto] = useState(gasto?.concepto ?? fijo?.concepto ?? '');
  const [monto, setMonto] = useState(gasto ? aTexto(gasto.monto) : aTexto(fijo?.monto_estimado));
  const [fecha, setFecha] = useState(gasto?.fecha ?? hoy);
  const [metodo, setMetodo] = useState<MetodoPago | ''>(gasto?.metodo_pago ?? '');
  const [proveedor, setProveedor] = useState(gasto?.proveedor ?? '');
  const [comprobante, setComprobante] = useState(gasto?.comprobante_url ?? '');
  const [notas, setNotas] = useState(gasto?.notas ?? '');
  // '' = el mes de la fecha (lo que hace la base si no se indica otro).
  const [periodo, setPeriodo] = useState(() => (gasto && gasto.periodo.slice(0, 7) !== gasto.fecha.slice(0, 7) ? gasto.periodo.slice(0, 10) : ''));

  const recurrenteId = gasto ? gasto.recurrente_id : fijo?.id ?? null;
  const fijas = categorias.filter((c) => c.es_fijo);
  const variables = categorias.filter((c) => !c.es_fijo);
  const fechaValida = FECHA_RE.test(fecha);
  const mesFecha = (fechaValida ? fecha : hoy).slice(0, 7);
  // Si el periodo elegido coincide con el mes de la fecha, equivale a "el mes de la fecha".
  const periodoElegido = periodo && periodo.slice(0, 7) !== mesFecha ? periodo : '';
  const opcionesPeriodo = [sumarMeses(mesFecha, -1), sumarMeses(mesFecha, 1)].map((m) => `${m}-01`);
  if (periodoElegido && !opcionesPeriodo.includes(periodoElegido)) opcionesPeriodo.push(periodoElegido);
  opcionesPeriodo.sort();
  const metodos = metodo && !METODOS_GASTO.includes(metodo) ? [...METODOS_GASTO, metodo] : METODOS_GASTO;

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    const m = aNumero(monto);
    const c = concepto.trim();
    if (!categoriaId) throw new Error('Elige una categoría.');
    if (!c) throw new Error('Escribe el concepto, por ejemplo «Recibo de luz CFE».');
    if (m === null || m <= 0) throw new Error('Escribe un monto mayor a cero.');
    if (!fechaValida) throw new Error('Elige la fecha en que se pagó.');
    const enlace = textoONulo(comprobante);
    if (enlace && !urlSegura(enlace)) throw new Error('El comprobante debe ser un enlace que empiece con https://');
    const p = periodoElegido || undefined;
    await api.admin.guardarGasto({
      id: gasto?.id,
      categoria_id: categoriaId,
      concepto: c,
      monto: Math.round(m * 100) / 100,
      fecha,
      periodo: p,
      metodo_pago: metodo || null,
      proveedor: textoONulo(proveedor),
      comprobante_url: enlace,
      recurrente_id: recurrenteId,
      notas: textoONulo(notas),
    });
    return { c, m };
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = await ejecutar();
    if (!r) return;
    let mensaje: string;
    if (editando) mensaje = `Cambios guardados en «${r.c}».`;
    else if (fijo) mensaje = `Pago de «${r.c}» registrado por ${dineroCentavos(r.m)}. Su próximo vencimiento avanzó ${AVANCE_FRECUENCIA[fijo.frecuencia]}.`;
    else mensaje = `Gasto registrado: «${r.c}» por ${dineroCentavos(r.m)}.`;
    onListo({ mensaje, fecha });
  };

  const titulo = editando ? 'Editar gasto' : fijo ? 'Registrar pago de gasto fijo' : 'Registrar gasto';

  return (
    <Modal
      titulo={titulo}
      onCerrar={onCerrar}
      bloqueado={enviando}
      ancho="amplio"
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="gas-form-gasto" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : editando ? 'Guardar cambios' : fijo ? 'Registrar pago' : 'Registrar gasto'}
          </button>
        </>
      }
    >
      <form id="gas-form-gasto" onSubmit={enviar} noValidate>
        {fijo && !editando && (
          <div className="aviso aviso-info">
            <span>
              Este pago queda ligado al gasto fijo <strong>«{fijo.concepto}»</strong> ({ETIQUETA_FRECUENCIA[fijo.frecuencia].toLowerCase()}). Al guardarlo, su
              próximo vencimiento
              {fijo.proximo_vencimiento ? ` (${fechaCorta(fijo.proximo_vencimiento)})` : ''} avanza {AVANCE_FRECUENCIA[fijo.frecuencia]}.
              {fijo.monto_estimado === null ? ' Escribe el monto que dice el recibo.' : ' Ajusta el monto si el recibo trae otra cifra.'}
            </span>
          </div>
        )}
        {editando && gasto?.recurrente_id && (
          <p className="ayuda gas-form-nota">Este gasto es el pago de un gasto fijo. Editarlo no cambia el próximo vencimiento.</p>
        )}

        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="gas-categoria">
              Categoría
            </label>
            <select id="gas-categoria" className="input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
              <option value="" disabled>
                Elige una categoría
              </option>
              {fijas.length > 0 && (
                <optgroup label="Gastos fijos">
                  {fijas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </optgroup>
              )}
              {variables.length > 0 && (
                <optgroup label="Gastos variables">
                  {variables.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="gas-concepto">
              Concepto
            </label>
            <input
              id="gas-concepto"
              className="input"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej. Recibo de luz CFE ago–sep"
              maxLength={160}
              required
            />
          </div>
        </div>

        <div className="adm-form-3">
          <div className="campo">
            <label className="etiqueta" htmlFor="gas-monto">
              Monto
            </label>
            <input
              id="gas-monto"
              className="input num"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              required
              data-autofoco={fijo && !editando ? '' : undefined}
            />
            {fijo && fijo.monto_estimado !== null && !editando && <span className="ayuda">Estimado: {dineroCentavos(fijo.monto_estimado)}.</span>}
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="gas-fecha">
              Fecha de pago
            </label>
            <input id="gas-fecha" type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="gas-metodo">
              Método de pago
            </label>
            <select id="gas-metodo" className="input" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago | '')}>
              <option value="">Sin especificar</option>
              {metodos.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_METODO_PAGO[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="gas-proveedor">
              Proveedor <span className="texto-3">(opcional)</span>
            </label>
            <input
              id="gas-proveedor"
              className="input"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              placeholder="Ej. CFE, Telmex, administración del edificio"
              maxLength={120}
            />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="gas-periodo">
              Cuenta en los resultados de
            </label>
            <select id="gas-periodo" className="input" value={periodoElegido} onChange={(e) => setPeriodo(e.target.value)}>
              <option value="">{fechaValida ? `${nombreDeMes(mesFecha)} (mes de la fecha)` : 'El mes de la fecha'}</option>
              {opcionesPeriodo.map((p) => (
                <option key={p} value={p}>
                  {nombreDeMes(p.slice(0, 7))}
                </option>
              ))}
            </select>
            <span className="ayuda">Normalmente es el mes en que pagas. Cámbialo si, por ejemplo, pagas la renta de noviembre el 30 de octubre.</span>
          </div>
        </div>

        <div className="campo">
          <label className="etiqueta" htmlFor="gas-comprobante">
            Enlace al comprobante <span className="texto-3">(opcional)</span>
          </label>
          <input
            id="gas-comprobante"
            type="url"
            inputMode="url"
            className="input"
            value={comprobante}
            onChange={(e) => setComprobante(e.target.value)}
            placeholder="https://…"
            aria-invalid={comprobante.trim() !== '' && !urlSegura(comprobante) ? true : undefined}
          />
          <span className="ayuda">Pega el enlace a la foto o al PDF del recibo o la factura (por ejemplo, de tu Google Drive).</span>
        </div>

        <div className="campo">
          <label className="etiqueta" htmlFor="gas-notas">
            Notas <span className="texto-3">(opcional)</span>
          </label>
          <textarea id="gas-notas" className="input gas-notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={500} />
        </div>

        <MensajeError error={error} />
      </form>
    </Modal>
  );
}
