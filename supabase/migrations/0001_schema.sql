-- ============================================================
-- envio_masivo_email — Esquema base
-- ============================================================

-- Perfiles (1:1 con auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text,
  rol text not null default 'editor' check (rol in ('admin','editor')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Plantillas reutilizables (visual Unlayer / texto enriquecido)
create table if not exists public.plantillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('visual','texto')),
  design_json jsonb,                 -- diseño Unlayer (solo tipo 'visual')
  html text not null,                -- HTML final exportado/renderizado
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Campañas de envío
create table if not exists public.campanias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  plantilla_id uuid references public.plantillas(id),
  asunto text not null,
  remitente_nombre text not null default 'CAC Santa Bárbara',
  adjuntos jsonb not null default '[]'::jsonb,  -- [{nombre, path, mime, size}]
  total_destinatarios int not null default 0,
  estado text not null default 'borrador'
    check (estado in ('borrador','enviando','enviada','error')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  enviada_at timestamptz
);

-- Un registro por destinatario (unidad de tracking)
create table if not exists public.envios (
  id uuid primary key default gen_random_uuid(),
  campania_id uuid not null references public.campanias(id) on delete cascade,
  email text not null,
  datos jsonb not null default '{}'::jsonb,     -- columnas del Excel para el merge
  resend_id text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','enviado','entregado','abierto','clic','rebote','fallido')),
  error text,
  enviado_at timestamptz,
  entregado_at timestamptz,
  abierto_at timestamptz,
  clic_at timestamptz
);

-- Log crudo de eventos del webhook de Resend (auditoría)
create table if not exists public.eventos_email (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid references public.envios(id) on delete cascade,
  resend_id text,
  tipo text,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_envios_campania on public.envios(campania_id);
create index if not exists idx_envios_resend on public.envios(resend_id);
create index if not exists idx_envios_estado on public.envios(estado);
create index if not exists idx_campanias_creada on public.campanias(created_at desc);

-- Trigger updated_at en plantillas
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_plantillas_updated on public.plantillas;
create trigger trg_plantillas_updated before update on public.plantillas
  for each row execute function public.set_updated_at();

-- Bucket privado para adjuntos de campañas
insert into storage.buckets (id, name, public)
values ('adjuntos-campanias', 'adjuntos-campanias', false)
on conflict (id) do nothing;
