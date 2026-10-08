// Lecturas públicas: configuración, catálogo, equipo, políticas, contraindicaciones, tienda y horarios.
import type { ItemReserva, OpaloApi, PaqueteItem } from '../tipos';
import {
  aCapacitacion,
  aCategoria,
  aConfiguracion,
  aContraindicacion,
  agrupar,
  aPaquete,
  aPaqueteItem,
  aPolitica,
  aProductoTienda,
  aServicio,
  aSlot,
  COLUMNAS_CONFIGURACION,
  COLUMNAS_PRODUCTO_TIENDA,
  compararPoliticas,
  num,
  ordenarTienda,
  texto,
  textoONulo,
  type Fila,
} from './conversion';
import type { Contexto } from './contexto';

type ApiPublica = Pick<
  OpaloApi,
  | 'getConfiguracion'
  | 'getCatalogo'
  | 'getEquipo'
  | 'getPoliticasVigentes'
  | 'getContraindicaciones'
  | 'getProductosTienda'
  | 'getHorariosDisponibles'
  | 'getDuracionReserva'
>;

export const COLUMNAS_SERVICIO =
  'id, categoria_id, slug, nombre, descripcion, zonas_incluye, duracion_min, duracion_primera_vez_min, precio, etapa, es_complemento, reservable_en_linea, vendible_en_linea, tipo_consentimiento, activo, orden';
export const COLUMNAS_PAQUETE = 'id, slug, nombre, descripcion, tipo, precio, duracion_min, vigencia_dias, activo, orden';
export const COLUMNAS_POLITICA = 'id, tipo, version, titulo, contenido_md, hash_sha256, vigente_desde';

/** p_items de reserva: [{servicio_id} | {paquete_id}, + credito_id opcional]. */
export function itemsReserva(items: ItemReserva[]): Record<string, string>[] {
  return (items ?? []).map((it) => {
    const x: Record<string, string> = {};
    if (it.servicio_id) x.servicio_id = it.servicio_id;
    if (it.paquete_id) x.paquete_id = it.paquete_id;
    if (it.credito_id) x.credito_id = it.credito_id;
    return x;
  });
}

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es');

export function crearApiPublica(ctx: Contexto): ApiPublica {
  const { sb } = ctx;

  return {
    async getConfiguracion() {
      const f = await ctx.fila(sb.from('configuracion').select(COLUMNAS_CONFIGURACION).eq('id', 1).maybeSingle());
      return aConfiguracion(f);
    },

    async getCatalogo(opciones) {
      const todo = !!opciones?.incluirInactivos;
      let qServicios = sb.from('servicios').select(COLUMNAS_SERVICIO);
      let qPaquetes = sb.from('paquetes').select(COLUMNAS_PAQUETE);
      if (!todo) {
        qServicios = qServicios.eq('activo', true);
        qPaquetes = qPaquetes.eq('activo', true);
      }
      const [cats, servs, paqs, items] = await Promise.all([
        ctx.filas(sb.from('categorias_servicio').select('id, slug, nombre, descripcion, orden').order('orden').order('nombre')),
        ctx.filas(qServicios.order('orden').order('nombre')),
        ctx.filas(qPaquetes.order('orden').order('nombre')),
        ctx.filas(sb.from('paquete_servicios').select('paquete_id, servicio_id, cantidad')),
      ]);

      const categorias = cats.map(aCategoria).sort((a, b) => a.orden - b.orden || porNombre(a, b));
      const ordenCat = new Map(categorias.map((c, i) => [c.id, i]));
      const servicios = servs
        .map(aServicio)
        .sort(
          (a, b) =>
            (ordenCat.get(a.categoria_id) ?? 999) - (ordenCat.get(b.categoria_id) ?? 999) || a.orden - b.orden || porNombre(a, b),
        );
      const itemsPorPaquete = agrupar<PaqueteItem>(items, 'paquete_id', aPaqueteItem);
      const paquetes = paqs
        .map((p) => aPaquete(p, itemsPorPaquete.get(texto(p.id)) ?? []))
        .sort((a, b) => a.orden - b.orden || porNombre(a, b));
      return { categorias, servicios, paquetes };
    },

    async getEquipo() {
      const [personas, caps] = await Promise.all([
        ctx.filas(sb.from('personal_publico').select('id, slug, nombre, titulo, bio, foto_url, orden').order('orden').order('nombre')),
        ctx.filas(
          sb
            .from('capacitaciones_publicas')
            .select('id, personal_id, nombre, institucion, tipo, fecha, horas')
            .order('fecha', { ascending: false, nullsFirst: false })
            .order('nombre'),
        ),
      ]);
      const capsPorPersona = agrupar(caps, 'personal_id', aCapacitacion);
      return personas
        .map((p: Fila) => ({
          id: texto(p.id),
          slug: texto(p.slug),
          nombre: texto(p.nombre),
          titulo: textoONulo(p.titulo),
          bio: textoONulo(p.bio),
          foto_url: textoONulo(p.foto_url),
          orden: num(p.orden),
          capacitaciones: capsPorPersona.get(texto(p.id)) ?? [],
        }))
        .sort((a, b) => a.orden - b.orden || porNombre(a, b));
    },

    async getPoliticasVigentes() {
      const fs = await ctx.filas(sb.from('politicas').select(COLUMNAS_POLITICA).eq('activa', true));
      return fs.map(aPolitica).sort(compararPoliticas);
    },

    async getContraindicaciones() {
      const fs = await ctx.filas(
        sb
          .from('contraindicaciones')
          .select('id, clave, pregunta, ayuda, categorias, accion, mensaje_cliente, orden')
          .eq('activa', true)
          .order('orden')
          .order('clave'),
      );
      return fs.map(aContraindicacion);
    },

    async getProductosTienda() {
      // Sin .order(): la vista ya ordena por destacado, categoría, orden y nombre (ESPEC §10.1), y
      // `orden` no es una de sus columnas. ordenarTienda sólo asegura destacados y categoría.
      const fs = await ctx.filas(sb.from('productos_tienda').select(COLUMNAS_PRODUCTO_TIENDA));
      return ordenarTienda(fs.map(aProductoTienda));
    },

    async getHorariosDisponibles(fecha, duracion_min, personal_id) {
      const d = Number(duracion_min);
      const data = await ctx.rpc('horarios_disponibles', {
        p_fecha: fecha,
        p_duracion_min: Number.isFinite(d) && d > 0 ? Math.round(d) : null,
        p_personal_id: personal_id || null,
      });
      // Rangos de horario encimados (o repetidos) dan el mismo bloque dos veces: se deja uno, como en el modo demostración.
      const vistos = new Set<string>();
      return (Array.isArray(data) ? (data as Fila[]) : []).map(aSlot).filter((s) => {
        const k = `${s.personal_id}|${s.inicio}`;
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });
    },

    async getDuracionReserva(items) {
      const data = await ctx.rpc('duracion_reserva', { p_items: itemsReserva(items) });
      return num(data, 60);
    },
  };
}
