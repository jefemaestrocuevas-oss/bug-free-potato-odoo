-- Pruebas · ESPEC §9 (firma en cabina) y §10 (tienda de jabones y velas: productos, taller,
-- lotes y curado, venta en mostrador, entregas y resultados)
begin;

-- Las reservas usan fechas relativas a hoy, que pueden caer antes de la apertura.
update public.configuracion set fecha_apertura = null;

-- ---------------------------------------------------------------------------
-- §9 · La firma es parte del flujo interno (configuracion.firma_en_linea = false)
-- ---------------------------------------------------------------------------
do $$
declare
  v_a uuid := pruebas.clienta_lista('firma.cabina@ejemplo.mx');
  v_b uuid := pruebas.clienta_lista('firma.linea@ejemplo.mx');
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_martes date := pruebas.proximo_dia(2, 21);
  r jsonb;
  r2 jsonb;
  r3 jsonb;
begin
  perform pruebas.como_anon();
  perform pruebas.igual((select firma_en_linea from public.configuracion), false,
                        'seed.sql: Ópalo firma en cabina (el sitio lo lee en la configuración pública)');

  -- Reservar sin firma: la cita nace sin consentimientos ("falta firma")
  perform pruebas.como(v_a);
  r := public.reservar_cita(pruebas.items('cejas'), pruebas.instante(v_martes, '10:00'));
  perform pruebas.igual(r ->> 'estado', 'confirmada', 'se reserva sin firma');
  perform pruebas.igual((select consentimientos_firmados from public.v_citas_detalle where id = (r ->> 'id')::uuid), 0,
                        'sin consentimientos: falta firma');

  -- Si llega una firma con firma_en_linea = false, se ignora (no se guarda ni se valida)
  r2 := public.reservar_cita(pruebas.items('axilas'), pruebas.instante(v_martes, '11:00'), 'Firma Cabina', pruebas.firma());
  perform pruebas.igual((select count(*)::int from public.consentimientos where cita_id = (r2 ->> 'id')::uuid), 0,
                        'la firma recibida se ignora');
  r3 := public.reservar_cita(pruebas.items('cejas'), pruebas.instante(v_martes, '12:00'), '   ', '<svg><script>x</script></svg>');
  perform pruebas.igual((select count(*)::int from public.consentimientos where cita_id = (r3 ->> 'id')::uuid), 0,
                        'ni siquiera se valida (no se guarda)');
  perform public.cancelar_cita((r3 ->> 'id')::uuid);

  -- La clienta no firma desde su portal
  perform pruebas.espera_error(format('select public.firmar_consentimiento_cita(%L, %L, %L)', r ->> 'id', 'Firma Cabina', pruebas.firma()),
    'La firma se hace en el spa, el día de tu cita.');

  -- R6: no se puede iniciar hasta que se firme en la tablet de la cabina
  perform pruebas.como(v_esp);
  perform pruebas.espera_error(format('select public.cambiar_estado_cita(%L, %L)', r ->> 'id', 'en_curso'),
    'Sin consentimiento firmado no hay servicio: pide a la clienta que firme primero.');
  perform pruebas.espera_error(format('select public.completar_cita(%L)', r ->> 'id'),
    'Sin consentimiento firmado no hay servicio: pide a la clienta que firme primero.');
  perform public.firmar_consentimiento_cita((r ->> 'id')::uuid, 'Firma Cabina', pruebas.firma());
  perform pruebas.igual((select canal from public.consentimientos where cita_id = (r ->> 'id')::uuid), 'cabina', 'canal cabina');
  perform public.cambiar_estado_cita((r ->> 'id')::uuid, 'en_curso');
  perform pruebas.igual((select estado::text from public.citas where id = (r ->> 'id')::uuid), 'en_curso', 'firmada en cabina, inicia');

  -- Con firma_en_linea = true vuelve el comportamiento anterior
  perform pruebas.como_postgres();
  update public.configuracion set firma_en_linea = true;
  perform pruebas.como(v_b);
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz)',
      pruebas.items('cejas'), pruebas.instante(v_martes, '13:00')),
    'Falta tu firma o tu nombre completo.');
  perform pruebas.espera_error(format('select public.reservar_cita(%L::jsonb, %L::timestamptz, %L, %L)',
      pruebas.items('cejas'), pruebas.instante(v_martes, '13:00'), 'Firma Linea', '<svg><script>x</script></svg>'),
    'No pudimos leer tu firma; bórrala y vuelve a firmar.');
  r := public.reservar_cita(pruebas.items('cejas'), pruebas.instante(v_martes, '13:00'), 'Firma Linea', pruebas.firma());
  perform pruebas.igual((select canal from public.consentimientos where cita_id = (r ->> 'id')::uuid), 'reserva_web',
                        'con firma en línea se firma al reservar');
  -- …y la clienta sí firma desde su portal (cita que le agendó el personal)
  perform pruebas.como(v_esp);
  r2 := public.reservar_cita_staff(pruebas.cliente_de(v_b), pruebas.items('axilas'), pruebas.instante(v_martes, '14:00'));
  perform pruebas.como(v_b);
  perform public.firmar_consentimiento_cita((r2 ->> 'id')::uuid, 'Firma Linea', pruebas.firma());
  perform pruebas.igual((select canal from public.consentimientos where cita_id = (r2 ->> 'id')::uuid), 'portal',
                        'con firma en línea, la clienta firma desde su portal');
  perform pruebas.como_postgres();
  update public.configuracion set firma_en_linea = false;
  raise notice 'OK - §9: reservar sin firma, firma ignorada con false, portal sólo con true, R6 en cabina';
end $$;

-- ---------------------------------------------------------------------------
-- §10.1 · Productos: ficha pública, reglas de pieza, slug, color y privilegios
-- ---------------------------------------------------------------------------
do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_ana uuid := pruebas.usuario('clienta@demo.opalo.mx');
  v_id uuid;
  v_slug text;
begin
  perform pruebas.como(v_esp);
  -- Materia prima del taller (categoría y uso nuevos)
  insert into public.productos (nombre, categoria, unidad_medida, presentacion, contenido_presentacion, costo_presentacion, uso)
  values ('Base saponificable (prueba)', 'materia_prima', 'g', 'Cubeta 1 kg', 1000, 500, 'produccion'),
         ('Aroma (prueba)', 'materia_prima', 'ml', 'Frasco 100 ml', 100, 200, 'produccion'),
         ('Frasco (prueba)', 'envase', 'pz', 'Caja 10', 10, 50, 'produccion');
  perform pruebas.igual((select slug from public.productos where nombre = 'Aroma (prueba)'), null::text,
                        'un insumo que no se vende no necesita slug');

  -- Productos terminados con su ficha (el personal escribe directo, ESPEC §6.1)
  insert into public.productos (nombre, categoria, unidad_medida, contenido_presentacion, uso, precio_venta, vendible_en_linea,
                                hecho_en_opalo, destacado, descripcion, aroma, ingredientes, modo_uso, advertencias,
                                contenido_neto, foto_url, color_hex, orden, stock_minimo)
  values ('Jabón (prueba)', 'jabon', 'pz', 1, 'venta', 100, true, true, true, 'Descripción de prueba', 'Lavanda',
          'Sodium Olivate', 'Haz espuma y enjuaga', 'Uso externo', '100 g', null, '#AABBCC', 1, 2)
  returning id, slug into v_id, v_slug;
  perform pruebas.igual(v_slug, 'jabon-prueba', 'sin slug, uno de la tienda lo arma con el nombre');
  insert into public.productos (nombre, categoria, unidad_medida, contenido_presentacion, uso, precio_venta, vendible_en_linea, hecho_en_opalo)
  values ('Jabón sin lote (prueba)', 'jabon', 'pz', 1, 'venta', 90, true, true),
         ('Vela (prueba)', 'vela', 'pz', 1, 'venta', 200, true, true),
         ('Set de regalo (prueba)', 'set', 'pz', 1, 'venta', 300, false, true);
  insert into public.productos (nombre, categoria, uso, precio_venta, vendible_en_linea)
  values ('Jabón (prueba)', 'venta', 'venta', 50, true) returning slug into v_slug;
  perform pruebas.igual(v_slug, 'jabon-prueba-2', 'slug repetido armado con el nombre: -2');
  update public.productos set slug = ' Jabón Ñandú ' where nombre = 'Set de regalo (prueba)' returning slug into v_slug;
  perform pruebas.igual(v_slug, 'jabon-nandu', 'el slug se normaliza (sin acentos ni ñ)');
  perform pruebas.espera_error(format('update public.productos set slug = %L where nombre = %L', 'jabon-prueba', 'Vela (prueba)'),
    'Ya existe otro producto con ese identificador (slug).');
  perform pruebas.espera_error(format('update public.productos set slug = %L where nombre = %L', '¡¡!!', 'Vela (prueba)'),
    'El identificador (slug) del producto debe tener letras o números.');

  -- Jabones, velas y sets: por pieza
  perform pruebas.espera_error('insert into public.productos (nombre, categoria, unidad_medida, contenido_presentacion) values (''Jabón en gramos'', ''jabon'', ''g'', 100)',
    'Los jabones, velas y sets se manejan por pieza: unidad "pz" y contenido 1.');
  perform pruebas.espera_error(format('update public.productos set contenido_presentacion = 6 where id = %L', v_id),
    'Los jabones, velas y sets se manejan por pieza: unidad "pz" y contenido 1.');
  -- Color de la ilustración: #rrggbb
  begin
    update public.productos set color_hex = 'rojo' where id = v_id;
    raise exception 'FALLA: se aceptó un color que no es #rrggbb';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.productos (nombre, categoria, uso) values ('Categoría inventada', 'perfume', 'venta');
    raise exception 'FALLA: se aceptó una categoría fuera de la lista';
  exception when check_violation then
    null;
  end;
  -- stock_actual no se escribe directo
  perform pruebas.espera_rechazo(format('update public.productos set stock_actual = 50 where id = %L', v_id));

  -- La clienta y el visitante no leen ni escriben la tabla: sólo la vista de la tienda
  perform pruebas.como(v_ana);
  perform pruebas.igual(pruebas.filas('public.productos'), 0, 'la clienta no lee productos');
  perform pruebas.espera_rechazo('insert into public.productos (nombre) values (''De la clienta'')');
  perform pruebas.como_anon();
  perform pruebas.espera_rechazo('select nombre, costo_presentacion from public.productos');
  perform pruebas.igual(pruebas.filas('public.productos'), 0, 'el visitante no lee productos');
  perform pruebas.espera_rechazo('select id from public.formulas');
  perform pruebas.espera_rechazo('select id from public.lotes_produccion');
  perform pruebas.como_postgres();

  perform pruebas.igual(
    (select array_agg(c.column_name::text order by c.ordinal_position)
       from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'productos_tienda'),
    array['id', 'slug', 'nombre', 'categoria', 'marca', 'presentacion', 'descripcion', 'aroma', 'ingredientes', 'modo_uso',
          'advertencias', 'contenido_neto', 'foto_url', 'color_hex', 'destacado', 'hecho_en_opalo', 'precio_venta',
          'stock_disponible', 'hay_stock', 'proximo_lote_listo'],
    'productos_tienda: columnas exactas de ESPEC §10.1');
  raise notice 'OK - §10.1 productos: ficha, por pieza, slug, color y privilegios';
end $$;

-- ---------------------------------------------------------------------------
-- §10.2 · Fórmulas: validaciones, reemplazo de insumos y costo con costos actuales
-- ---------------------------------------------------------------------------
do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_ana uuid := pruebas.usuario('clienta@demo.opalo.mx');
  v_base uuid := (select id from public.productos where nombre = 'Base saponificable (prueba)');
  v_aroma uuid := (select id from public.productos where nombre = 'Aroma (prueba)');
  v_frasco uuid := (select id from public.productos where nombre = 'Frasco (prueba)');
  v_jabon uuid := (select id from public.productos where nombre = 'Jabón (prueba)' and categoria = 'jabon');
  v_sinlote uuid := (select id from public.productos where nombre = 'Jabón sin lote (prueba)');
  v_vela uuid := (select id from public.productos where nombre = 'Vela (prueba)');
  v_items jsonb;
  v_f uuid;
  v record;
begin
  v_items := jsonb_build_array(jsonb_build_object('insumo_id', v_base, 'cantidad', 500),
                               jsonb_build_object('insumo_id', v_base, 'cantidad', 300),
                               jsonb_build_object('insumo_id', v_aroma, 'cantidad', '10'));
  perform pruebas.como(v_ana);
  perform pruebas.espera_error(format('select public.guardar_formula(null, %L::jsonb, %L::jsonb)',
      jsonb_build_object('producto_id', v_jabon, 'nombre', 'X', 'rendimiento_piezas', 10), v_items),
    'No tienes permiso para hacer esto.');

  perform pruebas.como(v_esp);
  perform pruebas.espera_error(format('select public.guardar_formula(null, %L::jsonb, %L::jsonb)',
      jsonb_build_object('nombre', 'X', 'rendimiento_piezas', 10), v_items),
    'Elige el producto que se elabora con esta fórmula.');
  perform pruebas.espera_error(format('select public.guardar_formula(null, %L::jsonb, %L::jsonb)',
      jsonb_build_object('producto_id', v_jabon, 'nombre', '  ', 'rendimiento_piezas', 10), v_items),
    'Escribe el nombre de la fórmula.');
  perform pruebas.espera_error(format('select public.guardar_formula(null, %L::jsonb, %L::jsonb)',
      jsonb_build_object('producto_id', v_jabon, 'nombre', 'X', 'rendimiento_piezas', 0), v_items),
    'Revisa el rendimiento: cuántas piezas salen de un lote (más de cero).');
  perform pruebas.espera_error(format('select public.guardar_formula(null, %L::jsonb, %L::jsonb)',
      jsonb_build_object('producto_id', v_jabon, 'nombre', 'X', 'rendimiento_piezas', 10, 'dias_curado', -1), v_items),
    'Revisa los días de curado: días enteros, cero o más.');
  perform pruebas.espera_error(format('select public.guardar_formula(null, %L::jsonb, %L::jsonb)',
      jsonb_build_object('producto_id', v_jabon, 'nombre', 'X', 'rendimiento_piezas', 10), '[]'),
    'Agrega al menos un insumo a la fórmula.');
  perform pruebas.espera_error(format('select public.guardar_formula(null, %L::jsonb, %L::jsonb)',
      jsonb_build_object('producto_id', v_jabon, 'nombre', 'X', 'rendimiento_piezas', 10),
      jsonb_build_array(jsonb_build_object('insumo_id', gen_random_uuid(), 'cantidad', 1))),
    'Uno de los insumos de la fórmula no existe.');
  perform pruebas.espera_error(format('select public.guardar_formula(null, %L::jsonb, %L::jsonb)',
      jsonb_build_object('producto_id', v_jabon, 'nombre', 'X', 'rendimiento_piezas', 10),
      jsonb_build_array(jsonb_build_object('insumo_id', v_base, 'cantidad', 0))),
    'La cantidad de cada insumo debe ser mayor a cero.');
  perform pruebas.espera_error(format('select public.guardar_formula(null, %L::jsonb, %L::jsonb)',
      jsonb_build_object('producto_id', v_jabon, 'nombre', 'X', 'rendimiento_piezas', 10),
      jsonb_build_array(jsonb_build_object('insumo_id', v_jabon, 'cantidad', 1))),
    'Un producto no puede ser insumo de sí mismo: elige la materia prima que lleva.');
  perform pruebas.espera_error(format('select public.guardar_formula(%L, %L::jsonb, %L::jsonb)', gen_random_uuid(),
      jsonb_build_object('nombre', 'X'), v_items),
    'No encontramos esa fórmula.');
  perform pruebas.espera_rechazo(format('insert into public.formulas (producto_id, nombre, rendimiento_piezas) values (%L, %L, 1)',
                                        v_jabon, 'Directa'));

  -- Jabón: 10 piezas, 30 días de curado; base 800 g (500 + 300 se suman) × 0.50 + aroma 10 ml × 2.00 = 420
  v_f := public.guardar_formula(null,
           jsonb_build_object('producto_id', v_jabon, 'nombre', 'Jabón · lote de 10 (prueba)', 'rendimiento_piezas', 10,
                              'dias_curado', 30, 'instrucciones', 'Proceso en frío (prueba)'),
           v_items);
  perform pruebas.igual((select cantidad from public.formula_items where formula_id = v_f and insumo_id = v_base), 800.000::numeric(12,3),
                        'insumos repetidos se suman');
  select * into v from public.v_costo_formulas where formula_id = v_f;
  perform pruebas.igual(v.costo_lote, 420.00::numeric, 'costo del lote = Σ cantidad × costo actual');
  perform pruebas.igual(v.costo_pieza, 42.00::numeric, 'costo por pieza = 420 / 10');
  perform pruebas.igual(v.margen_pieza, 58.00::numeric, 'margen por pieza = 100 − 42');
  perform pruebas.igual(v.margen_pct, 58.0::numeric, 'margen 58 %');
  perform pruebas.igual(v.dias_curado, 30, 'días de curado');
  perform pruebas.igual((select (e ->> 'costo')::numeric from jsonb_array_elements(v.insumos) e where (e ->> 'insumo_id')::uuid = v_base),
                        400.00::numeric, 'insumos: costo de la base');
  perform pruebas.igual((select e ->> 'unidad_medida' from jsonb_array_elements(v.insumos) e where (e ->> 'insumo_id')::uuid = v_aroma),
                        'ml', 'insumos: unidad');

  -- Editar: lo que no viene se queda; los insumos se reemplazan completos
  perform public.guardar_formula(null,
    jsonb_build_object('producto_id', v_sinlote, 'nombre', 'Jabón sin lote (prueba)', 'rendimiento_piezas', 10, 'dias_curado', 30),
    jsonb_build_array(jsonb_build_object('insumo_id', v_base, 'cantidad', 800), jsonb_build_object('insumo_id', v_aroma, 'cantidad', 10)));
  v_f := public.guardar_formula(null,
    jsonb_build_object('producto_id', v_vela, 'nombre', 'Vela (prueba)', 'rendimiento_piezas', 2, 'dias_curado', 7),
    jsonb_build_array(jsonb_build_object('insumo_id', v_aroma, 'cantidad', 4), jsonb_build_object('insumo_id', v_frasco, 'cantidad', 2)));
  perform public.guardar_formula(v_f, jsonb_build_object('dias_curado', 0, 'nombre', 'Vela sin curado (prueba)'),
                                 jsonb_build_array(jsonb_build_object('insumo_id', v_aroma, 'cantidad', 4)));
  perform pruebas.igual((select nombre || '/' || rendimiento_piezas || '/' || dias_curado || '/' || producto_id from public.formulas where id = v_f),
                        'Vela sin curado (prueba)/2.00/0/' || v_vela, 'edita sólo lo que viene');
  perform pruebas.igual((select count(*)::int from public.formula_items where formula_id = v_f), 1, 'insumos reemplazados');
  perform pruebas.como_postgres();
  raise notice 'OK - §10.2 fórmulas: validaciones, reemplazo atómico y costo';
end $$;

-- ---------------------------------------------------------------------------
-- §10.2 · Lotes: consumo de materia prima con costo, escalado, existencias, código y curado
-- ---------------------------------------------------------------------------
do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_ana uuid := pruebas.usuario('clienta@demo.opalo.mx');
  v_base uuid := (select id from public.productos where nombre = 'Base saponificable (prueba)');
  v_aroma uuid := (select id from public.productos where nombre = 'Aroma (prueba)');
  v_jabon uuid := (select id from public.productos where nombre = 'Jabón (prueba)' and categoria = 'jabon');
  v_vela uuid := (select id from public.productos where nombre = 'Vela (prueba)');
  v_f uuid := (select id from public.formulas where nombre = 'Jabón · lote de 10 (prueba)');
  v_fvela uuid := (select id from public.formulas where producto_id = (select id from public.productos where nombre = 'Vela (prueba)'));
  v_fotra uuid := (select id from public.formulas where nombre = 'Jabón sin lote (prueba)');
  v_hoy date := public.hoy_local();
  v_pref text := 'JAB-' || to_char(public.hoy_local(), 'YYMMDD') || '-';
  l1 jsonb;
  l2 jsonb;
  l3 jsonb;
  l4 jsonb;
  v_movs int;
begin
  perform pruebas.como(v_esp);
  perform public.registrar_compra(jsonb_build_array(
    jsonb_build_object('producto_id', v_base, 'presentaciones', 2),
    jsonb_build_object('producto_id', v_aroma, 'presentaciones', 1)));     -- base 2000 g · aroma 100 ml

  -- Validaciones
  perform pruebas.espera_error(format('select public.registrar_lote(%L)', gen_random_uuid()), 'No encontramos ese producto.');
  perform pruebas.espera_error(format('select public.registrar_lote(%L, %L)', v_jabon, v_fotra), 'Esa fórmula es de otro producto.');
  perform pruebas.espera_error(format('select public.registrar_lote(%L)', v_jabon), 'Elige la fórmula o escribe los insumos que usaste.');
  -- Un jabón sin fórmula no tendría curado: se rechaza aunque traiga los insumos y las piezas
  perform pruebas.espera_error(format('select public.registrar_lote(%L, null, 3, null, null, null, %L::jsonb)', v_jabon,
      jsonb_build_array(jsonb_build_object('insumo_id', v_base, 'cantidad', 100))),
    'Los jabones necesitan una fórmula con sus días de curado; elígela o créala primero.');
  perform pruebas.espera_error(format('select public.registrar_lote(%L, null, null, null, null, null, %L::jsonb)', v_vela,
      jsonb_build_array(jsonb_build_object('insumo_id', v_base, 'cantidad', 100))),
    'Escribe cuántas piezas salen del lote.');
  perform pruebas.espera_error(format('select public.registrar_lote(%L, %L, 0)', v_jabon, v_f), 'Revisa las piezas: más de cero.');
  perform pruebas.espera_error(format('select public.registrar_lote(%L, %L, null, %L)', v_jabon, v_f, v_hoy + 1),
    'La fecha de elaboración no puede ser futura.');
  perform pruebas.espera_error(format('select public.registrar_lote(%L, %L, null, %L, %L)', v_jabon, v_f, v_hoy, v_hoy - 1),
    'La caducidad debe ser después de la elaboración.');

  -- Lote completo: 10 piezas, consume 800 g de base y 10 ml de aroma con su costo; queda en curado
  l1 := public.registrar_lote(v_jabon, v_f);
  perform pruebas.igual(l1 ->> 'estado', 'en_curado', 'nace en curado');
  perform pruebas.igual((l1 ->> 'costo_materiales')::numeric, 420::numeric, 'costo de materiales');
  perform pruebas.igual((l1 ->> 'costo_unitario')::numeric, 42::numeric, 'costo por pieza provisional (planeadas)');
  perform pruebas.igual((l1 ->> 'listo_desde')::date, v_hoy + 30, 'listo_desde = elaborado_en + días de curado');
  perform pruebas.igual(l1 ->> 'codigo', v_pref || '01', 'código JAB-AAMMDD-01');
  perform pruebas.igual((select string_agg(pr.nombre || ':' || m.cantidad || '@' || m.costo_unitario, ', ' order by pr.nombre)
                           from public.movimientos_inventario m join public.productos pr on pr.id = m.producto_id
                          where m.lote_id = (l1 ->> 'id')::uuid and m.tipo = 'insumo_produccion'),
                        'Aroma (prueba):-10.000@2.0000, Base saponificable (prueba):-800.000@0.5000',
                        'consumo de materia prima con su costo, ligado al lote');
  perform pruebas.igual((select stock_actual from public.productos where id = v_base), 1200.000::numeric(12,3), 'base: 2000 − 800');
  perform pruebas.igual((select stock_actual from public.productos where id = v_jabon), 0.000::numeric(12,3),
                        'en curado todavía no hay piezas para vender');

  -- Escalado: 5 piezas = media fórmula
  l2 := public.registrar_lote(v_jabon, v_f, 5);
  perform pruebas.igual(l2 ->> 'codigo', v_pref || '02', 'el número del día avanza');
  perform pruebas.igual((l2 ->> 'costo_materiales')::numeric, 210::numeric, 'media fórmula, medio costo');
  perform pruebas.igual((select -sum(cantidad) from public.movimientos_inventario where lote_id = (l2 ->> 'id')::uuid and producto_id = v_base),
                        400.000::numeric, 'base escalada: 800 × 5/10');

  -- Sin existencias: mensaje claro y no se mueve nada
  select count(*) into v_movs from public.movimientos_inventario;
  perform pruebas.espera_error(format('select public.registrar_lote(%L, %L, 20)', v_jabon, v_f),
    'No alcanza el inventario de Base saponificable (prueba): hay 800 g y se necesitan 1600 g.');
  perform pruebas.igual((select count(*)::int from public.movimientos_inventario), v_movs, 'sin existencias no se mueve nada');
  perform pruebas.igual((select stock_actual from public.productos where id = v_base), 800.000::numeric(12,3), 'stock intacto');

  -- Lo que realmente se usó (p_items) manda sobre la fórmula
  l3 := public.registrar_lote(v_jabon, v_f, 4, null, null, 'Usé menos aroma',
          jsonb_build_array(jsonb_build_object('insumo_id', v_base, 'cantidad', 300), jsonb_build_object('insumo_id', v_aroma, 'cantidad', 3)));
  perform pruebas.igual((l3 ->> 'costo_materiales')::numeric, 156::numeric, 'costo de lo usado: 300 × 0.5 + 3 × 2');
  perform pruebas.igual((l3 ->> 'costo_unitario')::numeric, 39::numeric, '156 / 4 piezas');

  -- Sin curado (dias_curado = 0): se libera en el acto
  l4 := public.registrar_lote(v_vela, v_fvela, 1);
  perform pruebas.igual(l4 ->> 'estado', 'disponible', 'sin curado se libera al registrarse');
  perform pruebas.afirma((l4 ->> 'codigo') like 'VEL-%', 'código de vela: VEL-');
  perform pruebas.igual((select stock_actual from public.productos where id = v_vela), 1.000::numeric(12,3), 'la vela ya está en inventario');
  perform pruebas.igual((select costo_presentacion from public.productos where id = v_vela), 4.00::numeric(10,2),
                        'costo de la vela: media fórmula (4 ml × 2) / 1 pieza');

  -- Sólo el personal
  perform pruebas.como(v_ana);
  perform pruebas.espera_error(format('select public.registrar_lote(%L, %L)', v_jabon, v_f), 'No tienes permiso para hacer esto.');
  perform pruebas.espera_error(format('select public.liberar_lote(%L)', l1 ->> 'id'), 'No tienes permiso para hacer esto.');
  perform pruebas.espera_error(format('select public.descartar_lote(%L, %L)', l1 ->> 'id', 'x'), 'No tienes permiso para hacer esto.');
  perform pruebas.igual(pruebas.filas('public.v_lotes'), 0, 'la clienta no ve lotes');
  perform pruebas.como_anon();
  perform pruebas.espera_rechazo(format('select public.registrar_lote(%L, %L)', v_jabon, v_f));
  perform pruebas.como(v_esp);
  perform pruebas.espera_rechazo(format('update public.lotes_produccion set estado = ''disponible'' where id = %L', l1 ->> 'id'));
  perform pruebas.igual((select dias_para_listo from public.v_lotes where id = (l1 ->> 'id')::uuid), 30, 'v_lotes: días para estar listo');
  perform pruebas.igual((select formula_nombre || '/' || categoria from public.v_lotes where id = (l1 ->> 'id')::uuid),
                        'Jabón · lote de 10 (prueba)/jabon', 'v_lotes: fórmula y categoría');
  perform pruebas.como_postgres();
  raise notice 'OK - §10.2 registrar_lote: consumos con costo, escalado, existencias, código y liberación inmediata';
end $$;

-- ---------------------------------------------------------------------------
-- §10.2 · Liberar (curado, forzar, costo real) y descartar (merma del mes)
-- ---------------------------------------------------------------------------
do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
  v_jabon uuid := (select id from public.productos where nombre = 'Jabón (prueba)' and categoria = 'jabon');
  v_pref text := 'JAB-' || to_char(public.hoy_local(), 'YYMMDD') || '-';
  v_l1 uuid := (select id from public.lotes_produccion where codigo = 'JAB-' || to_char(public.hoy_local(), 'YYMMDD') || '-01');
  v_l2 uuid := (select id from public.lotes_produccion where codigo = 'JAB-' || to_char(public.hoy_local(), 'YYMMDD') || '-02');
  v_l3 uuid := (select id from public.lotes_produccion where codigo = 'JAB-' || to_char(public.hoy_local(), 'YYMMDD') || '-03');
  v_mes date := date_trunc('month', public.hoy_local())::date;
  v_msg text := 'Este lote sigue en curado hasta el ' || public.fecha_legible(public.hoy_local() + 30) || '.';
  v_antes record;
  v_despues record;
begin
  perform pruebas.igual(public.fecha_legible('2026-11-12'), '12 de noviembre de 2026', 'fecha legible en español');

  perform pruebas.como(v_esp);
  perform pruebas.espera_error(format('select public.liberar_lote(%L)', v_l1), v_msg);
  perform pruebas.espera_error(format('select public.liberar_lote(%L, 8)', v_l1), v_msg);
  perform pruebas.espera_error(format('select public.liberar_lote(%L, 0, true)', v_l1), 'Revisa las piezas obtenidas: más de cero.');
  perform pruebas.espera_error(format('select public.liberar_lote(%L)', gen_random_uuid()), 'No encontramos ese lote.');

  -- Forzar (antes de terminar el curado): salieron 8 de 10 → costo real 420 / 8 = 52.50
  perform public.liberar_lote(v_l1, 8, true);
  perform pruebas.igual((select estado::text || '/' || piezas_obtenidas || '/' || costo_unitario || '/' || (liberado_en is not null)::text
                           from public.lotes_produccion where id = v_l1),
                        'disponible/8.00/52.5000/true', 'liberado con las piezas obtenidas y el costo real');
  perform pruebas.igual((select cantidad::text || '@' || costo_unitario::text from public.movimientos_inventario
                          where lote_id = v_l1 and tipo = 'produccion'), '8.000@52.5000', 'entran 8 piezas con su costo');
  perform pruebas.igual((select stock_actual from public.productos where id = v_jabon), 8.000::numeric(12,3), '8 jabones en inventario');
  perform pruebas.igual((select costo_presentacion from public.productos where id = v_jabon), 52.50::numeric(10,2),
                        'el costo del producto pasa a ser el del lote');
  perform pruebas.espera_error(format('select public.liberar_lote(%L, null, true)', v_l1), 'Este lote ya se liberó.');
  perform pruebas.espera_error(format('select public.descartar_lote(%L, %L)', v_l1, 'x'), 'Este lote ya se liberó.');

  -- Tienda: hay 8; el próximo lote (el 02, en curado) estará listo en 30 días
  perform pruebas.como_anon();
  perform pruebas.igual((select stock_disponible || '/' || hay_stock::text || '/' || proximo_lote_listo::text
                           from public.productos_tienda where slug = 'jabon-prueba'),
                        '8/true/' || (public.hoy_local() + 30)::text, 'productos_tienda: existencias y próximo lote');
  perform pruebas.igual((select hay_stock::text || '/' || coalesce(proximo_lote_listo::text, 'sin lote') from public.productos_tienda
                          where nombre = 'Jabón sin lote (prueba)'), 'false/sin lote', 'agotado y sin lote en curado');
  perform pruebas.igual((select count(*)::int from public.productos_tienda where nombre = 'Set de regalo (prueba)'), 0,
                        'lo que no se vende en línea no sale en la tienda');

  -- Descartar: con motivo; su costo es merma del mes
  perform pruebas.como(v_admin);
  select * into v_antes from public.v_resultado_mensual where mes = v_mes;
  perform pruebas.como(v_esp);
  perform pruebas.espera_error(format('select public.descartar_lote(%L, %L)', v_l2, '  '), 'Escribe por qué se descarta el lote.');
  perform public.descartar_lote(v_l2, 'Se cortó la mezcla');
  perform pruebas.igual((select estado::text || '/' || motivo_descarte from public.lotes_produccion where id = v_l2),
                        'descartado/Se cortó la mezcla', 'descartado con su motivo');
  perform pruebas.espera_error(format('select public.liberar_lote(%L, null, true)', v_l2), 'Este lote se descartó.');
  perform pruebas.espera_error(format('select public.descartar_lote(%L, %L)', v_l2, 'otra vez'), 'Este lote se descartó.');
  perform pruebas.como(v_admin);
  select * into v_despues from public.v_resultado_mensual where mes = v_mes;
  perform pruebas.igual(v_despues.mermas - coalesce(v_antes.mermas, 0), 210.00::numeric, 'el costo del lote descartado es merma');
  perform pruebas.igual(coalesce(v_antes.utilidad, 0) - v_despues.utilidad, 210.00::numeric, 'y baja la utilidad');
  perform pruebas.igual(v_despues.flujo, v_antes.flujo, 'el flujo no cambia (la materia prima ya estaba en compras)');

  -- El tercero (lo que se usó) sigue en curado: es el próximo lote del jabón
  perform pruebas.como_anon();
  perform pruebas.igual((select proximo_lote_listo from public.productos_tienda where slug = 'jabon-prueba'), public.hoy_local() + 30,
                        'próximo lote: el que sigue en curado');
  perform pruebas.como_postgres();
  raise notice 'OK - §10.2 liberar (curado, forzar, costo real) y descartar (merma)';
end $$;

-- ---------------------------------------------------------------------------
-- §10.3 · crear_pedido valida existencias de productos
-- ---------------------------------------------------------------------------
do $$
declare
  v_c uuid := pruebas.clienta_lista('tienda.prueba@ejemplo.mx');
  v_jabon uuid := (select id from public.productos where nombre = 'Jabón (prueba)' and categoria = 'jabon');
  v_sinlote uuid := (select id from public.productos where nombre = 'Jabón sin lote (prueba)');
  v_vela uuid := (select id from public.productos where nombre = 'Vela (prueba)');
  v_set uuid := (select id from public.productos where nombre = 'Set de regalo (prueba)');
  r jsonb;
begin
  perform pruebas.como(v_c);
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 9))),
    'Por ahora sólo quedan 8 piezas de Jabón (prueba).');
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 5),
                        jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 4, 'regalo_para', 'Mamá'))),
    'Por ahora sólo quedan 8 piezas de Jabón (prueba).');
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_sinlote, 'cantidad', 1))),
    'Por ahora no tenemos Jabón sin lote (prueba).');
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_vela, 'cantidad', 2))),
    'Por ahora sólo queda 1 pieza de Vela (prueba).');
  perform pruebas.espera_error(format('select public.crear_pedido(%L::jsonb)',
      jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_set, 'cantidad', 1))),
    'Uno de los productos ya no está disponible para compra en línea.');
  perform pruebas.igual((select count(*)::int from public.pedidos), 0, 'ningún pedido a medias');

  r := public.crear_pedido(jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 8)), 'transferencia');
  perform pruebas.igual((r ->> 'total')::numeric, 800::numeric, 'con existencias suficientes, sí');
  perform pruebas.igual((select origen || '/' || (entregado_en is null)::text || '/' || tiene_productos::text
                           from public.v_pedidos_detalle where id = (r ->> 'id')::uuid), 'web/true/true', 'pedido en línea');
  perform public.cancelar_pedido((r ->> 'id')::uuid);
  perform pruebas.como_postgres();
  raise notice 'OK - §10.3 crear_pedido valida existencias';
end $$;

-- ---------------------------------------------------------------------------
-- §10.3 · Venta en mostrador y entregas
-- ---------------------------------------------------------------------------
do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
  v_ana uuid := pruebas.usuario('clienta@demo.opalo.mx');
  v_c uuid := pruebas.usuario('tienda.prueba@ejemplo.mx');
  v_mariana uuid := (select id from public.clientes where apellidos = 'Mostrador (ejemplo)');
  v_jabon uuid := (select id from public.productos where nombre = 'Jabón (prueba)' and categoria = 'jabon');
  v_vela uuid := (select id from public.productos where nombre = 'Vela (prueba)');
  v_set uuid := (select id from public.productos where nombre = 'Set de regalo (prueba)');
  v_cejas uuid := pruebas.servicio('cejas');
  v_mes date := date_trunc('month', public.hoy_local())::date;
  v_pedidos int;
  v_ent timestamptz;
  v_antes record;
  v_despues record;
  m1 jsonb;
  m2 jsonb;
  w1 jsonb;
  w2 jsonb;
begin
  perform pruebas.como(v_esp);
  -- Sin clienta, sólo productos: pagado, cobrado, liquidado y entregado en el acto
  m1 := public.venta_mostrador(jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 2)), 'efectivo');
  perform pruebas.igual((m1 ->> 'total')::numeric, 200::numeric, 'total del servidor');
  perform pruebas.afirma((m1 ->> 'folio') ~ '^OP-[0-9]{5}$', 'con folio');
  perform pruebas.igual((select estado::text || '/' || origen || '/' || coalesce(cliente_id::text, 'sin clienta') || '/' || (entregado_en is not null)::text
                           from public.pedidos where id = (m1 ->> 'id')::uuid),
                        'pagado/mostrador/sin clienta/true', 'pedido de mostrador pagado y entregado');
  perform pruebas.igual((select sum(monto)::text || '/' || min(metodo::text) from public.pagos where pedido_id = (m1 ->> 'id')::uuid),
                        '200.00/efectivo', 'pago completo registrado');
  perform pruebas.igual((select stock_actual from public.productos where id = v_jabon), 6.000::numeric(12,3), 'salen 2 jabones');
  perform pruebas.igual((select cantidad::text || '@' || costo_unitario::text from public.movimientos_inventario
                          where pedido_id = (m1 ->> 'id')::uuid and tipo = 'venta'), '-2.000@52.5000', 'venta con el costo de la pieza');
  perform pruebas.igual((select cliente_nombre || '/' || tiene_productos::text || '/' || origen from public.v_pedidos_detalle
                          where id = (m1 ->> 'id')::uuid), 'Venta de mostrador/true/mostrador', 'v_pedidos_detalle: venta de mostrador');

  -- Propina aparte
  m2 := public.venta_mostrador(jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_vela, 'cantidad', 1)), 'tarjeta', null, 20);
  perform pruebas.igual((select propina from public.pagos where pedido_id = (m2 ->> 'id')::uuid), 20.00::numeric(10,2), 'la propina se guarda aparte');

  -- Servicios o paquetes exigen clienta; con clienta generan sus créditos
  perform pruebas.espera_error(format('select public.venta_mostrador(%L::jsonb, %L)',
      jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', v_cejas, 'cantidad', 1)), 'efectivo'),
    'Para vender servicios prepagados elige a la clienta.');
  perform pruebas.espera_error(format('select public.venta_mostrador(%L::jsonb, %L)',
      jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 1),
                        jsonb_build_object('tipo', 'paquete', 'id', pruebas.paquete('express'), 'cantidad', 1)), 'efectivo'),
    'Para vender servicios prepagados elige a la clienta.');
  perform public.ajustar_inventario(v_set, 2, 'ajuste', 'Armamos 2 sets (prueba)');
  m2 := public.venta_mostrador(jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', v_cejas, 'cantidad', 1),
                                                 jsonb_build_object('tipo', 'producto', 'id', v_set, 'cantidad', 1)),
                               'transferencia', v_mariana);
  perform pruebas.igual((m2 ->> 'total')::numeric, 420::numeric, 'cejas 120 + set 300 (en el spa también se vende lo que no está en línea)');
  perform pruebas.igual((select count(*)::int from public.creditos cr join public.pedido_items pi on pi.id = cr.pedido_item_id
                          where pi.pedido_id = (m2 ->> 'id')::uuid and cr.cliente_id = v_mariana and cr.servicio_id = v_cejas), 1,
                        'la clienta recibe su crédito');
  perform pruebas.igual((select cliente_nombre from public.v_pedidos_detalle where id = (m2 ->> 'id')::uuid), 'Mariana Mostrador (ejemplo)',
                        'con clienta, su nombre');
  m2 := public.venta_mostrador(jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', v_cejas, 'cantidad', 1)), 'efectivo', v_mariana);
  perform pruebas.igual((select (entregado_en is null)::text || '/' || tiene_productos::text from public.v_pedidos_detalle
                          where id = (m2 ->> 'id')::uuid), 'true/false', 'sin productos no hay nada que entregar');

  -- Validaciones: existencias (sin dejar nada a medias), clienta, método, propina
  select count(*) into v_pedidos from public.pedidos;
  perform pruebas.espera_error(format('select public.venta_mostrador(%L::jsonb, %L)',
      jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 7)), 'efectivo'),
    'Por ahora sólo quedan 6 piezas de Jabón (prueba).');
  perform pruebas.igual((select count(*)::int from public.pedidos), v_pedidos, 'sin existencias no se crea el pedido');
  perform pruebas.igual((select stock_actual from public.productos where id = v_jabon), 6.000::numeric(12,3), 'ni se mueve el stock');
  perform pruebas.espera_error(format('select public.venta_mostrador(%L::jsonb, %L, %L)',
      jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 1)), 'efectivo', gen_random_uuid()),
    'No encontramos a esa clienta.');
  perform pruebas.espera_error(format('select public.venta_mostrador(%L::jsonb, null)',
      jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 1))),
    'Elige el método de pago.');
  perform pruebas.espera_error(format('select public.venta_mostrador(%L::jsonb, %L, null, -5)',
      jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 1)), 'efectivo'),
    'La propina no puede ser negativa.');
  perform pruebas.espera_error('select public.venta_mostrador(''[]''::jsonb, ''efectivo'')', 'Tu carrito está vacío.');

  -- Cortesía: no es ingreso, pero el jabón sí cuesta (costo de ventas)
  perform pruebas.como(v_admin);
  select * into v_antes from public.v_resultado_mensual where mes = v_mes;
  perform pruebas.como(v_esp);
  perform public.venta_mostrador(jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 1)), 'cortesia');
  perform pruebas.como(v_admin);
  select * into v_despues from public.v_resultado_mensual where mes = v_mes;
  perform pruebas.igual(v_despues.ingresos, v_antes.ingresos, 'la cortesía no es ingreso');
  perform pruebas.igual(v_despues.costo_ventas - v_antes.costo_ventas, 52.50::numeric, 'pero su costo sí cuenta');
  perform pruebas.igual(v_antes.utilidad - v_despues.utilidad, 52.50::numeric, 'y baja la utilidad');

  -- Sólo el personal vende en mostrador
  perform pruebas.como(v_ana);
  perform pruebas.espera_error(format('select public.venta_mostrador(%L::jsonb, %L)',
      jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 1)), 'efectivo'),
    'No tienes permiso para hacer esto.');
  -- …y ninguna clienta ve una venta sin clienta (cliente_id null), ni sus renglones ni sus pagos
  perform pruebas.igual((select count(*)::int from public.v_pedidos_detalle where origen = 'mostrador'), 0, 'la clienta no ve ventas de mostrador');
  perform pruebas.igual((select count(*)::int from public.pedidos where cliente_id is null), 0, 'ni pedidos sin clienta');
  perform pruebas.igual((select count(*)::int from public.pedido_items where pedido_id = (m1 ->> 'id')::uuid), 0, 'ni sus renglones');
  perform pruebas.igual((select count(*)::int from public.pagos where pedido_id = (m1 ->> 'id')::uuid), 0, 'ni sus pagos');
  perform pruebas.como_anon();
  perform pruebas.espera_rechazo(format('select public.venta_mostrador(%L::jsonb, %L)',
      jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 1)), 'efectivo'));
  perform pruebas.igual(pruebas.filas('public.v_pedidos_detalle'), 0, 'el visitante tampoco');

  -- Entregas: un pedido en línea pagado con productos queda "por entregar" hasta marcarlo
  perform pruebas.como(v_c);
  w1 := public.crear_pedido(jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 1)), 'efectivo');
  w2 := public.crear_pedido(jsonb_build_array(jsonb_build_object('tipo', 'servicio', 'id', v_cejas, 'cantidad', 1)), 'efectivo');
  perform pruebas.espera_error(format('select public.marcar_entregado(%L)', w1 ->> 'id'), 'No tienes permiso para hacer esto.');
  perform pruebas.como(v_esp);
  perform pruebas.espera_error(format('select public.marcar_entregado(%L)', w1 ->> 'id'), 'Este pedido todavía no está pagado.');
  perform pruebas.espera_error(format('select public.marcar_entregado(%L)', gen_random_uuid()), 'No encontramos ese pedido.');
  perform public.registrar_pago(100, 'efectivo', (w1 ->> 'id')::uuid);
  perform public.registrar_pago(120, 'efectivo', (w2 ->> 'id')::uuid);
  perform pruebas.igual((select estado::text || '/' || tiene_productos::text || '/' || (entregado_en is null)::text
                           from public.v_pedidos_detalle where id = (w1 ->> 'id')::uuid), 'pagado/true/true', 'pagado y por entregar');
  perform pruebas.espera_error(format('select public.marcar_entregado(%L)', w2 ->> 'id'), 'Este pedido no tiene productos que entregar.');
  perform public.marcar_entregado((w1 ->> 'id')::uuid);
  select entregado_en into v_ent from public.pedidos where id = (w1 ->> 'id')::uuid;
  perform pruebas.afirma(v_ent is not null, 'entregado');
  perform public.marcar_entregado((w1 ->> 'id')::uuid);
  perform pruebas.igual((select entregado_en from public.pedidos where id = (w1 ->> 'id')::uuid), v_ent, 'marcarlo otra vez no cambia la fecha');
  perform pruebas.como(v_c);
  perform pruebas.igual((select (entregado_en is not null)::text from public.v_pedidos_detalle where id = (w1 ->> 'id')::uuid), 'true',
                        'la clienta ve que ya se le entregó');
  perform pruebas.como_postgres();
  raise notice 'OK - §10.3 venta de mostrador (con y sin clienta, cortesía) y entregas';
end $$;

-- ---------------------------------------------------------------------------
-- §10.2 · v_margen_productos y v_costo_formulas con costos actuales
-- ---------------------------------------------------------------------------
do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_base uuid := (select id from public.productos where nombre = 'Base saponificable (prueba)');
  v_jabon uuid := (select id from public.productos where nombre = 'Jabón (prueba)' and categoria = 'jabon');
  v_sinlote uuid := (select id from public.productos where nombre = 'Jabón sin lote (prueba)');
  v record;
begin
  perform pruebas.como(v_esp);
  select * into v from public.v_margen_productos where id = v_jabon;
  perform pruebas.igual(v.costo_unitario, 52.50::numeric, 'costo por pieza (del lote liberado)');
  perform pruebas.igual(v.margen, 47.50::numeric, 'margen = 100 − 52.50');
  perform pruebas.igual(v.margen_pct, 47.5::numeric, 'margen 47.5 %');
  perform pruebas.igual(v.stock_actual, 4.000::numeric(12,3), 'existencias: 8 − 2 − 1 (cortesía) − 1 (en línea)');
  perform pruebas.igual(v.piezas_en_curado, 4.00::numeric, 'piezas en curado (el lote de 4)');
  perform pruebas.igual(v.vendidas_30d, 4.000::numeric, 'vendidas en 30 días: 2 + 1 (cortesía) + 1 (en línea)');
  select * into v from public.v_margen_productos where id = v_sinlote;
  perform pruebas.igual(v.costo_unitario::text || '/' || v.margen::text, '42.00/48.00',
                        'sin lote liberado todavía: costo por pieza de su fórmula');
  perform pruebas.igual((select count(*)::int from public.v_margen_productos where id = v_base), 0, 'la materia prima no sale (uso produccion)');

  -- Con costos actuales: si sube la base, sube el costo de la fórmula
  perform public.registrar_compra(jsonb_build_array(jsonb_build_object('producto_id', v_base, 'presentaciones', 1, 'costo_presentacion', 600)));
  perform pruebas.igual((select costo_lote from public.v_costo_formulas where nombre = 'Jabón · lote de 10 (prueba)'), 500.00::numeric,
                        'costo del lote con el costo actual de la base (800 × 0.60 + 20)');
  perform pruebas.como_postgres();
  raise notice 'OK - v_margen_productos y v_costo_formulas';
end $$;

-- ---------------------------------------------------------------------------
-- §10.4 · v_resultado_mensual con costo de ventas y mermas (mes sin datos de ejemplo)
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
  v_mes date := (date_trunc('month', public.hoy_local()) - interval '7 months')::date;
  v_prod uuid;
  v_pedido uuid;
  v record;
begin
  perform pruebas.igual((select count(*)::int from public.pagos
                          where pagado_en >= pruebas.instante(v_mes, '00:00')
                            and pagado_en < pruebas.instante((v_mes + interval '1 month')::date, '00:00')), 0,
                        'el mes de prueba no tiene datos de ejemplo');
  insert into public.productos (nombre, categoria, unidad_medida, contenido_presentacion, costo_presentacion, uso, precio_venta)
  values ('Jabón resultado (prueba)', 'jabon', 'pz', 1, 10, 'venta', 50) returning id into v_prod;
  insert into public.pedidos (cliente_id, total, estado, origen) values (null, 1000, 'pagado', 'mostrador') returning id into v_pedido;
  insert into public.pagos (pedido_id, monto, metodo, pagado_en) values
    (v_pedido, 1000, 'efectivo', pruebas.instante(v_mes + 3, '12:00')),
    (v_pedido, 150, 'cortesia', pruebas.instante(v_mes + 3, '12:00'));
  insert into public.movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, creado_en) values
    (v_prod, 'consumo', -1, 5, pruebas.instante(v_mes + 3, '12:00')),               -- costo de insumos 5
    (v_prod, 'venta', -3, 10, pruebas.instante(v_mes + 3, '12:00')),                -- costo de ventas 30
    (v_prod, 'merma', -2, 10, pruebas.instante(v_mes + 4, '12:00')),                -- merma 20
    (v_prod, 'produccion', 5, 10, pruebas.instante(v_mes + 4, '12:00')),            -- no es costo ni ingreso
    (v_prod, 'insumo_produccion', -7, 10, pruebas.instante(v_mes + 4, '12:00'));    -- (ya está en compras)
  insert into public.lotes_produccion (producto_id, elaborado_en, piezas_planeadas, costo_materiales, estado, descartado_en, motivo_descarte)
  values (v_prod, v_mes, 10, 100, 'descartado', pruebas.instante(v_mes + 5, '12:00'), 'Prueba'),          -- merma 100
         (v_prod, v_mes, 10, 999, 'descartado', pruebas.instante((v_mes + interval '1 month')::date, '00:30'), 'Otro mes');
  insert into public.gastos (categoria_id, concepto, monto, fecha)
  values ((select id from public.categorias_gasto where slug = 'luz'), 'Luz (prueba)', 200, v_mes + 1);

  perform pruebas.como(v_admin);
  select * into v from public.v_resultado_mensual where mes = v_mes;
  perform pruebas.igual(v.ingresos, 1000.00::numeric, 'ingresos sin cortesías');
  perform pruebas.igual(v.costo_insumos, 5.00::numeric, 'costo de insumos (consumo en cabina)');
  perform pruebas.igual(v.costo_ventas, 30.00::numeric, 'costo de ventas = −Σ venta × costo');
  perform pruebas.igual(v.mermas, 120.00::numeric, 'mermas = 20 de inventario + 100 del lote descartado en el mes');
  perform pruebas.igual(v.gastos, 200.00::numeric, 'gastos');
  perform pruebas.igual(v.utilidad, 645.00::numeric, 'utilidad = 1000 − 5 − 30 − 120 − 200');
  perform pruebas.igual(v.flujo, 800.00::numeric, 'flujo = 1000 − 0 − 200 (no cambia)');
  perform pruebas.igual((select mermas from public.v_resultado_mensual where mes = (v_mes + interval '1 month')::date), 999.00::numeric,
                        'el lote descartado a las 00:30 del día 1 cuenta en el mes siguiente (hora local)');
  perform pruebas.como_postgres();
  raise notice 'OK - §10.4 v_resultado_mensual: costo de ventas, mermas y utilidad';
end $$;

-- ---------------------------------------------------------------------------
-- Pedido en línea por pagar: no aparta piezas; si se agotan antes de pagarlo, el pago no pasa
-- (el inventario nunca queda en negativo). Y nadie sin ficha cancela un pedido sin clienta.
-- ---------------------------------------------------------------------------
do $$
declare
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_c uuid := pruebas.usuario('tienda.prueba@ejemplo.mx');
  v_jabon uuid := (select id from public.productos where nombre = 'Jabón (prueba)' and categoria = 'jabon');
  v_hay numeric;
  v_web jsonb;
  v_sin uuid;
begin
  v_hay := (select stock_actual from public.productos where id = v_jabon);
  perform pruebas.afirma(v_hay >= 2, 'hay jabones para la prueba');
  perform pruebas.como(v_c);
  v_web := public.crear_pedido(jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', 2)), 'efectivo');
  perform pruebas.como(v_esp);
  -- En el mostrador se venden todas menos una
  perform public.venta_mostrador(jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', v_jabon, 'cantidad', floor(v_hay)::int - 1)), 'efectivo');
  perform pruebas.espera_error(format('select public.registrar_pago(%s, %L, %L)', (v_web ->> 'total'), 'efectivo', v_web ->> 'id'),
    'Por ahora sólo queda 1 pieza de Jabón (prueba).');
  perform pruebas.igual((select estado::text from public.pedidos where id = (v_web ->> 'id')::uuid), 'pendiente_pago', 'sigue por pagar');
  perform pruebas.igual((select count(*)::int from public.pagos where pedido_id = (v_web ->> 'id')::uuid), 0, 'sin pago a medias');
  perform pruebas.igual((select stock_actual from public.productos where id = v_jabon), 1.000::numeric(12,3), 'el stock no queda negativo');
  -- Con un anticipo que no completa el total, el pago sí se registra (todavía no se entrega nada)
  perform public.registrar_pago(1, 'efectivo', (v_web ->> 'id')::uuid);
  perform pruebas.igual((select estado::text from public.pedidos where id = (v_web ->> 'id')::uuid), 'pendiente_pago', 'anticipo');

  -- cancelar_pedido: un pedido sin clienta no lo cancela una sesión sin ficha (null no es "distinto" de null)
  perform pruebas.como_postgres();
  insert into public.pedidos (cliente_id, total, estado, origen) values (null, 100, 'pendiente_pago', 'mostrador') returning id into v_sin;
  perform pruebas.como(gen_random_uuid());
  perform pruebas.igual(public.mi_cliente_id(), null::uuid, 'sesión sin ficha');
  perform pruebas.espera_error(format('select public.cancelar_pedido(%L)', v_sin), 'No tienes permiso para hacer esto.');
  perform pruebas.como(v_c);
  perform pruebas.espera_error(format('select public.cancelar_pedido(%L)', v_sin), 'No tienes permiso para hacer esto.');
  perform pruebas.como_postgres();
  perform pruebas.igual((select estado::text from public.pedidos where id = v_sin), 'pendiente_pago', 'sigue igual');
  raise notice 'OK - pedido por pagar sin existencias no se cobra; cancelar_pedido sin clienta sólo el personal';
end $$;

rollback;
