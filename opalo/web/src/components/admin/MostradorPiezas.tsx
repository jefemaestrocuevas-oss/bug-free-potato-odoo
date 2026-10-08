// Piezas del Mostrador: elegir clienta (o venta sin registrar) y el ticket de la venta.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MetodoPago } from '../../lib/api';
import { dinero, ETIQUETA_METODO_PAGO, fechaHora, telefonoBonito } from '../../lib/format';
import { Cargando, MensajeError } from '../ui/Estado';
import { FormCliente } from './FormCliente';
import { useBusquedaClientes, type ClienteElegido } from './NuevaCita';
import { nombreCompleto } from './util';

interface PropsClienta {
  clienta: ClienteElegido | null;
  onCambio: (c: ClienteElegido | null) => void;
  /** Hay servicios o paquetes en el carrito: la clienta es obligatoria. */
  obligatoria: boolean;
}

/** Clienta de la venta: «Sin registrar a la clienta» o buscar / dar de alta. */
export function ElegirClienta({ clienta, onCambio, obligatoria }: PropsClienta) {
  const [buscando, setBuscando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const encontrados = useBusquedaClientes(buscando && !clienta ? busqueda : '');

  if (clienta)
    return (
      <div className="entre adm-clienta-elegida mos-clienta">
        <div>
          <strong>{clienta.nombre}</strong>
          {clienta.telefono && <span className="texto-3"> · {telefonoBonito(clienta.telefono)}</span>}
        </div>
        <button
          type="button"
          className="btn btn-texto btn-sm"
          onClick={() => {
            onCambio(null);
            setBuscando(true);
            setBusqueda('');
          }}
        >
          Cambiar<span className="sr-only"> de clienta</span>
        </button>
      </div>
    );

  if (creando)
    return (
      <FormCliente
        inicial={busqueda}
        formId="mos-clienta-nueva"
        conNotas={false}
        onCancelar={() => setCreando(false)}
        onCreada={(id, d) => {
          onCambio({ id, nombre: nombreCompleto(d), telefono: d.telefono });
          setCreando(false);
          setBuscando(false);
        }}
      />
    );

  return (
    <div className="mos-clienta">
      <div className="mos-segmentos" role="radiogroup" aria-label="¿Para quién es la venta?">
        <label className={`mos-segmento ${!buscando ? 'mos-segmento-activo' : ''}`}>
          <input type="radio" name="mos-quien" checked={!buscando} onChange={() => setBuscando(false)} />
          Sin registrar a la clienta
        </label>
        <label className={`mos-segmento ${buscando ? 'mos-segmento-activo' : ''}`}>
          <input type="radio" name="mos-quien" checked={buscando} onChange={() => setBuscando(true)} />
          Elegir clienta
        </label>
      </div>
      {obligatoria && !buscando && (
        <p className="aviso aviso-alerta adm-sin-margen mos-aviso">Para vender servicios prepagados elige a la clienta: se le guardan en su cuenta.</p>
      )}
      {!buscando ? (
        <p className="ayuda adm-sin-margen">Para quien compra jabones o velas y no quiere dejar sus datos. El pedido queda como «Venta de mostrador».</p>
      ) : (
        <>
          <div className="campo adm-sin-margen">
            <label className="etiqueta" htmlFor="mos-buscar-clienta">
              Busca por nombre, teléfono o correo
            </label>
            <input
              id="mos-buscar-clienta"
              className="input"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Ej. Ana o 442 123"
              autoComplete="off"
            />
          </div>
          {encontrados.cargando && <Cargando texto="Buscando…" />}
          <MensajeError error={encontrados.error} />
          {encontrados.datos.length > 0 && (
            <ul className="adm-resultados-busqueda">
              {encontrados.datos.map((c) => (
                <li key={c.id}>
                  <button type="button" className="adm-resultado" onClick={() => onCambio({ id: c.id, nombre: nombreCompleto(c), telefono: c.telefono })}>
                    <strong>{nombreCompleto(c)}</strong>
                    <span className="texto-3 pequeno">
                      {[telefonoBonito(c.telefono), c.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {busqueda.trim().length >= 2 && !encontrados.cargando && encontrados.datos.length === 0 && !encontrados.error && (
            <p className="texto-3 pequeno adm-sin-margen">No encontramos a nadie con “{busqueda.trim()}”.</p>
          )}
          <div>
            <button type="button" className="btn btn-secundario btn-sm" onClick={() => setCreando(true)}>
              + Registrar clienta nueva
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export interface DatosTicket {
  pedido_id: string;
  folio: string;
  total: number;
  fecha: string;
  metodo: MetodoPago;
  propina: number;
  clienta: string | null;
  articulos: { descripcion: string; cantidad: number; precio: number; servicio: boolean }[];
  /** Efectivo: con cuánto pagó (para el cambio). */
  pagaCon: number | null;
  notas: string | null;
}

/** Ticket en pantalla después de cobrar. */
export function Ticket({ t, onNueva }: { t: DatosTicket; onNueva: () => void }) {
  const cortesia = t.metodo === 'cortesia';
  const cambio = t.pagaCon !== null ? Math.round((t.pagaCon - t.total - t.propina) * 100) / 100 : null;
  const conServicios = t.articulos.some((a) => a.servicio);
  const conProductos = t.articulos.some((a) => !a.servicio);
  return (
    <section className="mos-ticket-marco" aria-labelledby="mos-ticket-titulo">
      <div className="mos-ticket" role="status">
        <p className="mos-ticket-marca">Ópalo</p>
        <h2 id="mos-ticket-titulo" className="mos-ticket-titulo">
          {cortesia ? 'Cortesía registrada' : 'Venta registrada'}
        </h2>
        <p className="mos-ticket-folio num">{t.folio}</p>
        <p className="texto-3 pequeno adm-sin-margen mos-capital">{fechaHora(t.fecha)}</p>
        <p className="adm-sin-margen">{t.clienta ?? 'Venta de mostrador'}</p>
        <ul className="mos-ticket-lista">
          {t.articulos.map((a, i) => (
            <li key={`${a.descripcion}-${i}`}>
              <span>
                {a.cantidad} × {a.descripcion}
              </span>
              <span className="num">{dinero(a.cantidad * a.precio)}</span>
            </li>
          ))}
        </ul>
        <dl className="mos-ticket-totales">
          <div className="mos-ticket-total">
            <dt>Total</dt>
            <dd className="num">{dinero(t.total)}</dd>
          </div>
          <div>
            <dt>Método</dt>
            <dd>{ETIQUETA_METODO_PAGO[t.metodo]}</dd>
          </div>
          {t.propina > 0 && (
            <div>
              <dt>Propina (aparte)</dt>
              <dd className="num">{dinero(t.propina)}</dd>
            </div>
          )}
          {t.pagaCon !== null && cambio !== null && cambio >= 0 && (
            <>
              <div>
                <dt>Pagó con</dt>
                <dd className="num">{dinero(t.pagaCon)}</dd>
              </div>
              <div className="mos-ticket-cambio">
                <dt>Cambio</dt>
                <dd className="num">{dinero(cambio)}</dd>
              </div>
            </>
          )}
        </dl>
        {t.notas && <p className="texto-2 pequeno adm-sin-margen">Nota: {t.notas}</p>}
        {cortesia && <p className="aviso aviso-info adm-sin-margen">La cortesía no cuenta como ingreso del spa.</p>}
        <p className="texto-2 pequeno adm-sin-margen">
          {conServicios ? 'Los servicios ya quedaron en la cuenta de la clienta como servicios prepagados. ' : ''}
          {conProductos ? 'Los productos se entregaron en el mostrador y se descontaron del inventario.' : ''}
        </p>
      </div>
      <div className="mos-ticket-acciones">
        <button type="button" className="btn btn-primario mos-boton-grande" onClick={onNueva} autoFocus>
          Nueva venta
        </button>
        <button type="button" className="btn btn-secundario" onClick={() => window.print()}>
          Imprimir ticket
        </button>
        <Link className="btn btn-texto" to={`/admin/pedidos?pedido=${t.pedido_id}`}>
          Ver en pedidos
        </Link>
      </div>
    </section>
  );
}
