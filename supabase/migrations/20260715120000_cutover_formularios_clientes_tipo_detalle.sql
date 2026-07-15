-- ============================================================
-- ✅ APLICADA el 2026-07-15 con OK explícito de Daniela (vía MCP), con sus
-- 3 ajustes: (1) índice unaccent con wrapper INMUTABLE de dos argumentos —
-- verificado en el proyecto antes de aplicar (la versión de 1 argumento es
-- STABLE y el create index fallaría); (2) edición del catálogo = área admi
-- + dirección; (3) baja de clientes = lógica (activo=false), el DELETE
-- queda restringido a dirección y el FK protege el histórico.
-- ============================================================
-- CUTOVER 10 — Formularios dinámicos por área: catálogo de clientes +
-- tipo_peticion/detalle en peticiones.
--
-- Problema: se podían crear peticiones a Digital/Admi/Legal sin la info
-- que esas áreas necesitan; el hueco se perseguía por WhatsApp. OPS se
-- vuelve el candado: la config por área+tipo vive en lib/tipos-peticion.ts
-- (código, no tabla: los condicionales y validaciones son lógica, y la
-- misma config valida en cliente y servidor). Campos: clase 'bloqueante'
-- (sin él no se crea) o 'recomendado' (se marca si falta, no bloquea).
--
-- El catálogo de clientes es INTERNO de OPS (la herramienta administrativa
-- de MOVDI no se puede conectar). Todos leen para autocompletar; solo área
-- admi + dirección escriben (un RFC mal capturado no lo sobreescribe
-- cualquiera). Carga inicial por CSV desde /clientes.
-- ============================================================

-- 0a) Helper: ¿tengo un área? (RLS de escritura del catálogo)
create or replace function public.mi_tiene_area(p_area text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.personas p
     where p.auth_user_id = auth.uid()
       and coalesce(p.activo, true)
       and p_area = any(coalesce(p.areas, '{}'::text[]))
  )
$$;
revoke execute on function public.mi_tiene_area(text) from public, anon;
grant execute on function public.mi_tiene_area(text) to authenticated;

-- 0b) unaccent inmutable para índices: la versión de 1 argumento es STABLE
-- (resuelve el diccionario vía search_path); con el regdictionary explícito
-- es determinista y se puede declarar IMMUTABLE.
create or replace function public.unaccent_inmutable(text)
returns text
language sql immutable strict
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;
revoke execute on function public.unaccent_inmutable(text) from public, anon;
grant execute on function public.unaccent_inmutable(text) to authenticated;

-- 1) Catálogo interno de clientes (fiscales para Admi · legales para Legal)
create table public.clientes (
  id                          uuid primary key default gen_random_uuid(),
  nombre                      text not null,   -- nombre comercial / marca
  -- fiscales (factura)
  razon_social                text,
  rfc                         text,
  regimen_fiscal              text,
  cp_fiscal                   text,
  uso_cfdi                    text,
  -- legales (contratos)
  persona_moral               boolean,         -- condiciona doc de facultades
  constancia_fiscal_fecha     date,            -- vigencia ≤ 3 meses (aviso)
  constancia_fiscal_url       text,
  domicilio_fiscal            text,
  domicilio_comercial         text,            -- solo si difiere del fiscal
  firmante_nombre             text,
  firmante_cargo              text,
  facultades_doc_url          text,            -- solo persona moral
  identificacion_firmante_url text,
  correo_notificaciones       text,
  -- contacto operativo
  contacto_correo             text,
  activo                      boolean default true,
  creado_por                  text not null,
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now()
);

-- sin duplicados por nombre (case/acentos-insensible, wrapper inmutable)
create unique index clientes_nombre_unico
  on public.clientes (lower(public.unaccent_inmutable(nombre)));

-- RLS: leer = cualquier autenticado (autocompletar al crear peticiones);
-- crear/editar = SOLO área admi o dirección; borrar = solo dirección
-- (la acción normal de baja es activo=false — el FK de peticiones protege
-- el histórico y hace fallar el DELETE de clientes ya usados, a propósito).
alter table public.clientes enable row level security;
create policy clientes_select on public.clientes
  for select to authenticated using (true);
create policy clientes_insert on public.clientes
  for insert to authenticated
  with check (
    creado_por = public.mi_nombre()
    and (public.mi_tiene_area('admi') or public.mi_es_direccion())
  );
create policy clientes_update on public.clientes
  for update to authenticated
  using (public.mi_tiene_area('admi') or public.mi_es_direccion());
create policy clientes_delete on public.clientes
  for delete to authenticated using (public.mi_es_direccion());
revoke all on table public.clientes from anon;

-- updated_at del catálogo (incondicional: es catálogo, no semáforo)
create extension if not exists moddatetime with schema extensions;
create trigger clientes_touch before update on public.clientes
  for each row execute function extensions.moddatetime(updated_at);

-- 2) peticiones: tipo + detalle flexible + liga al cliente
alter table public.peticiones
  add column if not exists tipo_peticion text,
  add column if not exists detalle jsonb,
  add column if not exists cliente_id uuid references public.clientes(id);

create index if not exists peticiones_cliente_idx on public.peticiones (cliente_id);

-- ============================================================
-- Verificación post-aplicación:
--   1. anon → clientes: permission denied / 0 filas.
--   2. sesión sin área admi → INSERT/UPDATE en clientes: RLS lo rechaza.
--   3. sesión admi → INSERT ok; nombre duplicado (con acentos/case
--      distintos) → viola clientes_nombre_unico.
--   4. peticiones: insert con tipo_peticion/detalle/cliente_id ok; el
--      trigger de movimiento (cutover 9) sigue intacto.
--   5. Security advisors sin hallazgos nuevos.
-- ============================================================
