-- ============================================================
-- FASE RLS 2/2 — eliminar políticas "always true" (advisor 0024)
-- Fecha: 2026-07-03 · Proyecto: nxyhgbrretusqbgfodmo
-- Requiere: 20260703210000 (usa public.mi_es_direccion()).
--
-- Diseño verificado contra el index.html vivo para no romper la SPA:
-- · estrellas: el cliente inserta {de_persona: USER.nombre, ...} y
--   valida no-a-mí-mismo / máx 2 por semana / 1 por persona-semana.
--   Ahora la BD también lo exige (defensa en profundidad; la
--   validación autoritativa del límite pasará al servidor en Next.js).
-- · historial_mensual: solo dirección ejecuta el cierre de mes
--   (botón visible solo con es_direccion). El cliente nunca hace
--   UPDATE, pero se restringe igual a dirección.
-- · recompensas: el cliente solo lee (recomp_select se conserva);
--   la escritura queda solo para dirección.
-- · notificaciones: el cliente inserta notificaciones PARA OTROS
--   (avisar al destinatario de una petición), así que no se puede
--   exigir para = mi_nombre() sin romper la app vieja. Interim: solo
--   personas vinculadas (mi_nombre() no nulo) pueden insertar. El
--   cierre real llega cuando el INSERT se mueva a Server Action.
-- ============================================================

-- estrellas_colaboracion ------------------------------------------------
drop policy if exists estrellas_insert on public.estrellas_colaboracion;
create policy estrellas_insert on public.estrellas_colaboracion
  for insert to authenticated
  with check (
    de_persona = public.mi_nombre()
    and para_persona <> de_persona
    and (
      select count(*)
      from public.estrellas_colaboracion e
      where e.de_persona = public.mi_nombre()
        and e.semana = estrellas_colaboracion.semana
    ) < 2
    and not exists (
      select 1
      from public.estrellas_colaboracion e2
      where e2.de_persona = public.mi_nombre()
        and e2.semana = estrellas_colaboracion.semana
        and e2.para_persona = estrellas_colaboracion.para_persona
    )
  );

-- historial_mensual ------------------------------------------------------
drop policy if exists hist_insert on public.historial_mensual;
create policy hist_insert on public.historial_mensual
  for insert to authenticated
  with check (public.mi_es_direccion());

drop policy if exists hist_update on public.historial_mensual;
create policy hist_update on public.historial_mensual
  for update to authenticated
  using (public.mi_es_direccion())
  with check (public.mi_es_direccion());

-- recompensas ------------------------------------------------------------
-- recomp_select (SELECT/true para authenticated) se conserva: la app lee
-- el catálogo. Solo se reemplaza la escritura abierta.
drop policy if exists recomp_all on public.recompensas;
create policy recomp_write on public.recompensas
  for all to authenticated
  using (public.mi_es_direccion())
  with check (public.mi_es_direccion());

-- notificaciones ----------------------------------------------------------
drop policy if exists notif_insert on public.notificaciones;
create policy notif_insert on public.notificaciones
  for insert to authenticated
  with check (public.mi_nombre() is not null);
