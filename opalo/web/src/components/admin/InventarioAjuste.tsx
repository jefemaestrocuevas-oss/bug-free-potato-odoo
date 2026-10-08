// Ajuste de inventario (conteo físico, corrección) o merma (se cayó, caducó, se echó a perder).
import { useState, type FormEvent } from 'react';
import { api, type Producto } from '../../lib/api';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { Modal } from './Modal';
import { EntradaConUnidad, cantidadConSigno, equivalencia, pesos } from './InventarioPiezas';
import { aNumero, cantidadConUnidad, textoONulo } from './util';

type Tipo = 'ajuste' | 'merma';
type Forma = 'sumar' | 'restar' | 'conteo';

const TIPOS: { id: Tipo; texto: string; ayuda: string }[] = [
  { id: 'ajuste', texto: 'Ajuste', ayuda: 'Corriges el stock: conteo físico, un error de captura, algo que ya tenías.' },
  { id: 'merma', texto: 'Merma', ayuda: 'Se perdió producto: se cayó, caducó o se echó a perder. Siempre resta.' },
];

const FORMAS: { id: Forma; texto: string }[] = [
  { id: 'conteo', texto: 'Ya conté lo que hay' },
  { id: 'sumar', texto: 'Sumar (+)' },
  { id: 'restar', texto: 'Restar (−)' },
];

export function InventarioAjuste({ producto, onCerrar, onListo }: { producto: Producto; onCerrar: () => void; onListo: (mensaje: string) => void }) {
  const u = producto.unidad_medida;
  const [tipo, setTipo] = useState<Tipo>('ajuste');
  const [forma, setForma] = useState<Forma>('conteo');
  const [valor, setValor] = useState('');
  const [nota, setNota] = useState('');

  const n = aNumero(valor);
  // Cantidad con signo que se enviará (null si aún no es válida).
  let cantidad: number | null = null;
  if (n !== null && n >= 0) {
    if (tipo === 'merma') cantidad = n > 0 ? -n : null;
    else if (forma === 'conteo') cantidad = Math.round((n - producto.stock_actual) * 1000) / 1000;
    else if (n > 0) cantidad = forma === 'sumar' ? n : -n;
  }
  const queda = cantidad !== null ? Math.round((producto.stock_actual + cantidad) * 1000) / 1000 : null;

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    if (n === null || n < 0) throw new Error(`Escribe una cantidad en ${u}.`);
    if (cantidad === null || cantidad === 0) {
      throw new Error(tipo === 'ajuste' && forma === 'conteo' ? 'El conteo coincide con el stock: no hay nada que ajustar.' : 'La cantidad debe ser mayor a cero.');
    }
    const notaFinal = textoONulo(nota) ?? (tipo === 'ajuste' && forma === 'conteo' ? `Conteo físico: ${cantidadConUnidad(n, u, 3)}` : null);
    await api.admin.ajustarInventario(producto.id, cantidad, tipo, notaFinal);
    return cantidad;
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const c = await ejecutar();
    if (c === undefined) return;
    const que = tipo === 'merma' ? 'Merma registrada' : 'Ajuste registrado';
    onListo(`${que}: ${producto.nombre} ${cantidadConSigno(c, u)}. Ahora hay ${cantidadConUnidad(producto.stock_actual + c, u, 3)}.`);
  };

  const valorPerdido = tipo === 'merma' && cantidad !== null ? Math.abs(cantidad) * producto.costo_unitario : null;

  return (
    <Modal
      titulo="Ajuste o merma"
      onCerrar={onCerrar}
      bloqueado={enviando}
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="inv-form-ajuste" className={`btn ${tipo === 'merma' ? 'btn-peligro' : 'btn-primario'}`} disabled={enviando}>
            {enviando ? 'Guardando…' : tipo === 'merma' ? 'Registrar merma' : 'Registrar ajuste'}
          </button>
        </>
      }
    >
      <form id="inv-form-ajuste" onSubmit={enviar} noValidate>
        <p className="adm-sin-margen">
          <strong>{producto.nombre}</strong>
          {producto.marca ? <span className="texto-3"> · {producto.marca}</span> : null}
        </p>
        <p className="texto-2 num">
          Hay {cantidadConUnidad(producto.stock_actual, u, 3)}
          {equivalencia(producto.stock_actual, producto) ? <span className="texto-3"> ({equivalencia(producto.stock_actual, producto)})</span> : null}
        </p>

        <fieldset className="inv-grupo-radio">
          <legend className="etiqueta">¿Qué vas a registrar?</legend>
          <div className="inv-opciones">
            {TIPOS.map((t) => (
              <label key={t.id} className={`inv-opcion ${tipo === t.id ? 'inv-opcion-activa' : ''}`}>
                <input type="radio" name="ajuste-tipo" value={t.id} checked={tipo === t.id} onChange={() => setTipo(t.id)} />
                <span>
                  <strong>{t.texto}</strong>
                  <span className="ayuda adm-bloque-ayuda">{t.ayuda}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {tipo === 'ajuste' && (
          <div className="adm-chips" role="radiogroup" aria-label="Forma del ajuste">
            {FORMAS.map((f) => (
              <label key={f.id} className={`adm-chip ${forma === f.id ? 'adm-chip-activo' : ''}`}>
                <input type="radio" name="ajuste-forma" value={f.id} checked={forma === f.id} onChange={() => setForma(f.id)} />
                {f.texto}
              </label>
            ))}
          </div>
        )}

        <div className="campo">
          <label className="etiqueta" htmlFor="ajuste-cantidad">
            {tipo === 'merma' ? `¿Cuánto se perdió? (en ${u})` : forma === 'conteo' ? `¿Cuánto hay en realidad? (en ${u})` : `Cantidad (en ${u})`}
          </label>
          <EntradaConUnidad id="ajuste-cantidad" valor={valor} onCambio={setValor} unidad={u} requerido descrita="ajuste-resultado" />
          <p className="inv-calculo adm-sin-margen" id="ajuste-resultado" aria-live="polite">
            {cantidad !== null && queda !== null ? (
              cantidad === 0 ? (
                <span className="texto-3">Coincide con el stock: no hay nada que ajustar.</span>
              ) : (
                <>
                  Movimiento: <strong className="num">{cantidadConSigno(cantidad, u)}</strong> · Quedará en{' '}
                  <strong className={`num ${queda < 0 ? 'adm-texto-peligro' : ''}`}>{cantidadConUnidad(queda, u, 3)}</strong>
                  {valorPerdido !== null && valorPerdido > 0 && <span className="texto-3"> · Valor aproximado: {pesos(valorPerdido)}</span>}
                  {queda < 0 && <span className="adm-bloque-ayuda adm-texto-peligro">El stock quedaría en negativo: revisa la cantidad.</span>}
                </>
              )
            ) : (
              <span className="texto-3">
                {tipo === 'merma' ? 'La merma siempre resta del stock.' : forma === 'conteo' ? 'Calculamos la diferencia contra el stock del sistema.' : 'Escribe la cantidad.'}
              </span>
            )}
          </p>
        </div>

        <div className="campo">
          <label className="etiqueta" htmlFor="ajuste-nota">
            Nota (opcional)
          </label>
          <input
            id="ajuste-nota"
            className="input"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder={tipo === 'merma' ? 'Se cayó la lata, caducó…' : 'Conteo del viernes, error de captura…'}
          />
        </div>
        <p className="ayuda adm-sin-margen">Los movimientos no se borran: si te equivocas, registra otro ajuste que lo corrija.</p>
        <MensajeError error={error} />
      </form>
    </Modal>
  );
}
