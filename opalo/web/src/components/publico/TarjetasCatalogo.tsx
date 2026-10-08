// Piezas del catálogo: fila de servicio (estilo "menú de spa") y tarjeta de paquete.
import { Link } from 'react-router-dom';
import type { Paquete, Servicio } from '../../lib/api/tipos';
import { dinero, duracion } from '../../lib/format';
import { BotonComprar } from './Comprar';
import {
  ahorroPaquete,
  duracionPaquete,
  etiquetaTipoPaquete,
  listaIncluye,
  paqueteReservable,
  paqueteVendible,
  proximamente,
  servicioReservable,
  servicioVendible,
  textoDuracion,
  textoPrimeraVez,
} from './catalogo';
import { IconoCheck } from './Iconos';
import { textoVigencia } from './contacto';
import './componentes.css';

export function InsigniaProximamente() {
  return <span className="insignia-pronto">Próximamente</span>;
}

/** Precio con su versión "por confirmar" honesta. */
export function Precio({ valor, className = '' }: { valor: number | null; className?: string }) {
  if (valor === null) return <span className={`sp-precio sp-precio-pendiente ${className}`}>Precio por confirmar</span>;
  return <span className={`sp-precio num ${className}`}>{dinero(valor)}</span>;
}

export function FilaServicio({ servicio: s, mostrarAcciones = true }: { servicio: Servicio; mostrarAcciones?: boolean }) {
  const pronto = proximamente(s);
  const reservable = servicioReservable(s);
  const vendible = servicioVendible(s);
  const primeraVez = textoPrimeraVez(s);
  return (
    <li className={`fila-servicio ${pronto ? 'es-pronto' : ''}`}>
      <div className="fs-principal">
        <div className="fs-linea">
          <h3 className="fs-nombre">{s.nombre}</h3>
          <span className="fs-puntos" aria-hidden="true" />
          {pronto ? <InsigniaProximamente /> : <Precio valor={s.precio} className="fs-precio" />}
        </div>
        {s.zonas_incluye && (
          <p className="fs-zonas">
            <span className="fs-etiqueta">Incluye:</span> {s.zonas_incluye}
          </p>
        )}
        {s.descripcion && <p className="fs-desc">{s.descripcion}</p>}
        <p className="fs-meta">
          <span>{textoDuracion(s)}</span>
          {primeraVez && <span>{primeraVez}</span>}
          {!pronto && s.precio === null && <span>Se paga en cabina</span>}
          {!pronto && !s.reservable_en_linea && <span>Agenda por WhatsApp</span>}
        </p>
      </div>
      {mostrarAcciones && !pronto && (reservable || vendible) && (
        <div className="fs-acciones">
          {reservable && (
            <Link
              className="btn btn-primario btn-sm"
              to={`/reservar?servicio=${encodeURIComponent(s.slug)}`}
              aria-label={s.es_complemento ? `Agregar ${s.nombre} al reservar` : `Reservar ${s.nombre}`}
            >
              {s.es_complemento ? 'Agregar al reservar' : 'Reservar'}
            </Link>
          )}
          {vendible && (
            <BotonComprar
              item={{ tipo: 'servicio', id: s.id, nombre: s.nombre, precio: s.precio as number, detalle: s.es_complemento ? 'Complemento' : textoDuracion(s) }}
            />
          )}
        </div>
      )}
    </li>
  );
}

export function TarjetaPaquete({
  paquete: p,
  porId,
  mostrarAcciones = true,
  sesionMin,
}: {
  paquete: Paquete;
  porId: Map<string, Servicio>;
  mostrarAcciones?: boolean;
  sesionMin?: number;
}) {
  const incluye = listaIncluye(p, porId);
  const ahorro = ahorroPaquete(p, porId);
  const reservable = paqueteReservable(p, porId);
  const vendible = paqueteVendible(p);
  const min = duracionPaquete(p, porId, sesionMin);
  return (
    <article className="tarjeta-paquete">
      <div className="tp-cabeza">
        <span className="tp-tipo">{etiquetaTipoPaquete(p)}</span>
        {ahorro && <span className="tp-ahorro">Ahorras {dinero(ahorro.ahorro)}</span>}
      </div>
      <h3 className="tp-nombre">{p.nombre}</h3>
      {p.descripcion && <p className="tp-desc">{p.descripcion}</p>}
      <p className="tp-incluye-titulo">Incluye</p>
      <ul className="tp-incluye">
        {incluye.map((t, i) => (
          <li key={i}>
            <IconoCheck tam={16} />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <div className="tp-pie">
        <div className="tp-precios">
          <Precio valor={p.precio} className="tp-precio" />
          {ahorro && (
            <span className="tp-separado">
              Por separado suman <s>{dinero(ahorro.separado)}</s>
            </span>
          )}
          <span className="tp-meta">
            {p.tipo === 'combo' ? `Una visita · ${duracion(min)}` : `Sesiones de ${duracion(sesionMin ?? 60)}`}
            {p.vigencia_dias ? ` · Vigencia ${textoVigencia(p.vigencia_dias)}` : ''}
          </span>
        </div>
        {mostrarAcciones && (
          <div className="tp-acciones">
            {reservable ? (
              <Link className="btn btn-primario btn-sm" to={`/reservar?paquete=${encodeURIComponent(p.slug)}`} aria-label={`Reservar ${p.nombre}`}>
                Reservar
              </Link>
            ) : (
              <InsigniaProximamente />
            )}
            {vendible && (
              <BotonComprar item={{ tipo: 'paquete', id: p.id, nombre: p.nombre, precio: p.precio as number, detalle: etiquetaTipoPaquete(p) }} />
            )}
          </div>
        )}
      </div>
    </article>
  );
}
