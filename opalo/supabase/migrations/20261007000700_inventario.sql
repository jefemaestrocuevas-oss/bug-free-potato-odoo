-- =============================================================================
-- Ópalo · 0700 · Inventario y costos: proveedores, productos, recetas, compras, movimientos
-- Contrato: opalo/docs/ESPEC.md §4.7
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

-- Insumos de cabina y productos de venta. Stock siempre en unidad_medida (g, ml o piezas).
create table public.productos (
  id                      uuid primary key default gen_random_uuid(),
  nombre                  text not null,
  marca                   text,
  categoria               text not null default 'otro'
                            check (categoria in ('cera', 'preparacion', 'post', 'facial', 'corporal',
                                                 'desechable', 'limpieza', 'venta', 'otro')),
  unidad_medida           text not null default 'pz' check (unidad_medida in ('g', 'ml', 'pz')),
  presentacion            text,                                   -- ej. "Lata 800 g"
  contenido_presentacion  numeric(12,3) not null default 1 check (contenido_presentacion > 0),
  costo_presentacion      numeric(10,2) not null default 0 check (costo_presentacion >= 0),
  costo_unitario          numeric(12,4) generated always as (costo_presentacion / contenido_presentacion) stored,
  stock_actual            numeric(12,3) not null default 0,       -- sólo cambia con movimientos_inventario
  stock_minimo            numeric(12,3) not null default 0 check (stock_minimo >= 0),
  proveedor_id            uuid references public.proveedores (id) on delete set null,
  uso                     text not null default 'cabina' check (uso in ('cabina', 'venta', 'ambos')),
  precio_venta            numeric(10,2) check (precio_venta >= 0),
  vendible_en_linea       boolean not null default false,
  activo                  boolean not null default true,
  notas                   text,
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now()
);
create trigger productos_actualizado_en
  before update on public.productos
  for each row execute function public.tg_actualizado_en();
alter table public.productos enable row level security;

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

-- Sin UPDATE/DELETE: se corrige con un movimiento 'ajuste'. cantidad: + entra, − sale.
create table public.movimientos_inventario (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid not null references public.productos (id),
  tipo            public.tipo_movimiento not null,
  cantidad        numeric(12,3) not null check (cantidad <> 0),
  costo_unitario  numeric(12,4),
  cita_id         uuid references public.citas (id),
  compra_id       uuid references public.compras (id),
  pedido_id       uuid references public.pedidos (id),
  nota            text,
  creado_por      uuid,
  creado_en       timestamptz not null default now()
);
create index movimientos_producto_idx on public.movimientos_inventario (producto_id, creado_en desc);
create index movimientos_cita_idx on public.movimientos_inventario (cita_id) where cita_id is not null;
create index movimientos_tipo_fecha_idx on public.movimientos_inventario (tipo, creado_en);
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
