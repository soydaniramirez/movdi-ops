-- ============================================================
-- ✅ APLICADA el 2026-10-19 — corrida a mano por dirección en el SQL Editor
--    (no por CLI: el SQL Editor no la anota en supabase_migrations). Verificación
--    del pie: 5 filas exactas (personas_delete_admin DELETE · personas_insert_admin
--    INSERT · personas_select_all_auth SELECT · personas_self_link UPDATE ·
--    personas_update_admin UPDATE), sin personas_modify_admin.
-- ============================================================
-- RH gestiona personas (2026-10-19)
--
-- Contexto: personas_modify_admin vivía solo en la BD (esquema base, nunca
-- versionada — ver auditoria/03-backend-supabase.md). El nivel 'rh' (Sarai,
-- head de RH) ahora da de alta y edita personas desde /equipo, así que esta
-- migración REEMPLAZA esa policy por tres versionadas:
--
--   personas_insert_admin  INSERT  dirección O rh (con candados)
--   personas_update_admin  UPDATE  dirección O rh (con candados)
--   personas_delete_admin  DELETE  solo dirección (la app no borra personas:
--                                  la baja es lógica, activo=false)
--
-- DEFINICIÓN VIVA ANTERIOR (capturada de pg_policies antes de aplicar):
--   personas_modify_admin | ALL | authenticated
--     using      (mi_nivel() = ANY (ARRAY['ceo','head']))
--     with check (mi_nivel() = ANY (ARRAY['ceo','head']))
--
-- ⚠️ LOS HEADS PIERDEN LA ESCRITURA EN PERSONAS — A PROPÓSITO. Con la policy
-- vieja cualquier head podía, por la API con la anon key y su sesión, crear,
-- editar y BORRAR cualquier fila de personas, e incluso ponerse a sí mismo (o
-- a otro) nivel='ceo' y es_direccion=true, saltándose la Server Action (que
-- desde 4.14 ya solo dejaba gestionar a dirección). Ahora la BD coincide con
-- la app: escribe dirección, y RH con candados. Las otras dos policies de
-- personas (select_all_auth, self_link) quedan versionadas tal cual en
-- 20261019115900_versionar_personas_select_self_link.sql.
--
-- Candados de la rama RH (espejo de getAdminContexto/candadoRH en
-- app/(app)/equipo/actions.ts — el server action también los valida):
--   · la fila resultante no puede quedar con nivel 'ceo', es_direccion ni
--     ve_gamificacion_completa (este último daría ver-todo de gamificación,
--     que es de dirección — decisión Fase 4.8);
--   · RH no puede tocar una fila que HOY es de dirección (USING);
--   · RH no puede tocar su propia fila (ni por auth_user_id ni por email):
--     así no cambia su nivel ni sus áreas. Su vínculo auth sigue cubierto
--     por personas_self_link, que NO se toca.
--
-- "Dirección" = mi_es_direccion() o mi_nivel()='ceo', el mismo criterio que
-- esDireccion() en lib/equipo.ts. El RPC de baja
-- (desactivar_persona_con_reasignacion) es SECURITY DEFINER y sigue con su
-- propio check de rol.
-- ============================================================

drop policy if exists personas_modify_admin on public.personas;
drop policy if exists personas_insert_admin on public.personas;
drop policy if exists personas_update_admin on public.personas;
drop policy if exists personas_delete_admin on public.personas;

-- helper inline: ¿la fila es la mía?
--   auth_user_id = auth.uid()  ó  email = email del JWT
create policy personas_insert_admin on public.personas
  for insert to authenticated
  with check (
    public.mi_es_direccion()
    or public.mi_nivel() = 'ceo'
    or (
      public.mi_nivel() = 'rh'
      and coalesce(nivel, '') <> 'ceo'
      and not coalesce(es_direccion, false)
      and not coalesce(ve_gamificacion_completa, false)
      and auth_user_id is distinct from auth.uid()
      and lower(coalesce(email, '')) <> lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy personas_update_admin on public.personas
  for update to authenticated
  using (
    public.mi_es_direccion()
    or public.mi_nivel() = 'ceo'
    or (
      public.mi_nivel() = 'rh'
      -- la fila ACTUAL no es de dirección ni es la mía
      and coalesce(nivel, '') <> 'ceo'
      and not coalesce(es_direccion, false)
      and auth_user_id is distinct from auth.uid()
      and lower(coalesce(email, '')) <> lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  with check (
    public.mi_es_direccion()
    or public.mi_nivel() = 'ceo'
    or (
      public.mi_nivel() = 'rh'
      -- la fila NUEVA tampoco queda como dirección ni como la mía
      and coalesce(nivel, '') <> 'ceo'
      and not coalesce(es_direccion, false)
      and not coalesce(ve_gamificacion_completa, false)
      and auth_user_id is distinct from auth.uid()
      and lower(coalesce(email, '')) <> lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy personas_delete_admin on public.personas
  for delete to authenticated
  using (public.mi_es_direccion() or public.mi_nivel() = 'ceo');

-- ============================================================
-- VERIFICACIÓN (correr después de aplicar):
-- select policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename = 'personas' order by policyname;
-- Esperado (5 filas): personas_delete_admin DELETE · personas_insert_admin
-- INSERT · personas_select_all_auth SELECT · personas_self_link UPDATE ·
-- personas_update_admin UPDATE — y SIN personas_modify_admin.
-- ============================================================
-- ROLLBACK (deja personas exactamente como estaba antes del 2026-10-19 —
-- OJO: devuelve a los heads la escritura total, incluida la de nivel ceo):
-- begin;
-- drop policy if exists personas_insert_admin on public.personas;
-- drop policy if exists personas_update_admin on public.personas;
-- drop policy if exists personas_delete_admin on public.personas;
-- create policy personas_modify_admin on public.personas
--   for all to authenticated
--   using (public.mi_nivel() = any (array['ceo'::text, 'head'::text]))
--   with check (public.mi_nivel() = any (array['ceo'::text, 'head'::text]));
-- commit;
-- ============================================================
