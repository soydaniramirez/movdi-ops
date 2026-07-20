-- ============================================================
-- ⏳ SIN APLICAR — requiere OK explícito (regla CLAUDE.md: mostrar SQL/diff
--    y esperar visto bueno antes de tocar la base).
-- ============================================================
-- FASE 1 — DATOS de jerarquía (2026-07-20)
--
-- Cambios de personas para (a) formalizar a Valeria como head y (b) habilitar
-- las primeras "jefas directas" reutilizando la relación de managers (por
-- NOMBRE de pila — así se comparan hoy es_de_mi_equipo y todo el código).
--
-- Estado capturado en Fase 0 (para el rollback de abajo):
--   Valeria  : nivel=head  · manager_principal=Dani       · managers={}
--   Brenda   : manager_principal=Valeria · managers={Emmanuel}
--   Fátima   : manager_principal=Montserrat · managers={}
--   Jimena   : manager_principal=Fernanda · managers={Montserrat}
--
-- NOTA: Valeria ya estaba en nivel=head al capturar (el UPDATE es idempotente);
-- Jimena ya tenía a Fernanda como principal (su UPDATE es una autocorrección
-- defensiva que no cambia nada hoy). Los cambios netos reales son Brenda y
-- Fátima. No hay hard-deletes ni se tocan más filas que estas cuatro.
-- ============================================================

begin;

-- 1) Valeria → head (idempotente; el CHECK personas_nivel_check ya lo permite)
update public.personas
   set nivel = 'head'
 where nombre = 'Valeria' and nivel is distinct from 'head';

-- 2) Brenda → reporta SOLO a Valeria. Dirección conserva visibilidad total
--    vía mi_es_direccion(), así que Emmanuel sale del arreglo de apoyo.
update public.personas
   set managers = '{}'::text[]
 where nombre = 'Brenda';

-- 3) Fátima → jefa directa = Zazil (principal). Montserrat DEBE permanecer en
--    el arreglo de apoyo o pierde visibilidad de Fátima. Gloria queda como
--    apoyo adicional.
update public.personas
   set manager_principal = 'Zazil',
       managers = '{Zazil,Gloria,Montserrat}'::text[]
 where nombre = 'Fátima';

-- 4) Jimena → asegurar manager_principal = Fernanda (defensivo; hoy no cambia).
update public.personas
   set manager_principal = 'Fernanda'
 where nombre = 'Jimena' and manager_principal is distinct from 'Fernanda';

commit;

-- ============================================================
-- ROLLBACK (restaura el snapshot de Fase 0 — ejecutar manualmente si hace
-- falta revertir). Valeria se deja en head porque YA era head al capturar.
-- ============================================================
-- begin;
--   update public.personas set managers = '{Emmanuel}'::text[] where nombre = 'Brenda';
--   update public.personas
--      set manager_principal = 'Montserrat', managers = '{}'::text[]
--    where nombre = 'Fátima';
--   -- Jimena y Valeria: sin cambios (ya estaban en el estado objetivo).
-- commit;
-- ============================================================
