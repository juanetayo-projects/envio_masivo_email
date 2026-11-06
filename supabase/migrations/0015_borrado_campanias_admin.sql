-- Solo un administrador puede eliminar campañas. Antes cualquier usuario activo podía
-- hacerlo con una llamada directa a la API. Sus envíos y eventos se borran en cascada.
drop policy if exists "campanias usuarios activos" on public.campanias;

create policy "campanias lectura usuarios activos" on public.campanias
  for select to authenticated using ((select public.usuario_activo()));
create policy "campanias alta usuarios activos" on public.campanias
  for insert to authenticated with check ((select public.usuario_activo()));
create policy "campanias edicion usuarios activos" on public.campanias
  for update to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));
create policy "campanias borrado admin" on public.campanias
  for delete to authenticated using (public.is_admin());
