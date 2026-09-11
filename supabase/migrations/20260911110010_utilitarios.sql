-- Normalizações usadas por todo o resto do esquema.

create extension if not exists unaccent with schema extensions;

-- STABLE, não IMMUTABLE: unaccent depende do dicionário instalado. Por isso
-- não pode entrar em coluna gerada nem em índice — só dentro de funções.
create or replace function public.norm_texto(p text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select lower(regexp_replace(btrim(extensions.unaccent(coalesce(p, ''))), '\s+', ' ', 'g'));
$$;

grant execute on function public.norm_texto(text) to authenticated;

create or replace function public.so_digitos(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p, ''), '\D', '', 'g');
$$;

grant execute on function public.so_digitos(text) to authenticated;
