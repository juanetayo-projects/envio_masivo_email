-- ============================================================
-- Fase 2: cada minuto, el servidor retoma las campañas en cola
-- Solo funciona en Supabase (pg_cron, pg_net y Vault).
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- El token se genera aquí y vive en Vault: no está en el repositorio ni en el código.
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'cola_envio_token',
  'Autoriza a pg_cron a invocar la función procesar-cola'
)
where not exists (select 1 from vault.secrets where name = 'cola_envio_token');

create or replace function public.validar_token_cola(p_token text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from vault.decrypted_secrets
    where name = 'cola_envio_token' and decrypted_secret = p_token
  );
$$;

revoke execute on function public.validar_token_cola(text) from public, anon, authenticated;
grant execute on function public.validar_token_cola(text) to service_role;

-- Solo llama a la función cuando hay trabajo pendiente.
select cron.schedule(
  'procesar-cola-envios',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://hygqxajhndkrjktkyfzr.supabase.co/functions/v1/procesar-cola',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cola-token', (select decrypted_secret from vault.decrypted_secrets where name = 'cola_envio_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  where exists (select 1 from public.campanias where en_cola);
  $job$
);
