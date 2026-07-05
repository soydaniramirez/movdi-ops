-- ============================================================
-- ⚠️⚠️ NO APLICADA — APLICAR EN CUTOVER (ver docs/CUTOVER.md) ⚠️⚠️
-- Requiere el build con la Fase 4.8 (la UI por rol ya la respeta).
-- ============================================================
-- CUTOVER 6 — Privacidad de gamificación + entrega de recompensas
--
-- Decisiones (2026-07-05, Fase 4.8):
--   · personas.ve_gamificacion_completa = "ve todo" (estrellas, recompensas,
--     historial). true solo para dirección (Dani y Emmanuel).
--   · estrellas: cada quien ve SOLO aquellas donde participa (dio o recibió).
--     Ver las que DI es necesario para el límite 2/semana del server action.
--   · recompensas (catálogo): oculto al equipo — solo el flag. Una persona
--     conoce su recompensa al GANARLA (fila propia de historial_mensual,
--     columna recompensa). Escritura ya era solo dirección (recomp_write).
--   · historial_mensual: fila propia + RH (entrega recompensas) + flag.
--   · entrega: columna recompensa_entregada; el UPDATE queda limitado A ESA
--     COLUMNA por grant de columna, con policy para rh/dirección.
--   · podio: visible para TODOS pero solo del MES CERRADO — sale de la RPC
--     podio_mes_cerrado (security definer) que expone únicamente el top 3
--     (persona, cumplimiento), no el historial completo.
-- ============================================================

-- 1) FLAG ------------------------------------------------------
alter table public.personas
  add column if not exists ve_gamificacion_completa boolean not null default false;

-- Dani y Emmanuel (= dirección actual)
update public.personas set ve_gamificacion_completa = true where es_direccion = true;

-- Helper con el mismo patrón endurecido de las mi_* (definer + search_path
-- fijo + EXECUTE revocado a anon)
create or replace function public.mi_ve_gamificacion()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select p.ve_gamificacion_completa
       from public.personas p
      where p.auth_user_id = auth.uid() and coalesce(p.activo, true)),
    false)
$$;
revoke execute on function public.mi_ve_gamificacion() from public, anon;
grant execute on function public.mi_ve_gamificacion() to authenticated;

-- 2) ESTRELLAS: cerrar el SELECT público -----------------------
drop policy if exists estrellas_select on public.estrellas_colaboracion;
create policy estrellas_select on public.estrellas_colaboracion
  for select to authenticated
  using (
    de_persona = public.mi_nombre()
    or para_persona = public.mi_nombre()
    or public.mi_ve_gamificacion()
  );
-- (estrellas_insert queda igual: de=yo, no a mí mismo, <2/semana, sin repetir)

-- 3) RECOMPENSAS (catálogo): oculto salvo flag -----------------
drop policy if exists recomp_select on public.recompensas;
create policy recomp_select on public.recompensas
  for select to authenticated
  using (public.mi_ve_gamificacion());
-- (recomp_write ya es mi_es_direccion() para ALL — sin cambios)

-- 4) HISTORIAL_MENSUAL: propio + RH + flag ---------------------
drop policy if exists hist_select on public.historial_mensual;
create policy hist_select on public.historial_mensual
  for select to authenticated
  using (
    persona = public.mi_nombre()
    or public.mi_nivel() = 'rh'
    or public.mi_ve_gamificacion()
  );

-- 5) ENTREGA DE RECOMPENSAS (RH) -------------------------------
alter table public.historial_mensual
  add column if not exists recompensa_entregada boolean not null default false;

-- El UPDATE por API queda limitado a ESA columna: nadie (ni dirección) puede
-- retocar xp/cumplimiento archivados vía API. Correcciones de snapshot →
-- SQL editor con OK explícito.
revoke update on public.historial_mensual from authenticated;
grant update (recompensa_entregada) on public.historial_mensual to authenticated;

drop policy if exists hist_update on public.historial_mensual;
create policy hist_update on public.historial_mensual
  for update to authenticated
  using (public.mi_nivel() = 'rh' or public.mi_es_direccion())
  with check (public.mi_nivel() = 'rh' or public.mi_es_direccion());
-- (hist_insert queda igual: mi_es_direccion(), para el cierre de mes)

-- 6) PODIO DEL MES CERRADO (para todos, mínima exposición) -----
create or replace function public.podio_mes_cerrado(p_mes text default null)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    select h.persona, h.cumplimiento, h.mes
      from public.historial_mensual h
     where h.mes = coalesce(
             p_mes,
             (select max(h2.mes) from public.historial_mensual h2
               where h2.mes < to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM')))
     order by h.xp_total desc
     limit 3
  ) t
$$;
revoke execute on function public.podio_mes_cerrado(text) from public, anon;
grant execute on function public.podio_mes_cerrado(text) to authenticated;
