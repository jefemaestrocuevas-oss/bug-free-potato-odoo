#!/usr/bin/env node
// Ópalo · genera supabase/seed.sql a partir de datos/catalogo.json y datos/politicas/*.md
//
//   node opalo/supabase/scripts/generar_seed.mjs            → escribe opalo/supabase/seed.sql
//   node opalo/supabase/scripts/generar_seed.mjs --stdout   → lo imprime (no escribe)
//
// Sin dependencias. El SQL que sale es idempotente (se puede correr varias veces):
//   * configuración (fila 1, incluidas fecha_apertura y firma_en_linea), categorías, servicios, paquetes,
//     contraindicaciones y categorías de gasto: upsert por slug/clave; sólo se tocan las
//     columnas que vienen en el JSON (lo que el JSON no dice se deja como esté en la base).
//   * personal, horarios, cabinas y gastos recurrentes: sólo se insertan si no existen
//     (son datos que el negocio edita desde el panel; no se sobrescriben).
//   * políticas: versión 1 activa sólo si todavía no existe ninguna de ese tipo.
//     Para cambiar una política ya publicada se usa publicar_politica (versión nueva).
//   * precios null se quedan null ("por confirmar").

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raizOpalo = join(aqui, '..', '..');
const rutaCatalogo = join(raizOpalo, 'datos', 'catalogo.json');
const dirPoliticas = join(raizOpalo, 'datos', 'politicas');
const rutaSalida = join(raizOpalo, 'supabase', 'seed.sql');

const TIPOS_POLITICA = [
  'terminos',
  'privacidad',
  'cancelacion',
  'consentimiento_depilacion',
  'consentimiento_facial',
  'consentimiento_corporal',
];
const TITULOS_POR_DEFECTO = {
  terminos: 'Términos y condiciones',
  privacidad: 'Aviso de privacidad',
  cancelacion: 'Política de cancelación',
  consentimiento_depilacion: 'Consentimiento informado: depilación',
  consentimiento_facial: 'Consentimiento informado: faciales',
  consentimiento_corporal: 'Consentimiento informado: corporales',
};
const ETAPAS = ['disponible', 'segunda_etapa', 'requiere_curso'];
const ACCIONES = ['no_se_realiza', 'revisar', 'precaucion'];
const FRECUENCIAS = ['mensual', 'bimestral', 'trimestral', 'anual'];
const TIPOS_PAQUETE = ['combo', 'bono'];

const errores = [];
const falla = (msg) => errores.push(msg);

// ---------- literales SQL ----------
function lit(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`Número inválido: ${v}`);
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `array[${v.map(lit).join(', ')}]::text[]`;
  return `'${String(v).replace(/'/g, "''")}'`;
}
const tiene = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function upsert(tabla, columnas, valores, conflicto, actualizar) {
  const set = actualizar.length
    ? `do update set ${actualizar.map((c) => `${c} = excluded.${c}`).join(', ')}`
    : 'do nothing';
  return `insert into public.${tabla} (${columnas.join(', ')})\nvalues (${valores.join(', ')})\non conflict (${conflicto}) ${set};`;
}

// ---------- lectura ----------
const catalogo = JSON.parse(readFileSync(rutaCatalogo, 'utf8'));
const out = [];
const linea = (s = '') => out.push(s);

linea('-- =============================================================================');
linea('-- Ópalo · seed.sql — CATÁLOGO REAL (generado; no editar a mano)');
linea('-- Generado por supabase/scripts/generar_seed.mjs a partir de datos/catalogo.json');
linea('-- y datos/politicas/*.md. Idempotente: se puede correr varias veces.');
linea('-- Volver a correrlo restablece el catálogo (servicios, paquetes, precios,');
linea('-- contraindicaciones) a lo que diga catalogo.json.');
linea('-- =============================================================================');
linea();
linea('begin;');
linea();

// ---------- configuración ----------
const cfg = catalogo.configuracion ?? {};
const colsCfg = [
  'nombre_negocio', 'lema', 'telefono_whatsapp', 'direccion', 'zona_horaria', 'duracion_sesion_min',
  'intervalo_slots_min', 'anticipacion_min_horas', 'ventana_reserva_dias', 'horas_cancelacion',
  'tolerancia_retraso_min', 'edad_minima', 'edad_mayoria', 'vigencia_creditos_dias', 'fecha_apertura',
  'firma_en_linea',
].filter((c) => tiene(cfg, c));
// firma_en_linea (ESPEC §9): false = el consentimiento se firma en el spa (tablet de cabina);
// true = se firma al reservar en línea. Debe ser booleano (la columna no acepta null).
if (tiene(cfg, 'firma_en_linea') && typeof cfg.firma_en_linea !== 'boolean') {
  falla(`configuracion.firma_en_linea inválida "${cfg.firma_en_linea}" (usa true o false)`);
}
// fecha_apertura: 'AAAA-MM-DD' (día de apertura; antes, las clientas no reservan en línea) o null.
if (cfg.fecha_apertura != null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(cfg.fecha_apertura));
  const f = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!f || f.getUTCMonth() !== +m[2] - 1 || f.getUTCDate() !== +m[3]) {
    falla(`configuracion.fecha_apertura inválida "${cfg.fecha_apertura}" (usa AAAA-MM-DD o null)`);
  }
}
const litCfg = (c) => (c === 'fecha_apertura' && cfg[c] != null ? `${lit(cfg[c])}::date` : lit(cfg[c]));
linea('-- Configuración (fila única)');
linea(upsert('configuracion', ['id', ...colsCfg], ['1', ...colsCfg.map(litCfg)], 'id', colsCfg));
linea();

// ---------- categorías de servicio ----------
const slugsCategorias = new Set();
linea('-- Categorías de servicio');
for (const c of catalogo.categorias ?? []) {
  if (!c.slug || !c.nombre) falla(`Categoría sin slug o nombre: ${JSON.stringify(c)}`);
  slugsCategorias.add(c.slug);
  const cols = ['slug', 'nombre', ...['descripcion', 'orden'].filter((k) => tiene(c, k))];
  linea(upsert('categorias_servicio', cols, cols.map((k) => lit(c[k])), 'slug', cols.filter((k) => k !== 'slug')));
}
linea();

// ---------- servicios ----------
const slugsServicios = new Set();
const opcionalesServicio = [
  'descripcion', 'zonas_incluye', 'duracion_min', 'duracion_primera_vez_min', 'precio', 'etapa',
  'es_complemento', 'reservable_en_linea', 'vendible_en_linea', 'tipo_consentimiento', 'activo', 'orden',
];
linea('-- Servicios');
for (const s of catalogo.servicios ?? []) {
  if (!s.slug || !s.nombre) falla(`Servicio sin slug o nombre: ${JSON.stringify(s)}`);
  if (slugsServicios.has(s.slug)) falla(`Servicio repetido: ${s.slug}`);
  if (!slugsCategorias.has(s.categoria)) falla(`Servicio ${s.slug}: categoría desconocida "${s.categoria}"`);
  if (s.tipo_consentimiento != null && !TIPOS_POLITICA.includes(s.tipo_consentimiento)) {
    falla(`Servicio ${s.slug}: tipo_consentimiento inválido "${s.tipo_consentimiento}"`);
  }
  if (s.etapa != null && !ETAPAS.includes(s.etapa)) falla(`Servicio ${s.slug}: etapa inválida "${s.etapa}"`);
  if (s.precio != null && (typeof s.precio !== 'number' || s.precio < 0)) falla(`Servicio ${s.slug}: precio inválido`);
  slugsServicios.add(s.slug);

  const opc = opcionalesServicio.filter((k) => tiene(s, k));
  const cols = ['categoria_id', 'slug', 'nombre', ...opc];
  const vals = [
    `(select id from public.categorias_servicio where slug = ${lit(s.categoria)})`,
    lit(s.slug),
    lit(s.nombre),
    ...opc.map((k) => (k === 'tipo_consentimiento' && s[k] != null ? `${lit(s[k])}::public.tipo_politica`
      : k === 'etapa' && s[k] != null ? `${lit(s[k])}::public.etapa_servicio` : lit(s[k]))),
  ];
  linea(upsert('servicios', cols, vals, 'slug', cols.filter((k) => k !== 'slug')));
}
linea();

// ---------- paquetes ----------
const opcionalesPaquete = ['descripcion', 'precio', 'duracion_min', 'vigencia_dias', 'activo', 'orden'];
linea('-- Paquetes y sus servicios');
for (const p of catalogo.paquetes ?? []) {
  if (!p.slug || !p.nombre) falla(`Paquete sin slug o nombre: ${JSON.stringify(p)}`);
  if (p.tipo != null && !TIPOS_PAQUETE.includes(p.tipo)) falla(`Paquete ${p.slug}: tipo inválido "${p.tipo}"`);
  const opc = opcionalesPaquete.filter((k) => tiene(p, k));
  const cols = ['slug', 'nombre', ...(tiene(p, 'tipo') ? ['tipo'] : []), ...opc];
  const vals = [
    lit(p.slug),
    lit(p.nombre),
    ...(tiene(p, 'tipo') ? [`${lit(p.tipo)}::public.tipo_paquete`] : []),
    ...opc.map((k) => lit(p[k])),
  ];
  linea(upsert('paquetes', cols, vals, 'slug', cols.filter((k) => k !== 'slug')));

  const items = p.items ?? [];
  for (const it of items) {
    if (!slugsServicios.has(it.servicio)) falla(`Paquete ${p.slug}: servicio desconocido "${it.servicio}"`);
    linea(
      `insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)\n` +
        `select p.id, s.id, ${lit(it.cantidad ?? 1)} from public.paquetes p, public.servicios s\n` +
        ` where p.slug = ${lit(p.slug)} and s.slug = ${lit(it.servicio)}\n` +
        `on conflict (paquete_id, servicio_id) do update set cantidad = excluded.cantidad;`,
    );
  }
  // Quitar del paquete lo que ya no está en el JSON.
  linea(
    `delete from public.paquete_servicios ps using public.paquetes p\n` +
      ` where ps.paquete_id = p.id and p.slug = ${lit(p.slug)}\n` +
      `   and ps.servicio_id not in (select s.id from public.servicios s where s.slug in (${
        items.length ? items.map((i) => lit(i.servicio)).join(', ') : 'null'
      }));`,
  );
}
linea();

// ---------- contraindicaciones ----------
linea('-- Contraindicaciones (preguntas de la ficha de salud)');
for (const c of catalogo.contraindicaciones ?? []) {
  if (!c.clave || !c.pregunta) falla(`Contraindicación sin clave o pregunta: ${JSON.stringify(c)}`);
  if (c.accion != null && !ACCIONES.includes(c.accion)) falla(`Contraindicación ${c.clave}: acción inválida`);
  for (const cat of c.categorias ?? []) {
    if (!slugsCategorias.has(cat)) falla(`Contraindicación ${c.clave}: categoría desconocida "${cat}"`);
  }
  const opc = ['ayuda', 'categorias', 'accion', 'mensaje_cliente', 'activa', 'orden'].filter((k) => tiene(c, k));
  const cols = ['clave', 'pregunta', ...opc];
  const vals = [
    lit(c.clave),
    lit(c.pregunta),
    ...opc.map((k) => (k === 'accion' && c[k] != null ? `${lit(c[k])}::public.accion_contraindicacion` : lit(c[k]))),
  ];
  linea(upsert('contraindicaciones', cols, vals, 'clave', cols.filter((k) => k !== 'clave')));
}
linea();

// ---------- cabinas ----------
linea('-- Cabinas (sólo si no existen)');
(catalogo.cabinas ?? []).forEach((c, i) => {
  linea(
    `insert into public.cabinas (nombre, orden)\nselect ${lit(c.nombre)}, ${lit(c.orden ?? i + 1)}\n` +
      ` where not exists (select 1 from public.cabinas where nombre = ${lit(c.nombre)});`,
  );
});
linea();

// ---------- personal y horarios ----------
linea('-- Personal (sólo si no existe: el panel es quien lo edita) y su horario semanal');
for (const p of catalogo.personal ?? []) {
  if (!p.slug || !p.nombre) falla(`Personal sin slug o nombre: ${JSON.stringify(p)}`);
  const opc = ['titulo', 'bio', 'foto_url', 'color_agenda', 'activo', 'mostrar_en_sitio', 'orden'].filter((k) => tiene(p, k));
  const cols = ['slug', 'nombre', ...opc];
  linea(upsert('personal', cols, cols.map((k) => lit(p[k])), 'slug', []));
  const horarios = p.horarios ?? [];
  for (const h of horarios) {
    if (!(h.dia_semana >= 0 && h.dia_semana <= 6)) falla(`Horario de ${p.slug}: dia_semana inválido`);
    if (!(h.hora_fin > h.hora_inicio)) falla(`Horario de ${p.slug}: hora_fin debe ser mayor que hora_inicio`);
  }
  if (horarios.length) {
    linea(
      `insert into public.horarios (personal_id, dia_semana, hora_inicio, hora_fin)\n` +
        `select p.id, v.dia, v.ini, v.fin\n  from public.personal p\n  cross join (values\n` +
        horarios.map((h) => `    (${lit(h.dia_semana)}::smallint, ${lit(h.hora_inicio)}::time, ${lit(h.hora_fin)}::time)`).join(',\n') +
        `\n  ) as v(dia, ini, fin)\n where p.slug = ${lit(p.slug)}\n` +
        `   and not exists (select 1 from public.horarios h where h.personal_id = p.id);`,
    );
  }
}
linea();

// ---------- gastos ----------
const slugsGasto = new Set();
linea('-- Categorías de gasto');
for (const c of catalogo.categorias_gasto ?? []) {
  slugsGasto.add(c.slug);
  const cols = ['slug', 'nombre', ...(tiene(c, 'es_fijo') ? ['es_fijo'] : [])];
  linea(upsert('categorias_gasto', cols, cols.map((k) => lit(c[k])), 'slug', cols.filter((k) => k !== 'slug')));
}
linea();
linea('-- Gastos recurrentes (sólo si no existen; el próximo vencimiento se calcula al correr el seed)');
for (const g of catalogo.gastos_recurrentes ?? []) {
  if (!slugsGasto.has(g.categoria)) falla(`Gasto recurrente "${g.concepto}": categoría desconocida "${g.categoria}"`);
  if (g.frecuencia != null && !FRECUENCIAS.includes(g.frecuencia)) falla(`Gasto recurrente "${g.concepto}": frecuencia inválida`);
  if (!(g.dia_pago >= 1 && g.dia_pago <= 31)) falla(`Gasto recurrente "${g.concepto}": dia_pago inválido`);
  linea(
    `insert into public.gastos_recurrentes (categoria_id, concepto, monto_estimado, frecuencia, dia_pago, proximo_vencimiento, notas)\n` +
      `select c.id, ${lit(g.concepto)}, ${lit(g.monto_estimado ?? null)}, ${lit(g.frecuencia ?? 'mensual')}::public.frecuencia_gasto, ` +
      `${lit(g.dia_pago)}, public.primer_vencimiento(${lit(g.dia_pago)}), ${lit(g.notas ?? null)}\n` +
      `  from public.categorias_gasto c\n where c.slug = ${lit(g.categoria)}\n` +
      `   and not exists (select 1 from public.gastos_recurrentes gr where gr.concepto = ${lit(g.concepto)});`,
  );
}
linea();

// ---------- políticas ----------
linea('-- Políticas: versión 1 activa sólo si aún no existe ninguna de ese tipo');
const archivos = existsSync(dirPoliticas)
  ? readdirSync(dirPoliticas).filter((f) => f.endsWith('.md')).sort()
  : [];
let politicas = 0;
for (const archivo of archivos) {
  const tipo = basename(archivo, '.md');
  if (!TIPOS_POLITICA.includes(tipo)) {
    console.warn(`Aviso: se ignora datos/politicas/${archivo} (no es un tipo_politica válido).`);
    continue;
  }
  const texto = readFileSync(join(dirPoliticas, archivo), 'utf8').replace(/\r\n/g, '\n').replace(/^﻿/, '');
  const lineas = texto.split('\n');
  let titulo = TITULOS_POR_DEFECTO[tipo];
  let inicio = 0;
  while (inicio < lineas.length && lineas[inicio].trim() === '') inicio++;
  const m = /^#\s+(.+?)\s*#*\s*$/.exec(lineas[inicio] ?? '');
  if (m) {
    titulo = m[1].trim();
    inicio++;
  }
  const contenido = lineas.slice(inicio).join('\n').trim() + '\n';
  if (contenido.trim() === '') {
    console.warn(`Aviso: datos/politicas/${archivo} está vacío; se omite.`);
    continue;
  }
  politicas++;
  linea(
    `insert into public.politicas (tipo, version, titulo, contenido_md, activa, vigente_desde)\n` +
      `select ${lit(tipo)}::public.tipo_politica, 1, ${lit(titulo)},\n${lit(contenido)},\n  true, now()\n` +
      ` where not exists (select 1 from public.politicas where tipo = ${lit(tipo)}::public.tipo_politica);`,
  );
  linea();
}
if (politicas === 0) linea('-- (no hay archivos en datos/politicas todavía)');
linea();
linea('commit;');

if (errores.length) {
  console.error('No se generó seed.sql. Errores en datos/catalogo.json:');
  for (const e of errores) console.error(`  - ${e}`);
  process.exit(1);
}

const sql = out.join('\n') + '\n';
if (process.argv.includes('--stdout')) {
  process.stdout.write(sql);
} else {
  writeFileSync(rutaSalida, sql);
  console.log(
    `seed.sql generado: ${(catalogo.servicios ?? []).length} servicios, ${(catalogo.paquetes ?? []).length} paquetes, ` +
      `${(catalogo.contraindicaciones ?? []).length} contraindicaciones, ${politicas} ${politicas === 1 ? 'política' : 'políticas'} → ${rutaSalida}`,
  );
}
