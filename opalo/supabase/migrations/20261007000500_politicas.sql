-- =============================================================================
-- Ópalo · 0500 · Políticas, aceptaciones, ficha de salud y consentimiento informado
-- Contrato: opalo/docs/ESPEC.md §4.5
-- =============================================================================

create table public.politicas (
  id             uuid primary key default gen_random_uuid(),
  tipo           public.tipo_politica not null,
  version        int  not null check (version > 0),
  titulo         text not null,
  contenido_md   text not null,
  hash_sha256    text,                 -- lo llena el trigger: sha256 hex de contenido_md
  activa         boolean not null default false,
  vigente_desde  timestamptz,
  creado_en      timestamptz not null default now(),
  unique (tipo, version)
);
create unique index politicas_una_activa_por_tipo on public.politicas (tipo) where activa;
alter table public.politicas enable row level security;

create or replace function public.tg_politicas_hash()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and (new.contenido_md is distinct from old.contenido_md
          or new.titulo is distinct from old.titulo
          or new.tipo is distinct from old.tipo
          or new.version is distinct from old.version)
     and (exists (select 1 from public.aceptaciones_politica a where a.politica_id = old.id)
          or exists (select 1 from public.consentimientos c where c.politica_id = old.id)) then
    raise exception using
      message = 'Esta versión ya fue aceptada o firmada por alguna clienta: publica una versión nueva.',
      errcode = 'P0001';
  end if;
  new.hash_sha256 := encode(sha256(convert_to(new.contenido_md, 'UTF8')), 'hex');
  if new.activa and new.vigente_desde is null then
    new.vigente_desde := now();
  end if;
  return new;
end;
$$;

create table public.aceptaciones_politica (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references public.clientes (id) on delete cascade,
  politica_id  uuid not null references public.politicas (id),
  aceptada_en  timestamptz not null default now(),
  ip           text,
  user_agent   text,
  unique (cliente_id, politica_id)
);
alter table public.aceptaciones_politica enable row level security;

-- Historial: la última ficha es la vigente. Datos personales sensibles (LFPDPPP).
create table public.fichas_salud (
  id                      uuid primary key default gen_random_uuid(),
  cliente_id              uuid not null references public.clientes (id) on delete cascade,
  respuestas              jsonb not null default '{}'::jsonb check (jsonb_typeof(respuestas) = 'object'),
  detalles                jsonb not null default '{}'::jsonb check (jsonb_typeof(detalles) = 'object'),
  alergias                text,
  medicamentos            text,
  observaciones           text,
  acepta_datos_sensibles  boolean not null check (acepta_datos_sensibles),
  creado_en               timestamptz not null default now()
);
create index fichas_salud_cliente_idx on public.fichas_salud (cliente_id, creado_en desc);
alter table public.fichas_salud enable row level security;

-- Inmutable: nadie tiene UPDATE/DELETE (sólo service_role, que se salta RLS y privilegios).
create table public.consentimientos (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references public.clientes (id),
  cita_id          uuid references public.citas (id) on delete set null,
  politica_id      uuid not null references public.politicas (id),
  ficha_salud_id   uuid references public.fichas_salud (id) on delete set null,
  nombre_firmante  text not null check (btrim(nombre_firmante) <> ''),
  firma_svg        text not null check (btrim(firma_svg) <> ''),
  es_menor         boolean not null default false,
  tutor_nombre     text,
  documento_hash   text,
  ip               text,
  user_agent       text,
  firmado_en       timestamptz not null default now()
);
create index consentimientos_cliente_idx on public.consentimientos (cliente_id, firmado_en desc);
create index consentimientos_cita_idx on public.consentimientos (cita_id);
alter table public.consentimientos enable row level security;

create trigger politicas_hash
  before insert or update on public.politicas
  for each row execute function public.tg_politicas_hash();

-- documento_hash = sha256(politica.hash_sha256 || ficha.id || firmado_en en UTC ISO-8601)
create or replace function public.tg_consentimiento_hash()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash_politica text;
begin
  new.firmado_en := coalesce(new.firmado_en, now());
  select p.hash_sha256 into v_hash_politica from public.politicas p where p.id = new.politica_id;
  new.documento_hash := encode(sha256(convert_to(
      coalesce(v_hash_politica, '')
      || coalesce(new.ficha_salud_id::text, '')
      || to_char(new.firmado_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'UTF8')), 'hex');
  return new;
end;
$$;

create trigger consentimientos_hash
  before insert on public.consentimientos
  for each row execute function public.tg_consentimiento_hash();
