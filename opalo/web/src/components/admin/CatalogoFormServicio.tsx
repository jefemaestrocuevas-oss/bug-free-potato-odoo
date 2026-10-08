// Alta y edición de un servicio del catálogo (ServicioEditable completo).
import { useState, type FormEvent } from 'react';
import { api, type Categoria, type EtapaServicio, type Servicio, type ServicioEditable, type TipoPolitica } from '../../lib/api';
import { dinero, ETIQUETA_POLITICA } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { Modal } from './Modal';
import { Casilla } from './Piezas';
import { AYUDA_ETAPA, CatalogoEntrada, CONSENTIMIENTOS, ETAPAS, enteroDe, reservaEnLinea, slugDe, textoDuracionServicio, ventaEnLinea } from './CatalogoPiezas';
import { ETIQUETA_ETAPA, aNumero, aTexto, textoONulo } from './util';

interface Props {
  /** null = servicio nuevo */
  servicio: Servicio | null;
  categorias: Categoria[];
  /** Para avisar antes de chocar con un identificador repetido. */
  slugsUsados: Map<string, string>;
  categoriaInicial?: string;
  onCerrar: () => void;
  onGuardado: (nombre: string, nuevo: boolean) => void;
}

export function CatalogoFormServicio({ servicio, categorias, slugsUsados, categoriaInicial, onCerrar, onGuardado }: Props) {
  const s = servicio;
  const [nombre, setNombre] = useState(s?.nombre ?? '');
  const [slug, setSlug] = useState('');
  const [categoriaId, setCategoriaId] = useState(s?.categoria_id ?? categoriaInicial ?? categorias[0]?.id ?? '');
  const [descripcion, setDescripcion] = useState(s?.descripcion ?? '');
  const [zonas, setZonas] = useState(s?.zonas_incluye ?? '');
  const [dur, setDur] = useState(aTexto(s?.duracion_min));
  const [durPrimera, setDurPrimera] = useState(aTexto(s?.duracion_primera_vez_min));
  const [precio, setPrecio] = useState(aTexto(s?.precio));
  const [etapa, setEtapa] = useState<EtapaServicio>(s?.etapa ?? 'disponible');
  const [complemento, setComplemento] = useState(s?.es_complemento ?? false);
  const [reservable, setReservable] = useState(s?.reservable_en_linea ?? true);
  const [vendible, setVendible] = useState(s?.vendible_en_linea ?? true);
  const [consentimiento, setConsentimiento] = useState<TipoPolitica | ''>(s?.tipo_consentimiento ?? '');
  const [activo, setActivo] = useState(s?.activo ?? true);
  const [orden, setOrden] = useState(aTexto(s?.orden ?? 0));
  const [intentado, setIntentado] = useState(false);

  const slugFinal = s ? s.slug : slugDe(slug || nombre);
  const slugOcupado = !s && !!slugFinal && slugsUsados.has(slugFinal);
  const nDur = enteroDe(dur);
  const nDurPrimera = enteroDe(durPrimera);
  const nPrecio = aNumero(precio);
  const precioInvalido = precio.trim() !== '' && (nPrecio === null || nPrecio < 0);
  const nOrden = orden.trim() === '' ? 0 : Number(orden);
  const ordenInvalido = !Number.isInteger(nOrden);

  // Igual que la base: un servicio activo y disponible necesita su consentimiento (sin firma no hay servicio).
  const pideConsentimiento = activo && etapa === 'disponible';

  const errores = {
    nombre: !nombre.trim() ? 'Escribe el nombre del servicio.' : null,
    slug: !s && !slugFinal ? 'El identificador necesita al menos una letra o número.' : slugOcupado ? `Ya hay otro registro con el identificador «${slugFinal}»: ${slugsUsados.get(slugFinal)}. Escribe otro.` : null,
    categoria: !categoriaId ? 'Elige la categoría.' : null,
    dur: Number.isNaN(nDur) ? 'La duración va en minutos enteros (o vacía).' : null,
    durPrimera: Number.isNaN(nDurPrimera) ? 'La duración de la primera vez va en minutos enteros (o vacía).' : null,
    precio: precioInvalido ? 'Revisa el precio: un número mayor o igual a cero, o vacío si está por confirmar.' : null,
    orden: ordenInvalido ? 'El orden es un número entero.' : null,
    consentimiento: pideConsentimiento && !consentimiento ? 'Elige qué consentimiento firma la clienta para este servicio.' : null,
  };
  const primerError = Object.values(errores).find(Boolean) ?? null;

  const borrador = {
    activo,
    etapa,
    reservable_en_linea: reservable,
    vendible_en_linea: vendible,
    es_complemento: complemento,
    precio: precioInvalido ? null : nPrecio,
  };
  const reserva = reservaEnLinea(borrador);
  const venta = ventaEnLinea(borrador);

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    if (primerError) throw new Error(primerError);
    const datos: ServicioEditable = {
      id: s?.id,
      categoria_id: categoriaId,
      slug: slugFinal,
      nombre: nombre.trim(),
      descripcion: textoONulo(descripcion),
      zonas_incluye: textoONulo(zonas),
      duracion_min: nDur as number | null,
      duracion_primera_vez_min: nDurPrimera as number | null,
      precio: nPrecio,
      etapa,
      es_complemento: complemento,
      reservable_en_linea: reservable,
      vendible_en_linea: vendible,
      tipo_consentimiento: consentimiento || null,
      activo,
      orden: nOrden,
    };
    await api.admin.guardarServicio(datos);
    return true;
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    setError(null);
    if (await ejecutar()) onGuardado(nombre.trim(), !s);
  };

  const opcionesConsentimiento = consentimiento && !CONSENTIMIENTOS.includes(consentimiento) ? [...CONSENTIMIENTOS, consentimiento] : CONSENTIMIENTOS;
  const marca = (k: keyof typeof errores) => (intentado && errores[k] ? true : undefined);

  return (
    <Modal
      titulo={s ? `Editar ${s.nombre}` : 'Nuevo servicio'}
      onCerrar={onCerrar}
      bloqueado={enviando}
      ancho="amplio"
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="cat-form-servicio" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : s ? 'Guardar cambios' : 'Crear servicio'}
          </button>
        </>
      }
    >
      <form id="cat-form-servicio" className="cat-form" onSubmit={enviar} noValidate>
        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="srv-nombre">
              Nombre
            </label>
            <input id="srv-nombre" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-invalid={marca('nombre')} placeholder="Media pierna" />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="srv-categoria">
              Categoría
            </label>
            <select id="srv-categoria" className="input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} aria-invalid={marca('categoria')}>
              {!categoriaId && <option value="">Elige una categoría</option>}
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="campo">
          {s ? (
            <>
              <span className="etiqueta" id="srv-slug-etq">
                Identificador en la dirección web
              </span>
              <p className="cat-slug" aria-labelledby="srv-slug-etq">
                <code>{s.slug}</code>
                <span className="ayuda">No se cambia para no romper enlaces que ya se compartieron.</span>
              </p>
            </>
          ) : (
            <>
              <label className="etiqueta" htmlFor="srv-slug">
                Identificador en la dirección web (opcional)
              </label>
              <input
                id="srv-slug"
                className="input"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={slugDe(nombre) || 'se-genera-del-nombre'}
                aria-invalid={slugOcupado || marca('slug') ? true : undefined}
                aria-describedby="srv-slug-ayuda"
                autoCapitalize="none"
                spellCheck={false}
              />
              <span className="ayuda" id="srv-slug-ayuda">
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

        <div className="campo">
          <label className="etiqueta" htmlFor="srv-zonas">
            Zonas que incluye (opcional)
          </label>
          <input id="srv-zonas" className="input" value={zonas} onChange={(e) => setZonas(e.target.value)} placeholder="Por ejemplo: rodilla hacia abajo, ambas piernas" />
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="srv-descripcion">
            Descripción (opcional)
          </label>
          <textarea id="srv-descripcion" className="input" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>

        <fieldset className="adm-paso cat-paso">
          <legend>Precio y tiempo</legend>
          <div className="adm-form-3">
            <div className="campo">
              <label className="etiqueta" htmlFor="srv-precio">
                Precio
              </label>
              <CatalogoEntrada id="srv-precio" valor={precio} onCambio={setPrecio} prefijo="$" placeholder="Por confirmar" decimal invalido={!!marca('precio') || precioInvalido} describe="srv-precio-ayuda" />
              <span className="ayuda" id="srv-precio-ayuda">
                Vacío = precio por confirmar: se puede reservar y se cobra en cabina, pero no se vende en línea.
              </span>
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor="srv-dur">
                Duración
              </label>
              <CatalogoEntrada id="srv-dur" valor={dur} onCambio={setDur} sufijo="min" placeholder="Estándar" invalido={!!marca('dur') || Number.isNaN(nDur)} describe="srv-dur-ayuda" />
              <span className="ayuda" id="srv-dur-ayuda">
                Vacío = cabe en la sesión estándar de 1 h. Usa 0 para un complemento que no agrega tiempo.
              </span>
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor="srv-dur1">
                Duración la primera vez
              </label>
              <CatalogoEntrada
                id="srv-dur1"
                valor={durPrimera}
                onCambio={setDurPrimera}
                sufijo="min"
                placeholder="Igual"
                invalido={!!marca('durPrimera') || Number.isNaN(nDurPrimera)}
                describe="srv-dur1-ayuda"
              />
              <span className="ayuda" id="srv-dur1-ayuda">
                Opcional, si la primera sesión toma más tiempo (valoración, prueba de piel).
              </span>
            </div>
          </div>
        </fieldset>

        <fieldset className="adm-paso cat-paso">
          <legend>Cómo se ofrece</legend>
          <div className="adm-form-2">
            <div className="campo">
              <label className="etiqueta" htmlFor="srv-etapa">
                Etapa
              </label>
              <select id="srv-etapa" className="input" value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaServicio)} aria-describedby="srv-etapa-ayuda">
                {ETAPAS.map((x) => (
                  <option key={x} value={x}>
                    {ETIQUETA_ETAPA[x]}
                  </option>
                ))}
              </select>
              <span className="ayuda" id="srv-etapa-ayuda">
                {AYUDA_ETAPA[etapa]} Lo que no está «Disponible» no se puede reservar.
              </span>
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor="srv-consentimiento">
                Consentimiento que firma la clienta
              </label>
              <select
                id="srv-consentimiento"
                className="input"
                value={consentimiento}
                onChange={(e) => setConsentimiento(e.target.value as TipoPolitica | '')}
                aria-invalid={marca('consentimiento')}
                aria-describedby={marca('consentimiento') ? 'srv-consentimiento-error srv-consentimiento-ayuda' : 'srv-consentimiento-ayuda'}
              >
                <option value="">{pideConsentimiento ? 'Elige un consentimiento' : 'Ninguno'}</option>
                {opcionesConsentimiento.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_POLITICA[t] ?? t}
                  </option>
                ))}
              </select>
              {marca('consentimiento') && (
                <span className="cat-error-campo" id="srv-consentimiento-error">
                  {errores.consentimiento}
                </span>
              )}
              <span className="ayuda" id="srv-consentimiento-ayuda">
                Se firma en la tablet de la cabina, antes del servicio. Sin consentimiento firmado la cita no puede iniciar.
                {pideConsentimiento ? ' Es obligatorio mientras el servicio esté activo y disponible.' : ''}
              </span>
            </div>
          </div>
          <div className="cat-casillas">
            <Casilla etiqueta="Se reserva en línea" checked={reservable} onChange={setReservable} ayuda="Si lo desmarcas, sólo se agenda por WhatsApp o en mostrador." />
            <Casilla
              etiqueta="Se vende en la tienda en línea"
              checked={vendible}
              onChange={setVendible}
              ayuda={vendible && nPrecio === null ? 'Ojo: sin precio no se vende en línea aunque esté marcado.' : 'Las clientas lo pueden comprar para ellas o para regalar.'}
            />
            <Casilla etiqueta="Es complemento" checked={complemento} onChange={setComplemento} ayuda="Sólo se reserva junto con otro servicio (por ejemplo, una ampolleta)." />
            <Casilla etiqueta="Activo" checked={activo} onChange={setActivo} ayuda="Si está inactivo, no aparece en el sitio ni en la agenda." />
          </div>
          <div className="campo adm-campo-corto">
            <label className="etiqueta" htmlFor="srv-orden">
              Orden en su categoría
            </label>
            <input id="srv-orden" className="input num" inputMode="numeric" value={orden} onChange={(e) => setOrden(e.target.value)} aria-invalid={marca('orden') || ordenInvalido ? true : undefined} aria-describedby="srv-orden-ayuda" />
            <span className="ayuda" id="srv-orden-ayuda">
              Los números menores salen primero.
            </span>
          </div>
        </fieldset>

        <div className="cat-vista-previa" aria-live="polite">
          <p className="cat-vista-titulo">Así queda para las clientas</p>
          <ul className="cat-vista-lista">
            <li className={reserva.si ? 'cat-si' : 'cat-no'}>
              <strong>{reserva.si ? 'Se puede reservar en línea' : 'No se puede reservar en línea'}</strong>
              {!reserva.si || complemento ? ` · ${reserva.motivo}` : ''}
            </li>
            <li className={venta.si ? 'cat-si' : 'cat-no'}>
              <strong>{venta.si ? `Se vende en línea a ${dinero(nPrecio)}` : 'No se vende en línea'}</strong>
              {!venta.si ? ` · ${venta.motivo}` : ''}
            </li>
            <li className="cat-neutro">
              <strong>{textoDuracionServicio(nDur === null || Number.isNaN(nDur) ? null : nDur)}</strong>
              {nPrecio === null && !precioInvalido ? ' · precio por confirmar (se cobra en cabina)' : ''}
            </li>
          </ul>
        </div>

        <MensajeError error={error} />
      </form>
    </Modal>
  );
}
