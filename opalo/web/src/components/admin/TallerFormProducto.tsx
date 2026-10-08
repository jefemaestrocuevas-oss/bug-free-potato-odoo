// Editor de la ficha pública de un producto de la tienda (jabón, vela, set u otro de venta):
// lo que la clienta ve en /tienda/:slug, con vista previa en vivo de la ilustración.
import { useState, type FormEvent } from 'react';
import { api, type CategoriaProducto, type Producto, type ProductoEditable } from '../../lib/api';
import { porcentaje } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { IlustracionProducto } from '../ui/IlustracionProducto';
import { MensajeError } from '../ui/Estado';
import { Modal } from './Modal';
import { Casilla } from './Piezas';
import { EntradaConUnidad, pesos } from './InventarioPiezas';
import { COLOR_VALIDO, SLUG_VALIDO, aEditable, esTerminado, fichaDe, fotoValida, margenPct, slugDe } from './TallerPiezas';
import { ETIQUETA_CATEGORIA_PRODUCTO, aNumero, aTexto, textoONulo } from './util';

const HECHOS: CategoriaProducto[] = ['jabon', 'vela', 'set'];
const OTROS_VENTA: CategoriaProducto[] = ['venta', 'facial', 'corporal', 'post', 'otro'];

/** Color sugerido de la ilustración según la categoría (el de la marca). */
const COLOR_INICIAL: Partial<Record<CategoriaProducto, string>> = { jabon: '#e8dcc4', vela: '#f3ead8', set: '#e6eadb' };

interface Props {
  /** null = producto nuevo */
  producto: Producto | null;
  /** Todos los productos (para revisar que el slug no se repita). */
  productos: Producto[];
  onCerrar: () => void;
  onGuardado: (p: Producto, nuevo: boolean) => void;
}

export function TallerFormProducto({ producto, productos, onCerrar, onGuardado }: Props) {
  const p = producto;
  const ficha = fichaDe(p);
  const [nombre, setNombre] = useState(p?.nombre ?? '');
  const [categoria, setCategoria] = useState<CategoriaProducto>(p?.categoria ?? 'jabon');
  const [slug, setSlug] = useState(ficha.slug ?? '');
  // Mientras no se escriba a mano, el slug sigue al nombre.
  const [slugManual, setSlugManual] = useState(!!ficha.slug);
  const [descripcion, setDescripcion] = useState(ficha.descripcion ?? '');
  const [aroma, setAroma] = useState(ficha.aroma ?? '');
  const [ingredientes, setIngredientes] = useState(ficha.ingredientes ?? '');
  const [modoUso, setModoUso] = useState(ficha.modo_uso ?? '');
  const [advertencias, setAdvertencias] = useState(ficha.advertencias ?? '');
  const [contenidoNeto, setContenidoNeto] = useState(ficha.contenido_neto ?? '');
  const [foto, setFoto] = useState(ficha.foto_url ?? '');
  const [color, setColor] = useState(ficha.color_hex ?? COLOR_INICIAL[p?.categoria ?? 'jabon'] ?? '#e6eadb');
  const [destacado, setDestacado] = useState(ficha.destacado);
  const [hecho, setHecho] = useState(p ? ficha.hecho_en_opalo : true);
  const [precio, setPrecio] = useState(aTexto(p?.precio_venta));
  const [enLinea, setEnLinea] = useState(p?.vendible_en_linea ?? false);
  const [activo, setActivo] = useState(p?.activo ?? true);
  const [minimo, setMinimo] = useState(aTexto(p?.stock_minimo ?? 0));
  const [orden, setOrden] = useState(aTexto(ficha.orden));
  const [intentado, setIntentado] = useState(false);

  const slugFinal = slugManual ? slug.trim() : slugDe(nombre);
  const terminado = esTerminado(categoria);
  const nPrecio = aNumero(precio);
  const nMinimo = minimo.trim() === '' ? 0 : aNumero(minimo);
  const nOrden = orden.trim() === '' ? 0 : aNumero(orden);
  const colorOk = COLOR_VALIDO.test(color);
  const repetido = slugFinal ? productos.find((x) => x.id !== p?.id && x.slug === slugFinal) : undefined;
  const costoPieza = p && p.costo_unitario > 0 ? p.costo_unitario : null;
  const margen = costoPieza !== null && nPrecio !== null ? margenPct(nPrecio, costoPieza) : null;
  const opciones = [...HECHOS, ...OTROS_VENTA, ...(HECHOS.includes(categoria) || OTROS_VENTA.includes(categoria) ? [] : [categoria])];

  const errores = {
    nombre: !nombre.trim() ? 'Escribe el nombre del producto.' : null,
    slug: slugFinal && !SLUG_VALIDO.test(slugFinal)
      ? 'El slug sólo lleva minúsculas sin acentos, números y guiones (p. ej. jabon-de-avena).'
      : repetido
        ? `Ese slug ya lo usa «${repetido.nombre}». Elige otro.`
        : enLinea && !slugFinal
          ? 'Para venderlo en línea necesita un slug (su dirección en la tienda).'
          : null,
    precio: precio.trim() !== '' && (nPrecio === null || nPrecio < 0)
      ? 'Revisa el precio: un número mayor o igual a cero.'
      : enLinea && (nPrecio === null || nPrecio <= 0)
        ? 'Para venderlo en línea, escribe su precio.'
        : null,
    foto: foto.trim() && !fotoValida(foto) ? 'La foto debe ser una dirección que empiece con https://' : null,
    color: !colorOk ? 'Elige un color (formato #rrggbb).' : null,
    minimo: nMinimo === null || nMinimo < 0 || !Number.isInteger(nMinimo) ? 'El stock mínimo es un número entero de piezas (0 o más).' : null,
    orden: nOrden === null || !Number.isInteger(nOrden) ? 'El orden es un número entero.' : null,
  };
  const marca = (k: keyof typeof errores) => (intentado ? errores[k] : null);

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    const primero = Object.values(errores).find(Boolean);
    if (primero) throw new Error(primero);
    const base: ProductoEditable = p
      ? aEditable(p)
      : {
          nombre: '',
          marca: null,
          categoria,
          unidad_medida: 'pz',
          presentacion: null,
          contenido_presentacion: 1,
          costo_presentacion: 0,
          stock_minimo: 0,
          proveedor_id: null,
          uso: 'venta',
          precio_venta: null,
          vendible_en_linea: false,
          activo: true,
          notas: null,
          ...fichaDe(null),
        };
    const datos: ProductoEditable = {
      ...base,
      id: p?.id,
      nombre: nombre.trim(),
      categoria,
      // Jabón, vela y set: por pieza (ESPEC §10.2).
      ...(terminado ? { unidad_medida: 'pz' as const, contenido_presentacion: 1 } : {}),
      // Lo de la tienda se vende: si era sólo de cabina o del taller, pasa a venta.
      uso: base.uso === 'cabina' || base.uso === 'produccion' ? 'venta' : base.uso,
      precio_venta: nPrecio,
      vendible_en_linea: enLinea,
      activo,
      stock_minimo: nMinimo ?? 0,
      slug: slugFinal || null,
      descripcion: textoONulo(descripcion),
      aroma: textoONulo(aroma),
      ingredientes: textoONulo(ingredientes),
      modo_uso: textoONulo(modoUso),
      advertencias: textoONulo(advertencias),
      contenido_neto: textoONulo(contenidoNeto),
      foto_url: textoONulo(foto),
      color_hex: color.toLowerCase(),
      destacado,
      hecho_en_opalo: hecho,
      orden: nOrden ?? 0,
    };
    return api.admin.guardarProducto(datos);
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    setError(null);
    const r = await ejecutar();
    if (r) onGuardado(r, !p);
  };

  const fotoVista = fotoValida(foto) ? foto.trim() : null;
  const [fotoFallo, setFotoFallo] = useState<string | null>(null);

  return (
    <Modal
      titulo={p ? `Ficha de ${p.nombre}` : 'Nuevo producto de la tienda'}
      onCerrar={onCerrar}
      bloqueado={enviando}
      ancho="completo"
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="tal-form-producto" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : p ? 'Guardar ficha' : 'Crear producto'}
          </button>
        </>
      }
    >
      <form id="tal-form-producto" className="tal-ficha" onSubmit={enviar} noValidate>
        <div className="tal-ficha-campos">
          <p className="texto-2 adm-sin-margen">
            Esto es lo que ve la clienta en la tienda. {p ? '' : 'El producto empieza sin piezas: sus existencias llegan al liberar un lote en el taller.'}
          </p>

          <div className="adm-form-2 adm-margen-arriba">
            <div className="campo">
              <label className="etiqueta" htmlFor="tal-nombre">
                Nombre
              </label>
              <input
                id="tal-nombre"
                className="input"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                aria-invalid={marca('nombre') ? true : undefined}
                placeholder="Jabón de avena y miel"
                required
              />
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor="tal-categoria">
                Categoría
              </label>
              <select id="tal-categoria" className="input" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaProducto)}>
                <optgroup label="Hecho en Ópalo">
                  {HECHOS.map((c) => (
                    <option key={c} value={c}>
                      {ETIQUETA_CATEGORIA_PRODUCTO[c]}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Otros productos de venta">
                  {opciones
                    .filter((c) => !HECHOS.includes(c))
                    .map((c) => (
                      <option key={c} value={c}>
                        {ETIQUETA_CATEGORIA_PRODUCTO[c]}
                      </option>
                    ))}
                </optgroup>
              </select>
              {terminado && <span className="ayuda">Se cuenta por pieza: el costo de cada pieza sale de sus lotes.</span>}
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor="tal-slug">
                Slug (dirección en la tienda)
              </label>
              <input
                id="tal-slug"
                className="input"
                value={slugFinal}
                onChange={(e) => {
                  setSlugManual(true);
                  setSlug(e.target.value);
                }}
                aria-invalid={marca('slug') ? true : undefined}
                aria-describedby="tal-slug-ayuda"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="ayuda" id="tal-slug-ayuda">
                {slugFinal ? `Se verá en /tienda/${slugFinal}` : 'Sale solo del nombre; puedes cambiarlo.'}
                {p?.slug && slugFinal !== p.slug && ' · Ojo: la dirección anterior dejará de funcionar.'}
                {!p?.slug && slugManual && nombre.trim() && slugFinal !== slugDe(nombre) && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className="tal-enlace-boton"
                      onClick={() => {
                        setSlugManual(false);
                        setSlug('');
                      }}
                    >
                      usar «{slugDe(nombre)}»
                    </button>
                  </>
                )}
              </span>
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor="tal-contenido">
                Contenido neto
              </label>
              <input id="tal-contenido" className="input" value={contenidoNeto} onChange={(e) => setContenidoNeto(e.target.value)} placeholder="100 g" />
            </div>
          </div>

          <div className="campo">
            <label className="etiqueta" htmlFor="tal-descripcion">
              Descripción
            </label>
            <textarea
              id="tal-descripcion"
              className="input"
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Cómo es y para quién: textura, sensación, piel a la que le va bien…"
            />
          </div>
          <div className="adm-form-2">
            <div className="campo">
              <label className="etiqueta" htmlFor="tal-aroma">
                Aroma
              </label>
              <input id="tal-aroma" className="input" value={aroma} onChange={(e) => setAroma(e.target.value)} placeholder="Lavanda y miel" />
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor="tal-foto">
                Foto (dirección web, opcional)
              </label>
              <input
                id="tal-foto"
                className="input"
                type="url"
                inputMode="url"
                value={foto}
                onChange={(e) => setFoto(e.target.value)}
                aria-invalid={marca('foto') ? true : undefined}
                aria-describedby="tal-foto-ayuda"
                placeholder="https://…"
              />
              <span className="ayuda" id="tal-foto-ayuda">
                Sin foto, la tienda muestra la ilustración con el color de abajo.
              </span>
            </div>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="tal-ingredientes">
              Ingredientes
            </label>
            <textarea
              id="tal-ingredientes"
              className="input"
              rows={3}
              value={ingredientes}
              onChange={(e) => setIngredientes(e.target.value)}
              aria-describedby="tal-ingredientes-ayuda"
              placeholder="Sodium Olivate, Sodium Cocoate, Aqua, Avena Sativa Kernel Flour, Mel, Lavandula Angustifolia Oil"
            />
            <span className="ayuda" id="tal-ingredientes-ayuda">
              Lista para la etiqueta; usa nombres INCI cuando aplique, de mayor a menor cantidad.
            </span>
          </div>
          <div className="adm-form-2">
            <div className="campo">
              <label className="etiqueta" htmlFor="tal-modo">
                Modo de uso
              </label>
              <textarea id="tal-modo" className="input" rows={3} value={modoUso} onChange={(e) => setModoUso(e.target.value)} />
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor="tal-advertencias">
                Advertencias
              </label>
              <textarea
                id="tal-advertencias"
                className="input"
                rows={3}
                value={advertencias}
                onChange={(e) => setAdvertencias(e.target.value)}
                placeholder={categoria === 'vela' ? 'No dejes la vela encendida sin supervisión…' : 'Uso externo. Si hay irritación, suspende su uso…'}
              />
            </div>
          </div>

          <fieldset className="adm-paso">
            <legend>Venta</legend>
            <div className="adm-form-3">
              <div className="campo">
                <label className="etiqueta" htmlFor="tal-precio">
                  Precio de venta
                </label>
                <EntradaConUnidad
                  id="tal-precio"
                  valor={precio}
                  onCambio={setPrecio}
                  antes="$"
                  invalido={!!marca('precio')}
                  descrita="tal-precio-ayuda"
                  placeholder="0"
                />
                <span className="ayuda" id="tal-precio-ayuda">
                  {costoPieza !== null && nPrecio !== null && nPrecio > 0
                    ? `Cuesta ${pesos(costoPieza)} hacer una pieza: te deja ${pesos(nPrecio - costoPieza)} (${porcentaje(margen)}).`
                    : 'Por pieza, en el spa y en la tienda en línea.'}
                </span>
              </div>
              <div className="campo">
                <label className="etiqueta" htmlFor="tal-minimo">
                  Stock mínimo
                </label>
                <EntradaConUnidad
                  id="tal-minimo"
                  valor={minimo}
                  onCambio={setMinimo}
                  unidad="pz"
                  invalido={!!marca('minimo')}
                  descrita="tal-minimo-ayuda"
                />
                <span className="ayuda" id="tal-minimo-ayuda">
                  Con esto o menos, aparece en reposición: hora de hacer otro lote.
                </span>
              </div>
              <div className="campo">
                <label className="etiqueta" htmlFor="tal-orden">
                  Orden en la tienda
                </label>
                <input
                  id="tal-orden"
                  className="input num"
                  inputMode="numeric"
                  value={orden}
                  onChange={(e) => setOrden(e.target.value)}
                  aria-invalid={marca('orden') ? true : undefined}
                  aria-describedby="tal-orden-ayuda"
                />
                <span className="ayuda" id="tal-orden-ayuda">
                  Menor = más arriba (dentro de su categoría).
                </span>
              </div>
            </div>
            <Casilla
              etiqueta="Vender en la tienda en línea"
              checked={enLinea}
              onChange={setEnLinea}
              ayuda="Aparece en la tienda del sitio (se recoge en el spa). Si no hay piezas, se muestra como agotado con la fecha del próximo lote."
            />
            <Casilla etiqueta="Destacado" checked={destacado} onChange={setDestacado} ayuda="Sale primero en la tienda." />
            <Casilla etiqueta="Hecho en Ópalo" checked={hecho} onChange={setHecho} ayuda="Lleva el sello «Hecho en Ópalo» en la tienda." />
            <Casilla
              etiqueta="Producto activo"
              checked={activo}
              onChange={setActivo}
              ayuda="Si ya no lo haces, desactívalo: deja de venderse, pero conserva su historial."
            />
          </fieldset>
          <MensajeError error={error} />
        </div>

        <aside className="tal-ficha-vista" aria-label="Vista previa en la tienda">
          <p className="etiqueta adm-sin-margen">Así se verá</p>
          <div className="tal-vista-tarjeta">
            <div className="tal-vista-imagen">
              {fotoVista && fotoFallo !== fotoVista ? (
                <img src={fotoVista} alt="" onError={() => setFotoFallo(fotoVista)} />
              ) : (
                <IlustracionProducto categoria={categoria} color={colorOk ? color : null} nombre={nombre} titulo={`Ilustración de ${nombre || 'el producto'}`} />
              )}
            </div>
            <div className="tal-vista-texto">
              {hecho && <span className="pill pill-oro">Hecho en Ópalo</span>}
              <p className="tal-vista-nombre">{nombre.trim() || 'Nombre del producto'}</p>
              {(aroma.trim() || contenidoNeto.trim()) && (
                <p className="adm-sub adm-sin-margen">{[aroma.trim(), contenidoNeto.trim()].filter(Boolean).join(' · ')}</p>
              )}
              <p className="tal-vista-precio num">{nPrecio !== null && nPrecio > 0 ? pesos(nPrecio) : 'Sin precio'}</p>
            </div>
          </div>
          <div className="campo adm-margen-arriba">
            <label className="etiqueta" htmlFor="tal-color">
              Color de la ilustración
            </label>
            <div className="tal-color">
              <input
                id="tal-color"
                type="color"
                className="tal-color-muestra"
                value={colorOk ? color : '#e6eadb'}
                onChange={(e) => setColor(e.target.value)}
                aria-describedby="tal-color-ayuda"
              />
              <input
                className="input num tal-color-hex"
                value={color}
                onChange={(e) => setColor(e.target.value.trim())}
                aria-label="Color en formato #rrggbb"
                aria-invalid={marca('color') ? true : undefined}
                maxLength={7}
                spellCheck={false}
              />
            </div>
            <span className="ayuda" id="tal-color-ayuda">
              {fotoVista ? 'Con foto, el color se usa sólo si la foto no carga.' : 'El color del jabón, de la cera o de la caja del set.'}
            </span>
          </div>
        </aside>
      </form>
    </Modal>
  );
}
