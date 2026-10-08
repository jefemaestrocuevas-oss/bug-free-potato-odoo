// Alta y edición de un paquete (combo = una visita · bono = varias visitas) con sus servicios.
import { useRef, useState, type FormEvent } from 'react';
import { api, type Categoria, type Paquete, type PaqueteEditable, type Servicio, type TipoPaquete } from '../../lib/api';
import { dinero } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { IconoCerrar, IconoMas } from './Iconos';
import { Modal } from './Modal';
import { Casilla } from './Piezas';
import { CatalogoEntrada, enteroDe, slugDe, sumaPorSeparado } from './CatalogoPiezas';
import { ETIQUETA_ETAPA, aNumero, aTexto, textoONulo } from './util';

interface Linea {
  k: number;
  servicio_id: string;
  cantidad: string;
}

const TIPOS: { id: TipoPaquete; titulo: string; texto: string }[] = [
  { id: 'combo', titulo: 'Combo · una visita', texto: 'Varios servicios juntos en una sola cita.' },
  { id: 'bono', titulo: 'Bono · varias visitas', texto: 'Varias sesiones (por ejemplo, 5 de axila) para usar en distintas citas.' },
];

interface Props {
  /** null = paquete nuevo */
  paquete: Paquete | null;
  servicios: Servicio[];
  categorias: Categoria[];
  slugsUsados: Map<string, string>;
  vigenciaEstandar: number | null;
  onCerrar: () => void;
  onGuardado: (nombre: string, nuevo: boolean) => void;
}

export function CatalogoFormPaquete({ paquete, servicios, categorias, slugsUsados, vigenciaEstandar, onCerrar, onGuardado }: Props) {
  const p = paquete;
  const sig = useRef(1);
  const nueva = (servicio_id = '', cantidad = '1'): Linea => ({ k: sig.current++, servicio_id, cantidad });
  const [nombre, setNombre] = useState(p?.nombre ?? '');
  const [slug, setSlug] = useState('');
  const [tipo, setTipo] = useState<TipoPaquete>(p?.tipo ?? 'combo');
  const [descripcion, setDescripcion] = useState(p?.descripcion ?? '');
  const [lineas, setLineas] = useState<Linea[]>(() => (p && p.items.length ? p.items.map((it) => nueva(it.servicio_id, String(it.cantidad))) : [nueva()]));
  const [precio, setPrecio] = useState(aTexto(p?.precio));
  const [dur, setDur] = useState(aTexto(p?.duracion_min));
  const [vigencia, setVigencia] = useState(aTexto(p?.vigencia_dias));
  const [activo, setActivo] = useState(p?.activo ?? true);
  const [orden, setOrden] = useState(aTexto(p?.orden ?? 0));
  const [intentado, setIntentado] = useState(false);

  const porId = new Map(servicios.map((s) => [s.id, s]));
  const slugFinal = p ? p.slug : slugDe(slug || nombre);
  const slugOcupado = !p && !!slugFinal && slugsUsados.has(slugFinal);
  const nPrecio = aNumero(precio);
  const precioInvalido = precio.trim() !== '' && (nPrecio === null || nPrecio < 0);
  const nDur = enteroDe(dur);
  const nVigencia = enteroDe(vigencia, 1);
  const nOrden = orden.trim() === '' ? 0 : Number(orden);

  const items = lineas
    .filter((l) => l.servicio_id)
    .map((l) => ({ servicio_id: l.servicio_id, cantidad: enteroDe(l.cantidad, 1) }))
    .filter((it): it is { servicio_id: string; cantidad: number } => typeof it.cantidad === 'number' && !Number.isNaN(it.cantidad));
  const repetidos = new Set(lineas.map((l) => l.servicio_id).filter((id, i, arr) => id && arr.indexOf(id) !== i));
  const cantidadMala = (l: Linea) => {
    const n = enteroDe(l.cantidad, 1);
    return n === null || Number.isNaN(n);
  };

  const errores = {
    nombre: !nombre.trim() ? 'Escribe el nombre del paquete.' : null,
    slug: !p && !slugFinal ? 'El identificador necesita al menos una letra o número.' : slugOcupado ? `Ya hay otro registro con el identificador «${slugFinal}»: ${slugsUsados.get(slugFinal)}. Escribe otro.` : null,
    items: !lineas.some((l) => l.servicio_id) ? 'Agrega al menos un servicio al paquete.' : null,
    lineasVacias: lineas.some((l) => !l.servicio_id) && lineas.some((l) => l.servicio_id) ? 'Hay una línea sin servicio: elige uno o quítala.' : null,
    repetidos: repetidos.size ? 'Un servicio aparece dos veces: deja una sola línea y sube la cantidad.' : null,
    cantidades: lineas.some((l) => l.servicio_id && cantidadMala(l)) ? 'Cada cantidad debe ser un número entero de 1 en adelante.' : null,
    precio: precioInvalido ? 'Revisa el precio: un número mayor o igual a cero, o vacío si está por confirmar.' : null,
    dur: Number.isNaN(nDur) ? 'La duración va en minutos enteros (o vacía).' : null,
    vigencia: Number.isNaN(nVigencia) ? 'La vigencia va en días enteros, de 1 en adelante (o vacía).' : null,
    orden: !Number.isInteger(nOrden) ? 'El orden es un número entero.' : null,
  };
  const primerError = Object.values(errores).find(Boolean) ?? null;

  const separado = sumaPorSeparado(items, porId);
  const ahorro = separado !== null && nPrecio !== null && !precioInvalido ? Math.round((separado - nPrecio) * 100) / 100 : null;
  const noReservables = items
    .map((it) => porId.get(it.servicio_id))
    .filter((s): s is Servicio => !!s && (!s.activo || s.etapa !== 'disponible'));

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    if (primerError) throw new Error(primerError);
    const datos: PaqueteEditable = {
      id: p?.id,
      slug: slugFinal,
      nombre: nombre.trim(),
      descripcion: textoONulo(descripcion),
      tipo,
      precio: nPrecio,
      duracion_min: nDur as number | null,
      vigencia_dias: nVigencia as number | null,
      activo,
      orden: nOrden,
      items,
    };
    await api.admin.guardarPaquete(datos);
    return true;
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    setError(null);
    if (await ejecutar()) onGuardado(nombre.trim(), !p);
  };

  const cambiarLinea = (k: number, cambios: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.k === k ? { ...l, ...cambios } : l)));
  const quitarLinea = (k: number) => setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.k !== k) : [nueva()]));

  const grupos = categorias
    .map((c) => ({ c, lista: servicios.filter((s) => s.categoria_id === c.id).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')) }))
    .filter((g) => g.lista.length);
  const sinCategoria = servicios.filter((s) => !categorias.some((c) => c.id === s.categoria_id));

  const etiquetaServicio = (s: Servicio) => {
    const extra = !s.activo ? ' (inactivo)' : s.etapa !== 'disponible' ? ` (${ETIQUETA_ETAPA[s.etapa].toLowerCase()})` : '';
    return `${s.nombre} · ${dinero(s.precio, 'por confirmar')}${extra}`;
  };
  const opcion = (s: Servicio) => (
    <option key={s.id} value={s.id}>
      {etiquetaServicio(s)}
    </option>
  );
  const marca = (k: keyof typeof errores) => (intentado && errores[k] ? true : undefined);

  return (
    <Modal
      titulo={p ? `Editar ${p.nombre}` : 'Nuevo paquete'}
      onCerrar={onCerrar}
      bloqueado={enviando}
      ancho="amplio"
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="cat-form-paquete" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : p ? 'Guardar cambios' : 'Crear paquete'}
          </button>
        </>
      }
    >
      <form id="cat-form-paquete" className="cat-form" onSubmit={enviar} noValidate>
        <div className="campo">
          <label className="etiqueta" htmlFor="paq-nombre">
            Nombre
          </label>
          <input id="paq-nombre" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-invalid={marca('nombre')} placeholder="Paquete Express" />
        </div>

        <div className="campo">
          {p ? (
            <>
              <span className="etiqueta" id="paq-slug-etq">
                Identificador en la dirección web
              </span>
              <p className="cat-slug" aria-labelledby="paq-slug-etq">
                <code>{p.slug}</code>
                <span className="ayuda">No se cambia para no romper enlaces que ya se compartieron.</span>
              </p>
            </>
          ) : (
            <>
              <label className="etiqueta" htmlFor="paq-slug">
                Identificador en la dirección web (opcional)
              </label>
              <input
                id="paq-slug"
                className="input"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={slugDe(nombre) || 'se-genera-del-nombre'}
                aria-invalid={slugOcupado || marca('slug') ? true : undefined}
                aria-describedby="paq-slug-ayuda"
                autoCapitalize="none"
                spellCheck={false}
              />
              <span className="ayuda" id="paq-slug-ayuda">
                {slugFinal ? (
                  <>
                    Quedará como <code>{slugFinal}</code>. Después ya no se puede cambiar.
                  </>
                ) : (
                  'Si lo dejas vacío, se genera del nombre. Después ya no se puede cambiar.'
                )}
              </span>
              {slugOcupado && <span className="cat-error-campo">{errores.slug}</span>}
            </>
          )}
        </div>

        <fieldset className="cat-grupo-radio">
          <legend className="etiqueta">Tipo de paquete</legend>
          <div className="cat-opciones">
            {TIPOS.map((t) => (
              <label key={t.id} className={`cat-opcion ${tipo === t.id ? 'cat-opcion-activa' : ''}`}>
                <input type="radio" name="paq-tipo" value={t.id} checked={tipo === t.id} onChange={() => setTipo(t.id)} />
                <span>
                  <strong>{t.titulo}</strong>
                  <span className="ayuda adm-bloque-ayuda">{t.texto}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="campo">
          <label className="etiqueta" htmlFor="paq-descripcion">
            Descripción (opcional)
          </label>
          <textarea id="paq-descripcion" className="input" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ceja, axila y bigote en una sola visita." />
        </div>

        <fieldset className="adm-paso cat-paso">
          <legend>Servicios que incluye</legend>
          <ul className="cat-lineas">
            {lineas.map((l, i) => {
              const s = porId.get(l.servicio_id);
              const n = enteroDe(l.cantidad, 1);
              const sub = s && typeof n === 'number' && !Number.isNaN(n) ? (s.precio === null ? 'Por confirmar' : dinero(s.precio * n)) : '—';
              const usadosOtros = new Set(lineas.filter((x) => x.k !== l.k).map((x) => x.servicio_id));
              return (
                <li key={l.k} className="cat-linea">
                  <div className="campo cat-linea-servicio">
                    <label className="etiqueta" htmlFor={`paq-srv-${l.k}`}>
                      Servicio {lineas.length > 1 ? i + 1 : ''}
                    </label>
                    <select
                      id={`paq-srv-${l.k}`}
                      className="input"
                      value={l.servicio_id}
                      onChange={(e) => cambiarLinea(l.k, { servicio_id: e.target.value })}
                      aria-invalid={(intentado && !l.servicio_id && !!errores.items) || repetidos.has(l.servicio_id) ? true : undefined}
                    >
                      <option value="">Elige un servicio</option>
                      {grupos.map((g) => (
                        <optgroup key={g.c.id} label={g.c.nombre}>
                          {g.lista.map((x) =>
                            usadosOtros.has(x.id) && x.id !== l.servicio_id ? (
                              <option key={x.id} value={x.id} disabled>
                                {etiquetaServicio(x)} · ya está en el paquete
                              </option>
                            ) : (
                              opcion(x)
                            ),
                          )}
                        </optgroup>
                      ))}
                      {sinCategoria.map(opcion)}
                    </select>
                  </div>
                  <div className="campo cat-linea-cantidad">
                    <label className="etiqueta" htmlFor={`paq-cant-${l.k}`}>
                      {tipo === 'bono' ? 'Sesiones' : 'Cantidad'}
                    </label>
                    <input
                      id={`paq-cant-${l.k}`}
                      className="input num"
                      inputMode="numeric"
                      value={l.cantidad}
                      onChange={(e) => cambiarLinea(l.k, { cantidad: e.target.value })}
                      aria-invalid={l.servicio_id && cantidadMala(l) ? true : undefined}
                    />
                  </div>
                  <div className="cat-linea-sub">
                    <span className="etiqueta">Por separado</span>
                    <span className="num">{sub}</span>
                  </div>
                  <button type="button" className="btn btn-texto btn-sm adm-texto-peligro cat-linea-quitar" onClick={() => quitarLinea(l.k)} aria-label={`Quitar ${s ? s.nombre : 'esta línea'}`}>
                    <IconoCerrar tam={18} />
                    <span className="cat-solo-movil">Quitar</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn btn-secundario btn-sm cat-agregar-linea" onClick={() => setLineas((ls) => [...ls, nueva()])}>
            <IconoMas tam={18} /> Agregar servicio
          </button>
          {tipo === 'bono' && items.length > 1 && (
            <p className="ayuda cat-nota">Un bono suele ser de un solo servicio. Si incluyes varios, la clienta recibe sesiones de cada uno.</p>
          )}
          {noReservables.length > 0 && (
            <div className="aviso aviso-alerta cat-aviso-compacto">
              <span>
                Incluye servicios que hoy no se pueden reservar ({noReservables.map((s) => `${s.nombre}: ${!s.activo ? 'inactivo' : ETIQUETA_ETAPA[s.etapa].toLowerCase()}`).join('; ')}). Mientras
                tanto, el paquete no se puede reservar en línea.
              </span>
            </div>
          )}
        </fieldset>

        <fieldset className="adm-paso cat-paso">
          <legend>Precio, tiempo y vigencia</legend>
          <div className="adm-form-3">
            <div className="campo">
              <label className="etiqueta" htmlFor="paq-precio">
                Precio del paquete
              </label>
              <CatalogoEntrada id="paq-precio" valor={precio} onCambio={setPrecio} prefijo="$" placeholder="Por confirmar" decimal invalido={!!marca('precio') || precioInvalido} describe="paq-precio-ayuda" />
              <span className="ayuda" id="paq-precio-ayuda">
                Vacío = por confirmar: no se vende en línea.
              </span>
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor="paq-dur">
                Duración
              </label>
              <CatalogoEntrada id="paq-dur" valor={dur} onCambio={setDur} sufijo="min" placeholder="Suma" invalido={!!marca('dur') || Number.isNaN(nDur)} describe="paq-dur-ayuda" />
              <span className="ayuda" id="paq-dur-ayuda">
                Vacío = la suma de sus servicios (nunca menos de 1 h).
              </span>
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor="paq-vigencia">
                Vigencia
              </label>
              <CatalogoEntrada
                id="paq-vigencia"
                valor={vigencia}
                onCambio={setVigencia}
                sufijo="días"
                placeholder="Estándar"
                invalido={!!marca('vigencia') || Number.isNaN(nVigencia)}
                describe="paq-vigencia-ayuda"
              />
              <span className="ayuda" id="paq-vigencia-ayuda">
                Días para usarlo desde que se paga. Vacío = la estándar{vigenciaEstandar ? ` (${vigenciaEstandar} días)` : ''}.
              </span>
            </div>
          </div>

          <dl className="cat-cuentas">
            <div>
              <dt>Por separado suman</dt>
              <dd className="num">{separado !== null ? dinero(separado) : items.length ? 'No se sabe aún' : '—'}</dd>
            </div>
            <div>
              <dt>Precio del paquete</dt>
              <dd className="num">{precioInvalido ? '—' : dinero(nPrecio, 'Por confirmar')}</dd>
            </div>
            <div>
              <dt>{ahorro !== null && ahorro < 0 ? 'Cuesta de más' : 'Ahorro para la clienta'}</dt>
              <dd className={`num ${ahorro !== null && ahorro <= 0 ? 'cat-cuenta-mal' : ahorro ? 'cat-cuenta-bien' : ''}`}>{ahorro !== null ? dinero(Math.abs(ahorro)) : '—'}</dd>
            </div>
          </dl>
          {separado === null && items.length > 0 && <p className="ayuda cat-nota">Algún servicio tiene precio por confirmar, así que todavía no se puede comparar.</p>}
          {ahorro !== null && ahorro <= 0 && <p className="ayuda cat-nota cat-cuenta-mal">El paquete cuesta lo mismo o más que pedir los servicios por separado.</p>}
        </fieldset>

        <div className="cat-casillas">
          <Casilla etiqueta="Activo" checked={activo} onChange={setActivo} ayuda="Si está inactivo, no aparece en el sitio ni se puede comprar o reservar." />
        </div>
        <div className="campo adm-campo-corto">
          <label className="etiqueta" htmlFor="paq-orden">
            Orden
          </label>
          <input id="paq-orden" className="input num" inputMode="numeric" value={orden} onChange={(e) => setOrden(e.target.value)} aria-invalid={marca('orden')} aria-describedby="paq-orden-ayuda" />
          <span className="ayuda" id="paq-orden-ayuda">
            Los números menores salen primero.
          </span>
        </div>

        <MensajeError error={error} />
      </form>
    </Modal>
  );
}
