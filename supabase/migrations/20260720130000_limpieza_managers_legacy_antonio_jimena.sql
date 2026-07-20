-- ============================================================
-- ✅ APLICADA (2026-07-20) — verificada contra la BD viva el 2026-07-20:
--    aparece en el registro de migraciones del proyecto y las policies/datos
--    coinciden (auditoría). Nota: Fátima y Antonio fueron editados DESPUÉS
--    a mano/por UI (Fátima: principal=Gloria; Antonio: Dani de vuelta en
--    apoyo) — ver CLAUDE.md.
-- ============================================================
-- LIMPIEZA de entradas legacy de `managers` (2026-07-20)
--
-- Con el modelo de "jefa directa" (2026-07-20), estar en el arreglo `managers`
-- de alguien otorga supervisión REAL sobre esa persona (tablero, peticiones,
-- crear/editar/pausar sus recurrentes, toques, leaderboard). Estas entradas son
-- reliquias de cuando los permisos venían del NIVEL, no de la relación.
--
-- SOLO se toca la columna `managers`; `manager_principal` NO se modifica en
-- ningún caso. Demian y Leonardo se dejan INTACTOS a propósito (su entrada de
-- managers es supervisión de apoyo intencional: Demian apoya a Fernanda;
-- Leonardo apoya a Montserrat). Sin hard-deletes.
--
-- Estado capturado (Fase 1 read-only, para el rollback de abajo):
--   Antonio : manager_principal=Emmanuel · managers={Montserrat,Dani}
--   Jimena  : manager_principal=Fernanda · managers={Montserrat}
-- ============================================================

begin;

-- 1) Antonio: sale SOLO Dani (redundante — dirección ve todo vía
--    mi_es_direccion()). Montserrat se queda como supervisión intencional.
update public.personas
   set managers = '{Montserrat}'::text[]
 where nombre = 'Antonio';

-- 2) Jimena: es 100% de Fernanda (su manager_principal). Montserrat sale;
--    Fernanda no depende de `managers` (es la principal).
update public.personas
   set managers = '{}'::text[]
 where nombre = 'Jimena';

commit;

-- ============================================================
-- ROLLBACK (restaura los arrays originales exactos — ejecutar manualmente
-- si hace falta revertir).
-- ============================================================
-- begin;
--   update public.personas set managers = '{Montserrat,Dani}'::text[] where nombre = 'Antonio';
--   update public.personas set managers = '{Montserrat}'::text[]      where nombre = 'Jimena';
-- commit;
-- ============================================================
