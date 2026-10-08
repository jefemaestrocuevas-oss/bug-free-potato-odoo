-- =============================================================================
-- Ópalo · 0100 · Base: extensiones, tipos, utilidades, configuración y perfiles
-- Contrato: opalo/docs/ESPEC.md §2–§4.1
-- =============================================================================

-- En Supabase las extensiones viven en el esquema "extensions".
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;   -- traslape de citas (exclude using gist)
create extension if not exists pgcrypto  with schema extensions;    -- gen_random_bytes() para códigos de regalo

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.rol_usuario as enum ('cliente', 'personal', 'admin');
create type public.etapa_servicio as enum ('disponible', 'segunda_etapa', 'requiere_curso');
create type public.tipo_paquete as enum ('combo', 'bono');
create type public.accion_contraindicacion as enum ('no_se_realiza', 'revisar', 'precaucion');
create type public.tipo_politica as enum (
  'terminos', 'privacidad', 'cancelacion',
  'consentimiento_depilacion', 'consentimiento_facial', 'consentimiento_corporal'
);
create type public.estado_cita as enum ('pendiente', 'confirmada', 'en_curso', 'completada', 'cancelada', 'no_asistio');
create type public.origen_cita as enum ('web', 'whatsapp', 'mostrador', 'telefono');
create type public.estado_pedido as enum ('pendiente_pago', 'pagado', 'cancelado', 'reembolsado');
create type public.metodo_pago as enum ('efectivo', 'tarjeta', 'transferencia', 'mercado_pago', 'cortesia');
create type public.tipo_item_pedido as enum ('servicio', 'paquete', 'producto');
create type public.tipo_movimiento as enum ('compra', 'consumo', 'venta', 'ajuste', 'merma');
create type public.frecuencia_gasto as enum ('mensual', 'bimestral', 'trimestral', 'anual');

-- -----------------------------------------------------------------------------
-- Trigger genérico: actualizado_en
-- -----------------------------------------------------------------------------
create or replace function public.tg_actualizado_en()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- configuracion (una sola fila)
-- -----------------------------------------------------------------------------
create table public.configuracion (
  id                      smallint primary key default 1 check (id = 1),
  nombre_negocio          text not null default 'Ópalo',
  lema                    text,
  telefono_whatsapp       text,
  direccion               text,
  zona_horaria            text not null default 'America/Mexico_City',
  duracion_sesion_min     int  not null default 60  check (duracion_sesion_min > 0),
  intervalo_slots_min     int  not null default 60  check (intervalo_slots_min > 0),
  anticipacion_min_horas  int  not null default 2   check (anticipacion_min_horas >= 0),
  ventana_reserva_dias    int  not null default 60  check (ventana_reserva_dias >= 0),
  horas_cancelacion       int  not null default 24  check (horas_cancelacion >= 0),
  tolerancia_retraso_min  int  not null default 15  check (tolerancia_retraso_min >= 0),
  edad_minima             int  not null default 15  check (edad_minima >= 0),
  edad_mayoria            int  not null default 18  check (edad_mayoria >= 0),
  vigencia_creditos_dias  int  not null default 365 check (vigencia_creditos_dias > 0),
  actualizado_en          timestamptz not null default now()
);
comment on table public.configuracion is 'Parámetros del negocio (una sola fila, id = 1).';

create trigger configuracion_actualizado_en
  before update on public.configuracion
  for each row execute function public.tg_actualizado_en();

alter table public.configuracion enable row level security;

-- La fila existe desde el inicio: las funciones dependen de ella. seed.sql la completa.
insert into public.configuracion (id) values (1) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Utilidades (sin datos sensibles)
-- -----------------------------------------------------------------------------

-- Fila de configuración vigente.
create or replace function public.configuracion_actual()
returns public.configuracion
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select c.* from public.configuracion c where c.id = 1
$$;

-- Fecha de hoy en la zona del negocio (America/Mexico_City).
create or replace function public.hoy_local()
returns date
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select (now() at time zone coalesce(
            (select c.zona_horaria from public.configuracion c where c.id = 1),
            'America/Mexico_City'))::date
$$;

-- '4421701466' → '442 170 1466' (para mensajes a la clienta).
create or replace function public.telefono_legible(p_telefono text)
returns text
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $$
declare
  v text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
begin
  if length(v) = 12 and left(v, 2) = '52' then
    v := substr(v, 3);
  end if;
  if length(v) = 10 then
    return substr(v, 1, 3) || ' ' || substr(v, 4, 3) || ' ' || substr(v, 7, 4);
  end if;
  return nullif(p_telefono, '');
end;
$$;

-- IP de la petición (PostgREST pone los encabezados en request.headers). Null en local.
create or replace function public.ip_solicitud()
returns text
language plpgsql
stable
set search_path = public, extensions, pg_temp
as $$
declare
  v_headers text := current_setting('request.headers', true);
begin
  if v_headers is null or v_headers = '' then
    return null;
  end if;
  return nullif(btrim(split_part(v_headers::json ->> 'x-forwarded-for', ',', 1)), '');
exception when others then
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- perfiles (uno por usuario de auth.users)
-- -----------------------------------------------------------------------------
create table public.perfiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  rol             public.rol_usuario not null default 'cliente',
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
comment on table public.perfiles is 'Rol de cada usuario. Sólo admin cambia el rol.';

create trigger perfiles_actualizado_en
  before update on public.perfiles
  for each row execute function public.tg_actualizado_en();

alter table public.perfiles enable row level security;
