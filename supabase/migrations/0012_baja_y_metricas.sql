-- ============================================================
-- Fase 3: baja voluntaria del destinatario y métricas agregadas
-- ============================================================

alter table public.correos_bloqueados drop constraint if exists correos_bloqueados_motivo_check;
alter table public.correos_bloqueados add constraint correos_bloqueados_motivo_check
  check (motivo in ('rebote','queja','manual','baja'));

alter table public.campanias add column if not exists incluir_baja boolean not null default true;

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
    remitente_nombre, remitente_email, responder_a, incluir_baja
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
    coalesce(nullif(trim(p_campania->>'responder_a'), ''), v_remitente.responder_a),
    coalesce((p_campania->>'incluir_baja')::boolean, true)
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

-- Totales calculados en la base: el Dashboard no depende del límite de 1.000 filas.
-- Un correo abierto o con clic también cuenta como entregado.
create or replace function public.metricas_campanias()
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'campanias', (select count(*) from public.campanias where estado = 'enviada'),
    'enviados', count(*) filter (where estado in ('enviado','entregado','abierto','clic','rebote')),
    'entregados', count(*) filter (where estado in ('entregado','abierto','clic')),
    'abiertos', count(*) filter (where estado in ('abierto','clic')),
    'clics', count(*) filter (where estado = 'clic'),
    'rebotes', count(*) filter (where estado = 'rebote'),
    'fallidos', count(*) filter (where estado = 'fallido'),
    'omitidos', count(*) filter (where estado = 'omitido'),
    'por_mes', coalesce((
      select jsonb_agg(jsonb_build_object('mes', m.mes, 'enviados', m.enviados, 'entregados', m.entregados) order by m.mes)
      from (
        select to_char(e.enviado_at at time zone 'America/Bogota', 'YYYY-MM') as mes,
               count(*) as enviados,
               count(*) filter (where e.estado in ('entregado','abierto','clic')) as entregados
        from public.envios e
        where e.enviado_at >= now() - interval '12 months'
        group by 1
      ) m
    ), '[]'::jsonb)
  )
  from public.envios;
$$;

revoke execute on function public.metricas_campanias() from public, anon;
grant execute on function public.metricas_campanias() to authenticated;
