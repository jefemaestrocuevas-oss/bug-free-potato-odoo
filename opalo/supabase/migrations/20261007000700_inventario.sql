-- =============================================================================
-- Ópalo · 0700 · Inventario y costos: proveedores, productos, recetas, compras, taller, movimientos
-- Contrato: opalo/docs/ESPEC.md §4.7 y §10 (tienda propia y taller)
-- =============================================================================

create table public.proveedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  contacto   text,
  telefono   text,
  email      text,
  ciudad     text,
  notas      text,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);
alter table public.proveedores enable row level security;

-- Insumos de cabina, materia prima del taller y productos de venta (también los jabones, velas y
-- sets hechos en Ópalo, ESPEC §10.1). Stock siempre en unidad_medida (g, ml o piezas).
--   categoria  cabina: cera, preparacion, post, facial, corporal, desechable, limpieza
--              taller: materia_prima, envase · tienda propia: jabon, vela, set · venta, otro
--   uso        cabina | venta | ambos | produccion (materia prima del taller)
--   Ficha pública (la ve el sitio en productos_tienda): slug, descripcion, aroma, ingredientes,
--   modo_uso, advertencias, contenido_neto, foto_url, color_hex, destacado, hecho_en_opalo, orden.
create table public.productos (
  id                      uuid primary key default gen_random_uuid(),
  nombre                  text not null check (btrim(nombre) <> ''),
  marca                   text,
  categoria               text not null default 'otro'
                            check (categoria in ('cera', 'preparacion', 'post', 'facial', 'corporal',
                                                 'desechable', 'limpieza', 'venta', 'otro',
                                                 'materia_prima', 'envase', 'jabon', 'vela', 'set')),
  unidad_medida           text not null default 'pz' check (unidad_medida in ('g', 'ml', 'pz')),
  presentacion            text,                                   -- ej. "Lata 800 g"
  contenido_presentacion  numeric(12,3) not null default 1 check (contenido_presentacion > 0),
  costo_presentacion      numeric(10,2) not null default 0 check (costo_presentacion >= 0),
  costo_unitario          numeric(12,4) generated always as (costo_presentacion / contenido_presentacion) stored,
  stock_actual            numeric(12,3) not null default 0,       -- sólo cambia con movimientos_inventario
  stock_minimo            numeric(12,3) not null default 0 check (stock_minimo >= 0),
  proveedor_id            uuid references public.proveedores (id) on delete set null,
  uso                     text not null default 'cabina' check (uso in ('cabina', 'venta', 'ambos', 'produccion')),
  precio_venta            numeric(10,2) check (precio_venta >= 0),
  vendible_en_linea       boolean not null default false,
  activo                  boolean not null default true,
  notas                   text,
  -- Ficha pública (tienda)
  slug                    text unique check (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  descripcion             text,
  aroma                   text,
  ingredientes            text,                                   -- lista para etiqueta (INCI cuando aplique)
  modo_uso                text,
  advertencias            text,
  contenido_neto          text,                                   -- ej. "100 g", "180 g"
  foto_url                text,
  color_hex               text check (color_hex ~ '^#[0-9a-fA-F]{6}$'),   -- color de la ilustración sin foto
  destacado               boolean not null default false,
  hecho_en_opalo          boolean not null default false,
  orden                   int not null default 0,
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now()
);
create index productos_tienda_idx on public.productos (destacado desc, categoria, orden, nombre)
  where activo and vendible_en_linea and precio_venta is not null;
create trigger productos_actualizado_en
  before update on public.productos
  for each row execute function public.tg_actualizado_en();
alter table public.productos enable row level security;

-- Reglas de la ficha (también para escrituras directas del panel, ESPEC §6.1):
--   * jabones, velas y sets se manejan por pieza (unidad 'pz', contenido 1): así costo_unitario es
--     el costo de una pieza (ESPEC §10.2);
--   * slug: se normaliza ("Jabón de Avena" → jabon-de-avena); si no viene y el producto se vende en
--     línea o es de la tienda propia, se arma con el nombre (con -2, -3… si ya existe), porque la
--     ficha pública vive en /tienda/:slug. Uno repetido responde con un mensaje claro.
create or replace function public.tg_productos_ficha()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_base text;
  v_slug text;
  n int := 1;
begin
  if new.categoria in ('jabon', 'vela', 'set')
     and (new.unidad_medida <> 'pz' or new.contenido_presentacion <> 1) then
    raise exception using
      message = 'Los jabones, velas y sets se manejan por pieza: unidad "pz" y contenido 1.',
      errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug and new.slug is not null then
    return new;
  end if;

  if nullif(btrim(new.slug), '') is not null then
    v_base := public.slug_de(new.slug);
    if v_base = '' then
      raise exception using message = 'El identificador (slug) del producto debe tener letras o números.', errcode = 'P0001';
    end if;
    if exists (select 1 from public.productos p where p.slug = v_base and p.id <> new.id) then
      raise exception using message = 'Ya existe otro producto con ese identificador (slug).', errcode = 'P0001';
    end if;
    new.slug := v_base;
  elsif new.vendible_en_linea or new.categoria in ('jabon', 'vela', 'set') then
    v_base := coalesce(nullif(public.slug_de(new.nombre), ''), 'producto');
    v_slug := v_base;
    while exists (select 1 from public.productos p where p.slug = v_slug and p.id <> new.id) loop
      n := n + 1;
      v_slug := v_base || '-' || n;
    end loop;
    new.slug := v_slug;
  else
    new.slug := null;
  end if;
  return new;
end;
$$;

create trigger productos_ficha
  before insert or update on public.productos
  for each row execute function public.tg_productos_ficha();

alter table public.pedido_items
  add constraint pedido_items_producto_id_fkey
  foreign key (producto_id) references public.productos (id);

-- Cuánto se gasta de cada producto por servicio (en unidad_medida del producto).
create table public.recetas_servicio (
  servicio_id  uuid not null references public.servicios (id) on delete cascade,
  producto_id  uuid not null references public.productos (id) on delete cascade,
  cantidad     numeric(12,3) not null check (cantidad > 0),
  notas        text,
  primary key (servicio_id, producto_id)
);
create index recetas_servicio_producto_idx on public.recetas_servicio (producto_id);
alter table public.recetas_servicio enable row level security;

create table public.compras (
  id              uuid primary key default gen_random_uuid(),
  proveedor_id    uuid references public.proveedores (id) on delete set null,
  fecha           date not null default public.hoy_local(),
  folio           text,
  total           numeric(10,2) not null default 0 check (total >= 0),
  notas           text,
  registrada_por  uuid,
  creado_en       timestamptz not null default now()
);
create index compras_fecha_idx on public.compras (fecha);
alter table public.compras enable row level security;

create table public.compra_items (
  id                  uuid primary key default gen_random_uuid(),
  compra_id           uuid not null references public.compras (id) on delete cascade,
  producto_id         uuid not null references public.productos (id),
  presentaciones      numeric(12,3) not null check (presentaciones > 0),
  costo_presentacion  numeric(10,2) not null check (costo_presentacion >= 0)
);
create index compra_items_compra_idx on public.compra_items (compra_id);
alter table public.compra_items enable row level security;

-- -----------------------------------------------------------------------------
-- Taller (producción de jabones y velas, ESPEC §10.2)
-- -----------------------------------------------------------------------------

-- Fórmula de un producto terminado: qué materia prima lleva un lote completo y cuántas piezas rinde.
create table public.formulas (
  id                  uuid primary key default gen_random_uuid(),
  producto_id         uuid not null references public.productos (id),     -- producto terminado
  nombre              text not null check (btrim(nombre) <> ''),
  rendimiento_piezas  numeric(10,2) not null check (rendimiento_piezas > 0), -- piezas por lote
  dias_curado         int not null default 0 check (dias_curado >= 0),      -- jabón en frío ≈ 28–42; vela ≈ 0–14
  instrucciones       text,
  activa              boolean not null default true,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create index formulas_producto_idx on public.formulas (producto_id);
create trigger formulas_actualizado_en
  before update on public.formulas
  for each row execute function public.tg_actualizado_en();
alter table public.formulas enable row level security;

-- Insumos de la fórmula, en la unidad del insumo, para un lote completo.
create table public.formula_items (
  formula_id  uuid not null references public.formulas (id) on delete cascade,
  insumo_id   uuid not null references public.productos (id),
  cantidad    numeric(12,3) not null check (cantidad > 0),
  primary key (formula_id, insumo_id)
);
create index formula_items_insumo_idx on public.formula_items (insumo_id);
alter table public.formula_items enable row level security;

-- Lote de producción. Nace "en curado" (la materia prima ya salió del inventario); al liberarse
-- entran las piezas al inventario con su costo real; si se descarta, su costo es merma del mes.
--   codigo       JAB|VEL|SET|PRD-AAMMDD-NN (trigger, según la categoría del producto y la fecha de elaboración)
--   listo_desde  elaborado_en + dias_curado
--   costo_unitario  costo_materiales / piezas (provisional con las planeadas; real al liberar)
create table public.lotes_produccion (
  id                uuid primary key default gen_random_uuid(),
  codigo            text unique,
  producto_id       uuid not null references public.productos (id),
  formula_id        uuid references public.formulas (id) on delete set null,
  elaborado_en      date not null default public.hoy_local(),
  piezas_planeadas  numeric(10,2) not null check (piezas_planeadas > 0),
  piezas_obtenidas  numeric(10,2) check (piezas_obtenidas > 0),
  dias_curado       int not null default 0 check (dias_curado >= 0),
  listo_desde       date not null generated always as (elaborado_en + dias_curado) stored,
  caduca_en         date check (caduca_en >= elaborado_en),
  costo_materiales  numeric(12,2) not null default 0 check (costo_materiales >= 0),
  costo_unitario    numeric(12,4) check (costo_unitario >= 0),
  estado            public.estado_lote not null default 'en_curado',
  liberado_en       timestamptz,
  descartado_en     timestamptz,                    -- el mes de la merma (v_resultado_mensual)
  motivo_descarte   text,
  notas             text,
  creado_por        uuid,
  creado_en         timestamptz not null default now(),
  check (estado <> 'disponible' or (liberado_en is not null and piezas_obtenidas is not null)),
  check (estado <> 'descartado' or (descartado_en is not null and motivo_descarte is not null))
);
create index lotes_producto_idx on public.lotes_produccion (producto_id, estado);
create index lotes_estado_idx on public.lotes_produccion (estado, listo_desde);
alter table public.lotes_produccion enable row level security;

create or replace function public.tg_lotes_codigo()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_prefijo text;
  v_n int;
begin
  if new.codigo is not null then
    return new;
  end if;
  select case p.categoria when 'jabon' then 'JAB' when 'vela' then 'VEL' when 'set' then 'SET' else 'PRD' end
    into v_prefijo
    from public.productos p where p.id = new.producto_id;
  v_prefijo := coalesce(v_prefijo, 'PRD') || '-' || to_char(new.elaborado_en, 'YYMMDD') || '-';
  -- Dos lotes del mismo tipo y día registrados al mismo tiempo se forman (no repiten número).
  perform pg_advisory_xact_lock(hashtext('opalo.lote.' || v_prefijo));
  select coalesce(max(substr(l.codigo, length(v_prefijo) + 1)::int), 0) + 1 into v_n
    from public.lotes_produccion l
   where l.codigo like v_prefijo || '%'
     and substr(l.codigo, length(v_prefijo) + 1) ~ '^[0-9]+$';
  new.codigo := v_prefijo || lpad(v_n::text, 2, '0');
  return new;
end;
$$;

create trigger lotes_codigo
  before insert on public.lotes_produccion
  for each row execute function public.tg_lotes_codigo();

-- Sin UPDATE/DELETE: se corrige con un movimiento 'ajuste'. cantidad: + entra, − sale.
-- tipo: compra (+), consumo (− en cabina), venta (−), ajuste (±), merma (−),
--       produccion (+ piezas de un lote liberado), insumo_produccion (− materia prima de un lote).
create table public.movimientos_inventario (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid not null references public.productos (id),
  tipo            public.tipo_movimiento not null,
  cantidad        numeric(12,3) not null check (cantidad <> 0),
  costo_unitario  numeric(12,4),
  cita_id         uuid references public.citas (id),
  compra_id       uuid references public.compras (id),
  pedido_id       uuid references public.pedidos (id),
  lote_id         uuid references public.lotes_produccion (id),   -- producción del taller
  nota            text,
  creado_por      uuid,
  creado_en       timestamptz not null default now()
);
create index movimientos_producto_idx on public.movimientos_inventario (producto_id, creado_en desc);
create index movimientos_cita_idx on public.movimientos_inventario (cita_id) where cita_id is not null;
create index movimientos_tipo_fecha_idx on public.movimientos_inventario (tipo, creado_en);
create index movimientos_lote_idx on public.movimientos_inventario (lote_id) where lote_id is not null;
alter table public.movimientos_inventario enable row level security;

create or replace function public.tg_movimiento_stock()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  update public.productos p
     set stock_actual = p.stock_actual + new.cantidad
   where p.id = new.producto_id;
  return new;
end;
$$;

create trigger movimientos_stock
  after insert on public.movimientos_inventario
  for each row execute function public.tg_movimiento_stock();
