-- ============================================================
-- FASE RLS 3 — cerrar la lectura anónima de personas (hallazgo crítico)
-- Fecha: 2026-07-03 · Proyecto: nxyhgbrretusqbgfodmo
--
-- Contexto: con solo la anon key y sin sesión, un SELECT a personas
-- devolvía a las 21 personas con email, rol, nivel y área. El grid de
-- login que dependía de esa lectura fue eliminado de la SPA (PR #1,
-- login por email+contraseña, desplegado en Netlify desde main).
--
-- Tras esto, personas solo es legible por usuarios autenticados
-- (personas_select_all_auth) y las funciones mi_* (SECURITY DEFINER).
-- El revoke es cinturón y tirantes por si alguna policy futura
-- volviera a incluir a anon por accidente.
-- ============================================================

drop policy if exists personas_select_anon on public.personas;
revoke select on public.personas from anon;
