-- ============================================================
-- ✅ YA VIVA EN PRODUCCIÓN — solo REGISTRO, no hace falta correrla.
-- ============================================================
-- Versiona las dos policies de personas que vivían solo en la BD (esquema
-- base; auditoria/03-backend-supabase.md las marcaba "no versionadas").
-- Transcritas EXACTAS de pg_policies el 2026-10-19, antes de aplicar
-- 20261019120000_personas_modify_rh.sql (que no las toca). Es idempotente
-- (drop if exists + create con la misma definición) por si algún día se
-- reconstruye el proyecto desde el repo.
-- ============================================================

-- Lectura: cualquier usuario autenticado lee personas (anon NO: su SELECT
-- se cerró en 20260703220000_cerrar_personas_select_anon.sql).
drop policy if exists personas_select_all_auth on public.personas;
create policy personas_select_all_auth on public.personas
  for select to authenticated
  using (true);

-- Autocuración del vínculo auth ↔ persona (bug Valeria 2026-07-15): cada quien
-- puede ligar SU fila (por el email del JWT) solo si el vínculo está vacío, y
-- solo a su propio auth.uid(). La usa lib/supabase/vinculo.ts desde el layout.
drop policy if exists personas_self_link on public.personas;
create policy personas_self_link on public.personas
  for update to authenticated
  using (auth_user_id is null and email = (auth.jwt() ->> 'email'))
  with check (auth_user_id = auth.uid() and email = (auth.jwt() ->> 'email'));
