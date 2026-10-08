-- Pruebas · catálogo sembrado, configuración y duración de reserva (R2)
begin;

do $$
begin
  perform pruebas.igual((select count(*)::int from public.servicios), 29, 'servicios sembrados');
  perform pruebas.igual((select count(*)::int from public.paquetes), 4, 'paquetes sembrados');
  perform pruebas.igual((select count(*)::int from public.contraindicaciones), 13, 'contraindicaciones sembradas');
  perform pruebas.igual((select count(*)::int from public.categorias_servicio), 4, 'categorías de servicio');
  perform pruebas.igual((select count(*)::int from public.paquete_servicios), 11, 'servicios dentro de paquetes');
  perform pruebas.igual((select count(*)::int from public.servicios where es_complemento), 4, 'complementos');
  perform pruebas.igual((select count(*)::int from public.servicios where precio is null), 12, 'precios por confirmar (null)');
  perform pruebas.igual((select precio from public.servicios where slug = 'cejas'), 120.00::numeric(10,2), 'precio de cejas');
  perform pruebas.igual((select precio from public.servicios where slug = 'labio-superior'), null::numeric(10,2), 'labio superior sigue por confirmar');
  perform pruebas.igual((select count(*)::int from public.servicios where duracion_min is not null and duracion_min > 0), 0,
                        'ningún servicio declara duración propia (todo cabe en 1 h)');
  perform pruebas.igual((select tipo_consentimiento::text from public.servicios where slug = 'shot-hidratante'),
                        'consentimiento_facial', 'tipo de consentimiento del shot hidratante');
  perform pruebas.igual((select count(*)::int from public.contraindicaciones where accion = 'precaucion'), 1,
                        'una sola contraindicación de precaución');
  raise notice 'OK - catálogo: 29 servicios, 4 paquetes, 13 contraindicaciones';
end $$;

do $$
begin
  perform pruebas.igual((select edad_minima from public.configuracion), 15, 'edad mínima');
  perform pruebas.igual((select horas_cancelacion from public.configuracion), 24, 'horas de cancelación');
  perform pruebas.igual((select telefono_whatsapp from public.configuracion), '4421701466', 'WhatsApp');
  perform pruebas.igual((select zona_horaria from public.configuracion), 'America/Mexico_City', 'zona horaria');
  perform pruebas.igual((select count(*)::int from public.cabinas), 1, 'una cabina (seed idempotente)');
  perform pruebas.igual((select count(*)::int from public.personal where slug = 'especialista'), 1, 'especialista');
  perform pruebas.igual((select count(*)::int from public.horarios), 5, 'horarios sin duplicar al correr el seed dos veces');
  perform pruebas.igual((select count(*)::int from public.categorias_gasto), 15, 'categorías de gasto');
  perform pruebas.igual((select count(*)::int from public.gastos_recurrentes), 6, 'gastos recurrentes sin duplicar');
  perform pruebas.afirma((select bool_and(proximo_vencimiento >= public.hoy_local() - 31) from public.gastos_recurrentes),
                         'los gastos recurrentes tienen próximo vencimiento calculado');
  perform pruebas.afirma((select count(*) from public.politicas where activa) between 3 and 6, 'políticas activas sembradas');
  perform pruebas.afirma((select bool_and(hash_sha256 = encode(sha256(convert_to(contenido_md, 'UTF8')), 'hex'))
                            from public.politicas), 'hash sha256 de cada política');
  perform pruebas.afirma((select bool_and(contenido_md not like '# %') from public.politicas where version = 1),
                         'el título "# …" no se repite dentro del contenido');
  raise notice 'OK - configuración, personal, gastos recurrentes y políticas sembradas';
end $$;

-- R2: duración de la reserva
do $$
declare
  v_express uuid := pruebas.paquete('express');
begin
  perform pruebas.igual(public.duracion_reserva(pruebas.items('cejas')), 60, 'cejas → 60');
  perform pruebas.igual(public.duracion_reserva(pruebas.items('cejas', 'axilas', 'ampolleta-retardadora')), 60,
                        'varios servicios sin duración → 60');
  perform pruebas.igual(public.duracion_reserva(jsonb_build_array(jsonb_build_object('paquete_id', pruebas.paquete('total')))), 60,
                        'paquete total → 60');
  perform pruebas.igual(public.duracion_reserva('[]'::jsonb), 60, 'vacío → mínimo de la sesión');
  perform pruebas.igual(public.duracion_reserva(null), 60, 'null → mínimo de la sesión');

  update public.servicios set duracion_min = 61 where slug = 'cejas';
  perform pruebas.igual(public.duracion_reserva(pruebas.items('cejas')), 120, '61 min redondea hacia arriba a 120');
  update public.servicios set duracion_min = 30 where slug = 'cejas';
  perform pruebas.igual(public.duracion_reserva(pruebas.items('cejas')), 60, '30 min → nunca menos de 60');
  update public.servicios set duracion_min = 45 where slug in ('cejas', 'axilas');
  perform pruebas.igual(public.duracion_reserva(pruebas.items('cejas', 'axilas')), 120, '45 + 45 = 90 → 120');
  perform pruebas.igual(public.duracion_reserva(jsonb_build_array(jsonb_build_object('paquete_id', v_express))), 120,
                        'paquete sin duración propia suma sus servicios (45 + 45 + 0) → 120');
  update public.paquetes set duracion_min = 50 where slug = 'express';
  perform pruebas.igual(public.duracion_reserva(jsonb_build_array(jsonb_build_object('paquete_id', v_express))), 60,
                        'paquete con duración propia (50) → 60');
  update public.configuracion set intervalo_slots_min = 30;
  update public.servicios set duracion_min = 70 where slug = 'cejas';
  perform pruebas.igual(public.duracion_reserva(pruebas.items('cejas')), 90, '70 min con intervalo de 30 → 90');
  -- dejar todo como estaba para los siguientes bloques
  update public.configuracion set intervalo_slots_min = 60;
  update public.servicios set duracion_min = null where slug in ('cejas', 'axilas');
  update public.paquetes set duracion_min = null where slug = 'express';
  raise notice 'OK - duracion_reserva: 60 con datos actuales y redondeo hacia arriba';
end $$;

-- El visitante ve el catálogo público y puede calcular duraciones
do $$
begin
  perform pruebas.como_anon();
  perform pruebas.igual((select count(*)::int from public.servicios), 29, 'anon ve los 29 servicios');
  perform pruebas.igual((select count(*)::int from public.paquetes), 4, 'anon ve los paquetes');
  perform pruebas.igual((select count(*)::int from public.contraindicaciones), 13, 'anon ve las preguntas de la ficha');
  perform pruebas.igual((select nombre_negocio from public.configuracion), 'Ópalo', 'anon lee la configuración');
  perform pruebas.igual(public.duracion_reserva(pruebas.items('cejas')), 60, 'anon calcula la duración');
  perform pruebas.como_postgres();

  update public.servicios set activo = false where slug = 'patillas';
  perform pruebas.como_anon();
  perform pruebas.igual((select count(*)::int from public.servicios), 28, 'anon no ve servicios inactivos');
  perform pruebas.como_postgres();
  raise notice 'OK - el visitante lee el catálogo activo';
end $$;

rollback;
