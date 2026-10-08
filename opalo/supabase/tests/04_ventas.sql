-- Pruebas · crear_pedido (R8), registrar_pago (R9), créditos y regalos (R10), cancelar_pedido
begin;

-- Una prueba reserva en una fecha relativa a hoy, que puede caer antes de la apertura: sin fecha
-- de apertura (la regla se prueba en 02 y 03).
update public.configuracion set fecha_apertura = null;

do $$
declare
  v_a uuid := pruebas.clienta_lista('compra.a@ejemplo.mx');
  v_b uuid := pruebas.clienta_lista('compra.b@ejemplo.mx');
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_crema uuid := '00000000-0000-4000-c000-000000000006';
  v_cera uuid := '00000000-0000-4000-c000-000000000001';
  v_stock numeric;
  r jsonb;
  v_pedido uuid;
  v_codigo text;
  v_regalo uuid;
  v_sql text;
begin
  select stock_actual into v_stock from public.productos where id = v_crema;

  -- Validaciones del carrito
  perform pruebas.como_anon();
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('cejas'), 'cantidad', 1))),
    'Inicia sesión para continuar.');
  perform pruebas.como(v_a);
  perform pruebas.espera_error('select public.crear_pedido(''[]''::jsonb)', 'Tu carrito está vacío.');
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('labio-superior'), 'cantidad', 1))),
    'Uno de los productos ya no está disponible para compra en línea.');
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_cera, 'cantidad', 1))),
    'Uno de los productos ya no está disponible para compra en línea.');
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('tipo', 'paquete', 'id', gen_random_uuid(), 'cantidad', 1))),
    'Uno de los productos ya no está disponible para compra en línea.');

  -- Pedido: cejas ×2, axilas de regalo, Paquete Express, crema → 240 + 120 + 300 + 320 = 980
  r := public.crear_pedido(jsonb_build_array(
         jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('cejas'), 'cantidad', 2),
         jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('axilas'), 'cantidad', 1, 'regalo_para', 'Mi hermana'),
         jsonb_build_object('tipo', 'paquete', 'id', pruebas.paquete('express'), 'cantidad', 1),
         jsonb_build_object('tipo', 'producto', 'id', v_crema, 'cantidad', 1, 'precio', 1)),   -- el precio del cliente se ignora
       'transferencia', 'Paso por ellos el sábado');
  v_pedido := (r ->> 'id')::uuid;
  perform pruebas.igual((r ->> 'total')::numeric, 980::numeric, 'total calculado en el servidor');
  perform pruebas.afirma((r ->> 'folio') ~ '^OP-[0-9]{5}$', 'folio OP-00000');
  perform pruebas.igual((select estado::text from public.v_pedidos_detalle where id = v_pedido), 'pendiente_pago', 'pendiente de pago');
  perform pruebas.igual((select jsonb_array_length(items) from public.v_pedidos_detalle where id = v_pedido), 4, 'cuatro renglones');
  perform pruebas.igual((select sum(importe) from public.pedido_items where pedido_id = v_pedido), 980.00::numeric, 'importes');

  -- Sólo el personal registra pagos
  v_sql := format('select public.registrar_pago(%s, %L, %L)', 500, 'efectivo', v_pedido);
  perform pruebas.espera_error(v_sql, 'No tienes permiso para hacer esto.');
  perform pruebas.como_anon();
  perform pruebas.espera_rechazo(v_sql);

  perform pruebas.como(v_esp);
  perform pruebas.espera_error(format('select public.registrar_pago(%s, %L, %L)', 0, 'efectivo', v_pedido),
    'El monto debe ser mayor a cero.');
  perform pruebas.espera_error(format('select public.registrar_pago(%s, %L)', 100, 'efectivo'),
    'Indica el pedido o la cita que se está pagando.');
  perform public.registrar_pago(500, 'efectivo', v_pedido);
  perform pruebas.igual((select estado::text || '/' || pagado::text from public.v_pedidos_detalle where id = v_pedido),
                        'pendiente_pago/500.00', 'pago parcial: sigue pendiente');
  perform pruebas.igual((select count(*)::int from public.creditos where pedido_item_id in
                          (select id from public.pedido_items where pedido_id = v_pedido)), 0, 'todavía sin créditos');
  perform public.registrar_pago(480, 'tarjeta', v_pedido, null, 'AUT-123', 50);
  perform pruebas.igual((select estado::text from public.pedidos where id = v_pedido), 'pagado', 'liquidado → pagado');
  perform pruebas.afirma((select pagado_en is not null from public.pedidos where id = v_pedido), 'pagado_en');
  perform pruebas.igual((select propina from public.pagos where pedido_id = v_pedido and metodo = 'tarjeta'), 50.00::numeric(10,2),
                        'la propina se guarda aparte');

  -- Créditos generados
  perform pruebas.igual((select cantidad from public.creditos where cliente_id = pruebas.cliente_de(v_a)
                          and servicio_id = pruebas.servicio('cejas')), 2, 'crédito de cejas × 2');
  perform pruebas.igual((select cantidad::text || '/' || (vence_en - public.hoy_local())::text from public.creditos
                          where cliente_id = pruebas.cliente_de(v_a) and paquete_id = pruebas.paquete('express')),
                        '1/365', 'crédito del paquete combo, vence en 365 días');
  select codigo_regalo, id into v_codigo, v_regalo from public.creditos
   where cliente_id = pruebas.cliente_de(v_a) and servicio_id = pruebas.servicio('axilas');
  perform pruebas.afirma(v_codigo ~ '^[A-HJ-NP-Z2-9]{8}$', 'código de regalo de 8 caracteres sin 0/O/1/I: ' || coalesce(v_codigo, 'null'));
  perform pruebas.igual((select regalo_para from public.creditos where id = v_regalo), 'Mi hermana', 'regalo_para');
  perform pruebas.igual((select stock_actual from public.productos where id = v_crema), v_stock - 1, 'la venta descuenta la crema');
  perform pruebas.igual((select count(*)::int from public.movimientos_inventario where pedido_id = v_pedido and tipo = 'venta'), 1,
                        'movimiento de venta');
  perform public.registrar_pago(10, 'efectivo', v_pedido);
  perform pruebas.igual((select count(*)::int from public.creditos where pedido_item_id in
                          (select id from public.pedido_items where pedido_id = v_pedido)), 3, 'un pago extra no duplica créditos');

  -- La compradora ve sus créditos (el del regalo con su código para compartirlo)
  perform pruebas.como(v_a);
  perform pruebas.igual((select count(*)::int from public.v_creditos), 3, 'la clienta ve sus 3 créditos');
  perform pruebas.igual((select restantes::text || '/' || vigente::text from public.v_creditos where servicio_id = pruebas.servicio('cejas')),
                        '2/true', 'restantes y vigente');
  perform pruebas.igual((select codigo_regalo from public.v_creditos where id = v_regalo), v_codigo, 've el código de su regalo');
  -- No puede usar el regalo para sí misma
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      jsonb_build_array(jsonb_build_object('servicio_id', pruebas.servicio('axilas'), 'credito_id', v_regalo)),
      pruebas.instante(pruebas.proximo_dia(2, 21), '10:00'), 'Compra A', pruebas.firma()),
    'Ese crédito no es válido o ya se usó.');

  -- Canjear (R10): pasa a quien canjea y se limpia el código
  perform pruebas.como(v_b);
  perform pruebas.espera_error('select public.canjear_regalo(''NOEXISTE'')', 'Ese código de regalo no existe o ya se canjeó.');
  perform pruebas.igual(public.canjear_regalo(lower(left(v_codigo, 4)) || '-' || lower(right(v_codigo, 4))), v_regalo,
                        'canjea aunque lo escriba en minúsculas y con guion');
  perform pruebas.igual((select count(*)::int from public.v_creditos where id = v_regalo and codigo_regalo is null), 1,
                        'ahora es de quien lo canjeó y ya no tiene código');
  perform pruebas.espera_error(format('select public.canjear_regalo(%L)', v_codigo), 'Ese código de regalo no existe o ya se canjeó.');
  perform pruebas.como(v_a);
  perform pruebas.igual((select count(*)::int from public.v_creditos where id = v_regalo), 0, 'la compradora ya no lo ve');
  perform pruebas.como_postgres();
  raise notice 'OK - pedido, pago parcial y total, créditos, venta de producto y regalo canjeado';
end $$;

-- Bonos: N sesiones del mismo servicio con su propia vigencia
do $$
declare
  v_a uuid := pruebas.usuario('compra.a@ejemplo.mx');
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_bono uuid;
  r jsonb;
begin
  insert into public.paquetes (slug, nombre, tipo, precio, vigencia_dias) values ('bono-cejas-prueba', 'Bono 6 cejas (prueba)', 'bono', 600, 180)
  returning id into v_bono;
  insert into public.paquete_servicios (paquete_id, servicio_id, cantidad) values (v_bono, pruebas.servicio('cejas'), 6);

  perform pruebas.como(v_a);
  r := public.crear_pedido(jsonb_build_array(jsonb_build_object('tipo', 'paquete', 'id', v_bono, 'cantidad', 2)));
  perform pruebas.igual((r ->> 'total')::numeric, 1200::numeric, 'dos bonos');
  perform pruebas.como(v_esp);
  perform public.registrar_pago(1200, 'transferencia', (r ->> 'id')::uuid);
  perform pruebas.como_postgres();
  perform pruebas.igual((select cr.cantidad::text || '/' || (cr.vence_en - public.hoy_local())::text
                           from public.creditos cr join public.pedido_items pi on pi.id = cr.pedido_item_id
                          where pi.pedido_id = (r ->> 'id')::uuid and cr.servicio_id = pruebas.servicio('cejas')),
                        '12/180', 'bono → crédito del servicio × (2 × 6), vigencia del paquete');
  raise notice 'OK - bonos generan sesiones del servicio';
end $$;

-- Cancelar pedidos
do $$
declare
  v_a uuid := pruebas.usuario('compra.a@ejemplo.mx');
  v_b uuid := pruebas.usuario('compra.b@ejemplo.mx');
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  r jsonb;
  r2 jsonb;
  v_pagado uuid;
begin
  perform pruebas.como(v_a);
  r := public.crear_pedido(jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('axilas'))), 'efectivo');
  r2 := public.crear_pedido(jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('cejas'))), 'efectivo');
  perform pruebas.igual((r ->> 'total')::numeric, 120::numeric, 'cantidad por omisión: 1');

  perform pruebas.como(v_b);
  perform pruebas.espera_error(format('select public.cancelar_pedido(%L)', r ->> 'id'), 'No tienes permiso para hacer esto.');
  perform pruebas.como(v_a);
  perform public.cancelar_pedido((r ->> 'id')::uuid);
  perform pruebas.igual((select estado::text from public.v_pedidos_detalle where id = (r ->> 'id')::uuid), 'cancelado', 'la dueña cancela');
  perform pruebas.espera_error(format('select public.cancelar_pedido(%L)', r ->> 'id'), 'Este pedido ya no se puede cancelar.');

  perform pruebas.como(v_esp);
  perform pruebas.espera_error(format('select public.registrar_pago(%s, %L, %L)', 120, 'efectivo', r ->> 'id'),
    'Ese pedido está cancelado.');
  perform public.cancelar_pedido((r2 ->> 'id')::uuid);
  perform pruebas.igual((select estado::text from public.pedidos where id = (r2 ->> 'id')::uuid), 'cancelado', 'el personal cancela');

  select id into v_pagado from public.pedidos where cliente_id = pruebas.cliente_de(v_a) and estado = 'pagado' limit 1;
  perform pruebas.como(v_a);
  perform pruebas.espera_error(format('select public.cancelar_pedido(%L)', v_pagado), 'Este pedido ya no se puede cancelar.');
  perform pruebas.como_postgres();
  raise notice 'OK - cancelar pedidos pendientes';
end $$;

-- Pago de una cita (cobro en cabina)
do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_cita uuid := (select id from public.citas where estado = 'confirmada' and origen = 'whatsapp' order by inicio limit 1);
begin
  perform pruebas.como(v_esp);
  perform public.registrar_pago(300, 'efectivo', null, v_cita, null, 40);
  perform pruebas.igual((select pagado from public.v_citas_detalle where id = v_cita), 300.00::numeric, 'v_citas_detalle.pagado');
  perform pruebas.espera_error(format('select public.registrar_pago(%s, %L, null, %L)', 100, 'efectivo', gen_random_uuid()),
    'No encontramos esa cita.');
  perform pruebas.como_postgres();
  raise notice 'OK - pago de una cita';
end $$;

-- Validaciones del carrito: cantidades enteras, método de la clienta, textos, pedidos por pagar
do $$
declare
  v_c uuid := pruebas.clienta_lista('compra.c@ejemplo.mx');
  v_cantidad jsonb;
  v_ids uuid[] := '{}';
  r jsonb;
  i int;
begin
  perform pruebas.como(v_c);
  foreach v_cantidad in array array['1.5', '"dos"', '100', 'true']::jsonb[] loop
    perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
        jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('cejas'), 'cantidad', v_cantidad))),
      'Revisa las cantidades.');
  end loop;
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('cejas'), 'cantidad', 0))),
    'La cantidad debe ser al menos 1.');
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', 'no-es-un-id', 'cantidad', 1))),
    'Uno de los productos ya no está disponible para compra en línea.');
  perform pruebas.igual((public.crear_pedido(jsonb_build_array(
                           jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('cejas'), 'cantidad', '2'))) ->> 'total')::numeric,
                        240::numeric, 'una cantidad entera como texto sí vale');

  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb, %L)',
      jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('cejas'))), 'cortesia'),
    'Elige efectivo, tarjeta o transferencia.');
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb, %L)',
      jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('cejas'))), 'mercado_pago'),
    'Elige efectivo, tarjeta o transferencia.');
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('cejas'), 'regalo_para', repeat('R', 121)))),
    'El nombre de quien recibe el regalo es muy largo (máximo 120 caracteres).');
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb, %L, %L)',
      jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('cejas'))), 'efectivo', repeat('n', 1001)),
    'Las notas son muy largas; escríbelas en máximo 1000 caracteres.');

  -- A lo más 5 pedidos por pagar (ya tiene 1)
  for i in 1..4 loop
    r := public.crear_pedido(jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('cejas'))));
    v_ids := v_ids || (r ->> 'id')::uuid;
  end loop;
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('cejas')))),
    'Tienes 5 pedidos por pagar; págalos o cancela alguno antes de hacer otro.');
  perform public.cancelar_pedido(v_ids[1]);
  perform public.crear_pedido(jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', pruebas.servicio('cejas'))));
  perform pruebas.como_postgres();
  raise notice 'OK - carrito: cantidades, método, textos y pedidos por pagar';
end $$;

-- Un bono de varios servicios para regalar lleva UN código y se canjea completo
do $$
declare
  v_d uuid := pruebas.clienta_lista('compra.d@ejemplo.mx');
  v_e uuid := pruebas.clienta_lista('compra.e@ejemplo.mx');
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_bono uuid;
  v_codigo text;
  r jsonb;
begin
  insert into public.paquetes (slug, nombre, tipo, precio) values ('bono-mixto-prueba', 'Bono mixto (prueba)', 'bono', 900)
  returning id into v_bono;
  insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)
  values (v_bono, pruebas.servicio('axilas'), 3), (v_bono, pruebas.servicio('cejas'), 2);

  perform pruebas.como(v_d);
  r := public.crear_pedido(jsonb_build_array(jsonb_build_object('tipo', 'paquete', 'id', v_bono, 'cantidad', 1, 'regalo_para', 'Amiga')));
  perform pruebas.como(v_esp);
  perform public.registrar_pago(900, 'efectivo', (r ->> 'id')::uuid);
  perform pruebas.como_postgres();
  select min(cr.codigo_regalo) into v_codigo
    from public.creditos cr join public.pedido_items pi on pi.id = cr.pedido_item_id
   where pi.pedido_id = (r ->> 'id')::uuid;
  perform pruebas.igual((select count(*)::int || '/' || count(distinct cr.codigo_regalo)::int
                           from public.creditos cr join public.pedido_items pi on pi.id = cr.pedido_item_id
                          where pi.pedido_id = (r ->> 'id')::uuid), '2/1', 'dos créditos con un mismo código');

  perform pruebas.como(v_e);
  perform public.canjear_regalo(v_codigo);
  perform pruebas.igual((select string_agg(nombre || ':' || cantidad, ', ' order by nombre) from public.v_creditos),
                        'Axilas:3, Cejas:2', 'quien canjea recibe el bono completo');
  perform pruebas.espera_error(format('select public.canjear_regalo(%L)', v_codigo), 'Ese código de regalo no existe o ya se canjeó.');
  perform pruebas.como(v_d);
  perform pruebas.igual((select count(*)::int from public.v_creditos), 0, 'a la compradora no le queda parte del regalo');
  perform pruebas.como_postgres();
  raise notice 'OK - regalo de un bono de varios servicios: un código, se canjea completo';
end $$;

rollback;
