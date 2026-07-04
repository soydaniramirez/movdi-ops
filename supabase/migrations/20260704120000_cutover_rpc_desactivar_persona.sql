-- ============================================================
-- ⚠️⚠️ NO APLICADA — APLICAR EN CUTOVER (ver docs/CUTOVER.md) ⚠️⚠️
-- Requerida por el módulo equipo del Next.js (la Server Action la invoca).
-- ============================================================
-- CUTOVER 4 — RPC transaccional: desactivar persona con reasignación
--
-- Por qué existe (hallazgo 4.5/4.6): la policy peticiones_update es
-- (creado_por = mi_nombre() OR para = mi_nombre()). Un admin que no es
-- creador ni destinatario NO puede reasignar las peticiones que terceros
-- le asignaron a la persona — el caso más común. La SPA vieja tiene ese
-- hueco en silencio (reasigna solo las filas que la RLS le deja y
-- desactiva igual). Esta función lo resuelve de raíz:
--   (a) verifica DENTRO que el caller es ceo|head (mismo criterio que
--       personas_modify_admin) — no abre hueco aunque authenticated
--       tenga EXECUTE;
--   (b) SECURITY DEFINER: puede reasignar TODAS las filas, también las
--       creadas por terceros;
--   (c) UNA transacción: cualquier raise revierte todo — atomicidad
--       real a nivel de BD (una caída del proceso ya no deja estado
--       intermedio, a diferencia de la compensación en la Server Action).
-- ============================================================

-- unaccent: hay nombres reales con acento (Fátima, Sofía — verificado
-- 2026-07-04); igualamos la semántica de matchNombre del cliente
-- (lower + sin acentos) para que la reasignación no deje filas fuera.
create extension if not exists unaccent with schema extensions;

create or replace function public.desactivar_persona_con_reasignacion(
  p_persona_id uuid,
  p_reasignar_peticiones_a text default null,
  p_reasignar_recurrentes_a text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_caller_nivel text;
  v_persona public.personas%rowtype;
  v_pet integer := 0;
  v_rec integer := 0;
begin
  -- (a) solo ceo|head (verificado contra la sesión del caller)
  select nivel into v_caller_nivel
  from public.personas where auth_user_id = auth.uid() and coalesce(activo, true);
  if v_caller_nivel is null or v_caller_nivel not in ('ceo', 'head') then
    raise exception 'solo dirección o heads pueden desactivar personas';
  end if;

  select * into v_persona from public.personas where id = p_persona_id;
  if not found then raise exception 'persona no encontrada'; end if;

  -- destinos válidos: existen, activos, no pausados, distintos de la persona
  perform 1 from public.personas d
  where p_reasignar_peticiones_a is not null
    and d.nombre = p_reasignar_peticiones_a
    and d.id <> p_persona_id
    and coalesce(d.activo, true)
    and (d.pausada_hasta is null or d.pausada_hasta < hoy);
  if p_reasignar_peticiones_a is not null and not found then
    raise exception 'destino inválido para peticiones: %', p_reasignar_peticiones_a;
  end if;

  perform 1 from public.personas d
  where p_reasignar_recurrentes_a is not null
    and d.nombre = p_reasignar_recurrentes_a
    and d.id <> p_persona_id
    and coalesce(d.activo, true)
    and (d.pausada_hasta is null or d.pausada_hasta < hoy);
  if p_reasignar_recurrentes_a is not null and not found then
    raise exception 'destino inválido para recurrentes: %', p_reasignar_recurrentes_a;
  end if;

  -- qué se reasigna (paridad SPA): peticiones activas y recurrentes activas
  -- ASIGNADAS A la persona (para = X)
  select count(*) into v_pet from public.peticiones
  where lower(extensions.unaccent(para)) = lower(extensions.unaccent(v_persona.nombre)) and estatus <> 'entregado';
  select count(*) into v_rec from public.recurrentes
  where lower(extensions.unaccent(para)) = lower(extensions.unaccent(v_persona.nombre)) and activa;

  if v_pet > 0 and p_reasignar_peticiones_a is null then
    raise exception 'elige a quién reasignar las peticiones (% activas)', v_pet;
  end if;
  if v_rec > 0 and p_reasignar_recurrentes_a is null then
    raise exception 'elige a quién reasignar las recurrentes (% activas)', v_rec;
  end if;

  -- (b)+(c): todo o nada, incluidas filas creadas por terceros
  if v_pet > 0 then
    update public.peticiones set para = p_reasignar_peticiones_a
    where lower(extensions.unaccent(para)) = lower(extensions.unaccent(v_persona.nombre)) and estatus <> 'entregado';
  end if;
  if v_rec > 0 then
    update public.recurrentes set para = p_reasignar_recurrentes_a
    where lower(extensions.unaccent(para)) = lower(extensions.unaccent(v_persona.nombre)) and activa;
  end if;
  update public.personas set activo = false where id = p_persona_id;

  return jsonb_build_object(
    'peticiones_reasignadas', v_pet,
    'recurrentes_reasignadas', v_rec
  );
end;
$$;

-- authenticated puede llamarla: el check de rol vive DENTRO de la función.
revoke execute on function public.desactivar_persona_con_reasignacion(uuid, text, text) from public, anon;
grant execute on function public.desactivar_persona_con_reasignacion(uuid, text, text) to authenticated;
