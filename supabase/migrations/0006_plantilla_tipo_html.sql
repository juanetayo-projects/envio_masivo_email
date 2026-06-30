-- Permitir plantillas tipo 'html' (HTML pegado/prediseñado, editable como código)
alter table public.plantillas drop constraint if exists plantillas_tipo_check;
alter table public.plantillas add constraint plantillas_tipo_check
  check (tipo in ('visual','texto','html'));
