// Paso 1: elegir servicios, paquetes (combos) y complementos; usar servicios prepagados.
import { useRef, useState } from 'react';
import type { Catalogo, Credito, Servicio } from '../../lib/api/tipos';
import { dinero, duracion, fechaCorta } from '../../lib/format';
import { PieAsistente } from './Piezas';
import {
  creditoAItem,
  mapaServicios,
  paqueteReservable,
  servicioReservable,
  tieneServicioBase,
  unirConY,
  type ItemElegido,
  type Total,
} from './utilidades';

const MSG_SIN_SERVICIOS = 'Elige al menos un servicio.';
const MSG_COMPLEMENTOS = 'Los complementos se agregan a un servicio; elige al menos un servicio.';

interface Props {
  cat: Catalogo;
  items: ItemElegido[];
  onCambiar: (items: ItemElegido[]) => void;
  creditos: Credito[];
  total: Total;
  duracionMin: number | null;
  onContinuar: () => void;
}

function textoPrecio(precio: number | null): string {
  return precio === null ? 'Precio por confirmar' : dinero(precio);
}

function textoSesion(s: Servicio): string {
  if (s.es_complemento) return 'Se suma a tu sesión';
  return s.duracion_min ? duracion(s.duracion_min) : 'Sesión de 1 h';
}

export function PasoServicios({ cat, items, onCambiar, creditos, total, duracionMin, onContinuar }: Props) {
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const porId = mapaServicios(cat);
  const hayBase = tieneServicioBase(items, cat);

  const elegido = (tipo: 'servicio' | 'paquete', id: string) => items.find((it) => it.tipo === tipo && it.id === id);

  function alternar(tipo: 'servicio' | 'paquete', id: string) {
    setError(null);
    if (elegido(tipo, id)) onCambiar(items.filter((it) => !(it.tipo === tipo && it.id === id)));
    else onCambiar([...items, { tipo, id, credito_id: null }]);
  }

  function usarCredito(c: Credito) {
    const it = creditoAItem(c);
    if (!it) return;
    setError(null);
    const existe = items.some((x) => x.tipo === it.tipo && x.id === it.id);
    onCambiar(existe ? items.map((x) => (x.tipo === it.tipo && x.id === it.id ? { ...x, credito_id: c.id } : x)) : [...items, it]);
  }

  function quitarCredito(c: Credito) {
    onCambiar(items.map((x) => (x.credito_id === c.id ? { ...x, credito_id: null } : x)));
  }

  function continuar() {
    const msg = items.length === 0 ? MSG_SIN_SERVICIOS : !hayBase ? MSG_COMPLEMENTOS : null;
    if (msg) {
      setError(msg);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    onContinuar();
  }

  const categorias = [...cat.categorias].sort((a, b) => a.orden - b.orden);
  const grupos = categorias
    .map((c) => ({
      categoria: c,
      servicios: cat.servicios.filter((s) => s.categoria_id === c.id && servicioReservable(s)).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    }))
    .filter((g) => g.servicios.length > 0);
  const base = grupos
    .map((g) => ({ ...g, servicios: g.servicios.filter((s) => !s.es_complemento) }))
    .filter((g) => g.servicios.length > 0);
  const complementos = grupos.flatMap((g) => g.servicios.filter((s) => s.es_complemento));
  const paquetes = cat.paquetes.filter((p) => paqueteReservable(p, porId)).sort((a, b) => a.orden - b.orden);
  // Los regalos que compraste para alguien más no se ofrecen aquí (salvo que ya decidiste usarlos tú).
  const creditosUsables = creditos.filter(
    (c) => c.vigente && c.restantes > 0 && creditoAItem(c) && (!c.codigo_regalo || items.some((x) => x.credito_id === c.id)),
  );

  const paquetesPorId = new Map(cat.paquetes.map((p) => [p.id, p]));
  const nombresElegidos = items
    .map((it) => (it.tipo === 'servicio' ? porId.get(it.id)?.nombre : paquetesPorId.get(it.id)?.nombre))
    .filter((n): n is string => !!n);

  const cuantos = items.length;
  const resumenMovil =
    cuantos === 0 ? (
      <span className="texto-3">Elige uno o más servicios</span>
    ) : (
      <span>
        <strong>
          {cuantos} {cuantos === 1 ? 'elegido' : 'elegidos'}
        </strong>
        {duracionMin ? ` · ${duracion(duracionMin)}` : ''} · <span className="num">{total.texto}</span>
      </span>
    );

  return (
    <div className="rv-paso-cuerpo">
      <p className="texto-2">
        Elige todo lo que quieras hacerte en esta visita. Te mostramos el tiempo estimado y el total mientras eliges.
      </p>

      {/* En el celular el resumen queda hasta abajo: aquí se ve de inmediato lo que ya está elegido (p. ej. desde ?servicio=). */}
      {nombresElegidos.length > 0 && (
        <p className="rv-elegidos">
          Elegiste: <strong>{unirConY(nombresElegidos)}</strong>
        </p>
      )}

      {items.length > 0 && !hayBase && !error && (
        <p className="aviso aviso-alerta" role="status">
          Los complementos se agregan a un servicio: elige también tu servicio principal.
        </p>
      )}

      {creditosUsables.length > 0 && (
        <fieldset className="rv-grupo rv-grupo-creditos">
          <legend className="rv-grupo-titulo">Tus servicios prepagados</legend>
          <p className="ayuda">Ya los pagaste: al usarlos, no pagas ese servicio en esta cita.</p>
          <ul className="rv-creditos">
            {creditosUsables.map((c) => {
              const enUso = items.some((x) => x.credito_id === c.id);
              return (
                <li key={c.id} className={`rv-credito${enUso ? ' rv-credito-activo' : ''}`}>
                  <div>
                    <strong>{c.nombre}</strong>
                    <span className="ayuda">
                      {c.restantes} {c.restantes === 1 ? 'disponible' : 'disponibles'}
                      {c.vence_en ? ` · vence el ${fechaCorta(c.vence_en)}` : ''}
                    </span>
                  </div>
                  {enUso ? (
                    <button type="button" className="btn btn-texto btn-sm" onClick={() => quitarCredito(c)}>
                      No usar
                    </button>
                  ) : (
                    <button type="button" className="btn btn-secundario btn-sm" onClick={() => usarCredito(c)}>
                      Usar en esta cita
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {paquetes.length > 0 && (
        <fieldset className="rv-grupo">
          <legend className="rv-grupo-titulo">Paquetes</legend>
          <p className="ayuda">Varios servicios en una sola visita.</p>
          <div className="rv-opciones">
            {paquetes.map((p) => {
              const it = elegido('paquete', p.id);
              const incluye = p.items.map((x) => {
                const n = porId.get(x.servicio_id)?.nombre ?? 'Servicio';
                return x.cantidad > 1 ? `${x.cantidad} × ${n}` : n;
              });
              return (
                <label key={p.id} className={`rv-opcion${it ? ' rv-opcion-elegida' : ''}`}>
                  <input type="checkbox" checked={!!it} onChange={() => alternar('paquete', p.id)} />
                  <span className="rv-opcion-cuerpo">
                    <span className="rv-opcion-nombre">{p.nombre}</span>
                    <span className="rv-opcion-detalle">Incluye {unirConY(incluye)}</span>
                  </span>
                  <span className="rv-opcion-precio num">{it?.credito_id ? 'Prepagado' : textoPrecio(p.precio)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {base.map(({ categoria, servicios }) => (
        <fieldset key={categoria.id} className="rv-grupo">
          <legend className="rv-grupo-titulo">{categoria.nombre}</legend>
          {categoria.descripcion && <p className="ayuda">{categoria.descripcion}</p>}
          <div className="rv-opciones">
            {servicios.map((s) => {
              const it = elegido('servicio', s.id);
              return (
                <label key={s.id} className={`rv-opcion${it ? ' rv-opcion-elegida' : ''}`}>
                  <input type="checkbox" checked={!!it} onChange={() => alternar('servicio', s.id)} />
                  <span className="rv-opcion-cuerpo">
                    <span className="rv-opcion-nombre">{s.nombre}</span>
                    {(s.zonas_incluye || s.descripcion) && <span className="rv-opcion-detalle">{s.zonas_incluye || s.descripcion}</span>}
                    <span className="rv-opcion-meta">{textoSesion(s)}</span>
                  </span>
                  <span className="rv-opcion-precio num">{it?.credito_id ? 'Prepagado' : textoPrecio(s.precio)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {complementos.length > 0 && (
        <fieldset className="rv-grupo" aria-describedby="rv-complementos-ayuda">
          <legend className="rv-grupo-titulo">Complementos</legend>
          <p className="ayuda" id="rv-complementos-ayuda">
            {hayBase
              ? 'Se agregan a tu servicio para potenciar el resultado; no suman tiempo a tu cita.'
              : 'Se agregan a un servicio: primero elige tu depilación, facial o corporal.'}
          </p>
          <div className="rv-opciones">
            {complementos.map((s) => {
              const it = elegido('servicio', s.id);
              const bloqueado = !hayBase && !it;
              return (
                <label key={s.id} className={`rv-opcion${it ? ' rv-opcion-elegida' : ''}${bloqueado ? ' rv-opcion-bloqueada' : ''}`}>
                  <input type="checkbox" checked={!!it} disabled={bloqueado} onChange={() => alternar('servicio', s.id)} />
                  <span className="rv-opcion-cuerpo">
                    <span className="rv-opcion-nombre">{s.nombre}</span>
                    {s.descripcion && <span className="rv-opcion-detalle">{s.descripcion}</span>}
                  </span>
                  <span className="rv-opcion-precio num">{it?.credito_id ? 'Prepagado' : textoPrecio(s.precio)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {error && (
        <p className="aviso aviso-error rv-error" role="alert" tabIndex={-1} ref={errorRef} id="rv-error-servicios">
          {error}
        </p>
      )}

      <PieAsistente onContinuar={continuar} textoContinuar="Elegir día y hora" extra={resumenMovil} fijo />
    </div>
  );
}
