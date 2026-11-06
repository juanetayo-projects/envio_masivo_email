-- Métricas del Dashboard con filtros de fecha (hora de Bogotá), campaña y remitente.
-- Es security invoker: un usuario inactivo no ve filas y solo obtiene ceros.
drop function if exists public.metricas_campanias();

create or replace function public.metricas_campanias(
  p_desde date default null,
  p_hasta date default null,
  p_campania uuid default null,
  p_remitente text default null
)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with base as (
    select e.*, c.nombre as campania_nombre, c.estado as campania_estado,
           coalesce(e.enviado_at, c.created_at) as fecha_ref,
           coalesce(c.enviada_at, c.created_at) as fecha_campania
    from public.envios e
    join public.campanias c on c.id = e.campania_id
    where (p_campania is null or c.id = p_campania)
      and (p_remitente is null or c.remitente_email = p_remitente)
      and (p_desde is null or (coalesce(e.enviado_at, c.created_at) at time zone 'America/Bogota')::date >= p_desde)
      and (p_hasta is null or (coalesce(e.enviado_at, c.created_at) at time zone 'America/Bogota')::date <= p_hasta)
  ),
  salidos as (
    select * from base where estado in ('enviado','entregado','abierto','clic','rebote')
  ),
  eventos as (
    select 'envios' as metrica, enviado_at as momento from base where enviado_at is not null
    union all select 'aperturas', abierto_at from base where abierto_at is not null
    union all select 'clics', clic_at from base where clic_at is not null
  )
  select jsonb_build_object(
    'campanias', (select count(distinct campania_id) from base where campania_estado = 'enviada'),
    'destinatarios', (select count(*) from base),
    'enviados', (select count(*) from salidos),
    'entregados', (select count(*) from base where estado in ('entregado','abierto','clic')),
    'abiertos', (select count(*) from base where estado in ('abierto','clic')),
    'clics', (select count(*) from base where estado = 'clic'),
    'rebotes', (select count(*) from base where estado = 'rebote'),
    'fallidos', (select count(*) from base where estado = 'fallido'),
    'omitidos', (select count(*) from base where estado = 'omitido'),
    'pendientes', (select count(*) from base where estado in ('pendiente','enviando')),
    'bajas', (
      select count(*) from public.correos_bloqueados b
      where b.motivo = 'baja'
        and (p_desde is null or (b.created_at at time zone 'America/Bogota')::date >= p_desde)
        and (p_hasta is null or (b.created_at at time zone 'America/Bogota')::date <= p_hasta)
    ),
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'enviados', d.enviados, 'entregados', d.entregados) order by d.dia)
      from (
        select to_char(s.enviado_at at time zone 'America/Bogota', 'YYYY-MM-DD') as dia,
               count(*) as enviados,
               count(*) filter (where s.estado in ('entregado','abierto','clic')) as entregados
        from salidos s where s.enviado_at is not null
        group by 1
      ) d
    ), '[]'::jsonb),
    'calor', coalesce((
      select jsonb_agg(jsonb_build_object('metrica', k.metrica, 'dia', k.dia, 'hora', k.hora, 'n', k.n))
      from (
        select metrica,
               extract(isodow from momento at time zone 'America/Bogota')::int as dia,
               extract(hour from momento at time zone 'America/Bogota')::int as hora,
               count(*) as n
        from eventos group by 1, 2, 3
      ) k
    ), '[]'::jsonb),
    'por_campania', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.campania_id, 'nombre', t.campania_nombre, 'enviados', t.enviados,
        'entregados', t.entregados, 'abiertos', t.abiertos, 'clics', t.clics, 'rebotes', t.rebotes
      ) order by t.fecha desc)
      from (
        select campania_id, campania_nombre, max(fecha_campania) as fecha,
               count(*) as enviados,
               count(*) filter (where estado in ('entregado','abierto','clic')) as entregados,
               count(*) filter (where estado in ('abierto','clic')) as abiertos,
               count(*) filter (where estado = 'clic') as clics,
               count(*) filter (where estado = 'rebote') as rebotes
        from salidos group by 1, 2
        order by fecha desc limit 10
      ) t
    ), '[]'::jsonb),
    'por_dominio', coalesce((
      select jsonb_agg(jsonb_build_object('dominio', x.dominio, 'enviados', x.enviados, 'rebotes', x.rebotes) order by x.enviados desc)
      from (
        select split_part(lower(email), '@', 2) as dominio,
               count(*) as enviados,
               count(*) filter (where estado = 'rebote') as rebotes
        from salidos
        where email not like '%@eliminado.invalid'
        group by 1 order by 2 desc limit 8
      ) x
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.metricas_campanias(date, date, uuid, text) from public, anon;
grant execute on function public.metricas_campanias(date, date, uuid, text) to authenticated;
