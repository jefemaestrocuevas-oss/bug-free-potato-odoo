-- =============================================================================
-- Ópalo · seed_demo.sql — DATOS DE EJEMPLO SÓLO PARA PRUEBAS LOCALES.
--
--   ¡NUNCA se aplica en producción! Las personas, productos, costos, compras, gastos,
--   citas y pagos de aquí son FICTICIOS ("(ejemplo)"). Escribe directo en auth.users,
--   lo cual sólo tiene sentido con el arnés local (local/auth_shim.sql).
--
-- Se aplica una vez, sobre una base recién creada, después de seed.sql
-- (lo hace scripts/probar_local.sh). Las fechas son relativas a "hoy".
--
-- Cuentas (las mismas que muestra el modo demostración del sitio):
--   admin@demo.opalo.mx         socia/o (admin)
--   especialista@demo.opalo.mx  personal, ligada a personal.slug = 'especialista'
--   clienta@demo.opalo.mx       Ana Ejemplo Ruiz (clienta con historial)
--   sofia@demo.opalo.mx         Sofía Prueba López (clienta; ficha con algo por revisar)
--   valeria@demo.opalo.mx       Valeria Muestra (16 años: necesita tutor)
--   + Mariana Mostrador (ejemplo): clienta sin cuenta, la registró el personal
-- =============================================================================

begin;

-- Por si datos/politicas estuviera vacío: políticas de relleno para poder firmar en local.
insert into public.politicas (tipo, version, titulo, contenido_md, activa, vigente_desde)
select t.tipo, 1, initcap(replace(t.tipo::text, '_', ' ')) || ' (ejemplo)',
       'Texto de ejemplo para pruebas locales.', true, now()
  from unnest(enum_range(null::public.tipo_politica)) as t(tipo)
 where not exists (select 1 from public.politicas p where p.tipo = t.tipo);

-- -----------------------------------------------------------------------------
-- Usuarios (tg_nuevo_usuario crea perfil + clienta)
-- -----------------------------------------------------------------------------
-- Cuentas con el correo ya confirmado (como quedan en Supabase con "Confirm email" activo).
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-a000-000000000001', 'admin@demo.opalo.mx', now(),
     '{"nombre": "Socia", "apellidos": "Administración (ejemplo)"}'),
  ('00000000-0000-4000-a000-000000000002', 'especialista@demo.opalo.mx', now(),
     '{"nombre": "Especialista", "apellidos": "Demo (ejemplo)", "telefono": "4420000000"}'),
  ('00000000-0000-4000-a000-000000000011', 'clienta@demo.opalo.mx', now(),
     '{"nombre": "Ana", "apellidos": "Ejemplo Ruiz", "telefono": "4420000001", "fecha_nacimiento": "1994-05-12"}'),
  ('00000000-0000-4000-a000-000000000012', 'sofia@demo.opalo.mx', now(),
     '{"nombre": "Sofía", "apellidos": "Prueba López", "telefono": "4420000002", "fecha_nacimiento": "1988-09-30"}');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('00000000-0000-4000-a000-000000000013', 'valeria@demo.opalo.mx', now(),
        jsonb_build_object('nombre', 'Valeria', 'apellidos', 'Muestra (ejemplo)', 'telefono', '4420000003',
                           'fecha_nacimiento', (public.hoy_local() - interval '16 years 3 months')::date));

update public.perfiles set rol = 'admin'    where id = '00000000-0000-4000-a000-000000000001';
update public.perfiles set rol = 'personal' where id = '00000000-0000-4000-a000-000000000002';
update public.personal set usuario_id = '00000000-0000-4000-a000-000000000002' where slug = 'especialista';

-- Clienta sin cuenta (agendó por WhatsApp)
insert into public.clientes (nombre, apellidos, telefono, como_nos_conocio, notas_internas)
values ('Mariana', 'Mostrador (ejemplo)', '4420000004', 'Recomendación', 'Prefiere citas temprano (ejemplo).');

insert into public.capacitaciones (personal_id, nombre, institucion, tipo, fecha, horas, notas)
select p.id, 'Curso de ejemplo de depilación con cera', 'Institución de ejemplo', 'curso',
       public.hoy_local() - 120, 12, 'Registro de ejemplo para pruebas locales.'
  from public.personal p where p.slug = 'especialista';

-- -----------------------------------------------------------------------------
-- Inventario de ejemplo
-- -----------------------------------------------------------------------------
insert into public.proveedores (id, nombre, contacto, telefono, ciudad, notas) values
  ('00000000-0000-4000-b000-000000000001', 'Distribuidora de ejemplo A', 'Contacto A', '4420000100', 'Querétaro', 'Proveedor ficticio.'),
  ('00000000-0000-4000-b000-000000000002', 'Proveedor de ejemplo B', 'Contacto B', '5500000200', 'Ciudad de México', 'Proveedor ficticio.');

insert into public.productos (id, nombre, marca, categoria, unidad_medida, presentacion, contenido_presentacion,
                              costo_presentacion, stock_minimo, proveedor_id, uso, precio_venta, vendible_en_linea) values
  ('00000000-0000-4000-c000-000000000001', 'Cera tibia (ejemplo)', 'Marca ejemplo', 'cera', 'g', 'Lata 800 g', 800, 480, 400,
     '00000000-0000-4000-b000-000000000001', 'cabina', null, false),
  ('00000000-0000-4000-c000-000000000002', 'Aceite post depilación (ejemplo)', 'Marca ejemplo', 'post', 'ml', 'Botella 500 ml', 500, 250, 100,
     '00000000-0000-4000-b000-000000000001', 'cabina', null, false),
  ('00000000-0000-4000-c000-000000000003', 'Talco preparador (ejemplo)', 'Marca ejemplo', 'preparacion', 'g', 'Bote 400 g', 400, 120, 500,
     '00000000-0000-4000-b000-000000000001', 'cabina', null, false),
  ('00000000-0000-4000-c000-000000000004', 'Guantes de nitrilo (ejemplo)', null, 'desechable', 'pz', 'Caja 100 pz', 100, 180, 50,
     '00000000-0000-4000-b000-000000000002', 'cabina', null, false),
  ('00000000-0000-4000-c000-000000000005', 'Mascarilla hidratante (ejemplo)', 'Marca ejemplo', 'facial', 'g', 'Tarro 250 g', 250, 500, 60,
     '00000000-0000-4000-b000-000000000002', 'cabina', null, false),
  ('00000000-0000-4000-c000-000000000006', 'Crema corporal para llevar (ejemplo)', 'Marca ejemplo', 'venta', 'pz', 'Tubo 200 ml', 1, 180, 2,
     '00000000-0000-4000-b000-000000000002', 'venta', 320, true);

-- Recetas: cuánto se gasta por servicio
insert into public.recetas_servicio (servicio_id, producto_id, cantidad)
select s.id, r.producto::uuid, r.cantidad
  from (values
    ('cejas',             '00000000-0000-4000-c000-000000000001', 10),
    ('cejas',             '00000000-0000-4000-c000-000000000003', 2),
    ('cejas',             '00000000-0000-4000-c000-000000000002', 3),
    ('cejas',             '00000000-0000-4000-c000-000000000004', 2),
    ('axilas',            '00000000-0000-4000-c000-000000000001', 25),
    ('axilas',            '00000000-0000-4000-c000-000000000003', 5),
    ('axilas',            '00000000-0000-4000-c000-000000000002', 5),
    ('axilas',            '00000000-0000-4000-c000-000000000004', 2),
    ('bikini-brasileno',  '00000000-0000-4000-c000-000000000001', 40),
    ('bikini-brasileno',  '00000000-0000-4000-c000-000000000003', 5),
    ('bikini-brasileno',  '00000000-0000-4000-c000-000000000002', 10),
    ('bikini-brasileno',  '00000000-0000-4000-c000-000000000004', 2),
    ('facial-hidratante', '00000000-0000-4000-c000-000000000005', 15),
    ('facial-hidratante', '00000000-0000-4000-c000-000000000004', 2)
  ) as r(servicio, producto, cantidad)
  join public.servicios s on s.slug = r.servicio;

-- Actuamos como la cuenta admin de ejemplo para usar las RPC reales.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000001', true);

select public.registrar_compra(
  '[{"producto_id": "00000000-0000-4000-c000-000000000001", "presentaciones": 3, "costo_presentacion": 480},
    {"producto_id": "00000000-0000-4000-c000-000000000002", "presentaciones": 2, "costo_presentacion": 250},
    {"producto_id": "00000000-0000-4000-c000-000000000003", "presentaciones": 1, "costo_presentacion": 120},
    {"producto_id": "00000000-0000-4000-c000-000000000004", "presentaciones": 2, "costo_presentacion": 180},
    {"producto_id": "00000000-0000-4000-c000-000000000005", "presentaciones": 1, "costo_presentacion": 500},
    {"producto_id": "00000000-0000-4000-c000-000000000006", "presentaciones": 10, "costo_presentacion": 180}]'::jsonb,
  '00000000-0000-4000-b000-000000000001',
  public.hoy_local() - 60,
  'F-EJEMPLO-001',
  'Compra inicial de ejemplo');

-- -----------------------------------------------------------------------------
-- Citas pasadas completadas (insertadas directo: reservar_cita no acepta el pasado)
-- -----------------------------------------------------------------------------
create temporary table demo_citas (n int, email text, servicios text[], dias_atras int, hora time, metodo public.metodo_pago, propina numeric)
  on commit drop;
insert into demo_citas values
  (1, 'clienta@demo.opalo.mx', array['cejas', 'axilas'],      55, '11:00', 'efectivo',      20),
  (2, 'sofia@demo.opalo.mx',   array['bikini-brasileno'],     48, '12:00', 'tarjeta',        0),
  (3, 'clienta@demo.opalo.mx', array['facial-hidratante'],    33, '16:00', 'transferencia', 50),
  (4, 'sofia@demo.opalo.mx',   array['cejas'],                20, '10:00', 'efectivo',       0),
  (5, 'clienta@demo.opalo.mx', array['cejas', 'axilas'],      12, '13:00', 'tarjeta',       30),
  (6, 'sofia@demo.opalo.mx',   array['axilas'],                5, '17:00', 'efectivo',       0);

do $$
declare
  r record;
  v_cliente uuid;
  v_personal uuid := (select id from public.personal where slug = 'especialista');
  v_cabina uuid := (select id from public.cabinas order by orden limit 1);
  v_inicio timestamptz;
  v_cita uuid;
  v_total numeric;
begin
  for r in select * from demo_citas order by n loop
    select c.id into v_cliente from public.clientes c join auth.users u on u.id = c.usuario_id where u.email = r.email;
    v_inicio := ((public.hoy_local() - r.dias_atras) + r.hora) at time zone 'America/Mexico_City';
    select coalesce(sum(s.precio), 0) into v_total from public.servicios s where s.slug = any (r.servicios);

    insert into public.citas (cliente_id, personal_id, cabina_id, inicio, fin, estado, origen, primera_vez, total, creada_por, creado_en)
    values (v_cliente, v_personal, v_cabina, v_inicio, v_inicio + interval '1 hour', 'confirmada',
            (case when r.n % 2 = 0 then 'whatsapp' else 'web' end)::public.origen_cita,
            not exists (select 1 from public.citas c where c.cliente_id = v_cliente),
            v_total, auth.uid(), v_inicio - interval '3 days')
    returning id into v_cita;

    insert into public.cita_items (cita_id, servicio_id, nombre, precio, duracion_min)
    select v_cita, s.id, s.nombre, s.precio, s.duracion_min from public.servicios s where s.slug = any (r.servicios);

    insert into public.consentimientos (cliente_id, cita_id, politica_id, nombre_firmante, firma_svg, firmado_en)
    select v_cliente, v_cita, p.id, (select btrim(nombre || ' ' || coalesce(apellidos, '')) from public.clientes where id = v_cliente),
           '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><path d="M5 40 C 40 5, 80 55, 120 20" fill="none" stroke="black"/></svg>',
           v_inicio - interval '3 days'
      from public.politicas p
     where p.activa and p.tipo in (select s.tipo_consentimiento from public.servicios s where s.slug = any (r.servicios));

    perform public.completar_cita(v_cita);
    perform public.registrar_pago(v_total, r.metodo, null, v_cita, null, r.propina);

    -- fechar consumo y pago en el día de la cita (sólo para que los resultados de ejemplo se vean reales)
    update public.movimientos_inventario set creado_en = v_inicio + interval '1 hour' where cita_id = v_cita;
    update public.pagos set pagado_en = v_inicio + interval '1 hour' where cita_id = v_cita;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Gastos de los últimos 3 meses (ejemplo)
-- -----------------------------------------------------------------------------
insert into public.gastos (categoria_id, concepto, monto, fecha, metodo_pago, proveedor, registrado_por)
select c.id, g.concepto || ' (ejemplo)', g.monto,
       (date_trunc('month', public.hoy_local()) - make_interval(months => m.atras))::date + g.dia - 1,
       g.metodo::public.metodo_pago, g.proveedor, '00000000-0000-4000-a000-000000000001'
  from (values (2), (1), (0)) as m(atras)
  cross join (values
    ('renta',     'Renta del local',          9000.00, 1,  'transferencia', 'Arrendador de ejemplo'),
    ('luz',       'Recibo de luz',             650.00, 15, 'tarjeta',       'CFE'),
    ('agua',      'Recibo de agua',            210.00, 15, 'tarjeta',       null),
    ('internet',  'Internet',                  499.00, 5,  'tarjeta',       'Proveedor de internet'),
    ('publicidad','Anuncios en redes',         800.00, 3,  'tarjeta',       null)
  ) as g(slug, concepto, monto, dia, metodo, proveedor)
  join public.categorias_gasto c on c.slug = g.slug
 where (date_trunc('month', public.hoy_local()) - make_interval(months => m.atras))::date + g.dia - 1 <= public.hoy_local();

-- -----------------------------------------------------------------------------
-- Ventas: un pedido pagado (paquete + regalo) y uno pendiente
-- -----------------------------------------------------------------------------
do $$
declare
  v_pedido jsonb;
begin
  -- Ana compra un Paquete Express y unas cejas para regalar
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000011', true);
  v_pedido := public.crear_pedido(
    jsonb_build_array(
      jsonb_build_object('tipo', 'paquete', 'id', (select id from public.paquetes where slug = 'express'), 'cantidad', 1),
      jsonb_build_object('tipo', 'servicio', 'id', (select id from public.servicios where slug = 'cejas'), 'cantidad', 1,
                         'regalo_para', 'Mamá (ejemplo)')),
    'transferencia', 'Pedido de ejemplo');
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true);
  perform public.registrar_pago((v_pedido ->> 'total')::numeric, 'transferencia', (v_pedido ->> 'id')::uuid, null, 'REF-EJEMPLO');

  -- Sofía aparta una crema para recoger en el spa
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000012', true);
  perform public.crear_pedido(
    jsonb_build_array(jsonb_build_object('tipo', 'producto', 'id', '00000000-0000-4000-c000-000000000006', 'cantidad', 1)),
    'efectivo', null);
end;
$$;

-- -----------------------------------------------------------------------------
-- Citas futuras (con las RPC reales)
-- Las fechas son relativas a hoy y pueden caer antes de la apertura (configuracion.fecha_apertura),
-- cuando las clientas todavía no reservan en línea. Para tener citas de ejemplo, la fecha se quita
-- mientras se crean y se restablece justo después (la base queda con la de seed.sql).
-- -----------------------------------------------------------------------------
create temporary table demo_apertura on commit drop as
  select c.fecha_apertura from public.configuracion c where c.id = 1;
update public.configuracion set fecha_apertura = null where id = 1;

do $$
declare
  v_jueves date := (select d::date from generate_series(public.hoy_local() + 3, public.hoy_local() + 9, interval '1 day') d
                     where extract(dow from d) = 4 limit 1);
  v_viernes date := (select d::date from generate_series(public.hoy_local() + 3, public.hoy_local() + 9, interval '1 day') d
                      where extract(dow from d) = 5 limit 1);
  v_sabado date := (select d::date from generate_series(public.hoy_local() + 3, public.hoy_local() + 9, interval '1 day') d
                     where extract(dow from d) = 6 limit 1);
  v_miercoles date := (select d::date from generate_series(public.hoy_local() + 7, public.hoy_local() + 13, interval '1 day') d
                        where extract(dow from d) = 3 limit 1);
  v_firma text := '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><path d="M5 40 C 40 5, 80 55, 120 20" fill="none" stroke="black"/></svg>';
begin
  -- Ana: acepta políticas, llena ficha y reserva cejas + ampolleta (jueves 12:00)
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000011', true);
  perform public.aceptar_politicas(array(select id from public.politicas
                                          where activa and tipo in ('terminos', 'privacidad', 'cancelacion')), 'seed_demo');
  perform public.guardar_ficha_salud('{"alergias_productos": false}', '{}', null, null, null, true);
  perform public.reservar_cita(
    jsonb_build_array(jsonb_build_object('servicio_id', (select id from public.servicios where slug = 'cejas')),
                      jsonb_build_object('servicio_id', (select id from public.servicios where slug = 'ampolleta-retardadora'))),
    (v_jueves + time '12:00') at time zone 'America/Mexico_City',
    'Ana Ejemplo Ruiz', v_firma, null, 'Primera vez con ampolleta (ejemplo)');

  -- Sofía: su ficha marca embarazo/lactancia → la cita queda pendiente de revisión (viernes 16:00)
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000012', true);
  perform public.aceptar_politicas(array(select id from public.politicas
                                          where activa and tipo in ('terminos', 'privacidad', 'cancelacion')), 'seed_demo');
  perform public.guardar_ficha_salud('{"embarazo_lactancia": true}', '{"embarazo_lactancia": "Lactancia, 6 meses (ejemplo)"}',
                                     null, null, null, true);
  perform public.reservar_cita(
    jsonb_build_array(jsonb_build_object('servicio_id', (select id from public.servicios where slug = 'facial-hidratante'))),
    (v_viernes + time '16:00') at time zone 'America/Mexico_City',
    'Sofía Prueba López', v_firma);

  -- El personal agenda por WhatsApp a Mariana (sin cuenta, todavía sin firma) — sábado 10:00
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000002', true);
  perform public.reservar_cita_staff(
    (select id from public.clientes where apellidos = 'Mostrador (ejemplo)'),
    jsonb_build_array(jsonb_build_object('paquete_id', (select id from public.paquetes where slug = 'express'))),
    (v_sabado + time '10:00') at time zone 'America/Mexico_City',
    null, 'whatsapp', 'Agendó por WhatsApp (ejemplo)');

  -- Bloqueo de agenda de ejemplo: capacitación de la especialista
  insert into public.bloqueos_agenda (personal_id, inicio, fin, motivo)
  select p.id, (v_miercoles + time '15:00') at time zone 'America/Mexico_City',
         (v_miercoles + time '17:00') at time zone 'America/Mexico_City', 'Capacitación (ejemplo)'
    from public.personal p where p.slug = 'especialista';
end;
$$;

update public.configuracion set fecha_apertura = (select d.fecha_apertura from demo_apertura d) where id = 1;

select set_config('request.jwt.claim.sub', '', true);

commit;
