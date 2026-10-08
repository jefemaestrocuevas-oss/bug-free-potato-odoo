// Piezas pequeñas reutilizadas en todo el panel interno.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { EstadoCita, EstadoPedido } from '../../lib/api';
import { ETIQUETA_ESTADO_CITA, ETIQUETA_ESTADO_PEDIDO } from '../../lib/format';

/** Título de página con descripción breve y acciones a la derecha. */
export function EncabezadoAdmin({
  titulo,
  descripcion,
  children,
  volver,
}: {
  titulo: string;
  descripcion?: ReactNode;
  children?: ReactNode;
  volver?: { to: string; texto: string };
}) {
  return (
    <header className="adm-encabezado">
      <div className="adm-encabezado-texto">
        {volver && (
          <Link className="adm-volver" to={volver.to}>
            ← {volver.texto}
          </Link>
        )}
        <h1 className="adm-titulo">{titulo}</h1>
        {descripcion && <p className="adm-descripcion">{descripcion}</p>}
      </div>
      {children && <div className="adm-encabezado-acciones">{children}</div>}
    </header>
  );
}

const CLASE_CITA: Record<EstadoCita, string> = {
  pendiente: 'pill-alerta',
  confirmada: 'pill-verde',
  en_curso: 'pill-info',
  completada: 'pill-exito',
  cancelada: 'pill-gris',
  no_asistio: 'pill-error',
};

export function PillEstadoCita({ estado }: { estado: EstadoCita }) {
  return <span className={`pill ${CLASE_CITA[estado]}`}>{ETIQUETA_ESTADO_CITA[estado] ?? estado}</span>;
}

const CLASE_PEDIDO: Record<EstadoPedido, string> = {
  pendiente_pago: 'pill-alerta',
  pagado: 'pill-exito',
  cancelado: 'pill-gris',
  reembolsado: 'pill-info',
};

export function PillEstadoPedido({ estado }: { estado: EstadoPedido }) {
  return <span className={`pill ${CLASE_PEDIDO[estado]}`}>{ETIQUETA_ESTADO_PEDIDO[estado] ?? estado}</span>;
}

/** Consentimiento firmado (sí/no). La firma siempre se hace en la tablet de cabina (ESPEC §9). */
export function PillFirma({ firmados }: { firmados: number }) {
  return firmados > 0 ? (
    <span className="pill pill-exito">Firmado</span>
  ) : (
    <span className="pill pill-error" title="Se firma en la tablet de cabina antes del servicio">
      Falta firma
    </span>
  );
}

/** Cifra destacada con etiqueta. */
export function Kpi({ etiqueta, valor, detalle, tono }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; tono?: 'exito' | 'error' | 'alerta' }) {
  return (
    <div className={`adm-kpi ${tono ? `adm-kpi-${tono}` : ''}`}>
      <span className="adm-kpi-etiqueta">{etiqueta}</span>
      <span className="adm-kpi-valor">{valor}</span>
      {detalle && <span className="adm-kpi-detalle">{detalle}</span>}
    </div>
  );
}

/** Tarjeta de sección con título y enlace a la sección completa. */
export function Bloque({
  titulo,
  enlace,
  children,
  extra,
  id,
}: {
  titulo: string;
  enlace?: { to: string; texto: string };
  children: ReactNode;
  extra?: ReactNode;
  id?: string;
}) {
  return (
    <section className="tarjeta-plana adm-bloque" aria-labelledby={id}>
      <div className="adm-bloque-cabeza">
        <h2 className="adm-bloque-titulo" id={id}>
          {titulo}
        </h2>
        {extra}
        {enlace && (
          <Link className="btn btn-texto btn-sm" to={enlace.to}>
            {enlace.texto} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Casilla con texto. */
export function Casilla({
  etiqueta,
  checked,
  onChange,
  ayuda,
  disabled,
}: {
  etiqueta: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  ayuda?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="check adm-casilla">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span>
        {etiqueta}
        {ayuda && <span className="ayuda adm-bloque-ayuda">{ayuda}</span>}
      </span>
    </label>
  );
}

/** Aviso breve de éxito que se puede cerrar. */
export function Exito({ texto, onCerrar }: { texto: string | null; onCerrar?: () => void }) {
  if (!texto) return null;
  return (
    <div className="aviso aviso-exito" role="status">
      <span>{texto}</span>
      {onCerrar && (
        <button type="button" className="btn btn-texto btn-sm" onClick={onCerrar}>
          Entendido
        </button>
      )}
    </div>
  );
}
