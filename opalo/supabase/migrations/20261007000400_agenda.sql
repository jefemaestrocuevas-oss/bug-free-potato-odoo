-- =============================================================================
-- Ópalo · 0400 · Agenda: cabinas, horarios, bloqueos, citas
-- Contrato: opalo/docs/ESPEC.md §4.4
-- =============================================================================

create table public.cabinas (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null,
  activa  boolean not null default true,
  orden   int not null default 0
);
alter table public.cabinas enable row level security;

-- Horario semanal (hora local). 0 = domingo, igual que extract(dow). Puede haber varios rangos por día.
create table public.horarios (
  id           uuid primary key default gen_random_uuid(),
  personal_id  uuid not null references public.personal (id) on delete cascade,
  dia_semana   smallint not null check (dia_semana between 0 and 6),
  hora_inicio  time not null,
  hora_fin     time not null,
  check (hora_fin > hora_inicio)
);
create index horarios_personal_idx on public.horarios (personal_id, dia_semana);
alter table public.horarios enable row level security;

-- personal_id null = todo el spa cerrado (p. ej. día festivo).
create table public.bloqueos_agenda (
  id           uuid primary key default gen_random_uuid(),
  personal_id  uuid references public.personal (id) on delete cascade,
  inicio       timestamptz not null,
  fin          timestamptz not null,
  motivo       text,
  creado_en    timestamptz not null default now(),
  check (fin > inicio)
);
create index bloqueos_agenda_rango_idx on public.bloqueos_agenda using gist (tstzrange(inicio, fin));
alter table public.bloqueos_agenda enable row level security;

create table public.citas (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references public.clientes (id),
  personal_id         uuid not null references public.personal (id),
  cabina_id           uuid not null references public.cabinas (id),
  inicio              timestamptz not null,
  fin                 timestamptz not null,
  estado              public.estado_cita not null default 'confirmada',
  origen              public.origen_cita not null default 'web',
  primera_vez         boolean not null default false,
  requiere_revision   boolean not null default false,
  alertas             text[] not null default '{}',
  notas_cliente       text,
  notas_internas      text,
  total               numeric(10,2) not null default 0 check (total >= 0),
  cancelada_en        timestamptz,
  motivo_cancelacion  text,
  creada_por          uuid,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  check (fin > inicio),
  -- No se empalman citas activas de la misma persona ni de la misma cabina.
  constraint citas_sin_traslape_personal exclude using gist (
    personal_id with =, tstzrange(inicio, fin) with &&
  ) where (estado not in ('cancelada', 'no_asistio')),
  constraint citas_sin_traslape_cabina exclude using gist (
    cabina_id with =, tstzrange(inicio, fin) with &&
  ) where (estado not in ('cancelada', 'no_asistio'))
);
create index citas_cliente_idx on public.citas (cliente_id, inicio desc);
create index citas_inicio_idx on public.citas (inicio);

create trigger citas_actualizado_en
  before update on public.citas
  for each row execute function public.tg_actualizado_en();
alter table public.citas enable row level security;

-- nombre/precio/duracion_min son copia al momento de reservar.
-- credito_id → creditos se agrega en 0600 (ventas).
create table public.cita_items (
  id            uuid primary key default gen_random_uuid(),
  cita_id       uuid not null references public.citas (id) on delete cascade,
  servicio_id   uuid references public.servicios (id),
  paquete_id    uuid references public.paquetes (id),
  credito_id    uuid,
  nombre        text not null,
  precio        numeric(10,2) check (precio >= 0),
  duracion_min  int check (duracion_min >= 0),
  check (num_nonnulls(servicio_id, paquete_id) = 1)
);
create index cita_items_cita_idx on public.cita_items (cita_id);
create index cita_items_credito_idx on public.cita_items (credito_id) where credito_id is not null;
alter table public.cita_items enable row level security;
