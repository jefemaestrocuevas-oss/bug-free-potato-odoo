-- =============================================================================
-- Ópalo · Arnés local: imita lo que Supabase ya trae, para probar las migraciones en
-- un PostgreSQL limpio. NO se aplica en Supabase (allí todo esto ya existe).
--
--   * esquemas auth y extensions
--   * auth.users (sólo las columnas que usamos), auth.uid(), auth.role(), auth.jwt()
--   * roles anon, authenticated, service_role (nologin; service_role con bypassrls)
--   * privilegios por defecto como Supabase: ALL a anon/authenticated/service_role sobre
--     tablas, funciones y secuencias de public (la barrera real es RLS)
--   * search_path de la base con extensions
-- =============================================================================

create schema if not exists auth;
create schema if not exists extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public, extensions, auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  created_at          timestamptz default now()
);
grant all on auth.users to service_role;

-- Igual que Supabase: lee request.jwt.claim.sub (o el claim "sub" de request.jwt.claims).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- Privilegios por defecto de Supabase sobre lo que se cree en public.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- search_path de la base como en Supabase ("$user", public, extensions).
do $$
begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end;
$$;
set search_path = "$user", public, extensions;
