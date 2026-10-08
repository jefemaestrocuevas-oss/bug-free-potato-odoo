// Alta y edición de un gasto fijo (recurrente): renta, cuota de mantenimiento, luz CFE, agua, internet…
// Aquí sólo se lleva el calendario; el gasto se registra al pagarlo desde "Por pagar".
import { useState, type FormEvent } from 'react';
import { api, type CategoriaGasto, type FrecuenciaGasto, type GastoRecurrente } from '../../lib/api';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { Modal } from './Modal';
import { Casilla } from './Piezas';
import { aNumero, aTexto, ETIQUETA_FRECUENCIA, textoONulo } from './util';

const FRECUENCIAS = Object.keys(ETIQUETA_FRECUENCIA) as FrecuenciaGasto[];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Props {
  categorias: CategoriaGasto[];
  /** Gasto fijo a editar; sin él, es uno nuevo. */
  fijo?: GastoRecurrente | null;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}

export function GastosFormFijo({ categorias, fijo, onCerrar, onListo }: Props) {
  const editando = !!fijo;
  const [concepto, setConcepto] = useState(fijo?.concepto ?? '');
  const [categoriaId, setCategoriaId] = useState(fijo?.categoria_id ?? '');
  const [monto, setMonto] = useState(aTexto(fijo?.monto_estimado));
  const [frecuencia, setFrecuencia] = useState<FrecuenciaGasto>(fijo?.frecuencia ?? 'mensual');
  const [dia, setDia] = useState(fijo ? String(fijo.dia_pago) : '');
  const [proximo, setProximo] = useState(fijo?.proximo_vencimiento ?? '');
  const [activo, setActivo] = useState(fijo?.activo ?? true);
  const [notas, setNotas] = useState(fijo?.notas ?? '');

  const fijas = categorias.filter((c) => c.es_fijo);
  const variables = categorias.filter((c) => !c.es_fijo);

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    const c = concepto.trim();
    const d = aNumero(dia);
    const m = aNumero(monto);
    if (!c) throw new Error('Escribe el concepto, por ejemplo «Renta del local».');
    if (!categoriaId) throw new Error('Elige una categoría.');
    if (monto.trim() && (m === null || m < 0)) throw new Error('El monto estimado debe ser un número (o déjalo vacío si cambia cada vez).');
    if (d === null || !Number.isInteger(d) || d < 1 || d > 31) throw new Error('El día de pago va del 1 al 31.');
    if (proximo && !FECHA_RE.test(proximo)) throw new Error('Revisa la fecha del próximo vencimiento.');
    await api.admin.guardarGastoRecurrente({
      id: fijo?.id,
      categoria_id: categoriaId,
      concepto: c,
      monto_estimado: m === null ? null : Math.round(m * 100) / 100,
      frecuencia,
      dia_pago: d,
      proximo_vencimiento: proximo || null,
      activo,
      notas: textoONulo(notas),
    });
    return c;
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const c = await ejecutar();
    if (!c) return;
    onListo(editando ? `Cambios guardados en el gasto fijo «${c}».` : `Gasto fijo «${c}» agregado. Ya aparece en «Por pagar».`);
  };

  return (
    <Modal
      titulo={editando ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
      onCerrar={onCerrar}
      bloqueado={enviando}
      ancho="amplio"
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="gas-form-fijo" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar gasto fijo'}
          </button>
        </>
      }
    >
      <form id="gas-form-fijo" onSubmit={enviar} noValidate>
        {!editando && (
          <p className="texto-2 gas-form-intro">
            Son los pagos que se repiten: la renta, la cuota de mantenimiento del edificio, la luz de CFE (llega cada dos meses), el agua, el internet. Aquí
            sólo llevas su calendario; cada pago se registra desde «Por pagar» y entonces su fecha avanza sola.
          </p>
        )}

        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="gas-fijo-concepto">
              Concepto
            </label>
            <input
              id="gas-fijo-concepto"
              className="input"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej. Renta del local"
              maxLength={160}
              required
            />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="gas-fijo-categoria">
              Categoría
            </label>
            <select id="gas-fijo-categoria" className="input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
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
        </div>

        <div className="adm-form-3">
          <div className="campo">
            <label className="etiqueta" htmlFor="gas-fijo-monto">
              Monto estimado
            </label>
            <input
              id="gas-fijo-monto"
              className="input num"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="Varía"
            />
            <span className="ayuda">Opcional. Déjalo vacío si cambia cada vez, como la luz o el agua.</span>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="gas-fijo-frecuencia">
              Frecuencia
            </label>
            <select id="gas-fijo-frecuencia" className="input" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaGasto)}>
              {FRECUENCIAS.map((f) => (
                <option key={f} value={f}>
                  {ETIQUETA_FRECUENCIA[f]}
                </option>
              ))}
            </select>
            <span className="ayuda">El recibo de luz de CFE suele ser bimestral; la renta y el internet, mensuales.</span>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="gas-fijo-dia">
              Día de pago
            </label>
            <input
              id="gas-fijo-dia"
              type="number"
              className="input num"
              inputMode="numeric"
              min={1}
              max={31}
              step={1}
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              placeholder="1 a 31"
              required
            />
            <span className="ayuda">Si el mes es más corto, vence su último día.</span>
          </div>
        </div>

        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="gas-fijo-proximo">
              Próximo vencimiento {!editando && <span className="texto-3">(opcional)</span>}
            </label>
            <input id="gas-fijo-proximo" type="date" className="input" value={proximo} onChange={(e) => setProximo(e.target.value)} />
            <span className="ayuda">
              {editando
                ? 'Avanza solo cada vez que registras un pago. Si lo dejas vacío, aparecerá sin fecha en «Por pagar».'
                : 'Si lo dejas vacío, se calcula con el día de pago (este mes o el siguiente).'}
            </span>
          </div>
          <div className="campo">
            <span className="etiqueta">Estado</span>
            <Casilla
              etiqueta="Activo"
              checked={activo}
              onChange={setActivo}
              ayuda="Si lo pausas (por ejemplo, porque cambiaste de proveedor de internet), deja de aparecer en «Por pagar». Sus pagos anteriores se conservan."
            />
          </div>
        </div>

        <div className="campo">
          <label className="etiqueta" htmlFor="gas-fijo-notas">
            Notas <span className="texto-3">(opcional)</span>
          </label>
          <textarea
            id="gas-fijo-notas"
            className="input gas-notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ej. número de servicio, a quién se le transfiere, cuenta CLABE"
          />
        </div>

        <MensajeError error={error} />
      </form>
    </Modal>
  );
}
