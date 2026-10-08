// Piezas de la tienda: imagen (foto o ilustración), estado de existencias, botón para agregar
// y tarjeta de producto. Se usan en /tienda, en la ficha /tienda/:slug, en Inicio y en el carrito.
import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { CategoriaProducto, ProductoTienda } from '../../lib/api/tipos';
import { useCarrito, type NuevoItemCarrito } from '../../lib/carrito';
import { dinero, enlaceWhatsApp } from '../../lib/format';
import { Gema } from '../ui/Gema';
import { IlustracionProducto } from '../ui/IlustracionProducto';
import { useContacto } from './contacto';
import { IconoBolsa, IconoCheck, IconoMas, IconoMenos, IconoMensaje } from './Iconos';
import {
  colorValido,
  detalleProducto,
  estadoExistencias,
  etiquetaProducto,
  fotoValida,
  mensajeAvisame,
  piezasDisponibles,
  rutaProducto,
  type EstadoExistencias,
} from './tienda';
import './tienda.css';

/** Lo que se guarda en el carrito al agregar un producto (con sus existencias de este momento). */
export function itemDeProducto(p: ProductoTienda, extra: { cantidad?: number; regalo_para?: string | null } = {}): NuevoItemCarrito {
  return {
    tipo: 'producto',
    id: p.id,
    nombre: p.nombre,
    precio: p.precio_venta,
    detalle: detalleProducto(p) || null,
    maximo: piezasDisponibles(p),
    miniatura: { categoria: p.categoria, color_hex: colorValido(p.color_hex), foto_url: fotoValida(p.foto_url), hecho_en_opalo: p.hecho_en_opalo },
    slug: p.slug || p.id,
    ...extra,
  };
}

/** Tono dorado suave de la marca para los frascos sin color propio. */
const COLOR_FRASCO = '#d9c193';

/**
 * Foto del producto o, si todavía no hay, su ilustración con el color del producto sobre un fondo
 * suave. `alt` describe la imagen (nombre del producto); vacío = decorativa.
 */
export function ImagenProducto({
  categoria,
  color,
  foto,
  nombre,
  alt,
  className = '',
  conMarca = true,
}: {
  categoria: CategoriaProducto;
  color: string | null;
  foto: string | null;
  nombre: string;
  alt: string;
  className?: string;
  /** false: producto de otra marca (la ilustración va sin "ÓPALO") */
  conMarca?: boolean;
}) {
  const [fallo, setFallo] = useState(false);
  const url = fallo ? null : fotoValida(foto);
  // Sin color propio, los frascos de "Para tu cuidado" toman un tono de la marca (no un gris de relleno).
  const tono = colorValido(color) ?? (categoria === 'jabon' || categoria === 'vela' || categoria === 'set' ? null : COLOR_FRASCO);
  const estilo = tono ? ({ '--prod-color': tono } as CSSProperties) : undefined;
  return (
    <div className={`prod-imagen ${url ? 'con-foto' : ''} ${className}`} style={estilo}>
      {url ? (
        <img src={url} alt={alt} loading="lazy" decoding="async" onError={() => setFallo(true)} />
      ) : (
        <IlustracionProducto categoria={categoria} color={tono} nombre={nombre} titulo={alt || undefined} conMarca={conMarca} />
      )}
    </div>
  );
}

export function InsigniaHechoEnOpalo({ className = '' }: { className?: string }) {
  return (
    <span className={`prod-insignia ${className}`}>
      <Gema tam={13} /> Hecho en Ópalo
    </span>
  );
}

/** Pastilla de existencias. `corto`: texto breve para la tarjeta (el completo queda para lectores de pantalla). */
export function EstadoProducto({ estado, className = '', corto = false }: { estado: EstadoExistencias; className?: string; corto?: boolean }) {
  const clase = `prod-estado prod-estado-${estado.tipo} ${className}`;
  if (!corto || estado.corto === estado.texto) return <span className={clase}>{estado.texto}</span>;
  return (
    <span className={clase}>
      <span aria-hidden="true">{estado.corto}</span>
      <span className="sr-only">{estado.texto}</span>
    </span>
  );
}

export function AvisameWhatsApp({
  nombre,
  estado = null,
  className = 'btn btn-secundario btn-sm',
  compacto = false,
}: {
  nombre: string;
  estado?: EstadoExistencias | null;
  className?: string;
  /** Para la tarjeta: "Avísame" (en celular no se parte en dos renglones). */
  compacto?: boolean;
}) {
  const contacto = useContacto();
  const cuando = estado?.tipo === 'proximo' ? 'cuando esté listo' : 'cuando esté disponible';
  return (
    <a
      className={`${className} ${compacto ? 'prod-avisame' : ''}`}
      href={enlaceWhatsApp(contacto.telefono_whatsapp, mensajeAvisame(nombre, estado))}
      target="_blank"
      rel="noopener noreferrer"
    >
      <IconoMensaje tam={18} />
      {compacto ? (
        <>
          <span className="prod-avisame-largo">Avísame por WhatsApp</span>
          <span className="prod-avisame-corto" aria-hidden="true">
            Avísame
          </span>
        </>
      ) : (
        'Avísame por WhatsApp'
      )}
      <span className="sr-only">
        {' '}
        {cuando}: {nombre} (se abre en una pestaña nueva)
      </span>
    </a>
  );
}

/** − [n] + con límite (p. ej. las piezas disponibles). */
export function SelectorCantidad({
  valor,
  maximo,
  onCambio,
  etiqueta,
  id,
}: {
  valor: number;
  maximo: number;
  onCambio: (n: number) => void;
  etiqueta: string;
  id: string;
}) {
  const tope = Math.max(1, maximo);
  const fijar = (n: number) => onCambio(Math.min(tope, Math.max(1, Math.round(n))));
  return (
    <div className="prod-cantidad" role="group" aria-labelledby={`${id}-etiqueta`}>
      <span id={`${id}-etiqueta`} className="sr-only">
        {etiqueta}
      </span>
      <button type="button" className="prod-cantidad-boton" onClick={() => fijar(valor - 1)} disabled={valor <= 1} aria-label="Quitar una pieza">
        <IconoMenos tam={18} />
      </button>
      <label htmlFor={id} className="sr-only">
        Piezas
      </label>
      <input
        id={id}
        className="prod-cantidad-input num"
        type="number"
        inputMode="numeric"
        min={1}
        max={tope}
        value={valor}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(n)) fijar(n);
        }}
      />
      <button type="button" className="prod-cantidad-boton" onClick={() => fijar(valor + 1)} disabled={valor >= tope} aria-label="Agregar una pieza">
        <IconoMas tam={18} />
      </button>
    </div>
  );
}

/** Confirmación breve tras agregar ("Agregado"). */
export function useConfirmacion(): [boolean, () => void] {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    if (!listo) return;
    const t = window.setTimeout(() => setListo(false), 2200);
    return () => window.clearTimeout(t);
  }, [listo]);
  return [listo, () => setListo(true)];
}

/** "Agregar" una pieza, respetando las existencias que ya están en el carrito. */
export function BotonAgregarProducto({ producto: p, className = 'btn btn-primario btn-sm' }: { producto: ProductoTienda; className?: string }) {
  const carrito = useCarrito();
  const [listo, confirmar] = useConfirmacion();
  const piezas = piezasDisponibles(p);
  const caben = carrito.puedenAgregarse({ tipo: 'producto', id: p.id, regalo_para: null, maximo: piezas });
  if (piezas > 0 && caben === 0 && !listo) {
    return (
      <p className="prod-nota-carrito">
        <IconoCheck tam={16} /> {piezas === 1 ? 'La última pieza ya está' : `Las ${piezas} piezas ya están`} en tu{' '}
        <Link to="/carrito">carrito</Link>
      </p>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={piezas === 0}
      onClick={() => {
        if (carrito.agregar(itemDeProducto(p)).agregadas > 0) confirmar();
      }}
      aria-label={`Agregar ${p.nombre} al carrito`}
    >
      {listo ? <IconoCheck tam={18} /> : <IconoBolsa tam={18} />}
      {listo ? 'Agregado' : 'Agregar'}
    </button>
  );
}

/** Tarjeta de producto para la tienda, Inicio y relacionados. */
export function TarjetaProducto({ producto: p, nivel = 'h3' }: { producto: ProductoTienda; nivel?: 'h2' | 'h3' }) {
  const estado = estadoExistencias(p);
  const ruta = rutaProducto(p);
  const detalle = detalleProducto(p);
  const Titulo = nivel;
  return (
    <article className={`prod-tarjeta ${estado.piezas === 0 ? 'sin-existencias' : ''}`}>
      {/* La imagen también lleva a la ficha; el enlace principal (con foco) es el nombre. */}
      <Link to={ruta} className="prod-tarjeta-imagen" tabIndex={-1}>
        <ImagenProducto categoria={p.categoria} color={p.color_hex} foto={p.foto_url} nombre={p.nombre} alt={p.nombre} conMarca={p.hecho_en_opalo} />
        {p.hecho_en_opalo && <InsigniaHechoEnOpalo className="prod-tarjeta-insignia" />}
      </Link>
      <div className="prod-tarjeta-cuerpo">
        <p className="prod-tipo">{etiquetaProducto(p)}</p>
        <Titulo className="prod-nombre">
          <Link to={ruta}>{p.nombre}</Link>
        </Titulo>
        {detalle && <p className="prod-detalle">{detalle}</p>}
        <div className="prod-precio-fila">
          <span className="prod-precio num">{dinero(p.precio_venta)}</span>
          <EstadoProducto estado={estado} corto />
        </div>
        <div className="prod-acciones">
          {estado.piezas > 0 ? <BotonAgregarProducto producto={p} /> : <AvisameWhatsApp nombre={p.nombre} estado={estado} compacto />}
        </div>
      </div>
    </article>
  );
}
