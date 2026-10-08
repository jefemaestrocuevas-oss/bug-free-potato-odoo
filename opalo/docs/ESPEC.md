# Ópalo — Especificación técnica (contrato entre base de datos y sitio)

> Este documento es el **contrato**. La base de datos (`opalo/supabase`) y el sitio
> (`opalo/web`) deben usar exactamente los nombres de aquí. Si algo cambia, se cambia
> primero aquí.

## 1. Qué es Ópalo y qué debe hacer el sistema

Ópalo es un spa en Querétaro (Momentum Centro Sur, Torre 2, Int. 207 · WhatsApp
442 170 1466) que abre el 31 de octubre de 2026. Propuesta de valor: **todo lo que
necesitas en un solo lugar** (depilación, faciales, corporales, complementos) y un
equipo **en capacitación constante** (las capacitaciones se registran en la base y se
muestran en el sitio).

El sistema cubre:

1. **Sitio público**: inicio, catálogo de servicios y paquetes, tienda (comprar
   servicios/paquetes/productos, también para regalar), equipo y capacitaciones,
   políticas.
2. **Reservas en línea**: la clienta elige servicios → día en un calendario → hora
   (sesiones de **1 hora**) → inicia sesión → llena su ficha de salud → acepta
   políticas → **firma el consentimiento informado en pantalla** → cita creada.
3. **Portal de clientas**: sus citas (fecha, hora, **quién la atiende**, **tiempo
   estimado**, estado), sus pedidos, sus servicios prepagados (créditos), sus
   documentos firmados, cancelar con la anticipación de la política.
4. **Panel interno** (personal y socios): agenda, clientas, pedidos y pagos,
   inventario (stock, compras, **alertas de reposición** "se acabó la crema"),
   **costo por servicio y margen**, **gastos** (luz, agua, internet, renta…),
   **resultados del mes** (ingresos, costos, gastos, utilidad), catálogo y precios,
   equipo y capacitaciones, políticas.

Stack: **PostgreSQL en Supabase** (Auth + RLS + RPC) y **SPA React + Vite + TypeScript**.
El sitio tiene un **modo demostración** (sin Supabase, datos en el navegador) para
poder verlo y probarlo sin backend.

Zona horaria: `America/Mexico_City` (México sin horario de verano desde 2022 → UTC−6
fijo). En la base todo es `timestamptz`; las horas de horario (`time`) son hora local.

Moneda: MXN, `numeric(10,2)`.

## 2. Convenciones

- Esquema `public`. Nombres en español, `snake_case`, sin acentos ni ñ (`bikini-brasileno`).
- PK `id uuid default gen_random_uuid()`. Timestamps `creado_en timestamptz default now()`,
  `actualizado_en` con trigger `public.tg_actualizado_en()` donde aplique.
- Migraciones en `opalo/supabase/migrations/2026100700XX00_<nombre>.sql` (formato Supabase CLI).
- Extensiones: `btree_gist` (restricciones de traslape de citas). En Supabase se crea
  `with schema extensions`.
- Todas las funciones `security definer` llevan `set search_path = public, extensions`
  (o `''` con nombres calificados) y validan el rol del que llama.
- Mensajes de error al usuario: `raise exception using message = '…', errcode = 'P0001'`
  en español claro (el sitio los muestra tal cual).

## 3. Roles y seguridad

Tipo `rol_usuario`: `cliente | personal | admin`.

- **anon** (visitante): lee catálogo público, equipo público, capacitaciones públicas,
  políticas activas, configuración, productos de tienda; ejecuta `horarios_disponibles`
  y `duracion_reserva`.
- **cliente** (usuaria autenticada): sólo sus propios datos (cliente, citas, pedidos,
  pagos, créditos, fichas, consentimientos, aceptaciones). Escribe sólo vía RPC, salvo
  actualizar sus datos básicos (`nombre, apellidos, telefono, fecha_nacimiento,
  acepta_promociones`) con `GRANT UPDATE (columnas)`.
- **personal**: agenda, clientas, fichas de salud (lectura), consentimientos, pedidos y
  pagos, inventario, recetas, catálogo (lectura), proveedores.
- **admin** (socios): todo lo anterior + gastos, resultados, edición de catálogo y
  precios, equipo, capacitaciones, políticas, roles.

Funciones auxiliares (`stable security definer`):
- `public.mi_rol() returns rol_usuario` (cliente si no hay perfil; null si anon)
- `public.es_personal() returns boolean` (rol personal **o** admin)
- `public.es_admin() returns boolean`
- `public.mi_cliente_id() returns uuid`

RLS **activado en todas las tablas**. Las vistas internas llevan
`with (security_invoker = true)`. Las vistas públicas exponen sólo columnas no sensibles.

Datos sensibles (LFPDPPP): las fichas de salud son datos personales sensibles; sólo la
dueña y el personal pueden leerlas; para guardarlas se exige
`p_acepta_datos_sensibles = true` (consentimiento expreso).

## 4. Tablas

### 4.1 Base
**configuracion** (una sola fila, `id smallint primary key default 1 check (id = 1)`):
`nombre_negocio text, lema text, telefono_whatsapp text, direccion text,
zona_horaria text default 'America/Mexico_City', duracion_sesion_min int default 60,
intervalo_slots_min int default 60, anticipacion_min_horas int default 2,
ventana_reserva_dias int default 60, horas_cancelacion int default 24,
tolerancia_retraso_min int default 15, edad_minima int default 15,
edad_mayoria int default 18, vigencia_creditos_dias int default 365, fecha_apertura date null`
(día de apertura; antes de esa fecha las clientas no ven horarios ni reservan en línea, el
personal sí puede agendar, p. ej. el ensayo de apertura), `actualizado_en`.
Lectura pública; escritura admin.

**perfiles**: `id uuid pk references auth.users(id) on delete cascade, rol rol_usuario
not null default 'cliente', creado_en, actualizado_en`. Trigger `on auth.users insert`
(`public.tg_nuevo_usuario()`, security definer) crea el perfil y crea o **vincula** la fila
de `clientes` (si existe una clienta con el mismo email en minúsculas y sin
`usuario_id`, la vincula; si no, crea una con `nombre, apellidos, telefono,
fecha_nacimiento` de `raw_user_meta_data`). Sólo admin cambia `rol`.

### 4.2 Personas
**clientes**: `id, usuario_id uuid unique null references auth.users(id) on delete set null,
nombre text not null, apellidos text, telefono text, email text, fecha_nacimiento date,
como_nos_conocio text, acepta_promociones boolean default false, notas_internas text,
creado_en, actualizado_en`. Índice único parcial `lower(email)` cuando no es null.
Personal puede crear clientas sin cuenta (las que agendan por WhatsApp o mostrador).
`notas_internas` no se expone a la clienta (el sitio no la pide en las consultas de
cliente; la vista `v_clientes_resumen` es sólo para personal).

**personal**: `id, usuario_id uuid unique null references auth.users(id), slug text unique,
nombre text not null, titulo text, bio text, foto_url text, color_agenda text default '#5C6B3F',
activo boolean default true, mostrar_en_sitio boolean default true, orden int default 0,
creado_en, actualizado_en`. Lectura pública de filas activas.

**capacitaciones**: `id, personal_id uuid not null references personal on delete cascade,
nombre text not null, institucion text, tipo text check in ('curso','taller','diplomado',
'certificacion','congreso') default 'curso', fecha date, horas numeric(6,1),
constancia_url text, mostrar_en_sitio boolean default true, notas text, creado_en`.
Lectura pública si `mostrar_en_sitio`. Es la evidencia de "en capacitación constante".

**personal_servicios**: `personal_id, servicio_id, pk (personal_id, servicio_id)`.
Si un miembro del personal **no tiene filas** aquí, se asume que hace todos los servicios.

### 4.3 Catálogo
**categorias_servicio**: `id, slug unique, nombre, descripcion, orden int`.

**servicios**: `id, categoria_id not null, slug unique, nombre not null, descripcion text,
zonas_incluye text, duracion_min int null check (>= 0)` (null = cabe en la sesión
estándar), `duracion_primera_vez_min int null, precio numeric(10,2) null check (>= 0)`
(null = por confirmar), `etapa etapa_servicio default 'disponible'`
(`disponible | segunda_etapa | requiere_curso`), `es_complemento boolean default false,
reservable_en_linea boolean default true, vendible_en_linea boolean default true,
tipo_consentimiento tipo_politica null, activo boolean default true, orden int,
creado_en, actualizado_en`.

**paquetes**: `id, slug unique, nombre, descripcion, tipo tipo_paquete default 'combo'`
(`combo` = varios servicios en una visita · `bono` = N sesiones del mismo servicio para
usar en varias visitas), `precio numeric(10,2) null, duracion_min int null,
vigencia_dias int null, activo boolean default true, orden int, creado_en, actualizado_en`.

**paquete_servicios**: `paquete_id, servicio_id, cantidad int default 1 check (> 0)`,
pk (paquete_id, servicio_id).

**contraindicaciones**: `id, clave text unique, pregunta text, ayuda text,
categorias text[]` (slugs de categoría a los que aplica; null = todas),
`accion accion_contraindicacion default 'revisar'` (`no_se_realiza | revisar |
precaucion`), `mensaje_cliente text, activa boolean default true, orden int`.

### 4.4 Agenda
**cabinas**: `id, nombre, activa boolean default true, orden int`.

**horarios**: `id, personal_id not null, dia_semana smallint check (0..6)` (0 = domingo,
igual que `extract(dow)`), `hora_inicio time, hora_fin time check (hora_fin > hora_inicio)`.
Puede haber varios rangos por día (comida).

**bloqueos_agenda**: `id, personal_id null` (null = todo el spa cerrado, p. ej. día
festivo), `inicio timestamptz, fin timestamptz check (fin > inicio), motivo text, creado_en`.

**citas**: `id, cliente_id not null, personal_id not null, cabina_id not null,
inicio timestamptz, fin timestamptz check (fin > inicio), estado estado_cita default
'confirmada'` (`pendiente | confirmada | en_curso | completada | cancelada |
no_asistio`), `origen origen_cita default 'web'` (`web | whatsapp | mostrador |
telefono`), `primera_vez boolean default false, requiere_revision boolean default false,
alertas text[] default '{}', notas_cliente text, notas_internas text, total numeric(10,2)
default 0, cancelada_en timestamptz, motivo_cancelacion text, creada_por uuid,
creado_en, actualizado_en`.
Restricciones de exclusión (no se empalman citas activas):
`exclude using gist (personal_id with =, tstzrange(inicio, fin) with &&) where (estado not in ('cancelada','no_asistio'))`
y lo mismo para `cabina_id`.

**cita_items**: `id, cita_id not null on delete cascade, servicio_id null, paquete_id null,
credito_id null, nombre text, precio numeric(10,2) null, duracion_min int null`,
`check (num_nonnulls(servicio_id, paquete_id) = 1)`. `nombre/precio/duracion_min` son
copia al momento de reservar.

### 4.5 Políticas, ficha y consentimiento
**politicas**: `id, tipo tipo_politica` (`terminos | privacidad | cancelacion |
consentimiento_depilacion | consentimiento_facial | consentimiento_corporal`),
`version int, titulo text, contenido_md text, hash_sha256 text` (lo llena un trigger:
sha256 hex del `contenido_md`), `activa boolean default false, vigente_desde timestamptz,
creado_en`. `unique (tipo, version)`; índice único parcial: una sola activa por `tipo`.
Lectura pública de activas; personal lee todas.

**aceptaciones_politica**: `id, cliente_id, politica_id, aceptada_en default now(),
ip text, user_agent text`, `unique (cliente_id, politica_id)`.

**fichas_salud** (historial, la última es la vigente): `id, cliente_id, respuestas jsonb
default '{}'` (`{clave_contraindicacion: boolean}`), `detalles jsonb default '{}'`
(`{clave: texto}`), `alergias text, medicamentos text, observaciones text,
acepta_datos_sensibles boolean not null, creado_en`.

**consentimientos**: `id, cliente_id, cita_id null on delete set null, politica_id`
(versión exacta del consentimiento firmado), `ficha_salud_id null, nombre_firmante text
not null, firma_svg text not null` (trazo de la firma como SVG), `es_menor boolean
default false, tutor_nombre text, documento_hash text` (sha256 de `politica.hash_sha256 ||
ficha.id || firmado_en`), `ip text, user_agent text, firmado_en timestamptz default now()`.
Inmutable: sin UPDATE/DELETE para nadie salvo admin vía service role.

### 4.6 Ventas y pagos
**pedidos**: `id, folio text unique` (`'OP-' || lpad(nextval('pedidos_folio_seq')::text, 5, '0')`),
`cliente_id not null, estado estado_pedido default 'pendiente_pago'` (`pendiente_pago |
pagado | cancelado | reembolsado`), `total numeric(10,2) not null default 0,
metodo_pago_preferido metodo_pago, notas text, creado_en, pagado_en, cancelado_en`.

**pedido_items**: `id, pedido_id on delete cascade, tipo tipo_item_pedido` (`servicio |
paquete | producto`), `servicio_id, paquete_id, producto_id` (exactamente uno según tipo),
`descripcion text, cantidad int check (> 0), precio_unitario numeric(10,2),
importe numeric(10,2) generated always as (cantidad * precio_unitario) stored,
regalo_para text null`.

**pagos**: `id, pedido_id null, cita_id null, check (num_nonnulls(pedido_id, cita_id) >= 1),
monto numeric(10,2) check (> 0), propina numeric(10,2) default 0 check (>= 0),
metodo metodo_pago` (`efectivo | tarjeta | transferencia | mercado_pago | cortesia`),
`referencia text, recibido_por uuid, pagado_en timestamptz default now(), notas text`.
Las propinas se registran aparte del ingreso del spa (son de quien atiende).

**creditos** (servicios prepagados; también regalos): `id, cliente_id not null,
servicio_id null, paquete_id null, check exactamente uno, cantidad int check (> 0),
usados int default 0 check (usados between 0 and cantidad), pedido_item_id null,
codigo_regalo text unique null, regalo_para text, vence_en date, creado_en`.

### 4.7 Inventario y costos
**proveedores**: `id, nombre, contacto, telefono, email, ciudad, notas, activo, creado_en`.

**productos** (insumos de cabina y productos de venta): `id, nombre not null, marca,
categoria text check in ('cera','preparacion','post','facial','corporal','desechable',
'limpieza','venta','otro'), unidad_medida text check in ('g','ml','pz'),
presentacion text` (ej. "Lata 800 g"), `contenido_presentacion numeric(12,3) check (> 0)`
(cuántas unidades de medida trae una presentación), `costo_presentacion numeric(10,2)
default 0, costo_unitario numeric(12,4) generated always as (costo_presentacion /
contenido_presentacion) stored, stock_actual numeric(12,3) default 0, stock_minimo
numeric(12,3) default 0, proveedor_id null, uso text check in ('cabina','venta','ambos')
default 'cabina', precio_venta numeric(10,2) null, vendible_en_linea boolean default false,
activo boolean default true, notas text, creado_en, actualizado_en`.
Stock siempre en `unidad_medida` (g, ml o piezas).

**recetas_servicio** (cuánto se gasta de cada producto por servicio): `servicio_id,
producto_id, cantidad numeric(12,3) check (> 0)` (en unidad_medida del producto),
`notas, pk (servicio_id, producto_id)`.

**compras**: `id, proveedor_id null, fecha date default current_date, folio text,
total numeric(10,2), notas, registrada_por uuid, creado_en`.
**compra_items**: `id, compra_id on delete cascade, producto_id, presentaciones
numeric(12,3) check (> 0), costo_presentacion numeric(10,2) check (>= 0)`.

**movimientos_inventario**: `id, producto_id not null, tipo tipo_movimiento` (`compra |
consumo | venta | ajuste | merma`), `cantidad numeric(12,3) not null` (+ entra, − sale),
`costo_unitario numeric(12,4)` (copia del costo al momento), `cita_id, compra_id,
pedido_id null, nota text, creado_por uuid, creado_en`. Trigger after insert:
`productos.stock_actual += cantidad`. Sin UPDATE/DELETE (se corrige con un `ajuste`).

### 4.8 Gastos
**categorias_gasto**: `id, slug unique, nombre, es_fijo boolean`.
**gastos_recurrentes**: `id, categoria_id, concepto, monto_estimado numeric(10,2) null,
frecuencia frecuencia_gasto` (`mensual | bimestral | trimestral | anual`), `dia_pago
smallint check (1..31), proximo_vencimiento date, activo boolean default true, notas`.
**gastos**: `id, categoria_id not null, concepto text not null, monto numeric(10,2) check (> 0),
fecha date default current_date, periodo date` (primer día del mes al que corresponde;
default `date_trunc('month', fecha)`), `metodo_pago metodo_pago, proveedor text,
comprobante_url text, recurrente_id null, notas, registrado_por uuid, creado_en`.
Trigger: al insertar un gasto con `recurrente_id`, `proximo_vencimiento` avanza un
periodo según `frecuencia`.
Sólo admin lee/escribe gastos.

## 5. Reglas de negocio

- **R1 Reservable**: servicio `activo and etapa = 'disponible' and reservable_en_linea`;
  paquete `activo`. Un servicio con precio null **sí** se puede reservar (se cobra en
  cabina; el sitio dice "precio por confirmar"). Un complemento sólo se reserva junto
  con al menos un servicio no complemento.
- **R2 Duración** (`duracion_reserva(p_items jsonb) returns int`): suma de
  `coalesce(duracion_min, 0)` de los ítems (paquete: su `duracion_min`, o si es null la
  suma de sus servicios × cantidad); el resultado se redondea **hacia arriba** al múltiplo
  de `intervalo_slots_min` y nunca es menor que `duracion_sesion_min`. Con los datos
  actuales (duraciones null) **toda cita dura 1 hora**.
- **R3 Horarios disponibles** (`horarios_disponibles(p_fecha date, p_duracion_min int
  default null, p_personal_id uuid default null) returns table (inicio timestamptz,
  fin timestamptz, personal_id uuid, personal_nombre text)`, security definer, para anon):
  para cada miembro del personal activo (o el indicado) que pueda hacer los servicios,
  genera inicios cada `intervalo_slots_min` desde `hora_inicio` de cada rango de su
  horario de ese `dow`, en hora local `America/Mexico_City`; el bloque
  `[inicio, inicio + duracion)` debe caber completo en el rango, no traslapar citas
  activas (`estado not in ('cancelada','no_asistio')`) de esa persona, ni bloqueos
  (suyos o globales), debe existir **alguna cabina activa libre**, `inicio >= now() +
  anticipacion_min_horas`, y `p_fecha <= hoy_local + ventana_reserva_dias`; si quien consulta
  **no** es personal y `p_fecha < fecha_apertura`, no hay horarios. Ordenado por
  inicio y orden del personal. Si `p_duracion_min` es null usa `duracion_sesion_min`.
- **R4 Reservar** (`reservar_cita`): requiere sesión con fila en `clientes`; la fecha local de la
  cita debe ser ≥ `fecha_apertura` (si no: 'Ese horario no está disponible.'); `fecha_nacimiento`
  obligatoria ('Para reservar necesitamos tu fecha de nacimiento.'); máximo 3 citas próximas
  (pendiente/confirmada) por clienta; las
  políticas **activas** de tipo `terminos`, `privacidad` y `cancelacion` aceptadas por la
  clienta; una ficha de salud registrada (la UI la pide/confirma en cada reserva);
  si hay `fecha_nacimiento`: edad ≥ `edad_minima` (si no, error) y si edad <
  `edad_mayoria` exige `p_tutor_nombre`. Calcula duración y total **en el servidor**;
  asigna personal (si no viene) y cabina libre; marca `primera_vez` si no tiene citas
  completadas. Crea **un consentimiento por cada `tipo_consentimiento` distinto** de
  los servicios reservados (política activa de ese tipo) con la firma recibida, ligado a
  la cita. Si la ficha vigente tiene `true` en una contraindicación activa con acción
  `revisar` o `no_se_realiza` que aplique a alguna categoría reservada → cita
  `pendiente`, `requiere_revision = true`, `alertas` con las preguntas marcadas (el
  personal confirma por WhatsApp); si no → `confirmada`. Si se usa `credito_id`, debe
  ser de la clienta, vigente, con saldo y del mismo servicio/paquete: `usados += 1` y el
  precio del ítem es 0. Si choca con otra cita (exclusion_violation) → error "Ese horario
  se acaba de ocupar, elige otro".
- **R5 Cancelar** (`cancelar_cita`): la clienta puede cancelar su cita `pendiente` o
  `confirmada` si faltan ≥ `horas_cancelacion` horas; si no → error "Faltan menos de 24
  horas para tu cita. Escríbenos por WhatsApp al 442 170 1466". El personal puede cancelar
  siempre. Al cancelar se devuelven los créditos usados (`usados -= 1`).
- **R6 Sin consentimiento no hay servicio**: `cambiar_estado_cita` a `en_curso` o
  `completada` exige al menos un consentimiento ligado a la cita. Las citas creadas por el
  personal (WhatsApp/mostrador) nacen sin firma; la clienta firma desde su portal
  (`firmar_consentimiento_cita`) o en la tablet de la cabina.
- **R7 Completar** (`completar_cita`, personal): estado `completada`; por cada servicio
  (expandiendo paquetes × cantidad) inserta movimientos `consumo` según `recetas_servicio`
  con `costo_unitario` vigente. Idempotente (no descuenta dos veces).
- **R8 Pedido** (`crear_pedido`): precios en el servidor; sólo ítems vendibles con
  precio (servicio: `activo, etapa disponible, vendible_en_linea, precio not null`;
  paquete: `activo, precio not null`; producto: `activo, vendible_en_linea,
  precio_venta not null`). Estado `pendiente_pago` (no hay pasarela todavía: se paga en
  el spa o por transferencia y el personal lo registra).
- **R9 Pago** (`registrar_pago`, personal): inserta pago; si es de pedido y la suma de
  pagos ≥ total → `pagado`, `pagado_en`, y genera **créditos**: servicio → crédito del
  servicio × cantidad; paquete `combo` → crédito del paquete × cantidad; paquete `bono` →
  crédito de su servicio × (cantidad × `paquete_servicios.cantidad`). `vence_en =
  current_date + coalesce(paquete.vigencia_dias, vigencia_creditos_dias)`. Si el ítem
  tiene `regalo_para` → crédito con `codigo_regalo` (8 caracteres A-Z0-9 sin 0/O/1/I) y
  `regalo_para`. Productos → movimiento `venta` (−cantidad).
- **R10 Regalo** (`canjear_regalo(p_codigo text) returns uuid`): pasa el crédito a la
  clienta que canjea y limpia el código.
- **R11 Compra** (`registrar_compra`): crea compra + ítems + movimientos `compra`
  (`presentaciones × contenido_presentacion`) y actualiza `productos.costo_presentacion`
  al último costo.
- **R12 Reposición**: un producto necesita reposición si `stock_actual <= stock_minimo`.
- **R13 Políticas** (`publicar_politica`, admin): nueva versión = max + 1, se activa y
  desactiva la anterior. Las clientas deben aceptar la versión nueva en su siguiente
  reserva.

### 5.1 Endurecimiento (agregado tras la revisión de seguridad)

- `anon` no lee las tablas `personal`, `capacitaciones`, `horarios`, `cabinas` ni
  `personal_servicios`: el sitio público usa `personal_publico` y `capacitaciones_publicas`.
- `authenticated` no tiene SELECT sobre `clientes.notas_internas`, `citas.notas_internas`,
  `citas.creada_por`, `pagos.recibido_por` ni `pagos.notas` (GRANT por columnas).
- Los objetos nuevos de `public` no reciben permisos por defecto: cada migración otorga lo suyo.
- Vinculación de expediente: el trigger de alta liga una cuenta nueva a una clienta existente
  (mismo correo, sin cuenta) **sólo cuando el correo está confirmado** (`email_confirmed_at`).
  Hay que activar "Confirm email" en Supabase Auth.
- La clienta no puede cambiar su `fecha_nacimiento` una vez registrada (la corrige el personal).
- Límites: 3 citas próximas por clienta (el personal no tiene límite), 5 pedidos por pagar,
  cantidades enteras 1–99, `crear_pedido` sólo acepta efectivo, tarjeta o transferencia.
- Firma: `firma_valida(text)` exige un `<svg>` sólo con trazos (sin scripts, eventos ni
  enlaces), ≤ 200 000 caracteres; nombres ≤ 200; notas ≤ 1000; campos de ficha ≤ 2000.
- `consentimientos` guarda además `capturado_por uuid` y `canal` (`reserva_web | portal | cabina`);
  `documento_hash` = sha256 de política, clienta, cita, ficha, firmante, tutor, menor,
  sha256 de la firma y fecha.
- Mensajes nuevos: 'Para reservar necesitamos tu fecha de nacimiento.', 'Para firmar
  necesitamos tu fecha de nacimiento.', 'Ya tienes 3 citas próximas; para agendar otra
  escríbenos por WhatsApp al 442 170 1466.', 'Tienes 5 pedidos por pagar; págalos o cancela
  alguno antes de hacer otro.', 'Elige efectivo, tarjeta o transferencia.', 'No pudimos leer
  tu firma; bórrala y vuelve a firmar.', 'El nombre es muy largo; escríbelo en máximo 200
  caracteres.', 'Las notas son muy largas; escríbelas en máximo 1000 caracteres.', 'Tu fecha
  de nacimiento ya está registrada; si hay un error, escríbenos por WhatsApp al 442 170
  1466.', 'Elige qué consentimiento firma la clienta para este servicio.', 'Esta cita se
  marcó como no asistió.'

## 6. Funciones RPC (firmas exactas)

Todas en `public`. `p_items` de reserva: `[{"servicio_id": uuid} | {"paquete_id": uuid}, + opcional "credito_id": uuid]`.

| Función | Devuelve | Quién |
|---|---|---|
| `duracion_reserva(p_items jsonb)` | `int` | todos |
| `horarios_disponibles(p_fecha date, p_duracion_min int default null, p_personal_id uuid default null)` | `table(inicio timestamptz, fin timestamptz, personal_id uuid, personal_nombre text)` | todos |
| `guardar_ficha_salud(p_respuestas jsonb, p_detalles jsonb, p_alergias text, p_medicamentos text, p_observaciones text, p_acepta_datos_sensibles boolean)` | `uuid` | cliente |
| `aceptar_politicas(p_politica_ids uuid[], p_user_agent text default null)` | `void` | cliente |
| `reservar_cita(p_items jsonb, p_inicio timestamptz, p_nombre_firmante text, p_firma_svg text, p_personal_id uuid default null, p_notas text default null, p_tutor_nombre text default null, p_user_agent text default null)` | `jsonb {id, estado, requiere_revision, alertas}` | cliente |
| `reservar_cita_staff(p_cliente_id uuid, p_items jsonb, p_inicio timestamptz, p_personal_id uuid default null, p_origen origen_cita default 'whatsapp', p_notas text default null)` | `jsonb {id, estado, requiere_revision, alertas}` | personal |
| `firmar_consentimiento_cita(p_cita_id uuid, p_nombre_firmante text, p_firma_svg text, p_tutor_nombre text default null, p_user_agent text default null)` | `void` | dueña de la cita o personal |
| `cancelar_cita(p_cita_id uuid, p_motivo text default null)` | `void` | dueña o personal |
| `cambiar_estado_cita(p_cita_id uuid, p_estado estado_cita)` | `void` | personal |
| `completar_cita(p_cita_id uuid)` | `void` | personal |
| `crear_pedido(p_items jsonb, p_metodo_pago metodo_pago default 'efectivo', p_notas text default null)` | `jsonb {id, folio, total}` | cliente |
| `cancelar_pedido(p_pedido_id uuid)` | `void` | dueña (si pendiente_pago) o personal |
| `registrar_pago(p_monto numeric, p_metodo metodo_pago, p_pedido_id uuid default null, p_cita_id uuid default null, p_referencia text default null, p_propina numeric default 0)` | `uuid` | personal |
| `canjear_regalo(p_codigo text)` | `uuid` | cliente |
| `registrar_compra(p_items jsonb, p_proveedor_id uuid default null, p_fecha date default current_date, p_folio text default null, p_notas text default null)` | `uuid` | personal |
| `ajustar_inventario(p_producto_id uuid, p_cantidad numeric, p_tipo tipo_movimiento, p_nota text default null)` | `void` | personal (`ajuste` o `merma`) |
| `publicar_politica(p_tipo tipo_politica, p_titulo text, p_contenido_md text)` | `uuid` | admin |
| `guardar_paquete(p_id uuid, p_datos jsonb, p_items jsonb)` | `uuid` | admin (upsert del paquete + reemplazo de `paquete_servicios` en una transacción; `p_id` null = nuevo; `p_items = [{servicio_id, cantidad}]`) |
| `guardar_horarios(p_personal_id uuid, p_horarios jsonb)` | `void` | admin (reemplaza los rangos; `[{dia_semana, hora_inicio, hora_fin}]`; valida fin > inicio y sin traslapes el mismo día) |
| `guardar_receta(p_servicio_id uuid, p_items jsonb)` | `void` | personal (reemplaza la receta; `[{producto_id, cantidad, notas}]`) |

`p_items` de pedido: `[{"tipo": "servicio"|"paquete"|"producto", "id": uuid, "cantidad": int, "regalo_para": text|null}]`.
`p_items` de compra: `[{"producto_id": uuid, "presentaciones": numeric, "costo_presentacion": numeric}]`.

La IP se toma de `current_setting('request.headers', true)::json->>'x-forwarded-for'`
(null en local).

### 6.1 Escrituras directas (sin RPC) permitidas por RLS

Además de las RPC, el sitio escribe directo en estas tablas (supabase-js `insert/update/delete`):

| Tabla | Operación | Quién |
|---|---|---|
| `clientes` | update de `nombre, apellidos, telefono, fecha_nacimiento, acepta_promociones` (sólo su fila) | cliente |
| `clientes` | insert, update (incl. `notas_internas`) | personal |
| `bloqueos_agenda` | insert, update, delete | personal |
| `proveedores`, `productos` (excepto `stock_actual`, que sólo cambia con movimientos) | insert, update | personal |
| `recetas_servicio` | sólo vía `guardar_receta` | personal |
| `categorias_servicio`, `servicios` | insert, update, delete | admin |
| `paquetes`, `paquete_servicios` | sólo vía `guardar_paquete` | admin |
| `personal`, `personal_servicios`, `capacitaciones` | insert, update, delete | admin |
| `horarios` | sólo vía `guardar_horarios` | admin |
| `gastos`, `gastos_recurrentes` | insert, update, delete | admin |
| `configuracion` | update | admin |
| `perfiles` | update de `rol` | admin |

Lectura adicional: la clienta puede leer las filas de `politicas` (aunque ya no estén
activas) que aceptó o firmó, para ver sus documentos. El personal lee `fichas_salud`,
`consentimientos`, `aceptaciones_politica`, `movimientos_inventario`, `compras`.

## 7. Vistas (columnas exactas)

Públicas (owner, sólo columnas no sensibles, `grant select to anon, authenticated`):
- **personal_publico**: `id, slug, nombre, titulo, bio, foto_url, orden` (activo y mostrar_en_sitio).
- **capacitaciones_publicas**: `id, personal_id, nombre, institucion, tipo, fecha, horas` (mostrar_en_sitio, de personal visible), orden fecha desc.
- **productos_tienda**: `id, nombre, marca, presentacion, precio_venta, hay_stock boolean` (activo, vendible_en_linea, precio_venta not null).

Internas (`security_invoker = true`):
- **v_citas_detalle**: `id, cliente_id, cliente_nombre, cliente_telefono, inicio, fin,
  duracion_min, estado, origen, primera_vez, requiere_revision, alertas, notas_cliente,
  total, personal_id, personal_nombre, personal_titulo, cabina_nombre,
  consentimientos_firmados int, pagado numeric, items jsonb`
  (`items = [{nombre, precio, duracion_min, servicio_id, paquete_id}]`). La clienta ve las suyas; el personal todas.
- **v_pedidos_detalle**: `id, folio, cliente_id, cliente_nombre, estado, total, pagado
  numeric, metodo_pago_preferido, notas, creado_en, pagado_en, items jsonb`
  (`[{tipo, descripcion, cantidad, precio_unitario, importe, regalo_para}]`).
- **v_creditos**: `id, cliente_id, nombre, servicio_id, paquete_id, cantidad, usados,
  restantes, vence_en, vigente boolean, codigo_regalo, regalo_para, creado_en`.
- **v_clientes_resumen** (personal): `id, nombre, apellidos, telefono, email,
  fecha_nacimiento, tiene_cuenta boolean, citas_completadas int, ultima_visita
  timestamptz, proxima_cita timestamptz, total_pagado numeric, creado_en,
  es_personal boolean` (la cuenta ligada tiene rol personal o admin; el panel las separa).
- **v_clientes_notas** (personal; vista del dueño con filtro `es_personal()`): `id, notas_internas`.
  Es la única forma de leer `clientes.notas_internas` (la columna no tiene SELECT para authenticated).
- **v_costo_servicio** (personal): `servicio_id, slug, nombre, categoria, precio,
  costo_material numeric, margen numeric, margen_pct numeric, tiene_receta boolean`.
- **v_reposicion** (personal): `id, nombre, marca, unidad_medida, stock_actual,
  stock_minimo, faltante, presentacion, contenido_presentacion,
  presentaciones_sugeridas int, costo_estimado, proveedor_nombre` (sólo los que
  necesitan reposición). `presentaciones_sugeridas = floor((stock_minimo − stock_actual) /
  contenido_presentacion) + 1`: comprar lo sugerido deja el stock **por encima** del mínimo.
- **v_gastos_por_vencer** (admin): `id, concepto, categoria, monto_estimado, frecuencia,
  proximo_vencimiento, dias_restantes int, estado text` (`vencido | proximo` (≤ 7 días) `| al_corriente`).
- **v_resultado_mensual** (admin): `mes date, ingresos numeric` (pagos sin propina),
  `propinas, costo_insumos` (−Σ consumo × costo_unitario), `compras` (Σ compras),
  `gastos` (Σ gastos por periodo), `utilidad` (ingresos − costo_insumos − gastos),
  `flujo` (ingresos − compras − gastos), `citas_completadas int`. Últimos 12 meses con
  actividad, mes en hora local.

## 8. Archivos y responsables

```
opalo/
  datos/catalogo.json          ← fuente única del catálogo (servicios, paquetes, horarios…)
  datos/politicas/*.md         ← borradores de políticas (6 archivos, uno por tipo_politica)
  docs/ESPEC.md                ← este contrato
  docs/MODELO_DATOS.md         ← explicación para los socios + diagrama
  supabase/
    migrations/*.sql
    local/auth_shim.sql        ← imita auth.users, auth.uid(), roles anon/authenticated/service_role para probar en Postgres local
    scripts/generar_seed.mjs   ← datos/ → supabase/seed.sql
    scripts/probar_local.sh    ← crea BD opalo_test, aplica shim + migraciones + seed + seed_demo + tests
    seed.sql                   ← generado (catálogo real)
    seed_demo.sql              ← datos de ejemplo SOLO para pruebas/local
    tests/*.sql
  web/                         ← SPA (ver web/README en el README principal)
```

El sitio consume la base **sólo** a través de `web/src/lib/api/tipos.ts` (`OpaloApi`).
Implementaciones: `supabase.ts` (real) y `demo.ts` (navegador). Se elige en
`web/src/lib/api/index.ts`: si existen `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
→ Supabase; si no, demo **sólo** en desarrollo (`npm run dev`), con `--mode demo` o en pruebas.
Una compilación de producción sin variables usa `sinConfigurar.ts`: cada operación responde que
el sitio no está conectado (nunca usa datos de ejemplo). `npm run build:medir` compila con
variables de ejemplo (`.env.medir`) para medir el paquete real.
