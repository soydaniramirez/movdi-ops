-- ============================================================
-- ⏳ SIN APLICAR — requiere OK explícito de dirección (regla de CLAUDE.md:
--    toda migración se muestra antes de aplicarse).
-- ============================================================
-- CUTOVER 11 — estatus 'cancelada' + salida alterna en la baja de persona
--
-- Problema (dirección, 2026-09-08): desactivar a alguien EXIGE reasignar
-- todas sus peticiones activas y sus recurrentes. Muchas de esas tareas ya
-- no sirven: pasárselas a otra persona ensucia su carga y su cumplimiento,
-- pero hoy no hay forma de cerrarlas — la baja se queda atorada.
--
-- Qué se agrega:
--   (1) estatus 'cancelada' en peticiones: cierre TERMINAL sin cumplimiento.
--       Distinto de 'entregado' (no suma) y de 'archivada' (legacy del SPA,
--       0 filas vivas al 2026-09-08 — se conserva por compatibilidad).
--       La fila NO se borra: el histórico queda intacto, solo cambia de
--       estatus (y se le anexa una línea de rastro en descripcion).
--   (2) dos parámetros opcionales en desactivar_persona_con_reasignacion
--       para cerrar en bloque en vez de reasignar.
--
-- Lo que NO cambia: la reasignación existente (mismos parámetros, mismo
-- comportamiento), el check de rol ceo|head DENTRO de la función, la
-- atomicidad todo-o-nada, ni ninguna policy de RLS.
-- ============================================================

-- ---------- (1) estatus 'cancelada' ----------
-- Solo se AMPLÍA el dominio permitido; ninguna fila existente cambia.
alter table public.peticiones drop constraint if exists peticiones_estatus_check;
alter table public.peticiones add constraint peticiones_estatus_check
  check (estatus in ('pendiente', 'proceso', 'entregado', 'archivada', 'cancelada'));

-- ---------- (2) baja de persona: reasignar O cancelar ----------
-- DROP + CREATE (no CREATE OR REPLACE): cambia la lista de argumentos, y una
-- sobrecarga dejaría ambigua la llamada de 3 args. Los parámetros nuevos son
-- DEFAULT false, así que una llamada con los 3 de siempre sigue funcionando
-- igual — el bundle viejo no se rompe si la migración entra antes del deploy.
drop function if exists public.desactivar_persona_con_reasignacion(uuid, text, text);

create or replace function public.desactivar_persona_con_reasignacion(
  p_persona_id uuid,
  p_reasignar_peticiones_a text default null,
  p_reasignar_recurrentes_a text default null,
  p_cancelar_peticiones boolean default false,
  p_cancelar_recurrentes boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_caller_nivel text;
  v_caller_nombre text;
  v_persona public.personas%rowtype;
  v_pet integer := 0;
  v_rec integer := 0;
  v_pet_canceladas integer := 0;
  v_rec_pausadas integer := 0;
  v_rastro text;
begin
  -- (a) solo ceo|head (verificado contra la sesión del caller) — SIN CAMBIOS
  select nivel, nombre into v_caller_nivel, v_caller_nombre
  from public.personas where auth_user_id = auth.uid() and coalesce(activo, true);
  if v_caller_nivel is null or v_caller_nivel not in ('ceo', 'head') then
    raise exception 'solo dirección o heads pueden desactivar personas';
  end if;

  select * into v_persona from public.personas where id = p_persona_id;
  if not found then raise exception 'persona no encontrada'; end if;

  -- reasignar y cancelar son EXCLUYENTES: pedir las dos cosas para el mismo
  -- bloque es un error de la UI, no algo que se resuelva adivinando.
  if p_cancelar_peticiones and p_reasignar_peticiones_a is not null then
    raise exception 'peticiones: elige reasignar O cancelar, no ambas';
  end if;
  if p_cancelar_recurrentes and p_reasignar_recurrentes_a is not null then
    raise exception 'recurrentes: elige reasignar O cancelar, no ambas';
  end if;

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

  -- qué está vivo (paridad SPA): peticiones NO cerradas y recurrentes activas
  -- ASIGNADAS A la persona (para = X). 'cancelada' entra a la lista de estatus
  -- cerrados: una tarea ya cancelada no vuelve a bloquear la baja.
  select count(*) into v_pet from public.peticiones
  where lower(extensions.unaccent(para)) = lower(extensions.unaccent(v_persona.nombre))
    and estatus not in ('entregado', 'archivada', 'cancelada');
  select count(*) into v_rec from public.recurrentes
  where lower(extensions.unaccent(para)) = lower(extensions.unaccent(v_persona.nombre)) and activa;

  if v_pet > 0 and p_reasignar_peticiones_a is null and not p_cancelar_peticiones then
    raise exception 'elige a quién reasignar las peticiones o cancélalas (% activas)', v_pet;
  end if;
  if v_rec > 0 and p_reasignar_recurrentes_a is null and not p_cancelar_recurrentes then
    raise exception 'elige a quién reasignar las recurrentes o cancélalas (% activas)', v_rec;
  end if;

  -- (b)+(c): todo o nada, incluidas filas creadas por terceros
  if v_pet > 0 and p_reasignar_peticiones_a is not null then
    update public.peticiones set para = p_reasignar_peticiones_a
    where lower(extensions.unaccent(para)) = lower(extensions.unaccent(v_persona.nombre))
      and estatus not in ('entregado', 'archivada', 'cancelada');
  elsif v_pet > 0 and p_cancelar_peticiones then
    -- Cierre en bloque. La fila SE CONSERVA (no hay delete): cambia el estatus
    -- y se anexa una línea de rastro a descripcion, con el mismo formato que
    -- las notas de avance, para que en el histórico se vea quién y por qué.
    v_rastro := '✕ cancelada (' || to_char(hoy, 'DD/MM/YYYY') || ', ' ||
                coalesce(v_caller_nombre, 'dirección') || '): baja de ' || v_persona.nombre;
    update public.peticiones
    set estatus = 'cancelada',
        descripcion = case
          when descripcion is null or descripcion = '' then v_rastro
          else descripcion || E'\n' || v_rastro
        end
    where lower(extensions.unaccent(para)) = lower(extensions.unaccent(v_persona.nombre))
      and estatus not in ('entregado', 'archivada', 'cancelada');
    get diagnostics v_pet_canceladas = row_count;
  end if;

  if v_rec > 0 and p_reasignar_recurrentes_a is not null then
    update public.recurrentes set para = p_reasignar_recurrentes_a
    where lower(extensions.unaccent(para)) = lower(extensions.unaccent(v_persona.nombre)) and activa;
  elsif v_rec > 0 and p_cancelar_recurrentes then
    -- Un patrón no se "cancela": se APAGA (activa = false), que es el mismo
    -- estado que deja el botón de pausar. Deja de generar instancias y el
    -- histórico de lo ya entregado sigue intacto.
    update public.recurrentes set activa = false
    where lower(extensions.unaccent(para)) = lower(extensions.unaccent(v_persona.nombre)) and activa;
    get diagnostics v_rec_pausadas = row_count;
  end if;

  update public.personas set activo = false where id = p_persona_id;

  return jsonb_build_object(
    'peticiones_reasignadas', case when p_reasignar_peticiones_a is not null then v_pet else 0 end,
    'recurrentes_reasignadas', case when p_reasignar_recurrentes_a is not null then v_rec else 0 end,
    'peticiones_canceladas', v_pet_canceladas,
    'recurrentes_desactivadas', v_rec_pausadas
  );
end;
$$;

-- authenticated puede llamarla: el check de rol vive DENTRO de la función.
revoke execute on function public.desactivar_persona_con_reasignacion(uuid, text, text, boolean, boolean) from public, anon;
grant execute on function public.desactivar_persona_con_reasignacion(uuid, text, text, boolean, boolean) to authenticated;
