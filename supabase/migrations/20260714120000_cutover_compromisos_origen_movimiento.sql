-- ============================================================
-- ⚠️ SIN APLICAR — regla del proyecto: mostrar este SQL y esperar OK
-- explícito de Daniela antes de correrlo en producción.
-- ============================================================
-- CUTOVER 9 — Compromisos auto-asignados: `origen` + último movimiento real
--
-- Contexto (Fase compromisos, 2026-07-14): el trabajo emergente (WhatsApp,
-- talento, cliente) no vive en ningún lado. La auto-asignación se vuelve
-- caso de primera clase: misma tabla peticiones, solicitante = asignado.
-- La RLS vigente YA lo permite (peticiones_insert: creado_por = mi_nombre()
-- sin restricción sobre para) — esta migración NO toca ninguna policy.
--
-- Dos cambios, ambos acordados:
--
-- 1) peticiones.origen — de dónde nace la tarea. SIN default a propósito
--    (decisión 2026-07-14): las 933 filas históricas quedan NULL = "sin
--    clasificar"; un default 'interno' falsearía justo el dato que se
--    quiere medir. La obligatoriedad es de la UI de creación nueva.
--
-- 2) Revivir peticiones.updated_at como "último movimiento": la columna
--    existe desde siempre pero nada la escribe (verificado 2026-07-14:
--    updated_at = created_at en las 933 filas, cero triggers en la tabla).
--    Trigger CONDICIONAL: solo cuenta como movimiento real el cambio de
--    estatus, descripcion, nota_entrega, link_entrega o fecha_entrega.
--    oculta_para / cambio_visto_por_creador / privada / fecha / etc. NO
--    mueven el timestamp — si no, archivar de tu vista resetearía el
--    contador de "días sin movimiento" sin haber trabajado.
--
-- La regla de los 3 días hábiles y los estados (al día / por vencer /
-- vencida / atorada) se CALCULAN en cliente sobre updated_at; no hay
-- columnas de estado.
-- ============================================================

-- 1) origen: talento | cliente | interno | propio · nullable · SIN default
alter table public.peticiones
  add column if not exists origen text
    constraint peticiones_origen_check
    check (origen in ('talento', 'cliente', 'interno', 'propio'));

comment on column public.peticiones.origen is
  'De dónde nace la tarea (talento/cliente/interno/propio). NULL = histórico sin clasificar. Sin default a propósito.';

-- 2) último movimiento: trigger condicional sobre updated_at
create or replace function public.peticiones_touch_movimiento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estatus       is distinct from old.estatus
  or new.descripcion   is distinct from old.descripcion
  or new.nota_entrega  is distinct from old.nota_entrega
  or new.link_entrega  is distinct from old.link_entrega
  or new.fecha_entrega is distinct from old.fecha_entrega
  then
    new.updated_at := now();
  else
    -- Updates de "vista" (ocultar, marcar visto, cambiar fecha…) no son
    -- movimiento. También congela cualquier intento del cliente de
    -- escribir updated_at a mano (anti-farmeo del contador).
    new.updated_at := old.updated_at;
  end if;
  return new;
end
$$;

drop trigger if exists peticiones_touch_movimiento on public.peticiones;
create trigger peticiones_touch_movimiento
  before update on public.peticiones
  for each row
  execute function public.peticiones_touch_movimiento();

-- Sin backfill: updated_at ya es = created_at en todo el histórico, que es
-- exactamente la semántica deseada ("sin movimiento desde su creación").

-- ============================================================
-- Verificación post-aplicación (flujo del proyecto):
--   1. update de estatus → updated_at avanza:
--        update peticiones set estatus='proceso' where id='<una>' ;
--        select updated_at from peticiones where id='<una>';
--   2. update de oculta_para → updated_at NO cambia.
--   3. insert con origen='propio' y creado_por = para (sesión real) → pasa RLS.
--   4. insert con origen='otra_cosa' → viola peticiones_origen_check.
--   5. Security advisors de Supabase sin hallazgos nuevos.
-- ============================================================
