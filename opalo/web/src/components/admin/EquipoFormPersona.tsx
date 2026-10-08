// Alta y edición de una persona del equipo (datos que se ven en el sitio y en la agenda).
import { useState, type CSSProperties, type FormEvent } from 'react';
import { api, type PersonalEditable, type PersonalInterno } from '../../lib/api';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { Modal } from './Modal';
import { Casilla } from './Piezas';
import { slugDe } from './CatalogoPiezas';
import { COLORES_AGENDA, COLOR_POR_DEFECTO, EquipoFoto, colorValido, urlValida } from './EquipoPiezas';
import { aTexto, textoONulo } from './util';

interface Props {
  /** null = persona nueva */
  persona: PersonalInterno | null;
  slugsUsados: Map<string, string>;
  ordenSugerido: number;
  onCerrar: () => void;
  onGuardado: (nombre: string, nueva: boolean) => void;
}

export function EquipoFormPersona({ persona, slugsUsados, ordenSugerido, onCerrar, onGuardado }: Props) {
  const p = persona;
  const [nombre, setNombre] = useState(p?.nombre ?? '');
  const [slug, setSlug] = useState('');
  const [titulo, setTitulo] = useState(p?.titulo ?? '');
  const [bio, setBio] = useState(p?.bio ?? '');
  const [foto, setFoto] = useState(p?.foto_url ?? '');
  const [color, setColor] = useState((p?.color_agenda ?? COLOR_POR_DEFECTO).toUpperCase());
  const [activo, setActivo] = useState(p?.activo ?? true);
  const [enSitio, setEnSitio] = useState(p?.mostrar_en_sitio ?? true);
  const [orden, setOrden] = useState(aTexto(p?.orden ?? ordenSugerido));
  const [intentado, setIntentado] = useState(false);

  const slugFinal = p ? p.slug : slugDe(slug || nombre);
  const slugOcupado = !p && !!slugFinal && slugsUsados.has(slugFinal);
  const fotoInvalida = foto.trim() !== '' && !urlValida(foto);
  const nOrden = orden.trim() === '' ? 0 : Number(orden);

  const errores = {
    nombre: !nombre.trim() ? 'Escribe el nombre.' : null,
    slug: !p && !slugFinal ? 'El identificador necesita al menos una letra o número.' : slugOcupado ? `Ya hay otra persona con el identificador «${slugFinal}» (${slugsUsados.get(slugFinal)}). Escribe otro.` : null,
    foto: fotoInvalida ? 'La foto debe ser una dirección que empiece con https:// (o una ruta del sitio que empiece con /).' : null,
    color: !colorValido(color) ? 'Elige un color de la lista o escribe uno como #5C6B3F.' : null,
    orden: !Number.isInteger(nOrden) ? 'El orden es un número entero.' : null,
  };
  const primerError = Object.values(errores).find(Boolean) ?? null;

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    if (primerError) throw new Error(primerError);
    const datos: PersonalEditable = {
      id: p?.id,
      slug: slugFinal,
      nombre: nombre.trim(),
      titulo: textoONulo(titulo),
      bio: textoONulo(bio),
      foto_url: textoONulo(foto),
      color_agenda: color.toUpperCase(),
      activo,
      mostrar_en_sitio: enSitio,
      orden: nOrden,
    };
    await api.admin.guardarPersonal(datos);
    return true;
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    setError(null);
    if (await ejecutar()) onGuardado(nombre.trim(), !p);
  };

  const marca = (k: keyof typeof errores) => (intentado && errores[k] ? true : undefined);
  const fotoPrevia = foto.trim() && !fotoInvalida ? foto.trim() : null;

  return (
    <Modal
      titulo={p ? `Editar a ${p.nombre}` : 'Agregar persona al equipo'}
      onCerrar={onCerrar}
      bloqueado={enviando}
      ancho="amplio"
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="eqa-form-persona" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : p ? 'Guardar cambios' : 'Agregar al equipo'}
          </button>
        </>
      }
    >
      <form id="eqa-form-persona" className="eqa-form" onSubmit={enviar} noValidate>
        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="eqa-nombre">
              Nombre
            </label>
            <input id="eqa-nombre" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-invalid={marca('nombre')} autoComplete="off" />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="eqa-titulo">
              Título o especialidad
            </label>
            <input id="eqa-titulo" className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Cosmetóloga" />
          </div>
        </div>

        <div className="campo">
          {p ? (
            <>
              <span className="etiqueta" id="eqa-slug-etq">
                Identificador en la dirección web
              </span>
              <p className="eqa-slug" aria-labelledby="eqa-slug-etq">
                <code>{p.slug}</code>
                <span className="ayuda">No se cambia para no romper enlaces.</span>
              </p>
            </>
          ) : (
            <>
              <label className="etiqueta" htmlFor="eqa-slug">
                Identificador en la dirección web (opcional)
              </label>
              <input
                id="eqa-slug"
                className="input"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={slugDe(nombre) || 'se-genera-del-nombre'}
                aria-invalid={slugOcupado || marca('slug') ? true : undefined}
                aria-describedby="eqa-slug-ayuda"
                autoCapitalize="none"
                spellCheck={false}
              />
              <span className="ayuda" id="eqa-slug-ayuda">
                {slugFinal ? (
                  <>
                    Quedará como <code>{slugFinal}</code>.
                  </>
                ) : (
                  'Si lo dejas vacío, se genera del nombre.'
                )}
              </span>
              {slugOcupado && <span className="eqa-error-campo">{errores.slug}</span>}
            </>
          )}
        </div>

        <div className="campo">
          <label className="etiqueta" htmlFor="eqa-bio">
            Semblanza (opcional)
          </label>
          <textarea id="eqa-bio" className="input" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} aria-describedby="eqa-bio-ayuda" />
          <span className="ayuda" id="eqa-bio-ayuda">
            Aparece en la página Equipo del sitio: su experiencia, su enfoque, lo que más disfruta hacer.
          </span>
        </div>

        <div className="eqa-foto-campo">
          <div className="campo eqa-foto-entrada">
            <label className="etiqueta" htmlFor="eqa-foto">
              Foto (dirección de la imagen, opcional)
            </label>
            <input
              id="eqa-foto"
              className="input"
              type="url"
              inputMode="url"
              value={foto}
              onChange={(e) => setFoto(e.target.value)}
              placeholder="https://…"
              aria-invalid={fotoInvalida ? true : undefined}
              aria-describedby="eqa-foto-ayuda"
              autoCapitalize="none"
              spellCheck={false}
            />
            <span className="ayuda" id="eqa-foto-ayuda">
              {fotoInvalida ? <span className="eqa-error-campo">{errores.foto}</span> : 'Una foto vertical o cuadrada, con buena luz. Si la dejas vacía, se muestran sus iniciales.'}
            </span>
          </div>
          <figure className="eqa-foto-previa">
            <EquipoFoto key={fotoPrevia ?? 'sin-foto'} nombre={nombre || 'Nueva persona'} url={fotoPrevia} color={colorValido(color) ? color : COLOR_POR_DEFECTO} tam={96} />
            <figcaption className="ayuda">{fotoPrevia ? 'Vista previa' : 'Sin foto'}</figcaption>
          </figure>
        </div>

        <fieldset className="adm-paso eqa-paso">
          <legend>Color en la agenda</legend>
          <div className="eqa-colores" role="group" aria-label="Colores sugeridos">
            {COLORES_AGENDA.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={color.toUpperCase() === c}
                aria-label={`Color ${c}`}
                className="eqa-color"
                style={{ '--eqa-color': c } as CSSProperties}
                onClick={() => setColor(c)}
              />
            ))}
            <label className="eqa-color-libre">
              <span className="sr-only">Otro color</span>
              <input type="color" value={colorValido(color) ? color.toLowerCase() : COLOR_POR_DEFECTO.toLowerCase()} onChange={(e) => setColor(e.target.value.toUpperCase())} />
            </label>
            <input
              className="input num eqa-color-hex"
              value={color}
              onChange={(e) => setColor(e.target.value.trim().toUpperCase())}
              aria-label="Código del color"
              aria-invalid={!colorValido(color) ? true : undefined}
              maxLength={7}
              spellCheck={false}
            />
          </div>
          <p className="ayuda adm-sin-margen">Sus citas se pintan de este color en la agenda para distinguir quién atiende.</p>
        </fieldset>

        <div className="eqa-casillas">
          <Casilla etiqueta="Activa" checked={activo} onChange={setActivo} ayuda="Si no está activa, no se le asignan citas ni aparece en la agenda." />
          <Casilla etiqueta="Mostrar en el sitio" checked={enSitio} onChange={setEnSitio} ayuda="Aparece en la página Equipo junto con sus capacitaciones visibles." />
        </div>
        <div className="campo adm-campo-corto">
          <label className="etiqueta" htmlFor="eqa-orden">
            Orden
          </label>
          <input id="eqa-orden" className="input num" inputMode="numeric" value={orden} onChange={(e) => setOrden(e.target.value)} aria-invalid={marca('orden')} aria-describedby="eqa-orden-ayuda" />
          <span className="ayuda" id="eqa-orden-ayuda">
            En el sitio y en la agenda, los números menores salen primero.
          </span>
        </div>
        {!p && <p className="ayuda">Después de agregarla, define su horario semanal: sin horario no se le ofrecen citas en línea.</p>}

        <MensajeError error={error} />
      </form>
    </Modal>
  );
}
