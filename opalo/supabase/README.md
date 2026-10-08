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
    20261007000900_funciones.sql    RPC de §6 (reservar, cancelar, completar, pedidos, pagos, compras…)
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

- **Se sobrescribe con lo de `catalogo.json`**: configuración, categorías, servicios, paquetes (y
  sus servicios), contraindicaciones y categorías de gasto (upsert por `slug`/`clave`; sólo las
  columnas que vienen en el JSON). Si un precio se cambió desde el panel, cámbialo también en
  `catalogo.json` o se perderá al resembrar.
- **No se toca**: personal, horarios, cabinas y gastos recurrentes (sólo se insertan si no existen).
- **Políticas**: se inserta la versión 1 activa sólo si no existe ninguna de ese tipo. Para cambiar
  una política publicada usa el panel (`publicar_politica`), que crea la versión 2, 3…

> `seed_demo.sql` **nunca** se aplica en producción: crea usuarios ficticios directo en `auth.users`.

## 3. Crear el primer admin

1. Regístrate en el sitio (o crea el usuario en *Authentication → Users*). El trigger
   `on_auth_user_created` le crea su perfil (`rol = 'cliente'`) y su ficha de clienta.
2. En el SQL Editor:

```sql
update public.perfiles set rol = 'admin'
 where id = (select id from auth.users where email = 'socia@ejemplo.mx');
```

Para personal de cabina: `rol = 'personal'`, y liga su usuario con su ficha de equipo:

```sql
update public.personal set usuario_id = (select id from auth.users where email = 'especialista@ejemplo.mx')
 where slug = 'especialista';
```

Después, los roles se cambian desde el panel (sólo admin puede).

**Antes de abrir (31 oct 2026)**, si el sitio se publica antes, cierra la agenda con un bloqueo global:

```sql
insert into public.bloqueos_agenda (personal_id, inicio, fin, motivo)
values (null, now(), '2026-10-31 00:00 America/Mexico_City', 'Antes de la apertura');
```

## 4. Probar en local (PostgreSQL 16)

```bash
opalo/supabase/scripts/probar_local.sh
```

(Re)crea la base `opalo_test` y aplica, con `ON_ERROR_STOP`:
`local/auth_shim.sql` → `migrations/*.sql` → `seed.sql` (dos veces, para probar que es idempotente)
→ `seed_demo.sql` → `local/pruebas.sql` → `tests/*.sql`. Imprime un resumen y sale con código ≠ 0
si algo falla. Avisa si `seed.sql` no está al día con `datos/`.

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
  clienta (o la vincula si el personal ya la había registrado con ese email).
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
  `Esta versión ya fue aceptada o firmada por alguna clienta: publica una versión nueva.`
  En `crear_pedido`, un servicio/paquete/producto que no se puede comprar responde
  `Uno de los productos ya no está disponible para compra en línea.`
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
- **Funciones internas** (no expuestas por la API): `crear_cita_interna`, `cancelar_cita_interna`,
  `completar_cita_interna`, `liquidar_pedido_interna`, `generar_codigo_regalo`,
  `personal_puede_hacer`, `edad_en`, `ip_solicitud` y los `tg_*`.
