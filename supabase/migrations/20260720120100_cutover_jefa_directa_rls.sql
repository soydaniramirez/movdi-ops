-- ============================================================
-- ✅ APLICADA (2026-07-20) — verificada contra la BD viva el 2026-07-20:
--    las 4 policies (peticiones_select, recurrentes_select/update/delete)
--    coinciden exactamente con esta versión (auditoría).
-- ============================================================
-- FASE 2 — RLS de "jefa directa" (2026-07-20)
--
-- Objetivo: que los poderes que hoy dependen de nivel='head' pasen a depender
-- de la RELACIÓN de supervisión (es_de_mi_equipo), de modo que una ejecutiva
-- con gente a cargo (jefa directa) obtenga poderes SOLO sobre su gente, y de
-- paso cerrar el hoyo de que un head administre recurrentes de equipos ajenos.
--
-- es_de_mi_equipo(nombre) ya existe (cutover 8): TRUE si `nombre` reporta al
-- llamante como manager_principal o de apoyo. NO exige nivel — por eso basta
-- con quitarle el candado mi_nivel()='head' a las policies de equipo.
--
-- Se tocan 4 policies. NO se tocan: personas_*, anuncios_*, todos_*,
-- recurrentes_insert, peticiones_insert/update/delete, ni el RPC de baja.
-- La rama de PRIVADAS y la de dirección quedan intactas.
-- ============================================================

-- 1) PETICIONES SELECT: la rama de equipo deja de exigir head.
--    (privadas y dirección: sin cambio)
drop policy if exists peticiones_select on public.peticiones;
create policy peticiones_select on public.peticiones
  for select to authenticated
  using (
    case
      when privada = true then
        creado_por = public.mi_nombre() or para = public.mi_nombre()
      else
        creado_por = public.mi_nombre()
        or para = public.mi_nombre()
        or public.mi_es_direccion()
        or public.es_de_mi_equipo(creado_por)
        or public.es_de_mi_equipo(para)
    end
  );

-- 2) RECURRENTES SELECT: mismo modelo, sin el candado de head.
drop policy if exists recurrentes_select on public.recurrentes;
create policy recurrentes_select on public.recurrentes
  for select to authenticated
  using (
    creado_por = public.mi_nombre()
    or para = public.mi_nombre()
    or public.mi_es_direccion()
    or public.es_de_mi_equipo(creado_por)
    or public.es_de_mi_equipo(para)
  );

-- 3) RECURRENTES UPDATE: de "creador o cualquier ceo/head (global)" a
--    "creador, dirección, o jefa/head de la persona asignada". Cierra que un
--    head administre recurrentes de un equipo que no es el suyo.
drop policy if exists recurrentes_update on public.recurrentes;
create policy recurrentes_update on public.recurrentes
  for update to authenticated
  using (
    creado_por = public.mi_nombre()
    or public.mi_es_direccion()
    or public.es_de_mi_equipo(para)
  );

-- 4) RECURRENTES DELETE: mismo criterio que el UPDATE.
drop policy if exists recurrentes_delete on public.recurrentes;
create policy recurrentes_delete on public.recurrentes
  for delete to authenticated
  using (
    creado_por = public.mi_nombre()
    or public.mi_es_direccion()
    or public.es_de_mi_equipo(para)
  );

-- ============================================================
-- ROLLBACK (restaura las 4 policies previas — ejecutar manualmente).
-- ============================================================
-- drop policy if exists peticiones_select on public.peticiones;
-- create policy peticiones_select on public.peticiones
--   for select to authenticated
--   using (
--     case
--       when privada = true then creado_por = public.mi_nombre() or para = public.mi_nombre()
--       else creado_por = public.mi_nombre() or para = public.mi_nombre() or public.mi_es_direccion()
--            or (public.mi_nivel() = 'head' and (public.es_de_mi_equipo(creado_por) or public.es_de_mi_equipo(para)))
--     end
--   );
-- drop policy if exists recurrentes_select on public.recurrentes;
-- create policy recurrentes_select on public.recurrentes
--   for select to authenticated
--   using (
--     creado_por = public.mi_nombre() or para = public.mi_nombre() or public.mi_es_direccion()
--     or (public.mi_nivel() = 'head' and (public.es_de_mi_equipo(creado_por) or public.es_de_mi_equipo(para)))
--   );
-- drop policy if exists recurrentes_update on public.recurrentes;
-- create policy recurrentes_update on public.recurrentes
--   for update to authenticated
--   using (creado_por = public.mi_nombre() or public.mi_nivel() = any (array['ceo','head']));
-- drop policy if exists recurrentes_delete on public.recurrentes;
-- create policy recurrentes_delete on public.recurrentes
--   for delete to authenticated
--   using (creado_por = public.mi_nombre() or public.mi_nivel() = any (array['ceo','head']));
-- ============================================================
