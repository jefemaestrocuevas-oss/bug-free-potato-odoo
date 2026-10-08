-- Pruebas · RLS y privilegios: visitante, clientas, personal y admin
begin;

-- Visitante (anon)
do $$
declare
  t text;
begin
  perform pruebas.como_anon();
  foreach t in array array['public.clientes', 'public.fichas_salud', 'public.gastos', 'public.gastos_recurrentes',
                           'public.citas', 'public.cita_items', 'public.pedidos', 'public.pedido_items', 'public.pagos',
                           'public.creditos', 'public.consentimientos', 'public.aceptaciones_politica', 'public.perfiles',
                           'public.productos', 'public.proveedores', 'public.movimientos_inventario', 'public.compras',
                           'public.recetas_servicio', 'public.bloqueos_agenda', 'public.categorias_gasto',
                           'public.v_citas_detalle', 'public.v_pedidos_detalle', 'public.v_creditos',
                           'public.v_clientes_resumen', 'public.v_costo_servicio', 'public.v_reposicion',
                           'public.v_gastos_por_vencer', 'public.v_resultado_mensual',
                           'public.formulas', 'public.formula_items', 'public.lotes_produccion',
                           'public.v_lotes', 'public.v_costo_formulas', 'public.v_margen_productos'] loop
    perform pruebas.igual(pruebas.filas(t), 0, 'el visitante no ve ' || t);
  end loop;

  perform pruebas.igual(pruebas.filas('public.servicios'), 29, 'catálogo');
  perform pruebas.igual(pruebas.filas('public.personal_publico'), 1, 'equipo público');
  perform pruebas.igual(pruebas.filas('public.capacitaciones_publicas'), 1, 'capacitaciones públicas');
  perform pruebas.igual(pruebas.filas('public.productos_tienda'), 6, 'tienda');
  perform pruebas.igual(pruebas.filas('public.configuracion'), 1, 'configuración');
  perform pruebas.igual(pruebas.filas('public.politicas'), (select count(*)::int from public.politicas where activa), 'políticas activas');
  perform pruebas.igual(pruebas.filas('public.personal'), 0, 'la tabla personal no (usa personal_publico)');
  perform pruebas.igual(pruebas.filas('public.capacitaciones'), 0, 'la tabla capacitaciones no (usa capacitaciones_publicas)');
  perform pruebas.espera_rechazo('select usuario_id from public.personal');
  perform pruebas.espera_rechazo('select notas, constancia_url from public.capacitaciones');
  foreach t in array array['public.horarios', 'public.cabinas', 'public.personal_servicios', 'public.v_clientes_notas'] loop
    perform pruebas.igual(pruebas.filas(t), 0, 'el visitante no ve ' || t);
  end loop;

  perform pruebas.espera_rechazo('insert into public.clientes (nombre) values (''Intrusa'')');
  perform pruebas.espera_rechazo('update public.servicios set precio = 1');
  perform pruebas.espera_rechazo('select public.registrar_pago(100, ''efectivo'', gen_random_uuid())');
  perform pruebas.espera_rechazo('select public.publicar_politica(''terminos'', ''x'', ''y'')');
  perform pruebas.espera_rechazo('select public.crear_cita_interna(gen_random_uuid(), ''[]'', now(), null, ''web'', null, true, null, null, null, null)');
  perform pruebas.espera_rechazo('select public.generar_codigo_regalo()');
  perform pruebas.espera_error('select public.canjear_regalo(''ABCDEFGH'')', 'Inicia sesión para continuar.');
  perform pruebas.espera_error('select public.guardar_ficha_salud(''{}'', ''{}'', null, null, null, true)', 'Inicia sesión para continuar.');
  perform pruebas.igual(public.mi_rol(), null::public.rol_usuario, 'mi_rol() del visitante es null');
  perform pruebas.como_postgres();
  raise notice 'OK - el visitante sólo ve lo público';
end $$;

-- Clientas: cada una sólo lo suyo
do $$
declare
  v_ana uuid := pruebas.usuario('clienta@demo.opalo.mx');
  v_sofia uuid := pruebas.usuario('sofia@demo.opalo.mx');
  v_ana_c uuid := pruebas.cliente_de(pruebas.usuario('clienta@demo.opalo.mx'));
  v_sofia_c uuid := pruebas.cliente_de(pruebas.usuario('sofia@demo.opalo.mx'));
begin
  perform pruebas.como(v_ana);
  perform pruebas.igual(public.mi_rol(), 'cliente'::public.rol_usuario, 'rol cliente');
  perform pruebas.igual(public.mi_cliente_id(), v_ana_c, 'mi_cliente_id');
  perform pruebas.igual(pruebas.filas('public.clientes'), 1, 'sólo su fila de clientes');
  perform pruebas.igual(pruebas.filas('public.perfiles'), 1, 'sólo su perfil');
  perform pruebas.afirma((select bool_and(cliente_id = v_ana_c) from public.citas), 'sólo sus citas');
  perform pruebas.afirma((select count(*) from public.citas) >= 4, 've sus citas (pasadas y futuras)');
  perform pruebas.afirma((select bool_and(cliente_id = v_ana_c) from public.v_citas_detalle), 'v_citas_detalle: sólo las suyas');
  perform pruebas.igual((select count(*)::int from public.fichas_salud where cliente_id = v_sofia_c), 0, 'no ve la ficha de Sofía');
  perform pruebas.igual((select count(*)::int from public.fichas_salud), 1, 've su ficha');
  perform pruebas.igual((select count(*)::int from public.consentimientos where cliente_id = v_sofia_c), 0, 'no ve consentimientos ajenos');
  perform pruebas.igual((select count(*)::int from public.pedidos where cliente_id <> v_ana_c), 0, 'no ve pedidos ajenos');
  perform pruebas.igual((select count(*)::int from public.v_pedidos_detalle), 1, 'su pedido');
  perform pruebas.afirma((select count(*) from public.pagos) >= 1 and
                         (select bool_and(coalesce(p.cita_id in (select id from public.citas), false)
                                          or coalesce(p.pedido_id in (select id from public.pedidos), false))
                            from public.pagos p), 'sólo pagos de sus citas y pedidos');
  perform pruebas.igual((select count(*)::int from public.creditos where cliente_id <> v_ana_c), 0, 'no ve créditos ajenos');
  perform pruebas.igual((select count(*)::int from public.cita_items ci where not exists
                          (select 1 from public.citas c where c.id = ci.cita_id)), 0, 'cita_items sólo de sus citas');
  perform pruebas.igual(pruebas.filas('public.gastos'), 0, 'no ve gastos');
  perform pruebas.igual(pruebas.filas('public.productos'), 0, 'no ve productos');
  perform pruebas.igual(pruebas.filas('public.movimientos_inventario'), 0, 'no ve movimientos');
  perform pruebas.igual(pruebas.filas('public.formulas') + pruebas.filas('public.formula_items')
                        + pruebas.filas('public.lotes_produccion') + pruebas.filas('public.v_lotes')
                        + pruebas.filas('public.v_costo_formulas') + pruebas.filas('public.v_margen_productos'), 0,
                        'no ve el taller');
  perform pruebas.afirma(pruebas.filas('public.productos_tienda') > 0, 'sí ve la tienda');
  perform pruebas.igual(pruebas.filas('public.bloqueos_agenda'), 0, 'no ve bloqueos');
  perform pruebas.igual(pruebas.filas('public.v_clientes_resumen'), 0, 'no ve el resumen de clientas');
  perform pruebas.igual(pruebas.filas('public.v_resultado_mensual'), 0, 'no ve resultados');
  perform pruebas.igual((select count(*)::int from public.personal), 1, 've al personal activo');

  -- No escribe directo donde no debe
  perform pruebas.espera_rechazo(format('insert into public.fichas_salud (cliente_id, acepta_datos_sensibles) values (%L, true)', v_ana_c));
  perform pruebas.espera_rechazo(format('insert into public.consentimientos (cliente_id, politica_id, nombre_firmante, firma_svg) select %L, id, ''x'', ''y'' from public.politicas limit 1', v_ana_c));
  perform pruebas.espera_rechazo('update public.citas set total = 0');
  perform pruebas.espera_rechazo('update public.creditos set usados = 0');
  perform pruebas.espera_rechazo('insert into public.pedidos (cliente_id) values (public.mi_cliente_id())');
  perform pruebas.espera_rechazo('delete from public.consentimientos');
  perform pruebas.espera_rechazo('update public.consentimientos set firma_svg = ''otra''');

  -- Sus datos básicos sí; lo demás no
  update public.clientes set telefono = '4429999999', acepta_promociones = true, nombre = 'Ana María' where id = v_ana_c;
  perform pruebas.igual((select telefono from public.clientes where id = v_ana_c), '4429999999', 'actualiza su teléfono');
  perform pruebas.espera_error(format('update public.clientes set notas_internas = %L where id = %L', 'hackeo', v_ana_c),
    'No tienes permiso para hacer esto.');
  perform pruebas.espera_error(format('update public.clientes set email = %L where id = %L', 'otra@x.mx', v_ana_c),
    'No tienes permiso para hacer esto.');
  perform pruebas.espera_rechazo(format('update public.clientes set usuario_id = %L where id = %L', v_sofia, v_ana_c));
  update public.clientes set telefono = '0000000000' where id = v_sofia_c;        -- RLS: 0 filas
  update public.perfiles set rol = 'admin' where id = v_ana;                      -- RLS: 0 filas
  perform pruebas.igual(public.mi_rol(), 'cliente'::public.rol_usuario, 'no puede cambiar su rol');
  perform pruebas.como_postgres();
  perform pruebas.igual((select telefono from public.clientes where id = v_sofia_c), '4420000002', 'no toca a otra clienta');
  perform pruebas.igual((select rol::text from public.perfiles where id = v_ana), 'cliente', 'el rol sigue siendo cliente');
  perform pruebas.igual((select notas_internas from public.clientes where id = v_ana_c), null::text, 'notas internas intactas');

  -- Lee las versiones de políticas que aceptó aunque ya no estén activas
  perform pruebas.como(pruebas.usuario('admin@demo.opalo.mx'));
  perform public.publicar_politica('terminos', 'Términos (v2 de prueba)', 'Texto nuevo.');
  perform pruebas.como(v_ana);
  perform pruebas.igual((select count(*)::int from public.politicas where tipo = 'terminos'), 2, 've la v1 que aceptó y la v2 activa');
  perform pruebas.como(pruebas.usuario('valeria@demo.opalo.mx'));
  perform pruebas.igual((select count(*)::int from public.politicas where tipo = 'terminos'), 1, 'quien no la aceptó sólo ve la activa');
  perform pruebas.igual((select count(*)::int from public.consentimientos), 0, 'Valeria no tiene consentimientos');
  perform pruebas.como_postgres();
  raise notice 'OK - clientas: cada una sólo lo suyo; sólo edita sus datos básicos; no cambia su rol';
end $$;

-- Personal: agenda, clientas e inventario; sin gastos ni resultados
do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_ana_c uuid := pruebas.cliente_de(pruebas.usuario('clienta@demo.opalo.mx'));
  v_valeria uuid := pruebas.usuario('valeria@demo.opalo.mx');
  v_cat_gasto uuid := (select id from public.categorias_gasto where slug = 'otros');
  v_nueva uuid;
begin
  perform pruebas.como(v_esp);
  perform pruebas.igual(public.mi_rol(), 'personal'::public.rol_usuario, 'rol personal');
  perform pruebas.igual(public.es_personal(), true, 'es_personal()');
  perform pruebas.igual(public.es_admin(), false, 'no es admin');
  perform pruebas.igual(pruebas.filas('public.gastos'), 0, 'el personal no ve gastos');
  perform pruebas.igual(pruebas.filas('public.gastos_recurrentes'), 0, 'ni gastos recurrentes');
  perform pruebas.igual(pruebas.filas('public.categorias_gasto'), 0, 'ni categorías de gasto');
  perform pruebas.igual(pruebas.filas('public.v_gastos_por_vencer'), 0, 'ni gastos por vencer');
  perform pruebas.igual(pruebas.filas('public.v_resultado_mensual'), 0, 'ni resultados');
  perform pruebas.igual(pruebas.filas('public.clientes'), (select count(*)::int from public.clientes), 've a todas las clientas');
  perform pruebas.afirma(pruebas.filas('public.fichas_salud') >= 2, 'lee fichas de salud');
  perform pruebas.afirma(pruebas.filas('public.consentimientos') >= 6, 'lee consentimientos');
  perform pruebas.afirma(pruebas.filas('public.aceptaciones_politica') >= 6, 'lee aceptaciones');
  perform pruebas.igual(pruebas.filas('public.productos'), 23, 'lee productos (insumos, materia prima y de venta)');
  perform pruebas.igual(pruebas.filas('public.formulas'), 5, 'lee fórmulas');
  perform pruebas.igual(pruebas.filas('public.v_lotes'), 4, 'lee lotes');
  perform pruebas.afirma(pruebas.filas('public.movimientos_inventario') > 0, 'lee movimientos');
  perform pruebas.afirma(pruebas.filas('public.compras') = 2, 'lee compras (cabina y materia prima del taller)');
  perform pruebas.afirma(pruebas.filas('public.v_clientes_resumen') >= 6, 'resumen de clientas');
  perform pruebas.afirma(pruebas.filas('public.v_citas_detalle') >= 9, 'toda la agenda');

  insert into public.clientes (nombre, telefono, notas_internas) values ('Nueva por WhatsApp', '4421111111', 'Llamar en la tarde')
  returning id into v_nueva;
  update public.clientes set notas_internas = 'Prefiere la mañana' where id = v_ana_c;
  insert into public.bloqueos_agenda (personal_id, inicio, fin, motivo) values (null, now() + interval '30 days', now() + interval '31 days', 'Prueba');
  delete from public.bloqueos_agenda where motivo = 'Prueba';
  insert into public.proveedores (nombre) values ('Proveedor del personal (prueba)');

  -- No edita catálogo, equipo, configuración ni roles (RLS: 0 filas o rechazo)
  update public.servicios set precio = 1 where slug = 'cejas';
  update public.configuracion set lema = 'x';
  update public.perfiles set rol = 'admin' where id = v_valeria;
  perform pruebas.espera_rechazo('insert into public.servicios (categoria_id, slug, nombre) select id, ''nuevo'', ''Nuevo'' from public.categorias_servicio limit 1');
  perform pruebas.espera_rechazo(format('insert into public.gastos (categoria_id, concepto, monto) values (%L, %L, 1)', v_cat_gasto, 'x'));
  perform pruebas.espera_error('select public.publicar_politica(''terminos'', ''x'', ''y'')', 'No tienes permiso para hacer esto.');
  perform pruebas.espera_rechazo('update public.paquetes set precio = 1');
  -- Productos: edita la ficha, pero no la llave primaria ni las existencias (sólo con movimientos)
  perform pruebas.espera_rechazo('update public.productos set id = gen_random_uuid() where false');
  perform pruebas.espera_rechazo('update public.productos set stock_actual = 0 where false');
  perform pruebas.espera_rechazo('delete from public.horarios');
  perform pruebas.espera_rechazo('delete from public.recetas_servicio');
  perform pruebas.espera_error(format('select public.guardar_paquete(null, %L::jsonb, %L::jsonb)',
      '{"nombre": "Del personal"}', jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('cejas')))),
    'No tienes permiso para hacer esto.');
  perform pruebas.espera_error(format('select public.guardar_horarios(%L, %L::jsonb)',
      (select id from public.personal where slug = 'especialista'), '[]'),
    'No tienes permiso para hacer esto.');
  perform pruebas.como_postgres();
  perform pruebas.igual((select precio from public.servicios where slug = 'cejas'), 120.00::numeric(10,2), 'precio intacto');
  perform pruebas.igual((select lema from public.configuracion), 'Todo lo que necesitas para consentirte, en un solo lugar', 'lema intacto');
  perform pruebas.igual((select rol::text from public.perfiles where id = v_valeria), 'cliente', 'el personal no cambia roles');
  perform pruebas.igual((select notas_internas from public.clientes where id = v_ana_c), 'Prefiere la mañana', 'notas internas');
  perform pruebas.igual((select usuario_id from public.clientes where id = v_nueva), null::uuid, 'clienta sin cuenta');
  raise notice 'OK - personal: agenda, clientas e inventario; sin gastos ni resultados';
end $$;

-- Admin: todo
do $$
declare
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
  v_valeria uuid := pruebas.usuario('valeria@demo.opalo.mx');
  v_esp_id uuid := (select id from public.personal where slug = 'especialista');
begin
  perform pruebas.como(v_admin);
  perform pruebas.igual(public.es_admin(), true, 'es_admin()');
  perform pruebas.afirma(pruebas.filas('public.gastos') >= 10, 'el admin ve gastos');
  perform pruebas.igual(pruebas.filas('public.gastos_recurrentes'), 6, 'gastos recurrentes');
  perform pruebas.afirma(pruebas.filas('public.v_resultado_mensual') >= 2, 'resultados');
  perform pruebas.igual(pruebas.filas('public.v_gastos_por_vencer'), 6, 'gastos por vencer');

  update public.servicios set precio = 150 where slug = 'labio-superior';
  update public.configuracion set anticipacion_min_horas = 3;
  update public.perfiles set rol = 'personal' where id = v_valeria;
  insert into public.gastos (categoria_id, concepto, monto) select id, 'Gasto del admin (prueba)', 99 from public.categorias_gasto limit 1;
  insert into public.capacitaciones (personal_id, nombre, tipo) select id, 'Taller (prueba)', 'taller' from public.personal limit 1;
  -- Horarios: sólo con guardar_horarios (reemplaza el horario completo de la persona)
  perform public.guardar_horarios(v_esp_id,
    (select jsonb_agg(jsonb_build_object('dia_semana', h.dia_semana, 'hora_inicio', h.hora_inicio, 'hora_fin', h.hora_fin))
       from public.horarios h where h.personal_id = v_esp_id)
    || '[{"dia_semana": 1, "hora_inicio": "10:00", "hora_fin": "14:00"}]'::jsonb);
  perform pruebas.igual((select count(*)::int from public.horarios where personal_id = v_esp_id), 6, 'el admin agrega el lunes');
  -- Paquetes, sus servicios, horarios y recetas ya no se escriben directo (sólo con sus RPC)
  perform pruebas.espera_rechazo(format('insert into public.horarios (personal_id, dia_semana, hora_inicio, hora_fin) values (%L, 0, ''10:00'', ''12:00'')', v_esp_id));
  perform pruebas.espera_rechazo('delete from public.horarios');
  perform pruebas.espera_rechazo('update public.paquetes set precio = 1');
  perform pruebas.espera_rechazo('insert into public.paquetes (slug, nombre) values (''directo'', ''Directo'')');
  perform pruebas.espera_rechazo('delete from public.paquete_servicios');
  perform pruebas.espera_rechazo(format('insert into public.paquete_servicios (paquete_id, servicio_id) values (%L, %L)',
                                        pruebas.paquete('express'), pruebas.servicio('patillas')));
  perform pruebas.espera_rechazo('delete from public.recetas_servicio');
  perform pruebas.espera_rechazo('update public.recetas_servicio set cantidad = 1');
  perform pruebas.como_postgres();
  perform pruebas.igual((select precio from public.paquetes where slug = 'express'), 300.00::numeric(10,2), 'paquete intacto');
  perform pruebas.igual((select count(*)::int from public.paquete_servicios), 11, 'servicios de paquetes intactos');
  perform pruebas.igual((select precio from public.servicios where slug = 'labio-superior'), 150.00::numeric(10,2), 'el admin pone precios');
  perform pruebas.igual((select anticipacion_min_horas from public.configuracion), 3, 'el admin edita la configuración');
  perform pruebas.igual((select rol::text from public.perfiles where id = v_valeria), 'personal', 'el admin cambia roles');
  perform pruebas.como(v_valeria);
  perform pruebas.igual(public.es_personal(), true, 'el nuevo rol aplica de inmediato');
  perform pruebas.como(v_admin);
  perform pruebas.espera_rechazo('delete from public.consentimientos');
  perform pruebas.espera_rechazo('update public.movimientos_inventario set cantidad = 0');
  perform pruebas.como_postgres();
  raise notice 'OK - admin: gastos, resultados, catálogo, configuración y roles';
end $$;

-- service_role se salta RLS (lo usa el panel de Supabase / tareas de mantenimiento)
do $$
begin
  set local role service_role;
  perform pruebas.afirma((select count(*) from public.gastos) >= 10, 'service_role ve todo');
  reset role;
  raise notice 'OK - service_role';
end $$;

-- Columnas internas: la clienta no las lee ni con su JWT (RLS filtra filas, no columnas)
do $$
declare
  v_ana uuid := pruebas.usuario('clienta@demo.opalo.mx');
  v_ana_c uuid := pruebas.cliente_de(pruebas.usuario('clienta@demo.opalo.mx'));
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_nueva uuid;
  v_id uuid;
begin
  update public.clientes set notas_internas = 'Nota del personal (prueba)' where id = v_ana_c;
  update public.citas set notas_internas = 'Nota de la cita (prueba)'
   where id = (select id from public.citas where cliente_id = v_ana_c order by inicio limit 1);

  perform pruebas.como(v_ana);
  perform pruebas.espera_rechazo('select notas_internas from public.clientes');
  perform pruebas.espera_rechazo('select * from public.clientes');
  perform pruebas.espera_rechazo('select notas_internas from public.citas');
  perform pruebas.espera_rechazo('select creada_por from public.citas');
  perform pruebas.espera_rechazo('select recibido_por from public.pagos');
  perform pruebas.espera_rechazo('select notas from public.pagos');
  perform pruebas.igual(pruebas.filas('public.v_clientes_notas'), 0, 'la clienta no ve notas en la vista');
  -- Lo que el sitio sí pide sigue funcionando (COLUMNAS_CLIENTE, actualizar sus datos, sus citas)
  perform pruebas.igual((select count(*)::int from (select id, nombre, apellidos, telefono, email, fecha_nacimiento, acepta_promociones
                                                       from public.clientes where usuario_id = v_ana) x), 1, 'lee sus datos básicos');
  update public.clientes set acepta_promociones = false where usuario_id = v_ana returning id into v_id;
  perform pruebas.igual(v_id, v_ana_c, 'actualiza sus datos y recibe su id');
  perform pruebas.afirma((select count(*) from public.v_citas_detalle) >= 4, 'sus citas en v_citas_detalle');
  perform pruebas.afirma((select count(*) from public.v_pedidos_detalle) >= 1, 'sus pedidos con lo pagado');

  -- El personal escribe notas y las lee en v_clientes_notas (tampoco las pide directo a la tabla)
  perform pruebas.como(v_esp);
  perform pruebas.igual((select notas_internas from public.v_clientes_notas where id = v_ana_c), 'Nota del personal (prueba)',
                        'el personal lee las notas en la vista');
  perform pruebas.igual(pruebas.filas('public.v_clientes_notas'), (select count(*)::int from public.clientes), 'de todas las clientas');
  perform pruebas.espera_rechazo('select notas_internas from public.clientes');
  update public.clientes set notas_internas = 'Nota corregida (prueba)' where id = v_ana_c returning id into v_id;
  perform pruebas.igual(v_id, v_ana_c, 'el personal actualiza notas');
  insert into public.clientes (nombre, notas_internas) values ('Nueva (prueba)', 'Llamar en la tarde') returning id into v_nueva;
  perform pruebas.igual((select notas_internas from public.v_clientes_notas where id = v_nueva), 'Llamar en la tarde',
                        'y las de una clienta nueva');
  perform pruebas.como_postgres();
  raise notice 'OK - notas internas y columnas del personal: fuera del alcance de la clienta';
end $$;

-- Equipo: la clienta no lee capacitaciones ni personal directo, salvo a quien la atendió
do $$
declare
  v_n uuid := pruebas.clienta_lista('equipo.prueba@ejemplo.mx');
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
begin
  perform pruebas.como(v_n);
  perform pruebas.igual(pruebas.filas('public.capacitaciones'), 0, 'capacitaciones sólo por la vista pública');
  perform pruebas.afirma(pruebas.filas('public.capacitaciones_publicas') >= 1, 'la vista pública sí');
  perform pruebas.igual(pruebas.filas('public.personal'), 0, 'sin citas no ve filas de personal');
  perform pruebas.igual(pruebas.filas('public.personal_publico'), 1, 'el equipo público sí');
  perform pruebas.como(v_esp);
  perform public.reservar_cita_staff(pruebas.cliente_de(v_n), pruebas.items('cejas'), pruebas.instante(pruebas.proximo_dia(2, 21), '15:00'));
  perform pruebas.afirma(pruebas.filas('public.capacitaciones') >= 1, 'el personal lee capacitaciones');
  perform pruebas.como(v_n);
  perform pruebas.igual(pruebas.filas('public.personal'), 1, 've a quien la atenderá');
  perform pruebas.igual((select personal_nombre from public.v_citas_detalle limit 1), 'Especialista de Ópalo', 'y su nombre en la cita');
  perform pruebas.como_postgres();
  raise notice 'OK - equipo y capacitaciones por sus vistas públicas';
end $$;

-- Seguridad por defecto: RLS en todo, funciones y vistas abiertas sólo las del contrato, y nada
-- de lo que se cree después queda abierto a anon/authenticated
do $$
declare
  v_lista text;
  c_anon constant text[] := array['aceptar_politicas', 'cancelar_cita', 'cancelar_pedido', 'canjear_regalo',
    'configuracion_actual', 'crear_pedido', 'duracion_reserva', 'es_admin', 'es_personal', 'firmar_consentimiento_cita',
    'guardar_ficha_salud', 'horarios_disponibles', 'hoy_local', 'mi_cliente_id', 'mi_rol', 'reservar_cita', 'telefono_legible'];
  c_personal constant text[] := array['ajustar_inventario', 'avanzar_vencimiento', 'cambiar_estado_cita', 'completar_cita',
    'descartar_lote', 'dias_del_mes', 'guardar_formula', 'guardar_horarios', 'guardar_paquete', 'guardar_receta',
    'liberar_lote', 'marcar_entregado', 'primer_vencimiento', 'publicar_politica', 'registrar_compra', 'registrar_lote',
    'registrar_pago', 'reservar_cita_staff', 'venta_mostrador'];
begin
  select string_agg(c.relname, ', ') into v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  perform pruebas.igual(v_lista, null::text, 'tablas de public sin RLS');

  select string_agg(p.proname, ', ' order by p.proname) into v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') and p.proname <> all (c_anon);
  perform pruebas.igual(v_lista, null::text, 'funciones que anon puede ejecutar fuera de la lista');
  select string_agg(p.proname, ', ' order by p.proname) into v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
     and p.proname <> all (c_anon || c_personal);
  perform pruebas.igual(v_lista, null::text, 'funciones que authenticated puede ejecutar fuera de la lista');

  select string_agg(c.relname, ', ') into v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce(c.reloptions && array['security_invoker=true', 'security_invoker=on'], false)
     and c.relname <> all (array['personal_publico', 'capacitaciones_publicas', 'productos_tienda', 'v_clientes_notas']);
  perform pruebas.igual(v_lista, null::text, 'vistas con permisos del dueño fuera de la lista');

  -- Objetos nuevos (como los de una migración futura): cerrados hasta que se den permisos explícitos
  create table public.t_nueva_prueba (x int);
  create function public.f_nueva_prueba() returns int language sql security definer as 'select 1';
  perform pruebas.afirma(not has_table_privilege('anon', 'public.t_nueva_prueba', 'select, insert, update, delete'), 'tabla nueva: anon nada');
  perform pruebas.afirma(not has_table_privilege('authenticated', 'public.t_nueva_prueba', 'select, insert, update, delete'),
                         'tabla nueva: authenticated nada');
  perform pruebas.afirma(not has_function_privilege('anon', 'public.f_nueva_prueba()', 'execute'), 'función nueva: anon no la ejecuta');
  perform pruebas.afirma(not has_function_privilege('authenticated', 'public.f_nueva_prueba()', 'execute'),
                         'función nueva: authenticated no la ejecuta');
  perform pruebas.afirma(has_table_privilege('service_role', 'public.t_nueva_prueba', 'select'), 'service_role sí');
  raise notice 'OK - seguridad por defecto (RLS, funciones, vistas y objetos nuevos)';
end $$;

rollback;
