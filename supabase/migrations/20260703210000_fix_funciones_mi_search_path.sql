-- ============================================================
-- FASE RLS 1/2 — endurecer funciones mi_* (advisors 0011 y 0028)
-- Fecha: 2026-07-03 · Proyecto: nxyhgbrretusqbgfodmo
--
-- 1. Fija search_path = '' en las 3 funciones SECURITY DEFINER
--    (referencias calificadas con schema para que sigan funcionando).
-- 2. Revoca EXECUTE a public/anon: un usuario sin sesión ya no puede
--    llamar /rest/v1/rpc/mi_* . `authenticated` conserva EXECUTE
--    porque las políticas RLS evalúan estas funciones con el rol del
--    usuario que consulta (el advisor 0029 seguirá avisándolo; es
--    intencional y necesario).
-- 3. Añade mi_es_direccion(), usada por la fase 2/2 para restringir
--    escrituras de historial_mensual y recompensas a dirección.
-- ============================================================

create or replace function public.mi_nombre()
returns text
language sql stable security definer
set search_path = ''
as $$
  select nombre from public.personas where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.mi_nivel()
returns text
language sql stable security definer
set search_path = ''
as $$
  select nivel from public.personas where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.mi_persona()
returns public.personas
language sql stable security definer
set search_path = ''
as $$
  select * from public.personas where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.mi_es_direccion()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(es_direccion, false)
  from public.personas
  where auth_user_id = auth.uid()
  limit 1;
$$;

revoke execute on function public.mi_nombre()       from public, anon;
revoke execute on function public.mi_nivel()        from public, anon;
revoke execute on function public.mi_persona()      from public, anon;
revoke execute on function public.mi_es_direccion() from public, anon;

grant execute on function public.mi_nombre()       to authenticated;
grant execute on function public.mi_nivel()        to authenticated;
grant execute on function public.mi_persona()      to authenticated;
grant execute on function public.mi_es_direccion() to authenticated;
