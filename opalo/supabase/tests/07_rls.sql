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
                           'public.v_gastos_por_vencer', 'public.v_resultado_mensual'] loop
    perform pruebas.igual(pruebas.filas(t), 0, 'el visitante no ve ' || t);
  end loop;

  perform pruebas.igual(pruebas.filas('public.servicios'), 29, 'catálogo');
  perform pruebas.igual(pruebas.filas('public.personal_publico'), 1, 'equipo público');
  perform pruebas.igual(pruebas.filas('public.capacitaciones_publicas'), 1, 'capacitaciones públicas');
  perform pruebas.igual(pruebas.filas('public.productos_tienda'), 1, 'tienda');
  perform pruebas.igual(pruebas.filas('public.configuracion'), 1, 'configuración');
  perform pruebas.igual(pruebas.filas('public.politicas'), (select count(*)::int from public.politicas where activa), 'políticas activas');
  perform pruebas.afirma(pruebas.filas('public.personal') >= 1, 'personal activo');

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
  perform pruebas.igual(pruebas.filas('public.productos'), 6, 'lee productos');
  perform pruebas.afirma(pruebas.filas('public.movimientos_inventario') > 0, 'lee movimientos');
  perform pruebas.afirma(pruebas.filas('public.compras') = 1, 'lee compras');
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
  insert into public.horarios (personal_id, dia_semana, hora_inicio, hora_fin) select id, 1, '10:00', '14:00' from public.personal limit 1;
  perform pruebas.como_postgres();
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

rollback;
