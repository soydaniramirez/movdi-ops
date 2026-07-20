-- ============================================================
-- ✅ APLICADA (2026-07-20) con OK explícito de dirección (PR #11 revisado).
--    Verificada: grants correctos (authenticated sí, anon no), sin sesión
--    devuelve NULL/nada, advisors sin hallazgos nuevos (solo 0029 intencionales).
-- ============================================================
-- Conteo GLOBAL de peticiones privadas para dirección (decisión 2026-07-20,
-- hallazgo de la auditoría: la card "peticiones privadas 🔒" solo contaba las
-- privadas que dirección misma podía ver por RLS, con un copy que sugería un
-- total global).
--
-- Diseño de privacidad INTACTO: la RLS de peticiones sigue ocultando el
-- CONTENIDO de las privadas ajenas a todo el mundo, dirección incluida
-- ("ni siquiera dirección", CLAUDE.md). Esta función solo devuelve un NÚMERO
-- agregado — cuántas privadas activas existen — sin exponer nombre, texto,
-- personas ni ningún otro dato de las filas. Para no-dirección devuelve NULL
-- (el cliente cae al conteo local de siempre).
-- ============================================================

create or replace function public.conteo_privadas_activas()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.mi_es_direccion() then (
      select count(*)::integer
        from public.peticiones
       where privada = true
         and estatus not in ('entregado', 'archivada')
    )
    else null
  end;
$$;

comment on function public.conteo_privadas_activas() is
  'Total global de peticiones privadas activas (solo el número, jamás contenido). Solo dirección; NULL para el resto. Consumida por la card "peticiones privadas 🔒" de /peticiones.';

revoke execute on function public.conteo_privadas_activas() from public, anon;
grant execute on function public.conteo_privadas_activas() to authenticated;

-- ============================================================
-- ROLLBACK (manual):
--   drop function if exists public.conteo_privadas_activas();
-- ============================================================
