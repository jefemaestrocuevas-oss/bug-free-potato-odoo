-- =============================================================================
-- Ópalo · 0300 · Personas: clientas, personal, capacitaciones; roles y alta de usuarios
-- Contrato: opalo/docs/ESPEC.md §3, §4.1, §4.2
-- =============================================================================

create table public.clientes (
  id                  uuid primary key default gen_random_uuid(),
  usuario_id          uuid unique references auth.users (id) on delete set null,
  nombre              text not null check (btrim(nombre) <> ''),
  apellidos           text,
  telefono            text,
  email               text,
  fecha_nacimiento    date,
  como_nos_conocio    text,
  acepta_promociones  boolean not null default false,
  notas_internas      text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on column public.clientes.notas_internas is 'Sólo personal. No se muestra a la clienta.';
create unique index clientes_email_unico on public.clientes (lower(email)) where email is not null;

create trigger clientes_actualizado_en
  before update on public.clientes
  for each row execute function public.tg_actualizado_en();
alter table public.clientes enable row level security;

create table public.personal (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid unique references auth.users (id) on delete set null,
  slug              text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  nombre            text not null,
  titulo            text,
  bio               text,
  foto_url          text,
  color_agenda      text not null default '#5C6B3F',
  activo            boolean not null default true,
  mostrar_en_sitio  boolean not null default true,
  orden             int not null default 0,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
create trigger personal_actualizado_en
  before update on public.personal
  for each row execute function public.tg_actualizado_en();
alter table public.personal enable row level security;

create table public.capacitaciones (
  id                uuid primary key default gen_random_uuid(),
  personal_id       uuid not null references public.personal (id) on delete cascade,
  nombre            text not null,
  institucion       text,
  tipo              text not null default 'curso'
                      check (tipo in ('curso', 'taller', 'diplomado', 'certificacion', 'congreso')),
  fecha             date,
  horas             numeric(6,1) check (horas >= 0),
  constancia_url    text,
  mostrar_en_sitio  boolean not null default true,
  notas             text,
  creado_en         timestamptz not null default now()
);
create index capacitaciones_personal_idx on public.capacitaciones (personal_id, fecha desc);
alter table public.capacitaciones enable row level security;

-- Sin filas para un miembro del personal = hace todos los servicios.
create table public.personal_servicios (
  personal_id  uuid not null references public.personal (id) on delete cascade,
  servicio_id  uuid not null references public.servicios (id) on delete cascade,
  primary key (personal_id, servicio_id)
);
alter table public.personal_servicios enable row level security;

-- -----------------------------------------------------------------------------
-- Funciones de rol (las usan las políticas RLS)
-- -----------------------------------------------------------------------------

-- Rol del usuario que llama: null si es visitante; 'cliente' si no tiene perfil.
create or replace function public.mi_rol()
returns public.rol_usuario
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select case
           when auth.uid() is null then null
           else coalesce((select p.rol from public.perfiles p where p.id = auth.uid()),
                         'cliente'::public.rol_usuario)
         end
$$;

-- personal o admin
create or replace function public.es_personal()
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(public.mi_rol() in ('personal', 'admin'), false)
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(public.mi_rol() = 'admin', false)
$$;

-- Fila de clientes de la usuaria que llama (null si no hay sesión).
create or replace function public.mi_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select c.id from public.clientes c where auth.uid() is not null and c.usuario_id = auth.uid()
$$;

-- -----------------------------------------------------------------------------
-- Alta de usuarios: perfil + clienta (nueva o vinculada por email)
-- raw_user_meta_data: { nombre, apellidos, telefono, fecha_nacimiento ('YYYY-MM-DD') }
--
-- Vincular con una clienta que ya registró el personal (mostrador, WhatsApp) da acceso a su
-- historial (citas, ficha de salud, consentimientos, créditos). Por eso SÓLO se vincula cuando
-- el correo ya está confirmado (auth.users.email_confirmed_at): al registrarse si ya viene
-- confirmado, o después, cuando lo confirma (trigger on_auth_user_confirmed). Mientras no lo
-- confirme no se le crea otra ficha, para no duplicarla. Requiere "Confirm email" activo en
-- Supabase Auth (ver supabase/README.md §3).
-- -----------------------------------------------------------------------------
create or replace function public.tg_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_email     text  := lower(nullif(btrim(new.email), ''));
  v_nombre    text  := nullif(btrim(v_meta ->> 'nombre'), '');
  v_apellidos text  := nullif(btrim(v_meta ->> 'apellidos'), '');
  v_telefono  text  := nullif(btrim(v_meta ->> 'telefono'), '');
  v_fn        date;
  v_cliente   uuid;
begin
  begin
    v_fn := nullif(btrim(v_meta ->> 'fecha_nacimiento'), '')::date;
  exception when others then
    v_fn := null;
  end;

  insert into public.perfiles (id) values (new.id) on conflict (id) do nothing;

  if exists (select 1 from public.clientes c where c.usuario_id = new.id) then
    return new;
  end if;

  if v_email is not null then
    select c.id into v_cliente
      from public.clientes c
     where lower(c.email) = v_email and c.usuario_id is null
     order by c.creado_en
     limit 1
     for update;
  end if;

  if v_cliente is not null then
    if new.email_confirmed_at is null then
      -- Aún no demuestra que el correo es suyo: se vincula cuando lo confirme.
      return new;
    end if;
    -- La clienta ya existía (la registró el personal): se vincula y se completan huecos.
    update public.clientes c
       set usuario_id       = new.id,
           apellidos        = coalesce(c.apellidos, v_apellidos),
           telefono         = coalesce(c.telefono, v_telefono),
           fecha_nacimiento = coalesce(c.fecha_nacimiento, v_fn)
     where c.id = v_cliente;
  else
    -- Si otra cuenta ya usa ese email en clientes, se crea sin email para no chocar.
    if v_email is not null and exists (select 1 from public.clientes c where lower(c.email) = v_email) then
      v_email := null;
    end if;
    insert into public.clientes (usuario_id, nombre, apellidos, telefono, email, fecha_nacimiento)
    values (new.id,
            coalesce(v_nombre, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Clienta'),
            v_apellidos, v_telefono, v_email, v_fn);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_nuevo_usuario();

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.tg_nuevo_usuario();

-- Al borrar una cuenta de Auth, la ficha de la clienta se conserva (historial; usuario_id → null
-- por la llave foránea) pero se le quita el correo: así nadie puede reclamarla después
-- registrándose con ese correo. Si la misma clienta vuelve, el personal le captura de nuevo su
-- correo y, al confirmarlo ella, se vuelve a vincular.
create or replace function public.tg_usuario_borrado()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  update public.clientes set email = null where usuario_id = old.id;
  return old;
end;
$$;

create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function public.tg_usuario_borrado();

-- -----------------------------------------------------------------------------
-- Una clienta sólo puede cambiar sus datos básicos (ESPEC §3 / §6.1).
-- El privilegio por columnas no basta porque personal y clientas comparten el rol
-- "authenticated" de Postgres; este trigger es el candado para las clientas.
-- La fecha de nacimiento la captura una sola vez (decide si es menor de edad y si necesita
-- tutor); después sólo el personal la corrige.
-- (No es security definer a propósito: current_user debe ser el rol que llama.)
-- -----------------------------------------------------------------------------
create or replace function public.tg_clientes_proteger()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.es_personal() then
    if new.id               is distinct from old.id
       or new.usuario_id       is distinct from old.usuario_id
       or new.email            is distinct from old.email
       or new.como_nos_conocio is distinct from old.como_nos_conocio
       or new.notas_internas   is distinct from old.notas_internas
       or new.creado_en        is distinct from old.creado_en then
      raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
    end if;
    if old.fecha_nacimiento is not null and new.fecha_nacimiento is distinct from old.fecha_nacimiento then
      raise exception using
        message = format('Tu fecha de nacimiento ya está registrada; si hay un error, escríbenos por WhatsApp al %s.',
                         coalesce(public.telefono_legible((public.configuracion_actual()).telefono_whatsapp),
                                  '442 170 1466')),
        errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger clientes_proteger
  before update on public.clientes
  for each row execute function public.tg_clientes_proteger();
