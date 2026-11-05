-- ============================================================
-- Fase 1: cola de envío por tandas, sin duplicados, y usuarios inactivos
-- ============================================================

-- ---------- Cola de envío ----------
alter table public.envios drop constraint if exists envios_estado_check;
alter table public.envios add constraint envios_estado_check
  check (estado in ('pendiente','enviando','enviado','entregado','abierto','clic','rebote','fallido'));

alter table public.envios add column if not exists lote_id uuid;       -- clave de idempotencia en Resend
alter table public.envios add column if not exists intentos int not null default 0;
alter table public.campanias add column if not exists bloqueo_hasta timestamptz;

create index if not exists idx_envios_campania_estado on public.envios(campania_id, estado);
create unique index if not exists uq_envios_campania_email on public.envios(campania_id, lower(email));

-- ---------- Crear campaña y destinatarios en una sola transacción ----------
-- El id lo genera el cliente: repetir la llamada no crea una segunda campaña.
create or replace function public.crear_campania(p_campania jsonb, p_envios jsonb)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := (p_campania->>'id')::uuid;
  v_total int;
begin
  insert into public.campanias (id, nombre, asunto, plantilla_id, adjuntos, total_destinatarios, estado, created_by)
  values (
    v_id,
    p_campania->>'nombre',
    p_campania->>'asunto',
    (p_campania->>'plantilla_id')::uuid,
    coalesce(p_campania->'adjuntos', '[]'::jsonb),
    0,
    'borrador',
    auth.uid()
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
  update public.campanias set total_destinatarios = v_total where id = v_id;
  return v_id;
end $$;

revoke execute on function public.crear_campania(jsonb, jsonb) from public, anon;
grant execute on function public.crear_campania(jsonb, jsonb) to authenticated;

-- ---------- Funciones internas del motor de envío (solo service_role) ----------

-- Una sola tanda por campaña a la vez. Devuelve false si otra sigue activa.
create or replace function public.tomar_bloqueo_campania(p_campania uuid, p_segundos int)
returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  update public.campanias
  set bloqueo_hasta = now() + make_interval(secs => p_segundos), estado = 'enviando'
  where id = p_campania and (bloqueo_hasta is null or bloqueo_hasta < now());
  return found;
end $$;

-- Con el bloqueo tomado, cualquier fila en 'enviando' quedó de una tanda interrumpida:
-- se reintenta con su mismo lote_id para que Resend no la envíe dos veces.
create or replace function public.reclamar_lote(p_campania uuid, p_limite int)
returns setof public.envios
language plpgsql security invoker set search_path = '' as $$
declare
  v_lote uuid;
begin
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

-- Guarda el id de Resend sin retroceder un estado que el webhook ya haya avanzado.
create or replace function public.marcar_enviados(p_items jsonb)
returns void
language sql security invoker set search_path = '' as $$
  update public.envios e
  set resend_id = x.resend_id,
      enviado_at = coalesce(e.enviado_at, now()),
      error = null,
      estado = case when e.estado = 'enviando' then 'enviado' else e.estado end
  from jsonb_to_recordset(p_items) as x(id uuid, resend_id text)
  where e.id = x.id;
$$;

create or replace function public.progreso_campania(p_campania uuid)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'total', count(*),
    'pendientes', count(*) filter (where estado in ('pendiente','enviando')),
    'fallidos', count(*) filter (where estado = 'fallido'),
    'enviados', count(*) filter (where estado not in ('pendiente','enviando','fallido'))
  )
  from public.envios where campania_id = p_campania;
$$;

revoke execute on function public.tomar_bloqueo_campania(uuid, int) from public, anon, authenticated;
revoke execute on function public.reclamar_lote(uuid, int) from public, anon, authenticated;
revoke execute on function public.marcar_enviados(jsonb) from public, anon, authenticated;
revoke execute on function public.progreso_campania(uuid) from public, anon, authenticated;
grant execute on function public.tomar_bloqueo_campania(uuid, int) to service_role;
grant execute on function public.reclamar_lote(uuid, int) to service_role;
grant execute on function public.marcar_enviados(jsonb) to service_role;
grant execute on function public.progreso_campania(uuid) to service_role;

-- ---------- Un usuario desactivado pierde el acceso a los datos ----------
create or replace function public.usuario_activo()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and activo);
$$;

revoke execute on function public.usuario_activo() from public, anon;
grant execute on function public.usuario_activo() to authenticated;

drop policy if exists "plantillas lectura autenticados" on public.plantillas;
drop policy if exists "plantillas escritura autenticados" on public.plantillas;
create policy "plantillas usuarios activos" on public.plantillas
  for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));

drop policy if exists "campanias lectura autenticados" on public.campanias;
drop policy if exists "campanias escritura autenticados" on public.campanias;
create policy "campanias usuarios activos" on public.campanias
  for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));

drop policy if exists "envios lectura autenticados" on public.envios;
drop policy if exists "envios escritura autenticados" on public.envios;
create policy "envios usuarios activos" on public.envios
  for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));

drop policy if exists "eventos lectura autenticados" on public.eventos_email;
create policy "eventos lectura usuarios activos" on public.eventos_email
  for select to authenticated
  using ((select public.usuario_activo()));

drop policy if exists "adjuntos lectura autenticados" on storage.objects;
drop policy if exists "adjuntos subida autenticados" on storage.objects;
drop policy if exists "adjuntos borrado autenticados" on storage.objects;
create policy "adjuntos lectura usuarios activos" on storage.objects
  for select to authenticated
  using (bucket_id = 'adjuntos-campanias' and (select public.usuario_activo()));
create policy "adjuntos subida usuarios activos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'adjuntos-campanias' and (select public.usuario_activo()));
create policy "adjuntos borrado usuarios activos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'adjuntos-campanias' and (select public.usuario_activo()));
