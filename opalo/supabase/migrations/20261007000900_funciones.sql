-- =============================================================================
-- Ópalo · 0900 · Funciones RPC (reglas de negocio R1–R13)
-- Contrato: opalo/docs/ESPEC.md §5 y §6 (firmas exactas)
--
-- Todas son security definer con search_path fijo y validan el rol de quien llama.
-- Los errores para la persona usuaria usan los mensajes canónicos, errcode P0001.
-- Las funciones "*_interna" no se exponen (ver 1100_seguridad).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Auxiliares internas
-- -----------------------------------------------------------------------------

-- ¿Puede este miembro del personal hacer todos estos servicios? (sin filas = hace todo)
create or replace function public.personal_puede_hacer(p_personal_id uuid, p_servicios uuid[])
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select not exists (select 1 from public.personal_servicios ps where ps.personal_id = p_personal_id)
      or not exists (
           select 1
             from unnest(coalesce(p_servicios, '{}'::uuid[])) as s(id)
            where not exists (select 1 from public.personal_servicios ps
                               where ps.personal_id = p_personal_id and ps.servicio_id = s.id))
$$;

-- Edad cumplida en una fecha.
create or replace function public.edad_en(p_fecha_nacimiento date, p_fecha date)
returns int
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select date_part('year', age(p_fecha::timestamp, p_fecha_nacimiento::timestamp))::int
$$;

-- -----------------------------------------------------------------------------
-- R2 · duracion_reserva
-- -----------------------------------------------------------------------------
create or replace function public.duracion_reserva(p_items jsonb)
returns int
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cfg        public.configuracion := public.configuracion_actual();
  v_intervalo  int := greatest(coalesce(v_cfg.intervalo_slots_min, 60), 1);
  v_item       jsonb;
  v_dur        int;
  v_total      int := 0;
begin
  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    for v_item in select e.value from jsonb_array_elements(p_items) as e(value) loop
      v_dur := 0;
      if nullif(v_item ->> 'servicio_id', '') is not null then
        select coalesce(s.duracion_min, 0) into v_dur
          from public.servicios s
         where s.id = (v_item ->> 'servicio_id')::uuid;
      elsif nullif(v_item ->> 'paquete_id', '') is not null then
        select coalesce(p.duracion_min,
                        (select sum(coalesce(s.duracion_min, 0) * ps.cantidad)
                           from public.paquete_servicios ps
                           join public.servicios s on s.id = ps.servicio_id
                          where ps.paquete_id = p.id),
                        0)
          into v_dur
          from public.paquetes p
         where p.id = (v_item ->> 'paquete_id')::uuid;
      end if;
      v_total := v_total + coalesce(v_dur, 0);
    end loop;
  end if;

  -- hacia arriba al múltiplo del intervalo, nunca menos que la sesión estándar
  v_total := (ceil(v_total::numeric / v_intervalo))::int * v_intervalo;
  return greatest(v_total, coalesce(v_cfg.duracion_sesion_min, 60));
end;
$$;

-- -----------------------------------------------------------------------------
-- R3 · horarios_disponibles (hora local America/Mexico_City)
-- Limitación conocida: la firma no recibe los servicios, así que no filtra por
-- personal_servicios (quién puede hacer qué). Con una sola especialista que hace todo no
-- importa; reservar_cita sí lo revisa y, si nadie de quien puede hacerlos está libre, responde
-- "Ese horario no está disponible." Al sumar personal con servicios restringidos habrá que
-- agregar un parámetro p_servicios (cambio de contrato: ESPEC §6 y tipos.ts).
-- -----------------------------------------------------------------------------
create or replace function public.horarios_disponibles(
  p_fecha date,
  p_duracion_min int default null,
  p_personal_id uuid default null
)
returns table (inicio timestamptz, fin timestamptz, personal_id uuid, personal_nombre text)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_cfg       public.configuracion := public.configuracion_actual();
  v_tz        text := coalesce(v_cfg.zona_horaria, 'America/Mexico_City');
  v_hoy       date := (now() at time zone v_tz)::date;
  v_dur       int;
  v_paso      int := greatest(coalesce(v_cfg.intervalo_slots_min, 60), 1);
  v_minimo    timestamptz := now() + make_interval(hours => coalesce(v_cfg.anticipacion_min_horas, 0));
begin
  v_dur := coalesce(p_duracion_min, v_cfg.duracion_sesion_min, 60);
  if v_dur <= 0 then
    v_dur := coalesce(v_cfg.duracion_sesion_min, 60);
  end if;

  if p_fecha is null
     or p_fecha < v_hoy
     or p_fecha > v_hoy + coalesce(v_cfg.ventana_reserva_dias, 60) then
    return;
  end if;

  -- Antes de la apertura, visitantes y clientas no ven horarios; el personal sí (puede agendar,
  -- p. ej. el ensayo de apertura, con reservar_cita_staff).
  if v_cfg.fecha_apertura is not null and p_fecha < v_cfg.fecha_apertura and not public.es_personal() then
    return;
  end if;

  -- distinct: si dos rangos del mismo día se traslapan, cada inicio sale una sola vez.
  return query
  with candidatos as (
    select distinct p.id as pid, p.nombre as pnombre, p.orden as porden, gs.local as ini_local
      from public.personal p
      join public.horarios h
        on h.personal_id = p.id
       and h.dia_semana = extract(dow from p_fecha)::int
      cross join lateral generate_series(
             p_fecha + h.hora_inicio,
             p_fecha + h.hora_fin - make_interval(mins => v_dur),
             make_interval(mins => v_paso)) as gs(local)
     where p.activo
       and (p_personal_id is null or p.id = p_personal_id)
  ),
  bloques as (
    select c.pid, c.pnombre, c.porden,
           (c.ini_local at time zone v_tz) as b_ini,
           ((c.ini_local + make_interval(mins => v_dur)) at time zone v_tz) as b_fin
      from candidatos c
  )
  select b.b_ini, b.b_fin, b.pid, b.pnombre
    from bloques b
   where b.b_ini >= v_minimo
     and not exists (
           select 1 from public.citas ct
            where ct.personal_id = b.pid
              and ct.estado not in ('cancelada', 'no_asistio')
              and tstzrange(ct.inicio, ct.fin) && tstzrange(b.b_ini, b.b_fin))
     and not exists (
           select 1 from public.bloqueos_agenda bl
            where (bl.personal_id is null or bl.personal_id = b.pid)
              and tstzrange(bl.inicio, bl.fin) && tstzrange(b.b_ini, b.b_fin))
     and exists (
           select 1 from public.cabinas cb
            where cb.activa
              and not exists (
                    select 1 from public.citas ct2
                     where ct2.cabina_id = cb.id
                       and ct2.estado not in ('cancelada', 'no_asistio')
                       and tstzrange(ct2.inicio, ct2.fin) && tstzrange(b.b_ini, b.b_fin)))
   order by b.b_ini, b.porden, b.pnombre;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ficha de salud y aceptación de políticas (clienta)
-- -----------------------------------------------------------------------------
create or replace function public.guardar_ficha_salud(
  p_respuestas jsonb,
  p_detalles jsonb,
  p_alergias text,
  p_medicamentos text,
  p_observaciones text,
  p_acepta_datos_sensibles boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cliente uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;
  v_cliente := public.mi_cliente_id();
  if v_cliente is null then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;
  if not coalesce(p_acepta_datos_sensibles, false) then
    raise exception using
      message = 'Para guardar tu ficha de salud necesitamos tu consentimiento expreso para tratar datos de salud.',
      errcode = 'P0001';
  end if;
  if length(p_alergias) > 2000 or length(p_medicamentos) > 2000 or length(p_observaciones) > 2000
     or length(p_respuestas::text) > 20000 or length(p_detalles::text) > 20000 then
    raise exception using
      message = 'Tu ficha de salud es muy larga; resume cada respuesta en máximo 2000 caracteres.',
      errcode = 'P0001';
  end if;

  -- clock_timestamp(): la "última ficha" debe ser la última aunque se guarden dos en la misma transacción.
  insert into public.fichas_salud (cliente_id, respuestas, detalles, alergias, medicamentos, observaciones,
                                   acepta_datos_sensibles, creado_en)
  values (v_cliente,
          case when jsonb_typeof(p_respuestas) = 'object' then p_respuestas else '{}'::jsonb end,
          case when jsonb_typeof(p_detalles) = 'object' then p_detalles else '{}'::jsonb end,
          nullif(btrim(p_alergias), ''),
          nullif(btrim(p_medicamentos), ''),
          nullif(btrim(p_observaciones), ''),
          true,
          clock_timestamp())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.aceptar_politicas(p_politica_ids uuid[], p_user_agent text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cliente uuid;
begin
  if auth.uid() is null then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;
  v_cliente := public.mi_cliente_id();
  if v_cliente is null then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;

  insert into public.aceptaciones_politica (cliente_id, politica_id, ip, user_agent)
  select v_cliente, p.id, public.ip_solicitud(), left(p_user_agent, 1000)
    from public.politicas p
   where p.id = any (coalesce(p_politica_ids, '{}'::uuid[]))
  on conflict (cliente_id, politica_id) do nothing;
end;
$$;

-- Nombre, tutor y trazo de una firma (reservar_cita y firmar_consentimiento_cita).
create or replace function public.validar_firma(p_nombre_firmante text, p_firma_svg text, p_tutor_nombre text)
returns void
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  if nullif(btrim(p_nombre_firmante), '') is null or nullif(btrim(p_firma_svg), '') is null then
    raise exception using message = 'Falta tu firma o tu nombre completo.', errcode = 'P0001';
  end if;
  if length(btrim(p_nombre_firmante)) > 200 or length(btrim(p_tutor_nombre)) > 200 then
    raise exception using message = 'El nombre es muy largo; escríbelo en máximo 200 caracteres.', errcode = 'P0001';
  end if;
  if not public.firma_valida(p_firma_svg) then
    raise exception using message = 'No pudimos leer tu firma; bórrala y vuelve a firmar.', errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- R1 + R4 · creación de citas (núcleo compartido por reservar_cita y reservar_cita_staff)
-- -----------------------------------------------------------------------------
create or replace function public.crear_cita_interna(
  p_cliente_id uuid,
  p_items jsonb,
  p_inicio timestamptz,
  p_personal_id uuid,
  p_origen public.origen_cita,
  p_notas text,
  p_es_staff boolean,
  p_nombre_firmante text,
  p_firma_svg text,
  p_tutor_nombre text,
  p_user_agent text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cfg          public.configuracion := public.configuracion_actual();
  v_tz           text := coalesce(v_cfg.zona_horaria, 'America/Mexico_City');
  v_hoy          date := public.hoy_local();
  v_cliente      public.clientes;
  v_item         jsonb;
  v_serv         public.servicios;
  v_paq          public.paquetes;
  v_cred         public.creditos;
  v_cred_id      uuid;
  v_precio       numeric(10,2);
  v_items        jsonb := '[]'::jsonb;
  v_servicios    uuid[] := '{}';
  v_categorias   text[] := '{}';
  v_tipos        public.tipo_politica[] := '{}';
  v_hay_principal boolean := false;
  v_total        numeric(10,2) := 0;
  v_dur          int;
  v_fin          timestamptz;
  v_personal     uuid;
  v_cabina       uuid;
  v_ficha        public.fichas_salud;
  v_alertas      text[] := '{}';
  v_estado       public.estado_cita;
  v_es_menor     boolean := false;
  v_cita         uuid;
  -- Un crédito debe estar vigente el día de la cita (no sólo hoy).
  v_fecha_cita   date := greatest(v_hoy, coalesce((p_inicio at time zone v_tz)::date, v_hoy));
begin
  select * into v_cliente from public.clientes c where c.id = p_cliente_id;
  if not found then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using message = 'Elige al menos un servicio.', errcode = 'P0001';
  end if;

  if length(btrim(p_notas)) > 1000 then
    raise exception using message = 'Las notas son muy largas; escríbelas en máximo 1000 caracteres.', errcode = 'P0001';
  end if;

  -- Ítems: validar, tomar precios del servidor, aplicar créditos.
  for v_item in select e.value from jsonb_array_elements(p_items) as e(value) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using message = 'Elige al menos un servicio.', errcode = 'P0001';
    end if;
    v_cred_id := nullif(v_item ->> 'credito_id', '')::uuid;

    if nullif(v_item ->> 'servicio_id', '') is not null then
      select * into v_serv from public.servicios s where s.id = (v_item ->> 'servicio_id')::uuid;
      if not found
         or not v_serv.activo
         or v_serv.etapa <> 'disponible'
         or (not p_es_staff and not v_serv.reservable_en_linea) then
        raise exception using message = 'Uno de los servicios elegidos no se puede reservar en línea.', errcode = 'P0001';
      end if;
      v_precio := v_serv.precio;

      if v_cred_id is not null then
        select * into v_cred from public.creditos cr where cr.id = v_cred_id for update;
        if not found
           or v_cred.cliente_id <> p_cliente_id
           or v_cred.servicio_id is distinct from v_serv.id
           or v_cred.codigo_regalo is not null
           or v_cred.usados >= v_cred.cantidad
           or (v_cred.vence_en is not null and v_cred.vence_en < v_fecha_cita) then
          raise exception using message = 'Ese crédito no es válido o ya se usó.', errcode = 'P0001';
        end if;
        update public.creditos set usados = usados + 1 where id = v_cred_id;
        v_precio := 0;
      end if;

      v_servicios := v_servicios || v_serv.id;
      v_categorias := v_categorias || (select cs.slug from public.categorias_servicio cs where cs.id = v_serv.categoria_id);
      if v_serv.tipo_consentimiento is not null then
        v_tipos := v_tipos || v_serv.tipo_consentimiento;
      end if;
      if not v_serv.es_complemento then
        v_hay_principal := true;
      end if;
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'servicio_id', v_serv.id, 'paquete_id', null, 'credito_id', v_cred_id,
        'nombre', v_serv.nombre, 'precio', v_precio, 'duracion_min', v_serv.duracion_min));

    elsif nullif(v_item ->> 'paquete_id', '') is not null then
      select * into v_paq from public.paquetes p where p.id = (v_item ->> 'paquete_id')::uuid;
      if not found or not v_paq.activo then
        raise exception using message = 'Uno de los servicios elegidos no se puede reservar en línea.', errcode = 'P0001';
      end if;
      v_precio := v_paq.precio;

      if v_cred_id is not null then
        select * into v_cred from public.creditos cr where cr.id = v_cred_id for update;
        if not found
           or v_cred.cliente_id <> p_cliente_id
           or v_cred.paquete_id is distinct from v_paq.id
           or v_cred.codigo_regalo is not null
           or v_cred.usados >= v_cred.cantidad
           or (v_cred.vence_en is not null and v_cred.vence_en < v_fecha_cita) then
          raise exception using message = 'Ese crédito no es válido o ya se usó.', errcode = 'P0001';
        end if;
        update public.creditos set usados = usados + 1 where id = v_cred_id;
        v_precio := 0;
      end if;

      v_servicios := v_servicios || coalesce(
        (select array_agg(ps.servicio_id) from public.paquete_servicios ps where ps.paquete_id = v_paq.id), '{}');
      v_categorias := v_categorias || coalesce(
        (select array_agg(distinct cs.slug)
           from public.paquete_servicios ps
           join public.servicios s on s.id = ps.servicio_id
           join public.categorias_servicio cs on cs.id = s.categoria_id
          where ps.paquete_id = v_paq.id), '{}');
      v_tipos := v_tipos || coalesce(
        (select array_agg(distinct s.tipo_consentimiento)
           from public.paquete_servicios ps
           join public.servicios s on s.id = ps.servicio_id
          where ps.paquete_id = v_paq.id and s.tipo_consentimiento is not null), '{}');
      v_hay_principal := true;
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'servicio_id', null, 'paquete_id', v_paq.id, 'credito_id', v_cred_id,
        'nombre', v_paq.nombre, 'precio', v_precio, 'duracion_min', v_paq.duracion_min));
    else
      raise exception using message = 'Elige al menos un servicio.', errcode = 'P0001';
    end if;

    v_total := v_total + coalesce(v_precio, 0);
  end loop;

  if not v_hay_principal then
    raise exception using
      message = 'Los complementos se agregan a un servicio; elige al menos un servicio.',
      errcode = 'P0001';
  end if;

  -- R6: la cita debe tener al menos un consentimiento que firmar (política activa de algún tipo
  -- de sus servicios); si no, nunca se podría iniciar ni completar.
  if not exists (select 1 from public.politicas po where po.activa and po.tipo = any (v_tipos)) then
    raise exception using message = 'Uno de los servicios elegidos no se puede reservar en línea.', errcode = 'P0001';
  end if;

  if p_inicio is null then
    raise exception using message = 'Ese horario no está disponible.', errcode = 'P0001';
  end if;

  v_dur := public.duracion_reserva(p_items);
  v_fin := p_inicio + make_interval(mins => v_dur);

  -- Quién atiende
  if p_es_staff then
    -- El personal puede agendar fuera de la rejilla; se cuida que no se empalme y que la persona
    -- (o todo el spa) no tenga un bloqueo (vacaciones, festivo, capacitación).
    if p_personal_id is not null then
      select p.id into v_personal
        from public.personal p
       where p.id = p_personal_id
         and p.activo
         and public.personal_puede_hacer(p.id, v_servicios)
         and not exists (select 1 from public.bloqueos_agenda bl
                          where (bl.personal_id is null or bl.personal_id = p.id)
                            and tstzrange(bl.inicio, bl.fin) && tstzrange(p_inicio, v_fin));
      if v_personal is null then
        raise exception using message = 'Ese horario no está disponible.', errcode = 'P0001';
      end if;
    else
      select p.id into v_personal
        from public.personal p
       where p.activo
         and public.personal_puede_hacer(p.id, v_servicios)
         and not exists (select 1 from public.bloqueos_agenda bl
                          where (bl.personal_id is null or bl.personal_id = p.id)
                            and tstzrange(bl.inicio, bl.fin) && tstzrange(p_inicio, v_fin))
         and not exists (select 1 from public.citas ct
                          where ct.personal_id = p.id
                            and ct.estado not in ('cancelada', 'no_asistio')
                            and tstzrange(ct.inicio, ct.fin) && tstzrange(p_inicio, v_fin))
       order by exists (select 1 from public.horarios h
                         where h.personal_id = p.id
                           and h.dia_semana = extract(dow from (p_inicio at time zone v_tz))::int
                           and (p_inicio at time zone v_tz)::time >= h.hora_inicio
                           and (v_fin at time zone v_tz)::time <= h.hora_fin) desc,
                p.orden, p.nombre
       limit 1;
      if v_personal is null then
        -- Nadie que pueda hacerlo está libre de bloqueos → no disponible; si lo hay, está ocupado.
        if not exists (select 1 from public.personal p
                        where p.activo
                          and public.personal_puede_hacer(p.id, v_servicios)
                          and not exists (select 1 from public.bloqueos_agenda bl
                                           where (bl.personal_id is null or bl.personal_id = p.id)
                                             and tstzrange(bl.inicio, bl.fin) && tstzrange(p_inicio, v_fin))) then
          raise exception using message = 'Ese horario no está disponible.', errcode = 'P0001';
        end if;
        raise exception using message = 'Ese horario se acaba de ocupar, elige otro.', errcode = 'P0001';
      end if;
    end if;
  else
    -- La clienta sólo reserva inicios que ofrece horarios_disponibles.
    select h.personal_id into v_personal
      from public.horarios_disponibles((p_inicio at time zone v_tz)::date, v_dur, p_personal_id) h
      join public.personal p on p.id = h.personal_id
     where h.inicio = p_inicio
       and public.personal_puede_hacer(h.personal_id, v_servicios)
     order by p.orden, p.nombre
     limit 1;
    if v_personal is null then
      -- "Se acaba de ocupar" sólo si lo ocupó alguien que sí puede hacer estos servicios.
      if exists (select 1 from public.citas ct
                  where ct.estado not in ('cancelada', 'no_asistio')
                    and (p_personal_id is null or ct.personal_id = p_personal_id)
                    and public.personal_puede_hacer(ct.personal_id, v_servicios)
                    and tstzrange(ct.inicio, ct.fin) && tstzrange(p_inicio, v_fin)) then
        raise exception using message = 'Ese horario se acaba de ocupar, elige otro.', errcode = 'P0001';
      end if;
      raise exception using message = 'Ese horario no está disponible.', errcode = 'P0001';
    end if;
  end if;

  -- Cabina libre
  select cb.id into v_cabina
    from public.cabinas cb
   where cb.activa
     and not exists (select 1 from public.citas ct
                      where ct.cabina_id = cb.id
                        and ct.estado not in ('cancelada', 'no_asistio')
                        and tstzrange(ct.inicio, ct.fin) && tstzrange(p_inicio, v_fin))
   order by cb.orden, cb.nombre
   limit 1;
  if v_cabina is null then
    raise exception using message = 'Ese horario se acaba de ocupar, elige otro.', errcode = 'P0001';
  end if;

  -- Ficha vigente → alertas (R4)
  select * into v_ficha
    from public.fichas_salud f
   where f.cliente_id = p_cliente_id
   order by f.creado_en desc, f.id desc
   limit 1;
  if v_ficha.id is not null then
    select coalesce(array_agg(ci.pregunta order by ci.orden, ci.clave), '{}')
      into v_alertas
      from public.contraindicaciones ci
     where ci.activa
       and ci.accion in ('revisar', 'no_se_realiza')
       and (v_ficha.respuestas -> ci.clave) = 'true'::jsonb
       and (ci.categorias is null or ci.categorias && v_categorias);
  end if;
  v_estado := case when cardinality(v_alertas) > 0 then 'pendiente' else 'confirmada' end;

  if v_cliente.fecha_nacimiento is not null then
    v_es_menor := public.edad_en(v_cliente.fecha_nacimiento, (p_inicio at time zone v_tz)::date)
                  < coalesce(v_cfg.edad_mayoria, 18);
  end if;

  begin
    insert into public.citas (cliente_id, personal_id, cabina_id, inicio, fin, estado, origen,
                              primera_vez, requiere_revision, alertas, notas_cliente, total, creada_por)
    values (p_cliente_id, v_personal, v_cabina, p_inicio, v_fin, v_estado, p_origen,
            not exists (select 1 from public.citas c2
                         where c2.cliente_id = p_cliente_id and c2.estado = 'completada'),
            cardinality(v_alertas) > 0, v_alertas, nullif(btrim(p_notas), ''), v_total, auth.uid())
    returning id into v_cita;
  exception when exclusion_violation then
    raise exception using message = 'Ese horario se acaba de ocupar, elige otro.', errcode = 'P0001';
  end;

  insert into public.cita_items (cita_id, servicio_id, paquete_id, credito_id, nombre, precio, duracion_min)
  select v_cita,
         (e.value ->> 'servicio_id')::uuid,
         (e.value ->> 'paquete_id')::uuid,
         (e.value ->> 'credito_id')::uuid,
         e.value ->> 'nombre',
         (e.value ->> 'precio')::numeric,
         (e.value ->> 'duracion_min')::int
    from jsonb_array_elements(v_items) as e(value);

  -- Un consentimiento por cada tipo distinto (política activa de ese tipo), con la firma recibida.
  if p_firma_svg is not null then
    insert into public.consentimientos (cliente_id, cita_id, politica_id, ficha_salud_id, nombre_firmante,
                                        firma_svg, es_menor, tutor_nombre, ip, user_agent,
                                        capturado_por, canal)
    select p_cliente_id, v_cita, po.id, v_ficha.id, btrim(p_nombre_firmante), p_firma_svg,
           v_es_menor, case when v_es_menor then nullif(btrim(p_tutor_nombre), '') end,
           public.ip_solicitud(), left(p_user_agent, 1000),
           auth.uid(), 'reserva_web'
      from public.politicas po
     where po.activa and po.tipo = any (v_tipos);
  end if;

  return jsonb_build_object(
    'id', v_cita,
    'estado', v_estado,
    'requiere_revision', cardinality(v_alertas) > 0,
    'alertas', to_jsonb(v_alertas));
end;
$$;

-- R4 · la clienta reserva
-- Además de R4: necesita su fecha de nacimiento (decide edad mínima y tutor) y puede tener a lo
-- más 3 citas próximas activas (pendiente o confirmada) para que una sola cuenta no acapare la
-- agenda; para más, el personal le agenda por WhatsApp. Antes de configuracion.fecha_apertura no
-- se reserva en línea (vale para cualquier cuenta; el personal agenda con reservar_cita_staff).
-- Firma (ESPEC §9): con configuracion.firma_en_linea = false (lo de Ópalo) la firma se hace en el
-- spa, en la tablet de la cabina: p_nombre_firmante y p_firma_svg se ignoran (no se guardan) y la
-- cita nace sin consentimientos ("falta firma"; R6 no deja iniciarla hasta que se firme). Con true
-- la firma es parte de la reserva: se exige, se valida y se crea un consentimiento por tipo.
create or replace function public.reservar_cita(
  p_items jsonb,
  p_inicio timestamptz,
  p_nombre_firmante text default null,
  p_firma_svg text default null,
  p_personal_id uuid default null,
  p_notas text default null,
  p_tutor_nombre text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cfg     public.configuracion := public.configuracion_actual();
  v_tz      text := coalesce(v_cfg.zona_horaria, 'America/Mexico_City');
  v_cliente public.clientes;
  v_edad    int;
  v_firma_en_linea boolean := coalesce(v_cfg.firma_en_linea, false);
  c_max_citas constant int := 3;
begin
  if auth.uid() is null then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;
  -- for update: dos reservas simultáneas de la misma clienta se forman (límite de citas).
  select * into v_cliente from public.clientes c where c.usuario_id = auth.uid() for update;
  if not found then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;

  if v_cfg.fecha_apertura is not null and (p_inicio at time zone v_tz)::date < v_cfg.fecha_apertura then
    raise exception using message = 'Ese horario no está disponible.', errcode = 'P0001';
  end if;

  if exists (select 1 from public.politicas po
              where po.activa
                and po.tipo in ('terminos', 'privacidad', 'cancelacion')
                and not exists (select 1 from public.aceptaciones_politica a
                                 where a.politica_id = po.id and a.cliente_id = v_cliente.id)) then
    raise exception using
      message = 'Antes de reservar necesitas aceptar los términos, el aviso de privacidad y la política de cancelación.',
      errcode = 'P0001';
  end if;

  if not exists (select 1 from public.fichas_salud f where f.cliente_id = v_cliente.id) then
    raise exception using message = 'Antes de reservar necesitas llenar tu ficha de salud.', errcode = 'P0001';
  end if;

  if v_cliente.fecha_nacimiento is null then
    raise exception using message = 'Para reservar necesitamos tu fecha de nacimiento.', errcode = 'P0001';
  end if;
  v_edad := public.edad_en(v_cliente.fecha_nacimiento,
                           coalesce((p_inicio at time zone v_tz)::date, public.hoy_local()));
  if v_edad < coalesce(v_cfg.edad_minima, 15) then
    raise exception using
      message = format('Atendemos a partir de los %s años.', coalesce(v_cfg.edad_minima, 15)),
      errcode = 'P0001';
  end if;
  if v_edad < coalesce(v_cfg.edad_mayoria, 18) and nullif(btrim(p_tutor_nombre), '') is null then
    raise exception using
      message = 'Por ser menor de edad, escribe el nombre de mamá, papá o tutor que te acompañará.',
      errcode = 'P0001';
  end if;

  if v_firma_en_linea then
    perform public.validar_firma(p_nombre_firmante, p_firma_svg, p_tutor_nombre);
  end if;

  if (select count(*) from public.citas c
       where c.cliente_id = v_cliente.id
         and c.estado in ('pendiente', 'confirmada')
         and c.inicio > now()) >= c_max_citas then
    raise exception using
      message = format('Ya tienes %s citas próximas; para agendar otra escríbenos por WhatsApp al %s.',
                       c_max_citas, coalesce(public.telefono_legible(v_cfg.telefono_whatsapp), '442 170 1466')),
      errcode = 'P0001';
  end if;

  -- Sin firma en línea, lo que llegue de firma se descarta: la cita nace sin consentimientos.
  return public.crear_cita_interna(v_cliente.id, p_items, p_inicio, p_personal_id, 'web', p_notas, false,
                                   case when v_firma_en_linea then p_nombre_firmante end,
                                   case when v_firma_en_linea then p_firma_svg end,
                                   p_tutor_nombre, p_user_agent);
end;
$$;

-- El personal agenda por WhatsApp / mostrador / teléfono (la cita nace sin firma).
create or replace function public.reservar_cita_staff(
  p_cliente_id uuid,
  p_items jsonb,
  p_inicio timestamptz,
  p_personal_id uuid default null,
  p_origen public.origen_cita default 'whatsapp',
  p_notas text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cfg     public.configuracion := public.configuracion_actual();
  v_tz      text := coalesce(v_cfg.zona_horaria, 'America/Mexico_City');
  v_cliente public.clientes;
begin
  if not public.es_personal() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  select * into v_cliente from public.clientes c where c.id = p_cliente_id;
  if not found then
    raise exception using message = 'No encontramos a esa clienta.', errcode = 'P0001';
  end if;
  if v_cliente.fecha_nacimiento is not null
     and public.edad_en(v_cliente.fecha_nacimiento, coalesce((p_inicio at time zone v_tz)::date, public.hoy_local()))
         < coalesce(v_cfg.edad_minima, 15) then
    raise exception using
      message = format('Atendemos a partir de los %s años.', coalesce(v_cfg.edad_minima, 15)),
      errcode = 'P0001';
  end if;

  return public.crear_cita_interna(p_cliente_id, p_items, p_inicio, p_personal_id,
                                   coalesce(p_origen, 'whatsapp'), p_notas, true,
                                   null, null, null, null);
end;
$$;

-- R6 · firma posterior (tablet de la cabina o portal de la clienta)
-- En la tablet de la cabina firma la clienta y la sesión es del personal: siempre se puede (canal
-- 'cabina'); el personal verifica la edad en persona. Desde su portal (sesión de la propia clienta)
-- sólo se firma si configuracion.firma_en_linea = true (ESPEC §9; si no: 'La firma se hace en el
-- spa, el día de tu cita.'), y necesita su fecha de nacimiento (decide si firma con tutor).
create or replace function public.firmar_consentimiento_cita(
  p_cita_id uuid,
  p_nombre_firmante text,
  p_firma_svg text,
  p_tutor_nombre text default null,
  p_user_agent text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cfg      public.configuracion := public.configuracion_actual();
  v_tz       text := coalesce(v_cfg.zona_horaria, 'America/Mexico_City');
  v_cita     public.citas;
  v_cliente  public.clientes;
  v_ficha    uuid;
  v_es_menor boolean := false;
  v_portal   boolean;     -- firma la clienta con su propia sesión (no en la tablet del personal)
begin
  if auth.uid() is null then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;
  select * into v_cita from public.citas c where c.id = p_cita_id;
  if not found then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  select * into v_cliente from public.clientes c where c.id = v_cita.cliente_id;
  v_portal := not public.es_personal();
  if v_portal and v_cliente.usuario_id is distinct from auth.uid() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  if v_portal and not coalesce(v_cfg.firma_en_linea, false) then
    raise exception using message = 'La firma se hace en el spa, el día de tu cita.', errcode = 'P0001';
  end if;
  if v_cita.estado in ('cancelada', 'no_asistio') then
    raise exception using message = 'Esta cita está cancelada.', errcode = 'P0001';
  end if;

  if v_cliente.fecha_nacimiento is null and v_portal then
    raise exception using message = 'Para firmar necesitamos tu fecha de nacimiento.', errcode = 'P0001';
  end if;
  if v_cliente.fecha_nacimiento is not null then
    v_es_menor := public.edad_en(v_cliente.fecha_nacimiento, (v_cita.inicio at time zone v_tz)::date)
                  < coalesce(v_cfg.edad_mayoria, 18);
    if v_es_menor and nullif(btrim(p_tutor_nombre), '') is null then
      raise exception using
        message = 'Por ser menor de edad, escribe el nombre de mamá, papá o tutor que te acompañará.',
        errcode = 'P0001';
    end if;
  end if;

  perform public.validar_firma(p_nombre_firmante, p_firma_svg, p_tutor_nombre);

  select f.id into v_ficha
    from public.fichas_salud f
   where f.cliente_id = v_cita.cliente_id
   order by f.creado_en desc, f.id desc
   limit 1;

  insert into public.consentimientos (cliente_id, cita_id, politica_id, ficha_salud_id, nombre_firmante,
                                      firma_svg, es_menor, tutor_nombre, ip, user_agent,
                                      capturado_por, canal)
  select v_cita.cliente_id, v_cita.id, po.id, v_ficha, btrim(p_nombre_firmante), p_firma_svg,
         v_es_menor, case when v_es_menor then nullif(btrim(p_tutor_nombre), '') end,
         public.ip_solicitud(), left(p_user_agent, 1000),
         auth.uid(), case when v_portal then 'portal' else 'cabina' end
    from public.politicas po
   where po.activa
     and po.tipo in (
           select s.tipo_consentimiento
             from public.cita_items ci
             join public.servicios s on s.id = ci.servicio_id
            where ci.cita_id = v_cita.id and s.tipo_consentimiento is not null
           union
           select s.tipo_consentimiento
             from public.cita_items ci
             join public.paquete_servicios ps on ps.paquete_id = ci.paquete_id
             join public.servicios s on s.id = ps.servicio_id
            where ci.cita_id = v_cita.id and s.tipo_consentimiento is not null)
     and not exists (select 1 from public.consentimientos co
                      where co.cita_id = v_cita.id and co.politica_id = po.id);
end;
$$;

-- -----------------------------------------------------------------------------
-- R5 · cancelar (dueña con anticipación; personal siempre). Devuelve créditos.
-- -----------------------------------------------------------------------------
create or replace function public.cancelar_cita_interna(p_cita_id uuid, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  update public.citas
     set estado = 'cancelada',
         cancelada_en = now(),
         motivo_cancelacion = nullif(btrim(p_motivo), '')
   where id = p_cita_id;

  update public.creditos cr
     set usados = greatest(cr.usados - x.n, 0)
    from (select ci.credito_id, count(*)::int as n
            from public.cita_items ci
           where ci.cita_id = p_cita_id and ci.credito_id is not null
           group by ci.credito_id) x
   where cr.id = x.credito_id;
end;
$$;

create or replace function public.cancelar_cita(p_cita_id uuid, p_motivo text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cfg  public.configuracion := public.configuracion_actual();
  v_cita public.citas;
begin
  if auth.uid() is null then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;
  select * into v_cita from public.citas c where c.id = p_cita_id for update;
  if not found then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;

  if public.es_personal() then
    if v_cita.estado in ('cancelada', 'completada', 'no_asistio') then
      raise exception using message = 'Esta cita ya no se puede cancelar.', errcode = 'P0001';
    end if;
  else
    if v_cita.cliente_id is distinct from public.mi_cliente_id() then
      raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
    end if;
    if v_cita.estado not in ('pendiente', 'confirmada') then
      raise exception using message = 'Esta cita ya no se puede cancelar.', errcode = 'P0001';
    end if;
    if v_cita.inicio - now() < make_interval(hours => coalesce(v_cfg.horas_cancelacion, 24)) then
      raise exception using
        message = format('Faltan menos de %s horas para tu cita. Escríbenos por WhatsApp al %s.',
                         coalesce(v_cfg.horas_cancelacion, 24),
                         coalesce(public.telefono_legible(v_cfg.telefono_whatsapp), '442 170 1466')),
        errcode = 'P0001';
    end if;
  end if;

  perform public.cancelar_cita_interna(p_cita_id, p_motivo);
end;
$$;

-- -----------------------------------------------------------------------------
-- R7 · completar (consumo de insumos según recetas; idempotente)
-- -----------------------------------------------------------------------------
create or replace function public.completar_cita_interna(p_cita_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cita public.citas;
begin
  select * into v_cita from public.citas c where c.id = p_cita_id for update;
  if not found then
    raise exception using message = 'No encontramos esa cita.', errcode = 'P0001';
  end if;
  if v_cita.estado = 'cancelada' then
    raise exception using message = 'Esta cita está cancelada.', errcode = 'P0001';
  end if;
  if v_cita.estado = 'no_asistio' then
    raise exception using message = 'Esta cita se marcó como no asistió.', errcode = 'P0001';
  end if;
  if not exists (select 1 from public.consentimientos co where co.cita_id = p_cita_id) then
    raise exception using
      message = 'Sin consentimiento firmado no hay servicio: pide a la clienta que firme primero.',
      errcode = 'P0001';
  end if;
  if v_cita.estado = 'completada' then
    return;   -- ya estaba completada: no se descuenta dos veces
  end if;

  update public.citas set estado = 'completada' where id = p_cita_id;

  if exists (select 1 from public.movimientos_inventario m
              where m.cita_id = p_cita_id and m.tipo = 'consumo') then
    return;
  end if;

  insert into public.movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, cita_id, nota, creado_por)
  select r.producto_id,
         'consumo',
         -sum(r.cantidad * x.veces),
         pr.costo_unitario,
         p_cita_id,
         'Consumo de la cita',
         auth.uid()
    from (
          select ci.servicio_id, 1 as veces
            from public.cita_items ci
           where ci.cita_id = p_cita_id and ci.servicio_id is not null
          union all
          select ps.servicio_id, ps.cantidad as veces
            from public.cita_items ci
            join public.paquete_servicios ps on ps.paquete_id = ci.paquete_id
           where ci.cita_id = p_cita_id and ci.paquete_id is not null
         ) x
    join public.recetas_servicio r on r.servicio_id = x.servicio_id
    join public.productos pr on pr.id = r.producto_id
   group by r.producto_id, pr.costo_unitario;
end;
$$;

create or replace function public.completar_cita(p_cita_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.es_personal() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  perform public.completar_cita_interna(p_cita_id);
end;
$$;

-- R6 · cambio de estado por el personal
create or replace function public.cambiar_estado_cita(p_cita_id uuid, p_estado public.estado_cita)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cita public.citas;
begin
  if not public.es_personal() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  select * into v_cita from public.citas c where c.id = p_cita_id for update;
  if not found then
    raise exception using message = 'No encontramos esa cita.', errcode = 'P0001';
  end if;
  if p_estado is null or p_estado = v_cita.estado then
    return;
  end if;
  if v_cita.estado = 'cancelada' then
    raise exception using message = 'Esta cita está cancelada.', errcode = 'P0001';
  end if;
  if v_cita.estado = 'completada' then
    raise exception using message = 'Esta cita ya se completó.', errcode = 'P0001';
  end if;

  if p_estado = 'completada' then
    perform public.completar_cita_interna(p_cita_id);
    return;
  end if;
  if p_estado = 'cancelada' then
    -- Misma regla que cancelar_cita: una inasistencia no se cancela (ni devuelve créditos).
    if v_cita.estado = 'no_asistio' then
      raise exception using message = 'Esta cita ya no se puede cancelar.', errcode = 'P0001';
    end if;
    perform public.cancelar_cita_interna(p_cita_id, null);
    return;
  end if;
  if p_estado = 'en_curso'
     and not exists (select 1 from public.consentimientos co where co.cita_id = p_cita_id) then
    raise exception using
      message = 'Sin consentimiento firmado no hay servicio: pide a la clienta que firme primero.',
      errcode = 'P0001';
  end if;

  begin
    update public.citas
       set estado = p_estado,
           requiere_revision = case when p_estado = 'confirmada' then false else requiere_revision end
     where id = p_cita_id;
  exception when exclusion_violation then
    raise exception using message = 'Ese horario se acaba de ocupar, elige otro.', errcode = 'P0001';
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Renglones de un pedido (crear_pedido y venta_mostrador)
-- p_items = [{tipo: servicio|paquete|producto, id, cantidad (entero 1–99; falta = 1), regalo_para}]
-- Devuelve [{tipo, id, cantidad, descripcion, precio, regalo_para}] con precios del servidor.
--   En línea (p_mostrador = false): servicio activo, disponible, vendible_en_linea y con precio;
--     paquete activo con precio; producto activo, vendible_en_linea y con precio_venta.
--   En mostrador: lo mismo pero sin exigir vendible_en_linea (en el spa se vende también lo que
--     no está en la tienda en línea).
-- -----------------------------------------------------------------------------
create or replace function public.lineas_pedido_interna(p_items jsonb, p_mostrador boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_item      jsonb;
  v_tipo      text;
  v_id        uuid;
  v_cantidad  int;
  v_cant_num  numeric;
  v_regalo    text;
  v_desc      text;
  v_precio    numeric(10,2);
  v_lineas    jsonb := '[]'::jsonb;
  v_msg_no    text := case when p_mostrador then 'Uno de los productos ya no está a la venta.'
                           else 'Uno de los productos ya no está disponible para compra en línea.' end;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using message = 'Tu carrito está vacío.', errcode = 'P0001';
  end if;

  for v_item in select e.value from jsonb_array_elements(p_items) as e(value) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using message = v_msg_no, errcode = 'P0001';
    end if;
    v_tipo := v_item ->> 'tipo';
    begin
      v_id := nullif(v_item ->> 'id', '')::uuid;
    exception when invalid_text_representation then
      v_id := null;
    end;
    -- cantidad: entero (número o texto); falta = 1
    v_cant_num := null;
    if nullif(btrim(v_item ->> 'cantidad'), '') is not null then
      begin
        v_cant_num := (v_item ->> 'cantidad')::numeric;
      exception when others then
        raise exception using message = 'Revisa las cantidades.', errcode = 'P0001';
      end;
      if v_cant_num <> trunc(v_cant_num) or v_cant_num > 99 then
        raise exception using message = 'Revisa las cantidades.', errcode = 'P0001';
      end if;
    end if;
    if v_cant_num < 1 then
      raise exception using message = 'La cantidad debe ser al menos 1.', errcode = 'P0001';
    end if;
    v_cantidad := coalesce(v_cant_num::int, 1);
    v_regalo := nullif(btrim(v_item ->> 'regalo_para'), '');
    v_desc := null;
    v_precio := null;

    if length(v_regalo) > 120 then
      raise exception using message = 'El nombre de quien recibe el regalo es muy largo (máximo 120 caracteres).', errcode = 'P0001';
    end if;

    if v_tipo = 'servicio' then
      select s.nombre, s.precio into v_desc, v_precio
        from public.servicios s
       where s.id = v_id and s.activo and s.etapa = 'disponible' and s.precio is not null
         and (p_mostrador or s.vendible_en_linea);
    elsif v_tipo = 'paquete' then
      select p.nombre, p.precio into v_desc, v_precio
        from public.paquetes p
       where p.id = v_id and p.activo and p.precio is not null;
    elsif v_tipo = 'producto' then
      select pr.nombre || coalesce(' · ' || pr.presentacion, ''), pr.precio_venta into v_desc, v_precio
        from public.productos pr
       where pr.id = v_id and pr.activo and pr.precio_venta is not null
         and (p_mostrador or pr.vendible_en_linea);
    end if;

    if v_desc is null or v_precio is null then
      raise exception using message = v_msg_no, errcode = 'P0001';
    end if;

    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'tipo', v_tipo, 'id', v_id, 'cantidad', v_cantidad, 'descripcion', v_desc,
      'precio', v_precio, 'regalo_para', v_regalo));
  end loop;
  return v_lineas;
end;
$$;

-- Existencias de los productos de unos renglones (ESPEC §10.3). Se cuentan piezas completas
-- (floor del stock) y se suman los renglones repetidos del mismo producto.
-- p_bloquear: toma los productos "for update" (venta_mostrador descuenta en el acto).
create or replace function public.validar_existencias_interna(p_lineas jsonb, p_bloquear boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r       record;
  v_prod  public.productos;
  v_hay   int;
begin
  for r in
    select (l.value ->> 'id')::uuid as id, sum((l.value ->> 'cantidad')::int) as cantidad
      from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) as l(value)
     where l.value ->> 'tipo' = 'producto'
     group by 1
     order by 1
  loop
    if p_bloquear then
      select * into v_prod from public.productos pr where pr.id = r.id for update;
    else
      select * into v_prod from public.productos pr where pr.id = r.id;
    end if;
    v_hay := greatest(floor(v_prod.stock_actual), 0)::int;
    if r.cantidad > v_hay then
      raise exception using
        message = case
                    when v_hay = 0 then format('Por ahora no tenemos %s.', v_prod.nombre)
                    when v_hay = 1 then format('Por ahora sólo queda 1 pieza de %s.', v_prod.nombre)
                    else format('Por ahora sólo quedan %s piezas de %s.', v_hay, v_prod.nombre)
                  end,
        errcode = 'P0001';
    end if;
  end loop;
end;
$$;

-- Guarda pedido + renglones (precios ya validados por lineas_pedido_interna). Devuelve el id.
create or replace function public.insertar_pedido_interna(
  p_cliente_id uuid,
  p_lineas jsonb,
  p_metodo public.metodo_pago,
  p_notas text,
  p_origen text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_pedido uuid;
begin
  insert into public.pedidos (cliente_id, total, metodo_pago_preferido, notas, origen)
  select p_cliente_id,
         coalesce(sum((l.value ->> 'cantidad')::int * (l.value ->> 'precio')::numeric), 0),
         p_metodo, nullif(btrim(p_notas), ''), p_origen
    from jsonb_array_elements(p_lineas) as l(value)
  returning id into v_pedido;

  insert into public.pedido_items (pedido_id, tipo, servicio_id, paquete_id, producto_id, descripcion,
                                   cantidad, precio_unitario, regalo_para)
  select v_pedido,
         (l.value ->> 'tipo')::public.tipo_item_pedido,
         case when l.value ->> 'tipo' = 'servicio' then (l.value ->> 'id')::uuid end,
         case when l.value ->> 'tipo' = 'paquete'  then (l.value ->> 'id')::uuid end,
         case when l.value ->> 'tipo' = 'producto' then (l.value ->> 'id')::uuid end,
         l.value ->> 'descripcion',
         (l.value ->> 'cantidad')::int,
         (l.value ->> 'precio')::numeric,
         l.value ->> 'regalo_para'
    from jsonb_array_elements(p_lineas) as l(value);
  return v_pedido;
end;
$$;

-- -----------------------------------------------------------------------------
-- R8 · pedidos (tienda en línea; se paga en el spa o por transferencia)
-- La clienta elige efectivo, tarjeta o transferencia (cortesía y Mercado Pago los registra el
-- personal al cobrar). Cantidades enteras de 1 a 99 por línea y a lo más 5 pedidos por pagar.
-- Los productos deben tener existencias al pedir (ESPEC §10.3); se descuentan al pagarse.
-- -----------------------------------------------------------------------------
create or replace function public.crear_pedido(
  p_items jsonb,
  p_metodo_pago public.metodo_pago default 'efectivo',
  p_notas text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cliente   uuid;
  v_lineas    jsonb;
  v_id        uuid;
  v_pedido    public.pedidos;
  c_max_pendientes constant int := 5;
begin
  if auth.uid() is null then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;
  v_cliente := public.mi_cliente_id();
  if v_cliente is null then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using message = 'Tu carrito está vacío.', errcode = 'P0001';
  end if;
  if coalesce(p_metodo_pago, 'efectivo') not in ('efectivo', 'tarjeta', 'transferencia') then
    raise exception using message = 'Elige efectivo, tarjeta o transferencia.', errcode = 'P0001';
  end if;
  if length(btrim(p_notas)) > 1000 then
    raise exception using message = 'Las notas son muy largas; escríbelas en máximo 1000 caracteres.', errcode = 'P0001';
  end if;

  -- for update: dos pedidos simultáneos de la misma clienta se forman (límite de pendientes).
  perform 1 from public.clientes c where c.id = v_cliente for update;
  if (select count(*) from public.pedidos pe
       where pe.cliente_id = v_cliente and pe.estado = 'pendiente_pago') >= c_max_pendientes then
    raise exception using
      message = format('Tienes %s pedidos por pagar; págalos o cancela alguno antes de hacer otro.', c_max_pendientes),
      errcode = 'P0001';
  end if;

  v_lineas := public.lineas_pedido_interna(p_items, false);
  perform public.validar_existencias_interna(v_lineas, false);

  v_id := public.insertar_pedido_interna(v_cliente, v_lineas, coalesce(p_metodo_pago, 'efectivo'), p_notas, 'web');
  select * into v_pedido from public.pedidos pe where pe.id = v_id;

  return jsonb_build_object('id', v_pedido.id, 'folio', v_pedido.folio, 'total', v_pedido.total);
end;
$$;

-- -----------------------------------------------------------------------------
-- Venta en mostrador (ESPEC §10.3, personal): la clienta paga y se lleva lo que compró en el acto.
-- Mismos renglones que crear_pedido; servicios y paquetes (que se vuelven créditos) exigen clienta;
-- los productos, existencias. Crea el pedido (origen 'mostrador'), registra el pago completo
-- (también cortesía, que no cuenta como ingreso), lo liquida (créditos y salida de productos con
-- su costo) y, si lleva productos, lo marca entregado.
-- -----------------------------------------------------------------------------
create or replace function public.venta_mostrador(
  p_items jsonb,
  p_metodo public.metodo_pago,
  p_cliente_id uuid default null,
  p_propina numeric default 0,
  p_notas text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_lineas  jsonb;
  v_id      uuid;
  v_pedido  public.pedidos;
begin
  if not public.es_personal() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  if p_metodo is null then
    raise exception using message = 'Elige el método de pago.', errcode = 'P0001';
  end if;
  if coalesce(p_propina, 0) < 0 then
    raise exception using message = 'La propina no puede ser negativa.', errcode = 'P0001';
  end if;
  if length(btrim(p_notas)) > 1000 then
    raise exception using message = 'Las notas son muy largas; escríbelas en máximo 1000 caracteres.', errcode = 'P0001';
  end if;
  if p_cliente_id is not null and not exists (select 1 from public.clientes c where c.id = p_cliente_id) then
    raise exception using message = 'No encontramos a esa clienta.', errcode = 'P0001';
  end if;

  v_lineas := public.lineas_pedido_interna(p_items, true);
  if p_cliente_id is null
     and exists (select 1 from jsonb_array_elements(v_lineas) as l(value) where l.value ->> 'tipo' <> 'producto') then
    raise exception using message = 'Para vender servicios prepagados elige a la clienta.', errcode = 'P0001';
  end if;
  perform public.validar_existencias_interna(v_lineas, true);

  v_id := public.insertar_pedido_interna(p_cliente_id, v_lineas, p_metodo, p_notas, 'mostrador');
  select * into v_pedido from public.pedidos pe where pe.id = v_id;
  if v_pedido.total <= 0 then
    raise exception using message = 'El monto debe ser mayor a cero.', errcode = 'P0001';
  end if;

  insert into public.pagos (pedido_id, monto, propina, metodo, recibido_por)
  values (v_pedido.id, v_pedido.total, round(coalesce(p_propina, 0), 2), p_metodo, auth.uid());
  perform public.liquidar_pedido_interna(v_pedido.id);

  update public.pedidos pe
     set entregado_en = now()
   where pe.id = v_pedido.id
     and exists (select 1 from public.pedido_items pi where pi.pedido_id = pe.id and pi.tipo = 'producto');

  return jsonb_build_object('id', v_pedido.id, 'folio', v_pedido.folio, 'total', v_pedido.total);
end;
$$;

-- Entrega en el spa de un pedido pagado con productos (personal). Marcarlo otra vez no cambia la fecha.
create or replace function public.marcar_entregado(p_pedido_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_pedido public.pedidos;
begin
  if not public.es_personal() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  select * into v_pedido from public.pedidos p where p.id = p_pedido_id for update;
  if not found then
    raise exception using message = 'No encontramos ese pedido.', errcode = 'P0001';
  end if;
  if v_pedido.estado <> 'pagado' then
    raise exception using message = 'Este pedido todavía no está pagado.', errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pedido_items pi where pi.pedido_id = p_pedido_id and pi.tipo = 'producto') then
    raise exception using message = 'Este pedido no tiene productos que entregar.', errcode = 'P0001';
  end if;
  update public.pedidos set entregado_en = coalesce(entregado_en, now()) where id = p_pedido_id;
end;
$$;

create or replace function public.cancelar_pedido(p_pedido_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_pedido public.pedidos;
begin
  if auth.uid() is null then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;
  select * into v_pedido from public.pedidos p where p.id = p_pedido_id for update;
  -- Un pedido sin clienta (venta de mostrador) sólo lo toca el personal: null no es "distinto" de una
  -- sesión sin ficha, así que se revisa aparte.
  if not found
     or (not public.es_personal()
         and (v_pedido.cliente_id is null or v_pedido.cliente_id is distinct from public.mi_cliente_id())) then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  if v_pedido.estado <> 'pendiente_pago' then
    raise exception using message = 'Este pedido ya no se puede cancelar.', errcode = 'P0001';
  end if;
  update public.pedidos set estado = 'cancelado', cancelado_en = now() where id = p_pedido_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- R9 · pagos (personal). Al liquidar un pedido: créditos y salida de productos.
-- -----------------------------------------------------------------------------
create or replace function public.liquidar_pedido_interna(p_pedido_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cfg     public.configuracion := public.configuracion_actual();
  v_hoy     date := public.hoy_local();
  v_pedido  public.pedidos;
  v_it      record;
  v_ps      record;
  v_regalo  boolean;
  v_codigo  text;
begin
  select * into v_pedido from public.pedidos p where p.id = p_pedido_id for update;
  if v_pedido.estado <> 'pendiente_pago' then
    return;
  end if;
  -- Un pedido en línea no aparta piezas: si mientras tanto se vendieron, no se cobra ni se entrega lo que
  -- ya no hay (el inventario nunca queda en negativo). Mismos mensajes que crear_pedido.
  perform public.validar_existencias_interna(
    (select coalesce(jsonb_agg(jsonb_build_object('tipo', 'producto', 'id', pi.producto_id, 'cantidad', pi.cantidad)), '[]'::jsonb)
       from public.pedido_items pi
      where pi.pedido_id = p_pedido_id and pi.tipo = 'producto' and pi.producto_id is not null),
    true);
  update public.pedidos set estado = 'pagado', pagado_en = now() where id = p_pedido_id;

  for v_it in
    select pi.*, pa.tipo as paquete_tipo, pa.vigencia_dias
      from public.pedido_items pi
      left join public.paquetes pa on pa.id = pi.paquete_id
     where pi.pedido_id = p_pedido_id
     order by pi.id
  loop
    v_regalo := nullif(btrim(v_it.regalo_para), '') is not null;
    -- Un solo código por regalo (ítem), aunque genere varios créditos (bono de varios servicios).
    v_codigo := case when v_regalo and v_it.tipo <> 'producto' then public.generar_codigo_regalo() end;

    if v_it.tipo = 'servicio' then
      insert into public.creditos (cliente_id, servicio_id, cantidad, pedido_item_id, codigo_regalo, regalo_para, vence_en)
      values (v_pedido.cliente_id, v_it.servicio_id, v_it.cantidad, v_it.id,
              v_codigo,
              case when v_regalo then btrim(v_it.regalo_para) end,
              v_hoy + coalesce(v_cfg.vigencia_creditos_dias, 365));

    elsif v_it.tipo = 'paquete' and v_it.paquete_tipo = 'combo' then
      insert into public.creditos (cliente_id, paquete_id, cantidad, pedido_item_id, codigo_regalo, regalo_para, vence_en)
      values (v_pedido.cliente_id, v_it.paquete_id, v_it.cantidad, v_it.id,
              v_codigo,
              case when v_regalo then btrim(v_it.regalo_para) end,
              v_hoy + coalesce(v_it.vigencia_dias, v_cfg.vigencia_creditos_dias, 365));

    elsif v_it.tipo = 'paquete' then   -- bono: N sesiones de su(s) servicio(s)
      for v_ps in select ps.servicio_id, ps.cantidad from public.paquete_servicios ps where ps.paquete_id = v_it.paquete_id loop
        insert into public.creditos (cliente_id, servicio_id, cantidad, pedido_item_id, codigo_regalo, regalo_para, vence_en)
        values (v_pedido.cliente_id, v_ps.servicio_id, v_it.cantidad * v_ps.cantidad, v_it.id,
                v_codigo,
                case when v_regalo then btrim(v_it.regalo_para) end,
                v_hoy + coalesce(v_it.vigencia_dias, v_cfg.vigencia_creditos_dias, 365));
      end loop;

    elsif v_it.tipo = 'producto' then
      insert into public.movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, pedido_id, nota, creado_por)
      select pr.id, 'venta', -v_it.cantidad, pr.costo_unitario, p_pedido_id,
             'Venta del pedido ' || coalesce(v_pedido.folio, ''), auth.uid()
        from public.productos pr
       where pr.id = v_it.producto_id;
    end if;
  end loop;
end;
$$;

create or replace function public.registrar_pago(
  p_monto numeric,
  p_metodo public.metodo_pago,
  p_pedido_id uuid default null,
  p_cita_id uuid default null,
  p_referencia text default null,
  p_propina numeric default 0
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_pedido public.pedidos;
  v_pago   uuid;
  v_pagado numeric;
begin
  if not public.es_personal() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  if p_pedido_id is null and p_cita_id is null then
    raise exception using message = 'Indica el pedido o la cita que se está pagando.', errcode = 'P0001';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception using message = 'El monto debe ser mayor a cero.', errcode = 'P0001';
  end if;
  if coalesce(p_propina, 0) < 0 then
    raise exception using message = 'La propina no puede ser negativa.', errcode = 'P0001';
  end if;
  if p_metodo is null then
    raise exception using message = 'Elige el método de pago.', errcode = 'P0001';
  end if;

  if p_pedido_id is not null then
    select * into v_pedido from public.pedidos p where p.id = p_pedido_id for update;
    if not found then
      raise exception using message = 'No encontramos ese pedido.', errcode = 'P0001';
    end if;
    if v_pedido.estado in ('cancelado', 'reembolsado') then
      raise exception using message = 'Ese pedido está cancelado.', errcode = 'P0001';
    end if;
  end if;
  if p_cita_id is not null and not exists (select 1 from public.citas c where c.id = p_cita_id) then
    raise exception using message = 'No encontramos esa cita.', errcode = 'P0001';
  end if;

  insert into public.pagos (pedido_id, cita_id, monto, propina, metodo, referencia, recibido_por)
  values (p_pedido_id, p_cita_id, round(p_monto, 2), round(coalesce(p_propina, 0), 2), p_metodo,
          nullif(btrim(p_referencia), ''), auth.uid())
  returning id into v_pago;

  if p_pedido_id is not null and v_pedido.estado = 'pendiente_pago' then
    select coalesce(sum(pg.monto), 0) into v_pagado from public.pagos pg where pg.pedido_id = p_pedido_id;
    if v_pagado >= v_pedido.total then
      perform public.liquidar_pedido_interna(p_pedido_id);
    end if;
  end if;

  return v_pago;
end;
$$;

-- R10 · canjear un regalo: los créditos con ese código (uno, o varios si es un bono de varios
-- servicios) pasan a la clienta que canjea. Devuelve el id de uno de ellos.
create or replace function public.canjear_regalo(p_codigo text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cliente uuid;
  v_codigo  text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_credito uuid;
begin
  if auth.uid() is null then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;
  v_cliente := public.mi_cliente_id();
  if v_cliente is null then
    raise exception using message = 'Inicia sesión para continuar.', errcode = 'P0001';
  end if;

  perform 1 from public.creditos cr where v_codigo <> '' and cr.codigo_regalo = v_codigo for update;

  with canjeados as (
    update public.creditos
       set cliente_id = v_cliente,
           codigo_regalo = null
     where v_codigo <> '' and codigo_regalo = v_codigo
    returning id, creado_en
  )
  select c.id into v_credito from canjeados c order by c.creado_en, c.id limit 1;
  if v_credito is null then
    raise exception using message = 'Ese código de regalo no existe o ya se canjeó.', errcode = 'P0001';
  end if;
  return v_credito;
end;
$$;

-- -----------------------------------------------------------------------------
-- R11 · compras e inventario (personal)
-- -----------------------------------------------------------------------------
create or replace function public.registrar_compra(
  p_items jsonb,
  p_proveedor_id uuid default null,
  p_fecha date default public.hoy_local(),   -- "hoy" en Querétaro (current_date sería UTC)
  p_folio text default null,
  p_notas text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_compra uuid;
  v_item   jsonb;
  v_prod   public.productos;
  v_pres   numeric;
  v_costo  numeric;
  v_total  numeric(10,2) := 0;
begin
  if not public.es_personal() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using message = 'Agrega al menos un producto a la compra.', errcode = 'P0001';
  end if;
  if p_proveedor_id is not null and not exists (select 1 from public.proveedores pv where pv.id = p_proveedor_id) then
    raise exception using message = 'No encontramos ese proveedor.', errcode = 'P0001';
  end if;

  insert into public.compras (proveedor_id, fecha, folio, notas, registrada_por)
  values (p_proveedor_id, coalesce(p_fecha, public.hoy_local()), nullif(btrim(p_folio), ''),
          nullif(btrim(p_notas), ''), auth.uid())
  returning id into v_compra;

  for v_item in select e.value from jsonb_array_elements(p_items) as e(value) loop
    select * into v_prod from public.productos pr
     where pr.id = nullif(v_item ->> 'producto_id', '')::uuid
     for update;
    if not found then
      raise exception using message = 'Uno de los productos de la compra no existe.', errcode = 'P0001';
    end if;
    v_pres := nullif(v_item ->> 'presentaciones', '')::numeric;
    v_costo := coalesce(nullif(v_item ->> 'costo_presentacion', '')::numeric, v_prod.costo_presentacion);
    if v_pres is null or v_pres <= 0 then
      raise exception using message = 'Las presentaciones compradas deben ser más de cero.', errcode = 'P0001';
    end if;
    if v_costo < 0 then
      raise exception using message = 'El costo no puede ser negativo.', errcode = 'P0001';
    end if;

    insert into public.compra_items (compra_id, producto_id, presentaciones, costo_presentacion)
    values (v_compra, v_prod.id, v_pres, v_costo);

    -- El costo vigente es el de la última compra.
    update public.productos set costo_presentacion = v_costo where id = v_prod.id;

    insert into public.movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, compra_id, nota, creado_por)
    select pr.id, 'compra', v_pres * pr.contenido_presentacion, pr.costo_unitario, v_compra,
           'Compra' || coalesce(' ' || nullif(btrim(p_folio), ''), ''), auth.uid()
      from public.productos pr
     where pr.id = v_prod.id;

    v_total := v_total + round(v_pres * v_costo, 2);
  end loop;

  update public.compras set total = v_total where id = v_compra;
  return v_compra;
end;
$$;

create or replace function public.ajustar_inventario(
  p_producto_id uuid,
  p_cantidad numeric,
  p_tipo public.tipo_movimiento,
  p_nota text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cantidad numeric := p_cantidad;
begin
  if not public.es_personal() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  if p_tipo is null or p_tipo not in ('ajuste', 'merma') then
    raise exception using message = 'Sólo se registran ajustes o mermas.', errcode = 'P0001';
  end if;
  if v_cantidad is null or v_cantidad = 0 then
    raise exception using message = 'La cantidad no puede ser cero.', errcode = 'P0001';
  end if;
  if p_tipo = 'merma' then
    v_cantidad := -abs(v_cantidad);   -- una merma siempre resta
  end if;
  if not exists (select 1 from public.productos pr where pr.id = p_producto_id) then
    raise exception using message = 'No encontramos ese producto.', errcode = 'P0001';
  end if;

  insert into public.movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, nota, creado_por)
  select pr.id, p_tipo, v_cantidad, pr.costo_unitario, nullif(btrim(p_nota), ''), auth.uid()
    from public.productos pr
   where pr.id = p_producto_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- R13 · publicar una versión nueva de una política (admin)
-- -----------------------------------------------------------------------------
create or replace function public.publicar_politica(p_tipo public.tipo_politica, p_titulo text, p_contenido_md text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_version int;
begin
  if not public.es_admin() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  if p_tipo is null or nullif(btrim(p_titulo), '') is null or nullif(btrim(p_contenido_md), '') is null then
    raise exception using message = 'Escribe el título y el contenido de la política.', errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('opalo.politica.' || p_tipo::text));

  select coalesce(max(p.version), 0) + 1 into v_version from public.politicas p where p.tipo = p_tipo;
  update public.politicas set activa = false where tipo = p_tipo and activa;

  insert into public.politicas (tipo, version, titulo, contenido_md, activa, vigente_desde)
  values (p_tipo, v_version, btrim(p_titulo), p_contenido_md, true, now())
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escrituras atómicas del panel (ESPEC §6 y §6.1): paquetes, horarios y recetas.
-- Cada una reemplaza el conjunto completo en una sola transacción (no quedan paquetes a medias
-- si se corta la red). Las tablas paquetes, paquete_servicios, horarios y recetas_servicio ya no
-- aceptan escrituras directas de anon/authenticated (1100_seguridad).
-- -----------------------------------------------------------------------------

-- Paquete (admin): upsert del paquete + reemplazo de paquete_servicios.
--   p_id     null = nuevo; si no, el paquete a editar.
--   p_datos  {slug, nombre, descripcion, tipo, precio, duracion_min, vigencia_dias, activo, orden}.
--            Al editar, lo que no venga se queda como está; al crear, toma su valor por defecto.
--            Si no viene slug (o viene vacío), se arma con el nombre ("Paquete Verano" → paquete-verano).
--   p_items  [{servicio_id, cantidad}] (cantidad entera 1–99, 1 si falta; repetidos se suman).
-- Un bono es N sesiones de un mismo servicio: lleva exactamente un servicio.
create or replace function public.guardar_paquete(p_id uuid, p_datos jsonb, p_items jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_paq       public.paquetes;
  v_slug      text;
  v_item      jsonb;
  v_serv      uuid;
  v_cant_num  numeric;
  v_items     jsonb := '{}'::jsonb;    -- {servicio_id: cantidad}
begin
  if not public.es_admin() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception using message = 'Escribe el nombre del paquete.', errcode = 'P0001';
  end if;

  if p_id is not null then
    select * into v_paq from public.paquetes p where p.id = p_id for update;
    if not found then
      raise exception using message = 'No encontramos ese paquete.', errcode = 'P0001';
    end if;
  else
    v_paq.id := gen_random_uuid();
    v_paq.tipo := 'combo';
    v_paq.activo := true;
    v_paq.orden := 0;
  end if;

  -- Datos del paquete
  if p_datos ? 'nombre' then
    v_paq.nombre := nullif(btrim(p_datos ->> 'nombre'), '');
  end if;
  if v_paq.nombre is null then
    raise exception using message = 'Escribe el nombre del paquete.', errcode = 'P0001';
  end if;
  if length(v_paq.nombre) > 200 then
    raise exception using message = 'El nombre es muy largo; escríbelo en máximo 200 caracteres.', errcode = 'P0001';
  end if;

  if p_id is null or p_datos ? 'slug' then
    v_slug := coalesce(nullif(btrim(p_datos ->> 'slug'), ''), v_paq.nombre);
    v_slug := lower(translate(v_slug, 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
                                      'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc'));
    v_slug := btrim(regexp_replace(v_slug, '[^a-z0-9_-]+', '-', 'g'), '-_');
    if v_slug = '' then
      raise exception using message = 'El identificador (slug) del paquete debe tener letras o números.', errcode = 'P0001';
    end if;
    v_paq.slug := v_slug;
  end if;
  if exists (select 1 from public.paquetes p where p.slug = v_paq.slug and p.id <> v_paq.id) then
    raise exception using message = 'Ya existe otro paquete con ese identificador (slug).', errcode = 'P0001';
  end if;

  if p_datos ? 'descripcion' then
    v_paq.descripcion := nullif(btrim(p_datos ->> 'descripcion'), '');
  end if;

  if p_datos ? 'tipo' then
    if coalesce(p_datos ->> 'tipo', '') not in ('combo', 'bono') then
      raise exception using message = 'Elige si el paquete es combo o bono.', errcode = 'P0001';
    end if;
    v_paq.tipo := (p_datos ->> 'tipo')::public.tipo_paquete;
  end if;

  if p_datos ? 'precio' then
    begin
      v_paq.precio := nullif(btrim(p_datos ->> 'precio'), '')::numeric;
    exception when others then
      raise exception using message = 'Revisa el precio.', errcode = 'P0001';
    end;
    if v_paq.precio = 'NaN'::numeric then
      raise exception using message = 'Revisa el precio.', errcode = 'P0001';
    end if;
    if v_paq.precio < 0 then
      raise exception using message = 'El precio no puede ser negativo.', errcode = 'P0001';
    end if;
  end if;

  if p_datos ? 'duracion_min' then
    begin
      v_cant_num := nullif(btrim(p_datos ->> 'duracion_min'), '')::numeric;
      if v_cant_num <> trunc(v_cant_num) or v_cant_num < 0 then
        raise exception 'duración inválida';
      end if;
      v_paq.duracion_min := v_cant_num::int;
    exception when others then
      raise exception using message = 'Revisa la duración: minutos enteros, cero o más.', errcode = 'P0001';
    end;
  end if;

  if p_datos ? 'vigencia_dias' then
    begin
      v_cant_num := nullif(btrim(p_datos ->> 'vigencia_dias'), '')::numeric;
      if v_cant_num <> trunc(v_cant_num) or v_cant_num <= 0 then
        raise exception 'vigencia inválida';
      end if;
      v_paq.vigencia_dias := v_cant_num::int;
    exception when others then
      raise exception using message = 'Revisa la vigencia: días enteros, uno o más.', errcode = 'P0001';
    end;
  end if;

  begin
    if p_datos ? 'activo' and jsonb_typeof(p_datos -> 'activo') <> 'null' then
      v_paq.activo := (p_datos ->> 'activo')::boolean;
    end if;
    if p_datos ? 'orden' and jsonb_typeof(p_datos -> 'orden') <> 'null' then
      v_paq.orden := (p_datos ->> 'orden')::numeric::int;
    end if;
  exception when others then
    raise exception using message = 'Revisa los datos del paquete.', errcode = 'P0001';
  end;

  -- Servicios del paquete
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using message = 'Agrega al menos un servicio al paquete.', errcode = 'P0001';
  end if;
  for v_item in select e.value from jsonb_array_elements(p_items) as e(value) loop
    v_serv := null;
    if jsonb_typeof(v_item) = 'object' then
      begin
        v_serv := nullif(btrim(v_item ->> 'servicio_id'), '')::uuid;
      exception when invalid_text_representation then
        v_serv := null;
      end;
    end if;
    if v_serv is null or not exists (select 1 from public.servicios s where s.id = v_serv) then
      raise exception using message = 'Uno de los servicios del paquete no existe.', errcode = 'P0001';
    end if;

    v_cant_num := 1;
    if nullif(btrim(v_item ->> 'cantidad'), '') is not null then
      begin
        v_cant_num := (v_item ->> 'cantidad')::numeric;
      exception when others then
        raise exception using message = 'Revisa las cantidades.', errcode = 'P0001';
      end;
    end if;
    if v_cant_num <> trunc(v_cant_num) or v_cant_num < 1 or v_cant_num > 99 then
      raise exception using message = 'Revisa las cantidades.', errcode = 'P0001';
    end if;

    v_items := v_items || jsonb_build_object(v_serv::text,
                 coalesce((v_items ->> v_serv::text)::int, 0) + v_cant_num::int);
    if (v_items ->> v_serv::text)::int > 99 then
      raise exception using message = 'Revisa las cantidades.', errcode = 'P0001';
    end if;
  end loop;

  if v_paq.tipo = 'bono' and (select count(*) from jsonb_object_keys(v_items)) <> 1 then
    raise exception using
      message = 'Un bono es de un solo servicio: elige sólo uno y cuántas sesiones incluye.',
      errcode = 'P0001';
  end if;

  -- Guardar todo junto
  begin
    if p_id is null then
      insert into public.paquetes (id, slug, nombre, descripcion, tipo, precio, duracion_min, vigencia_dias, activo, orden)
      values (v_paq.id, v_paq.slug, v_paq.nombre, v_paq.descripcion, v_paq.tipo, v_paq.precio, v_paq.duracion_min,
              v_paq.vigencia_dias, v_paq.activo, v_paq.orden);
    else
      update public.paquetes
         set slug = v_paq.slug, nombre = v_paq.nombre, descripcion = v_paq.descripcion, tipo = v_paq.tipo,
             precio = v_paq.precio, duracion_min = v_paq.duracion_min, vigencia_dias = v_paq.vigencia_dias,
             activo = v_paq.activo, orden = v_paq.orden
       where id = v_paq.id;
    end if;
  exception when unique_violation then
    raise exception using message = 'Ya existe otro paquete con ese identificador (slug).', errcode = 'P0001';
  end;

  delete from public.paquete_servicios ps where ps.paquete_id = v_paq.id;
  insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)
  select v_paq.id, e.key::uuid, e.value::text::int
    from jsonb_each(v_items) as e(key, value);

  return v_paq.id;
end;
$$;

-- Horario semanal de una persona del equipo (admin): reemplaza todos sus rangos.
--   p_horarios  [{dia_semana (0 = domingo … 6 = sábado), hora_inicio 'HH:MI', hora_fin 'HH:MI'}]
--               '[]' deja a la persona sin horario (no ofrece citas en línea).
-- Puede haber varios rangos por día (comida), pero no encimados (10–14 y 14–19 sí; 10–14 y 13–19 no).
create or replace function public.guardar_horarios(p_personal_id uuid, p_horarios jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_h        jsonb;
  v_dia      int;
  v_ini      time;
  v_fin      time;
  v_dias     int[] := '{}';
  v_inis     time[] := '{}';
  v_fins     time[] := '{}';
  v_choque   record;
  c_nombres  constant text[] := array['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
begin
  if not public.es_admin() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  -- for update: dos guardados simultáneos del mismo horario se forman.
  perform 1 from public.personal p where p.id = p_personal_id for update;
  if not found then
    raise exception using message = 'No encontramos a esa persona del equipo.', errcode = 'P0001';
  end if;
  if p_horarios is null or jsonb_typeof(p_horarios) <> 'array' then
    raise exception using message = 'Revisa los horarios.', errcode = 'P0001';
  end if;

  for v_h in select e.value from jsonb_array_elements(p_horarios) as e(value) loop
    v_dia := null;
    v_ini := null;
    v_fin := null;
    if jsonb_typeof(v_h) = 'object' then
      begin
        v_dia := (v_h ->> 'dia_semana')::numeric::int;
        if (v_h ->> 'dia_semana')::numeric <> v_dia then
          v_dia := null;
        end if;
      exception when others then
        v_dia := null;
      end;
      begin
        v_ini := nullif(btrim(v_h ->> 'hora_inicio'), '')::time;
        v_fin := nullif(btrim(v_h ->> 'hora_fin'), '')::time;
      exception when others then
        v_ini := null;
        v_fin := null;
      end;
    end if;
    if v_dia is null or v_dia not between 0 and 6 then
      raise exception using message = 'El día de la semana debe ir de 0 (domingo) a 6 (sábado).', errcode = 'P0001';
    end if;
    if v_ini is null or v_fin is null then
      raise exception using message = 'Escribe la hora de entrada y la de salida.', errcode = 'P0001';
    end if;
    if v_fin <= v_ini then
      raise exception using message = 'La salida debe ser después de la entrada.', errcode = 'P0001';
    end if;
    v_dias := v_dias || v_dia;
    v_inis := v_inis || v_ini;
    v_fins := v_fins || v_fin;
  end loop;

  -- Sin traslapes el mismo día (rangos pegados, como 10–14 y 14–19, sí se permiten).
  with r as (
    select x.dia, x.ini, x.fin, x.n
      from unnest(v_dias, v_inis, v_fins) with ordinality as x(dia, ini, fin, n)
  )
  select a.dia, a.ini as a_ini, a.fin as a_fin, b.ini as b_ini, b.fin as b_fin
    into v_choque
    from r a
    join r b on b.dia = a.dia and b.n <> a.n
            and (a.ini, a.n) < (b.ini, b.n)
            and b.ini < a.fin and a.ini < b.fin
   order by a.dia, a.ini, b.ini
   limit 1;
  if found then
    raise exception using
      message = format('Dos horarios del %s se enciman (%s–%s y %s–%s).', c_nombres[v_choque.dia + 1],
                       left(v_choque.a_ini::text, 5), left(v_choque.a_fin::text, 5),
                       left(v_choque.b_ini::text, 5), left(v_choque.b_fin::text, 5)),
      errcode = 'P0001';
  end if;

  delete from public.horarios h where h.personal_id = p_personal_id;
  insert into public.horarios (personal_id, dia_semana, hora_inicio, hora_fin)
  select p_personal_id, x.dia, x.ini, x.fin
    from unnest(v_dias, v_inis, v_fins) as x(dia, ini, fin)
   order by x.dia, x.ini;
end;
$$;

-- Receta de un servicio (personal): cuánto se gasta de cada producto. Reemplaza la receta completa.
--   p_items  [{producto_id, cantidad (> 0, en la unidad del producto), notas}]; '[]' la deja vacía.
--            Si un producto se repite, se suman las cantidades.
create or replace function public.guardar_receta(p_servicio_id uuid, p_items jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_item     jsonb;
  v_prod     uuid;
  v_cant     numeric;
  v_notas    text;
  v_receta   jsonb := '{}'::jsonb;    -- {producto_id: {cantidad, notas}}
  v_previo   jsonb;
begin
  if not public.es_personal() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  -- for update: dos guardados simultáneos de la misma receta se forman.
  perform 1 from public.servicios s where s.id = p_servicio_id for update;
  if not found then
    raise exception using message = 'No encontramos ese servicio.', errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using message = 'Revisa la receta.', errcode = 'P0001';
  end if;

  for v_item in select e.value from jsonb_array_elements(p_items) as e(value) loop
    v_prod := null;
    if jsonb_typeof(v_item) = 'object' then
      begin
        v_prod := nullif(btrim(v_item ->> 'producto_id'), '')::uuid;
      exception when invalid_text_representation then
        v_prod := null;
      end;
    end if;
    if v_prod is null or not exists (select 1 from public.productos pr where pr.id = v_prod) then
      raise exception using message = 'Uno de los productos de la receta no existe.', errcode = 'P0001';
    end if;

    begin
      v_cant := round(nullif(btrim(v_item ->> 'cantidad'), '')::numeric, 3);
    exception when others then
      v_cant := null;
    end;
    if v_cant is null or v_cant <= 0 or v_cant >= 1000000000 then
      raise exception using message = 'La cantidad de cada producto debe ser mayor a cero.', errcode = 'P0001';
    end if;

    v_notas := nullif(btrim(v_item ->> 'notas'), '');
    if length(v_notas) > 1000 then
      raise exception using message = 'Las notas son muy largas; escríbelas en máximo 1000 caracteres.', errcode = 'P0001';
    end if;

    v_previo := v_receta -> v_prod::text;
    v_receta := v_receta || jsonb_build_object(v_prod::text, jsonb_build_object(
      'cantidad', coalesce((v_previo ->> 'cantidad')::numeric, 0) + v_cant,
      'notas', coalesce(v_previo ->> 'notas', v_notas)));
    if (v_receta -> v_prod::text ->> 'cantidad')::numeric >= 1000000000 then
      raise exception using message = 'La cantidad de cada producto debe ser mayor a cero.', errcode = 'P0001';
    end if;
  end loop;

  delete from public.recetas_servicio r where r.servicio_id = p_servicio_id;
  insert into public.recetas_servicio (servicio_id, producto_id, cantidad, notas)
  select p_servicio_id, e.key::uuid, (e.value ->> 'cantidad')::numeric, e.value ->> 'notas'
    from jsonb_each(v_receta) as e(key, value);
end;
$$;

-- =============================================================================
-- Taller: fórmulas y lotes de producción (ESPEC §10.2, personal)
-- Los productos terminados (jabon, vela, set) se manejan por pieza; la materia prima, en su
-- unidad (g, ml, pz). Un lote consume materia prima al registrarse (insumo_produccion, con su
-- costo), queda en curado y, al liberarse, sus piezas entran al inventario (produccion) con el
-- costo real por pieza, que pasa a ser el costo del producto.
-- =============================================================================

-- Insumos [{insumo_id, cantidad}] → {insumo_id: cantidad} (cantidades > 0, repetidos se suman).
-- p_producto_id: el producto que se elabora (no puede ser su propio insumo).
create or replace function public.insumos_interna(p_items jsonb, p_producto_id uuid, p_que text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_item    jsonb;
  v_insumo  uuid;
  v_cant    numeric;
  v_res     jsonb := '{}'::jsonb;
begin
  for v_item in select e.value from jsonb_array_elements(p_items) as e(value) loop
    v_insumo := null;
    if jsonb_typeof(v_item) = 'object' then
      begin
        v_insumo := nullif(btrim(v_item ->> 'insumo_id'), '')::uuid;
      exception when invalid_text_representation then
        v_insumo := null;
      end;
    end if;
    if v_insumo is null or not exists (select 1 from public.productos pr where pr.id = v_insumo) then
      raise exception using message = format('Uno de los insumos %s no existe.', p_que), errcode = 'P0001';
    end if;
    if v_insumo = p_producto_id then
      raise exception using
        message = 'Un producto no puede ser insumo de sí mismo: elige la materia prima que lleva.',
        errcode = 'P0001';
    end if;
    begin
      v_cant := round(nullif(btrim(v_item ->> 'cantidad'), '')::numeric, 3);
    exception when others then
      v_cant := null;
    end;
    if v_cant is null or v_cant <= 0 or v_cant >= 1000000000 then
      raise exception using message = 'La cantidad de cada insumo debe ser mayor a cero.', errcode = 'P0001';
    end if;
    v_res := v_res || jsonb_build_object(v_insumo::text, coalesce((v_res ->> v_insumo::text)::numeric, 0) + v_cant);
    if (v_res ->> v_insumo::text)::numeric >= 1000000000 then
      raise exception using message = 'La cantidad de cada insumo debe ser mayor a cero.', errcode = 'P0001';
    end if;
  end loop;
  return v_res;
end;
$$;

-- Fórmula (personal): upsert + reemplazo de sus insumos en una transacción.
--   p_id     null = nueva.
--   p_datos  {producto_id, nombre, rendimiento_piezas, dias_curado, instrucciones, activa}; al editar,
--            lo que no venga se queda como está.
--   p_items  [{insumo_id, cantidad}] (en la unidad del insumo, para un lote completo); al menos uno.
create or replace function public.guardar_formula(p_id uuid, p_datos jsonb, p_items jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_f      public.formulas;
  v_num    numeric;
  v_items  jsonb;
begin
  if not public.es_personal() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception using message = 'Escribe el nombre de la fórmula.', errcode = 'P0001';
  end if;

  if p_id is not null then
    select * into v_f from public.formulas f where f.id = p_id for update;
    if not found then
      raise exception using message = 'No encontramos esa fórmula.', errcode = 'P0001';
    end if;
  else
    v_f.id := gen_random_uuid();
    v_f.dias_curado := 0;
    v_f.activa := true;
  end if;

  if p_id is null or p_datos ? 'producto_id' then
    begin
      v_f.producto_id := nullif(btrim(p_datos ->> 'producto_id'), '')::uuid;
    exception when invalid_text_representation then
      v_f.producto_id := null;
    end;
    if v_f.producto_id is null then
      raise exception using message = 'Elige el producto que se elabora con esta fórmula.', errcode = 'P0001';
    end if;
    if not exists (select 1 from public.productos pr where pr.id = v_f.producto_id) then
      raise exception using message = 'No encontramos ese producto.', errcode = 'P0001';
    end if;
  end if;

  if p_datos ? 'nombre' then
    v_f.nombre := nullif(btrim(p_datos ->> 'nombre'), '');
  end if;
  if v_f.nombre is null then
    raise exception using message = 'Escribe el nombre de la fórmula.', errcode = 'P0001';
  end if;
  if length(v_f.nombre) > 200 then
    raise exception using message = 'El nombre es muy largo; escríbelo en máximo 200 caracteres.', errcode = 'P0001';
  end if;

  if p_id is null or p_datos ? 'rendimiento_piezas' then
    begin
      v_num := round(nullif(btrim(p_datos ->> 'rendimiento_piezas'), '')::numeric, 2);
    exception when others then
      v_num := null;
    end;
    if v_num is null or v_num <= 0 or v_num >= 100000000 then
      raise exception using message = 'Revisa el rendimiento: cuántas piezas salen de un lote (más de cero).', errcode = 'P0001';
    end if;
    v_f.rendimiento_piezas := v_num;
  end if;

  if p_datos ? 'dias_curado' and jsonb_typeof(p_datos -> 'dias_curado') <> 'null' then
    begin
      v_num := (p_datos ->> 'dias_curado')::numeric;
      if v_num <> trunc(v_num) or v_num < 0 or v_num > 3650 then
        raise exception 'días inválidos';
      end if;
      v_f.dias_curado := v_num::int;
    exception when others then
      raise exception using message = 'Revisa los días de curado: días enteros, cero o más.', errcode = 'P0001';
    end;
  end if;

  if p_datos ? 'instrucciones' then
    v_f.instrucciones := nullif(btrim(p_datos ->> 'instrucciones'), '');
    if length(v_f.instrucciones) > 5000 then
      raise exception using message = 'Las instrucciones son muy largas; escríbelas en máximo 5000 caracteres.', errcode = 'P0001';
    end if;
  end if;

  if p_datos ? 'activa' and jsonb_typeof(p_datos -> 'activa') <> 'null' then
    begin
      v_f.activa := (p_datos ->> 'activa')::boolean;
    exception when others then
      raise exception using message = 'Revisa los datos de la fórmula.', errcode = 'P0001';
    end;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using message = 'Agrega al menos un insumo a la fórmula.', errcode = 'P0001';
  end if;
  v_items := public.insumos_interna(p_items, v_f.producto_id, 'de la fórmula');

  if p_id is null then
    insert into public.formulas (id, producto_id, nombre, rendimiento_piezas, dias_curado, instrucciones, activa)
    values (v_f.id, v_f.producto_id, v_f.nombre, v_f.rendimiento_piezas, v_f.dias_curado, v_f.instrucciones, v_f.activa);
  else
    update public.formulas
       set producto_id = v_f.producto_id, nombre = v_f.nombre, rendimiento_piezas = v_f.rendimiento_piezas,
           dias_curado = v_f.dias_curado, instrucciones = v_f.instrucciones, activa = v_f.activa
     where id = v_f.id;
  end if;

  delete from public.formula_items fi where fi.formula_id = v_f.id;
  insert into public.formula_items (formula_id, insumo_id, cantidad)
  select v_f.id, e.key::uuid, e.value::text::numeric
    from jsonb_each(v_items) as e(key, value);

  return v_f.id;
end;
$$;

-- Libera un lote (sin validar rol ni curado: lo hacen liberar_lote y registrar_lote).
create or replace function public.liberar_lote_interna(p_lote_id uuid, p_piezas_obtenidas numeric)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_lote    public.lotes_produccion;
  v_piezas  numeric;
  v_costo   numeric;
begin
  select * into v_lote from public.lotes_produccion l where l.id = p_lote_id for update;
  v_piezas := round(coalesce(p_piezas_obtenidas, v_lote.piezas_planeadas), 2);
  if v_piezas is null or v_piezas <= 0 or v_piezas >= 100000000 then
    raise exception using message = 'Revisa las piezas obtenidas: más de cero.', errcode = 'P0001';
  end if;
  v_costo := round(v_lote.costo_materiales / v_piezas, 4);

  update public.lotes_produccion
     set estado = 'disponible',
         piezas_obtenidas = v_piezas,
         costo_unitario = v_costo,
         liberado_en = now()
   where id = p_lote_id;

  insert into public.movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, lote_id, nota, creado_por)
  values (v_lote.producto_id, 'produccion', v_piezas, v_costo, p_lote_id, 'Lote ' || v_lote.codigo, auth.uid());

  -- El costo del producto terminado pasa a ser el real de este lote.
  update public.productos pr
     set costo_presentacion = round(v_costo * pr.contenido_presentacion, 2)
   where pr.id = v_lote.producto_id;
end;
$$;

-- Registrar un lote (personal). Materiales: p_items (lo que realmente se usó) o, si no viene, los
-- de la fórmula escalados a p_piezas / rendimiento_piezas. Sin p_piezas, las que rinde la fórmula.
-- Valida existencias, descuenta la materia prima con su costo y, si la fórmula no pide curado
-- (dias_curado = 0, o no hay fórmula), libera el lote en el acto.
create or replace function public.registrar_lote(
  p_producto_id uuid,
  p_formula_id uuid default null,
  p_piezas numeric default null,
  p_elaborado_en date default null,
  p_caduca_en date default null,
  p_notas text default null,
  p_items jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_prod       public.productos;
  v_formula    public.formulas;
  v_piezas     numeric;
  v_elaborado  date := coalesce(p_elaborado_en, public.hoy_local());
  v_items      jsonb;
  v_insumo     public.productos;
  v_cant       numeric;
  v_costo      numeric := 0;
  v_lote       public.lotes_produccion;
  r            record;
begin
  if not public.es_personal() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  select * into v_prod from public.productos pr where pr.id = p_producto_id;
  if not found then
    raise exception using message = 'No encontramos ese producto.', errcode = 'P0001';
  end if;
  if p_formula_id is not null then
    select * into v_formula from public.formulas f where f.id = p_formula_id;
    if not found then
      raise exception using message = 'No encontramos esa fórmula.', errcode = 'P0001';
    end if;
    if v_formula.producto_id <> p_producto_id then
      raise exception using message = 'Esa fórmula es de otro producto.', errcode = 'P0001';
    end if;
  end if;

  if v_formula.id is null
     and (p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0) then
    raise exception using message = 'Elige la fórmula o escribe los insumos que usaste.', errcode = 'P0001';
  end if;
  -- Un jabón sin fórmula no tendría días de curado y quedaría a la venta el mismo día.
  if v_formula.id is null and v_prod.categoria = 'jabon' then
    raise exception using message = 'Los jabones necesitan una fórmula con sus días de curado; elígela o créala primero.', errcode = 'P0001';
  end if;

  v_piezas := round(coalesce(p_piezas, v_formula.rendimiento_piezas), 2);
  if v_piezas is null then
    raise exception using message = 'Escribe cuántas piezas salen del lote.', errcode = 'P0001';
  end if;
  if v_piezas <= 0 or v_piezas >= 100000000 then
    raise exception using message = 'Revisa las piezas: más de cero.', errcode = 'P0001';
  end if;
  if v_elaborado > public.hoy_local() then
    raise exception using message = 'La fecha de elaboración no puede ser futura.', errcode = 'P0001';
  end if;
  if p_caduca_en is not null and p_caduca_en < v_elaborado then
    raise exception using message = 'La caducidad debe ser después de la elaboración.', errcode = 'P0001';
  end if;
  if length(btrim(p_notas)) > 1000 then
    raise exception using message = 'Las notas son muy largas; escríbelas en máximo 1000 caracteres.', errcode = 'P0001';
  end if;

  -- Materiales: lo que se usó o la fórmula escalada a las piezas
  if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
    v_items := public.insumos_interna(p_items, p_producto_id, 'del lote');
  else
    select coalesce(jsonb_object_agg(fi.insumo_id::text,
                                     round(fi.cantidad * v_piezas / v_formula.rendimiento_piezas, 3)), '{}'::jsonb)
      into v_items
      from public.formula_items fi
     where fi.formula_id = v_formula.id;
    if v_items = '{}'::jsonb then
      raise exception using message = 'La fórmula no tiene insumos.', errcode = 'P0001';
    end if;
  end if;

  -- Existencias (for update y en orden: dos lotes simultáneos no se gastan la misma materia prima)
  for r in select e.key::uuid as insumo_id, e.value::text::numeric as cantidad
             from jsonb_each(v_items) as e(key, value)
            order by 1 loop
    select * into v_insumo from public.productos pr where pr.id = r.insumo_id for update;
    if v_insumo.stock_actual < r.cantidad then
      raise exception using
        message = format('No alcanza el inventario de %s: hay %s %s y se necesitan %s %s.',
                         v_insumo.nombre, public.cantidad_legible(greatest(v_insumo.stock_actual, 0)), v_insumo.unidad_medida,
                         public.cantidad_legible(r.cantidad), v_insumo.unidad_medida),
        errcode = 'P0001';
    end if;
    v_costo := v_costo + r.cantidad * v_insumo.costo_unitario;
  end loop;

  insert into public.lotes_produccion (producto_id, formula_id, elaborado_en, piezas_planeadas, dias_curado, caduca_en,
                                       costo_materiales, costo_unitario, notas, creado_por)
  values (p_producto_id, v_formula.id, v_elaborado, v_piezas, coalesce(v_formula.dias_curado, 0), p_caduca_en,
          round(v_costo, 2), round(round(v_costo, 2) / v_piezas, 4), nullif(btrim(p_notas), ''), auth.uid())
  returning * into v_lote;

  insert into public.movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, lote_id, nota, creado_por)
  select pr.id, 'insumo_produccion', -(e.value::text::numeric), pr.costo_unitario, v_lote.id,
         'Lote ' || v_lote.codigo, auth.uid()
    from jsonb_each(v_items) as e(key, value)
    join public.productos pr on pr.id = e.key::uuid;

  if v_lote.dias_curado = 0 then
    perform public.liberar_lote_interna(v_lote.id, null);
    select * into v_lote from public.lotes_produccion l where l.id = v_lote.id;
  end if;

  return jsonb_build_object(
    'id', v_lote.id,
    'codigo', v_lote.codigo,
    'costo_materiales', v_lote.costo_materiales,
    'costo_unitario', v_lote.costo_unitario,
    'listo_desde', v_lote.listo_desde,
    'estado', v_lote.estado);
end;
$$;

-- Liberar un lote en curado (personal): sus piezas entran al inventario con el costo real por pieza.
-- Antes de terminar el curado sólo con p_forzar (p. ej. un lote de velas que ya está bien).
create or replace function public.liberar_lote(
  p_lote_id uuid,
  p_piezas_obtenidas numeric default null,
  p_forzar boolean default false
)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_lote public.lotes_produccion;
begin
  if not public.es_personal() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  select * into v_lote from public.lotes_produccion l where l.id = p_lote_id for update;
  if not found then
    raise exception using message = 'No encontramos ese lote.', errcode = 'P0001';
  end if;
  if v_lote.estado = 'disponible' then
    raise exception using message = 'Este lote ya se liberó.', errcode = 'P0001';
  end if;
  if v_lote.estado = 'descartado' then
    raise exception using message = 'Este lote se descartó.', errcode = 'P0001';
  end if;
  if public.hoy_local() < v_lote.listo_desde and not coalesce(p_forzar, false) then
    raise exception using
      message = format('Este lote sigue en curado hasta el %s.', public.fecha_legible(v_lote.listo_desde)),
      errcode = 'P0001';
  end if;
  perform public.liberar_lote_interna(p_lote_id, p_piezas_obtenidas);
end;
$$;

-- Descartar un lote en curado (personal): no entra al inventario y su costo cuenta como merma del mes.
create or replace function public.descartar_lote(p_lote_id uuid, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_lote public.lotes_produccion;
begin
  if not public.es_personal() then
    raise exception using message = 'No tienes permiso para hacer esto.', errcode = 'P0001';
  end if;
  select * into v_lote from public.lotes_produccion l where l.id = p_lote_id for update;
  if not found then
    raise exception using message = 'No encontramos ese lote.', errcode = 'P0001';
  end if;
  if v_lote.estado = 'disponible' then
    raise exception using message = 'Este lote ya se liberó.', errcode = 'P0001';
  end if;
  if v_lote.estado = 'descartado' then
    raise exception using message = 'Este lote se descartó.', errcode = 'P0001';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception using message = 'Escribe por qué se descarta el lote.', errcode = 'P0001';
  end if;
  if length(btrim(p_motivo)) > 1000 then
    raise exception using message = 'Las notas son muy largas; escríbelas en máximo 1000 caracteres.', errcode = 'P0001';
  end if;
  update public.lotes_produccion
     set estado = 'descartado', descartado_en = now(), motivo_descarte = btrim(p_motivo)
   where id = p_lote_id;
end;
$$;
