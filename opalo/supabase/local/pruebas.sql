-- =============================================================================
-- Ópalo · Ayudantes para las pruebas locales (esquema "pruebas"). SÓLO LOCAL.
-- probar_local.sh lo aplica después de seed_demo.sql y antes de tests/*.sql.
--
-- Uso dentro de un DO block:
--   perform pruebas.como_anon();                 -- visitante
--   perform pruebas.como(v_usuario);             -- usuario con sesión (rol authenticated)
--   perform pruebas.como_postgres();             -- de vuelta al dueño (sin RLS)
--   perform pruebas.espera_error('select …', 'Mensaje esperado.');
--   perform pruebas.afirma(condición, 'qué se esperaba');
-- =============================================================================

drop schema if exists pruebas cascade;
create schema pruebas;
grant usage on schema pruebas to anon, authenticated, service_role;

-- Cambiar de identidad (SET LOCAL: dura hasta el fin de la transacción de la prueba).
create function pruebas.como_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
end $$;

create function pruebas.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_usuario::text, true);
  set local role authenticated;
end $$;

create function pruebas.como_postgres() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

create function pruebas.afirma(p_condicion boolean, p_que text) returns void language plpgsql as $$
begin
  if p_condicion is distinct from true then
    raise exception 'FALLA: %', p_que;
  end if;
end $$;

create function pruebas.igual(p_obtenido anyelement, p_esperado anyelement, p_que text) returns void language plpgsql as $$
begin
  if p_obtenido is distinct from p_esperado then
    raise exception 'FALLA: % (esperado: %, obtenido: %)', p_que, p_esperado, p_obtenido;
  end if;
end $$;

-- Ejecuta p_sql y exige que falle con el mensaje indicado (exacto).
create function pruebas.espera_error(p_sql text, p_mensaje text) returns void language plpgsql as $$
declare
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg is distinct from p_mensaje then
      raise exception 'FALLA: se esperaba el error «%» y llegó «%» en: %', p_mensaje, v_msg, p_sql;
    end if;
    return;
  end;
  raise exception 'FALLA: se esperaba el error «%» y no hubo error en: %', p_mensaje, p_sql;
end $$;

-- Ejecuta p_sql y exige que falle por falta de privilegios (42501) o por un mensaje dado.
create function pruebas.espera_rechazo(p_sql text) returns void language plpgsql as $$
declare
  v_estado text;
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
    if v_estado not in ('42501', 'P0001') then
      raise exception 'FALLA: rechazo inesperado (% %) en: %', v_estado, v_msg, p_sql;
    end if;
    return;
  end;
  raise exception 'FALLA: se esperaba que se rechazara: %', p_sql;
end $$;

-- Cuántas filas ve el rol actual en una tabla/vista (0 si ni siquiera puede leerla).
create function pruebas.filas(p_tabla text) returns int language plpgsql as $$
declare
  v int;
begin
  execute format('select count(*) from %s', p_tabla) into v;
  return v;
exception when insufficient_privilege then
  return 0;
end $$;

-- Crea un usuario en auth.users (dispara tg_nuevo_usuario) y le pone rol. Devuelve su id.
create function pruebas.crear_usuario(
  p_email text,
  p_meta jsonb default '{}'::jsonb,
  p_rol public.rol_usuario default 'cliente'
) returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_id uuid;
begin
  insert into auth.users (email, raw_user_meta_data) values (p_email, p_meta) returning id into v_id;
  update public.perfiles set rol = p_rol where id = v_id;
  return v_id;
end $$;

-- Primer día con ese día de la semana (0 = domingo) a partir de hoy + p_min_dias (hora local).
create function pruebas.proximo_dia(p_dow int, p_min_dias int default 0) returns date language sql stable as $$
  select d::date
    from generate_series(public.hoy_local() + p_min_dias, public.hoy_local() + p_min_dias + 6, interval '1 day') d
   where extract(dow from d)::int = p_dow
   limit 1
$$;

-- Instante para una fecha y hora local de Querétaro.
create function pruebas.instante(p_fecha date, p_hora time) returns timestamptz language sql stable as $$
  select (p_fecha + p_hora) at time zone 'America/Mexico_City'
$$;

create function pruebas.firma() returns text language sql immutable as $$
  select '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><path d="M5 40 C 40 5, 80 55, 120 20 S 180 40, 195 30" fill="none" stroke="black" stroke-width="2"/></svg>'
$$;

-- Deja a la usuaria lista para reservar: acepta las políticas generales activas y guarda ficha.
-- Debe llamarse con la identidad de la usuaria ya puesta (pruebas.como(...)).
create function pruebas.preparar_para_reservar(p_respuestas jsonb default '{}'::jsonb) returns void language plpgsql as $$
begin
  perform public.aceptar_politicas(
    array(select p.id from public.politicas p
           where p.activa and p.tipo in ('terminos', 'privacidad', 'cancelacion')),
    'pruebas');
  perform public.guardar_ficha_salud(p_respuestas, '{}'::jsonb, null, null, null, true);
end $$;

-- Atajos de búsqueda (ignoran RLS para poder armar los casos desde cualquier rol).
create function pruebas.servicio(p_slug text) returns uuid language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select id from public.servicios where slug = p_slug
$$;

create function pruebas.paquete(p_slug text) returns uuid language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select id from public.paquetes where slug = p_slug
$$;

-- [{"servicio_id": …}, …] a partir de slugs de servicio.
create function pruebas.items(variadic p_slugs text[]) returns jsonb language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('servicio_id', s.id) order by x.n), '[]'::jsonb)
    from unnest(p_slugs) with ordinality as x(slug, n)
    join public.servicios s on s.slug = x.slug
$$;

create function pruebas.usuario(p_email text) returns uuid language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select id from auth.users where lower(email) = lower(p_email)
$$;

create function pruebas.cliente_de(p_usuario uuid) returns uuid language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select id from public.clientes where usuario_id = p_usuario
$$;

-- Crea una clienta con sesión y la deja lista para reservar. Devuelve el id de usuario.
create function pruebas.clienta_lista(
  p_email text,
  p_fecha_nacimiento date default '1990-01-01',
  p_respuestas jsonb default '{}'::jsonb
) returns uuid language plpgsql as $$
declare
  v uuid;
  v_rol text := current_user;
begin
  v := pruebas.crear_usuario(p_email, jsonb_build_object('nombre', split_part(p_email, '@', 1),
                                                         'apellidos', 'Prueba',
                                                         'fecha_nacimiento', p_fecha_nacimiento));
  perform pruebas.como(v);
  perform pruebas.preparar_para_reservar(p_respuestas);
  perform pruebas.como_postgres();
  return v;
end $$;

grant execute on all functions in schema pruebas to anon, authenticated, service_role;
