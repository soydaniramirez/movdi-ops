-- ============================================================
-- ⚠️⚠️ NO APLICADA — APLICAR EN CUTOVER, AL FINAL (ver docs/CUTOVER.md) ⚠️⚠️
-- Requiere 20260703230000 y 20260703230500. Este es el "interruptor":
-- hasta aquí nada corre solo; al aplicarla, el recordatorio queda vivo.
-- ============================================================
-- CUTOVER 3/3 — programar el recordatorio diario con pg_cron
--
-- 07:00 America/Mexico_City = 13:00 UTC (MX ya no tiene horario de
-- verano). Idempotente: re-runs no duplican (dedup en recurrentes_avisos).
-- Verificar tras el primer run:
--   select * from cron.job_run_details order by start_time desc limit 5;
-- Apagar si hiciera falta:
--   select cron.unschedule('recordatorio-recurrentes-diario');
-- ============================================================

create extension if not exists pg_cron;

select cron.schedule(
  'recordatorio-recurrentes-diario',
  '0 13 * * *',
  $$ select public.notificar_recurrentes_del_dia(); $$
);
