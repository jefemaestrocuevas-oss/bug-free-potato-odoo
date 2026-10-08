// Datos de EJEMPLO del taller y la tienda propia (ESPEC §10): materia prima con costos, jabones, velas y un set
// de regalo con su ficha pública, sus fórmulas y lotes (en curado, listo para liberar, liberados y uno
// descartado). Todo lleva "(ejemplo)" en el nombre: precios, costos e ingredientes son inventados.
// Los pasos se registran como "eventos" con fecha y se ejecutan en orden cronológico, junto con las ventas que
// agrega sembrado.ts, para que existencias y costos salgan como en la vida real (primero se produce, luego se vende).
import { isoDesdeLocal, sumarDias } from '../../format';
import type { CategoriaProducto, ProductoEditable, UnidadMedida } from '../tipos';
import type { Db } from './modelo';
import type { Ctx } from './permisos';
import { ajustarInventario, registrarCompra } from './reglas';
import { descartarLote, guardarFormula, liberarLote, registrarLote } from './taller';
import { uuid } from './utilidades';

/** Ficha pública vacía (para insumos y productos sin página en la tienda). */
export const FICHA_VACIA = {
  slug: null,
  descripcion: null,
  aroma: null,
  ingredientes: null,
  modo_uso: null,
  advertencias: null,
  contenido_neto: null,
  foto_url: null,
  color_hex: null,
  destacado: false,
  hecho_en_opalo: false,
  orden: 0,
} satisfies Partial<ProductoEditable>;

export type AltaProducto = (
  cuando: Date,
  datos: Partial<ProductoEditable> & Pick<ProductoEditable, 'nombre' | 'categoria' | 'unidad_medida'>,
) => string;

export interface EntornoTaller {
  db: Db;
  /** 'YYYY-MM-DD' de hoy en Querétaro. */
  hoy: string;
  /** user_id de la cuenta de personal (registra compras, lotes y ventas). */
  staff: string;
  en: (cuando: Date | number, usuarioId: string | null) => Ctx;
  altaProducto: AltaProducto;
}

// ---------- Materia prima y envases ----------

interface MateriaEj {
  clave: string;
  nombre: string;
  categoria: 'materia_prima' | 'envase';
  unidad: UnidadMedida;
  presentacion: string;
  contenido: number;
  costo: number;
  minimo: number;
  /** Presentaciones de la compra inicial. */
  compra: number;
}

const MATERIAS: MateriaEj[] = [
  { clave: 'oliva', nombre: 'Aceite de oliva (ejemplo)', categoria: 'materia_prima', unidad: 'ml', presentacion: 'Garrafa 5 L', contenido: 5000, costo: 900, minimo: 1000, compra: 1 },
  { clave: 'coco', nombre: 'Aceite de coco (ejemplo)', categoria: 'materia_prima', unidad: 'g', presentacion: 'Cubeta 4 kg', contenido: 4000, costo: 760, minimo: 800, compra: 1 },
  { clave: 'karite', nombre: 'Manteca de karité (ejemplo)', categoria: 'materia_prima', unidad: 'g', presentacion: 'Bolsa 1 kg', contenido: 1000, costo: 420, minimo: 250, compra: 1 },
  { clave: 'sosa', nombre: 'Sosa cáustica (ejemplo)', categoria: 'materia_prima', unidad: 'g', presentacion: 'Bote 1 kg', contenido: 1000, costo: 110, minimo: 300, compra: 1 },
  { clave: 'agua', nombre: 'Agua destilada (ejemplo)', categoria: 'materia_prima', unidad: 'ml', presentacion: 'Galón 4 L', contenido: 4000, costo: 48, minimo: 1000, compra: 1 },
  { clave: 'avena', nombre: 'Avena coloidal (ejemplo)', categoria: 'materia_prima', unidad: 'g', presentacion: 'Bolsa 500 g', contenido: 500, costo: 150, minimo: 100, compra: 1 },
  { clave: 'miel', nombre: 'Miel de abeja (ejemplo)', categoria: 'materia_prima', unidad: 'g', presentacion: 'Frasco 1 kg', contenido: 1000, costo: 180, minimo: 100, compra: 1 },
  { clave: 'ae-lavanda', nombre: 'Aceite esencial de lavanda (ejemplo)', categoria: 'materia_prima', unidad: 'ml', presentacion: 'Frasco 100 ml', contenido: 100, costo: 520, minimo: 30, compra: 2 },
  { clave: 'ae-eucalipto', nombre: 'Aceite esencial de eucalipto (ejemplo)', categoria: 'materia_prima', unidad: 'ml', presentacion: 'Frasco 100 ml', contenido: 100, costo: 380, minimo: 20, compra: 1 },
  { clave: 'carbon', nombre: 'Carbón activado (ejemplo)', categoria: 'materia_prima', unidad: 'g', presentacion: 'Bolsa 250 g', contenido: 250, costo: 140, minimo: 30, compra: 1 },
  { clave: 'arcilla', nombre: 'Arcilla rosa (ejemplo)', categoria: 'materia_prima', unidad: 'g', presentacion: 'Bolsa 500 g', contenido: 500, costo: 160, minimo: 50, compra: 1 },
  { clave: 'fr-rosa', nombre: 'Fragancia de rosa (ejemplo)', categoria: 'materia_prima', unidad: 'ml', presentacion: 'Frasco 100 ml', contenido: 100, costo: 240, minimo: 20, compra: 1 },
  { clave: 'cera-soya', nombre: 'Cera de soya (ejemplo)', categoria: 'materia_prima', unidad: 'g', presentacion: 'Bolsa 5 kg', contenido: 5000, costo: 950, minimo: 1500, compra: 1 },
  { clave: 'mechas', nombre: 'Mechas de algodón (ejemplo)', categoria: 'materia_prima', unidad: 'pz', presentacion: 'Paquete 100 pz', contenido: 100, costo: 160, minimo: 20, compra: 1 },
  { clave: 'fr-vainilla', nombre: 'Fragancia de vainilla (ejemplo)', categoria: 'materia_prima', unidad: 'ml', presentacion: 'Frasco 250 ml', contenido: 250, costo: 450, minimo: 50, compra: 1 },
  { clave: 'fr-coco', nombre: 'Fragancia de coco (ejemplo)', categoria: 'materia_prima', unidad: 'ml', presentacion: 'Frasco 250 ml', contenido: 250, costo: 420, minimo: 50, compra: 1 },
  { clave: 'ae-naranja', nombre: 'Aceite esencial de naranja (ejemplo)', categoria: 'materia_prima', unidad: 'ml', presentacion: 'Frasco 100 ml', contenido: 100, costo: 260, minimo: 20, compra: 1 },
  { clave: 'ae-canela', nombre: 'Aceite esencial de canela (ejemplo)', categoria: 'materia_prima', unidad: 'ml', presentacion: 'Frasco 30 ml', contenido: 30, costo: 210, minimo: 10, compra: 1 },
  { clave: 'frascos', nombre: 'Frascos ámbar 200 ml (ejemplo)', categoria: 'envase', unidad: 'pz', presentacion: 'Caja 24 pz', contenido: 24, costo: 432, minimo: 12, compra: 1 },
  { clave: 'etiquetas', nombre: 'Etiquetas impresas (ejemplo)', categoria: 'envase', unidad: 'pz', presentacion: 'Rollo 500 pz', contenido: 500, costo: 400, minimo: 100, compra: 1 },
  { clave: 'cajas', nombre: 'Cajas de regalo kraft (ejemplo)', categoria: 'envase', unidad: 'pz', presentacion: 'Paquete 20 pz', contenido: 20, costo: 360, minimo: 5, compra: 1 },
];

// ---------- Productos de la tienda (ficha pública) ----------

interface TiendaEj {
  clave: string;
  nombre: string;
  categoria: Extract<CategoriaProducto, 'jabon' | 'vela' | 'set'>;
  presentacion: string;
  contenido_neto: string;
  precio: number;
  minimo: number;
  destacado: boolean;
  orden: number;
  color: string;
  descripcion: string;
  aroma: string;
  ingredientes: string;
  modo_uso: string;
  advertencias: string;
}

const USO_JABON =
  'Humedece la barra y tu piel, haz espuma entre las manos y enjuaga. Entre usos, déjala secar en una jabonera con escurridor para que te dure más.';
const USO_VELA =
  'La primera vez, déjala encendida hasta que se derrita toda la superficie (unas 2 horas): así se quema pareja. Antes de cada uso, recorta la mecha a 5 mm. Cuando se termine, lava el frasco con agua caliente y reutilízalo.';
const ADVERTENCIAS_VELA =
  'No dejes la vela encendida sin supervisión y apágala antes de dormir o de salir. Recorta la mecha a 5 mm antes de cada uso. Mantenla lejos de niñas, niños y mascotas, de cortinas y de corrientes de aire, sobre una superficie firme y resistente al calor. No la tengas encendida más de 4 horas seguidas y apágala cuando quede 1 cm de cera.';
const INCI_BASE = 'Sodium Olivate, Sodium Cocoate, Sodium Shea Butterate, Aqua, Glycerin';

const TIENDA: TiendaEj[] = [
  {
    clave: 'avena-miel',
    nombre: 'Jabón de avena y miel (ejemplo)',
    categoria: 'jabon',
    presentacion: 'Barra 100 g',
    contenido_neto: '100 g',
    precio: 130,
    minimo: 4,
    destacado: true,
    orden: 1,
    color: '#E3C998',
    descripcion:
      'Jabón artesanal hecho en frío en nuestro taller, con avena coloidal y miel de abeja. Limpia sin resecar y calma la piel; nos encanta después de la depilación. (Ficha de ejemplo.)',
    aroma: 'Suave, a avena y miel (sin fragancia añadida)',
    ingredientes: `${INCI_BASE}, Avena Sativa Kernel Flour, Mel`,
    modo_uso: USO_JABON,
    advertencias:
      'Sólo para uso externo. Evita el contacto con los ojos; si sucede, enjuaga con agua abundante. Si notas irritación, deja de usarlo. Contiene miel: no lo uses si tienes alergia a los productos de la abeja.',
  },
  {
    clave: 'lavanda',
    nombre: 'Jabón de lavanda (ejemplo)',
    categoria: 'jabon',
    presentacion: 'Barra 100 g',
    contenido_neto: '100 g',
    precio: 140,
    minimo: 4,
    destacado: false,
    orden: 2,
    color: '#B6A3D8',
    descripcion:
      'Jabón artesanal hecho en frío con aceite esencial de lavanda. Deja la piel suave y un aroma que relaja, ideal para la ducha de la noche. (Ficha de ejemplo.)',
    aroma: 'Lavanda (aceite esencial)',
    ingredientes: `${INCI_BASE}, Lavandula Angustifolia Oil, Linalool`,
    modo_uso: USO_JABON,
    advertencias:
      'Sólo para uso externo. Evita el contacto con los ojos. Contiene aceite esencial: si tu piel es muy sensible, pruébalo primero en una zona pequeña. Si estás embarazada, consulta a tu médico antes de usar aceites esenciales.',
  },
  {
    clave: 'carbon',
    nombre: 'Jabón de carbón activado (ejemplo)',
    categoria: 'jabon',
    presentacion: 'Barra 100 g',
    contenido_neto: '100 g',
    precio: 150,
    minimo: 4,
    destacado: false,
    orden: 3,
    color: '#5E626B',
    descripcion:
      'Jabón artesanal hecho en frío con carbón activado y un toque de eucalipto. Ayuda a limpiar a fondo la piel grasa o mixta. (Ficha de ejemplo.)',
    aroma: 'Eucalipto (aceite esencial)',
    ingredientes: `${INCI_BASE}, Charcoal Powder, Eucalyptus Globulus Leaf Oil`,
    modo_uso:
      'Haz espuma entre las manos y aplícala con un masaje suave en rostro o cuerpo; enjuaga bien. Úsalo una vez al día y déjalo secar entre usos.',
    advertencias:
      'Sólo para uso externo. Evita el contorno de los ojos. Si tu piel es seca o sensible, úsalo dos o tres veces por semana. Si notas irritación, deja de usarlo.',
  },
  {
    clave: 'rosa-arcilla',
    nombre: 'Jabón de rosa y arcilla (ejemplo)',
    categoria: 'jabon',
    presentacion: 'Barra 100 g',
    contenido_neto: '100 g',
    precio: 140,
    minimo: 4,
    destacado: false,
    orden: 4,
    color: '#E4AFA6',
    descripcion:
      'Jabón artesanal hecho en frío con arcilla rosa, que limpia con suavidad y deja la piel tersa. Pensado para piel sensible. (Ficha de ejemplo.)',
    aroma: 'Rosa suave',
    ingredientes: `${INCI_BASE}, Kaolin, Illite, Parfum`,
    modo_uso: USO_JABON,
    advertencias: 'Sólo para uso externo. Evita el contacto con los ojos; si sucede, enjuaga con agua abundante. Si notas irritación, deja de usarlo.',
  },
  {
    clave: 'lavanda-eucalipto',
    nombre: 'Vela de lavanda y eucalipto (ejemplo)',
    categoria: 'vela',
    presentacion: 'Frasco ámbar 180 g',
    contenido_neto: '180 g',
    precio: 320,
    minimo: 2,
    destacado: true,
    orden: 1,
    color: '#93BFAE',
    descripcion:
      'Vela de cera de soya vertida a mano en un frasco ámbar reutilizable, con aceites esenciales de lavanda y eucalipto. Perfecta para relajarte después de un día largo. (Ficha de ejemplo.)',
    aroma: 'Lavanda y eucalipto (aceites esenciales)',
    ingredientes: 'Cera de soya, aceite esencial de lavanda, aceite esencial de eucalipto, mecha de algodón.',
    modo_uso: USO_VELA,
    advertencias: ADVERTENCIAS_VELA,
  },
  {
    clave: 'vainilla-coco',
    nombre: 'Vela de vainilla y coco (ejemplo)',
    categoria: 'vela',
    presentacion: 'Frasco ámbar 180 g',
    contenido_neto: '180 g',
    precio: 280,
    minimo: 2,
    destacado: false,
    orden: 2,
    color: '#EEDDBB',
    descripcion:
      'Vela de cera de soya vertida a mano con fragancias de vainilla y coco: cálida, dulce y acogedora. (Ficha de ejemplo.)',
    aroma: 'Vainilla y coco',
    ingredientes: 'Cera de soya, fragancia de vainilla, fragancia de coco, mecha de algodón.',
    modo_uso: USO_VELA,
    advertencias: ADVERTENCIAS_VELA,
  },
  {
    clave: 'naranja-canela',
    nombre: 'Vela de naranja y canela (ejemplo)',
    categoria: 'vela',
    presentacion: 'Frasco ámbar 180 g',
    contenido_neto: '180 g',
    precio: 290,
    minimo: 2,
    destacado: false,
    orden: 3,
    color: '#DE8F55',
    descripcion:
      'Vela de cera de soya con aceites esenciales de naranja dulce y canela: un aroma de temporada que llena la casa. (Ficha de ejemplo.)',
    aroma: 'Naranja dulce y canela (aceites esenciales)',
    ingredientes: 'Cera de soya, aceite esencial de naranja, aceite esencial de canela, mecha de algodón.',
    modo_uso: USO_VELA,
    advertencias: ADVERTENCIAS_VELA,
  },
  {
    clave: 'set-lavanda',
    nombre: 'Set de regalo lavanda (ejemplo)',
    categoria: 'set',
    presentacion: 'Caja de regalo',
    contenido_neto: '1 jabón de 100 g y 1 vela de 180 g',
    precio: 430,
    minimo: 1,
    destacado: false,
    orden: 1,
    color: '#C7A07A',
    descripcion:
      'Un regalo listo para dar: nuestro jabón de lavanda y la vela de lavanda y eucalipto, en una caja kraft con moño. (Ficha de ejemplo.)',
    aroma: 'Lavanda y eucalipto',
    ingredientes: `Jabón: ${INCI_BASE}, Lavandula Angustifolia Oil, Linalool. Vela: cera de soya, aceites esenciales de lavanda y eucalipto, mecha de algodón.`,
    modo_uso:
      'Jabón: haz espuma entre las manos, enjuaga y déjalo secar entre usos. Vela: la primera vez, déjala encendida hasta que se derrita toda la superficie y recorta la mecha a 5 mm antes de cada uso.',
    advertencias:
      'Jabón: sólo para uso externo; evita el contacto con los ojos. Vela: no la dejes encendida sin supervisión, recorta la mecha antes de cada uso y mantenla lejos de niñas, niños y mascotas.',
  },
];

// ---------- Fórmulas (lote completo, en la unidad de cada insumo) ----------

const PROCESO_FRIO =
  'Proceso en frío. Con guantes, lentes y buena ventilación, disuelve la sosa en el agua y deja enfriar. Mezcla con los aceites a unos 40 °C hasta traza ligera';
const VELA_SOYA =
  'Derrite la cera a baño maría, agrega el aroma a unos 65 °C y vierte en los frascos con la mecha centrada. Deja asentar 2 días antes de venderla. (Instrucciones de ejemplo.)';

const FORMULAS: { producto: string; nombre: string; rendimiento: number; dias: number; instrucciones: string; items: [string, number][] }[] = [
  {
    producto: 'avena-miel',
    nombre: 'Jabón de avena y miel · lote de 12 (ejemplo)',
    rendimiento: 12,
    dias: 28,
    instrucciones: `${PROCESO_FRIO}, agrega la avena y la miel, vierte en el molde y desmolda a las 48 horas. Corta 12 barras y deja curar 4 semanas. (Instrucciones de ejemplo.)`,
    items: [['oliva', 500], ['coco', 250], ['karite', 100], ['sosa', 120], ['agua', 260], ['avena', 40], ['miel', 30], ['etiquetas', 12]],
  },
  {
    producto: 'lavanda',
    nombre: 'Jabón de lavanda · lote de 12 (ejemplo)',
    rendimiento: 12,
    dias: 28,
    instrucciones: `${PROCESO_FRIO}, agrega el aceite esencial, vierte en el molde y desmolda a las 48 horas. Corta 12 barras y deja curar 4 semanas. (Instrucciones de ejemplo.)`,
    items: [['oliva', 500], ['coco', 250], ['karite', 100], ['sosa', 120], ['agua', 260], ['ae-lavanda', 18], ['etiquetas', 12]],
  },
  {
    producto: 'carbon',
    nombre: 'Jabón de carbón activado · lote de 12 (ejemplo)',
    rendimiento: 12,
    dias: 28,
    instrucciones: `${PROCESO_FRIO}, agrega el carbón disuelto en un poco de aceite y el eucalipto. Corta 12 barras y deja curar 4 semanas. (Instrucciones de ejemplo.)`,
    items: [['oliva', 450], ['coco', 300], ['karite', 100], ['sosa', 125], ['agua', 270], ['carbon', 20], ['ae-eucalipto', 10], ['etiquetas', 12]],
  },
  {
    producto: 'rosa-arcilla',
    nombre: 'Jabón de rosa y arcilla · lote de 12 (ejemplo)',
    rendimiento: 12,
    dias: 28,
    instrucciones: `${PROCESO_FRIO}, agrega la arcilla y la fragancia. Corta 12 barras y deja curar 4 semanas. (Instrucciones de ejemplo.)`,
    items: [['oliva', 480], ['coco', 250], ['karite', 120], ['sosa', 120], ['agua', 260], ['arcilla', 30], ['fr-rosa', 15], ['etiquetas', 12]],
  },
  {
    producto: 'lavanda-eucalipto',
    nombre: 'Vela de lavanda y eucalipto · 6 frascos (ejemplo)',
    rendimiento: 6,
    dias: 2,
    instrucciones: VELA_SOYA,
    items: [['cera-soya', 1080], ['mechas', 6], ['ae-lavanda', 30], ['ae-eucalipto', 15], ['frascos', 6], ['etiquetas', 6]],
  },
  {
    producto: 'vainilla-coco',
    nombre: 'Vela de vainilla y coco · 6 frascos (ejemplo)',
    rendimiento: 6,
    dias: 2,
    instrucciones: VELA_SOYA,
    items: [['cera-soya', 1080], ['mechas', 6], ['fr-vainilla', 50], ['fr-coco', 30], ['frascos', 6], ['etiquetas', 6]],
  },
  {
    producto: 'naranja-canela',
    nombre: 'Vela de naranja y canela · 6 frascos (ejemplo)',
    rendimiento: 6,
    dias: 2,
    instrucciones: VELA_SOYA,
    items: [['cera-soya', 1080], ['mechas', 6], ['ae-naranja', 50], ['ae-canela', 6], ['frascos', 6], ['etiquetas', 6]],
  },
  {
    producto: 'set-lavanda',
    nombre: 'Set de regalo lavanda · 4 cajas (ejemplo)',
    rendimiento: 4,
    dias: 0,
    instrucciones:
      'Acomoda un jabón de lavanda y una vela de lavanda y eucalipto en cada caja con papel de seda, ciérrala con el moño y pega la etiqueta. (Instrucciones de ejemplo.)',
    items: [['lavanda', 4], ['lavanda-eucalipto', 4], ['cajas', 4], ['etiquetas', 4]],
  },
];

/**
 * Siembra el taller: proveedor, materia prima, productos de la tienda y fórmulas (en el acto), y deja como
 * eventos con fecha las compras, los lotes, las liberaciones, el descarte y la merma. Devuelve cómo agregar
 * más eventos (las ventas) y cómo ejecutarlos todos en orden.
 */
export function sembrarTaller(e: EntornoTaller) {
  const { db, hoy, staff, en, altaProducto } = e;
  const momento = (dias: number, hhmm: string) => new Date(isoDesdeLocal(sumarDias(hoy, -dias), hhmm));
  const eventos: { cuando: number; n: number; que: string; fn: () => void }[] = [];
  const evento = (dias: number, hhmm: string, que: string, fn: () => void) =>
    void eventos.push({ cuando: momento(dias, hhmm).getTime(), n: eventos.length, que, fn });

  // Proveedor, materia prima y productos (la existencia llega con compras y lotes).
  const proveedor = uuid();
  db.proveedores.push({
    id: proveedor,
    nombre: 'Materias primas para jabón y velas (ejemplo)',
    contacto: 'Ventas',
    telefono: null,
    email: null,
    ciudad: 'Querétaro',
    notas: 'Proveedor de ejemplo del modo demostración.',
    activo: true,
    creado_en: momento(105, '10:00').toISOString(),
  });
  const ids = new Map<string, string>();
  const id = (clave: string) => {
    const x = ids.get(clave);
    if (!x) throw new Error(`[demo] Falta el producto de ejemplo "${clave}".`);
    return x;
  };
  for (const m of MATERIAS)
    ids.set(
      m.clave,
      altaProducto(momento(105, '10:00'), {
        nombre: m.nombre,
        categoria: m.categoria,
        unidad_medida: m.unidad,
        presentacion: m.presentacion,
        contenido_presentacion: m.contenido,
        costo_presentacion: m.costo,
        stock_minimo: m.minimo,
        proveedor_id: proveedor,
        uso: 'produccion',
        notas: 'Materia prima de ejemplo: costos y existencias inventados.',
      }),
    );
  for (const p of TIENDA)
    ids.set(
      `p:${p.clave}`,
      altaProducto(momento(100, '09:00'), {
        nombre: p.nombre,
        categoria: p.categoria,
        unidad_medida: 'pz',
        presentacion: p.presentacion,
        contenido_presentacion: 1,
        costo_presentacion: 0, // lo pone el lote al liberarse
        stock_minimo: p.minimo,
        uso: 'venta',
        precio_venta: p.precio,
        vendible_en_linea: true,
        notas: 'Producto de ejemplo: precio, costos e ingredientes inventados.',
        descripcion: p.descripcion,
        aroma: p.aroma,
        ingredientes: p.ingredientes,
        modo_uso: p.modo_uso,
        advertencias: p.advertencias,
        contenido_neto: p.contenido_neto,
        color_hex: p.color,
        destacado: p.destacado,
        hecho_en_opalo: true,
        orden: p.orden,
      }),
    );
  const producto = (clave: string) => id(`p:${clave}`);
  // Un insumo de fórmula puede ser materia prima o un producto terminado (el set lleva un jabón y una vela).
  const insumo = (clave: string) => ids.get(clave) ?? producto(clave);

  const formula = new Map<string, string>();
  for (const f of FORMULAS)
    formula.set(
      f.producto,
      guardarFormula(en(momento(99, '10:00'), staff), {
        producto_id: producto(f.producto),
        nombre: f.nombre,
        rendimiento_piezas: f.rendimiento,
        dias_curado: f.dias,
        instrucciones: f.instrucciones,
        activa: true,
        items: f.items.map(([clave, cantidad]) => ({ insumo_id: insumo(clave), cantidad })),
      }),
    );

  // Compras de materia prima
  evento(100, '10:00', 'compra de materia prima', () =>
    registrarCompra(en(momento(100, '10:00'), staff), {
      items: MATERIAS.map((m) => ({ producto_id: id(m.clave), presentaciones: m.compra, costo_presentacion: m.costo })),
      proveedor_id: proveedor,
      fecha: sumarDias(hoy, -100),
      folio: 'MP-0412 (ejemplo)',
      notas: 'Materia prima del taller (ejemplo).',
    }),
  );
  evento(35, '10:00', 'resurtido de cera y frascos', () =>
    registrarCompra(en(momento(35, '10:00'), staff), {
      items: [
        { producto_id: id('cera-soya'), presentaciones: 1, costo_presentacion: 980 },
        { producto_id: id('frascos'), presentaciones: 1, costo_presentacion: 432 },
      ],
      proveedor_id: proveedor,
      fecha: sumarDias(hoy, -35),
      folio: 'MP-0467 (ejemplo)',
      notas: 'Resurtido para las velas (ejemplo).',
    }),
  );

  // Lotes: se registran (sale la materia prima), curan y se liberan (entran las piezas con su costo real).
  const lotes = new Map<string, string>();
  const lote = (dias: number, clave: string, nombre: string, caduca = false) =>
    evento(dias, '10:30', `lote ${nombre}`, () => {
      const elaborado = sumarDias(hoy, -dias);
      const r = registrarLote(en(momento(dias, '10:30'), staff), {
        producto_id: producto(clave),
        formula_id: formula.get(clave)!,
        caduca_en: caduca ? sumarDias(elaborado, 365) : null,
        notas: 'Lote de ejemplo.',
      });
      lotes.set(nombre, r.id);
    });
  const liberar = (dias: number, nombre: string, piezas: number | null = null) =>
    evento(dias, '09:30', `liberar ${nombre}`, () => liberarLote(en(momento(dias, '09:30'), staff), lotes.get(nombre)!, piezas));

  lote(95, 'avena-miel', 'avena y miel 1', true);
  liberar(67, 'avena y miel 1', 11); // una barra salió chueca al cortar
  lote(90, 'lavanda', 'lavanda 1', true);
  liberar(62, 'lavanda 1');
  lote(75, 'rosa-arcilla', 'rosa y arcilla 1', true);
  liberar(47, 'rosa y arcilla 1');
  lote(70, 'lavanda-eucalipto', 'vela lavanda 1');
  liberar(68, 'vela lavanda 1');
  lote(65, 'vainilla-coco', 'vela vainilla 1');
  liberar(63, 'vela vainilla 1');
  lote(45, 'avena-miel', 'avena y miel 2', true);
  liberar(17, 'avena y miel 2');
  lote(40, 'lavanda', 'lavanda 2', true);
  liberar(12, 'lavanda 2');
  lote(30, 'rosa-arcilla', 'rosa y arcilla 2', true); // terminó su curado hace 2 días: listo para liberar
  lote(28, 'naranja-canela', 'vela naranja 1');
  liberar(26, 'vela naranja 1');
  lote(22, 'lavanda-eucalipto', 'vela lavanda 2');
  liberar(20, 'vela lavanda 2');
  lote(18, 'carbon', 'carbón 1', true); // primer lote: la tienda lo muestra "disponible desde…" (en 10 días)
  lote(15, 'set-lavanda', 'set 1'); // sin curado: se libera al registrarlo
  lote(12, 'naranja-canela', 'vela naranja 2');
  evento(10, '09:30', 'descartar vela naranja 2', () =>
    descartarLote(en(momento(10, '09:30'), staff), lotes.get('vela naranja 2')!, 'La superficie de la cera se agrietó al enfriar (ejemplo).'),
  );
  evento(27, '18:00', 'merma de jabón', () =>
    ajustarInventario(en(momento(27, '18:00'), staff), producto('avena-miel'), 1, 'merma', 'Se rompió una barra al empacarla (ejemplo).'),
  );

  return {
    producto,
    momento,
    evento,
    /** Ejecuta todos los eventos en orden de fecha (los del mismo momento, en el orden en que se agregaron). */
    ejecutar(intentar: (que: string, fn: () => void) => void) {
      for (const ev of [...eventos].sort((a, b) => a.cuando - b.cuando || a.n - b.n)) intentar(ev.que, ev.fn);
    },
  };
}
