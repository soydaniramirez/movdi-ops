-- ============================================================
-- ✅ APLICADA en el cutover del 2026-07-06 (histórico: estuvo staged sin aplicar).
-- El check constraint rompería la creación de quincenales desde el
-- index.html vivo (no envía fecha_inicio). Aplicar solo cuando la SPA
-- vieja deje de ser la app de producción.
-- ============================================================
-- CUTOVER 1/3 — quincenal real: ancla fecha_inicio (cada 14 días)
--
-- Semántica: ocurrencias = fecha_inicio + 14k. La comparten generación,
-- cumplimiento y el cron de recordatorios (lib/recurrentes.ts + 2/3).
-- Backfill genérico: para cualquier quincenal existente, el ancla es el
-- primer dia_semana en o después de su fecha de creación (hora MX).
-- Para la única actual ("Entrega de objetivos digital" → Mariana,
-- lunes, creada 2026-05-25) eso da exactamente 2026-05-25:
-- próximas 2026-07-06, 2026-07-20, … (avisar a Mariana, ver CUTOVER.md)
-- ============================================================

alter table public.recurrentes
  add column if not exists fecha_inicio date;

update public.recurrentes
set fecha_inicio =
  (created_at at time zone 'America/Mexico_City')::date
  + ((dia_semana - extract(dow from (created_at at time zone 'America/Mexico_City')::date)::int + 7) % 7)
where frecuencia = 'quincenal'
  and fecha_inicio is null
  and dia_semana is not null;

alter table public.recurrentes
  add constraint recurrentes_quincenal_requiere_fecha_inicio
  check (frecuencia <> 'quincenal' or fecha_inicio is not null);
