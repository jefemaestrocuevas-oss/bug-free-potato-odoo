-- Pruebas · reservar_cita (R1, R4), cancelar_cita (R5), consentimiento (R6), completar (R7)
begin;

-- ---------------------------------------------------------------------------
-- Requisitos antes de reservar
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid := pruebas.crear_usuario('ana.prueba@ejemplo.mx',
                '{"nombre": "Ana", "apellidos": "Prueba Reserva", "fecha_nacimiento": "1990-03-01"}');
  v_martes date := pruebas.proximo_dia(2, 21);
  v_sql text;
  v_firma text := pruebas.firma();
begin
  v_sql := format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
                  pruebas.items('cejas'), pruebas.instante(v_martes, '10:00'), 'Ana Prueba Reserva', v_firma);

  perform pruebas.como_anon();
  perform pruebas.espera_error(v_sql, 'Inicia sesión para continuar.');

  perform pruebas.como(v_a);
  perform pruebas.espera_error(v_sql,
    'Antes de reservar necesitas aceptar los términos, el aviso de privacidad y la política de cancelación.');
  perform public.aceptar_politicas(array(select id from public.politicas where activa and tipo = 'terminos'));
  perform pruebas.espera_error(v_sql,
    'Antes de reservar necesitas aceptar los términos, el aviso de privacidad y la política de cancelación.');
  perform public.aceptar_politicas(array(select id from public.politicas where activa and tipo in ('privacidad', 'cancelacion')),
                                   'Navegador de prueba');
  perform public.aceptar_politicas(array(select id from public.politicas where activa and tipo = 'terminos'));  -- repetir no falla
  perform pruebas.igual((select count(*)::int from public.aceptaciones_politica), 3, 'tres aceptaciones, sin duplicados');

  perform pruebas.espera_error(v_sql, 'Antes de reservar necesitas llenar tu ficha de salud.');
  perform pruebas.espera_error('select public.guardar_ficha_salud(''{}'', ''{}'', null, null, null, false)',
    'Para guardar tu ficha de salud necesitamos tu consentimiento expreso para tratar datos de salud.');
  perform pruebas.espera_error('select public.guardar_ficha_salud(''{}'', ''{}'', null, null, null, null)',
    'Para guardar tu ficha de salud necesitamos tu consentimiento expreso para tratar datos de salud.');
  perform public.guardar_ficha_salud('{"diabetes": false}', '{}', 'Ninguna', null, null, true);

  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      pruebas.items('cejas'), pruebas.instante(v_martes, '10:00'), '   ', v_firma),
    'Falta tu firma o tu nombre completo.');
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      pruebas.items('cejas'), pruebas.instante(v_martes, '10:00'), 'Ana Prueba Reserva', ''),
    'Falta tu firma o tu nombre completo.');
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      '[]', pruebas.instante(v_martes, '10:00'), 'Ana Prueba Reserva', v_firma),
    'Elige al menos un servicio.');
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      pruebas.items('ampolleta-retardadora', 'shot-hidratante'), pruebas.instante(v_martes, '10:00'), 'Ana Prueba Reserva', v_firma),
    'Los complementos se agregan a un servicio; elige al menos un servicio.');
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      pruebas.items('cejas'), pruebas.instante(v_martes, '10:30'), 'Ana Prueba Reserva', v_firma),
    'Ese horario no está disponible.');
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      pruebas.items('cejas'), pruebas.instante(pruebas.proximo_dia(1, 21), '10:00'), 'Ana Prueba Reserva', v_firma),
    'Ese horario no está disponible.');
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      pruebas.items('cejas'), pruebas.instante(v_martes, '19:00'), 'Ana Prueba Reserva', v_firma),
    'Ese horario no está disponible.');

  perform pruebas.como_postgres();
  update public.servicios set reservable_en_linea = false where slug = 'cadera';
  update public.servicios set etapa = 'segunda_etapa' where slug = 'muslos';
  update public.servicios set activo = false where slug = 'patillas';
  perform pruebas.como(v_a);
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      pruebas.items('cejas', 'cadera'), pruebas.instante(v_martes, '10:00'), 'Ana Prueba Reserva', v_firma),
    'Uno de los servicios elegidos no se puede reservar en línea.');
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      pruebas.items('muslos'), pruebas.instante(v_martes, '10:00'), 'Ana Prueba Reserva', v_firma),
    'Uno de los servicios elegidos no se puede reservar en línea.');
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('patillas'))),
      pruebas.instante(v_martes, '10:00'), 'Ana Prueba Reserva', v_firma),
    'Uno de los servicios elegidos no se puede reservar en línea.');
  perform pruebas.como_postgres();
  update public.servicios set reservable_en_linea = true where slug = 'cadera';
  update public.servicios set etapa = 'disponible' where slug = 'muslos';
  update public.servicios set activo = true where slug = 'patillas';
  raise notice 'OK - reservar exige sesión, políticas, ficha, firma y servicios reservables';
end $$;

-- ---------------------------------------------------------------------------
-- Reserva exitosa: confirmada, consentimientos por tipo, total en el servidor
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid := pruebas.usuario('ana.prueba@ejemplo.mx');
  v_martes date := pruebas.proximo_dia(2, 21);
  r jsonb;
  v_cita uuid;
  v record;
begin
  perform pruebas.como(v_a);
  r := public.reservar_cita(pruebas.items('cejas', 'ampolleta-retardadora'), pruebas.instante(v_martes, '10:00'),
                            'Ana Prueba Reserva', pruebas.firma(), null, 'Tengo la piel sensible', null, 'Navegador de prueba');
  perform pruebas.igual(r ->> 'estado', 'confirmada', 'sin alertas la cita nace confirmada');
  perform pruebas.igual((r ->> 'requiere_revision')::boolean, false, 'no requiere revisión');
  perform pruebas.igual(r -> 'alertas', '[]'::jsonb, 'sin alertas');
  v_cita := (r ->> 'id')::uuid;

  select * into v from public.v_citas_detalle where id = v_cita;
  perform pruebas.afirma(v.id is not null, 'la clienta ve su cita en v_citas_detalle');
  perform pruebas.igual(v.duracion_min, 60, 'dura 1 hora');
  perform pruebas.igual(v.total, 305.00::numeric(10,2), 'total calculado en el servidor (120 + 185)');
  perform pruebas.igual(v.consentimientos_firmados, 1, 'un consentimiento: depilación (cejas + ampolleta)');
  perform pruebas.igual(v.personal_nombre, 'Especialista de Ópalo', 'quién la atiende');
  perform pruebas.igual(v.cabina_nombre, 'Cabina 1', 'cabina asignada');
  perform pruebas.igual(jsonb_array_length(v.items), 2, 'dos ítems');
  perform pruebas.igual(v.primera_vez, true, 'primera vez');
  perform pruebas.igual(v.origen::text, 'web', 'origen web');
  perform pruebas.igual(v.notas_cliente, 'Tengo la piel sensible', 'notas de la clienta');
  perform pruebas.igual(v.pagado, 0::numeric, 'sin pagos');

  select co.*, p.tipo::text as tipo into v
    from public.consentimientos co join public.politicas p on p.id = co.politica_id
   where co.cita_id = v_cita;
  perform pruebas.igual(v.tipo, 'consentimiento_depilacion', 'consentimiento de depilación');
  perform pruebas.igual(v.es_menor, false, 'adulta');
  perform pruebas.igual(v.tutor_nombre, null::text, 'sin tutor');
  perform pruebas.igual(v.nombre_firmante, 'Ana Prueba Reserva', 'nombre del firmante');
  perform pruebas.igual(length(v.documento_hash), 64, 'documento_hash sha256');
  perform pruebas.igual(v.user_agent, 'Navegador de prueba', 'user agent');
  perform pruebas.afirma(v.ficha_salud_id is not null, 'ligado a la ficha vigente');

  r := public.reservar_cita(pruebas.items('cejas', 'facial-hidratante'), pruebas.instante(v_martes, '11:00'),
                            'Ana Prueba Reserva', pruebas.firma());
  perform pruebas.igual((select array_agg(p.tipo::text order by p.tipo::text)
                           from public.consentimientos co join public.politicas p on p.id = co.politica_id
                          where co.cita_id = (r ->> 'id')::uuid),
                        array['consentimiento_depilacion', 'consentimiento_facial'], 'un consentimiento por tipo distinto');
  perform pruebas.igual((select total from public.citas where id = (r ->> 'id')::uuid), 870.00::numeric(10,2), 'total 120 + 750');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), 7, 'los dos horarios se ocuparon');

  -- Paquete con precio y servicio por confirmar (precio null se reserva y no suma)
  r := public.reservar_cita(jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('labio-superior'))),
                            pruebas.instante(v_martes, '17:00'), 'Ana Prueba Reserva', pruebas.firma());
  perform pruebas.igual((select total from public.citas where id = (r ->> 'id')::uuid), 0.00::numeric(10,2),
                        'servicio por confirmar: se reserva con total 0');
  perform pruebas.igual((select precio from public.cita_items where cita_id = (r ->> 'id')::uuid), null::numeric(10,2),
                        'el ítem guarda precio null (por confirmar)');
  perform pruebas.como_postgres();

  perform pruebas.igual((select creada_por from public.citas where id = v_cita), v_a, 'creada_por es la clienta');
  perform pruebas.afirma((select bool_and(co.documento_hash = encode(sha256(convert_to(
                              p.hash_sha256 || coalesce(co.ficha_salud_id::text, '')
                              || to_char(co.firmado_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'UTF8')), 'hex'))
                            from public.consentimientos co join public.politicas p on p.id = co.politica_id
                           where co.cliente_id = pruebas.cliente_de(v_a)),
                         'documento_hash = sha256(hash política || ficha || firmado_en)');
  raise notice 'OK - reserva exitosa: confirmada, total del servidor, un consentimiento por tipo';
end $$;

-- ---------------------------------------------------------------------------
-- Choque de horarios
-- ---------------------------------------------------------------------------
do $$
declare
  v_b uuid := pruebas.clienta_lista('beto.prueba@ejemplo.mx');
  v_martes date := pruebas.proximo_dia(2, 21);
  v_apoyo uuid;
begin
  perform pruebas.como(v_b);
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      pruebas.items('axilas'), pruebas.instante(v_martes, '10:00'), 'Beto Prueba', pruebas.firma()),
    'Ese horario se acaba de ocupar, elige otro.');
  perform pruebas.como_postgres();

  -- La base misma impide empalmes (exclusion constraint), aunque se inserte directo.
  begin
    insert into public.citas (cliente_id, personal_id, cabina_id, inicio, fin)
    values (pruebas.cliente_de(v_b), (select id from public.personal where slug = 'especialista'),
            (select id from public.cabinas limit 1),
            pruebas.instante(v_martes, '10:30'), pruebas.instante(v_martes, '11:30'));
    raise exception 'FALLA: se permitió empalmar dos citas de la misma persona';
  exception when exclusion_violation then
    null;
  end;
  insert into public.personal (slug, nombre) values ('apoyo-choque', 'Apoyo (prueba)') returning id into v_apoyo;
  begin
    insert into public.citas (cliente_id, personal_id, cabina_id, inicio, fin)
    values (pruebas.cliente_de(v_b), v_apoyo, (select id from public.cabinas limit 1),
            pruebas.instante(v_martes, '10:00'), pruebas.instante(v_martes, '11:00'));
    raise exception 'FALLA: se permitió empalmar dos citas en la misma cabina';
  exception when exclusion_violation then
    null;
  end;
  -- Citas pegadas (10–11 y 11–12) sí se permiten; canceladas no estorban.
  insert into public.citas (cliente_id, personal_id, cabina_id, inicio, fin, estado)
  values (pruebas.cliente_de(v_b), (select id from public.personal where slug = 'especialista'),
          (select id from public.cabinas limit 1),
          pruebas.instante(v_martes, '10:15'), pruebas.instante(v_martes, '10:45'), 'cancelada');
  raise notice 'OK - choque: mensaje de horario ocupado y exclusion constraints por persona y cabina';
end $$;

-- ---------------------------------------------------------------------------
-- Alertas de la ficha de salud → cita pendiente de revisión
-- ---------------------------------------------------------------------------
do $$
declare
  v_c uuid := pruebas.clienta_lista('carla.prueba@ejemplo.mx', '1990-01-01',
                                    '{"embarazo_lactancia": true, "alergias_productos": true}');
  v_d uuid := pruebas.clienta_lista('dora.prueba@ejemplo.mx', '1990-01-01',
                                    '{"alergias_productos": true, "peeling_botox_reciente": true, "diabetes": false}');
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_miercoles date := pruebas.proximo_dia(3, 21);
  r jsonb;
begin
  perform pruebas.como(v_c);
  r := public.reservar_cita(pruebas.items('cejas'), pruebas.instante(v_miercoles, '10:00'), 'Carla Prueba', pruebas.firma());
  perform pruebas.igual(r ->> 'estado', 'pendiente', 'embarazo/lactancia → pendiente');
  perform pruebas.igual((r ->> 'requiere_revision')::boolean, true, 'requiere revisión');
  perform pruebas.igual(r -> 'alertas', '["¿Estás embarazada o en periodo de lactancia?"]'::jsonb,
                        'alertas sólo con preguntas de revisar/no_se_realiza (la de precaución no)');

  perform pruebas.como(v_d);
  r := public.reservar_cita(pruebas.items('cejas'), pruebas.instante(v_miercoles, '11:00'), 'Dora Prueba', pruebas.firma());
  perform pruebas.igual(r ->> 'estado', 'confirmada',
                        'precaución y contraindicaciones de otras categorías no detienen una depilación');
  r := public.reservar_cita(pruebas.items('facial-hidratante'), pruebas.instante(v_miercoles, '12:00'), 'Dora Prueba', pruebas.firma());
  perform pruebas.igual(r ->> 'estado', 'pendiente', 'peeling reciente sí aplica a un facial');
  perform pruebas.igual(jsonb_array_length(r -> 'alertas'), 1, 'una alerta');

  -- Una contraindicación con acción no_se_realiza también deja la cita pendiente.
  perform pruebas.como_postgres();
  update public.contraindicaciones set accion = 'no_se_realiza' where clave = 'diabetes';
  perform pruebas.como(v_d);
  perform public.guardar_ficha_salud('{"diabetes": true}', '{"diabetes": "Tipo 2"}', null, 'Metformina', null, true);
  r := public.reservar_cita(pruebas.items('axilas'), pruebas.instante(v_miercoles, '13:00'), 'Dora Prueba', pruebas.firma());
  perform pruebas.igual(r ->> 'estado', 'pendiente', 'la ficha vigente es la última; no_se_realiza → pendiente');

  -- El personal revisa y confirma.
  perform pruebas.como(v_esp);
  perform public.cambiar_estado_cita((r ->> 'id')::uuid, 'confirmada');
  perform pruebas.igual((select estado::text || '/' || requiere_revision::text from public.citas where id = (r ->> 'id')::uuid),
                        'confirmada/false', 'al confirmar deja de requerir revisión');
  perform pruebas.como_postgres();
  raise notice 'OK - alertas de la ficha: pendiente y requiere_revision';
end $$;

-- ---------------------------------------------------------------------------
-- Edad mínima y menores con tutor
-- ---------------------------------------------------------------------------
do $$
declare
  v_menor uuid := pruebas.clienta_lista('mena.prueba@ejemplo.mx', (public.hoy_local() - interval '16 years')::date);
  v_nina uuid := pruebas.clienta_lista('nina.prueba@ejemplo.mx', (public.hoy_local() - interval '14 years')::date);
  v_jueves date := pruebas.proximo_dia(4, 21);
  r jsonb;
begin
  perform pruebas.como(v_menor);
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      pruebas.items('cejas'), pruebas.instante(v_jueves, '10:00'), 'Mena Prueba', pruebas.firma()),
    'Por ser menor de edad, escribe el nombre de mamá, papá o tutor que te acompañará.');
  r := public.reservar_cita(pruebas.items('cejas'), pruebas.instante(v_jueves, '10:00'), 'Mena Prueba', pruebas.firma(),
                            null, null, 'Laura Tutora');
  perform pruebas.igual((select es_menor::text || '/' || tutor_nombre from public.consentimientos where cita_id = (r ->> 'id')::uuid),
                        'true/Laura Tutora', 'el consentimiento registra menor y tutor');

  perform pruebas.como(v_nina);
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L, null, null, %L)',
      pruebas.items('cejas'), pruebas.instante(v_jueves, '11:00'), 'Nina Prueba', pruebas.firma(), 'Papá'),
    'Atendemos a partir de los 15 años.');

  perform pruebas.como_postgres();
  update public.configuracion set edad_minima = 17;
  perform pruebas.como(v_menor);
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L, null, null, %L)',
      pruebas.items('axilas'), pruebas.instante(v_jueves, '12:00'), 'Mena Prueba', pruebas.firma(), 'Laura'),
    'Atendemos a partir de los 17 años.');
  perform pruebas.como_postgres();
  update public.configuracion set edad_minima = 15;
  raise notice 'OK - edad mínima (15) y tutor para menores';
end $$;

-- ---------------------------------------------------------------------------
-- Cancelar (R5)
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid := pruebas.usuario('ana.prueba@ejemplo.mx');
  v_b uuid := pruebas.usuario('beto.prueba@ejemplo.mx');
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_martes date := pruebas.proximo_dia(2, 21);
  v_cita uuid;
  v_pronto uuid;
begin
  select id into v_cita from public.citas
   where cliente_id = pruebas.cliente_de(v_a) and inicio = pruebas.instante(v_martes, '10:00');

  perform pruebas.como(v_b);
  perform pruebas.espera_error(format('select public.cancelar_cita(%L)', v_cita), 'No tienes permiso para hacer esto.');
  perform pruebas.como_anon();
  perform pruebas.espera_error(format('select public.cancelar_cita(%L)', v_cita), 'Inicia sesión para continuar.');

  perform pruebas.como(v_a);
  perform public.cancelar_cita(v_cita, 'Me surgió un viaje');
  perform pruebas.igual((select estado::text from public.citas where id = v_cita), 'cancelada', 'la clienta cancela con anticipación');
  perform pruebas.afirma((select cancelada_en is not null and motivo_cancelacion = 'Me surgió un viaje' from public.citas where id = v_cita),
                         'guarda fecha y motivo');
  perform pruebas.espera_error(format('select public.cancelar_cita(%L)', v_cita), 'Esta cita ya no se puede cancelar.');
  perform pruebas.afirma(exists (select 1 from public.horarios_disponibles(v_martes) h
                                  where h.inicio = pruebas.instante(v_martes, '10:00')), 'el horario se libera');
  perform pruebas.como_postgres();

  -- Una cita dentro de las próximas 24 horas
  insert into public.citas (cliente_id, personal_id, cabina_id, inicio, fin)
  values (pruebas.cliente_de(v_a), (select id from public.personal where slug = 'especialista'),
          (select id from public.cabinas limit 1),
          date_trunc('hour', now()) + interval '5 hours', date_trunc('hour', now()) + interval '6 hours')
  returning id into v_pronto;
  perform pruebas.como(v_a);
  perform pruebas.espera_error(format('select public.cancelar_cita(%L)', v_pronto),
    'Faltan menos de 24 horas para tu cita. Escríbenos por WhatsApp al 442 170 1466.');
  perform pruebas.como(v_esp);
  perform public.cancelar_cita(v_pronto, 'Avisó por WhatsApp');
  perform pruebas.igual((select estado::text from public.citas where id = v_pronto), 'cancelada', 'el personal puede cancelar siempre');
  perform pruebas.como_postgres();
  raise notice 'OK - cancelar: dueña con 24 h, personal siempre';
end $$;

-- ---------------------------------------------------------------------------
-- Créditos (servicios prepagados) al reservar y al cancelar
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid := pruebas.usuario('ana.prueba@ejemplo.mx');
  v_b uuid := pruebas.usuario('beto.prueba@ejemplo.mx');
  v_viernes date := pruebas.proximo_dia(5, 21);
  v_cred uuid; v_vencido uuid; v_ajeno uuid; v_regalo uuid; v_paq uuid;
  r jsonb;
  v_sql text;
begin
  insert into public.creditos (cliente_id, servicio_id, cantidad, vence_en)
  values (pruebas.cliente_de(v_a), pruebas.servicio('cejas'), 1, public.hoy_local() + 30) returning id into v_cred;
  insert into public.creditos (cliente_id, servicio_id, cantidad, vence_en)
  values (pruebas.cliente_de(v_a), pruebas.servicio('cejas'), 1, public.hoy_local() - 1) returning id into v_vencido;
  insert into public.creditos (cliente_id, servicio_id, cantidad)
  values (pruebas.cliente_de(v_b), pruebas.servicio('cejas'), 1) returning id into v_ajeno;
  insert into public.creditos (cliente_id, servicio_id, cantidad, codigo_regalo, regalo_para)
  values (pruebas.cliente_de(v_a), pruebas.servicio('cejas'), 1, 'PRUEBA22', 'Alguien') returning id into v_regalo;
  insert into public.creditos (cliente_id, paquete_id, cantidad)
  values (pruebas.cliente_de(v_a), pruebas.paquete('express'), 1) returning id into v_paq;

  perform pruebas.como(v_a);
  foreach v_sql in array array[v_vencido, v_ajeno, v_regalo]::text[] loop
    perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
        jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('cejas'), 'credito_id', v_sql)),
        pruebas.instante(v_viernes, '10:00'), 'Ana Prueba Reserva', pruebas.firma()),
      'Ese crédito no es válido o ya se usó.');
  end loop;
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('axilas'), 'credito_id', v_cred)),
      pruebas.instante(v_viernes, '10:00'), 'Ana Prueba Reserva', pruebas.firma()),
    'Ese crédito no es válido o ya se usó.');

  r := public.reservar_cita(jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('cejas'), 'credito_id', v_cred)),
                            pruebas.instante(v_viernes, '10:00'), 'Ana Prueba Reserva', pruebas.firma());
  perform pruebas.igual((select usados from public.creditos where id = v_cred), 1, 'el crédito se usa');
  perform pruebas.igual((select total from public.citas where id = (r ->> 'id')::uuid), 0.00::numeric(10,2), 'con crédito el total es 0');
  perform pruebas.igual((select precio::text || '/' || credito_id::text from public.cita_items where cita_id = (r ->> 'id')::uuid),
                        '0.00/' || v_cred::text, 'el ítem queda en 0 y ligado al crédito');
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('cejas'), 'credito_id', v_cred)),
      pruebas.instante(v_viernes, '11:00'), 'Ana Prueba Reserva', pruebas.firma()),
    'Ese crédito no es válido o ya se usó.');

  perform public.cancelar_cita((r ->> 'id')::uuid);
  perform pruebas.igual((select usados from public.creditos where id = v_cred), 0, 'al cancelar se devuelve el crédito');

  r := public.reservar_cita(jsonb_build_array(jsonb_build_object('paquete_id', pruebas.paquete('express'), 'credito_id', v_paq)),
                            pruebas.instante(v_viernes, '12:00'), 'Ana Prueba Reserva', pruebas.firma());
  perform pruebas.igual((select usados from public.creditos where id = v_paq), 1, 'crédito de paquete');
  perform pruebas.igual((select count(*)::int from public.consentimientos where cita_id = (r ->> 'id')::uuid), 1,
                        'el paquete express pide el consentimiento de depilación');
  perform pruebas.como_postgres();
  raise notice 'OK - créditos: válidos, de la dueña, vigentes, con saldo; se devuelven al cancelar';
end $$;

-- ---------------------------------------------------------------------------
-- Citas del personal, firma posterior (R6) y completar (R7)
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid := pruebas.usuario('ana.prueba@ejemplo.mx');
  v_b uuid := pruebas.usuario('beto.prueba@ejemplo.mx');
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_mariana uuid := (select id from public.clientes where apellidos = 'Mostrador (ejemplo)');
  v_martes date := pruebas.proximo_dia(2, 28);
  v_cera uuid := '00000000-0000-4000-c000-000000000001';
  v_stock numeric;
  v_movs int;
  r jsonb;
  r2 jsonb;
  v_sql text;
begin
  v_sql := format('select public.reservar_cita_staff(%L, %L::jsonb, %L::timestamptz)',
                  v_mariana, pruebas.items('axilas'), pruebas.instante(v_martes, '10:00'));
  perform pruebas.como(v_a);
  perform pruebas.espera_error(v_sql, 'No tienes permiso para hacer esto.');
  perform pruebas.como_anon();
  perform pruebas.espera_rechazo(v_sql);

  perform pruebas.como(v_esp);
  r := public.reservar_cita_staff(v_mariana, pruebas.items('axilas'), pruebas.instante(v_martes, '10:00'), null, 'whatsapp',
                                  'Pidió por WhatsApp');
  perform pruebas.igual(r ->> 'estado', 'confirmada', 'cita del personal confirmada');
  perform pruebas.igual((select origen::text || '/' || consentimientos_firmados from public.v_citas_detalle where id = (r ->> 'id')::uuid),
                        'whatsapp/0', 'nace sin firma');
  perform pruebas.espera_error(format('select public.cambiar_estado_cita(%L, %L)', r ->> 'id', 'en_curso'),
    'Sin consentimiento firmado no hay servicio: pide a la clienta que firme primero.');
  perform pruebas.espera_error(format('select public.completar_cita(%L)', r ->> 'id'),
    'Sin consentimiento firmado no hay servicio: pide a la clienta que firme primero.');
  perform pruebas.espera_error(format('select public.cambiar_estado_cita(%L, %L)', r ->> 'id', 'completada'),
    'Sin consentimiento firmado no hay servicio: pide a la clienta que firme primero.');

  -- El personal puede agendar fuera de la rejilla (p. ej. un lunes) pero no empalmar.
  r2 := public.reservar_cita_staff(v_mariana, pruebas.items('cejas'), pruebas.instante(pruebas.proximo_dia(1, 28), '12:00'),
                                   null, 'mostrador');
  perform pruebas.igual(r2 ->> 'estado', 'confirmada', 'el personal agenda en día no laborable');
  perform pruebas.espera_error(format('select public.reservar_cita_staff(%L, %L::jsonb, %L::timestamptz, %L)',
      v_mariana, pruebas.items('cejas'), pruebas.instante(v_martes, '10:30'), (select id from public.personal where slug = 'especialista')),
    'Ese horario se acaba de ocupar, elige otro.');
  perform pruebas.espera_error(format('select public.reservar_cita_staff(%L, %L::jsonb, %L::timestamptz)',
      v_mariana, pruebas.items('cejas'), pruebas.instante(v_martes, '10:30')),
    'Ese horario se acaba de ocupar, elige otro.');

  -- Firma en la tablet de la cabina (la registra el personal)
  perform public.firmar_consentimiento_cita((r ->> 'id')::uuid, 'Mariana Mostrador', pruebas.firma());
  perform public.firmar_consentimiento_cita((r ->> 'id')::uuid, 'Mariana Mostrador', pruebas.firma());
  perform pruebas.igual((select count(*)::int from public.consentimientos where cita_id = (r ->> 'id')::uuid), 1,
                        'firmar dos veces no duplica');
  perform public.cambiar_estado_cita((r ->> 'id')::uuid, 'en_curso');
  perform pruebas.igual((select estado::text from public.citas where id = (r ->> 'id')::uuid), 'en_curso', 'con firma, en curso');

  -- Completar: consumo de insumos según receta (axilas: cera 25 g, talco 5 g, aceite 5 ml, guantes 2)
  perform pruebas.como_postgres();
  select stock_actual into v_stock from public.productos where id = v_cera;
  select count(*) into v_movs from public.movimientos_inventario;
  perform pruebas.como(v_esp);
  perform public.completar_cita((r ->> 'id')::uuid);
  perform pruebas.igual((select estado::text from public.citas where id = (r ->> 'id')::uuid), 'completada', 'completada');
  perform pruebas.igual((select count(*)::int from public.movimientos_inventario where cita_id = (r ->> 'id')::uuid and tipo = 'consumo'), 4,
                        'un movimiento de consumo por producto de la receta');
  perform pruebas.igual((select stock_actual from public.productos where id = v_cera), v_stock - 25, 'se descuentan 25 g de cera');
  perform pruebas.igual((select costo_unitario from public.movimientos_inventario where cita_id = (r ->> 'id')::uuid and producto_id = v_cera),
                        0.6000::numeric(12,4), 'el consumo copia el costo unitario vigente');
  perform public.completar_cita((r ->> 'id')::uuid);
  perform public.cambiar_estado_cita((r ->> 'id')::uuid, 'completada');
  perform pruebas.igual((select count(*)::int from public.movimientos_inventario), v_movs + 4, 'completar es idempotente');
  perform pruebas.igual((select stock_actual from public.productos where id = v_cera), v_stock - 25, 'no descuenta dos veces');
  perform pruebas.espera_error(format('select public.cambiar_estado_cita(%L, %L)', r ->> 'id', 'cancelada'),
    'Esta cita ya se completó.');

  -- Paquete: se expanden sus servicios (rostro = cara con ceja [sin receta] + axilas)
  r2 := public.reservar_cita_staff(v_mariana, jsonb_build_array(jsonb_build_object('paquete_id', pruebas.paquete('rostro'))),
                                   pruebas.instante(v_martes, '14:00'), null, 'telefono');
  perform public.firmar_consentimiento_cita((r2 ->> 'id')::uuid, 'Mariana Mostrador', pruebas.firma());
  perform public.completar_cita((r2 ->> 'id')::uuid);
  perform pruebas.igual((select stock_actual from public.productos where id = v_cera), v_stock - 50, 'el paquete descuenta lo de axilas');

  -- No asistió: libera el horario
  r2 := public.reservar_cita_staff(v_mariana, pruebas.items('cejas'), pruebas.instante(v_martes, '16:00'));
  perform public.cambiar_estado_cita((r2 ->> 'id')::uuid, 'no_asistio');
  perform pruebas.afirma(exists (select 1 from public.horarios_disponibles(v_martes) h where h.inicio = pruebas.instante(v_martes, '16:00')),
                         'no asistió libera el horario');

  -- La clienta firma desde su portal una cita que agendó el personal
  r2 := public.reservar_cita_staff(pruebas.cliente_de(v_a), pruebas.items('cejas'), pruebas.instante(v_martes, '12:00'), null, 'telefono');
  perform pruebas.como(v_b);
  perform pruebas.espera_error(format('select public.firmar_consentimiento_cita(%L, %L, %L)', r2 ->> 'id', 'Beto', pruebas.firma()),
    'No tienes permiso para hacer esto.');
  perform pruebas.como(v_a);
  perform pruebas.espera_error(format('select public.firmar_consentimiento_cita(%L, %L, %L)', r2 ->> 'id', ' ', pruebas.firma()),
    'Falta tu firma o tu nombre completo.');
  perform public.firmar_consentimiento_cita((r2 ->> 'id')::uuid, 'Ana Prueba Reserva', pruebas.firma(), null, 'Celular');
  perform pruebas.igual((select consentimientos_firmados from public.v_citas_detalle where id = (r2 ->> 'id')::uuid), 1,
                        'la clienta firmó desde su portal');
  perform pruebas.espera_error(format('select public.completar_cita(%L)', r2 ->> 'id'), 'No tienes permiso para hacer esto.');
  perform pruebas.espera_error(format('select public.cambiar_estado_cita(%L, %L)', r2 ->> 'id', 'en_curso'),
    'No tienes permiso para hacer esto.');
  perform pruebas.como_postgres();
  raise notice 'OK - sin consentimiento no hay servicio; completar descuenta insumos una sola vez';
end $$;

-- ---------------------------------------------------------------------------
-- Una política nueva obliga a aceptar otra vez (R13)
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid := pruebas.usuario('ana.prueba@ejemplo.mx');
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
  v_jueves date := pruebas.proximo_dia(4, 28);
  v_sql text;
begin
  perform pruebas.como(v_admin);
  perform public.publicar_politica('cancelacion', 'Política de cancelación (v2)', 'Nuevo texto de prueba.');
  v_sql := format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
                  pruebas.items('axilas'), pruebas.instante(v_jueves, '10:00'), 'Ana Prueba Reserva', pruebas.firma());
  perform pruebas.como(v_a);
  perform pruebas.espera_error(v_sql,
    'Antes de reservar necesitas aceptar los términos, el aviso de privacidad y la política de cancelación.');
  perform public.aceptar_politicas(array(select id from public.politicas where activa and tipo = 'cancelacion'));
  execute v_sql;
  perform pruebas.como_postgres();
  raise notice 'OK - una versión nueva de una política se vuelve a aceptar';
end $$;

rollback;
