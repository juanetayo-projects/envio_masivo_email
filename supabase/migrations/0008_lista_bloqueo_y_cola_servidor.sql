-- ============================================================
-- Fase 2: lista de bloqueo y campañas que continúan en el servidor
-- ============================================================

-- ---------- Lista de bloqueo ----------
create table if not exists public.correos_bloqueados (
  email text primary key check (email = lower(trim(email))),
  motivo text not null check (motivo in ('rebote','queja','manual')),
  nota text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.correos_bloqueados enable row level security;

create policy "bloqueados lectura usuarios activos" on public.correos_bloqueados
  for select to authenticated using ((select public.usuario_activo()));
-- Los rebotes y quejas los registra el webhook; a mano solo se agregan 'manual'.
create policy "bloqueados alta manual usuarios activos" on public.correos_bloqueados
  for insert to authenticated with check ((select public.usuario_activo()) and motivo = 'manual');
create policy "bloqueados edicion usuarios activos" on public.correos_bloqueados
  for update to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));
-- Quitar un correo vuelve a permitir envíos a una dirección problemática.
create policy "bloqueados borrado admin" on public.correos_bloqueados
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.correos_bloqueados to authenticated;
grant all on public.correos_bloqueados to service_role;

-- Rebotes permanentes y quejas que ya llegaron antes de existir la lista.
insert into public.correos_bloqueados (email, motivo, nota)
select distinct on (lower(trim(e.email)))
  lower(trim(e.email)),
  case when v.tipo = 'email.complained' then 'queja' else 'rebote' end,
  'Registrado desde el historial de eventos'
from public.eventos_email v
join public.envios e on e.id = v.envio_id
where v.tipo = 'email.complained'
   or (v.tipo = 'email.bounced' and v.payload->'data'->'bounce'->>'type' = 'Permanent')
order by lower(trim(e.email)), v.created_at
on conflict (email) do nothing;

create or replace function public.buscar_bloqueados(p_emails text[])
returns setof public.correos_bloqueados
language sql stable security invoker set search_path = '' as $$
  select b.* from public.correos_bloqueados b
  where b.email in (select lower(trim(x)) from unnest(p_emails) as x);
$$;

revoke execute on function public.buscar_bloqueados(text[]) from public, anon;
grant execute on function public.buscar_bloqueados(text[]) to authenticated;

-- ---------- Estados y cola del servidor ----------
alter table public.envios drop constraint if exists envios_estado_check;
alter table public.envios add constraint envios_estado_check
  check (estado in ('pendiente','enviando','enviado','entregado','abierto','clic','rebote','fallido','omitido'));

alter table public.campanias add column if not exists en_cola boolean not null default false;
alter table public.campanias add column if not exists error_detalle text;
create index if not exists idx_campanias_en_cola on public.campanias(created_at) where en_cola;

-- Ahora nace en cola: si el navegador se cierra enseguida, el servidor la toma.
create or replace function public.crear_campania(p_campania jsonb, p_envios jsonb)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := (p_campania->>'id')::uuid;
  v_total int;
begin
  insert into public.campanias (id, nombre, asunto, plantilla_id, adjuntos, total_destinatarios, estado, created_by, en_cola)
  values (
    v_id,
    p_campania->>'nombre',
    p_campania->>'asunto',
    (p_campania->>'plantilla_id')::uuid,
    coalesce(p_campania->'adjuntos', '[]'::jsonb),
    0,
    'borrador',
    auth.uid(),
    false
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

-- La lista se revisa justo antes de enviar: cubre lo bloqueado después de importar
-- y los reintentos. Las filas 'enviando' quedan fuera porque pudieron haber salido.
create or replace function public.reclamar_lote(p_campania uuid, p_limite int)
returns setof public.envios
language plpgsql security invoker set search_path = '' as $$
declare
  v_lote uuid;
begin
  update public.envios e
  set estado = 'omitido', error = 'En lista de bloqueo (' || b.motivo || ')', lote_id = null
  from public.correos_bloqueados b
  where e.campania_id = p_campania and e.estado = 'pendiente' and lower(trim(e.email)) = b.email;

  update public.envios
  set estado = 'fallido', error = 'Se agotaron los reintentos automáticos.'
  where campania_id = p_campania and estado = 'enviando' and intentos >= 5;

  select lote_id into v_lote from public.envios
  where campania_id = p_campania and estado = 'enviando' and lote_id is not null
  limit 1;

  if v_lote is not null then
    return query
      update public.envios e set intentos = e.intentos + 1
      where e.campania_id = p_campania and e.estado = 'enviando' and e.lote_id = v_lote
      returning e.*;
    return;
  end if;

  v_lote := gen_random_uuid();
  return query
    update public.envios e
    set estado = 'enviando', lote_id = v_lote, intentos = e.intentos + 1
    where e.id in (
      select p.id from public.envios p
      where p.campania_id = p_campania and p.estado = 'pendiente'
      order by p.id
      limit p_limite
      for update skip locked
    )
    returning e.*;
end $$;

create or replace function public.progreso_campania(p_campania uuid)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'total', count(*),
    'pendientes', count(*) filter (where estado in ('pendiente','enviando')),
    'fallidos', count(*) filter (where estado = 'fallido'),
    'omitidos', count(*) filter (where estado = 'omitido'),
    'enviados', count(*) filter (where estado not in ('pendiente','enviando','fallido','omitido'))
  )
  from public.envios where campania_id = p_campania;
$$;
