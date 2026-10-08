-- Pruebas · escrituras atómicas del panel (ESPEC §6 y §6.1): guardar_paquete, guardar_horarios,
-- guardar_receta; y v_clientes_resumen.es_personal (§7)
begin;

-- Los horarios se consultan como visitante en fechas relativas a hoy: sin fecha de apertura.
update public.configuracion set fecha_apertura = null;

-- ---------------------------------------------------------------------------
-- guardar_paquete: crear, editar, reemplazar sus servicios y validar (sin dejar nada a medias)
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
  v_items jsonb := jsonb_build_array(
    jsonb_build_object('servicio_id', pruebas.servicio('cejas'), 'cantidad', 1),
    jsonb_build_object('servicio_id', pruebas.servicio('axilas'), 'cantidad', 2));
  v_id uuid;
  v_bono uuid;
  v record;
begin
  perform pruebas.como(v_admin);

  -- Nuevo (p_id null): el slug se arma con el nombre; lo demás toma su valor por defecto
  v_id := public.guardar_paquete(null, '{"nombre": "Paquete Verano Ñandú", "precio": 450, "descripcion": "  Cejas y axila.  "}',
                                 v_items);
  select * into v from public.paquetes where id = v_id;
  perform pruebas.igual(v.slug, 'paquete-verano-nandu', 'slug a partir del nombre, sin acentos ni ñ');
  perform pruebas.igual(v.tipo::text || '/' || v.activo::text || '/' || v.orden::text, 'combo/true/0', 'valores por defecto');
  perform pruebas.igual(v.precio, 450.00::numeric(10,2), 'precio');
  perform pruebas.igual(v.descripcion, 'Cejas y axila.', 'descripción sin espacios de sobra');
  perform pruebas.igual((select string_agg(s.slug || ':' || ps.cantidad, ', ' order by s.slug)
                           from public.paquete_servicios ps join public.servicios s on s.id = ps.servicio_id
                          where ps.paquete_id = v_id), 'axilas:2, cejas:1', 'servicios del paquete');

  -- Editar: lo que no viene se queda; los servicios se reemplazan completos (repetidos se suman)
  perform pruebas.igual(public.guardar_paquete(v_id, '{"precio": 480, "orden": 7, "activo": false}',
      jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('bikini-brasileno')),
                        jsonb_build_object('servicio_id', pruebas.servicio('cejas'), 'cantidad', 2),
                        jsonb_build_object('servicio_id', pruebas.servicio('cejas'), 'cantidad', '1'))),
    v_id, 'al editar devuelve el mismo id');
  select * into v from public.paquetes where id = v_id;
  perform pruebas.igual(v.nombre || '/' || v.slug || '/' || v.precio::text || '/' || v.orden::text || '/' || v.activo::text,
                        'Paquete Verano Ñandú/paquete-verano-nandu/480.00/7/false', 'edita sólo lo que viene');
  perform pruebas.igual((select string_agg(s.slug || ':' || ps.cantidad, ', ' order by s.slug)
                           from public.paquete_servicios ps join public.servicios s on s.id = ps.servicio_id
                          where ps.paquete_id = v_id), 'bikini-brasileno:1, cejas:3', 'reemplaza los servicios; repetidos se suman');
  perform public.guardar_paquete(v_id, '{"slug": "Verano 2027", "precio": null, "descripcion": "", "activo": true}', v_items);
  select * into v from public.paquetes where id = v_id;
  perform pruebas.igual(v.slug || '/' || coalesce(v.precio::text, 'null') || '/' || coalesce(v.descripcion, 'null'),
                        'verano-2027/null/null', 'slug limpio; precio por confirmar; sin descripción');

  -- Bono: N sesiones de UN servicio
  v_bono := public.guardar_paquete(null,
    '{"slug": "bono-axilas-prueba", "nombre": "Bono 5 axilas", "tipo": "bono", "precio": 500, "vigencia_dias": 180}',
    jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('axilas'), 'cantidad', 5)));
  perform pruebas.igual((select tipo::text || '/' || vigencia_dias::text || '/' || precio::text from public.paquetes where id = v_bono),
                        'bono/180/500.00', 'bono creado');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)',
      '{"nombre": "Bono mixto", "tipo": "bono"}', v_items),
    'Un bono es de un solo servicio: elige sólo uno y cuántas sesiones incluye.');
  perform pruebas.espera_error(format('select public.guardar_paquete(%L, %L::jsonb, %L::jsonb)', v_id, '{"tipo": "bono"}', v_items),
    'Un bono es de un solo servicio: elige sólo uno y cuántas sesiones incluye.');

  -- Validaciones
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)',
      '{"nombre": "Otro", "slug": "express"}', v_items), 'Ya existe otro paquete con ese identificador (slug).');
  perform pruebas.espera_error(format('select public.guardar_paquete(%L, %L::jsonb, %L::jsonb)',
      v_id, '{"slug": "Bono axilas prueba"}', v_items), 'Ya existe otro paquete con ese identificador (slug).');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)', '{"nombre": "   "}', v_items),
    'Escribe el nombre del paquete.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, null, %L::jsonb)', v_items),
    'Escribe el nombre del paquete.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)', '{"nombre": "¡¡!!"}', v_items),
    'El identificador (slug) del paquete debe tener letras o números.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)',
      '{"nombre": "X", "tipo": "promo"}', v_items), 'Elige si el paquete es combo o bono.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)',
      '{"nombre": "X", "precio": -1}', v_items), 'El precio no puede ser negativo.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)',
      '{"nombre": "X", "precio": "trescientos"}', v_items), 'Revisa el precio.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)',
      '{"nombre": "X", "precio": 1000000000}', v_items), 'Revisa el precio.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)',
      '{"nombre": "X", "precio": "NaN"}', v_items), 'Revisa el precio.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)',
      '{"nombre": "X", "duracion_min": -5}', v_items), 'Revisa la duración: minutos enteros, cero o más.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)',
      '{"nombre": "X", "vigencia_dias": 0}', v_items), 'Revisa la vigencia: días enteros, uno o más.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)', '{"nombre": "X"}', '[]'),
    'Agrega al menos un servicio al paquete.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, null)', '{"nombre": "X"}'),
    'Agrega al menos un servicio al paquete.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)', '{"nombre": "X"}',
      jsonb_build_array(jsonb_build_object('servicio_id', gen_random_uuid()))), 'Uno de los servicios del paquete no existe.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)', '{"nombre": "X"}',
      '[{"servicio_id": "cejas"}]'), 'Uno de los servicios del paquete no existe.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)', '{"nombre": "X"}',
      jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('cejas'), 'cantidad', 0))), 'Revisa las cantidades.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)', '{"nombre": "X"}',
      jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('cejas'), 'cantidad', 100))), 'Revisa las cantidades.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)', '{"nombre": "X"}',
      jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('cejas'), 'cantidad', 1.5))), 'Revisa las cantidades.');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)', '{"nombre": "X"}',
      jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('cejas'), 'cantidad', 60),
                        jsonb_build_object('servicio_id', pruebas.servicio('cejas'), 'cantidad', 40))), 'Revisa las cantidades.');
  perform pruebas.espera_error(format('select public.guardar_paquete(%L, %L::jsonb, %L::jsonb)', gen_random_uuid(),
      '{"nombre": "X"}', v_items), 'No encontramos ese paquete.');

  -- Una edición que falla no deja nada a medias (ni el precio ni los servicios)
  perform pruebas.espera_error(format('select public.guardar_paquete(%L, %L::jsonb, %L::jsonb)', v_id, '{"precio": 1}',
      jsonb_build_array(jsonb_build_object('servicio_id', gen_random_uuid()))), 'Uno de los servicios del paquete no existe.');
  perform pruebas.igual((select coalesce(precio::text, 'null') from public.paquetes where id = v_id), 'null', 'precio intacto');
  perform pruebas.igual((select string_agg(s.slug || ':' || ps.cantidad, ', ' order by s.slug)
                           from public.paquete_servicios ps join public.servicios s on s.id = ps.servicio_id
                          where ps.paquete_id = v_id), 'axilas:2, cejas:1', 'servicios intactos');

  -- El visitante ve el paquete nuevo (activo) en el catálogo
  perform pruebas.como_anon();
  perform pruebas.igual((select count(*)::int from public.paquetes where slug in ('verano-2027', 'bono-axilas-prueba')), 2,
                        'el catálogo público muestra los paquetes nuevos');
  perform pruebas.espera_rechazo(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)', '{"nombre": "X"}', v_items));
  perform pruebas.como_postgres();
  raise notice 'OK - guardar_paquete: crea, edita y reemplaza servicios en una transacción; valida slug, tipo, precio, cantidades y bono';
end $$;

-- ---------------------------------------------------------------------------
-- guardar_horarios: reemplaza el horario semanal; fin > inicio y sin traslapes el mismo día
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_pid uuid := (select id from public.personal where slug = 'especialista');
  v_martes date := pruebas.proximo_dia(2, 21);
  v_sql text := 'select public.guardar_horarios(%L, %L::jsonb)';
begin
  perform pruebas.como(v_admin);
  perform public.guardar_horarios(v_pid, '[
    {"dia_semana": 2, "hora_inicio": "10:00", "hora_fin": "14:00"},
    {"dia_semana": "2", "hora_inicio": "15:00", "hora_fin": "19:00"},
    {"dia_semana": 6, "hora_inicio": "9:00", "hora_fin": "15:00:00"}]');
  perform pruebas.igual((select string_agg(h.dia_semana || ' ' || left(h.hora_inicio::text, 5) || '-' || left(h.hora_fin::text, 5),
                                           ', ' order by h.dia_semana, h.hora_inicio)
                           from public.horarios h where h.personal_id = v_pid),
                        '2 10:00-14:00, 2 15:00-19:00, 6 09:00-15:00', 'reemplaza el horario completo');
  perform pruebas.como_anon();
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), 8,
                        'martes con comida de 14 a 15: 8 inicios');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(pruebas.proximo_dia(3, 21))), 0,
                        'el miércoles ya no trabaja');
  perform pruebas.como(v_admin);

  -- Rangos pegados sí; encimados no (y no se guarda nada)
  perform public.guardar_horarios(v_pid, '[{"dia_semana": 2, "hora_inicio": "10:00", "hora_fin": "14:00"},
                                           {"dia_semana": 2, "hora_inicio": "14:00", "hora_fin": "19:00"}]');
  perform pruebas.igual((select count(*)::int from public.horarios where personal_id = v_pid), 2, 'rangos pegados se permiten');
  perform pruebas.espera_error(format(v_sql, v_pid,
      '[{"dia_semana": 2, "hora_inicio": "10:00", "hora_fin": "14:00"},
        {"dia_semana": 6, "hora_inicio": "09:00", "hora_fin": "15:00"},
        {"dia_semana": 2, "hora_inicio": "13:00", "hora_fin": "19:00"}]'),
    'Dos horarios del martes se enciman (10:00–14:00 y 13:00–19:00).');
  perform pruebas.espera_error(format(v_sql, v_pid,
      '[{"dia_semana": 3, "hora_inicio": "10:00", "hora_fin": "12:00"}, {"dia_semana": 3, "hora_inicio": "10:00", "hora_fin": "11:00"}]'),
    'Dos horarios del miércoles se enciman (10:00–12:00 y 10:00–11:00).');
  perform pruebas.espera_error(format(v_sql, v_pid,
      '[{"dia_semana": 6, "hora_inicio": "09:00", "hora_fin": "15:00"}, {"dia_semana": 6, "hora_inicio": "11:00", "hora_fin": "12:00"}]'),
    'Dos horarios del sábado se enciman (09:00–15:00 y 11:00–12:00).');
  perform pruebas.igual((select count(*)::int from public.horarios where personal_id = v_pid), 2, 'un error no deja nada a medias');

  -- Validaciones
  perform pruebas.espera_error(format(v_sql, v_pid, '[{"dia_semana": 1, "hora_inicio": "14:00", "hora_fin": "10:00"}]'),
    'La salida debe ser después de la entrada.');
  perform pruebas.espera_error(format(v_sql, v_pid, '[{"dia_semana": 1, "hora_inicio": "10:00", "hora_fin": "10:00"}]'),
    'La salida debe ser después de la entrada.');
  perform pruebas.espera_error(format(v_sql, v_pid, '[{"dia_semana": 7, "hora_inicio": "10:00", "hora_fin": "14:00"}]'),
    'El día de la semana debe ir de 0 (domingo) a 6 (sábado).');
  perform pruebas.espera_error(format(v_sql, v_pid, '[{"dia_semana": -1, "hora_inicio": "10:00", "hora_fin": "14:00"}]'),
    'El día de la semana debe ir de 0 (domingo) a 6 (sábado).');
  perform pruebas.espera_error(format(v_sql, v_pid, '[{"dia_semana": "martes", "hora_inicio": "10:00", "hora_fin": "14:00"}]'),
    'El día de la semana debe ir de 0 (domingo) a 6 (sábado).');
  perform pruebas.espera_error(format(v_sql, v_pid, '[{"dia_semana": 1.5, "hora_inicio": "10:00", "hora_fin": "14:00"}]'),
    'El día de la semana debe ir de 0 (domingo) a 6 (sábado).');
  perform pruebas.espera_error(format(v_sql, v_pid, '[{"hora_inicio": "10:00", "hora_fin": "14:00"}]'),
    'El día de la semana debe ir de 0 (domingo) a 6 (sábado).');
  perform pruebas.espera_error(format(v_sql, v_pid, '[{"dia_semana": 1, "hora_inicio": "25:00", "hora_fin": "26:00"}]'),
    'Escribe la hora de entrada y la de salida.');
  perform pruebas.espera_error(format(v_sql, v_pid, '[{"dia_semana": 1, "hora_inicio": "10:00"}]'),
    'Escribe la hora de entrada y la de salida.');
  perform pruebas.espera_error(format(v_sql, v_pid, '[3]'), 'El día de la semana debe ir de 0 (domingo) a 6 (sábado).');
  perform pruebas.espera_error(format('select public.guardar_horarios(%L, null)', v_pid), 'Revisa los horarios.');
  perform pruebas.espera_error(format(v_sql, v_pid, '{}'), 'Revisa los horarios.');
  perform pruebas.espera_error(format(v_sql, gen_random_uuid(), '[]'), 'No encontramos a esa persona del equipo.');
  perform pruebas.igual((select count(*)::int from public.horarios where personal_id = v_pid), 2, 'sigue el horario anterior');

  -- '[]' deja a la persona sin horario: no ofrece citas en línea
  perform public.guardar_horarios(v_pid, '[]');
  perform pruebas.igual((select count(*)::int from public.horarios where personal_id = v_pid), 0, 'sin horario');
  perform pruebas.igual((select count(*)::int from public.horarios_disponibles(v_martes)), 0, 'sin horario no hay citas en línea');

  -- Sólo admin
  perform pruebas.como(v_esp);
  perform pruebas.espera_error(format(v_sql, v_pid, '[]'), 'No tienes permiso para hacer esto.');
  perform pruebas.como(pruebas.usuario('clienta@demo.opalo.mx'));
  perform pruebas.espera_error(format(v_sql, v_pid, '[]'), 'No tienes permiso para hacer esto.');
  perform pruebas.como_anon();
  perform pruebas.espera_rechazo(format(v_sql, v_pid, '[]'));
  perform pruebas.como_postgres();
  raise notice 'OK - guardar_horarios: reemplaza el horario; fin > inicio, día 0–6 y sin traslapes el mismo día';
end $$;

-- ---------------------------------------------------------------------------
-- guardar_receta: el personal reemplaza la receta de un servicio
-- ---------------------------------------------------------------------------
do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
  v_cejas uuid := pruebas.servicio('cejas');
  v_cera uuid := '00000000-0000-4000-c000-000000000001';
  v_guantes uuid := '00000000-0000-4000-c000-000000000004';
  v_sql text := 'select public.guardar_receta(%L, %L::jsonb)';
begin
  perform pruebas.como(v_esp);
  perform pruebas.igual((select count(*)::int from public.recetas_servicio where servicio_id = v_cejas), 4, 'receta de ejemplo de cejas');
  perform public.guardar_receta(v_cejas, jsonb_build_array(
    jsonb_build_object('producto_id', v_cera, 'cantidad', 12.5, 'notas', '  Cera tibia  '),
    jsonb_build_object('producto_id', v_guantes, 'cantidad', 2, 'notas', ''),
    jsonb_build_object('producto_id', v_cera, 'cantidad', '0.5')));
  perform pruebas.igual((select string_agg(pr.nombre || ' ' || r.cantidad::text || ' ' || coalesce(r.notas, '-'), ', ' order by pr.nombre)
                           from public.recetas_servicio r join public.productos pr on pr.id = r.producto_id
                          where r.servicio_id = v_cejas),
                        'Cera tibia (ejemplo) 13.000 Cera tibia, Guantes de nitrilo (ejemplo) 2.000 -',
                        'reemplaza la receta; repetidos se suman');
  perform pruebas.igual((select costo_material from public.v_costo_servicio where slug = 'cejas'),
                        (select round(13 * c.costo_unitario + 2 * g.costo_unitario, 2)
                           from public.productos c, public.productos g where c.id = v_cera and g.id = v_guantes),
                        'el costo por servicio usa la receta nueva');

  -- Validaciones (un error no deja la receta a medias)
  perform pruebas.espera_error(format(v_sql, v_cejas, jsonb_build_array(jsonb_build_object('producto_id', gen_random_uuid(), 'cantidad', 1))),
    'Uno de los productos de la receta no existe.');
  perform pruebas.espera_error(format(v_sql, v_cejas, '[{"producto_id": "cera", "cantidad": 1}]'),
    'Uno de los productos de la receta no existe.');
  perform pruebas.espera_error(format(v_sql, v_cejas, jsonb_build_array(jsonb_build_object('producto_id', v_cera, 'cantidad', 0))),
    'La cantidad de cada producto debe ser mayor a cero.');
  perform pruebas.espera_error(format(v_sql, v_cejas, jsonb_build_array(jsonb_build_object('producto_id', v_cera, 'cantidad', -3))),
    'La cantidad de cada producto debe ser mayor a cero.');
  perform pruebas.espera_error(format(v_sql, v_cejas, jsonb_build_array(jsonb_build_object('producto_id', v_cera, 'cantidad', 0.0001))),
    'La cantidad de cada producto debe ser mayor a cero.');
  perform pruebas.espera_error(format(v_sql, v_cejas, jsonb_build_array(jsonb_build_object('producto_id', v_cera, 'cantidad', 'mucha'))),
    'La cantidad de cada producto debe ser mayor a cero.');
  perform pruebas.espera_error(format(v_sql, v_cejas, jsonb_build_array(jsonb_build_object('producto_id', v_cera))),
    'La cantidad de cada producto debe ser mayor a cero.');
  perform pruebas.espera_error(format(v_sql, v_cejas,
      jsonb_build_array(jsonb_build_object('producto_id', v_cera, 'cantidad', 1, 'notas', repeat('x', 1001)))),
    'Las notas son muy largas; escríbelas en máximo 1000 caracteres.');
  perform pruebas.espera_error(format(v_sql, gen_random_uuid(), '[]'), 'No encontramos ese servicio.');
  perform pruebas.espera_error(format('select public.guardar_receta(%L, null)', v_cejas), 'Revisa la receta.');
  perform pruebas.igual((select count(*)::int from public.recetas_servicio where servicio_id = v_cejas), 2, 'la receta sigue igual');

  -- '[]' la deja vacía; el admin también puede editarla
  perform public.guardar_receta(v_cejas, '[]');
  perform pruebas.igual((select tiene_receta from public.v_costo_servicio where slug = 'cejas'), false, 'receta vacía');
  perform pruebas.como(v_admin);
  perform public.guardar_receta(v_cejas, jsonb_build_array(jsonb_build_object('producto_id', v_cera, 'cantidad', 10)));
  perform pruebas.igual((select count(*)::int from public.recetas_servicio where servicio_id = v_cejas), 1, 'el admin también');

  -- Visitante: ni la ejecuta
  perform pruebas.como_anon();
  perform pruebas.espera_rechazo(format(v_sql, v_cejas, '[]'));
  perform pruebas.como_postgres();
  raise notice 'OK - guardar_receta: reemplaza la receta; productos existentes y cantidades > 0';
end $$;

-- ---------------------------------------------------------------------------
-- v_clientes_resumen.es_personal: el panel separa al equipo de las clientas
-- ---------------------------------------------------------------------------
do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_valeria uuid := pruebas.usuario('valeria@demo.opalo.mx');
begin
  perform pruebas.como(v_esp);
  perform pruebas.igual((select es_personal from public.v_clientes_resumen
                          where id = pruebas.cliente_de(pruebas.usuario('admin@demo.opalo.mx'))), true, 'admin: del equipo');
  perform pruebas.igual((select es_personal from public.v_clientes_resumen where id = pruebas.cliente_de(v_esp)), true,
                        'especialista: del equipo');
  perform pruebas.igual((select es_personal from public.v_clientes_resumen
                          where id = pruebas.cliente_de(pruebas.usuario('clienta@demo.opalo.mx'))), false, 'clienta: no');
  perform pruebas.igual((select es_personal from public.v_clientes_resumen where apellidos = 'Mostrador (ejemplo)'), false,
                        'clienta sin cuenta: no');
  perform pruebas.igual((select count(*)::int from public.v_clientes_resumen where es_personal), 2, 'dos cuentas del equipo');
  perform pruebas.como_postgres();
  update public.perfiles set rol = 'personal' where id = v_valeria;
  perform pruebas.como(v_esp);
  perform pruebas.igual((select es_personal from public.v_clientes_resumen where id = pruebas.cliente_de(v_valeria)), true,
                        'un cambio de rol se refleja de inmediato');
  perform pruebas.como(pruebas.usuario('clienta@demo.opalo.mx'));
  perform pruebas.igual(pruebas.filas('public.v_clientes_resumen'), 0, 'la clienta no ve el resumen');
  perform pruebas.como_postgres();
  raise notice 'OK - v_clientes_resumen.es_personal: equipo (personal o admin) separado de las clientas';
end $$;

rollback;
