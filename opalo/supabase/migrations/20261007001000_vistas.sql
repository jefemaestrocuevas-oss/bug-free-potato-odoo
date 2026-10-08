-- =============================================================================
-- Ópalo · 1000 · Vistas (columnas exactas de ESPEC §7)
--
-- Públicas: corren con los permisos del dueño y exponen sólo columnas no sensibles.
-- Internas: security_invoker = true → aplican la RLS de quien consulta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Públicas
-- -----------------------------------------------------------------------------
create view public.personal_publico as
select p.id, p.slug, p.nombre, p.titulo, p.bio, p.foto_url, p.orden
  from public.personal p
 where p.activo and p.mostrar_en_sitio
 order by p.orden, p.nombre;

create view public.capacitaciones_publicas as
select c.id, c.personal_id, c.nombre, c.institucion, c.tipo, c.fecha, c.horas
  from public.capacitaciones c
  join public.personal p on p.id = c.personal_id
 where c.mostrar_en_sitio and p.activo and p.mostrar_en_sitio
 order by c.fecha desc nulls last, c.nombre;

create view public.productos_tienda as
select pr.id, pr.nombre, pr.marca, pr.presentacion, pr.precio_venta, (pr.stock_actual > 0) as hay_stock
  from public.productos pr
 where pr.activo and pr.vendible_en_linea and pr.precio_venta is not null
 order by pr.nombre;

-- Notas internas de cada clienta (sólo personal). Personal y clientas comparten el rol
-- "authenticated", así que la columna clientes.notas_internas no se le concede a ese rol
-- (1100_seguridad) y el personal la lee aquí. Corre con permisos del dueño y filtra por rol
-- (security_barrier: los filtros de quien consulta no se evalúan antes que es_personal()).
create view public.v_clientes_notas with (security_barrier = true) as
select c.id, c.notas_internas
  from public.clientes c
 where public.es_personal();

-- -----------------------------------------------------------------------------
-- Internas
-- -----------------------------------------------------------------------------

-- La clienta ve las suyas; el personal, todas.
create view public.v_citas_detalle with (security_invoker = true) as
select c.id,
       c.cliente_id,
       btrim(cl.nombre || ' ' || coalesce(cl.apellidos, '')) as cliente_nombre,
       cl.telefono as cliente_telefono,
       c.inicio,
       c.fin,
       (extract(epoch from (c.fin - c.inicio)) / 60)::int as duracion_min,
       c.estado,
       c.origen,
       c.primera_vez,
       c.requiere_revision,
       c.alertas,
       c.notas_cliente,
       c.total,
       c.personal_id,
       coalesce(p.nombre, 'Equipo Ópalo') as personal_nombre,
       p.titulo as personal_titulo,
       cb.nombre as cabina_nombre,
       (select count(*) from public.consentimientos co where co.cita_id = c.id)::int as consentimientos_firmados,
       coalesce((select sum(pg.monto) from public.pagos pg where pg.cita_id = c.id), 0)::numeric as pagado,
       coalesce((select jsonb_agg(jsonb_build_object(
                          'nombre', ci.nombre,
                          'precio', ci.precio,
                          'duracion_min', ci.duracion_min,
                          'servicio_id', ci.servicio_id,
                          'paquete_id', ci.paquete_id) order by ci.nombre, ci.id)
                   from public.cita_items ci
                  where ci.cita_id = c.id), '[]'::jsonb) as items
  from public.citas c
  join public.clientes cl on cl.id = c.cliente_id
  left join public.personal p on p.id = c.personal_id
  left join public.cabinas cb on cb.id = c.cabina_id;

create view public.v_pedidos_detalle with (security_invoker = true) as
select pe.id,
       pe.folio,
       pe.cliente_id,
       btrim(cl.nombre || ' ' || coalesce(cl.apellidos, '')) as cliente_nombre,
       pe.estado,
       pe.total,
       coalesce((select sum(pg.monto) from public.pagos pg where pg.pedido_id = pe.id), 0)::numeric as pagado,
       pe.metodo_pago_preferido,
       pe.notas,
       pe.creado_en,
       pe.pagado_en,
       coalesce((select jsonb_agg(jsonb_build_object(
                          'tipo', pi.tipo,
                          'descripcion', pi.descripcion,
                          'cantidad', pi.cantidad,
                          'precio_unitario', pi.precio_unitario,
                          'importe', pi.importe,
                          'regalo_para', pi.regalo_para) order by pi.descripcion, pi.id)
                   from public.pedido_items pi
                  where pi.pedido_id = pe.id), '[]'::jsonb) as items
  from public.pedidos pe
  join public.clientes cl on cl.id = pe.cliente_id;

create view public.v_creditos with (security_invoker = true) as
select cr.id,
       cr.cliente_id,
       coalesce(s.nombre, pa.nombre, 'Servicio') as nombre,
       cr.servicio_id,
       cr.paquete_id,
       cr.cantidad,
       cr.usados,
       (cr.cantidad - cr.usados) as restantes,
       cr.vence_en,
       ((cr.cantidad - cr.usados) > 0 and (cr.vence_en is null or cr.vence_en >= public.hoy_local())) as vigente,
       cr.codigo_regalo,
       cr.regalo_para,
       cr.creado_en
  from public.creditos cr
  left join public.servicios s on s.id = cr.servicio_id
  left join public.paquetes pa on pa.id = cr.paquete_id;

-- Sólo personal. es_personal: la cuenta ligada es del equipo (rol personal o admin; false sin cuenta),
-- para que el panel separe al equipo de las clientas.
create view public.v_clientes_resumen with (security_invoker = true) as
select cl.id,
       cl.nombre,
       cl.apellidos,
       cl.telefono,
       cl.email,
       cl.fecha_nacimiento,
       (cl.usuario_id is not null) as tiene_cuenta,
       (select count(*) from public.citas c
         where c.cliente_id = cl.id and c.estado = 'completada')::int as citas_completadas,
       (select max(c.inicio) from public.citas c
         where c.cliente_id = cl.id and c.estado = 'completada') as ultima_visita,
       (select min(c.inicio) from public.citas c
         where c.cliente_id = cl.id and c.estado in ('pendiente', 'confirmada') and c.inicio >= now()) as proxima_cita,
       coalesce((select sum(pg.monto)
                   from public.pagos pg
                  where pg.metodo <> 'cortesia'
                    and (pg.pedido_id in (select pe.id from public.pedidos pe where pe.cliente_id = cl.id)
                         or pg.cita_id in (select c.id from public.citas c where c.cliente_id = cl.id))), 0)::numeric
         as total_pagado,
       cl.creado_en,
       coalesce((select pf.rol in ('personal', 'admin') from public.perfiles pf where pf.id = cl.usuario_id), false)
         as es_personal
  from public.clientes cl
 where public.es_personal();

-- Costo de material y margen por servicio (personal).
create view public.v_costo_servicio with (security_invoker = true) as
select s.id as servicio_id,
       s.slug,
       s.nombre,
       cs.nombre as categoria,
       s.precio,
       round(coalesce(r.costo, 0), 2) as costo_material,
       case when s.precio is null then null
            else round(s.precio - coalesce(r.costo, 0), 2) end as margen,
       case when s.precio is null or s.precio = 0 then null
            else round((s.precio - coalesce(r.costo, 0)) / s.precio * 100, 1) end as margen_pct,
       (coalesce(r.n, 0) > 0) as tiene_receta
  from public.servicios s
  join public.categorias_servicio cs on cs.id = s.categoria_id
  left join lateral (
         select sum(rs.cantidad * pr.costo_unitario) as costo, count(*) as n
           from public.recetas_servicio rs
           join public.productos pr on pr.id = rs.producto_id
          where rs.servicio_id = s.id) r on true
 where s.activo and public.es_personal()
 order by cs.orden, s.orden, s.nombre;

-- "Se acabó la crema": productos en o bajo su mínimo (personal). R12.
-- presentaciones_sugeridas = floor((stock_minimo − stock_actual) / contenido_presentacion) + 1:
-- comprar lo sugerido deja el stock POR ENCIMA del mínimo (y el producto sale de la lista).
create view public.v_reposicion with (security_invoker = true) as
select pr.id,
       pr.nombre,
       pr.marca,
       pr.unidad_medida,
       pr.stock_actual,
       pr.stock_minimo,
       greatest(pr.stock_minimo - pr.stock_actual, 0) as faltante,
       pr.presentacion,
       pr.contenido_presentacion,
       x.presentaciones_sugeridas,
       round(x.presentaciones_sugeridas * pr.costo_presentacion, 2) as costo_estimado,
       pv.nombre as proveedor_nombre
  from public.productos pr
  left join public.proveedores pv on pv.id = pr.proveedor_id
  cross join lateral (
         select (floor(greatest(pr.stock_minimo - pr.stock_actual, 0) / pr.contenido_presentacion) + 1)::int
                  as presentaciones_sugeridas) x
 where pr.activo
   and pr.stock_actual <= pr.stock_minimo
   and public.es_personal()
 order by (pr.stock_actual - pr.stock_minimo), pr.nombre;

-- Gastos fijos por pagar (admin).
create view public.v_gastos_por_vencer with (security_invoker = true) as
select gr.id,
       gr.concepto,
       cg.nombre as categoria,
       gr.monto_estimado,
       gr.frecuencia,
       gr.proximo_vencimiento,
       (gr.proximo_vencimiento - public.hoy_local())::int as dias_restantes,
       case
         when gr.proximo_vencimiento is null then 'al_corriente'
         when gr.proximo_vencimiento < public.hoy_local() then 'vencido'
         when gr.proximo_vencimiento - public.hoy_local() <= 7 then 'proximo'
         else 'al_corriente'
       end as estado
  from public.gastos_recurrentes gr
  join public.categorias_gasto cg on cg.id = gr.categoria_id
 where gr.activo and public.es_admin()
 order by gr.proximo_vencimiento nulls last, gr.concepto;

-- ¿Cuánto ganamos? Últimos 12 meses con actividad hasta el mes en curso (un gasto con periodo
-- futuro, p. ej. renta adelantada, no desplaza a los meses ya vividos), mes en hora local (admin).
--   ingresos       = pagos sin propina (las cortesías no son ingreso)
--   costo_insumos  = −Σ consumo × costo_unitario
--   utilidad       = ingresos − costo_insumos − gastos
--   flujo          = ingresos − compras − gastos
create view public.v_resultado_mensual with (security_invoker = true) as
with zona as (
  select coalesce((select c.zona_horaria from public.configuracion c where c.id = 1), 'America/Mexico_City') as tz
),
ing as (
  select date_trunc('month', pg.pagado_en at time zone z.tz)::date as mes,
         sum(case when pg.metodo <> 'cortesia' then pg.monto else 0 end) as ingresos,
         sum(pg.propina) as propinas
    from public.pagos pg cross join zona z
   group by 1
),
ins as (
  select date_trunc('month', m.creado_en at time zone z.tz)::date as mes,
         -sum(m.cantidad * coalesce(m.costo_unitario, 0)) as costo
    from public.movimientos_inventario m cross join zona z
   where m.tipo = 'consumo'
   group by 1
),
com as (
  select date_trunc('month', c.fecha)::date as mes, sum(c.total) as total
    from public.compras c
   group by 1
),
gas as (
  select g.periodo as mes, sum(g.monto) as total
    from public.gastos g
   group by 1
),
cit as (
  select date_trunc('month', c.inicio at time zone z.tz)::date as mes, count(*) as n
    from public.citas c cross join zona z
   where c.estado = 'completada'
   group by 1
),
meses as (
  select mes from ing union select mes from ins union select mes from com
  union select mes from gas union select mes from cit
)
select m.mes,
       round(coalesce(ing.ingresos, 0), 2) as ingresos,
       round(coalesce(ing.propinas, 0), 2) as propinas,
       round(coalesce(ins.costo, 0), 2) as costo_insumos,
       round(coalesce(com.total, 0), 2) as compras,
       round(coalesce(gas.total, 0), 2) as gastos,
       round(coalesce(ing.ingresos, 0) - coalesce(ins.costo, 0) - coalesce(gas.total, 0), 2) as utilidad,
       round(coalesce(ing.ingresos, 0) - coalesce(com.total, 0) - coalesce(gas.total, 0), 2) as flujo,
       coalesce(cit.n, 0)::int as citas_completadas
  from meses m
  left join ing on ing.mes = m.mes
  left join ins on ins.mes = m.mes
  left join com on com.mes = m.mes
  left join gas on gas.mes = m.mes
  left join cit on cit.mes = m.mes
 where public.es_admin()
   and m.mes <= date_trunc('month', public.hoy_local())::date
 order by m.mes desc
 limit 12;
