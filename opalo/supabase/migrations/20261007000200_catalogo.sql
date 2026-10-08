-- =============================================================================
-- Ópalo · 0200 · Catálogo: categorías, servicios, paquetes, contraindicaciones
-- Contrato: opalo/docs/ESPEC.md §4.3
-- =============================================================================

create table public.categorias_servicio (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  nombre       text not null,
  descripcion  text,
  orden        int  not null default 0
);
alter table public.categorias_servicio enable row level security;

create table public.servicios (
  id                         uuid primary key default gen_random_uuid(),
  categoria_id               uuid not null references public.categorias_servicio (id),
  slug                       text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  nombre                     text not null,
  descripcion                text,
  zonas_incluye              text,
  duracion_min               int check (duracion_min >= 0),             -- null = cabe en la sesión estándar
  duracion_primera_vez_min   int check (duracion_primera_vez_min >= 0),
  precio                     numeric(10,2) check (precio >= 0),          -- null = por confirmar
  etapa                      public.etapa_servicio not null default 'disponible',
  es_complemento             boolean not null default false,
  reservable_en_linea        boolean not null default true,
  vendible_en_linea          boolean not null default true,
  tipo_consentimiento        public.tipo_politica
                               check (tipo_consentimiento is null or tipo_consentimiento::text like 'consentimiento\_%'),
  activo                     boolean not null default true,
  orden                      int not null default 0,
  creado_en                  timestamptz not null default now(),
  actualizado_en             timestamptz not null default now()
);
create index servicios_categoria_idx on public.servicios (categoria_id, orden);

create trigger servicios_actualizado_en
  before update on public.servicios
  for each row execute function public.tg_actualizado_en();
alter table public.servicios enable row level security;

create table public.paquetes (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  nombre          text not null,
  descripcion     text,
  tipo            public.tipo_paquete not null default 'combo',
  precio          numeric(10,2) check (precio >= 0),
  duracion_min    int check (duracion_min >= 0),
  vigencia_dias   int check (vigencia_dias > 0),
  activo          boolean not null default true,
  orden           int not null default 0,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create trigger paquetes_actualizado_en
  before update on public.paquetes
  for each row execute function public.tg_actualizado_en();
alter table public.paquetes enable row level security;

create table public.paquete_servicios (
  paquete_id   uuid not null references public.paquetes (id) on delete cascade,
  servicio_id  uuid not null references public.servicios (id),
  cantidad     int  not null default 1 check (cantidad > 0),
  primary key (paquete_id, servicio_id)
);
create index paquete_servicios_servicio_idx on public.paquete_servicios (servicio_id);
alter table public.paquete_servicios enable row level security;

create table public.contraindicaciones (
  id               uuid primary key default gen_random_uuid(),
  clave            text not null unique check (clave ~ '^[a-z0-9][a-z0-9_-]*$'),
  pregunta         text not null,
  ayuda            text,
  categorias       text[],                -- slugs de categoría; null = todas
  accion           public.accion_contraindicacion not null default 'revisar',
  mensaje_cliente  text,
  activa           boolean not null default true,
  orden            int not null default 0
);
alter table public.contraindicaciones enable row level security;
