-- =============================================================================
-- Ópalo · 0800 · Gastos: categorías, gastos recurrentes (luz, renta…) y gastos
-- Contrato: opalo/docs/ESPEC.md §4.8
-- =============================================================================

create table public.categorias_gasto (
  id       uuid primary key default gen_random_uuid(),
  slug     text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  nombre   text not null,
  es_fijo  boolean not null default false
);
alter table public.categorias_gasto enable row level security;

create table public.gastos_recurrentes (
  id                   uuid primary key default gen_random_uuid(),
  categoria_id         uuid not null references public.categorias_gasto (id),
  concepto             text not null,
  monto_estimado       numeric(10,2) check (monto_estimado >= 0),
  frecuencia           public.frecuencia_gasto not null default 'mensual',
  dia_pago             smallint not null check (dia_pago between 1 and 31),
  proximo_vencimiento  date,
  activo               boolean not null default true,
  notas                text,
  creado_en            timestamptz not null default now()
);
alter table public.gastos_recurrentes enable row level security;

create table public.gastos (
  id               uuid primary key default gen_random_uuid(),
  categoria_id     uuid not null references public.categorias_gasto (id),
  concepto         text not null,
  monto            numeric(10,2) not null check (monto > 0),
  fecha            date not null default public.hoy_local(),
  periodo          date not null,     -- primer día del mes al que corresponde (trigger: date_trunc('month', fecha))
  metodo_pago      public.metodo_pago,
  proveedor        text,
  comprobante_url  text,
  recurrente_id    uuid references public.gastos_recurrentes (id) on delete set null,
  notas            text,
  registrado_por   uuid default auth.uid(),
  creado_en        timestamptz not null default now(),
  check (periodo = date_trunc('month', periodo)::date)
);
create index gastos_periodo_idx on public.gastos (periodo);
create index gastos_fecha_idx on public.gastos (fecha);
alter table public.gastos enable row level security;

-- Días del mes de una fecha.
create or replace function public.dias_del_mes(p_fecha date)
returns int
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select extract(day from (date_trunc('month', p_fecha) + interval '1 month - 1 day'))::int
$$;

-- Siguiente vencimiento: un periodo después de p_desde, en el día de pago (ajustado a fin de mes).
create or replace function public.avanzar_vencimiento(p_desde date, p_frecuencia public.frecuencia_gasto, p_dia_pago int)
returns date
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $$
declare
  v_meses int := case p_frecuencia
                   when 'mensual' then 1
                   when 'bimestral' then 2
                   when 'trimestral' then 3
                   else 12
                 end;
  v_mes date := (date_trunc('month', p_desde) + make_interval(months => v_meses))::date;
begin
  return v_mes + (least(p_dia_pago, public.dias_del_mes(v_mes)) - 1);
end;
$$;

-- Primer vencimiento en o después de p_desde (hoy por defecto) para un día de pago.
create or replace function public.primer_vencimiento(p_dia_pago int, p_desde date default null)
returns date
language plpgsql
stable
set search_path = public, extensions, pg_temp
as $$
declare
  v_desde date := coalesce(p_desde, public.hoy_local());
  v_mes date := date_trunc('month', v_desde)::date;
  v_fecha date := v_mes + (least(p_dia_pago, public.dias_del_mes(v_mes)) - 1);
begin
  if v_fecha < v_desde then
    v_fecha := public.avanzar_vencimiento(v_fecha, 'mensual', p_dia_pago);
  end if;
  return v_fecha;
end;
$$;

-- periodo = primer día del mes (si no viene, el de la fecha).
create or replace function public.tg_gastos_periodo()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  new.periodo := date_trunc('month', coalesce(new.periodo, new.fecha))::date;
  return new;
end;
$$;

create trigger gastos_periodo
  before insert or update on public.gastos
  for each row execute function public.tg_gastos_periodo();

-- Al registrar el pago de un gasto recurrente, su próximo vencimiento avanza un periodo.
create or replace function public.tg_gastos_avanzar_recurrente()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.recurrente_id is not null then
    update public.gastos_recurrentes gr
       set proximo_vencimiento = public.avanzar_vencimiento(
             coalesce(gr.proximo_vencimiento, new.fecha), gr.frecuencia, gr.dia_pago)
     where gr.id = new.recurrente_id;
  end if;
  return new;
end;
$$;

create trigger gastos_avanzar_recurrente
  after insert on public.gastos
  for each row execute function public.tg_gastos_avanzar_recurrente();
