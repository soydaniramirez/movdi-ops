-- ============================================================
-- ✅ APLICADA en el cutover del 2026-07-06 (histórico: estuvo staged sin aplicar).
-- Requiere 20260703230000 (fecha_inicio). El cron se programa aparte
-- en 20260703231000 (encendido explícito).
-- ============================================================
-- CUTOVER 2/3 — recordatorio "hoy te toca una entrega recurrente"
--
-- · Tabla de deduplicación recurrentes_avisos: un aviso por
--   (recurrente, fecha). Idempotente ante re-runs; no depende de
--   notificaciones (el usuario puede borrar su notif sin re-aviso).
-- · Función notificar_recurrentes_del_dia(): espejo exacto del motor
--   del cliente (lib/recurrentes.ts):
--   - patrón activo + persona activa y no pausada
--   - ocurre hoy: semanal dow==dia_semana · quincenal (hoy-fecha_inicio)%14==0
--     · mensual day==dia_mes  (quincenal legacy sin ancla: como semanal)
--   - no avisa si la ocurrencia ya está entregada o fue movida a otra
--     fecha; además avisa por instancias reales pendientes con fecha=hoy
--     (cubre las movidas en su fecha nueva)
-- · SECURITY DEFINER con search_path fijo; EXECUTE revocado a todos los
--   roles de API (solo la corre el job de pg_cron como postgres).
-- ============================================================

create table if not exists public.recurrentes_avisos (
  recurrente_id uuid not null references public.recurrentes(id) on delete cascade,
  fecha date not null,
  avisada_en timestamptz not null default now(),
  primary key (recurrente_id, fecha)
);

-- RLS sin policies: ningún rol de API la lee/escribe; solo la función definer.
alter table public.recurrentes_avisos enable row level security;
revoke all on public.recurrentes_avisos from anon, authenticated;

create or replace function public.notificar_recurrentes_del_dia()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Mexico_City')::date;
  r record;
  ocurre boolean;
  resuelta boolean;
  pendiente_real uuid;
  avisadas integer := 0;
begin
  for r in
    select rec.*
    from public.recurrentes rec
    join public.personas p on lower(p.nombre) = lower(rec.para)
    where rec.activa
      and coalesce(p.activo, true)
      and (p.pausada_hasta is null or p.pausada_hasta < hoy)
  loop
    -- ¿hoy es ocurrencia del patrón?
    ocurre := case r.frecuencia
      when 'mensual'   then extract(day from hoy)::int = r.dia_mes
      when 'quincenal' then case
        when r.fecha_inicio is not null
          then (hoy - r.fecha_inicio) >= 0 and (hoy - r.fecha_inicio) % 14 = 0
        else extract(dow from hoy)::int = r.dia_semana  -- legacy sin ancla
      end
      else extract(dow from hoy)::int = r.dia_semana
    end;

    -- la ocurrencia de hoy ya quedó resuelta: entregada, o movida a otra fecha
    resuelta := exists (
      select 1 from public.peticiones x
      where x.origen_recur = r.id
        and (x.fecha = hoy or x.fecha_original = hoy)
        and (x.estatus in ('entregado', 'archivada')
             or (x.fecha_original = hoy and x.fecha <> hoy))
    );

    -- instancia real pendiente fechada hoy (incluye movidas HACIA hoy)
    select x.id into pendiente_real
    from public.peticiones x
    where x.origen_recur = r.id
      and x.fecha = hoy
      and x.estatus in ('pendiente', 'proceso')
    limit 1;

    if (ocurre and not resuelta) or pendiente_real is not null then
      insert into public.recurrentes_avisos (recurrente_id, fecha)
      values (r.id, hoy)
      on conflict do nothing;
      if found then
        insert into public.notificaciones (para, tipo, titulo, detalle, peticion_id)
        values (
          r.para,
          'recurrente_hoy',
          format('↻ hoy toca "%s"', r.nombre),
          'entrega recurrente de hoy · creada por ' || r.creado_por,
          pendiente_real
        );
        avisadas := avisadas + 1;
      end if;
    end if;

    pendiente_real := null;
  end loop;

  return avisadas;
end;
$$;

revoke execute on function public.notificar_recurrentes_del_dia() from public, anon, authenticated;
