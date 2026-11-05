-- En producción, 0010 se aplicó antes que 0008, y 0008 sobrescribió esta función.
-- Se reaplica la versión con remitentes. Es idempotente en una base nueva.
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
