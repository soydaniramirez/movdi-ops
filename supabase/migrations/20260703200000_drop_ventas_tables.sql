-- ============================================================
-- FIX URGENTE DE SEGURIDAD — eliminar tablas ventas_* huérfanas
-- Fecha: 2026-07-03 · Proyecto: nxyhgbrretusqbgfodmo
--
-- Contexto: el módulo de ventas ya vive en otro proyecto Supabase.
-- Estas 4 tablas quedaron aquí con una política RLS `ALL` para el
-- rol `public` con USING(true)/WITH CHECK(true), es decir: lectura
-- Y escritura anónimas con la anon key que está en el index.html
-- publicado. Son una fuga de datos (contactos de clientes con
-- email/teléfono) sin ningún consumidor legítimo en esta app
-- (index.html no las referencia).
--
-- Respaldo previo: backups/ventas_*_2026-07-03.csv (en el repo).
-- DROP ... CASCADE elimina también sus políticas RLS; ninguna otra
-- tabla tiene FKs hacia ellas (verificado en el esquema).
-- ============================================================

drop table if exists public.ventas_acciones cascade;
drop table if exists public.ventas_clientes cascade;
drop table if exists public.ventas_talentos cascade;
drop table if exists public.ventas_pms cascade;
