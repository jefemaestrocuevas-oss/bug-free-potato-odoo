// Registrar un pago de una cita o de un pedido (con propina aparte para citas).
import { useState, type FormEvent } from 'react';
import { api, type MetodoPago } from '../../lib/api';
import { dinero, ETIQUETA_METODO_PAGO } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { Modal } from './Modal';
import { Casilla } from './Piezas';
import { aNumero, textoONulo } from './util';

const centavos = (n: number) => Math.round(n * 100) / 100;

const METODOS = Object.keys(ETIQUETA_METODO_PAGO) as MetodoPago[];

interface Props {
  destino: { tipo: 'cita' | 'pedido'; id: string; descripcion: string };
  total: number;
  pagado: number;
  metodoSugerido?: MetodoPago | null;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}

export function RegistrarPago({ destino, total, pagado, metodoSugerido, onCerrar, onListo }: Props) {
  const saldo = Math.max(0, centavos(total - pagado));
  const [monto, setMonto] = useState(saldo > 0 ? String(saldo) : '');
  const [metodo, setMetodo] = useState<MetodoPago>(metodoSugerido ?? 'efectivo');
  const [referencia, setReferencia] = useState('');
  const [propina, setPropina] = useState('');
  const [confirmaExceso, setConfirmaExceso] = useState(false);

  // Más que el saldo (sólo si el total ya tiene precio): un cero de más infla los ingresos del mes.
  const montoNum = aNumero(monto);
  const exceso = total > 0 && montoNum !== null && montoNum > 0 ? centavos(montoNum - saldo) : 0;
  const hayExceso = exceso > 0.005;
  const puedePasarAPropina = hayExceso && destino.tipo === 'cita' && saldo > 0;

  const cambiarMonto = (v: string) => {
    setMonto(v);
    setConfirmaExceso(false);
  };
  const pasarAPropina = () => {
    setMonto(String(saldo));
    setPropina(String(centavos((aNumero(propina) ?? 0) + exceso)));
    setConfirmaExceso(false);
  };

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    const m = aNumero(monto);
    const p = aNumero(propina) ?? 0;
    if (m === null || m <= 0) throw new Error('Escribe un monto mayor a cero.');
    if (p < 0) throw new Error('La propina no puede ser negativa.');
    if (hayExceso && !confirmaExceso)
      throw new Error(
        `El monto es ${dinero(exceso)} mayor que el saldo. Corrígelo${puedePasarAPropina ? ', pasa la diferencia a propina' : ''} o confirma que de verdad lo recibiste.`,
      );
    await api.admin.registrarPago({
      monto: m,
      metodo,
      cita_id: destino.tipo === 'cita' ? destino.id : null,
      pedido_id: destino.tipo === 'pedido' ? destino.id : null,
      referencia: textoONulo(referencia),
      propina: destino.tipo === 'cita' ? p : 0,
    });
    return { m, p };
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = await ejecutar();
    if (!r) return;
    const cubre = pagado + r.m >= total - 0.005;
    let mensaje = `Pago de ${dinero(r.m)} registrado${hayExceso ? ` (${dinero(exceso)} más que el saldo)` : ''}.`;
    if (r.p > 0) mensaje += ` Propina de ${dinero(r.p)} registrada aparte.`;
    if (destino.tipo === 'pedido' && cubre) mensaje += ' El pedido quedó pagado y sus servicios ya están disponibles como créditos de la clienta.';
    onListo(mensaje);
  };

  const pideReferencia = metodo === 'transferencia' || metodo === 'tarjeta' || metodo === 'mercado_pago';

  return (
    <Modal
      titulo="Registrar pago"
      onCerrar={onCerrar}
      bloqueado={enviando}
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="form-pago" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Registrar pago'}
          </button>
        </>
      }
    >
      <form id="form-pago" onSubmit={enviar} className="pila">
        <p className="texto-2 adm-sin-margen">{destino.descripcion}</p>
        <dl className="adm-totales">
          <div>
            <dt>Total</dt>
            <dd className="num">{dinero(total, 'Por confirmar')}</dd>
          </div>
          <div>
            <dt>Pagado</dt>
            <dd className="num">{dinero(pagado)}</dd>
          </div>
          <div>
            <dt>Saldo</dt>
            <dd className="num">
              <strong>{dinero(saldo)}</strong>
            </dd>
          </div>
        </dl>
        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="pago-monto">
              Monto que recibes
            </label>
            <input
              id="pago-monto"
              className="input num"
              inputMode="decimal"
              value={monto}
              onChange={(e) => cambiarMonto(e.target.value)}
              required
              aria-invalid={hayExceso && !confirmaExceso ? true : undefined}
              aria-describedby={hayExceso ? 'pago-exceso' : undefined}
            />
            {saldo > 0 && <span className="ayuda">Sugerido: el saldo pendiente ({dinero(saldo)}).</span>}
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="pago-metodo">
              Método
            </label>
            <select id="pago-metodo" className="input" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
              {METODOS.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_METODO_PAGO[m]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {hayExceso && montoNum !== null && (
          <div className="aviso aviso-alerta adm-sin-margen" id="pago-exceso">
            <div className="pila">
              <p className="adm-sin-margen">
                <strong>
                  {saldo > 0
                    ? `Es ${dinero(exceso)} más que el saldo (${dinero(saldo)}).`
                    : `${destino.tipo === 'cita' ? 'Esta cita ya está pagada' : 'Este pedido ya está pagado'}: los ${dinero(montoNum)} serían un pago de más.`}
                </strong>{' '}
                Revisa que el monto esté bien escrito: lo que registres aquí cuenta como ingreso del spa.
                {puedePasarAPropina && ' Si la diferencia es propina, pásala a «Propina».'}
              </p>
              {puedePasarAPropina && (
                <div>
                  <button type="button" className="btn btn-secundario btn-sm" onClick={pasarAPropina}>
                    Cobrar {dinero(saldo)} y dejar {dinero(exceso)} de propina
                  </button>
                </div>
              )}
              <Casilla etiqueta={`Sí, recibí ${dinero(montoNum)} como pago`} checked={confirmaExceso} onChange={setConfirmaExceso} />
            </div>
          </div>
        )}
        <div className="campo">
          <label className="etiqueta" htmlFor="pago-ref">
            Referencia {pideReferencia ? '' : '(opcional)'}
          </label>
          <input
            id="pago-ref"
            className="input"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder={pideReferencia ? 'Últimos dígitos, folio o clave de rastreo' : ''}
          />
        </div>
        {destino.tipo === 'cita' && (
          <div className="campo">
            <label className="etiqueta" htmlFor="pago-propina">
              Propina (opcional)
            </label>
            <input id="pago-propina" className="input num" inputMode="decimal" value={propina} onChange={(e) => setPropina(e.target.value)} placeholder="0" />
            <span className="ayuda">La propina es de quien atiende: se guarda aparte y no cuenta como ingreso del spa.</span>
          </div>
        )}
        {destino.tipo === 'pedido' && (
          <p className="aviso aviso-info adm-sin-margen">
            Cuando los pagos cubren el total, el pedido pasa a “Pagado” y el sistema activa automáticamente los créditos de los servicios y paquetes
            (y los códigos de regalo). Los productos se descuentan del inventario.
          </p>
        )}
        <MensajeError error={error} />
      </form>
    </Modal>
  );
}
