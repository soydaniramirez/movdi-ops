-- ============================================================
-- ✅ APLICADA el 2026-09-18 con OK explícito de dirección (Dani), tras mostrar
--    el SQL. Registrada como 20260918200044_cutover_aprobacion_entrega.
--    Verificado contra la BD viva (las 7 verificaciones del pie, con sesiones
--    simuladas dentro de transacciones con rollback):
--      1. 0 entregadas sin sello · 949 selladas por el backfill · 0 selladas
--         que no estén entregadas.
--      2. Entregar como DESTINATARIO: pasa, aprobada_* quedan NULL y
--         updated_at SÍ se mueve (entregar es movimiento real).
--      3. Aprobar como CREADOR: sella y updated_at queda CONGELADO.
--      4. Aprobar como DESTINATARIO: revienta con el mensaje del guard.
--      4b. Ese mismo destinatario limpiando el sello (null): pasa.
--      5. Aprobar → reabrir → re-entregar: aprobada_* vuelven a NULL.
--      6. anon: 0 filas de lectura y 0 filas afectadas al intentar sellar
--         (la RLS de UPDATE lo corta antes del guard). La verificación por
--         HTTP con la anon key no se pudo correr desde el sandbox (la política
--         de red bloquea *.supabase.co); el equivalente a nivel de BD sí.
--      7. Security advisors: sin hallazgos nuevos (siguen solo los dos
--         conocidos y documentados: recurrentes_avisos y los helpers mi_*).
-- ============================================================
-- CUTOVER 12 — aprobación de entrega (2026-09-18)
--
-- Problema (dirección, 2026-09-18): cuando el destinatario marca "entregado",
-- quien pidió la petición NO se entera de nada — ni notificación, ni un paso
-- donde diga "sí, esto es lo que pedí". El ciclo se cierra solo del lado de
-- quien entrega.
--
-- Qué se agrega (aditivo, nada cambia de significado):
--   (1) peticiones.aprobada_en / aprobada_por — sello de "el que la pidió ya
--       la revisó y la dio por buena". NULL en una entregada = está en la
--       cola "por aprobar" del creador.
--   (2) backfill: TODO lo ya entregado nace aprobado, para que la cola no
--       amanezca con el histórico completo.
--   (3) trigger guard: SOLO el creador puede escribir esas dos columnas.
--
-- Lo que NO cambia:
--   · Gamificación, cumplimiento, rachas, leaderboard y cierre de mes siguen
--     leyendo `estatus='entregado'` + `fecha_entrega` EXACTAMENTE como hoy.
--     La aprobación no suma, no resta y no reordena nada.
--   · peticiones_touch_movimiento (cutover 9): aprobar NO es movimiento del
--     destinatario, y por eso aprobada_en/aprobada_por NO entran a su lista
--     de columnas — el trigger las manda al `else` y congela updated_at. Una
--     petición atorada no se "des-atora" porque alguien la apruebe.
--   · Ninguna policy de RLS. peticiones_update ya es
--     `creado_por = mi_nombre() or para = mi_nombre()` (verificado contra la
--     BD viva el 2026-09-18) y los grants de la tabla son a NIVEL TABLA
--     (relacl, sin ACL por columna), así que las columnas nuevas quedan
--     escribibles por el creador sin tocar grants.
--
-- "Pedir cambios" (la otra mitad de la función) NO necesita SQL: regresa el
-- estatus a 'pendiente', limpia estas dos columnas y anexa una línea a
-- `descripcion`, igual que las notas de avance.
-- ============================================================

-- ---------- (1) columnas ----------
alter table public.peticiones
  add column if not exists aprobada_en timestamptz,
  add column if not exists aprobada_por text;

comment on column public.peticiones.aprobada_en is
  'Cuándo el CREADOR dio por buena la entrega. NULL en una entregada = pendiente de aprobar. No participa en gamificación.';
comment on column public.peticiones.aprobada_por is
  'Quién aprobó (nombre de pila, mismo formato que creado_por/para). Solo el creador puede escribirla — ver trigger peticiones_guard_aprobacion.';

-- ---------- (2) backfill del histórico ----------
-- Sin esto, cada entrega vieja aparecería como "por aprobar" y la cola de
-- todos nacería llena. `fecha_entrega` es date: se toma como el sello real
-- cuando existe (entregas sin ese dato caen a now(), como en el resto del
-- código). El UPDATE NO mueve updated_at: no toca ninguna de las columnas
-- que el trigger de movimiento considera.
update public.peticiones
set aprobada_en = coalesce(fecha_entrega::timestamptz, now()),
    aprobada_por = creado_por
where estatus = 'entregado' and aprobada_en is null;

-- ---------- (3) guard: PONER el sello es del creador y de nadie más ----------
-- La RLS de UPDATE deja escribir la fila entera al creador Y al destinatario
-- (así ha sido siempre: ambos mueven estatus, fecha y evidencia). Sin este
-- guard, el destinatario podría auto-aprobarse su propia entrega llamando al
-- API con la anon key, saltándose la Server Action. Se cierra en BD, que es
-- la única barrera real del proyecto.
--
-- Asimetría a propósito: el candado es sobre ESCRIBIR UN SELLO (valor no
-- nulo). LIMPIARLO (dejarlo en NULL) lo puede hacer cualquiera que ya pueda
-- editar la fila, porque es lo que tiene que pasar cuando una entrega
-- aprobada se reabre y se vuelve a entregar: la entrega nueva NO puede
-- heredar el visto bueno de la anterior. Poner el sello = aprobar (creador);
-- quitarlo = "esto vuelve a necesitar revisión", que es lo contrario de un
-- privilegio.
--
-- Solo aplica a sesiones de usuario (auth.uid() not null): migraciones,
-- backfills y funciones SECURITY DEFINER siguen pudiendo tocar las columnas.
create or replace function public.peticiones_guard_aprobacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if ((new.aprobada_en  is not null and new.aprobada_en  is distinct from old.aprobada_en)
   or (new.aprobada_por is not null and new.aprobada_por is distinct from old.aprobada_por))
   and auth.uid() is not null
   and new.creado_por is distinct from public.mi_nombre()
  then
    raise exception 'solo quien pidió la petición puede aprobar su entrega';
  end if;
  return new;
end
$$;

drop trigger if exists peticiones_guard_aprobacion on public.peticiones;
create trigger peticiones_guard_aprobacion
  before update on public.peticiones
  for each row
  execute function public.peticiones_guard_aprobacion();

-- ============================================================
-- Verificación post-aplicación (flujo del proyecto):
--   1. select count(*) from peticiones where estatus='entregado' and aprobada_en is null;  -- → 0
--   2. Entregar una petición (sesión del destinatario) → aprobada_en sigue NULL
--      y el creador recibe notificación tipo 'entrega_por_aprobar'.
--   3. Aprobar (sesión del creador) → aprobada_en/aprobada_por se llenan y
--      updated_at NO se mueve (aprobar no es movimiento).
--   4. Intentar aprobar desde la sesión del DESTINATARIO (API directo):
--      → 'solo quien pidió la petición puede aprobar su entrega'.
--   4b. Esa misma sesión poniendo aprobada_en = null → SÍ pasa (es lo que
--      hace una re-entrega tras reabrir).
--   5. Aprobar → reabrir → volver a entregar: aprobada_en queda en NULL y la
--      petición regresa a la cola "por aprobar" del creador.
--   6. Petición anónima a peticiones → 0 filas / 401.
--   7. Security advisors sin hallazgos nuevos.
-- ============================================================
-- ROLLBACK (manual):
--   drop trigger if exists peticiones_guard_aprobacion on public.peticiones;
--   drop function if exists public.peticiones_guard_aprobacion();
--   alter table public.peticiones drop column if exists aprobada_en, drop column if exists aprobada_por;
-- (La UI tolera las columnas ausentes: sin ellas todo lo entregado se ve
--  aprobado y los botones nuevos no hacen nada útil, pero nada truena.)
-- ============================================================
