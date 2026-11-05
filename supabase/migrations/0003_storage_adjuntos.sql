-- Bucket privado para adjuntos de campañas + políticas.
-- Traída de producción. Las políticas se recrean porque 0002 del repositorio ya las
-- incluye: así el historial completo se puede reproducir en una base nueva.
insert into storage.buckets (id, name, public)
values ('adjuntos-campanias', 'adjuntos-campanias', false)
on conflict (id) do nothing;

drop policy if exists "adjuntos lectura autenticados" on storage.objects;
drop policy if exists "adjuntos subida autenticados" on storage.objects;
drop policy if exists "adjuntos borrado autenticados" on storage.objects;

create policy "adjuntos lectura autenticados" on storage.objects
  for select using (bucket_id = 'adjuntos-campanias' and auth.role() = 'authenticated');
create policy "adjuntos subida autenticados" on storage.objects
  for insert with check (bucket_id = 'adjuntos-campanias' and auth.role() = 'authenticated');
create policy "adjuntos borrado autenticados" on storage.objects
  for delete using (bucket_id = 'adjuntos-campanias' and auth.role() = 'authenticated');
