-- Cada día a las 3:00 a. m. de Colombia (8:00 UTC) se aplica la retención de 12 meses.
-- Solo funciona en Supabase (pg_cron, pg_net y Vault).
select cron.schedule(
  'retencion-datos',
  '0 8 * * *',
  $job$
  select net.http_post(
    url := 'https://hygqxajhndkrjktkyfzr.supabase.co/functions/v1/retencion',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cola-token', (select decrypted_secret from vault.decrypted_secrets where name = 'cola_envio_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
