-- Traída de producción.
-- Fijar search_path del trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- is_admin() solo se usa dentro de políticas RLS (se ejecutan como definer),
-- no debe exponerse vía /rpc a anon/authenticated.
revoke execute on function public.is_admin() from public, anon, authenticated;
