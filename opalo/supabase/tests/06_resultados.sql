-- Pruebas · v_resultado_mensual, gastos, gastos recurrentes y v_gastos_por_vencer
begin;

-- Resultado de un mes con números conocidos (un mes sin datos de ejemplo: hace 6 meses)
do $$
declare
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_mes date := (date_trunc('month', public.hoy_local()) - interval '6 months')::date;
  v_fin_mes date := (date_trunc('month', public.hoy_local()) - interval '5 months')::date - 1;
  v_cliente uuid := (select id from public.clientes where apellidos = 'Mostrador (ejemplo)');
  v_pedido uuid;
  v_prod uuid;
  v record;
begin
  perform pruebas.igual((select count(*)::int from public.pagos
                          where pagado_en >= pruebas.instante(v_mes, '00:00')
                            and pagado_en < pruebas.instante((v_mes + interval '2 months')::date, '00:00')), 0,
                        'el mes de prueba (y el siguiente) no tienen datos de ejemplo');

  insert into public.pedidos (cliente_id, total, estado) values (v_cliente, 1000, 'pagado') returning id into v_pedido;
  insert into public.pagos (pedido_id, monto, propina, metodo, pagado_en) values
    (v_pedido, 1000, 100, 'efectivo', pruebas.instante(v_mes + 9, '12:00')),
    (v_pedido, 200, 0, 'cortesia', pruebas.instante(v_mes + 9, '12:00')),                 -- la cortesía no es ingreso
    (v_pedido, 50, 0, 'tarjeta', pruebas.instante(v_fin_mes, '23:30')),                    -- 05:30 UTC del mes siguiente
    (v_pedido, 70, 0, 'tarjeta', pruebas.instante((v_fin_mes + 1), '00:30'));              -- ya es el mes siguiente
  insert into public.productos (nombre, unidad_medida, contenido_presentacion, costo_presentacion)
  values ('Insumo resultado (prueba)', 'g', 100, 250) returning id into v_prod;            -- 2.50 por g
  insert into public.movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, creado_en) values
    (v_prod, 'consumo', -10, 2.5, pruebas.instante(v_mes + 4, '13:00')),                   -- costo 25
    (v_prod, 'merma', -3, 2.5, pruebas.instante(v_mes + 4, '13:00'));                      -- la merma no es costo de insumos
  insert into public.compras (fecha, total) values (v_mes + 2, 300);
  insert into public.gastos (categoria_id, concepto, monto, fecha)
  values ((select id from public.categorias_gasto where slug = 'luz'), 'Luz (prueba)', 400, v_mes + 1);
  insert into public.citas (cliente_id, personal_id, cabina_id, inicio, fin, estado) values
    (v_cliente, (select id from public.personal where slug = 'especialista'), (select id from public.cabinas limit 1),
     pruebas.instante(v_mes + 9, '11:00'), pruebas.instante(v_mes + 9, '12:00'), 'completada'),
    (v_cliente, (select id from public.personal where slug = 'especialista'), (select id from public.cabinas limit 1),
     pruebas.instante(v_mes + 10, '11:00'), pruebas.instante(v_mes + 10, '12:00'), 'cancelada');

  perform pruebas.como(v_admin);
  select * into v from public.v_resultado_mensual where mes = v_mes;
  perform pruebas.afirma(v.mes is not null, 'el mes aparece');
  perform pruebas.igual(v.ingresos, 1050.00::numeric, 'ingresos = pagos sin propina ni cortesías, en hora local');
  perform pruebas.igual(v.propinas, 100.00::numeric, 'propinas aparte');
  perform pruebas.igual(v.costo_insumos, 25.00::numeric, 'costo de insumos = −Σ consumo × costo');
  perform pruebas.igual(v.compras, 300.00::numeric, 'compras');
  perform pruebas.igual(v.gastos, 400.00::numeric, 'gastos por periodo');
  perform pruebas.igual(v.costo_ventas, 0.00::numeric, 'sin productos vendidos');
  perform pruebas.igual(v.mermas, 7.50::numeric, 'merma = 3 g × 2.50 (ya no es costo de insumos)');
  perform pruebas.igual(v.utilidad, 617.50::numeric, 'utilidad = 1050 − 25 − 0 − 7.50 − 400');
  perform pruebas.igual(v.flujo, 350.00::numeric, 'flujo = 1050 − 300 − 400');
  perform pruebas.igual(v.citas_completadas, 1, 'citas completadas');
  perform pruebas.igual((select ingresos from public.v_resultado_mensual where mes = (v_mes + interval '1 month')::date),
                        70.00::numeric, 'el pago de las 00:30 cuenta en el mes siguiente');
  perform pruebas.afirma((select count(*) from public.v_resultado_mensual) between 1 and 12, 'como mucho 12 meses');
  perform pruebas.afirma((select bool_and(mes = date_trunc('month', mes)::date) from public.v_resultado_mensual), 'meses al día 1');

  perform pruebas.como(v_esp);
  perform pruebas.igual(pruebas.filas('public.v_resultado_mensual'), 0, 'el personal no ve resultados');
  perform pruebas.como_anon();
  perform pruebas.igual(pruebas.filas('public.v_resultado_mensual'), 0, 'el visitante no ve resultados');
  perform pruebas.como_postgres();
  raise notice 'OK - v_resultado_mensual con números esperados';
end $$;

-- Gastos: periodo y avance de los recurrentes
do $$
declare
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
  v_cat uuid := (select id from public.categorias_gasto where slug = 'renta');
  v_rec uuid;
  v_luz uuid;
  v_gasto uuid;
begin
  perform pruebas.como(v_admin);
  insert into public.gastos_recurrentes (categoria_id, concepto, monto_estimado, frecuencia, dia_pago, proximo_vencimiento)
  values (v_cat, 'Renta (prueba)', 9000, 'mensual', 31, '2027-01-31') returning id into v_rec;
  insert into public.gastos_recurrentes (categoria_id, concepto, frecuencia, dia_pago, proximo_vencimiento)
  values ((select id from public.categorias_gasto where slug = 'luz'), 'Luz (prueba)', 'bimestral', 15, '2026-11-15') returning id into v_luz;

  insert into public.gastos (categoria_id, concepto, monto, fecha, recurrente_id)
  values (v_cat, 'Renta enero', 9000, '2027-01-30', v_rec) returning id into v_gasto;
  perform pruebas.igual((select periodo from public.gastos where id = v_gasto), '2027-01-01'::date, 'periodo = primer día del mes');
  perform pruebas.igual((select proximo_vencimiento from public.gastos_recurrentes where id = v_rec), '2027-02-28'::date,
                        'mensual día 31 → 28 de febrero');
  insert into public.gastos (categoria_id, concepto, monto, fecha, recurrente_id) values (v_cat, 'Renta febrero', 9000, '2027-02-27', v_rec);
  perform pruebas.igual((select proximo_vencimiento from public.gastos_recurrentes where id = v_rec), '2027-03-31'::date,
                        'y luego 31 de marzo');
  insert into public.gastos (categoria_id, concepto, monto, fecha, periodo, recurrente_id)
  values ((select id from public.categorias_gasto where slug = 'luz'), 'Luz sep-oct', 820, '2026-11-14', '2026-10-20', v_luz)
  returning id into v_gasto;
  perform pruebas.igual((select periodo from public.gastos where id = v_gasto), '2026-10-01'::date, 'periodo explícito se normaliza');
  perform pruebas.igual((select proximo_vencimiento from public.gastos_recurrentes where id = v_luz), '2027-01-15'::date,
                        'bimestral avanza 2 meses');
  begin
    insert into public.gastos (categoria_id, concepto, monto) values (v_cat, 'Cero', 0);
    raise exception 'FALLA: se aceptó un gasto de 0';
  exception when check_violation then
    null;
  end;
  perform pruebas.igual((select registrado_por from public.gastos where id = v_gasto), v_admin, 'registrado_por = quien lo captura');
  perform pruebas.como_postgres();

  perform pruebas.igual(public.primer_vencimiento(31, '2026-02-10'), '2026-02-28'::date, 'primer vencimiento con día 31 en febrero');
  perform pruebas.igual(public.primer_vencimiento(5, '2026-10-07'), '2026-11-05'::date, 'si ya pasó, el mes siguiente');
  perform pruebas.igual(public.primer_vencimiento(7, '2026-10-07'), '2026-10-07'::date, 'si es hoy, hoy');
  perform pruebas.igual(public.avanzar_vencimiento('2026-11-30', 'trimestral', 30), '2027-02-28'::date, 'trimestral');
  perform pruebas.igual(public.avanzar_vencimiento('2026-03-15', 'anual', 15), '2027-03-15'::date, 'anual');
  raise notice 'OK - gastos: periodo y avance de los recurrentes';
end $$;

-- Gastos por vencer
do $$
declare
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
  v_esp uuid := pruebas.usuario('especialista@demo.opalo.mx');
  v_cat uuid := (select id from public.categorias_gasto where slug = 'internet');
  v_vencido uuid; v_proximo uuid; v_ok uuid;
begin
  insert into public.gastos_recurrentes (categoria_id, concepto, frecuencia, dia_pago, proximo_vencimiento) values
    (v_cat, 'Vencido (prueba)', 'mensual', 1, public.hoy_local() - 1) returning id into v_vencido;
  insert into public.gastos_recurrentes (categoria_id, concepto, frecuencia, dia_pago, proximo_vencimiento) values
    (v_cat, 'Próximo (prueba)', 'mensual', 1, public.hoy_local() + 7) returning id into v_proximo;
  insert into public.gastos_recurrentes (categoria_id, concepto, frecuencia, dia_pago, proximo_vencimiento) values
    (v_cat, 'Al corriente (prueba)', 'mensual', 1, public.hoy_local() + 8) returning id into v_ok;

  perform pruebas.como(v_admin);
  perform pruebas.igual((select estado || '/' || dias_restantes from public.v_gastos_por_vencer where id = v_vencido), 'vencido/-1', 'vencido');
  perform pruebas.igual((select estado || '/' || dias_restantes from public.v_gastos_por_vencer where id = v_proximo), 'proximo/7', 'próximo (≤ 7 días)');
  perform pruebas.igual((select estado || '/' || dias_restantes from public.v_gastos_por_vencer where id = v_ok), 'al_corriente/8', 'al corriente');
  perform pruebas.igual((select categoria from public.v_gastos_por_vencer where id = v_ok), 'Internet', 'nombre de la categoría');
  update public.gastos_recurrentes set activo = false where id = v_ok;
  perform pruebas.afirma(not exists (select 1 from public.v_gastos_por_vencer where id = v_ok), 'inactivos no aparecen');

  perform pruebas.como(v_esp);
  perform pruebas.igual(pruebas.filas('public.v_gastos_por_vencer'), 0, 'el personal no ve gastos por vencer');
  perform pruebas.como_postgres();
  raise notice 'OK - v_gastos_por_vencer: vencido, próximo y al corriente';
end $$;

-- Un gasto con periodo futuro (renta adelantada) no desplaza a los 12 meses que terminan en el actual
do $$
declare
  v_admin uuid := pruebas.usuario('admin@demo.opalo.mx');
  v_actual date := date_trunc('month', public.hoy_local())::date;
  v_cat uuid := (select id from public.categorias_gasto where slug = 'otros');
begin
  insert into public.gastos (categoria_id, concepto, monto, fecha, periodo)
  select v_cat, 'Gasto del mes (prueba)', 10, public.hoy_local(), (v_actual - make_interval(months => n))::date
    from generate_series(0, 11) n;
  insert into public.gastos (categoria_id, concepto, monto, fecha, periodo)
  values (v_cat, 'Renta adelantada (prueba)', 10, public.hoy_local(), (v_actual + interval '1 month')::date);

  perform pruebas.como(v_admin);
  perform pruebas.igual((select max(mes) from public.v_resultado_mensual), v_actual, 'no incluye meses futuros');
  perform pruebas.igual((select min(mes) from public.v_resultado_mensual), (v_actual - interval '11 months')::date,
                        'conserva el mes de hace 11 meses');
  perform pruebas.igual((select count(*)::int from public.v_resultado_mensual), 12, 'los 12 meses que terminan en el actual');
  perform pruebas.como_postgres();
  raise notice 'OK - resultados: sin meses futuros';
end $$;

rollback;
