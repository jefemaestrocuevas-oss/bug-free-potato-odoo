-- Pruebas · registrar_compra (R11), ajustes y mermas, stock, v_reposicion (R12), v_costo_servicio
begin;

do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_ana uuid := pruebas.usuario('clienta@demo.opalo.mx');
  v_p uuid;
  v_q uuid;
  v_compra uuid;
  v record;
begin
  -- Producto de prueba creado por el personal (escritura directa permitida, sin stock_actual)
  perform pruebas.como(v_esp);
  insert into public.productos (nombre, categoria, unidad_medida, presentacion, contenido_presentacion, costo_presentacion, stock_minimo)
  values ('Cera de prueba', 'cera', 'g', 'Lata 1 kg', 1000, 100, 500) returning id into v_p;
  insert into public.productos (nombre, categoria, unidad_medida, presentacion, contenido_presentacion, costo_presentacion, stock_minimo)
  values ('Espátulas de prueba', 'desechable', 'pz', 'Bolsa 50 pz', 50, 100, 10) returning id into v_q;
  perform pruebas.espera_rechazo(format('update public.productos set stock_actual = 999 where id = %L', v_p));
  perform pruebas.espera_rechazo(format(
    'insert into public.productos (nombre, contenido_presentacion, stock_actual) values (%L, 1, 50)', 'Truco'));
  update public.productos set precio_venta = null, notas = 'Editado por el personal' where id = v_p;

  -- Compra: 2 latas a 150 → stock 2000 g, costo actualizado a 150 (0.15 por g)
  v_compra := public.registrar_compra(
    jsonb_build_array(jsonb_build_object('producto_id', v_p, 'presentaciones', 2, 'costo_presentacion', 150),
                      jsonb_build_object('producto_id', v_q, 'presentaciones', 1, 'costo_presentacion', 100)),
    '00000000-0000-4000-b000-000000000001', public.hoy_local(), 'F-PRUEBA', 'Compra de prueba');
  select * into v from public.productos where id = v_p;
  perform pruebas.igual(v.stock_actual, 2000.000::numeric(12,3), 'stock = 2 × 1000 g');
  perform pruebas.igual(v.costo_presentacion, 150.00::numeric(10,2), 'costo de la última compra');
  perform pruebas.igual(v.costo_unitario, 0.1500::numeric(12,4), 'costo unitario calculado');
  perform pruebas.igual((select total from public.compras where id = v_compra), 400.00::numeric(10,2), 'total de la compra');
  perform pruebas.igual((select count(*)::int from public.compra_items where compra_id = v_compra), 2, 'renglones de la compra');
  perform pruebas.igual((select cantidad::text || '@' || costo_unitario::text from public.movimientos_inventario
                          where compra_id = v_compra and producto_id = v_p), '2000.000@0.1500', 'movimiento de compra');

  perform pruebas.espera_error('select public.registrar_compra(''[]''::jsonb)', 'Agrega al menos un producto a la compra.');
  perform pruebas.espera_error(format('select public.registrar_compra(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('producto_id', v_p, 'presentaciones', 0, 'costo_presentacion', 1))),
    'Las presentaciones compradas deben ser más de cero.');

  -- Merma (siempre resta) y ajuste
  perform public.ajustar_inventario(v_p, 1700, 'merma', 'Se derramó');
  perform pruebas.igual((select stock_actual from public.productos where id = v_p), 300.000::numeric(12,3), 'merma resta 1700');
  perform public.ajustar_inventario(v_q, -45, 'ajuste', 'Conteo físico');
  perform pruebas.igual((select stock_actual from public.productos where id = v_q), 5.000::numeric(12,3), 'ajuste negativo');
  perform pruebas.espera_error(format('select public.ajustar_inventario(%L, 5, %L)', v_p, 'compra'),
    'Sólo se registran ajustes o mermas.');
  perform pruebas.espera_error(format('select public.ajustar_inventario(%L, 0, %L)', v_p, 'ajuste'),
    'La cantidad no puede ser cero.');

  -- Los movimientos no se editan ni se borran
  perform pruebas.espera_rechazo(format('update public.movimientos_inventario set cantidad = 1 where producto_id = %L', v_p));
  perform pruebas.espera_rechazo(format('delete from public.movimientos_inventario where producto_id = %L', v_p));

  -- Reposición: cera 300 ≤ 500 → faltan 200 g → 1 lata (150); espátulas 5 ≤ 10 → 1 bolsa
  select * into v from public.v_reposicion where id = v_p;
  perform pruebas.afirma(v.id is not null, 'la cera de prueba necesita reposición');
  perform pruebas.igual(v.faltante, 200.000::numeric, 'faltante');
  perform pruebas.igual(v.presentaciones_sugeridas, 1, 'presentaciones sugeridas');
  perform pruebas.igual(v.costo_estimado, 150.00::numeric, 'costo estimado');
  perform pruebas.igual(v.proveedor_nombre, null::text, 'sin proveedor asignado');
  perform public.ajustar_inventario(v_p, -250, 'ajuste');
  perform pruebas.igual((select presentaciones_sugeridas::text || '/' || costo_estimado::text from public.v_reposicion where id = v_p),
                        '1/150.00', '50 g: faltan 450 → sigue 1 lata');
  update public.productos set stock_minimo = 2500 where id = v_p;
  perform pruebas.igual((select presentaciones_sugeridas from public.v_reposicion where id = v_p), 3, 'faltan 2450 g → 3 latas');
  perform pruebas.afirma(exists (select 1 from public.v_reposicion where id = v_q), 'espátulas también');
  perform pruebas.afirma(not exists (select 1 from public.v_reposicion where id = '00000000-0000-4000-c000-000000000001'),
                         'la cera de ejemplo con stock suficiente no aparece');
  perform public.registrar_compra(jsonb_build_array(jsonb_build_object('producto_id', v_q, 'presentaciones', 1, 'costo_presentacion', 100)));
  perform pruebas.afirma(not exists (select 1 from public.v_reposicion where id = v_q), 'tras comprar ya no aparece');

  -- Clientas y visitantes no ven inventario ni pueden comprar
  perform pruebas.como(v_ana);
  perform pruebas.igual(pruebas.filas('public.productos'), 0, 'la clienta no ve productos');
  perform pruebas.igual(pruebas.filas('public.v_reposicion'), 0, 'la clienta no ve reposición');
  perform pruebas.espera_error(format('select public.registrar_compra(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('producto_id', v_p, 'presentaciones', 1, 'costo_presentacion', 1))),
    'No tienes permiso para hacer esto.');
  perform pruebas.espera_error(format('select public.ajustar_inventario(%L, 5, %L)', v_p, 'ajuste'),
    'No tienes permiso para hacer esto.');
  perform pruebas.espera_rechazo(format('insert into public.productos (nombre) values (%L)', 'Producto de clienta'));
  perform pruebas.como_anon();
  perform pruebas.igual(pruebas.filas('public.productos'), 0, 'el visitante no ve productos');
  perform pruebas.igual(pruebas.filas('public.productos_tienda'), 1, 'pero sí la tienda');
  perform pruebas.igual((select hay_stock from public.productos_tienda limit 1), true, 'con stock');
  perform pruebas.como_postgres();
  raise notice 'OK - compras, mermas, ajustes y reposición';
end $$;

-- Costo por servicio y margen
do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_p uuid;
  v_q uuid;
  v record;
begin
  insert into public.productos (nombre, unidad_medida, contenido_presentacion, costo_presentacion)
  values ('Insumo A (prueba)', 'g', 1000, 150) returning id into v_p;     -- 0.15 por g
  insert into public.productos (nombre, unidad_medida, contenido_presentacion, costo_presentacion)
  values ('Insumo B (prueba)', 'pz', 50, 100) returning id into v_q;      -- 2.00 por pieza

  perform pruebas.como(v_esp);
  delete from public.recetas_servicio where servicio_id = pruebas.servicio('axilas');
  insert into public.recetas_servicio (servicio_id, producto_id, cantidad) values
    (pruebas.servicio('axilas'), v_p, 20),     -- 3.00
    (pruebas.servicio('axilas'), v_q, 3);      -- 6.00
  select * into v from public.v_costo_servicio where slug = 'axilas';
  perform pruebas.igual(v.costo_material, 9.00::numeric, 'costo de material de axilas');
  perform pruebas.igual(v.margen, 111.00::numeric, 'margen = 120 − 9');
  perform pruebas.igual(v.margen_pct, 92.5::numeric, 'margen % = 111 / 120');
  perform pruebas.igual(v.tiene_receta, true, 'tiene receta');
  perform pruebas.igual(v.categoria, 'Depilación con cera', 'categoría');

  select * into v from public.v_costo_servicio where slug = 'patillas';
  perform pruebas.igual(v.costo_material::text || '/' || coalesce(v.margen::text, 'null') || '/' || coalesce(v.margen_pct::text, 'null')
                        || '/' || v.tiene_receta::text, '0.00/null/null/false', 'sin receta y precio por confirmar');
  select * into v from public.v_costo_servicio where slug = 'facial-despigmentante';
  perform pruebas.igual(v.margen_pct, 100.0::numeric, 'sin receta: margen 100 %');
  perform pruebas.igual((select count(*)::int from public.v_costo_servicio), 29, 'un renglón por servicio activo');

  update public.recetas_servicio set cantidad = 40 where servicio_id = pruebas.servicio('axilas') and producto_id = v_p;
  perform pruebas.igual((select costo_material from public.v_costo_servicio where slug = 'axilas'), 12.00::numeric, 'la receta se edita');
  perform pruebas.como_postgres();

  perform pruebas.como(pruebas.usuario('clienta@demo.opalo.mx'));
  perform pruebas.igual(pruebas.filas('public.v_costo_servicio'), 0, 'la clienta no ve costos');
  delete from public.recetas_servicio where producto_id = v_p;          -- RLS: no borra nada
  perform pruebas.como_postgres();
  perform pruebas.igual((select count(*)::int from public.recetas_servicio where producto_id = v_p), 1,
                        'la clienta no puede borrar recetas (la receta sigue ahí)');
  raise notice 'OK - v_costo_servicio: costo de material, margen y margen %%';
end $$;

rollback;
