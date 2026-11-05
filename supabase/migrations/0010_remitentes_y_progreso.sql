-- ============================================================
-- Remitentes administrables (envíos clínicos y no clínicos) y progreso en vivo
-- ============================================================

-- Solo un administrador define desde qué direcciones se puede enviar.
-- Resend exige además que el dominio de cada dirección esté verificado.
create table if not exists public.remitentes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null unique check (email = lower(trim(email))),
  responder_a text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.remitentes enable row level security;

create policy "remitentes lectura usuarios activos" on public.remitentes
  for select to authenticated using ((select public.usuario_activo()));
create policy "remitentes gestion admin" on public.remitentes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.remitentes to authenticated;
grant all on public.remitentes to service_role;

insert into public.remitentes (nombre, email)
values ('CAC Santa Bárbara', 'notificaciones@cacsantabarbara.co')
on conflict (email) do nothing;

alter table public.campanias
  add column if not exists remitente_email text not null default 'notificaciones@cacsantabarbara.co';
alter table public.campanias add column if not exists responder_a text;

-- La dirección se toma del catálogo, nunca del cliente. El nombre visible y el
-- "responder a" sí se pueden ajustar para cada campaña.
create or replace function public.crear_campania(p_campania jsonb, p_envios jsonb)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := (p_campania->>'id')::uuid;
  v_remitente public.remitentes;
  v_total int;
begin
  select * into v_remitente from public.remitentes r
  where r.activo and (
    r.id = (p_campania->>'remitente_id')::uuid
    or (p_campania->>'remitente_id' is null and r.email = 'notificaciones@cacsantabarbara.co')
  );
  if v_remitente.id is null then
    raise exception 'El remitente no existe o está inactivo';
  end if;

  insert into public.campanias (
    id, nombre, asunto, plantilla_id, adjuntos, total_destinatarios, estado, created_by, en_cola,
    remitente_nombre, remitente_email, responder_a
  )
  values (
    v_id,
    p_campania->>'nombre',
    p_campania->>'asunto',
    (p_campania->>'plantilla_id')::uuid,
    coalesce(p_campania->'adjuntos', '[]'::jsonb),
    0,
    'borrador',
    auth.uid(),
    false,
    coalesce(nullif(trim(p_campania->>'remitente_nombre'), ''), v_remitente.nombre),
    v_remitente.email,
    coalesce(nullif(trim(p_campania->>'responder_a'), ''), v_remitente.responder_a)
  )
  on conflict (id) do nothing;

  if not found then
    return v_id;  -- ya existía: no se tocan sus destinatarios
  end if;

  insert into public.envios (campania_id, email, datos)
  select v_id, x.email, coalesce(x.datos, '{}'::jsonb)
  from jsonb_to_recordset(p_envios) as x(email text, datos jsonb)
  on conflict (campania_id, lower(email)) do nothing;

  select count(*) into v_total from public.envios where campania_id = v_id;
  -- Se activa al final: el servidor nunca toma una campaña a medio crear.
  update public.campanias set total_destinatarios = v_total, en_cola = true where id = v_id;
  return v_id;
end $$;

-- La barra de progreso consulta esto durante el envío. Es security invoker:
-- un usuario inactivo no ve filas y solo obtiene ceros.
grant execute on function public.progreso_campania(uuid) to authenticated;
