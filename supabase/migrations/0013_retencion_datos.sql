-- ============================================================
-- Retención: los datos personales de una campaña se conservan 12 meses.
-- Después se anonimizan los destinatarios y se borran sus eventos. Se conservan los
-- estados (para las métricas) y la lista de bloqueo, de la que depende respetar las bajas.
-- ============================================================

create or replace function public.anonimizar_campanias_vencidas(p_meses int default 12)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_eventos int;
  v_envios int;
begin
  delete from public.eventos_email v
  using public.envios e, public.campanias c
  where v.envio_id = e.id and e.campania_id = c.id
    and coalesce(c.enviada_at, c.created_at) < now() - make_interval(months => p_meses)
    and not c.en_cola;
  get diagnostics v_eventos = row_count;

  update public.envios e
  set email = 'anonimo-' || e.id || '@eliminado.invalid', datos = '{}'::jsonb, error = null, resend_id = null
  from public.campanias c
  where e.campania_id = c.id
    and coalesce(c.enviada_at, c.created_at) < now() - make_interval(months => p_meses)
    and not c.en_cola
    and e.email not like '%@eliminado.invalid';
  get diagnostics v_envios = row_count;

  return jsonb_build_object('envios', v_envios, 'eventos', v_eventos);
end $$;

revoke execute on function public.anonimizar_campanias_vencidas(int) from public, anon, authenticated;
grant execute on function public.anonimizar_campanias_vencidas(int) to service_role;
