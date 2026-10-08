-- =============================================================================
-- Ópalo · seed.sql — CATÁLOGO REAL (generado; no editar a mano)
-- Generado por supabase/scripts/generar_seed.mjs a partir de datos/catalogo.json
-- y datos/politicas/*.md. Idempotente: se puede correr varias veces.
-- Volver a correrlo restablece el catálogo (servicios, paquetes, precios,
-- contraindicaciones) a lo que diga catalogo.json.
-- =============================================================================

begin;

-- Configuración (fila única)
insert into public.configuracion (id, nombre_negocio, lema, telefono_whatsapp, direccion, zona_horaria, duracion_sesion_min, intervalo_slots_min, anticipacion_min_horas, ventana_reserva_dias, horas_cancelacion, tolerancia_retraso_min, edad_minima, edad_mayoria, vigencia_creditos_dias, fecha_apertura)
values (1, 'Ópalo', 'Todo lo que necesitas para consentirte, en un solo lugar', '4421701466', 'Momentum Centro Sur, Torre 2, Int. 207, Querétaro, Qro.', 'America/Mexico_City', 60, 60, 2, 60, 24, 15, 15, 18, 365, '2026-10-31'::date)
on conflict (id) do update set nombre_negocio = excluded.nombre_negocio, lema = excluded.lema, telefono_whatsapp = excluded.telefono_whatsapp, direccion = excluded.direccion, zona_horaria = excluded.zona_horaria, duracion_sesion_min = excluded.duracion_sesion_min, intervalo_slots_min = excluded.intervalo_slots_min, anticipacion_min_horas = excluded.anticipacion_min_horas, ventana_reserva_dias = excluded.ventana_reserva_dias, horas_cancelacion = excluded.horas_cancelacion, tolerancia_retraso_min = excluded.tolerancia_retraso_min, edad_minima = excluded.edad_minima, edad_mayoria = excluded.edad_mayoria, vigencia_creditos_dias = excluded.vigencia_creditos_dias, fecha_apertura = excluded.fecha_apertura;

-- Categorías de servicio
insert into public.categorias_servicio (slug, nombre, descripcion, orden)
values ('depilacion', 'Depilación con cera', 'Cera premium, técnica cuidadosa y protocolos de higiene en cada sesión.', 1)
on conflict (slug) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, orden = excluded.orden;
insert into public.categorias_servicio (slug, nombre, descripcion, orden)
values ('faciales', 'Faciales', 'Limpieza y tratamientos para cada tipo de piel.', 2)
on conflict (slug) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, orden = excluded.orden;
insert into public.categorias_servicio (slug, nombre, descripcion, orden)
values ('corporales', 'Corporales', 'Tratamientos corporales por zona.', 3)
on conflict (slug) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, orden = excluded.orden;
insert into public.categorias_servicio (slug, nombre, descripcion, orden)
values ('complementos', 'Complementos', 'Se agregan a tu servicio para potenciar el resultado.', 4)
on conflict (slug) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, orden = excluded.orden;

-- Servicios
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'cejas', 'Cejas', 120, 'consentimiento_depilacion'::public.tipo_politica, 1)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'labio-superior', 'Labio superior (bigote)', null, 'consentimiento_depilacion'::public.tipo_politica, 2)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'patillas', 'Patillas', null, 'consentimiento_depilacion'::public.tipo_politica, 3)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'barbilla', 'Barbilla', null, 'consentimiento_depilacion'::public.tipo_politica, 4)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'pomulos', 'Pómulos', null, 'consentimiento_depilacion'::public.tipo_politica, 5)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'cara-con-ceja', 'Cara con ceja', 330, 'consentimiento_depilacion'::public.tipo_politica, 6)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'axilas', 'Axilas', 120, 'consentimiento_depilacion'::public.tipo_politica, 7)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'brazos-completos', 'Brazos completos', null, 'consentimiento_depilacion'::public.tipo_politica, 8)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'abdomen', 'Abdomen', null, 'consentimiento_depilacion'::public.tipo_politica, 9)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'media-espalda', 'Media espalda', null, 'consentimiento_depilacion'::public.tipo_politica, 10)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'espalda-completa', 'Espalda completa', null, 'consentimiento_depilacion'::public.tipo_politica, 11)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'cadera', 'Cadera', 500, 'consentimiento_depilacion'::public.tipo_politica, 12)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'bikini-clasico', 'Bikini clásico', 220, 'consentimiento_depilacion'::public.tipo_politica, 13)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'bikini-brasileno', 'Bikini brasileño', 280, 'consentimiento_depilacion'::public.tipo_politica, 14)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'bikini-completo', 'Bikini completo', 330, 'consentimiento_depilacion'::public.tipo_politica, 15)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'muslos', 'Muslos', null, 'consentimiento_depilacion'::public.tipo_politica, 16)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'media-pierna', 'Media pierna', null, 'consentimiento_depilacion'::public.tipo_politica, 17)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'depilacion'), 'pierna-completa', 'Pierna completa', 450, 'consentimiento_depilacion'::public.tipo_politica, 18)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'faciales'), 'limpieza-facial', 'Limpieza facial', null, 'consentimiento_facial'::public.tipo_politica, 1)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'faciales'), 'facial-hidratante', 'Tratamiento hidratante', 750, 'consentimiento_facial'::public.tipo_politica, 2)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'faciales'), 'facial-despigmentante', 'Tratamiento despigmentante', 750, 'consentimiento_facial'::public.tipo_politica, 3)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'faciales'), 'facial-nutritivo', 'Tratamiento nutritivo', 750, 'consentimiento_facial'::public.tipo_politica, 4)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'faciales'), 'facial-reafirmante', 'Tratamiento reafirmante', 750, 'consentimiento_facial'::public.tipo_politica, 5)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'faciales'), 'facial-anti-acne', 'Tratamiento antiacné', 750, 'consentimiento_facial'::public.tipo_politica, 6)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, precio, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'corporales'), 'reductivo-zona', 'Reductivo (por zona)', null, 'consentimiento_corporal'::public.tipo_politica, 1)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, precio = excluded.precio, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, descripcion, duracion_min, precio, es_complemento, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'complementos'), 'shot-hidratante', 'Shot hidratante', 'Se agrega a tu facial.', 0, 180, true, 'consentimiento_facial'::public.tipo_politica, 1)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, descripcion = excluded.descripcion, duracion_min = excluded.duracion_min, precio = excluded.precio, es_complemento = excluded.es_complemento, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, duracion_min, precio, es_complemento, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'complementos'), 'ampolleta-retardadora', 'Ampolleta retardadora de vello', 0, 185, true, 'consentimiento_depilacion'::public.tipo_politica, 2)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, duracion_min = excluded.duracion_min, precio = excluded.precio, es_complemento = excluded.es_complemento, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, duracion_min, precio, es_complemento, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'complementos'), 'ampolleta-despigmentante', 'Ampolleta despigmentante', 0, 235, true, 'consentimiento_facial'::public.tipo_politica, 3)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, duracion_min = excluded.duracion_min, precio = excluded.precio, es_complemento = excluded.es_complemento, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;
insert into public.servicios (categoria_id, slug, nombre, duracion_min, precio, es_complemento, tipo_consentimiento, orden)
values ((select id from public.categorias_servicio where slug = 'complementos'), 'azuleno', 'Azuleno', 0, 285, true, 'consentimiento_facial'::public.tipo_politica, 4)
on conflict (slug) do update set categoria_id = excluded.categoria_id, nombre = excluded.nombre, duracion_min = excluded.duracion_min, precio = excluded.precio, es_complemento = excluded.es_complemento, tipo_consentimiento = excluded.tipo_consentimiento, orden = excluded.orden;

-- Paquetes y sus servicios
insert into public.paquetes (slug, nombre, tipo, descripcion, precio, orden)
values ('express', 'Paquete Express', 'combo'::public.tipo_paquete, 'Ceja, axila y bigote en una sola visita.', 300, 1)
on conflict (slug) do update set nombre = excluded.nombre, tipo = excluded.tipo, descripcion = excluded.descripcion, precio = excluded.precio, orden = excluded.orden;
insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)
select p.id, s.id, 1 from public.paquetes p, public.servicios s
 where p.slug = 'express' and s.slug = 'cejas'
on conflict (paquete_id, servicio_id) do update set cantidad = excluded.cantidad;
insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)
select p.id, s.id, 1 from public.paquetes p, public.servicios s
 where p.slug = 'express' and s.slug = 'axilas'
on conflict (paquete_id, servicio_id) do update set cantidad = excluded.cantidad;
insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)
select p.id, s.id, 1 from public.paquetes p, public.servicios s
 where p.slug = 'express' and s.slug = 'labio-superior'
on conflict (paquete_id, servicio_id) do update set cantidad = excluded.cantidad;
delete from public.paquete_servicios ps using public.paquetes p
 where ps.paquete_id = p.id and p.slug = 'express'
   and ps.servicio_id not in (select s.id from public.servicios s where s.slug in ('cejas', 'axilas', 'labio-superior'));
insert into public.paquetes (slug, nombre, tipo, descripcion, precio, orden)
values ('media', 'Paquete Media', 'combo'::public.tipo_paquete, 'Media pierna, axila y bigote.', 520, 2)
on conflict (slug) do update set nombre = excluded.nombre, tipo = excluded.tipo, descripcion = excluded.descripcion, precio = excluded.precio, orden = excluded.orden;
insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)
select p.id, s.id, 1 from public.paquetes p, public.servicios s
 where p.slug = 'media' and s.slug = 'media-pierna'
on conflict (paquete_id, servicio_id) do update set cantidad = excluded.cantidad;
insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)
select p.id, s.id, 1 from public.paquetes p, public.servicios s
 where p.slug = 'media' and s.slug = 'axilas'
on conflict (paquete_id, servicio_id) do update set cantidad = excluded.cantidad;
insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)
select p.id, s.id, 1 from public.paquetes p, public.servicios s
 where p.slug = 'media' and s.slug = 'labio-superior'
on conflict (paquete_id, servicio_id) do update set cantidad = excluded.cantidad;
delete from public.paquete_servicios ps using public.paquetes p
 where ps.paquete_id = p.id and p.slug = 'media'
   and ps.servicio_id not in (select s.id from public.servicios s where s.slug in ('media-pierna', 'axilas', 'labio-superior'));
insert into public.paquetes (slug, nombre, tipo, descripcion, precio, orden)
values ('rostro', 'Paquete Rostro', 'combo'::public.tipo_paquete, 'Cara con ceja y axila.', 420, 3)
on conflict (slug) do update set nombre = excluded.nombre, tipo = excluded.tipo, descripcion = excluded.descripcion, precio = excluded.precio, orden = excluded.orden;
insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)
select p.id, s.id, 1 from public.paquetes p, public.servicios s
 where p.slug = 'rostro' and s.slug = 'cara-con-ceja'
on conflict (paquete_id, servicio_id) do update set cantidad = excluded.cantidad;
insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)
select p.id, s.id, 1 from public.paquetes p, public.servicios s
 where p.slug = 'rostro' and s.slug = 'axilas'
on conflict (paquete_id, servicio_id) do update set cantidad = excluded.cantidad;
delete from public.paquete_servicios ps using public.paquetes p
 where ps.paquete_id = p.id and p.slug = 'rostro'
   and ps.servicio_id not in (select s.id from public.servicios s where s.slug in ('cara-con-ceja', 'axilas'));
insert into public.paquetes (slug, nombre, tipo, descripcion, precio, orden)
values ('total', 'Paquete Total', 'combo'::public.tipo_paquete, 'Pierna completa, bikini brasileño y axila.', 800, 4)
on conflict (slug) do update set nombre = excluded.nombre, tipo = excluded.tipo, descripcion = excluded.descripcion, precio = excluded.precio, orden = excluded.orden;
insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)
select p.id, s.id, 1 from public.paquetes p, public.servicios s
 where p.slug = 'total' and s.slug = 'pierna-completa'
on conflict (paquete_id, servicio_id) do update set cantidad = excluded.cantidad;
insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)
select p.id, s.id, 1 from public.paquetes p, public.servicios s
 where p.slug = 'total' and s.slug = 'bikini-brasileno'
on conflict (paquete_id, servicio_id) do update set cantidad = excluded.cantidad;
insert into public.paquete_servicios (paquete_id, servicio_id, cantidad)
select p.id, s.id, 1 from public.paquetes p, public.servicios s
 where p.slug = 'total' and s.slug = 'axilas'
on conflict (paquete_id, servicio_id) do update set cantidad = excluded.cantidad;
delete from public.paquete_servicios ps using public.paquetes p
 where ps.paquete_id = p.id and p.slug = 'total'
   and ps.servicio_id not in (select s.id from public.servicios s where s.slug in ('pierna-completa', 'bikini-brasileno', 'axilas'));

-- Contraindicaciones (preguntas de la ficha de salud)
insert into public.contraindicaciones (clave, pregunta, categorias, accion, orden)
values ('embarazo_lactancia', '¿Estás embarazada o en periodo de lactancia?', array['depilacion', 'faciales', 'corporales', 'complementos']::text[], 'revisar'::public.accion_contraindicacion, 1)
on conflict (clave) do update set pregunta = excluded.pregunta, categorias = excluded.categorias, accion = excluded.accion, orden = excluded.orden;
insert into public.contraindicaciones (clave, pregunta, categorias, accion, orden)
values ('isotretinoina', '¿Tomas o tomaste en los últimos 6 meses isotretinoína (Roacután) u otro medicamento para el acné?', array['depilacion', 'faciales', 'complementos']::text[], 'revisar'::public.accion_contraindicacion, 2)
on conflict (clave) do update set pregunta = excluded.pregunta, categorias = excluded.categorias, accion = excluded.accion, orden = excluded.orden;
insert into public.contraindicaciones (clave, pregunta, categorias, accion, orden)
values ('diabetes', '¿Tienes diabetes?', array['depilacion', 'corporales']::text[], 'revisar'::public.accion_contraindicacion, 3)
on conflict (clave) do update set pregunta = excluded.pregunta, categorias = excluded.categorias, accion = excluded.accion, orden = excluded.orden;
insert into public.contraindicaciones (clave, pregunta, categorias, accion, orden)
values ('varices', '¿Tienes várices en la zona a tratar?', array['depilacion', 'corporales']::text[], 'revisar'::public.accion_contraindicacion, 4)
on conflict (clave) do update set pregunta = excluded.pregunta, categorias = excluded.categorias, accion = excluded.accion, orden = excluded.orden;
insert into public.contraindicaciones (clave, pregunta, categorias, accion, orden)
values ('piel_asoleada', '¿Te asoleaste o tienes bronceado reciente en la zona (últimos 3 días)?', array['depilacion', 'faciales']::text[], 'revisar'::public.accion_contraindicacion, 5)
on conflict (clave) do update set pregunta = excluded.pregunta, categorias = excluded.categorias, accion = excluded.accion, orden = excluded.orden;
insert into public.contraindicaciones (clave, pregunta, categorias, accion, orden)
values ('herpes_activo', '¿Tienes herpes activo o alguna herida abierta en la zona?', array['depilacion', 'faciales', 'complementos']::text[], 'revisar'::public.accion_contraindicacion, 6)
on conflict (clave) do update set pregunta = excluded.pregunta, categorias = excluded.categorias, accion = excluded.accion, orden = excluded.orden;
insert into public.contraindicaciones (clave, pregunta, categorias, accion, orden)
values ('anticoagulantes', '¿Tomas anticoagulantes (por ejemplo, para la circulación o el corazón)?', array['depilacion', 'corporales']::text[], 'revisar'::public.accion_contraindicacion, 7)
on conflict (clave) do update set pregunta = excluded.pregunta, categorias = excluded.categorias, accion = excluded.accion, orden = excluded.orden;
insert into public.contraindicaciones (clave, pregunta, categorias, accion, orden)
values ('laser_reciente', '¿Te hiciste láser o luz pulsada en la zona en las últimas 4 semanas?', array['depilacion', 'faciales']::text[], 'revisar'::public.accion_contraindicacion, 8)
on conflict (clave) do update set pregunta = excluded.pregunta, categorias = excluded.categorias, accion = excluded.accion, orden = excluded.orden;
insert into public.contraindicaciones (clave, pregunta, categorias, accion, orden)
values ('peeling_botox_reciente', '¿Te hiciste un peeling, botox o rellenos en el rostro en el último mes?', array['faciales', 'complementos']::text[], 'revisar'::public.accion_contraindicacion, 9)
on conflict (clave) do update set pregunta = excluded.pregunta, categorias = excluded.categorias, accion = excluded.accion, orden = excluded.orden;
insert into public.contraindicaciones (clave, pregunta, categorias, accion, orden)
values ('rosacea_acne_activo', '¿Tienes rosácea o acné inflamado en este momento?', array['faciales', 'complementos']::text[], 'revisar'::public.accion_contraindicacion, 10)
on conflict (clave) do update set pregunta = excluded.pregunta, categorias = excluded.categorias, accion = excluded.accion, orden = excluded.orden;
insert into public.contraindicaciones (clave, pregunta, categorias, accion, orden)
values ('marcapasos_implantes', '¿Tienes marcapasos, implantes metálicos o prótesis en la zona?', array['corporales', 'faciales']::text[], 'revisar'::public.accion_contraindicacion, 11)
on conflict (clave) do update set pregunta = excluded.pregunta, categorias = excluded.categorias, accion = excluded.accion, orden = excluded.orden;
insert into public.contraindicaciones (clave, pregunta, categorias, accion, orden)
values ('epilepsia', '¿Tienes epilepsia?', array['corporales', 'faciales']::text[], 'revisar'::public.accion_contraindicacion, 12)
on conflict (clave) do update set pregunta = excluded.pregunta, categorias = excluded.categorias, accion = excluded.accion, orden = excluded.orden;
insert into public.contraindicaciones (clave, pregunta, categorias, accion, orden)
values ('alergias_productos', '¿Eres alérgica a resinas, miel, colofonia, perfumes o algún cosmético?', array['depilacion', 'faciales', 'corporales', 'complementos']::text[], 'precaucion'::public.accion_contraindicacion, 13)
on conflict (clave) do update set pregunta = excluded.pregunta, categorias = excluded.categorias, accion = excluded.accion, orden = excluded.orden;

-- Cabinas (sólo si no existen)
insert into public.cabinas (nombre, orden)
select 'Cabina 1', 1
 where not exists (select 1 from public.cabinas where nombre = 'Cabina 1');

-- Personal (sólo si no existe: el panel es quien lo edita) y su horario semanal
insert into public.personal (slug, nombre, titulo, bio, orden)
values ('especialista', 'Especialista de Ópalo', 'Fundadora · Cosmetóloga', null, 1)
on conflict (slug) do nothing;
insert into public.horarios (personal_id, dia_semana, hora_inicio, hora_fin)
select p.id, v.dia, v.ini, v.fin
  from public.personal p
  cross join (values
    (2::smallint, '10:00'::time, '19:00'::time),
    (3::smallint, '10:00'::time, '19:00'::time),
    (4::smallint, '10:00'::time, '19:00'::time),
    (5::smallint, '10:00'::time, '19:00'::time),
    (6::smallint, '09:00'::time, '15:00'::time)
  ) as v(dia, ini, fin)
 where p.slug = 'especialista'
   and not exists (select 1 from public.horarios h where h.personal_id = p.id);

-- Categorías de gasto
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('renta', 'Renta del local', true)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('mantenimiento-edificio', 'Cuota de mantenimiento del edificio', true)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('luz', 'Luz (CFE)', true)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('agua', 'Agua', true)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('internet', 'Internet', true)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('telefono', 'Teléfono y WhatsApp', true)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('software', 'Página web, dominio y sistemas', true)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('nomina', 'Pagos al personal', true)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('comisiones', 'Comisiones bancarias y terminal', false)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('capacitacion', 'Cursos y capacitación', false)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('publicidad', 'Publicidad y redes', false)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('limpieza', 'Limpieza y lavandería', false)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('reparaciones', 'Reparaciones y equipo', false)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('impuestos', 'Impuestos y trámites', false)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;
insert into public.categorias_gasto (slug, nombre, es_fijo)
values ('otros', 'Otros', false)
on conflict (slug) do update set nombre = excluded.nombre, es_fijo = excluded.es_fijo;

-- Gastos recurrentes (sólo si no existen; el próximo vencimiento se calcula al correr el seed)
insert into public.gastos_recurrentes (categoria_id, concepto, monto_estimado, frecuencia, dia_pago, proximo_vencimiento, notas)
select c.id, 'Renta mensual del local', null, 'mensual'::public.frecuencia_gasto, 1, public.primer_vencimiento(1), null
  from public.categorias_gasto c
 where c.slug = 'renta'
   and not exists (select 1 from public.gastos_recurrentes gr where gr.concepto = 'Renta mensual del local');
insert into public.gastos_recurrentes (categoria_id, concepto, monto_estimado, frecuencia, dia_pago, proximo_vencimiento, notas)
select c.id, 'Cuota de mantenimiento Momentum', null, 'mensual'::public.frecuencia_gasto, 5, public.primer_vencimiento(5), null
  from public.categorias_gasto c
 where c.slug = 'mantenimiento-edificio'
   and not exists (select 1 from public.gastos_recurrentes gr where gr.concepto = 'Cuota de mantenimiento Momentum');
insert into public.gastos_recurrentes (categoria_id, concepto, monto_estimado, frecuencia, dia_pago, proximo_vencimiento, notas)
select c.id, 'Recibo de luz CFE', null, 'bimestral'::public.frecuencia_gasto, 15, public.primer_vencimiento(15), null
  from public.categorias_gasto c
 where c.slug = 'luz'
   and not exists (select 1 from public.gastos_recurrentes gr where gr.concepto = 'Recibo de luz CFE');
insert into public.gastos_recurrentes (categoria_id, concepto, monto_estimado, frecuencia, dia_pago, proximo_vencimiento, notas)
select c.id, 'Recibo de agua', null, 'mensual'::public.frecuencia_gasto, 15, public.primer_vencimiento(15), null
  from public.categorias_gasto c
 where c.slug = 'agua'
   and not exists (select 1 from public.gastos_recurrentes gr where gr.concepto = 'Recibo de agua');
insert into public.gastos_recurrentes (categoria_id, concepto, monto_estimado, frecuencia, dia_pago, proximo_vencimiento, notas)
select c.id, 'Internet', null, 'mensual'::public.frecuencia_gasto, 10, public.primer_vencimiento(10), null
  from public.categorias_gasto c
 where c.slug = 'internet'
   and not exists (select 1 from public.gastos_recurrentes gr where gr.concepto = 'Internet');
insert into public.gastos_recurrentes (categoria_id, concepto, monto_estimado, frecuencia, dia_pago, proximo_vencimiento, notas)
select c.id, 'Plan del celular de WhatsApp', null, 'mensual'::public.frecuencia_gasto, 10, public.primer_vencimiento(10), null
  from public.categorias_gasto c
 where c.slug = 'telefono'
   and not exists (select 1 from public.gastos_recurrentes gr where gr.concepto = 'Plan del celular de WhatsApp');

-- Políticas: versión 1 activa sólo si aún no existe ninguna de ese tipo
insert into public.politicas (tipo, version, titulo, contenido_md, activa, vigente_desde)
select 'cancelacion'::public.tipo_politica, 1, 'Política de cancelación y puntualidad',
'> **BORRADOR para revisión.** Antes de publicarse, este documento debe revisarlo la especialista de Ópalo y un abogado. Lo que aparece entre corchetes, [ASÍ], es un dato o una decisión pendiente.

Tu cita es una hora reservada sólo para ti, con la cabina y la especialista preparadas para recibirte. Esta política nos ayuda a cuidar tu tiempo, el de otras clientas y el de nuestro equipo.

## 1. Cancelar a tiempo: hasta 24 horas antes

- Puedes cancelar **sin costo** hasta **24 horas antes** de tu cita.
- Hazlo desde **Mi cuenta**, en tus citas, con el botón "Cancelar", o escríbenos por WhatsApp al **442 170 1466**.
- Si reservaste con un servicio prepagado (crédito), **el crédito regresa a tu cuenta** en automático, con la misma fecha de vencimiento.
- Esto aplica también a las citas que quedaron "pendientes de confirmar".

## 2. Si faltan menos de 24 horas

El sitio ya no te deja cancelar, pero **avísanos por WhatsApp** al 442 170 1466: así podemos ofrecer ese espacio a otra clienta.

[POR DEFINIR POR LA SOCIEDAD: qué pasa con una cancelación tardía. Propuesta: la primera vez no tiene costo; a partir de la segunda, si la cita era con crédito, el crédito se considera usado y, si dejaste anticipo, no se devuelve.]

Entendemos que hay emergencias: platícanos y lo vemos caso por caso.

## 3. Retrasos: 15 minutos de tolerancia

- Te esperamos hasta **15 minutos** después de la hora de tu cita. Si vas tarde, avísanos por WhatsApp.
- Para no afectar a la siguiente clienta, tu cita termina a la hora prevista. Si llegas tarde, puede que no alcancemos a hacer todo lo que reservaste sin descuidar la técnica; en ese caso reagendamos lo que falte [POR DEFINIR: cómo se cobra lo que no se realizó].
- Pasados los 15 minutos, la cita puede darse por perdida y se trata como inasistencia. Si hay espacio ese día, te ofrecemos otro horario.

## 4. Inasistencia

Si no llegas y no nos avisas, tu cita se marca como "no asistió".

[POR DEFINIR POR LA SOCIEDAD. Propuesta: si la cita era con crédito, el crédito se considera usado; si dejaste anticipo, no se devuelve; y después de dos inasistencias, para volver a reservar podemos pedirte un anticipo o agendar sólo por WhatsApp.]

## 5. Reagendar

- **Con 24 horas o más de anticipación:** cancela en Mi cuenta y reserva el nuevo horario (tu crédito regresa y lo vuelves a usar), o pídenos el cambio por WhatsApp.
- **Con menos de 24 horas:** escríbenos por WhatsApp; lo intentamos según la disponibilidad y aplica lo del punto 2.
- Reagendar no amplía la vigencia de tus servicios prepagados ni de tus regalos.

## 6. Anticipos [SI SE IMPLEMENTAN]

Hoy **no pedimos anticipo** para reservar. Si más adelante lo pedimos (por ejemplo, para citas agendadas por WhatsApp o para clientas con inasistencias), funcionará así:

- Monto: [POR DEFINIR].
- Se descuenta del total de tu servicio.
- Si cancelas con 24 horas o más, se te devuelve o queda a tu favor [POR DEFINIR].
- En cancelación tardía o inasistencia no se devuelve.

Siempre te lo diremos antes de que pagues.

## 7. Si Ópalo cambia o cancela tu cita

- Si por una causa nuestra (enfermedad, emergencia o un problema en el local) tenemos que mover tu cita, te avisamos por WhatsApp lo antes posible, te damos prioridad para reagendar y respetamos completo tu crédito o anticipo.
- Si al revisar tu ficha de salud la especialista decide que el servicio no es adecuado para ti, cancelamos la cita sin costo.
- Si en cabina encontramos una contraindicación que no estaba en tu ficha (por ejemplo, piel asoleada o una herida en la zona), por tu seguridad podemos no realizar el servicio y reagendarlo [POR DEFINIR: si cuenta como cancelación tardía].

## 8. Clientas menores de edad

Una clienta de 15 a 17 años sólo puede ser atendida si su mamá, papá o tutor la acompaña en cabina. Si llega sin esa compañía no podemos atenderla, y la cita se trata como cancelación tardía [POR DEFINIR].

## 9. Cambios a esta política

Si esta política cambia, publicamos una versión nueva y te pediremos aceptarla en tu siguiente reserva. A tus citas ya reservadas les aplica la versión que aceptaste al reservar [CONFIRMAR CON EL ABOGADO].
',
  true, now()
 where not exists (select 1 from public.politicas where tipo = 'cancelacion'::public.tipo_politica);

insert into public.politicas (tipo, version, titulo, contenido_md, activa, vigente_desde)
select 'consentimiento_corporal'::public.tipo_politica, 1, 'Consentimiento informado: tratamientos corporales',
'> **BORRADOR para revisión.** Antes de publicarse, este documento debe revisarlo la especialista de Ópalo (en lo técnico) y un abogado (en lo legal). Los cuidados son una guía general que la especialista debe confirmar. Lo que aparece entre corchetes, [ASÍ], es un dato o una decisión pendiente.

Aquí te explicamos en qué consisten nuestros tratamientos corporales, sus beneficios, riesgos y cuidados, para que decidas con toda la información. Si tienes dudas, pregúntanos antes de firmar o en cabina antes de empezar. Lo firmas en cada reserva que incluya un tratamiento corporal, como el reductivo por zona.

## 1. En qué consiste

1. Revisamos tu ficha de salud y la zona a tratar. Si estás de acuerdo, tomamos medidas de la zona para dar seguimiento a tu avance. Si eres clienta nueva y la especialista lo considera necesario, hacemos una **prueba de parche** con los productos.
2. Limpiamos la piel de la zona.
3. Realizamos un masaje reductivo manual y aplicamos productos como geles o cremas reductoras, que pueden dar sensación de calor o de frío.
4. Según el protocolo de la especialista, se puede complementar con envolturas o aparatología [POR DEFINIR POR LA ESPECIALISTA: técnicas y equipos que se usarán].

## 2. Beneficios

Puede mejorar la apariencia y la firmeza de la zona y dejar la piel más suave, como complemento de una alimentación balanceada, buena hidratación y actividad física. **No es un tratamiento para bajar de peso** ni sustituye la atención médica o nutricional. Por lo general se necesitan varias sesiones; los resultados varían en cada persona y no se garantizan.

## 3. Riesgos y molestias posibles

Lo más común, que suele pasar en horas o en uno o dos días:

- Enrojecimiento y calor en la zona.
- Sensación de calor, frío, hormigueo o comezón por los productos.
- Sensibilidad o dolor leve, parecido al que se siente después de hacer ejercicio.

Menos frecuente:

- Moretones, sobre todo con piel frágil, várices o anticoagulantes.
- Irritación o reacción alérgica a algún producto.
- Mareo leve al incorporarte después de la sesión.

## 4. Contraindicaciones

Si alguna aplica a ti, márcala en tu ficha. Según el caso, la especialista puede ajustar el tratamiento, pedirte la autorización de tu médico, posponerlo o decidir no realizarlo:

- Embarazo o lactancia.
- Diabetes.
- Várices en la zona.
- Anticoagulantes.
- Marcapasos, implantes metálicos o prótesis en la zona.
- Epilepsia.
- Alergia a resinas, miel, colofonia, perfumes o algún cosmético.

Cuéntanos también si tienes o tuviste trombosis o problemas de circulación, enfermedades del corazón, presión alta, cáncer en tratamiento, hernias, una cirugía reciente en la zona (incluidas liposucción y cesárea), heridas o infecciones en la piel, o si usas DIU (importante si se usa aparatología en el abdomen).

## 5. Antes de tu cita

- Llega con la piel limpia, sin cremas ni aceites en la zona.
- Come algo ligero una o dos horas antes y toma agua.
- Usa ropa cómoda.

## 6. Después: las primeras 24 a 48 horas

- Toma suficiente agua.
- Evita el sol directo en la zona tratada.
- Evita vapor y sauna durante 24 horas [POR CONFIRMAR].
- Mantén la piel hidratada.
- Sigue la rutina en casa que te recomiende la especialista.

Si el enrojecimiento, el dolor o la comezón duran más de 48 horas, o notas moretones grandes, hinchazón o ampollas, escríbenos por WhatsApp al 442 170 1466 y consulta a tu médico.

## 7. Mi declaración y autorización

Al firmar declaro que:

1. Leí y entendí este documento y pude hacer preguntas.
2. Mi ficha de salud es **verdadera y completa**, y avisaré de cualquier cambio antes de empezar.
3. Entiendo que es un servicio cosmético, no médico, que no es un tratamiento para bajar de peso y que los resultados varían.
4. **Autorizo** a Ópalo y a su personal capacitado a realizar el tratamiento corporal que elegí en esta reserva y, si se requiere, la prueba de parche.
5. Puedo pedir que se **detenga** el tratamiento en cualquier momento, y el personal puede suspenderlo si detecta un riesgo para mi salud.
6. Seguiré los cuidados indicados.
7. No se toman fotos ni medidas sin mi permiso expreso; el permiso para fotos se pide aparte.

## 8. Menores de edad

Si tienes entre 15 y 17 años, escribe el nombre de tu mamá, papá o tutor: esa persona autoriza el tratamiento y debe **acompañarte en cabina** toda la sesión, con identificación oficial. Sin su presencia no podemos atenderte. [POR DEFINIR POR EL ABOGADO: si también debe firmar en la tablet de la cabina. POR DEFINIR POR LA ESPECIALISTA: si los tratamientos reductivos se ofrecen a menores.]

## 9. Firma electrónica

Firmas con tu nombre completo y tu firma trazada en la pantalla. Guardamos además la fecha y hora, la versión exacta de este documento con su **huella digital** (un código que prueba que el texto no cambió), la referencia a tu ficha de salud vigente, tu dirección IP y tu tipo de dispositivo. Esta firma electrónica vale igual que tu firma autógrafa [CONFIRMAR CON EL ABOGADO]. Puedes consultar el documento firmado en Mi cuenta.
',
  true, now()
 where not exists (select 1 from public.politicas where tipo = 'consentimiento_corporal'::public.tipo_politica);

insert into public.politicas (tipo, version, titulo, contenido_md, activa, vigente_desde)
select 'consentimiento_depilacion'::public.tipo_politica, 1, 'Consentimiento informado: depilación con cera',
'> **BORRADOR para revisión.** Antes de publicarse, este documento debe revisarlo la especialista de Ópalo (en lo técnico) y un abogado (en lo legal). Los cuidados son una guía general que la especialista debe confirmar. Lo que aparece entre corchetes, [ASÍ], es un dato o una decisión pendiente.

Aquí te explicamos en qué consiste la depilación con cera, sus beneficios, riesgos y cuidados, para que decidas con toda la información. Si tienes dudas, pregúntanos antes de firmar o en cabina antes de empezar. Lo firmas en cada reserva que incluya depilación o la ampolleta retardadora de vello.

## 1. En qué consiste

1. Revisamos tu ficha de salud y la zona a depilar. Si eres clienta nueva y la especialista lo considera necesario, hacemos una **prueba de parche** con la cera en una zona pequeña.
2. Limpiamos y preparamos la piel con productos antisépticos.
3. Aplicamos la cera premium elegida por nuestra especialista [TIPO DE CERA POR CONFIRMAR], a la temperatura adecuada, y la retiramos en sentido contrario al crecimiento del vello. En zonas pequeñas, como las cejas, podemos terminar con pinza.
4. Aplicamos un producto calmante y, si lo elegiste, la **ampolleta retardadora de vello**.

Usamos material desechable cuando aplica y un aplicador nuevo cada vez que se toma cera; la cera que ya tocó la piel no se reutiliza.

## 2. Beneficios

El vello se retira desde la raíz, así que la piel queda libre de vello por más tiempo que con rastrillo (por lo general de 3 a 5 semanas, según tu tipo de vello). Con sesiones constantes, el vello puede salir más fino y escaso. Los resultados varían en cada persona y no se garantizan.

## 3. Riesgos y molestias posibles

Lo más común, que suele pasar en horas o en uno o dos días:

- Dolor o ardor al retirar la cera.
- Enrojecimiento, piel sensible o pequeños puntos rojos.
- Inflamación de los folículos (foliculitis) o granitos.
- Sangrado en puntos aislados, en zonas sensibles.

Menos frecuente:

- Vellos enterrados (encarnados).
- **Piel levantada** o raspada, o quemadura leve por la cera; es más probable con piel asoleada, isotretinoína o cremas con retinol o ácidos.
- Moretones, en especial con piel frágil, várices o anticoagulantes.
- Manchas temporales, sobre todo si te expones al sol.
- Reacción alérgica a la cera (resinas, colofonia, miel o perfume).
- Infección, si la piel no se cuida después.

## 4. Contraindicaciones

Si alguna aplica a ti, márcala en tu ficha. Según el caso, la especialista puede ajustar el servicio, pedirte la autorización de tu médico, posponerlo o decidir no realizarlo:

- Embarazo o lactancia (la piel suele estar más sensible).
- Isotretinoína (Roacután) u otro medicamento para el acné en los últimos 6 meses: alto riesgo de que la piel se levante.
- Diabetes (cicatrización más lenta y más riesgo de infección).
- Várices en la zona.
- Piel asoleada o bronceado reciente en la zona (últimos 3 días).
- Herpes activo, heridas o piel irritada en la zona.
- Anticoagulantes.
- Láser o luz pulsada en la zona en las últimas 4 semanas.
- Alergia a resinas, miel, colofonia, perfumes o algún cosmético.

Cuéntanos también si usas cremas con retinol o ácidos en la zona, o si tienes alguna condición de la piel.

**Cremas anestésicas con lidocaína:** [POR DEFINIR POR LA ESPECIALISTA: si se permiten, quién las aplica, con cuánta anticipación y en qué zonas]. Si te aplicaste alguna, avísanos antes de empezar.

## 5. Antes de tu cita

- Deja crecer el vello unos 5 mm (como un grano de arroz); no te rasures en las 2 a 3 semanas previas.
- No te exfolies ni uses retinol o ácidos en la zona 48 horas antes.
- Evita el sol y las camas de bronceado 48 horas antes.
- Llega con la piel limpia, sin cremas, aceites ni desodorante en la zona.

## 6. Después: las primeras 24 a 48 horas

- Evita el sol y las camas de bronceado; usa protector solar en zonas expuestas.
- Evita albercas, jacuzzi, vapor, sauna y ejercicio intenso.
- No uses desodorante con alcohol o perfume en axilas, ni cremas perfumadas en la zona.
- Usa ropa holgada y de algodón, sobre todo después de bikini o piernas.
- No te rasques ni toques la zona con las manos sucias.
- A partir del tercer día, exfolia suavemente dos veces por semana e hidrata, para prevenir vellos enterrados.

Si la irritación dura más de 48 horas, o notas ampollas, pus, mucho dolor o fiebre, escríbenos por WhatsApp al 442 170 1466 y consulta a tu médico.

**Garantía [PROPUESTA, POR CONFIRMAR]:** retoque sin costo dentro de los 7 días siguientes si quedan vellos en la zona trabajada, y calmante (por ejemplo, azuleno) sin costo si se presenta irritación.

## 7. Mi declaración y autorización

Al firmar declaro que:

1. Leí y entendí este documento y pude hacer preguntas.
2. Mi ficha de salud es **verdadera y completa**, y avisaré de cualquier cambio antes de empezar.
3. Entiendo que es un servicio cosmético, no médico, y que los resultados varían.
4. **Autorizo** a Ópalo y a su personal capacitado a depilar las zonas que elegí en esta reserva y, si se requiere, a hacer la prueba de parche.
5. Puedo pedir que se **detenga** el servicio en cualquier momento, y el personal puede suspenderlo si detecta un riesgo para mi salud.
6. Seguiré los cuidados indicados.
7. No se toman fotos sin mi permiso expreso, que se pide aparte.

## 8. Menores de edad

Si tienes entre 15 y 17 años, escribe el nombre de tu mamá, papá o tutor: esa persona autoriza el servicio y debe **acompañarte en cabina** toda la sesión, con identificación oficial. Sin su presencia no podemos atenderte. [POR DEFINIR POR EL ABOGADO: si también debe firmar en la tablet de la cabina.]

## 9. Firma electrónica

Firmas con tu nombre completo y tu firma trazada en la pantalla. Guardamos además la fecha y hora, la versión exacta de este documento con su **huella digital** (un código que prueba que el texto no cambió), la referencia a tu ficha de salud vigente, tu dirección IP y tu tipo de dispositivo. Esta firma electrónica vale igual que tu firma autógrafa [CONFIRMAR CON EL ABOGADO]. Puedes consultar el documento firmado en Mi cuenta.
',
  true, now()
 where not exists (select 1 from public.politicas where tipo = 'consentimiento_depilacion'::public.tipo_politica);

insert into public.politicas (tipo, version, titulo, contenido_md, activa, vigente_desde)
select 'consentimiento_facial'::public.tipo_politica, 1, 'Consentimiento informado: tratamientos faciales',
'> **BORRADOR para revisión.** Antes de publicarse, este documento debe revisarlo la especialista de Ópalo (en lo técnico) y un abogado (en lo legal). Los cuidados son una guía general que la especialista debe confirmar. Lo que aparece entre corchetes, [ASÍ], es un dato o una decisión pendiente.

Aquí te explicamos en qué consisten nuestros faciales, sus beneficios, riesgos y cuidados, para que decidas con toda la información. Si tienes dudas, pregúntanos antes de firmar o en cabina antes de empezar. Lo firmas en cada reserva que incluya un facial o alguno de sus complementos: shot hidratante, ampolleta despigmentante o azuleno.

## 1. En qué consiste

Cada facial se adapta a tu piel. En general incluye:

1. Revisión de tu ficha de salud y de tu piel. Si eres clienta nueva y la especialista lo considera necesario, hacemos una **prueba de parche** con los productos del tratamiento.
2. Desmaquillado, limpieza, exfoliación suave y, según el caso, vapor.
3. En la limpieza facial y el tratamiento antiacné, **extracción manual** de puntos negros y comedones, con material desechable.
4. Aplicación de los activos del tratamiento que elegiste (hidratante, despigmentante, nutritivo, reafirmante o antiacné): mascarillas, sueros o ampolletas, y masaje facial.
5. Hidratación y protector solar.

Los complementos se agregan a tu facial: el shot hidratante y la ampolleta despigmentante refuerzan el tratamiento, y el azuleno ayuda a calmar la piel.

Aparatología: [POR DEFINIR POR LA ESPECIALISTA: qué equipos se usarán, por ejemplo vapor, alta frecuencia o ultrasonido]. Por eso te preguntamos si tienes marcapasos, implantes o epilepsia.

## 2. Beneficios

Piel más limpia, hidratada y luminosa, y una mejor apariencia según el objetivo de tu tratamiento. Los tratamientos despigmentante, reafirmante y antiacné suelen necesitar varias sesiones y constancia en casa. Los resultados varían en cada persona y no se garantizan, y no sustituyen la atención de un dermatólogo.

## 3. Riesgos y molestias posibles

Lo más común, que suele pasar en horas o en uno o dos días:

- Enrojecimiento, calor o sensibilidad.
- Marcas leves donde se hicieron extracciones.
- Ardor o comezón leve con algunos activos, sobre todo los despigmentantes.
- Algunos granitos en los días siguientes, mientras la piel se limpia.

Menos frecuente:

- Descamación o resequedad.
- Irritación o reacción alérgica a algún producto.
- Manchas si te expones al sol sin protección.
- Brote de herpes labial, si ya lo has tenido.

## 4. Contraindicaciones

Si alguna aplica a ti, márcala en tu ficha. Según el caso, la especialista puede ajustar el tratamiento, pedirte la autorización de tu médico o dermatólogo, posponerlo o decidir no realizarlo:

- Embarazo o lactancia (algunos activos no se recomiendan).
- Isotretinoína (Roacután) u otro medicamento para el acné en los últimos 6 meses (la piel está más frágil).
- Piel asoleada o bronceado reciente (últimos 3 días).
- Herpes activo, heridas o piel irritada en el rostro.
- Láser o luz pulsada en el rostro en las últimas 4 semanas.
- Peeling, botox o rellenos en el último mes.
- Rosácea o acné inflamado en este momento.
- Marcapasos, implantes metálicos o prótesis en la zona.
- Epilepsia.
- Alergia a perfumes, resinas, miel, colofonia o algún cosmético.

Cuéntanos también si usas retinol, ácidos u otro tratamiento indicado por tu dermatólogo, o si tuviste una cirugía reciente en el rostro.

## 5. Antes de tu cita

- No te exfolies ni uses retinol o ácidos 48 horas antes [PLAZO POR CONFIRMAR].
- Evita el sol 48 horas antes.
- Si puedes, llega sin maquillaje.
- Si en la misma visita también te vas a depilar el rostro, coméntalo: la especialista decide el orden o si conviene hacerlo otro día.

## 6. Después: las primeras 24 a 48 horas

- Usa protector solar de FPS 30 o más y reaplícalo; evita el sol directo.
- Si puedes, no te maquilles en las primeras 12 horas.
- No te exfolies ni uses retinol o ácidos durante 48 a 72 horas.
- Evita vapor, sauna, alberca y ejercicio intenso.
- No toques ni aprietes granitos.
- Lava tu cara con un limpiador suave e hidrátala.

Si el enrojecimiento o el ardor duran más de 48 horas, o notas ampollas, hinchazón o mucho dolor, escríbenos por WhatsApp al 442 170 1466 y consulta a tu médico.

## 7. Mi declaración y autorización

Al firmar declaro que:

1. Leí y entendí este documento y pude hacer preguntas.
2. Mi ficha de salud es **verdadera y completa**, y avisaré de cualquier cambio antes de empezar.
3. Entiendo que es un servicio cosmético, no médico, y que los resultados varían.
4. **Autorizo** a Ópalo y a su personal capacitado a realizar el tratamiento facial y los complementos que elegí en esta reserva y, si se requiere, la prueba de parche.
5. Puedo pedir que se **detenga** el tratamiento en cualquier momento, y el personal puede suspenderlo si detecta un riesgo para mi salud.
6. Seguiré los cuidados indicados.
7. No se toman fotos sin mi permiso expreso, que se pide aparte.

## 8. Menores de edad

Si tienes entre 15 y 17 años, escribe el nombre de tu mamá, papá o tutor: esa persona autoriza el tratamiento y debe **acompañarte en cabina** toda la sesión, con identificación oficial. Sin su presencia no podemos atenderte. [POR DEFINIR POR EL ABOGADO: si también debe firmar en la tablet de la cabina.]

## 9. Firma electrónica

Firmas con tu nombre completo y tu firma trazada en la pantalla. Guardamos además la fecha y hora, la versión exacta de este documento con su **huella digital** (un código que prueba que el texto no cambió), la referencia a tu ficha de salud vigente, tu dirección IP y tu tipo de dispositivo. Esta firma electrónica vale igual que tu firma autógrafa [CONFIRMAR CON EL ABOGADO]. Puedes consultar el documento firmado en Mi cuenta.
',
  true, now()
 where not exists (select 1 from public.politicas where tipo = 'consentimiento_facial'::public.tipo_politica);

insert into public.politicas (tipo, version, titulo, contenido_md, activa, vigente_desde)
select 'privacidad'::public.tipo_politica, 1, 'Aviso de privacidad integral',
'> **BORRADOR para revisión.** Antes de publicarse, este aviso debe revisarlo un abogado, y la especialista de Ópalo en lo que toca a la ficha de salud. Lo que aparece entre corchetes, [ASÍ], es un dato o una decisión pendiente.

En Ópalo cuidamos tu piel y también tu información. Este aviso te explica qué datos personales recabamos, para qué los usamos, con quién los compartimos y cómo ejercer tus derechos, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares y demás normas aplicables.

## 1. Responsable

[RAZÓN SOCIAL] (en adelante, "Ópalo"), con RFC [RFC] y domicilio en Momentum Centro Sur, Torre 2, Int. 207, [COLONIA Y CÓDIGO POSTAL], Querétaro, Qro., es responsable del tratamiento de tus datos personales. Para temas de privacidad escríbenos a **[CORREO DE PRIVACIDAD]** o por WhatsApp al 442 170 1466. Persona o área a cargo de los datos personales: [POR DEFINIR].

## 2. Datos que recabamos

Los obtenemos directamente de ti cuando creas tu cuenta, reservas, llenas tu ficha, compras, firmas o nos escribes:

- **Identificación y contacto:** nombre, apellidos, fecha de nacimiento (para confirmar tu edad), teléfono o WhatsApp y correo.
- **Cuenta:** correo y contraseña; la contraseña se guarda cifrada y nadie en Ópalo puede verla.
- **Citas, compras y pagos:** servicios reservados, historial de visitas, pedidos, servicios prepagados, códigos de regalo (y el nombre de quien recibe el regalo) y pagos. No guardamos los datos completos de tu tarjeta.
- **Datos personales sensibles de salud** (tu ficha de salud): condiciones como embarazo o lactancia, diabetes, várices, epilepsia, herpes, marcapasos o implantes; medicamentos, como isotretinoína o anticoagulantes; alergias; tratamientos estéticos recientes y tus observaciones.
- **Firma y evidencia de tu consentimiento:** nombre de quien firma, trazo de la firma en pantalla, fecha y hora, versión del documento y su huella digital, dirección IP y tipo de navegador o dispositivo. Si eres menor de edad, también el nombre de tu mamá, papá o tutor.
- **Fotografías de resultados**, sólo con tu permiso expreso (ver el punto 9).
- Cómo nos conociste, si nos lo cuentas.

## 3. Para qué los usamos

**Finalidades primarias**, necesarias para atenderte:

1. Crear y administrar tu cuenta.
2. Agendar, confirmar, recordar, cambiar y cancelar tus citas, también por WhatsApp.
3. Revisar tu ficha de salud para decidir si un servicio es seguro y adecuado para ti, y cómo realizarlo.
4. Registrar tu consentimiento informado y tu aceptación de nuestras políticas.
5. Realizar tus servicios y llevar tu historial.
6. Procesar pedidos, pagos, servicios prepagados, regalos y, si la pides, tu factura.
7. Atender dudas, quejas y garantías, y cumplir obligaciones legales y fiscales.

**Finalidades secundarias**, no necesarias para atenderte:

1. Enviarte promociones, novedades e invitaciones.
2. Pedirte tu opinión sobre nuestros servicios.

Sólo te enviamos promociones si **tú lo autorizas** marcando la casilla correspondiente. Puedes negarte o cambiar de opinión cuando quieras: desmarca la opción en Mi cuenta o escríbenos a [CORREO DE PRIVACIDAD] o por WhatsApp. Negarte no afecta tus servicios.

## 4. Consentimiento expreso para tus datos de salud

Tus datos de salud son **datos personales sensibles**. Antes de guardar tu ficha te pedimos tu **consentimiento expreso**, que das marcando una casilla con tu sesión iniciada; además, firmas el consentimiento informado de cada tipo de servicio. Sin ese consentimiento no podemos guardar tu ficha y, por tu seguridad, tampoco realizar el servicio. Tu ficha sólo la ven tú y el personal de Ópalo que te atiende o administra la agenda. Nunca la usamos con fines comerciales.

Si tienes entre 15 y 17 años, tu mamá, papá o tutor también debe autorizar el tratamiento de tus datos [CONFIRMAR CON EL ABOGADO: cómo se recaba ese consentimiento].

## 5. Con quién compartimos tus datos

No vendemos ni rentamos tus datos. Para operar usamos proveedores que los tratan **por cuenta nuestra**, bajo nuestras instrucciones y con obligación de confidencialidad:

- Base de datos, inicio de sesión y almacenamiento: Supabase, Inc.; sus servidores pueden estar fuera de México [REGIÓN DE LOS SERVIDORES POR CONFIRMAR].
- Alojamiento del sitio web: [PROVEEDOR DE HOSTING].
- Contabilidad y facturación: [DESPACHO CONTABLE O PROVEEDOR DE FACTURACIÓN], sólo con los datos necesarios.

Sólo compartimos tus datos sin tu consentimiento en los casos que permite la ley; por ejemplo, si lo requiere una autoridad competente o, en una emergencia, con el personal médico que te atienda (únicamente los datos de salud necesarios). Cuando nos escribes por WhatsApp, esa conversación también se rige por los términos y el aviso de privacidad de WhatsApp.

## 6. Tus derechos ARCO

Tienes derecho a **Acceder** a tus datos, **Rectificarlos** si son inexactos, **Cancelarlos** cuando ya no sean necesarios y **Oponerte** a que se usen para fines específicos. Muchos los puedes ver y corregir tú misma en Mi cuenta. Para ejercer tus derechos, escribe a [CORREO DE PRIVACIDAD] con:

1. Tu nombre y un medio para responderte.
2. Copia de tu identificación oficial, o la de tu representante con el documento que acredite la representación.
3. Qué derecho quieres ejercer y sobre qué datos, con cualquier documento que ayude a atender tu solicitud.

Te respondemos en un máximo de **20 días hábiles** y, si procede, lo hacemos efectivo dentro de los **15 días hábiles** siguientes [CONFIRMAR PLAZOS CON EL ABOGADO]. El trámite es gratuito.

## 7. Revocar tu consentimiento

Puedes revocar tu consentimiento por el mismo medio. La revocación no tiene efectos hacia atrás y, si revocas el de tus datos de salud, ya no podremos atenderte. Algunos datos debemos conservarlos aunque pidas cancelarlos, como los consentimientos firmados y los registros fiscales, durante el plazo que marca la ley.

## 8. Cuánto tiempo los conservamos

Mientras seas clienta de Ópalo y, después, el tiempo necesario para cumplir obligaciones legales y como respaldo de tus consentimientos [PLAZO POR DEFINIR POR EL ABOGADO]. Al terminar ese plazo los bloqueamos y los eliminamos de forma segura. Tus fichas de salud y consentimientos firmados se guardan como historial y no se modifican.

## 9. Fotografías

Sólo tomamos fotos de antes y después con tu **permiso expreso**, que se pide aparte y para cada uso: sólo para tu expediente, o también para nuestro sitio o redes sociales. Puedes pedir que se retiren en cualquier momento. Sin tu permiso, no hay fotos.

## 10. Seguridad y almacenamiento en tu navegador

Protegemos tus datos con conexión cifrada y acceso por permisos: cada persona del equipo ve sólo lo que necesita para su trabajo. El sitio guarda en tu navegador lo necesario para mantener tu sesión iniciada y tu carrito; no usamos cookies de publicidad [CONFIRMAR si se agregan herramientas de analítica].

## 11. Cambios a este aviso

Si este aviso cambia, publicamos la nueva versión en el sitio con su fecha. Si el cambio requiere tu consentimiento, te lo pediremos en tu siguiente reserva.

## 12. Si crees que tus derechos no se respetaron

Escríbenos primero para resolverlo. También puedes acudir a la autoridad en materia de protección de datos personales [CONFIRMAR CON EL ABOGADO: autoridad competente vigente]. Si no quieres recibir publicidad en general, puedes inscribirte en el Registro Público para Evitar Publicidad (REPEP) de la PROFECO.

Última actualización: [FECHA DE PUBLICACIÓN].
',
  true, now()
 where not exists (select 1 from public.politicas where tipo = 'privacidad'::public.tipo_politica);

insert into public.politicas (tipo, version, titulo, contenido_md, activa, vigente_desde)
select 'terminos'::public.tipo_politica, 1, 'Términos y condiciones de servicio',
'> **BORRADOR para revisión.** Antes de publicarse, este documento debe revisarlo la especialista de Ópalo (en lo técnico) y un abogado (en lo legal). Lo que aparece entre corchetes, [ASÍ], es un dato o una decisión pendiente.

Estos términos explican cómo funcionan nuestros servicios, tus reservas y tus pagos. Al crear tu cuenta o reservar aceptas estos términos, junto con nuestro **Aviso de privacidad** y nuestra **Política de cancelación**.

## 1. Quiénes somos

Ópalo es un spa de depilación con cera, faciales, tratamientos corporales y complementos, ubicado en Momentum Centro Sur, Torre 2, Int. 207, Querétaro, Qro. Lo opera [RAZÓN SOCIAL], con RFC [RFC] (en adelante, "Ópalo"). Puedes escribirnos por WhatsApp al **442 170 1466**.

Nuestros servicios son **cosméticos, no médicos**: no diagnosticamos ni tratamos enfermedades. Las decisiones técnicas (si un servicio es adecuado para ti, qué productos usar y cómo realizarlo) las toma nuestra especialista, cosmetóloga y fundadora de Ópalo, o el personal capacitado que ella designe.

## 2. Reservas en línea

- Cada cita es una **sesión de 1 hora**. Si lo que eliges necesita más tiempo, el sistema lo reserva y te lo muestra antes de confirmar.
- Al reservar ves el día, la hora, **quién te atenderá** y el **tiempo estimado** de tu cita; después lo consultas en Mi cuenta.
- Para reservar necesitas una cuenta, aceptar estos documentos, llenar tu **ficha de salud** y firmar en pantalla el **consentimiento informado** del tipo de servicio que elegiste.
- Si en tu ficha marcas una condición que la especialista debe revisar, tu cita queda **pendiente de confirmar** y te escribimos por WhatsApp. Si el servicio no es adecuado para ti, cancelamos la cita sin costo.
- Los servicios con "precio por confirmar" sí se pueden reservar: te confirmamos el precio en cabina antes de empezar y puedes decidir no tomarlo.
- Si eres clienta nueva y la especialista lo considera necesario, haremos una **prueba de parche** antes del servicio.
- Si agendas por WhatsApp, firmas tu consentimiento desde Mi cuenta o en la tablet de la cabina. **Sin consentimiento firmado no hay servicio.**

## 3. Tu ficha de salud

Tu ficha nos permite cuidarte. La información que nos des debe ser **verídica, completa y actual**; avísanos antes de tu cita si algo cambia (un medicamento nuevo, un embarazo, una reacción reciente). Ópalo no es responsable de reacciones que se deriven de información falsa u omitida. Tratamos tus datos conforme a nuestro Aviso de privacidad.

## 4. Lo que te pedimos y lo que te ofrecemos

Te pedimos:

- Llegar puntual: tienes 15 minutos de tolerancia (ver la Política de cancelación).
- Seguir los cuidados antes y después que te indicamos.
- Avisarnos de inmediato si sientes una molestia fuera de lo normal.

Nos comprometemos a:

- Atenderte con personal capacitado y en capacitación constante.
- Usar productos de calidad y protocolos de higiene en cada sesión.
- Explicarte el procedimiento, resolver tus dudas y detener el servicio cuando tú lo pidas.
- Cuidar la confidencialidad de tus datos.

## 5. Precios y pagos

- Los precios están en pesos mexicanos y son el total a pagar [CONFIRMAR CON EL CONTADOR: que incluyen IVA]. Pueden cambiar; aplica el vigente al reservar o comprar.
- Por ahora no cobramos en línea: pagas **en el spa** o por **transferencia**. Los pedidos de la tienda quedan "pendientes de pago" hasta que registramos tu pago.
- **Servicios prepagados (créditos):** lo que compras para usar después queda como crédito en tu cuenta, con **vigencia de 12 meses** desde que registramos tu pago (o la que indique el paquete). Lo usas al reservar; vencido, ya no se puede usar.
- **Regalos:** si compras un servicio para regalar, generamos un **código de regalo**. Quien lo recibe lo canjea en su cuenta y el crédito pasa a ser suyo, con la misma vigencia. Cuida el código: cualquiera que lo tenga puede canjearlo.
- Reembolso de servicios prepagados no usados: [POR DEFINIR POR LA SOCIEDAD Y EL ABOGADO].
- Las propinas son voluntarias y son para quien te atiende.

## 6. Garantía [PROPUESTA, POR CONFIRMAR]

- Si después de tu depilación quedan vellos en la zona trabajada, puedes pedir un **retoque sin costo dentro de los 7 días** siguientes, por WhatsApp.
- Si se presenta irritación, te aplicamos un **calmante (por ejemplo, azuleno) sin costo**.
- No aplica si no se siguieron los cuidados indicados o si el vello no tenía la longitud necesaria [DETALLE POR DEFINIR POR LA ESPECIALISTA].

## 7. Menores de edad

Atendemos a partir de los **15 años**. Entre los 15 y los 17 años, mamá, papá o tutor debe autorizar el servicio y **estar presente en cabina** toda la sesión; su nombre queda registrado en el consentimiento. Si no asiste, no podemos realizar el servicio.

## 8. Conducta

Ópalo es un espacio de respeto. Podemos negar o suspender un servicio ante conductas ofensivas, acoso o violencia, o si llegas bajo los efectos del alcohol o de alguna droga. No se permiten acompañantes en cabina, salvo mamá, papá o tutor de una clienta menor [POR DEFINIR: otras excepciones]. Nadie toma fotos ni videos en cabina sin acuerdo de ambas partes, y Ópalo sólo usa fotos de resultados con tu permiso expreso.

## 9. Cambios a estos términos

Cada cambio se publica como **una versión nueva** y te pediremos aceptarla en tu siguiente reserva. La versión que aceptaste queda guardada con la fecha y hora de tu aceptación.

## 10. Ley aplicable y quejas

Estos términos se rigen por las leyes de los Estados Unidos Mexicanos y del Estado de Querétaro. Si tienes una queja, escríbenos por WhatsApp al 442 170 1466 y buscaremos resolverla contigo. Siempre conservas tu derecho de acudir a la **Procuraduría Federal del Consumidor (PROFECO)**. Para cualquier controversia, las partes se someten a los tribunales competentes de la ciudad de Querétaro, Qro., sin perjuicio de la competencia de la PROFECO.
',
  true, now()
 where not exists (select 1 from public.politicas where tipo = 'terminos'::public.tipo_politica);


commit;
