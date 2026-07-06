-- ============================================================
-- ✅ APLICADA en el cutover del 2026-07-06 (histórico: estuvo staged sin aplicar).
-- Cambia comportamiento del SPA vivo (heads dejan de ver todo; ejecutivos
-- dejan de ver patrones ajenos): aplicar DESPUÉS del switch de hosting.
-- ============================================================
-- CUTOVER 8 — Visibilidad por EQUIPOS en peticiones y recurrentes
--
-- Hallazgo (2026-07-05, reporte de Leonardo): recurrentes_select era
-- `true` — cualquier ejecutivo leía los PATRONES recurrentes de otros
-- (herencia consciente del SPA, ahora cerrada). Se aplica el MISMO modelo
-- a ambas tablas:
--   · cada quien: creado_por = yo OR para = yo
--   · heads: además, filas donde el creador O el destinatario reporta a
--     ellos (manager_principal o apoyo — la misma relación del semáforo)
--   · dirección (es_direccion: Dani/Emmanuel): todas
--   · ejecutivo normal: SOLO lo suyo (0 ajenas)
--   · PRIVADAS (solo peticiones): intactas — creador/destinatario y nadie
--     más, ni heads ni dirección.
-- ============================================================

-- unaccent por si esta migración corre antes que la RPC de cutover 4
-- (idempotente); para/creado_por se comparan sin acentos/case, igual que
-- matchNombre del cliente.
create extension if not exists unaccent with schema extensions;

-- 1) HELPER compartido: ¿la persona llamada p_nombre reporta a MÍ?
--    (principal o apoyo). SECURITY DEFINER para leer personas sin depender
--    de sus policies; search_path fijo; sin EXECUTE para anon.
create or replace function public.es_de_mi_equipo(p_nombre text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.personas p
      join public.personas yo on yo.auth_user_id = auth.uid()
     where lower(extensions.unaccent(p.nombre)) = lower(extensions.unaccent(p_nombre))
       and coalesce(p.activo, true)
       and (
         p.manager_principal = yo.nombre
         or yo.nombre = any(coalesce(p.managers, '{}'::text[]))
       )
  )
$$;
revoke execute on function public.es_de_mi_equipo(text) from public, anon;
grant execute on function public.es_de_mi_equipo(text) to authenticated;

-- 2) PETICIONES: head pasa de "todas las no privadas" a "las de su equipo".
--    El guard de PRIVADAS queda idéntico (ni heads ni dirección).
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
        or (
          public.mi_nivel() = 'head'
          and (public.es_de_mi_equipo(creado_por) or public.es_de_mi_equipo(para))
        )
    end
  );

-- 3) RECURRENTES: cierra el SELECT público con el mismo modelo
--    (los patrones no tienen 'privada').
drop policy if exists recurrentes_select on public.recurrentes;
create policy recurrentes_select on public.recurrentes
  for select to authenticated
  using (
    creado_por = public.mi_nombre()
    or para = public.mi_nombre()
    or public.mi_es_direccion()
    or (
      public.mi_nivel() = 'head'
      and (public.es_de_mi_equipo(creado_por) or public.es_de_mi_equipo(para))
    )
  );

-- (INSERT/UPDATE/DELETE de ambas tablas: sin cambios en esta migración)
