-- Traída de producción.
-- is_admin() se invoca dentro de políticas RLS evaluadas por el rol
-- 'authenticated', por lo que ese rol necesita EXECUTE. Solo revocamos
-- el acceso anónimo/público (el que marcaba el advisor como riesgo real).
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
