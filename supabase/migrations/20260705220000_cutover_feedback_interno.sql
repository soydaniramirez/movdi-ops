-- ============================================================
-- ⚠️⚠️ NO APLICADA — APLICAR EN CUTOVER (ver docs/CUTOVER.md, paso C5c) ⚠️⚠️
-- Requiere el build con el módulo de feedback; aplicar DESPUÉS de la
-- migración 6 (usa mi_ve_gamificacion()).
-- ============================================================
-- CUTOVER 7 — Módulo de FEEDBACK INTERNO
--
-- Diseño (2026-07-05):
--   · categorías: reconocimiento (🙌 muro público) · mejora · liderazgo
--     (estas dos SOLO las lee dirección).
--   · ANONIMATO con doble candado: el Server Action no adjunta identidad
--     si es_anonimo, y un trigger BEFORE INSERT fuerza autor_id = NULL en
--     BD aunque el front falle. No se guarda IP ni metadata.
--   · UPDATE limitado por GRANT a estado/respuesta/compartible_loop y por
--     policy a dirección — nadie puede editar el mensaje de otro, ni
--     dirección puede reescribirlo.
--   · Sin XP por enviar (anti-farmeo). El reconocimiento con destinatario
--     genera una estrella (privada por la RLS 4.8) DESDE el server action,
--     respetando los límites 2/semana/no-self/no-repetir; si el límite ya
--     se alcanzó, el reconocimiento se publica igual SIN estrella. Un
--     reconocimiento ANÓNIMO no genera estrella (la estrella lleva
--     remitente por diseño y delataría al autor).
-- ============================================================

-- 1) TIPOS -----------------------------------------------------
create type public.feedback_categoria as enum ('reconocimiento', 'mejora', 'liderazgo');
create type public.feedback_estado as enum ('nuevo', 'en_revision', 'resuelto');

-- 2) TABLA -----------------------------------------------------
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  categoria public.feedback_categoria not null,
  mensaje text not null check (length(trim(mensaje)) between 1 and 2000),
  es_anonimo boolean not null default false,
  autor_id uuid references public.personas(id) on delete set null,
  destinatario_id uuid references public.personas(id) on delete set null,
  estado public.feedback_estado not null default 'nuevo',
  respuesta text,
  es_publico boolean not null default false,
  compartible_loop boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- destinatario solo aplica a reconocimientos
  constraint feedback_destinatario_solo_reconocimiento
    check (destinatario_id is null or categoria = 'reconocimiento'),
  -- el muro es solo de reconocimientos
  constraint feedback_publico_solo_reconocimiento
    check (es_publico = false or categoria = 'reconocimiento'),
  -- un firmado nunca queda sin autor (por bug del front); el anónimo sí va
  -- sin autor (el trigger corre ANTES del check, así que no chocan).
  -- Nota: como autor_id es ON DELETE SET NULL, este check convierte el
  -- borrado FÍSICO de una persona con feedback firmado en un error — a
  -- propósito: en esta app las personas se desactivan (activo=false),
  -- nunca se borran; si algún día se borrara una, primero habría que
  -- decidir qué hacer con su feedback firmado.
  constraint feedback_firmado_con_autor
    check (es_anonimo = true or autor_id is not null)
);

-- 3) TRIGGERS --------------------------------------------------
-- Candado de anonimato EN BD: si es_anonimo, autor_id se anula ANTES de
-- guardar — aunque el cliente/Server Action mandara identidad por error.
create or replace function public.feedback_forzar_anonimato()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.es_anonimo then
    new.autor_id := null;
  end if;
  return new;
end;
$$;

create trigger feedback_anonimato
  before insert on public.feedback
  for each row execute function public.feedback_forzar_anonimato();

-- updated_at automático (y blindado: un UPDATE tampoco puede des-anonimizar
-- ni re-firmar — autor_id y es_anonimo quedan congelados tras el insert)
create or replace function public.feedback_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.autor_id := old.autor_id;
  new.es_anonimo := old.es_anonimo;
  new.updated_at := now();
  return new;
end;
$$;

create trigger feedback_touch
  before update on public.feedback
  for each row execute function public.feedback_before_update();

-- 4) RLS -------------------------------------------------------
alter table public.feedback enable row level security;

-- SELECT:
--   · muro: reconocimientos públicos → todo el equipo autenticado
--   · autor firmado ve lo suyo
--   · destinatario ve el reconocimiento dirigido a él
--   · dirección / flag 4.8 ven TODO (mejora y liderazgo incluidos)
create policy feedback_select on public.feedback
  for select to authenticated
  using (
    (categoria = 'reconocimiento' and es_publico)
    or (autor_id is not null and autor_id = (public.mi_persona()).id)
    or (categoria = 'reconocimiento' and destinatario_id = (public.mi_persona()).id)
    or public.mi_es_direccion()
    or public.mi_ve_gamificacion()
  );

-- INSERT: cualquier autenticado, pero SIN suplantar autor: o va anónimo
-- (autor_id null — el trigger lo fuerza además) o firmado como uno mismo.
create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (
    autor_id is null or autor_id = (public.mi_persona()).id
  );

-- UPDATE: solo dirección/flag, y SOLO las columnas de gestión (grant de
-- columna): estado, respuesta, compartible_loop, es_publico.
create policy feedback_update on public.feedback
  for update to authenticated
  using (public.mi_es_direccion() or public.mi_ve_gamificacion())
  with check (public.mi_es_direccion() or public.mi_ve_gamificacion());

-- (sin policy de DELETE: nadie borra feedback por API)

-- 5) GRANTS ----------------------------------------------------
revoke all on public.feedback from public, anon;
grant select, insert on public.feedback to authenticated;
grant update (estado, respuesta, compartible_loop, es_publico)
  on public.feedback to authenticated;
