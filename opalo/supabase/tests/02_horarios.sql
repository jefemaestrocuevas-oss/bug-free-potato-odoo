-- Pruebas · horarios_disponibles (R3), en hora local America/Mexico_City
begin;

-- Martes libre dentro de la ventana: 9 inicios de 10:00 a 18:00
do $$
declare
  v_martes date := pruebas.proximo_dia(2, 21);
  v_horas text[];
begin
  select array_agg(to_char(h.inicio at time zone 'America/Mexico_City', 'HH24:MI') order by h.inicio)
    into v_horas
    from public.horarios_disponibles(v_martes) h;
  perform pruebas.igual(cardinality(v_horas), 9, 'martes: 9 inicios');
  perform pruebas.igual(v_horas,
    array['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'], 'martes: de 10:00 a 18:00');
  perform pruebas.afirma((select bool_and(h.fin - h.inicio = interval '1 hour'
                                          and h.personal_nombre = 'Especialista de Ópalo')
                            from public.horarios_disponibles(v_martes) h), 'bloques de 1 h con la especialista');
  perform pruebas.igual((select to_char(min(h.inicio) at time zone 'UTC', 'HH24:MI') from public.horarios_disponibles(v_martes) h),
                        '16:00', '10:00 en Querétaro son las 16:00 UTC (UTC−6)');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(pruebas.proximo_dia(1, 21))), 0, 'lunes: cerrado');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(pruebas.proximo_dia(0, 21))), 0, 'domingo: cerrado');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(pruebas.proximo_dia(6, 21))), 6, 'sábado: 9:00 a 14:00');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes, 120)), 8, 'con 2 h caben 8 inicios');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes, null,
                                 (select id from public.personal where slug = 'especialista'))), 9, 'filtrando por la especialista');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes, null, gen_random_uuid())), 0,
                        'personal inexistente → 0');

  perform pruebas.como_anon();
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), 9, 'el visitante también ve los 9');
  perform pruebas.como_postgres();
  raise notice 'OK - martes 9 inicios 10:00–18:00; lunes y domingo 0; sábado 6';
end $$;

-- Respeta citas activas (y libera las canceladas)
do $$
declare
  v_martes date := pruebas.proximo_dia(2, 21);
  v_cita uuid;
begin
  insert into public.citas (cliente_id, personal_id, cabina_id, inicio, fin)
  values ((select id from public.clientes where apellidos = 'Mostrador (ejemplo)'),
          (select id from public.personal where slug = 'especialista'),
          (select id from public.cabinas limit 1),
          pruebas.instante(v_martes, '12:00'), pruebas.instante(v_martes, '13:00'))
  returning id into v_cita;
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), 8, 'una cita ocupa un inicio');
  perform pruebas.afirma(not exists (select 1 from public.horarios_disponibles(v_martes) h
                                      where h.inicio = pruebas.instante(v_martes, '12:00')), 'las 12:00 ya no aparecen');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes, 120)), 6,
                        'con 2 h la cita de 12 bloquea 11:00 y 12:00');
  update public.citas set estado = 'cancelada' where id = v_cita;
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), 9, 'cancelada libera el horario');
  update public.citas set estado = 'no_asistio' where id = v_cita;
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), 9, 'no_asistio no ocupa');
  raise notice 'OK - respeta citas activas';
end $$;

-- Respeta bloqueos (globales y de la persona)
do $$
declare
  v_martes date := pruebas.proximo_dia(2, 21);
begin
  insert into public.bloqueos_agenda (personal_id, inicio, fin, motivo)
  values (null, pruebas.instante(v_martes, '15:00'), pruebas.instante(v_martes, '17:00'), 'Cerrado (prueba)');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), 7, 'bloqueo global de 15 a 17');
  insert into public.bloqueos_agenda (personal_id, inicio, fin, motivo)
  values ((select id from public.personal where slug = 'especialista'),
          pruebas.instante(v_martes, '10:30'), pruebas.instante(v_martes, '11:15'), 'Pendiente (prueba)');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), 5,
                        'bloqueo parcial de la persona quita 10:00 y 11:00');
  insert into public.bloqueos_agenda (personal_id, inicio, fin)
  values (null, pruebas.instante(v_martes, '00:00'), pruebas.instante(v_martes + 1, '00:00'));
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), 0, 'día festivo: 0');
  delete from public.bloqueos_agenda where inicio >= pruebas.instante(v_martes, '00:00') and fin <= pruebas.instante(v_martes + 1, '00:00');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), 9, 'sin bloqueos vuelve a 9');
  raise notice 'OK - respeta bloqueos';
end $$;

-- Hace falta alguna cabina libre
do $$
declare
  v_martes date := pruebas.proximo_dia(2, 21);
  v_apoyo uuid;
begin
  insert into public.personal (slug, nombre, orden) values ('apoyo-prueba', 'Apoyo (prueba)', 2) returning id into v_apoyo;
  insert into public.horarios (personal_id, dia_semana, hora_inicio, hora_fin) values (v_apoyo, 2, '10:00', '19:00');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), 18, 'dos personas, una cabina libre');
  perform pruebas.igual((select array_agg(h.personal_nombre order by h.personal_nombre)
                           from public.horarios_disponibles(v_martes) h where h.inicio = pruebas.instante(v_martes, '10:00')),
                        array['Apoyo (prueba)', 'Especialista de Ópalo'], 'ordenado por inicio y orden del personal');

  insert into public.citas (cliente_id, personal_id, cabina_id, inicio, fin)
  values ((select id from public.clientes where apellidos = 'Mostrador (ejemplo)'),
          (select id from public.personal where slug = 'especialista'),
          (select id from public.cabinas limit 1),
          pruebas.instante(v_martes, '13:00'), pruebas.instante(v_martes, '14:00'));
  perform pruebas.afirma(not exists (select 1 from public.horarios_disponibles(v_martes) h
                                      where h.inicio = pruebas.instante(v_martes, '13:00')),
                         'sin cabina libre a las 13:00 tampoco hay lugar para apoyo');
  insert into public.cabinas (nombre, orden) values ('Cabina 2 (prueba)', 2);
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes) h
                          where h.inicio = pruebas.instante(v_martes, '13:00')), 1,
                        'con una segunda cabina, apoyo puede a las 13:00');
  update public.personal set activo = false where id = v_apoyo;
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), 8, 'personal inactivo no ofrece horarios');
  raise notice 'OK - exige una cabina activa libre';
end $$;

-- Anticipación mínima y ventana de reserva
do $$
declare
  v_martes_cerca date := pruebas.proximo_dia(2, 21);
  v_martes_lejos date := pruebas.proximo_dia(2, 35);
  v_lejisimos date := pruebas.proximo_dia(2, 62);
begin
  perform pruebas.afirma((select coalesce(bool_and(h.inicio >= now() + interval '2 hours'), true)
                            from public.horarios_disponibles(public.hoy_local()) h),
                         'hoy sólo con 2 h de anticipación');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(public.hoy_local() - 7)), 0, 'el pasado no tiene horarios');

  update public.configuracion set anticipacion_min_horas = 24 * 30;
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes_cerca)), 0,
                        'con 30 días de anticipación, el martes cercano queda fuera');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes_lejos)), 9, 'el martes lejano sí');
  update public.configuracion set anticipacion_min_horas = 2;

  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_lejisimos)), 0, 'fuera de la ventana de 60 días');
  update public.configuracion set ventana_reserva_dias = 90;
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_lejisimos)), 9, 'con ventana de 90 días, sí');
  raise notice 'OK - anticipación mínima y ventana de reserva';
end $$;

-- Rangos del mismo día que se traslapan (p. ej. 10–19 y 12–16): cada inicio sale una sola vez
do $$
declare
  v_martes date := pruebas.proximo_dia(2, 21);
  v_antes int := (select count(*) from public.horarios_disponibles(pruebas.proximo_dia(2, 21)));
begin
  insert into public.horarios (personal_id, dia_semana, hora_inicio, hora_fin)
  values ((select id from public.personal where slug = 'especialista'), 2, '12:00', '16:00');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), v_antes,
                        'un rango encimado no agrega horarios');
  perform pruebas.igual((select count(*)::int from (select h.inicio, h.personal_id
                                                       from public.horarios_disponibles(v_martes) h
                                                      group by 1, 2 having count(*) > 1) x), 0,
                        'ningún inicio repetido para la misma persona');
  raise notice 'OK - rangos encimados no duplican horarios';
end $$;

rollback;
