-- =============================================================================
-- Ópalo · 1100 · Seguridad: RLS, políticas y privilegios
-- Contrato: opalo/docs/ESPEC.md §3 y §6.1
--
-- Supabase da por defecto ALL sobre las tablas de public a anon/authenticated y
-- EXECUTE sobre las funciones. Aquí se reduce a lo necesario; la barrera real es RLS
-- (activada en cada tabla al crearla). Las llamadas a funciones de rol van envueltas en
-- (select …) para que Postgres las evalúe una sola vez por consulta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Defensa en profundidad: RLS en todas las tablas de public (por si alguna se escapó)
-- -----------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in select c.relname
             from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Políticas
-- -----------------------------------------------------------------------------

-- configuracion: lectura pública, edición admin
create policy configuracion_leer on public.configuracion
  for select to anon, authenticated using (true);
create policy configuracion_editar on public.configuracion
  for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

-- perfiles: cada quien el suyo; el personal ve todos; sólo admin cambia roles
create policy perfiles_leer on public.perfiles
  for select to authenticated using (id = (select auth.uid()) or (select public.es_personal()));
create policy perfiles_editar on public.perfiles
  for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

-- clientes: la clienta su fila; el personal todas (y crea clientas sin cuenta)
create policy clientes_leer on public.clientes
  for select to authenticated using (usuario_id = (select auth.uid()) or (select public.es_personal()));
create policy clientes_crear on public.clientes
  for insert to authenticated with check ((select public.es_personal()));
create policy clientes_editar on public.clientes
  for update to authenticated
  using (usuario_id = (select auth.uid()) or (select public.es_personal()))
  with check (usuario_id = (select auth.uid()) or (select public.es_personal()));

-- personal y capacitaciones: el público (y las clientas) los ven por las vistas personal_publico
-- y capacitaciones_publicas, que sólo exponen columnas no sensibles (sin usuario_id, notas ni
-- constancias). En la tabla: el personal todo; la clienta, sólo a quien la atendió (para
-- v_citas_detalle); admin edita.
create policy personal_leer on public.personal
  for select to authenticated using (
    (select public.es_personal())
    or exists (select 1 from public.citas c
                where c.personal_id = personal.id and c.cliente_id = (select public.mi_cliente_id())));
create policy personal_admin on public.personal
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

create policy capacitaciones_leer on public.capacitaciones
  for select to authenticated using ((select public.es_personal()));
create policy capacitaciones_admin on public.capacitaciones
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

-- personal_servicios
create policy personal_servicios_leer on public.personal_servicios
  for select to authenticated using (true);
create policy personal_servicios_admin on public.personal_servicios
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

-- catálogo
create policy categorias_servicio_leer on public.categorias_servicio
  for select to anon, authenticated using (true);
create policy categorias_servicio_admin on public.categorias_servicio
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

create policy servicios_leer_anon on public.servicios
  for select to anon using (activo);
create policy servicios_leer on public.servicios
  for select to authenticated using (activo or (select public.es_personal()));
create policy servicios_admin on public.servicios
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

create policy paquetes_leer_anon on public.paquetes
  for select to anon using (activo);
create policy paquetes_leer on public.paquetes
  for select to authenticated using (activo or (select public.es_personal()));
create policy paquetes_admin on public.paquetes
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

create policy paquete_servicios_leer on public.paquete_servicios
  for select to anon, authenticated using (true);
create policy paquete_servicios_admin on public.paquete_servicios
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

create policy contraindicaciones_leer_anon on public.contraindicaciones
  for select to anon using (activa);
create policy contraindicaciones_leer on public.contraindicaciones
  for select to authenticated using (activa or (select public.es_personal()));
create policy contraindicaciones_admin on public.contraindicaciones
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

-- agenda
create policy cabinas_leer on public.cabinas
  for select to authenticated using (true);
create policy cabinas_admin on public.cabinas
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

create policy horarios_leer on public.horarios
  for select to authenticated using (true);
create policy horarios_admin on public.horarios
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

create policy bloqueos_agenda_personal on public.bloqueos_agenda
  for all to authenticated using ((select public.es_personal())) with check ((select public.es_personal()));

create policy citas_leer on public.citas
  for select to authenticated
  using (cliente_id = (select public.mi_cliente_id()) or (select public.es_personal()));

create policy cita_items_leer on public.cita_items
  for select to authenticated
  using ((select public.es_personal())
         or exists (select 1 from public.citas c
                     where c.id = cita_items.cita_id and c.cliente_id = (select public.mi_cliente_id())));

-- políticas: activas para todos; el personal todas; la clienta las que aceptó o firmó
create policy politicas_leer_anon on public.politicas
  for select to anon using (activa);
create policy politicas_leer on public.politicas
  for select to authenticated using (
    activa
    or (select public.es_personal())
    or exists (select 1 from public.aceptaciones_politica a
                where a.politica_id = politicas.id and a.cliente_id = (select public.mi_cliente_id()))
    or exists (select 1 from public.consentimientos co
                where co.politica_id = politicas.id and co.cliente_id = (select public.mi_cliente_id())));

create policy aceptaciones_leer on public.aceptaciones_politica
  for select to authenticated
  using (cliente_id = (select public.mi_cliente_id()) or (select public.es_personal()));

-- datos sensibles: sólo la dueña y el personal
create policy fichas_salud_leer on public.fichas_salud
  for select to authenticated
  using (cliente_id = (select public.mi_cliente_id()) or (select public.es_personal()));

create policy consentimientos_leer on public.consentimientos
  for select to authenticated
  using (cliente_id = (select public.mi_cliente_id()) or (select public.es_personal()));

-- ventas
create policy pedidos_leer on public.pedidos
  for select to authenticated
  using (cliente_id = (select public.mi_cliente_id()) or (select public.es_personal()));

create policy pedido_items_leer on public.pedido_items
  for select to authenticated
  using ((select public.es_personal())
         or exists (select 1 from public.pedidos pe
                     where pe.id = pedido_items.pedido_id and pe.cliente_id = (select public.mi_cliente_id())));

create policy pagos_leer on public.pagos
  for select to authenticated
  using ((select public.es_personal())
         or exists (select 1 from public.pedidos pe
                     where pe.id = pagos.pedido_id and pe.cliente_id = (select public.mi_cliente_id()))
         or exists (select 1 from public.citas c
                     where c.id = pagos.cita_id and c.cliente_id = (select public.mi_cliente_id())));

create policy creditos_leer on public.creditos
  for select to authenticated
  using (cliente_id = (select public.mi_cliente_id()) or (select public.es_personal()));

-- inventario (personal)
create policy proveedores_leer on public.proveedores
  for select to authenticated using ((select public.es_personal()));
create policy proveedores_crear on public.proveedores
  for insert to authenticated with check ((select public.es_personal()));
create policy proveedores_editar on public.proveedores
  for update to authenticated using ((select public.es_personal())) with check ((select public.es_personal()));

create policy productos_leer on public.productos
  for select to authenticated using ((select public.es_personal()));
create policy productos_crear on public.productos
  for insert to authenticated with check ((select public.es_personal()));
create policy productos_editar on public.productos
  for update to authenticated using ((select public.es_personal())) with check ((select public.es_personal()));

create policy recetas_servicio_personal on public.recetas_servicio
  for all to authenticated using ((select public.es_personal())) with check ((select public.es_personal()));

create policy compras_leer on public.compras
  for select to authenticated using ((select public.es_personal()));
create policy compra_items_leer on public.compra_items
  for select to authenticated using ((select public.es_personal()));
create policy movimientos_leer on public.movimientos_inventario
  for select to authenticated using ((select public.es_personal()));

-- gastos (sólo admin)
create policy categorias_gasto_admin on public.categorias_gasto
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy gastos_recurrentes_admin on public.gastos_recurrentes
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy gastos_admin on public.gastos
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

-- -----------------------------------------------------------------------------
-- Privilegios sobre tablas y vistas
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Visitante: sólo lo público (ESPEC §3). Equipo y capacitaciones, por sus vistas públicas; los
-- horarios libres, con horarios_disponibles (security definer).
grant select on
  public.configuracion, public.categorias_servicio, public.servicios, public.paquetes,
  public.paquete_servicios, public.contraindicaciones, public.politicas,
  public.personal_publico, public.capacitaciones_publicas, public.productos_tienda
to anon;

-- Usuarios con sesión: leen todo lo que su RLS les permita…
grant select on all tables in schema public to authenticated;

-- …salvo columnas internas. RLS filtra filas, no columnas, y personal y clientas comparten el
-- rol "authenticated": la clienta podría pedir GET /clientes?select=notas_internas de su fila.
-- Así que esas columnas no se conceden a nadie con sesión; el personal lee las notas en
-- v_clientes_notas. (Las funciones security definer y service_role no se ven afectadas.)
revoke select on public.clientes, public.citas, public.pagos from authenticated;
grant select (id, usuario_id, nombre, apellidos, telefono, email, fecha_nacimiento, como_nos_conocio,
              acepta_promociones, creado_en, actualizado_en)              -- sin notas_internas
  on public.clientes to authenticated;
grant select (id, cliente_id, personal_id, cabina_id, inicio, fin, estado, origen, primera_vez,
              requiere_revision, alertas, notas_cliente, total, cancelada_en, motivo_cancelacion,
              creado_en, actualizado_en)                                   -- sin notas_internas ni creada_por
  on public.citas to authenticated;
grant select (id, pedido_id, cita_id, monto, propina, metodo, referencia, pagado_en)
  on public.pagos to authenticated;                                        -- sin recibido_por ni notas
grant select on public.v_clientes_notas to authenticated;                  -- filtra es_personal()

-- Escrituras directas (ESPEC §6.1). Lo demás sólo por RPC.
grant insert (id, nombre, apellidos, telefono, email, fecha_nacimiento, como_nos_conocio,
              acepta_promociones, notas_internas)
  on public.clientes to authenticated;
grant update (nombre, apellidos, telefono, email, fecha_nacimiento, como_nos_conocio,
              acepta_promociones, notas_internas)
  on public.clientes to authenticated;     -- la clienta, además, queda limitada por tg_clientes_proteger

grant update (rol) on public.perfiles to authenticated;
grant update on public.configuracion to authenticated;

grant insert, update, delete on public.bloqueos_agenda to authenticated;
grant insert, update on public.proveedores to authenticated;
-- productos: todo menos stock_actual (sólo cambia con movimientos) y costo_unitario (calculado)
grant insert (id, nombre, marca, categoria, unidad_medida, presentacion, contenido_presentacion,
              costo_presentacion, stock_minimo, proveedor_id, uso, precio_venta, vendible_en_linea,
              activo, notas)
  on public.productos to authenticated;
grant update (id, nombre, marca, categoria, unidad_medida, presentacion, contenido_presentacion,
              costo_presentacion, stock_minimo, proveedor_id, uso, precio_venta, vendible_en_linea,
              activo, notas)
  on public.productos to authenticated;
grant insert, update, delete on public.recetas_servicio to authenticated;

grant insert, update, delete on
  public.categorias_servicio, public.servicios, public.paquetes, public.paquete_servicios,
  public.contraindicaciones, public.cabinas,
  public.personal, public.horarios, public.personal_servicios, public.capacitaciones,
  public.categorias_gasto, public.gastos, public.gastos_recurrentes
to authenticated;

-- Inmutables para todos (sólo service_role): consentimientos y movimientos ya no tienen
-- UPDATE/DELETE porque sólo se concedió SELECT arriba.

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- -----------------------------------------------------------------------------
-- Privilegios sobre funciones
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- Auxiliares que usan RLS, vistas y defaults (deben poder ejecutarse como quien consulta)
grant execute on function
  public.mi_rol(), public.es_personal(), public.es_admin(), public.mi_cliente_id(),
  public.hoy_local(), public.configuracion_actual(), public.telefono_legible(text)
to anon, authenticated;

-- Públicas
grant execute on function
  public.duracion_reserva(jsonb),
  public.horarios_disponibles(date, int, uuid)
to anon, authenticated;

-- Clienta (validan la sesión adentro y responden "Inicia sesión para continuar.")
grant execute on function
  public.guardar_ficha_salud(jsonb, jsonb, text, text, text, boolean),
  public.aceptar_politicas(uuid[], text),
  public.reservar_cita(jsonb, timestamptz, text, text, uuid, text, text, text),
  public.firmar_consentimiento_cita(uuid, text, text, text, text),
  public.cancelar_cita(uuid, text),
  public.crear_pedido(jsonb, public.metodo_pago, text),
  public.cancelar_pedido(uuid),
  public.canjear_regalo(text)
to anon, authenticated;

-- Personal / admin (validan el rol adentro)
grant execute on function
  public.reservar_cita_staff(uuid, jsonb, timestamptz, uuid, public.origen_cita, text),
  public.cambiar_estado_cita(uuid, public.estado_cita),
  public.completar_cita(uuid),
  public.registrar_pago(numeric, public.metodo_pago, uuid, uuid, text, numeric),
  public.registrar_compra(jsonb, uuid, date, text, text),
  public.ajustar_inventario(uuid, numeric, public.tipo_movimiento, text),
  public.publicar_politica(public.tipo_politica, text, text),
  public.primer_vencimiento(int, date),
  public.avanzar_vencimiento(date, public.frecuencia_gasto, int),
  public.dias_del_mes(date)
to authenticated;

-- Internas (crear_cita_interna, cancelar_cita_interna, completar_cita_interna,
-- liquidar_pedido_interna, generar_codigo_regalo, personal_puede_hacer, edad_en, ip_solicitud,
-- firma_valida, validar_firma, tg_*): sin EXECUTE para anon/authenticated. Sólo las llaman otras
-- funciones security definer (o triggers / restricciones).

grant execute on all functions in schema public to service_role;

-- -----------------------------------------------------------------------------
-- Privilegios por defecto de lo que se cree DESPUÉS (migraciones futuras)
--
-- Supabase da por defecto ALL a anon/authenticated sobre tablas, secuencias y funciones nuevas
-- de public, y Postgres da EXECUTE a PUBLIC sobre toda función nueva. Lo de arriba sólo cubre
-- lo que ya existe; sin esto, una tabla o función nueva quedaría abierta a anon hasta que
-- alguien se acordara de cerrarla. A partir de aquí, cada objeto nuevo necesita su GRANT
-- explícito (y cada tabla nueva, su RLS: tests/07 falla si falta).
-- Aplica a lo que cree el rol que corre las migraciones (postgres en Supabase). El EXECUTE de
-- PUBLIC es un default global (no por esquema), por eso esa línea no lleva "in schema".
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;
