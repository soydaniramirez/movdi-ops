-- ============================================================
-- ✅ APLICADA (2026-07-20) con OK explícito de dirección (PR #11 revisado).
--    Verificada: grants correctos (authenticated sí, anon no), sin sesión
--    devuelve NULL/nada, advisors sin hallazgos nuevos (solo 0029 intencionales).
-- ============================================================
-- Loop público de feedback ABIERTO a todo el equipo (decisión 2026-07-20,
-- hallazgo de la auditoría: la sección "🔁 qué nos dijeron / qué hicimos"
-- prometía un resumen para todos, pero feedback_select solo dejaba ver las
-- mejoras/liderazgo resueltos a dirección — para un ejecutivo el loop
-- quedaba casi siempre vacío).
--
-- Diseño: NO se abre la tabla (una rama en feedback_select expondría la fila
-- completa vía API, incluido autor_id de los firmados — rompería el "siempre
-- sin autores"). En su lugar, una función SECURITY DEFINER devuelve SOLO los
-- campos anónimos del loop: mes, categoría, mensaje y respuesta. Nada de
-- autor_id, destinatario_id, es_anonimo ni ids de fila.
-- El anonimato del feedback en sí no cambia (triggers de la migración
-- 20260705220000 intactos).
-- ============================================================

create or replace function public.loop_publico()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'mes', to_char(f.created_at at time zone 'America/Mexico_City', 'YYYY-MM'),
        'categoria', f.categoria,
        'mensaje', f.mensaje,
        'respuesta', f.respuesta,
        'creada_en', f.created_at
      )
      order by f.created_at desc
    ),
    '[]'::jsonb
  )
  from public.feedback f
  where f.estado = 'resuelto'
    and f.compartible_loop = true
    and f.respuesta is not null
    and length(btrim(f.respuesta)) > 0;
$$;

comment on function public.loop_publico() is
  'Items del loop "qué nos dijeron / qué hicimos" para TODO autenticado: solo mes, categoría, mensaje y respuesta de feedback resuelto+compartible. Sin autores ni ids — el anonimato lo garantiza la forma del retorno, no un filtro de cliente.';

revoke execute on function public.loop_publico() from public, anon;
grant execute on function public.loop_publico() to authenticated;

-- ============================================================
-- ROLLBACK (manual):
--   drop function if exists public.loop_publico();
-- ============================================================
