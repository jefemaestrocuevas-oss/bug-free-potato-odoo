-- =============================================================================
-- Ópalo · 0600 · Ventas y pagos: pedidos, pagos, créditos (servicios prepagados y regalos)
-- Contrato: opalo/docs/ESPEC.md §4.6
-- =============================================================================

create sequence public.pedidos_folio_seq;

create table public.pedidos (
  id                     uuid primary key default gen_random_uuid(),
  folio                  text unique,       -- 'OP-00001' (trigger)
  cliente_id             uuid not null references public.clientes (id),
  estado                 public.estado_pedido not null default 'pendiente_pago',
  total                  numeric(10,2) not null default 0 check (total >= 0),
  metodo_pago_preferido  public.metodo_pago,
  notas                  text,
  creado_en              timestamptz not null default now(),
  pagado_en              timestamptz,
  cancelado_en           timestamptz
);
create index pedidos_cliente_idx on public.pedidos (cliente_id, creado_en desc);
create index pedidos_estado_idx on public.pedidos (estado);
alter table public.pedidos enable row level security;

create or replace function public.tg_pedidos_folio()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.folio is null then
    new.folio := 'OP-' || lpad(nextval('public.pedidos_folio_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

create trigger pedidos_folio
  before insert on public.pedidos
  for each row execute function public.tg_pedidos_folio();

-- producto_id → productos se agrega en 0700 (inventario).
create table public.pedido_items (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null references public.pedidos (id) on delete cascade,
  tipo             public.tipo_item_pedido not null,
  servicio_id      uuid references public.servicios (id),
  paquete_id       uuid references public.paquetes (id),
  producto_id      uuid,
  descripcion      text not null,
  cantidad         int not null check (cantidad > 0),
  precio_unitario  numeric(10,2) not null check (precio_unitario >= 0),
  importe          numeric(10,2) generated always as (cantidad * precio_unitario) stored,
  regalo_para      text,
  check (
    (tipo = 'servicio' and servicio_id is not null and paquete_id is null and producto_id is null) or
    (tipo = 'paquete'  and paquete_id  is not null and servicio_id is null and producto_id is null) or
    (tipo = 'producto' and producto_id is not null and servicio_id is null and paquete_id  is null)
  )
);
create index pedido_items_pedido_idx on public.pedido_items (pedido_id);
alter table public.pedido_items enable row level security;

-- Las propinas se registran aparte del ingreso del spa (son de quien atiende).
create table public.pagos (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid references public.pedidos (id),
  cita_id       uuid references public.citas (id),
  monto         numeric(10,2) not null check (monto > 0),
  propina       numeric(10,2) not null default 0 check (propina >= 0),
  metodo        public.metodo_pago not null,
  referencia    text,
  recibido_por  uuid,
  pagado_en     timestamptz not null default now(),
  notas         text,
  check (num_nonnulls(pedido_id, cita_id) >= 1)
);
create index pagos_pedido_idx on public.pagos (pedido_id) where pedido_id is not null;
create index pagos_cita_idx on public.pagos (cita_id) where cita_id is not null;
create index pagos_fecha_idx on public.pagos (pagado_en);
alter table public.pagos enable row level security;

-- Servicios prepagados (también regalos con código).
create table public.creditos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes (id),
  servicio_id     uuid references public.servicios (id),
  paquete_id      uuid references public.paquetes (id),
  cantidad        int not null check (cantidad > 0),
  usados          int not null default 0,
  pedido_item_id  uuid references public.pedido_items (id) on delete set null,
  codigo_regalo   text unique,
  regalo_para     text,
  vence_en        date,
  creado_en       timestamptz not null default now(),
  check (num_nonnulls(servicio_id, paquete_id) = 1),
  check (usados between 0 and cantidad)
);
create index creditos_cliente_idx on public.creditos (cliente_id);
alter table public.creditos enable row level security;

alter table public.cita_items
  add constraint cita_items_credito_id_fkey
  foreign key (credito_id) references public.creditos (id) on delete set null;

-- Código de regalo: 8 caracteres A-Z0-9 sin 0/O/1/I (32 símbolos → sin sesgo con bytes al azar).
create or replace function public.generar_codigo_regalo()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  c_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_codigo text;
  i int;
begin
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_codigo := '';
    for i in 0..7 loop
      v_codigo := v_codigo || substr(c_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.creditos c where c.codigo_regalo = v_codigo);
  end loop;
  return v_codigo;
end;
$$;
