-- ============================================================
-- envio_masivo_email — RLS y políticas
-- App interna: usuarios autenticados operan; solo admin gestiona usuarios.
-- ============================================================

-- Helper: ¿el usuario actual es admin?
create or replace function public.is_admin()
returns boolean
language sql security definer set search_path = public as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and rol = 'admin' and activo
  );
$$;

-- ---------- profiles ----------
alter table public.profiles enable row level security;

create policy "perfil propio o admin lee" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

create policy "admin gestiona perfiles" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- plantillas ----------
alter table public.plantillas enable row level security;

create policy "plantillas lectura autenticados" on public.plantillas
  for select using (auth.role() = 'authenticated');

create policy "plantillas escritura autenticados" on public.plantillas
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ---------- campanias ----------
alter table public.campanias enable row level security;

create policy "campanias lectura autenticados" on public.campanias
  for select using (auth.role() = 'authenticated');

create policy "campanias escritura autenticados" on public.campanias
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ---------- envios ----------
alter table public.envios enable row level security;

create policy "envios lectura autenticados" on public.envios
  for select using (auth.role() = 'authenticated');

create policy "envios escritura autenticados" on public.envios
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ---------- eventos_email ----------
-- Solo lectura para autenticados; los escribe la Edge Function (service_role,
-- que hace bypass de RLS). No se exponen políticas de escritura al cliente.
alter table public.eventos_email enable row level security;

create policy "eventos lectura autenticados" on public.eventos_email
  for select using (auth.role() = 'authenticated');

-- ---------- storage: adjuntos-campanias ----------
-- Usuarios autenticados pueden subir/leer/borrar adjuntos del bucket.
create policy "adjuntos lectura autenticados" on storage.objects
  for select using (bucket_id = 'adjuntos-campanias' and auth.role() = 'authenticated');

create policy "adjuntos subida autenticados" on storage.objects
  for insert with check (bucket_id = 'adjuntos-campanias' and auth.role() = 'authenticated');

create policy "adjuntos borrado autenticados" on storage.objects
  for delete using (bucket_id = 'adjuntos-campanias' and auth.role() = 'authenticated');
