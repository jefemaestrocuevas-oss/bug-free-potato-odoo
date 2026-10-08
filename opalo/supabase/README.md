# Ópalo · base de datos (Supabase / PostgreSQL)

Implementa el contrato de [`../docs/ESPEC.md`](../docs/ESPEC.md) §3–§7: tablas, reglas de negocio,
funciones RPC, vistas y seguridad (RLS). La explicación para los socios está en
[`../docs/MODELO_DATOS.md`](../docs/MODELO_DATOS.md).

```
supabase/
  migrations/                 ← esquema completo, en orden (formato Supabase CLI)
    20261007000100_base.sql         extensiones, tipos, configuración, perfiles, utilidades
    20261007000200_catalogo.sql     categorías, servicios, paquetes, contraindicaciones
    20261007000300_personas.sql     clientes, personal, capacitaciones, mi_rol()/es_personal()…, alta de usuarios
    20261007000400_agenda.sql       cabinas, horarios, bloqueos, citas (exclusión de traslapes), cita_items
    20261007000500_politicas.sql    políticas (hash), aceptaciones, fichas de salud, consentimientos
    20261007000600_ventas.sql       pedidos (folio), pedido_items, pagos, créditos, códigos de regalo
    20261007000700_inventario.sql   proveedores, productos, recetas, compras, movimientos (stock)
    20261007000800_gastos.sql       categorías de gasto, recurrentes (vencimientos), gastos
    20261007000900_funciones.sql    RPC de §6 (reservar, cancelar, completar, pedidos, pagos, compras, paquetes, horarios, recetas…)
    20261007001000_vistas.sql       vistas de §7 (públicas e internas)
    20261007001100_seguridad.sql    políticas RLS, privilegios de tablas y de funciones
  seed.sql                    ← catálogo REAL (generado; idempotente)
  seed_demo.sql               ← datos de EJEMPLO, sólo local (¡nunca en producción!)
  scripts/generar_seed.mjs    ← datos/catalogo.json + datos/politicas/*.md → seed.sql
  scripts/probar_local.sh     ← crea opalo_test y corre todo + pruebas
  local/auth_shim.sql         ← imita auth.users/auth.uid()/roles de Supabase en un Postgres limpio
  local/pruebas.sql           ← ayudantes de las pruebas (esquema "pruebas", sólo local)
  tests/*.sql                 ← pruebas (cada archivo: begin … rollback)
```

## 1. Aplicar a un proyecto de Supabase

**Opción A — Supabase CLI** (recomendada), desde la carpeta `opalo/`:

```bash
cd opalo
supabase init            # sólo si no existe supabase/config.toml (no toca migrations/)
supabase link --project-ref <ref-del-proyecto>
supabase db push         # aplica migrations/ en orden
```

**Opción B — SQL Editor** del panel: pega y ejecuta cada archivo de `migrations/` **en orden de
nombre** (0100 → 1100). Todos son de una sola pasada; no se deben correr dos veces.

Requisitos que Supabase ya trae: esquemas `auth` y `extensions`, roles `anon`, `authenticated`,
`service_role`, `auth.uid()`. Las migraciones crean `btree_gist` (y `pgcrypto`, si faltara) en
`extensions`.

## 2. Cargar el catálogo real (`seed.sql`)

```bash
node opalo/supabase/scripts/generar_seed.mjs   # vuelve a generar seed.sql desde datos/
```

Luego ejecútalo en el proyecto (SQL Editor, `psql "$DATABASE_URL" -f opalo/supabase/seed.sql`
o `supabase db push --include-seed`, que por defecto usa `supabase/seed.sql`).

Es idempotente. Al volver a correrlo:

- **Se sobrescribe con lo de `catalogo.json`**: configuración (incluida `fecha_apertura`), categorías,
  servicios, paquetes (y sus servicios), contraindicaciones y categorías de gasto (upsert por
  `slug`/`clave`; sólo las columnas que vienen en el JSON). Si un precio o la fecha de apertura se
  cambiaron desde el panel o el SQL Editor, cámbialos también en `catalogo.json` o se perderán al
  resembrar.
- **No se toca**: personal, horarios, cabinas y gastos recurrentes (sólo se insertan si no existen).
- **Políticas**: se inserta la versión 1 activa sólo si no existe ninguna de ese tipo. Para cambiar
  una política publicada usa el panel (`publicar_politica`), que crea la versión 2, 3…

> `seed_demo.sql` **nunca** se aplica en producción: crea usuarios ficticios directo en `auth.users`.

## 3. Crear el primer admin

0. En *Authentication → Providers → Email* deja **activo "Confirm email"**. Es obligatorio: una
   cuenta sólo se vincula con la ficha que el personal ya había registrado con ese correo cuando
   el correo está confirmado (`auth.users.email_confirmed_at`). Sin confirmación, cualquiera que
   se registrara con el correo de una clienta vería su historial, su ficha de salud y sus
   créditos.
1. Regístrate en el sitio (o crea el usuario en *Authentication → Users*) y confirma el correo.
   El trigger `on_auth_user_created` le crea su perfil (`rol = 'cliente'`) y su ficha de clienta.
2. En el SQL Editor (sólo cuentas con el correo confirmado):

```sql
update public.perfiles set rol = 'admin'
 where id = (select id from auth.users
              where email = 'socia@ejemplo.mx' and email_confirmed_at is not null);
```

Para personal de cabina: `rol = 'personal'`, y liga su usuario con su ficha de equipo:

```sql
update public.personal set usuario_id = (select id from auth.users
                                          where email = 'especialista@ejemplo.mx'
                                            and email_confirmed_at is not null)
 where slug = 'especialista';
```

El panel todavía **no** tiene pantalla para cambiar roles ni para ligar a alguien del equipo con
su cuenta: dar de alta a una especialista, hacer admin a una socia o quitarle el acceso a alguien
se hace siempre con estas dos sentencias en el SQL Editor (para quitar el acceso:
`rol = 'cliente'` y `usuario_id = null`). La base ya lo permite sólo a admin (ESPEC §6.1).

## 3.1 Fecha de apertura

`configuracion.fecha_apertura` (hoy `2026-10-31`, viene de `catalogo.json`) es el día de apertura, en
hora de Querétaro. **Antes de esa fecha** las clientas y los visitantes no ven horarios en
`horarios_disponibles` y `reservar_cita` responde `Ese horario no está disponible.`; el **personal sí**
ve horarios y agenda con `reservar_cita_staff` (p. ej. el ensayo de apertura). El día de la apertura
ya se reserva en línea. No hace falta un bloqueo global (ese también cerraría la agenda del personal).

Para cambiarla (SQL Editor), y que no se pierda al resembrar, cámbiala también en
`datos/catalogo.json` (`configuracion.fecha_apertura`):

```sql
update public.configuracion set fecha_apertura = '2026-11-07';   -- nueva fecha de apertura
update public.configuracion set fecha_apertura = null;           -- sin restricción
```

## 4. Probar en local (PostgreSQL 16)

```bash
opalo/supabase/scripts/probar_local.sh
```

(Re)crea la base `opalo_test` y aplica, con `ON_ERROR_STOP`:
`local/auth_shim.sql` → `migrations/*.sql` → `seed.sql` (dos veces, para probar que es idempotente)
→ `seed_demo.sql` → `local/pruebas.sql` → `tests/*.sql`. Imprime un resumen y sale con código ≠ 0
si algo falla. Avisa si `seed.sql` no está al día con `datos/`.

Las pruebas y las citas de ejemplo usan fechas relativas a hoy, que pueden caer antes de la apertura:
`seed_demo.sql` quita `fecha_apertura` mientras crea sus citas y la restablece, y cada archivo de
`tests/` que reserva la pone en `null` al empezar (dentro de su `begin … rollback`). La regla misma
se prueba en `tests/02` (horarios) y `tests/03` (reservas).

Variables: `PSQL` (comando psql; por defecto `runuser -u postgres -- psql` si eres root),
`OPALO_DB` (base a usar; se borra), `SOLO` (filtra pruebas, p. ej. `SOLO=03`).

```bash
PSQL="psql -h localhost -U postgres" OPALO_DB=opalo_test opalo/supabase/scripts/probar_local.sh
```

Las pruebas (`tests/*.sql`) son SQL con bloques `DO` que hacen `raise exception` si algo no cuadra,
dentro de `begin … rollback`. Para actuar como alguien usan `pruebas.como_anon()`,
`pruebas.como(<uuid>)` (rol `authenticated` + `request.jwt.claim.sub`) y `pruebas.como_postgres()`.
No son pgTAP: no las corras con `supabase test db`.

Cuentas de `seed_demo.sql` (sólo local): `admin@demo.opalo.mx` (admin),
`especialista@demo.opalo.mx` (personal), `clienta@demo.opalo.mx`, `sofia@demo.opalo.mx`,
`valeria@demo.opalo.mx` (16 años) y una clienta sin cuenta.

## 5. Notas para el sitio (`web/src/lib/api/supabase.ts`)

- **Registro**: `supabase.auth.signUp({ email, password, options: { data: { nombre, apellidos,
  telefono, fecha_nacimiento } } })` — `fecha_nacimiento` como `'YYYY-MM-DD'`. El trigger crea la
  clienta, o la vincula con la que el personal ya había registrado con ese email **cuando el
  correo queda confirmado** (`on_auth_user_confirmed`; mientras tanto no se le crea otra). Al
  borrar una cuenta de Auth, su ficha se conserva sin correo (`on_auth_user_deleted`), para que
  nadie la reclame registrándose con él; si la clienta vuelve, el personal le captura de nuevo
  su correo.
  Riesgo que queda (de Supabase Auth, no de la base): si alguien se registra con el correo de una
  clienta y es *ella* quien después hace clic en el enlace de confirmación, la cuenta del intruso
  queda confirmada. Para cerrarlo del todo, la vinculación de fichas con historial tendría que
  aprobarla el personal (pendiente de decidir; requiere pantalla y cambio de contrato).
- **Errores**: las RPC lanzan `P0001` con el mensaje listo para mostrarse (`error.message`).
  Además de los canónicos de la especificación existen estos (también para mostrarse tal cual):
  `Tu carrito está vacío.` · `La cantidad debe ser al menos 1.` · `Este pedido ya no se puede cancelar.` ·
  `Ese pedido está cancelado.` · `No encontramos ese pedido.` · `No encontramos esa cita.` ·
  `No encontramos a esa clienta.` · `Esta cita está cancelada.` · `Esta cita ya se completó.` ·
  `Indica el pedido o la cita que se está pagando.` · `El monto debe ser mayor a cero.` ·
  `La propina no puede ser negativa.` · `Elige el método de pago.` ·
  `Agrega al menos un producto a la compra.` · `Las presentaciones compradas deben ser más de cero.` ·
  `El costo no puede ser negativo.` · `Uno de los productos de la compra no existe.` ·
  `No encontramos ese proveedor.` · `Sólo se registran ajustes o mermas.` ·
  `La cantidad no puede ser cero.` · `No encontramos ese producto.` ·
  `Escribe el título y el contenido de la política.` ·
  `Esta versión ya fue aceptada o firmada por alguna clienta: publica una versión nueva.` ·
  `Para reservar necesitamos tu fecha de nacimiento.` · `Para firmar necesitamos tu fecha de nacimiento.` ·
  `Tu fecha de nacimiento ya está registrada; si hay un error, escríbenos por WhatsApp al 442 170 1466.` ·
  `Ya tienes 3 citas próximas; para agendar otra escríbenos por WhatsApp al 442 170 1466.` ·
  `No pudimos leer tu firma; bórrala y vuelve a firmar.` ·
  `El nombre es muy largo; escríbelo en máximo 200 caracteres.` ·
  `Las notas son muy largas; escríbelas en máximo 1000 caracteres.` ·
  `Tu ficha de salud es muy larga; resume cada respuesta en máximo 2000 caracteres.` ·
  `Revisa las cantidades.` · `Elige efectivo, tarjeta o transferencia.` ·
  `El nombre de quien recibe el regalo es muy largo (máximo 120 caracteres).` ·
  `Tienes 5 pedidos por pagar; págalos o cancela alguno antes de hacer otro.` ·
  `Esta cita se marcó como no asistió.` ·
  `Elige qué consentimiento firma la clienta para este servicio.`
  De `guardar_paquete`: `Escribe el nombre del paquete.` ·
  `El identificador (slug) del paquete debe tener letras o números.` ·
  `Ya existe otro paquete con ese identificador (slug).` · `Elige si el paquete es combo o bono.` ·
  `Revisa el precio.` · `El precio no puede ser negativo.` ·
  `Revisa la duración: minutos enteros, cero o más.` · `Revisa la vigencia: días enteros, uno o más.` ·
  `Revisa los datos del paquete.` · `Agrega al menos un servicio al paquete.` ·
  `Uno de los servicios del paquete no existe.` · `Revisa las cantidades.` ·
  `Un bono es de un solo servicio: elige sólo uno y cuántas sesiones incluye.` · `No encontramos ese paquete.`
  De `guardar_horarios`: `No encontramos a esa persona del equipo.` · `Revisa los horarios.` ·
  `El día de la semana debe ir de 0 (domingo) a 6 (sábado).` · `Escribe la hora de entrada y la de salida.` ·
  `La salida debe ser después de la entrada.` · `Dos horarios del martes se enciman (10:00–14:00 y 13:00–19:00).`
  (con el día y los rangos que chocan).
  De `guardar_receta`: `No encontramos ese servicio.` · `Revisa la receta.` ·
  `Uno de los productos de la receta no existe.` · `La cantidad de cada producto debe ser mayor a cero.` ·
  `Las notas son muy largas; escríbelas en máximo 1000 caracteres.`
  En `crear_pedido`, un servicio/paquete/producto que no se puede comprar responde
  `Uno de los productos ya no está disponible para compra en línea.`
- **Límites** (constantes en las funciones): la clienta reserva en línea a lo más **3 citas
  próximas** activas (pendiente/confirmada; el personal sí puede agendarle más) y tiene a lo más
  **5 pedidos por pagar**; cantidades enteras de 1 a 99 por renglón; `crear_pedido` sólo acepta
  efectivo, tarjeta o transferencia (cortesía y Mercado Pago los elige el personal al cobrar).
  Firma: un `<svg>` sólo con trazos (`path`, `g`, `polyline`, `line`, `circle`), sin scripts,
  eventos ni enlaces, de hasta 200 000 caracteres (`firma_valida`, también como restricción de
  `consentimientos`); nombres hasta 200, notas hasta 1000, campos de la ficha hasta 2000.
- **Fecha de nacimiento**: `reservar_cita` (y `firmar_consentimiento_cita` desde el portal) la
  exigen; la clienta la captura una vez y después sólo el personal la cambia (`tg_clientes_proteger`).
- **Servicios**: uno activo y en etapa `disponible` debe tener `tipo_consentimiento`
  (trigger `servicios_consentimiento`); una cita sin ningún consentimiento que firmar no se crea.
- **Agenda del personal**: `reservar_cita_staff` respeta los bloqueos (de la persona o globales)
  y la autoasignación salta a quien está bloqueada. No le aplica `fecha_apertura` (§3.1): el personal
  agenda antes de abrir; la clienta, no. `horarios_disponibles` todavía no filtra por
  `personal_servicios` (no recibe los servicios): con una especialista que hace todo no importa.
- **Regalos**: un código por regalo; un bono de varios servicios genera varios créditos con el
  mismo código y `canjear_regalo` los pasa todos.
- **Consentimientos**: `documento_hash` = sha256 de política, clienta, cita, ficha, firmante,
  tutor, menor, sha256 de la firma y `firmado_en` (ver `tg_consentimiento_hash`); `capturado_por`
  y `canal` (`reserva_web`, `portal`, `cabina`) dicen quién y dónde se firmó. La IP
  (`ip_solicitud`) es orientativa: `cf-connecting-ip` o, si no viene, el primer `x-forwarded-for`.
- **Columnas internas**: nadie con sesión (rol `authenticated`) lee `clientes.notas_internas`,
  `citas.notas_internas`, `citas.creada_por`, `pagos.recibido_por` ni `pagos.notas` directo de la
  tabla (personal y clientas comparten ese rol y RLS no filtra columnas). El personal lee las notas
  de cada clienta en la vista **`v_clientes_notas`** (`id, notas_internas`, sólo personal); las sigue
  escribiendo con `update clientes set notas_internas = …`. Pide columnas explícitas: `select('*')`
  sobre `clientes`, `citas` o `pagos` falla.
- **Visitante**: el equipo y las capacitaciones sólo por `personal_publico` y
  `capacitaciones_publicas` (las tablas `personal`, `capacitaciones`, `horarios`, `cabinas` y
  `personal_servicios` ya no se leen sin sesión). Con sesión, la clienta sólo ve en `personal` a
  quien la atiende.
- **Objetos nuevos**: desde `1100_seguridad`, lo que se cree en `public` no tiene permisos para
  `anon`/`authenticated` (ni `EXECUTE` para `PUBLIC`): cada tabla, vista o función nueva necesita
  su `grant` explícito y cada tabla su RLS. `tests/07` falla si una tabla no tiene RLS, si una
  función queda abierta fuera de la lista del contrato o si una vista sin `security_invoker` no es
  de las públicas.
- **Paquetes, horarios y recetas** (ESPEC §6 y §6.1): se escriben **sólo** con estas RPC, que
  reemplazan el conjunto completo en una transacción (si algo no es válido no se guarda nada); las
  tablas `paquetes`, `paquete_servicios`, `horarios` y `recetas_servicio` no aceptan
  `insert/update/delete` directos.
  - `guardar_paquete(p_id uuid, p_datos jsonb, p_items jsonb) returns uuid` (admin). `p_id` null = nuevo.
    `p_datos = {slug, nombre, descripcion, tipo, precio, duracion_min, vigencia_dias, activo, orden}`: al
    editar, lo que no venga se queda como está; sin `slug` se arma con el nombre ("Paquete Verano" →
    `paquete-verano`). `p_items = [{servicio_id, cantidad}]` (1–99; repetidos se suman). Un **bono**
    lleva exactamente un servicio. Para "borrar" un paquete se desactiva (`activo: false`).
  - `guardar_horarios(p_personal_id uuid, p_horarios jsonb) returns void` (admin).
    `[{dia_semana (0 = domingo), hora_inicio 'HH:MI', hora_fin 'HH:MI'}]`; varios rangos por día sí
    (comida), encimados no (pegados, como 10–14 y 14–19, sí). `'[]'` deja a la persona sin horario.
  - `guardar_receta(p_servicio_id uuid, p_items jsonb) returns void` (personal).
    `[{producto_id, cantidad (> 0, en la unidad del producto), notas}]`; `'[]'` la deja vacía.
- **Privilegios** (además de RLS): la clienta sólo puede `update` en `clientes` de
  `nombre, apellidos, telefono, fecha_nacimiento, acepta_promociones` (un trigger lo exige);
  `productos.stock_actual` no se escribe directo (sólo con movimientos: `registrar_compra`,
  `ajustar_inventario`, ventas y consumos); `consentimientos` y `movimientos_inventario` no se
  editan ni se borran.
- **Ficha vigente**: `fichas_salud` ordenada por `creado_en desc` (la primera es la vigente).
- **Notas de citas del personal**: `reservar_cita_staff(p_notas)` se guarda en `citas.notas_cliente`
  (visible en `v_citas_detalle`).
- **Pagos con método `cortesia`**: no cuentan como ingreso en `v_resultado_mensual` ni en
  `total_pagado` de `v_clientes_resumen`.
- **`v_clientes_resumen.es_personal`**: `true` si la cuenta ligada a la clienta tiene rol `personal`
  o `admin` (el trigger de alta le crea ficha de clienta a toda cuenta, también a las del equipo);
  `false` sin cuenta. El panel lo usa para separar al equipo de las clientas.
- **Reposición** (`v_reposicion`): `presentaciones_sugeridas = floor((stock_minimo − stock_actual) /
  contenido_presentacion) + 1`, así que comprar lo sugerido deja el stock **por encima** del mínimo
  y el producto sale de la lista (con exactamente una lata de faltante se sugieren dos).
  `costo_estimado = presentaciones_sugeridas × costo_presentacion`.
- **Funciones internas** (no expuestas por la API): `crear_cita_interna`, `cancelar_cita_interna`,
  `completar_cita_interna`, `liquidar_pedido_interna`, `generar_codigo_regalo`,
  `personal_puede_hacer`, `edad_en`, `ip_solicitud`, `firma_valida`, `validar_firma` y los `tg_*`.
- **Resultados**: `v_resultado_mensual` da los últimos 12 meses con actividad **hasta el mes en
  curso** (un gasto con periodo futuro no desplaza a los meses ya vividos).
