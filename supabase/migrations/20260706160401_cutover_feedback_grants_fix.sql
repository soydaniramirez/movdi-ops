-- ============================================================
-- ✅ APLICADA en el cutover (2026-07-06), justo después de la 7.
-- ============================================================
-- FIX cutover 7 — grants de feedback exactos al diseño
--
-- Los default privileges de Supabase dan ALL a authenticated en tablas
-- nuevas; la migración 7 revocó de public/anon pero no de authenticated,
-- así que su `grant update (columnas)` fue ADITIVO: authenticated
-- conservaba UPDATE de tabla completa (mensaje incluido) y DELETE.
-- Las policies ya lo contenían (sin policy de DELETE; UPDATE solo
-- dirección/flag), pero el invariante aprobado — "nadie reescribe el
-- mensaje, ni dirección" — debe vivir también en los grants.

revoke all on public.feedback from authenticated;
grant select, insert on public.feedback to authenticated;
grant update (estado, respuesta, compartible_loop, es_publico)
  on public.feedback to authenticated;
