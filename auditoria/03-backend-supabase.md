# 03 · Backend Supabase — MOVDI OPS

Auditoría técnica de solo lectura · 2026-07-20 · Proyecto: `nxyhgbrretusqbgfodmo`.

Este documento consolida: (A) el esquema/RLS/funciones/cron según las 18 migraciones del repo, (B) el inventario COMPLETO de llamadas a Supabase desde la app (cada `.from()`/`.rpc()`/auth con tabla, operación, columnas, función y línea), y (C) el uso de Auth. Lo que depende de configuración del proyecto vivo y no es visible en el repo está marcado **pendiente de validación** (lista al final).

**Hecho estructural clave (confirmado)**: el esquema BASE no está versionado. Solo hay 3 `CREATE TABLE` en el repo (`recurrentes_avisos`, `feedback`, `clientes`); las 10 tablas núcleo (personas, peticiones, recurrentes, todos, anuncios, anuncios_vistos, notificaciones, recompensas, historial_mensual, estrellas_colaboracion) y sus policies base no tienen SQL en `supabase/migrations/` — el proyecto no es reconstruible desde el repo.

## Resumen de tablas × módulos (quién usa qué)

| Tabla | Módulos que la leen | Módulos que la escriben | Operaciones |
|---|---|---|---|
| personas | TODOS (page.tsx por email + listas completas en clients/actions/layout) | equipo (INSERT/UPDATE alta-edición-pausa-baja), vinculo.ts (UPDATE auth_user_id) | S/I/U |
| peticiones | peticiones, recurrentes, equipo, progreso, rh, layout (XP) | peticiones (I/U/D), recurrentes (I al entregar/mover instancia), RPC desactivar (U reasigna) | S/I/U/D |
| recurrentes | peticiones, recurrentes, equipo, progreso | recurrentes (I/U/D), RPC desactivar (U reasigna) | S/I/U/D |
| todos | todos | todos (I server / U/D client) | S/I/U/D |
| anuncios | anuncios | anuncios (I crear / U archivar) | S/I/U |
| anuncios_vistos | anuncios | anuncios (I marcar visto, idempotente) | S/I |
| notificaciones | campana | SOLO service_role (notificar.ts) + función SQL del cron; usuario: U vista / D propias (client-side) | S/U/D + I privilegiado |
| recompensas | progreso | progreso (I/U editor, solo dirección) | S/I/U |
| historial_mensual | progreso, peticiones (podio fallback) | progreso (I cierre de mes; U SOLO columna recompensa_entregada) | S/I/U(col) |
| estrellas_colaboracion | estrellas, progreso, layout (XP) | estrellas (I), feedback (I estrella acoplada) | S/I |
| feedback | feedback, progreso (logros 🙌) | feedback (I enviar / U gestión dirección; sin DELETE por API) | S/I/U |
| clientes | clientes, peticiones (autocompletar) | clientes (I/U/D), peticiones (I/U guardarClienteAlCatalogo) | S/I/U/D |
| recurrentes_avisos | — (deny-all API) | solo función SQL del cron (dedupe) | — |

## Uso de Supabase Auth

| Llamada | Dónde | Evidencia |
|---|---|---|
| `auth.signInWithPassword` | login | login-form.tsx:26 |
| `auth.resetPasswordForEmail` (redirectTo `/auth/confirm?next=/update-password`) | login | login-form.tsx:47-49 |
| `auth.exchangeCodeForSession` (PKCE `?code=`) / `auth.verifyOtp` (`?token_hash=`, recovery\|invite) | route handler | app/auth/confirm/route.ts:21,24 |
| `auth.updateUser({password})` | update-password | update-password/page.tsx:31 |
| `auth.signOut()` | logout | logout-button.tsx:11 |
| `auth.getUser()` | middleware (refresh por request) + layout + todas las pages/actions | lib/supabase/middleware.ts:39 y ~20 sitios |
| `auth.admin.inviteUserByEmail` | **ÚNICO uso admin de Auth** — alta de persona (service_role) | equipo/actions.ts:105-106 |

**Vínculo auth ↔ persona** (`personas.auth_user_id`, alimenta `mi_nombre()` y toda la RLS de escritura), 3 capas: (1) el alta liga de inmediato con el id del invite (UPDATE con sesión de dirección, equipo/actions.ts:121-123); (2) autocuración en el layout (`asegurarVinculoAuth`: `update .is('auth_user_id', null)`, lib/supabase/vinculo.ts:26-39 + layout.tsx:23-27) respaldada por la policy `personas_self_link` — **cuyo SQL NO existe en el repo** (aplicada por dashboard; pendiente de validación); (3) banner y `MSG_CUENTA_SIN_VINCULO` en getContexto.

**service_role**: exactamente 2 consumidores, ambos server-only, consistente con CLAUDE.md — el invite de Auth (equipo/actions.ts:106) y el helper de notificaciones (lib/supabase/notificar.ts: SELECT personas de validación + INSERT notificaciones; `notificarToque` añade el SELECT del límite 1/día). `lib/supabase/admin.ts` lleva `import 'server-only'`.

**RPCs consumidas por la app**: `podio_mes_cerrado(p_mes)` (peticiones-client.tsx:649, progreso-client.tsx:78) y `desactivar_persona_con_reasignacion(uuid,text,text)` (equipo/actions.ts:243-247). **Realtime**: canal `notif-<nombre>`, `postgres_changes` INSERT en `public.notificaciones` con filtro `para=eq.<nombre>` (lib/notificaciones.ts:63-76) — que la publicación `supabase_realtime` incluya la tabla es configuración no versionada. **Storage / Edge Functions**: no se usan (cero referencias en el código).

---

# A. Esquema y seguridad según las migraciones del repo

## 1. Inventario de migraciones

| # | Archivo | Fecha | Propósito | Crea/altera/borra |
|---|---|---|---|---|
| 1 | `20260703200000_drop_ventas_tables.sql` (21 lín.) | 2026-07-03 | Fix de seguridad: 4 tablas ventas_* huérfanas con policy `ALL/public/true` (lectura+escritura anónima) | DROP TABLE CASCADE: ventas_acciones, ventas_clientes, ventas_talentos, ventas_pms (L18-21). Respaldo en backups/*.csv |
| 2 | `20260703210000_fix_funciones_mi_search_path.sql` (59) | 2026-07-03 | Endurecer funciones mi_* (advisors 0011/0028): search_path='' + revocar EXECUTE a anon | CREATE OR REPLACE mi_nombre, mi_nivel, mi_persona (L16-38); crea mi_es_direccion (L40-49); REVOKE de public/anon + GRANT authenticated (L51-59) |
| 3 | `20260703211000_endurecer_policies_always_true.sql` (70) | 2026-07-03 | Eliminar policies always-true (advisor 0024) | Reemplaza: estrellas_insert (límite 2/semana en BD, L24-43), hist_insert/hist_update → mi_es_direccion (L46-55), recomp_all → recomp_write (L60-64), notif_insert → interim `mi_nombre() is not null` (L67-70) |
| 4 | `20260703220000_cerrar_personas_select_anon.sql` (17) | 2026-07-03 | Cerrar el hallazgo crítico (personas legible anónimamente) | DROP POLICY personas_select_anon + REVOKE SELECT ON personas FROM anon (L16-17) |
| 5 | `20260703230000_cutover_quincenal_fecha_inicio.sql` (31) | staged 07-03, ✅ aplicada 07-06 (cabecera L2) | Quincenal real anclada | ADD COLUMN recurrentes.fecha_inicio date (L18-19); backfill quincenales por created_at hora MX (L21-27); CHECK `recurrentes_quincenal_requiere_fecha_inicio` (L29-31) |
| 6 | `20260703230500_cutover_recordatorio_recurrentes.sql` (108) | staged 07-03, ✅ aplicada 07-06 | Recordatorio diario de recurrentes | CREATE TABLE recurrentes_avisos (dedup, PK (recurrente_id,fecha), L23-28); RLS habilitado SIN policies + revoke all anon/authenticated (L31-32); función `notificar_recurrentes_del_dia()` (L34-106); revoke EXECUTE a public/anon/authenticated (L108) |
| 7 | `20260703231000_cutover_encender_cron_recordatorios.sql` (22) | staged 07-03, ✅ aplicada 07-06 | Interruptor del cron | CREATE EXTENSION pg_cron (L16); `cron.schedule('recordatorio-recurrentes-diario','0 13 * * *', select notificar_recurrentes_del_dia())` (L18-22) |
| 8 | `20260704120000_cutover_rpc_desactivar_persona.sql` (110) | staged 07-04, ✅ aplicada 07-06 | Baja transaccional con reasignación (hallazgo 4.5/4.6: peticiones_update no deja reasignar filas de terceros) | CREATE EXTENSION unaccent schema extensions (L26); función `desactivar_persona_con_reasignacion(uuid,text,text)` SECURITY DEFINER (L28-106); revoke public/anon, grant authenticated (L109-110) |
| 9 | `20260704130000_cutover_endurecer_notif_insert.sql` (32) | staged 07-04, ✅ aplicada 07-06 | Cierre definitivo del interim de notificaciones (opción A: cero inserts de cliente) | DROP POLICY notif_insert (L23); REVOKE INSERT ON notificaciones FROM anon, authenticated (L27) |
| 10 | `20260705190000_cutover_gamificacion_privacidad.sql` (109) | staged 07-05, ✅ aplicada 07-06 | Privacidad de gamificación (Fase 4.8) | ADD COLUMN personas.ve_gamificacion_completa (L24-25) + update dirección=true (L28); función mi_ve_gamificacion (L32-44); reemplaza estrellas_select (L47-54), recomp_select (L58-61), hist_select (L65-72); ADD COLUMN historial_mensual.recompensa_entregada (L75-76); revoke UPDATE tabla + grant UPDATE(recompensa_entregada) (L81-82); reemplaza hist_update rh|dirección (L84-88); RPC podio_mes_cerrado (L92-109) |
| 11 | `20260705220000_cutover_feedback_interno.sql` (138) | staged 07-05, ✅ aplicada 07-06 | Módulo feedback interno | CREATE TYPE feedback_categoria y feedback_estado (L26-27); CREATE TABLE feedback (L30-58); triggers feedback_anonimato / feedback_touch (L63-97); 3 policies (select/insert/update, L107-130); grants (L135-138) |
| 12 | `20260705230000_cutover_visibilidad_equipos.sql` (84) | staged 07-05, ✅ aplicada 07-06 | Visibilidad por equipos (hallazgo Leonardo: recurrentes_select=true) | Función es_de_mi_equipo(text) (L29-47); reemplaza peticiones_select (L51-67) y recurrentes_select (L71-82) con rama head |
| 13 | `20260706160401_cutover_feedback_grants_fix.sql` (17) | 2026-07-06 | Fix: default privileges dejaban UPDATE/DELETE de tabla completa a authenticated en feedback | REVOKE ALL feedback FROM authenticated; re-grant select,insert + update(estado,respuesta,compartible_loop,es_publico) (L14-17) |
| 14 | `20260714120000_cutover_compromisos_origen_movimiento.sql` (87) | ✅ aplicada 2026-07-14 (cabecera L2) | Compromisos: origen + último movimiento | ADD COLUMN peticiones.origen text CHECK (talento|cliente|interno|propio), sin default (L37-40) + COMMENT (L42-43); función y trigger peticiones_touch_movimiento BEFORE UPDATE condicional (L46-73). NO toca policies (L13) |
| 15 | `20260715120000_cutover_formularios_clientes_tipo_detalle.sql` (127) | ✅ aplicada 2026-07-15 (cabecera L2) | Formularios por área + catálogo clientes | Funciones mi_tiene_area(text) (L26-39) y unaccent_inmutable(text) (L44-50); CREATE TABLE clientes (L53-79); índice único clientes_nombre_unico (L82-83); RLS clientes 4 policies + revoke anon (L89-103); CREATE EXTENSION moddatetime + trigger clientes_touch (L106-108); ADD COLUMNs peticiones.tipo_peticion/detalle/cliente_id FK (L111-114) + índice peticiones_cliente_idx (L116) |
| 16 | `20260720120000_jerarquia_valeria_head_jefas_datos.sql` (62) | 2026-07-20 — cabecera dice "⏳ SIN APLICAR" (L2) pero CLAUDE.md y el PR #7 dicen ✅ APLICADA (ver hallazgo 6.1) | Datos de jerarquía | UPDATEs a personas: Valeria nivel='head' (L26-28), Brenda managers={} (L32-34), Fátima manager_principal='Zazil' + managers={Zazil,Gloria,Montserrat} (L39-42), Jimena manager_principal='Fernanda' defensivo (L45-47). Rollback comentado L55-61 |
| 17 | `20260720120100_cutover_jefa_directa_rls.sql` (101) | 2026-07-20 — misma discrepancia de cabecera | RLS "jefa directa": quitar candado nivel='head' | Reemplaza peticiones_select (L23-37), recurrentes_select (L40-49), recurrentes_update (L54-61), recurrentes_delete (L64-71). Rollback comentado L76-100 |
| 18 | `20260720130000_limpieza_managers_legacy_antonio_jimena.sql` (46) | 2026-07-20 — cabecera "⏳ SIN APLICAR"; PR #8 dice "Aplicada y verificada"; CLAUDE.md dice "NO limpiadas" (ver hallazgo 6.1) | Limpieza de managers legacy | UPDATEs personas: Antonio managers={Montserrat} (sale Dani, L26-28); Jimena managers={} (L32-34). Demian/Leonardo intactos a propósito (L13-15) |

---

## 2. Tablas

Convención: "(base no versionada)" = la tabla existe pero su CREATE TABLE no está en el repo; las columnas listadas como "inferidas" solo se conocen por referencias en migraciones/docs.

### personas (base NO versionada)
- Columnas añadidas por migraciones: `ve_gamificacion_completa boolean not null default false` (20260705190000:24-25).
- Columnas inferidas por uso (sin definición visible): `id uuid`, `nombre`, `apellido`, `email`, `rol`, `nivel` (con CHECK `personas_nivel_check` mencionado en 20260720120000:25), `areas text[]` (mi_tiene_area, 20260715120000:35), `es_direccion boolean`, `activo boolean`, `pausada_hasta date` (20260703230500:54), `manager_principal text`, `managers text[]` (20260705230000:41-42), `auth_user_id uuid` (todas las mi_*).
- Policies (todas de esquema base, no versionadas — solo referenciadas): `personas_select_all_auth` (20260703220000:11), `personas_modify_admin` (20260704120000:14), `personas_self_link` (referida en app/(app)/layout.tsx:22, lib/supabase/vinculo.ts:13, docs/ONBOARDING.md:42 — **no existe en ningún .sql del repo**). Eliminada: `personas_select_anon` (20260703220000:16).
- Grants: `revoke select on personas from anon` (20260703220000:17).

### peticiones (base NO versionada)
- Columnas añadidas: `origen text` + CHECK `peticiones_origen_check` in (talento,cliente,interno,propio), nullable, SIN default (20260714120000:37-40); `tipo_peticion text`, `detalle jsonb`, `cliente_id uuid REFERENCES clientes(id)` (20260715120000:111-114).
- Índices: `peticiones_cliente_idx (cliente_id)` (20260715120000:116).
- Trigger: `peticiones_touch_movimiento` BEFORE UPDATE (20260714120000:70-73) — mueve `updated_at` solo si cambia estatus/descripcion/nota_entrega/link_entrega/fecha_entrega; en cualquier otro caso congela el valor viejo (anti-farmeo, incluye escritura manual de updated_at).
- Columnas inferidas: `id, creado_por, para, estatus, privada, fecha, fecha_original, fecha_entrega, nota_entrega, link_entrega, descripcion, origen_recur, oculta_para, cambio_visto_por_creador, created_at, updated_at`.
- Policies base no versionadas: `peticiones_insert` (`creado_por = mi_nombre()`, citada en 20260714120000:12-13), `peticiones_update` (`creado_por = mi_nombre() OR para = mi_nombre()`, citada en 20260704120000:7-9), `peticiones_delete` (solo mencionada en 20260720120100:17). `peticiones_select` sí está versionada (ver §4).

### recurrentes (base NO versionada)
- Columnas añadidas: `fecha_inicio date` (20260703230000:18-19) con backfill de quincenales.
- Constraint: `recurrentes_quincenal_requiere_fecha_inicio` CHECK (frecuencia<>'quincenal' or fecha_inicio not null) (20260703230000:29-31).
- Columnas inferidas: `id uuid, nombre, para, creado_por, frecuencia (semanal|quincenal|mensual), dia_semana, dia_mes, activa, created_at`.
- Policies versionadas: select/update/delete (§4). `recurrentes_insert` NO versionada (citada 20260720120100:17).

### recurrentes_avisos — CREADA en repo (20260703230500:23-28)
- `recurrente_id uuid NOT NULL REFERENCES recurrentes(id) ON DELETE CASCADE`, `fecha date NOT NULL`, `avisada_en timestamptz NOT NULL default now()`, PK (recurrente_id, fecha).
- RLS habilitado **sin ninguna policy** (deny-all para API) + `revoke all from anon, authenticated` (L31-32). Solo la escribe la función definer.

### notificaciones (base NO versionada)
- Columnas inferidas: `para, tipo, titulo, detalle, peticion_id` (INSERT en 20260703230500:89-96).
- Policy INSERT: nació `WITH CHECK (true)` (histórico, 20260704130000:10) → interim `mi_nombre() is not null` (20260703211000:67-70) → **eliminada del todo** (20260704130000:23) + `revoke insert from anon, authenticated` (L27). Estado final: sin policy de INSERT; solo service_role/definer insertan.
- Policy SELECT `para = mi_nombre()` citada en 20260704130000:20 — NO versionada. En realtime: tabla en publicación `supabase_realtime` (docs/CUTOVER.md, A3) — no versionado.

### todos, anuncios, anuncios_vistos (base NO versionada)
- **Ninguna migración del repo las toca.** Sus policies (`todos_*`, `anuncios_*`) solo se mencionan como "NO se tocan" en 20260720120100:16. Columnas y RLS completas: pendiente de validación en el proyecto vivo.

### recompensas (base NO versionada)
- Policies: `recomp_all` (ALL always-true) eliminada → `recomp_write` ALL con mi_es_direccion() (20260703211000:60-64); `recomp_select` era SELECT/true (L58), reemplazada por `using (mi_ve_gamificacion())` (20260705190000:58-61).

### historial_mensual (base NO versionada)
- Columna añadida: `recompensa_entregada boolean not null default false` (20260705190000:75-76).
- Columnas inferidas: `persona, mes (text YYYY-MM), xp_total, cumplimiento, recompensa`.
- Grants: `revoke update from authenticated` + `grant update (recompensa_entregada)` — UPDATE por API limitado a esa única columna, ni dirección puede tocar xp/cumplimiento vía API (20260705190000:81-82).

### estrellas_colaboracion (base NO versionada)
- Columnas inferidas: `de_persona, para_persona, semana`.
- Policies versionadas: insert (20260703211000:25-43) y select (20260705190000:48-54).

### feedback — CREADA en repo (20260705220000:30-58)
- Columnas: id uuid PK gen_random_uuid, categoria (enum), mensaje text CHECK length 1..2000, es_anonimo bool default false, autor_id uuid FK personas ON DELETE SET NULL, destinatario_id uuid FK personas ON DELETE SET NULL, estado (enum, default 'nuevo'), respuesta text, es_publico bool default false, compartible_loop bool default false, created_at/updated_at.
- Constraints: `feedback_destinatario_solo_reconocimiento`, `feedback_publico_solo_reconocimiento`, `feedback_firmado_con_autor` (es_anonimo=true OR autor_id not null) (L44-57).
- Triggers: `feedback_anonimato` BEFORE INSERT (fuerza autor_id=NULL si es_anonimo) (L76-78); `feedback_touch` BEFORE UPDATE (congela autor_id y es_anonimo, actualiza updated_at) (L95-97).

### clientes — CREADA en repo (20260715120000:53-79)
- Columnas: id uuid PK, nombre NOT NULL, razon_social, rfc, regimen_fiscal, cp_fiscal, uso_cfdi, persona_moral bool, constancia_fiscal_fecha date, constancia_fiscal_url, domicilio_fiscal, domicilio_comercial, firmante_nombre, firmante_cargo, facultades_doc_url, identificacion_firmante_url, correo_notificaciones, contacto_correo, activo bool default true, creado_por NOT NULL, created_at, updated_at.
- Índice único: `clientes_nombre_unico ON (lower(unaccent_inmutable(nombre)))` (L82-83).
- Trigger: `clientes_touch` BEFORE UPDATE → `extensions.moddatetime(updated_at)` incondicional (L107-108).

---

## 3. Funciones y RPCs

| Función | Firma / retorno | Definer | search_path | EXECUTE | Qué hace | Evidencia |
|---|---|---|---|---|---|---|
| `mi_nombre()` | → text, sql stable | SÍ | '' | authenticated (revocado public/anon) | nombre de personas por auth.uid() | 20260703210000:16-22,51,56 |
| `mi_nivel()` | → text, sql stable | SÍ | '' | authenticated | nivel por auth.uid() | ibid:24-30 |
| `mi_persona()` | → public.personas, sql stable | SÍ | '' | authenticated | fila completa propia | ibid:32-38 |
| `mi_es_direccion()` | → boolean, sql stable | SÍ | '' | authenticated | coalesce(es_direccion,false) | ibid:40-49 |
| `mi_ve_gamificacion()` | → boolean, sql stable | SÍ | '' | authenticated | flag ve_gamificacion_completa (exige activo) | 20260705190000:32-44 |
| `es_de_mi_equipo(p_nombre text)` | → boolean, sql stable | SÍ | '' | authenticated | ¿p_nombre me reporta como manager_principal o en managers[]? Compara lower+unaccent, exige p.activo | 20260705230000:29-47 |
| `mi_tiene_area(p_area text)` | → boolean, sql stable | SÍ | '' | authenticated | ¿tengo p_area en personas.areas[]? (exige activo) | 20260715120000:26-39 |
| `unaccent_inmutable(text)` | → text, sql IMMUTABLE STRICT | NO | '' | authenticated (revocado public/anon) | wrapper de extensions.unaccent con regdictionary explícito (la de 1 arg es STABLE); soporta el índice único de clientes | 20260715120000:44-50 |
| `podio_mes_cerrado(p_mes text default null)` | → jsonb, sql stable | SÍ | '' | authenticated | top 3 (persona, cumplimiento, mes) del mes cerrado (max mes < mes actual MX), orden xp_total desc | 20260705190000:92-109 |
| `desactivar_persona_con_reasignacion(uuid, text, text)` | → jsonb, plpgsql | SÍ | '' | authenticated (check de rol ceo|head DENTRO, L46-50) | valida destinos (activos, no pausados, ≠persona), reasigna peticiones activas y recurrentes activas por `para` (match lower+unaccent), marca activo=false; transaccional | 20260704120000:28-110 |
| `notificar_recurrentes_del_dia()` | → integer, plpgsql | SÍ | '' | **revocado a public/anon/authenticated** — solo pg_cron como postgres | por cada recurrente activa con persona activa/no pausada: calcula si hoy ocurre (mensual dia_mes / quincenal (hoy−fecha_inicio)%14 / semanal dow; quincenal legacy sin ancla como semanal), salta resueltas/movidas, deduplica en recurrentes_avisos e inserta notificación 'recurrente_hoy' | 20260703230500:34-108 |
| `feedback_forzar_anonimato()` | trigger, plpgsql | NO | '' | (trigger) | autor_id:=NULL si es_anonimo | 20260705220000:63-74 |
| `feedback_before_update()` | trigger, plpgsql | NO | '' | (trigger) | congela autor_id/es_anonimo, updated_at:=now() | ibid:82-93 |
| `peticiones_touch_movimiento()` | trigger, plpgsql | NO | '' | (trigger) | updated_at:=now() solo si cambia estatus/descripcion/nota_entrega/link_entrega/fecha_entrega; si no, congela el valor viejo | 20260714120000:46-67 |
| `extensions.moddatetime` | (extensión) | — | — | — | updated_at de clientes | 20260715120000:106-108 |

---

## 4. Políticas RLS — estado FINAL según el repo (aplicando las 18 en orden)

⚠️ Solo las policies definidas/alteradas en el repo. El resto del set base (personas_*, peticiones_insert/update/delete, recurrentes_insert, todos_*, anuncios_*, notif_select/update/delete, anuncios_vistos) NO está versionado → pendiente de validación.

### personas
- `personas_select_anon` — **ELIMINADA** (20260703220000:16).
- REVOKE SELECT FROM anon (ibid:17).
- Vigentes según referencias (no versionadas): personas_select_all_auth, personas_modify_admin, personas_self_link.

### peticiones
- `peticiones_select` (SELECT, authenticated) — versión FINAL en 20260720120100:23-37: privada=true → creador/para; si no → creador/para OR mi_es_direccion() OR **es_de_mi_equipo(creado_por) OR es_de_mi_equipo(para)** (sin exigir nivel head). Reemplaza la de 20260705230000:51-67 (que exigía `mi_nivel()='head'` en la rama de equipo).
- INSERT/UPDATE/DELETE: no versionadas (insert `creado_por=mi_nombre()`; update `creado_por|para = mi_nombre()` — citadas, ver §2).

### recurrentes
- `recurrentes_select` (SELECT) — FINAL 20260720120100:40-49: creador/para OR dirección OR es_de_mi_equipo(creado_por|para). Reemplaza 20260705230000:71-82 (con candado head), que a su vez reemplazó la `using(true)` original no versionada.
- `recurrentes_update` (UPDATE) — FINAL 20260720120100:54-61: `creado_por=mi_nombre() OR mi_es_direccion() OR es_de_mi_equipo(para)`. Reemplaza la base no versionada `creado_por=mi_nombre() OR mi_nivel() in (ceo,head)` (visible en el rollback comentado, L93-96).
- `recurrentes_delete` (DELETE) — FINAL ibid:64-71, mismo criterio que UPDATE.
- `recurrentes_insert`: no versionada.

### recurrentes_avisos
- RLS ON, **cero policies** (deny-all API); revoke all anon/authenticated (20260703230500:31-32).

### notificaciones
- `notif_insert`: eliminada; REVOKE INSERT FROM anon, authenticated (20260704130000:23,27). Estado final: ninguna policy de INSERT — solo service_role (lib/supabase/notificar.ts) y la función definer del cron.
- SELECT `para = mi_nombre()`: citada (20260704130000:20), no versionada.

### estrellas_colaboracion
- `estrellas_insert` (INSERT, authenticated) — 20260703211000:25-43: de_persona=mi_nombre() AND para≠de AND <2 estrellas mías esa semana AND no repetir persona-semana.
- `estrellas_select` (SELECT) — 20260705190000:48-54: participo (di o recibí) OR mi_ve_gamificacion(). Reemplaza la abierta base (no versionada).

### recompensas
- `recomp_write` (ALL) — mi_es_direccion() USING+CHECK (20260703211000:61-64). Reemplazó `recomp_all` always-true.
- `recomp_select` (SELECT) — mi_ve_gamificacion() (20260705190000:59-61). Reemplazó SELECT/true.

### historial_mensual
- `hist_insert` (INSERT) — mi_es_direccion() (20260703211000:47-49).
- `hist_select` (SELECT) — persona=mi_nombre() OR mi_nivel()='rh' OR mi_ve_gamificacion() (20260705190000:66-72).
- `hist_update` (UPDATE) — rh OR dirección (20260705190000:85-88), pero el GRANT limita a la columna recompensa_entregada (L81-82). Reemplaza la hist_update de 20260703211000:52-55 (solo dirección).

### feedback
- `feedback_select` — muro (reconocimiento AND es_publico) OR autor firmado OR destinatario de reconocimiento OR mi_es_direccion() OR mi_ve_gamificacion() (20260705220000:107-115).
- `feedback_insert` — autor_id IS NULL OR autor_id = (mi_persona()).id (L119-123).
- `feedback_update` — dirección/flag (L127-130). Sin policy de DELETE (nadie borra por API).
- Grants FINALES (tras fix 20260706160401:14-17): revoke all from authenticated → grant select, insert + update SOLO (estado, respuesta, compartible_loop, es_publico). Antes del fix authenticated retenía UPDATE tabla completa y DELETE por default privileges.

### clientes (20260715120000:89-103)
- `clientes_select` — SELECT authenticated USING (true) ← **always-true intencional** (autocompletar).
- `clientes_insert` — creado_por=mi_nombre() AND (mi_tiene_area('admi') OR dirección).
- `clientes_update` — mi_tiene_area('admi') OR dirección (sin WITH CHECK explícito).
- `clientes_delete` — solo dirección. `revoke all from anon` (L103).

### todos / anuncios / anuncios_vistos
- Sin ninguna policy en el repo (solo la mención "NO se tocan" en 20260720120100:16).

### Resumen GRANT/REVOKE por rol
- anon: revoke SELECT personas (20260703220000:17) · revoke INSERT notificaciones (20260704130000:27) · revoke ALL recurrentes_avisos (20260703230500:32), feedback (20260705220000:135), clientes (20260715120000:103) · revoke EXECUTE de todas las funciones listadas en §3.
- authenticated: revoke ALL recurrentes_avisos · revoke INSERT notificaciones · historial_mensual: UPDATE solo columna recompensa_entregada · feedback: select+insert+update(4 columnas), sin DELETE · EXECUTE de todas las funciones salvo notificar_recurrentes_del_dia (revocada también a authenticated).

---

## 5. Cron y extensiones

- **pg_cron**: `create extension if not exists pg_cron` (20260703231000:16). Job `recordatorio-recurrentes-diario`, schedule exacto **`0 13 * * *`** (UTC = 07:00 America/Mexico_City, sin DST), comando `select public.notificar_recurrentes_del_dia();` (L18-22). CUTOVER.md C6 confirma activo desde 2026-07-06 (corrida manual: 12 avisos).
- **unaccent**: `create extension if not exists unaccent with schema extensions` (20260704120000:26 y de nuevo, idempotente, 20260705230000:24).
- **moddatetime**: `create extension if not exists moddatetime with schema extensions` (20260715120000:106).
- **pgcrypto/gen_random_uuid**: usado (feedback/clientes) pero sin CREATE EXTENSION en el repo (en Supabase suele venir habilitado; pendiente de validación).
- Publicación realtime `supabase_realtime` incluye notificaciones (docs/CUTOVER.md sección A3, "verificado ya en BD") — configuración no versionada.


---

# B. Inventario completo de llamadas Supabase por módulo

Cada tabla proviene de la lectura completa del módulo correspondiente (función + línea verificadas). Suma verificada contra `grep -c "\.from(\|\.rpc("` por archivo.

## B.1 Peticiones


### 3.1 Cliente (`peticiones-client.tsx`) — 5 `.from()` + 1 `.rpc()` (todas SELECT, anon+RLS)
| # | Llamada | Función | Línea |
|---|---|---|---|
| C1 | `from('personas').select('*').order('nivel')` | `recargar` | L88 |
| C2 | `from('peticiones').select('*').order('fecha')` | `recargar` | L89 |
| C3 | `from('recurrentes').select('*')` | `recargar` | L90 |
| C4 | `from('historial_mensual').select('*')` | `recargar` | L91 |
| C5 | `from('clientes').select('*').order('nombre')` | `recargar` | L92 |
| C6 | `rpc('podio_mes_cerrado', { p_mes })` | `BannerPodio` useEffect | L649 |

### 3.2 `page.tsx` — 1 `.from()` (server, sesión)
| P1 | `from('personas').select('*').eq('email', user.email).maybeSingle()` | `PeticionesPage` | L11-12 |

### 3.3 `actions.ts` — 32 `.from()` (server, sesión del usuario → RLS; SIN service_role salvo notificaciones vía `notificarServidor`)
| # | Tabla | Op | Columnas | Función | Línea |
|---|---|---|---|---|---|
| A1 | personas | select * eq email maybeSingle | — | `getContexto` | L33 |
| A2 | personas | select * | — | `crearPeticion` | L90 |
| A3 | clientes | select id eq id maybeSingle | id | `crearPeticion` | L131 |
| A4 | peticiones | insert (N filas) .select() | zona,nombre,descripcion,creado_por,para,area,fecha,prioridad,estatus,privada,grupo_id,tipo_peticion,detalle,cliente_id | `crearPeticion` | L155 |
| A5 | peticiones | select * eq id | — | `guardarClienteAlCatalogo` | L204 |
| A6 | clientes | select * ilike nombre | — | `guardarClienteAlCatalogo` | L225 |
| A7 | clientes | update (solo huecos) eq id | mapa `DETALLE_A_CLIENTE` L176-193 | `guardarClienteAlCatalogo` | L236 |
| A8 | clientes | insert {…datos, nombre, creado_por} | ídem | `guardarClienteAlCatalogo` | L241-243 |
| A9 | peticiones | update cliente_id eq id (best-effort) | cliente_id | `guardarClienteAlCatalogo` | L253 |
| A10 | peticiones | insert | zona,nombre,descripcion,creado_por,para,area,fecha,prioridad,estatus,privada:false,origen | `crearCompromiso` | L287 |
| A11 | peticiones | select * eq id | — | `agregarNotaAvance` | L331 |
| A12 | peticiones | update descripcion eq id select id | descripcion | `agregarNotaAvance` | L343-344 |
| A13 | peticiones | update eq id select | estatus,link_entrega,nota_entrega,fecha_entrega | `entregarPeticion` | L361-370 |
| A14 | peticiones | select * eq id | — | `cambiarEstatus` | L385-386 |
| A15 | peticiones | update estatus eq id select | estatus | `cambiarEstatus` | L391 |
| A16 | personas | select * | — | `cambiarEstatus` (notif reabierta) | L397 |
| A17 | peticiones | select * eq id | — | `cambiarFecha` | L424 |
| A18 | peticiones | update eq id select | fecha,fecha_original,motivo_cambio_fecha,cambio_visto_por_creador[,extension_justificada] | `cambiarFecha` | L442 |
| A19 | personas | select * | — | `cambiarFecha` | L446 |
| A20 | peticiones | select * eq id | — | `moverInstancia` (real) | L491 |
| A21 | peticiones | update eq id select | fecha,fecha_original,motivo_cambio_fecha,extension_justificada,cambio_visto_por_creador | `moverInstancia` | L500-506 |
| A22 | personas | select * | — | `moverInstancia` | L510 |
| A23 | recurrentes | select * eq id | — | `moverInstancia` (virtual) | L524 |
| A24 | peticiones | insert | zona,nombre,descripcion,creado_por,para,area,fecha,fecha_original,motivo_cambio_fecha,extension_justificada,prioridad,estatus,privada:false,origen_recur,cambio_visto_por_creador | `moverInstancia` | L531-547 |
| A25 | personas | select * | — | `moverInstancia` | L550 |
| A26 | peticiones | delete eq id select | — | `eliminarPeticion` | L569 |
| A27 | peticiones | select * eq estatus='entregado' | — | `ocultarEntregadas` | L589-590 |
| A28 | peticiones | update oculta_para eq id select id (en bucle for) | oculta_para | `ocultarEntregadas` | L602-606 |
| A29 | peticiones | select * eq id maybeSingle | — | `ocultarPeticion` | L618 |
| A30 | peticiones | update oculta_para eq id select id | oculta_para | `ocultarPeticion` | L621-625 |
| A31 | peticiones | select * eq id maybeSingle | — | `desocultarPeticion` | L637 |
| A32 | peticiones | update oculta_para eq id select id | oculta_para | `desocultarPeticion` | L639-643 |

Además: INSERT a `notificaciones` vía `notificarServidor` (lib/supabase/notificar.ts, admin/service_role — fuera de este módulo) llamado por el wrapper `notificar` (actions L51-58) desde `crearPeticion` (L158), `cambiarEstatus` (L398), `cambiarFecha` (L450/458), `moverInstancia` (L512/552). `crearCompromiso` NO notifica (comentario L265-266). Tipos de notificación generados: `nueva_peticion`, `reabierta`, `fecha_cambiada`.

---


## B.2 Recurrentes y To-dos
(Sin `.rpc()` en estos módulos.)

### recurrentes/actions.ts (7)
| # | Línea | Tabla | Operación | Columnas / filtro | Función |
|---|-------|-------|-----------|-------------------|---------|
| 1 | 26-27 | personas | SELECT `*` | `.eq('email', user.email).maybeSingle()` | `getContexto` |
| 2 | 50 | personas | SELECT `*` | — (todas las visibles por RLS) | `crearRecurrente` (resolver supervisión y validar destinatarios) |
| 3 | 121 | recurrentes | INSERT (bulk, 1 fila/destinatario) `.select()` | nombre, descripcion, para, area, frecuencia, activa, creado_por, dia_mes\|dia_semana, fecha_inicio (quincenal) | `crearRecurrente` |
| 4 | 133-134 | recurrentes | UPDATE `.select()` | `{activa}` · `.eq('id')` | `toggleRecurrente` |
| 5 | 147-148 | recurrentes | DELETE `.select()` | `.eq('id')` | `eliminarRecurrente` |
| 6 | 169 | recurrentes | SELECT `*` | `.eq('id', recurId)` | `entregarInstanciaVirtual` |
| 7 | 173-188 | peticiones | INSERT | zona, nombre, descripcion, creado_por, para, area, fecha, prioridad, estatus:'entregado', privada:false, origen_recur, link_entrega, nota_entrega, fecha_entrega | `entregarInstanciaVirtual` |

### recurrentes-client.tsx (3) + page.tsx (1)
| # | Línea | Tabla | Operación | Función |
|---|-------|-------|-----------|---------|
| 1 | client 39 | personas | SELECT `*` | `recargar` |
| 2 | client 40 | recurrentes | SELECT `*` | `recargar` |
| 3 | client 41 | peticiones | SELECT `*` `.order('fecha')` | `recargar` |
| 4 | page 8-9 | personas | SELECT `*` `.eq('email').maybeSingle()` | `RecurrentesPage` |

Nota: el encargo esperaba "4 en client"; en `recurrentes-client.tsx` hay exactamente **3** `.from()` (L39-41). La cuarta llamada del módulo está en `page.tsx:8`. (Además `page.tsx:7` hace `auth.getUser()`, que no es `.from()`.)

### todos/actions.ts (2) · todos-client.tsx (4) · todos/page.tsx (1)
| # | Archivo:línea | Tabla | Operación | Función |
|---|---------------|-------|-----------|---------|
| 1 | actions 17-18 | personas | SELECT `*` `.eq('email').maybeSingle()` | `crearTodo` |
| 2 | actions 25-29 | todos | INSERT (user_nombre, texto, hecho:false) | `crearTodo` |
| 3 | client 25 | todos | SELECT `*` `.order('created_at', desc)` | `recargar` |
| 4 | client 45 | todos | UPDATE `{hecho}` `.eq('id')` | `toggle` |
| 5 | client 52 | todos | UPDATE `{texto}` `.eq('id')` | `guardarEdicion` |
| 6 | client 57 | todos | DELETE `.eq('id')` | `borrar` |
| 7 | page 8-9 | personas | SELECT `*` `.eq('email').maybeSingle()` | `TodosPage` |

Cross-módulo usadas desde recurrentes-client: `entregarPeticion` (peticiones UPDATE, `peticiones/actions.ts:361-370`) y `moverInstancia` (peticiones SELECT/UPDATE/INSERT + personas SELECT + notificaciones vía `notificar`, `peticiones/actions.ts:474-560`).

---


## B.3 Equipo, Organigrama y RH


### `app/(app)/equipo/actions.ts` — 13 `.from()` + 1 `.rpc()` + 1 `auth.admin.*` (+2 `auth.getUser()`)
| # | Función | Línea | Llamada | Tabla | Operación / columnas |
|---|---------|-------|---------|-------|----------------------|
| 1 | `getAdminContexto` | L20 | `supabase.auth.getUser()` | auth | lee sesión |
| 2 | `getAdminContexto` | L22-23 | `.from('personas').select('*').eq('email', user.email).maybeSingle()` | personas | SELECT * (fila propia) |
| 3 | `crearPersona` | L88 | `.from('personas').insert(payload).select()` | personas | INSERT nombre, apellido, rol, email, areas, nivel, needs_pass, managers, manager_principal |
| 4 | `crearPersona` | L105-106 | `admin.auth.admin.inviteUserByEmail(payload.email)` | auth (service_role) | invite; ÚNICO uso admin de Auth (comentario L95-102) |
| 5 | `crearPersona` | L122-123 | `.from('personas').update({ auth_user_id: invitado.user.id }).eq('id', nueva.id)` | personas | UPDATE auth_user_id (con sesión de dirección, no service_role) |
| 6 | `editarPersona` | L144 | `.from('personas').select('*').eq('id', input.id)` | personas | SELECT * |
| 7 | `editarPersona` | L149 | `.from('personas').update(payload).eq('id', input.id).select()` | personas | UPDATE mismas columnas del payload |
| 8 | `pausarPersona` | L162-163 | `.from('personas').update({ pausada_hasta: input.hasta }).eq('id', input.id).select()` | personas | UPDATE pausada_hasta |
| 9 | `reanudarPersona` | L175-176 | `.from('personas').update({ pausada_hasta: null }).eq('id', input.id).select()` | personas | UPDATE pausada_hasta=null |
| 10 | `reactivarPersona` | L188-189 | `.from('personas').update({ activo: true }).eq('id', input.id).select()` | personas | UPDATE activo=true |
| 11 | `desactivarConReasignacion` | L216 | `.from('personas').select('*')` | personas | SELECT * (todas) |
| 12 | `desactivarConReasignacion` | L217 | `.from('peticiones').select('*')` | peticiones | SELECT * |
| 13 | `desactivarConReasignacion` | L218 | `.from('recurrentes').select('*')` | recurrentes | SELECT * |
| 14 | `desactivarConReasignacion` | L243-247 | `.rpc('desactivar_persona_con_reasignacion', { p_persona_id, p_reasignar_peticiones_a, p_reasignar_recurrentes_a })` | RPC | SECURITY DEFINER, transaccional |
| 15 | `darToque` | L265 | `supabase.auth.getUser()` | auth | lee sesión |
| 16 | `darToque` | L267-268 | `.from('personas').select('*').eq('email', user.email).maybeSingle()` | personas | SELECT * (fila propia) |
| 17 | `darToque` | L282 | `.from('personas').select('*')` | personas | SELECT * (todas, para validar relación) |

Nota de conteo: el encargo mencionaba "2 auth.admin"; lo verificado es **1** llamada `auth.admin.*` (`inviteUserByEmail`, L106) más **2** `auth.getUser()` (L20, L265). `createAdminClient()` (L105) crea el cliente pero no es una llamada en sí.

Adicional (invocado desde `darToque`): `lib/supabase/notificar.ts` `notificarToque` con service_role — `.from('personas').select('*')` (L81), `.from('notificaciones').select('id').eq('para').eq('tipo','toque').eq('titulo').gte('creada_en')` (L92-95), `.from('notificaciones').insert({para, tipo, titulo, detalle, peticion_id})` (L101-107).

### `app/(app)/equipo/page.tsx` — 2 `.from()`
- L10-11: `.from('personas').select('*').eq('email', user!.email!).maybeSingle()` — fila propia.
- L27: `.from('personas').select('*')` — todas (para `tengoSupervisadas`).
- L9: `auth.getUser()`.

### `app/(app)/equipo/equipo-client.tsx` — 3 `.from()` (client, anon+RLS)
- `recargar` (L67-71): `.from('personas').select('*').order('nivel')` · `.from('peticiones').select('*')` · `.from('recurrentes').select('*')` — en `Promise.all`, se re-ejecuta tras cada acción (L155).

### `app/(app)/organigrama/page.tsx` — 2 `.from()`
- L14-15: `.from('personas').select('*').eq('email', user!.email!).maybeSingle()`.
- L30: `.from('personas').select('*')` — todas, para construir el árbol.
- L13: `auth.getUser()`.

### `app/(app)/rh/page.tsx` — 2 `.from()`
- L13-14: `.from('personas').select('*').eq('email', user!.email!).maybeSingle()`.
- L24-25: `.from('peticiones').select('*').eq('area', 'rh').order('fecha')` — peticiones del área RH (privadas filtradas por RLS, comentario L22-23).
- L12: `auth.getUser()`.

---


## B.4 Progreso y Estrellas


### progreso/actions.ts (12 × .from)
| # | Función | Línea | Tabla | Operación | Columnas |
|---|---------|-------|-------|-----------|----------|
| 1 | cerrarMes | 23-24 | personas | select('*').eq('email', user.email).maybeSingle() | * |
| 2 | cerrarMes | 34 | personas | select('*') | * |
| 3 | cerrarMes | 35 | peticiones | select('*') | * |
| 4 | cerrarMes | 36 | estrellas_colaboracion | select('*') | * |
| 5 | cerrarMes | 37 | recompensas | select('*') | * |
| 6 | cerrarMes | 38 | historial_mensual | select('*') | * |
| 7 | cerrarMes | 68 | historial_mensual | insert(filas).select() | persona, mes, xp_total, nivel_alcanzado, entregadas, cumplimiento, mejor_racha, recompensa (actions.ts:58-67) |
| 8 | getYo | 82-83 | personas | select('*').eq('email').maybeSingle() | * |
| 9 | guardarRecompensa | 107 | recompensas | select('*').eq('nivel', input.nivel) | * |
| 10 | guardarRecompensa | 109-110 | recompensas | update({descripcion, activa}).eq('id', existentes[0].id) | descripcion, activa |
| 11 | guardarRecompensa | 113-114 | recompensas | insert({nivel, descripcion, activa}) | nivel, descripcion, activa |
| 12 | marcarRecompensaEntregada | 133-134 | historial_mensual | update({recompensa_entregada: true}).eq('id', input.id).select('id') | recompensa_entregada |

### progreso/progreso-client.tsx (7 × .from + 1 × .rpc — la consigna decía 8 .from; en el código hay 7, ver §8)
| # | Función | Línea | Tabla/RPC | Operación |
|---|---------|-------|-----------|-----------|
| 1 | recargar | 54 | personas | select('*') |
| 2 | recargar | 55 | peticiones | select('*') |
| 3 | recargar | 56 | recurrentes | select('*') |
| 4 | recargar | 57 | estrellas_colaboracion | select('*') |
| 5 | recargar | 58 | recompensas | select('*').order('nivel') |
| 6 | recargar | 59 | historial_mensual | select('*').order('mes', {ascending: false}) |
| 7 | recargar | 70 | feedback | select('*') — pre-cutover la tabla puede no existir: `fb.error` → cae a [] (líneas 68-71) |
| 8 | recargar | 78 | rpc('podio_mes_cerrado', { p_mes: m }) | una llamada POR CADA mes (hasta 12, línea 75-82); fallback local top-3 por xp_total si todas fallan/vacían (líneas 83-90) |

### progreso/page.tsx (3 × .from)
| # | Línea | Tabla | Operación |
|---|-------|-------|-----------|
| 1 | 11-12 | personas | select('*').eq('email', user!.email!).maybeSingle() |
| 2 | 29 | peticiones | select('*') |
| 3 | 30 | estrellas_colaboracion | select('*') |

### estrellas/actions.ts (4 × .from)
| # | Función | Línea | Tabla | Operación |
|---|---------|-------|-------|-----------|
| 1 | darEstrella | 20-21 | personas | select('*').eq('email').maybeSingle() |
| 2 | darEstrella | 31 | personas | select('*') (para validar destinatario) |
| 3 | darEstrella | 38-40 | estrellas_colaboracion | select('*').eq('de_persona', yo.nombre).eq('semana', sem) |
| 4 | darEstrella | 49-54 | estrellas_colaboracion | insert({de_persona, para_persona, motivo, semana}) |
- Además: `notificarServidor` (estrellas/actions.ts:61-70) inserta en `notificaciones` vía lib/supabase/notificar.ts (service_role, fuera del alcance de este conteo).

### estrellas/estrellas-client.tsx (2 × .from)
| # | Línea | Tabla | Operación |
|---|-------|-------|-----------|
| 1 | 28 | estrellas_colaboracion | select('*').order('creada_en', {ascending: false}) |
| 2 | 29 | personas | select('*') |

### estrellas/page.tsx (1 × .from)
| # | Línea | Tabla | Operación |
|---|-------|-------|-----------|
| 1 | 8-9 | personas | select('*').eq('email', user!.email!).maybeSingle() |

---


## B.5 Anuncios, Feedback, Clientes y Campana/Notificaciones


Sin `.rpc()` en ninguno de los 4 módulos.

### /anuncios
| # | Archivo:Línea | Función | Tabla | Operación | Columnas / filtros |
|---|---|---|---|---|---|
| 1 | anuncios/page.tsx:8-9 | `AnunciosPage` | personas | SELECT `*` | `eq('email', user.email)` maybeSingle |
| 2 | anuncios-client.tsx:27 | `recargar` | anuncios | SELECT `*` | `eq('activo', true)`, order `creado_en` desc |
| 3 | anuncios-client.tsx:28 | `recargar` | anuncios_vistos | SELECT `*` | sin filtro (RLS decide) |
| 4 | anuncios/actions.ts:17-18 | `getContexto` | personas | SELECT `*` | `eq('email', user.email)` maybeSingle |
| 5 | anuncios/actions.ts:50-59 | `crearAnuncio` | anuncios | INSERT | titulo, contenido, tipo, audiencia, creado_por, expira_en, activo |
| 6 | anuncios/actions.ts:71-72 | `archivarAnuncio` | anuncios | UPDATE | `{activo:false}` eq id, `.select()` |
| 7 | anuncios/actions.ts:85-87 | `marcarAnuncioVisto` | anuncios_vistos | SELECT `anuncio_id` | eq anuncio_id + persona_nombre (check idempotencia) |
| 8 | anuncios/actions.ts:90-93 | `marcarAnuncioVisto` | anuncios_vistos | INSERT | anuncio_id, persona_nombre |

### /feedback
| # | Archivo:Línea | Función | Tabla | Operación | Columnas / filtros |
|---|---|---|---|---|---|
| 9 | feedback/page.tsx:10-11 | `FeedbackPage` | personas | SELECT `*` | eq email |
| 10 | feedback-client.tsx:30 | `recargar` | feedback | SELECT `*` | order `created_at` desc (error ⇒ moduloActivo=false) |
| 11 | feedback-client.tsx:31 | `recargar` | personas | SELECT `*` | — (mapa id→nombre) |
| 12 | feedback/actions.ts:25-26 | `getYo` | personas | SELECT `*` | eq email |
| 13 | feedback/actions.ts:56 | `enviarFeedback` | personas | SELECT `*` | — (resolver destinatario por matchNombre) |
| 14 | feedback/actions.ts:64-73 | `enviarFeedback` | feedback | INSERT | categoria, mensaje, es_anonimo, autor_id, destinatario_id, es_publico |
| 15 | feedback/actions.ts:81-83 | `enviarFeedback` | estrellas_colaboracion | SELECT `*` | eq de_persona + semana |
| 16 | feedback/actions.ts:91-96 | `enviarFeedback` | estrellas_colaboracion | INSERT | de_persona, para_persona, motivo, semana |
| 17 | feedback/actions.ts:128-129 | `gestionarFeedback` | feedback | UPDATE | estado/respuesta/compartible_loop, eq id, `.select('id')` |

### /clientes
| # | Archivo:Línea | Función | Tabla | Operación | Columnas / filtros |
|---|---|---|---|---|---|
| 18 | clientes/page.tsx:11-12 | `ClientesPage` | personas | SELECT `*` | eq email |
| 19 | clientes-client.tsx:47 | `recargar` | clientes | SELECT `*` | order `nombre` |
| 20 | clientes/actions.ts:17-18 | `getContexto` | personas | SELECT `*` | eq email |
| 21 | clientes/actions.ts:59-60 | `crearCliente` | clientes | INSERT | whitelist + creado_por, `.select('id')` |
| 22 | clientes/actions.ts:74 | `editarCliente` | clientes | UPDATE | whitelist, eq id, `.select('id')` |
| 23 | clientes/actions.ts:88-89 | `setActivoCliente` | clientes | UPDATE | `{activo}`, eq id, `.select('id')` |
| 24 | clientes/actions.ts:103 | `eliminarCliente` | clientes | DELETE | eq id, `.select('id')` |
| 25 | clientes/actions.ts:156 | `importarClientesCSV` | clientes | SELECT `nombre` | — (dedupe) |
| 26 | clientes/actions.ts:179 | `importarClientesCSV` | clientes | INSERT (por fila) | datos whitelist + creado_por |

Relacionadas (viven en peticiones/actions.ts pero son del catálogo): `guardarClienteAlCatalogo` — SELECT `peticiones` eq id (L204), SELECT `clientes` `ilike('nombre', nombre)` (L226), UPDATE `clientes` (completar huecos, L233), INSERT `clientes` (L241-243), UPDATE `peticiones {cliente_id}` (L255).

### Campana / notificaciones
| # | Archivo:Línea | Función | Tabla | Operación | Columnas / filtros |
|---|---|---|---|---|---|
| 27 | campana.tsx:23-25 | `recargar` | notificaciones | SELECT `*` | order `creada_en` desc, `limit(30)` |
| 28 | campana.tsx:48 | `marcarVista` | notificaciones | UPDATE `{vista:true}` | eq id |
| 29 | campana.tsx:55 | `marcarTodas` | notificaciones | UPDATE `{vista:true}` | in ids |
| 30 | campana.tsx:59 | `borrar` | notificaciones | DELETE | eq id |
| 31 | campana.tsx:65 | `borrarTodas` | notificaciones | DELETE | in ids |
| 32 | lib/notificaciones.ts:68-75 | `configurarCanalNotificaciones` | notificaciones | REALTIME `postgres_changes` INSERT | canal `notif-<nombre>`, filter `para=eq.<nombre>` |
| 33 | lib/supabase/notificar.ts:47 | `notificarServidor` | personas | SELECT `*` (service_role) | validar destinatarios |
| 34 | lib/supabase/notificar.ts:65 | `notificarServidor` | notificaciones | INSERT batch (service_role) | para, tipo, titulo, detalle, peticion_id |
| 35 | lib/supabase/notificar.ts:81 | `notificarToque` | personas | SELECT `*` (service_role) | validar destinatario |
| 36 | lib/supabase/notificar.ts:92-95 | `notificarToque` | notificaciones | SELECT `id` (service_role) | eq para+tipo('toque')+titulo, gte creada_en hoy (límite 1/día) |
| 37 | lib/supabase/notificar.ts:101-107 | `notificarToque` | notificaciones | INSERT (service_role) | para, tipo:'toque', titulo, detalle, peticion_id:null |

---


## B.6 Auth, Layout e infraestructura


| Llamada | Archivo:línea |
|---|---|
| `auth.signInWithPassword` | login-form.tsx:26 |
| `auth.resetPasswordForEmail` (redirectTo /auth/confirm?next=/update-password) | login-form.tsx:47-49 |
| `auth.updateUser({password})` | update-password/page.tsx:31 |
| `auth.exchangeCodeForSession(code)` | app/auth/confirm/route.ts:21 |
| `auth.verifyOtp({type, token_hash})` | app/auth/confirm/route.ts:24 |
| `auth.signOut()` | logout-button.tsx:11 |
| `auth.getUser()` | app/(app)/layout.tsx:14 · app/(app)/page.tsx:10 · lib/supabase/middleware.ts:39 |
| `from('personas').select('*').eq('email',…).maybeSingle()` | layout.tsx:15-16 |
| `from('peticiones').select('*')` + `from('estrellas_colaboracion').select('*')` (XP header) | layout.tsx:34-35 |
| `from('personas').select('*')` (detectar supervisadas) | layout.tsx:52 |
| `from('personas').update({auth_user_id}).eq('id').is('auth_user_id',null)` | vinculo.ts:31-36 |
| Campana: `from('notificaciones')` select/update vista/delete + canal realtime `notif-<nombre>` | campana.tsx:24, 48, 55, 59, 65 |

Todos con anon key + sesión (RLS); cero usos de service_role en estos archivos. `admin.ts` (service_role) tiene `import 'server-only'` (l.1) y lanza error si faltan env (l.17-21); no importado por ninguno de mis archivos.


---

# C. Sistema de notificaciones (mapa completo de escritura)

### 5.1 SISTEMA DE NOTIFICACIONES — completo

**Arquitectura**: único punto de escritura = `notificarServidor()` / `notificarToque()` en `/home/user/movdi-ops/lib/supabase/notificar.ts` (con `import 'server-only'` L1; usa admin client service_role L33-40) + la función SQL `notificar_recurrentes_del_dia()` (SECURITY DEFINER, migración 20260703230500). Best-effort: si el admin client no está configurado, avisa en logs y NO tumba la operación principal (notificar.ts:31-40, hallazgo cutover 2026-07-06). Reglas globales de `notificarServidor` (L44-63): nunca a uno mismo (`r.para === opts.de` se filtra), nunca a persona inexistente o inactiva (match por `matchNombre`).

**Eventos que disparan notificaciones (TODOS los call sites, verificados por grep en todo el repo):**

| Evento | Call site | tipo | Destinatario | Título EXACTO | Detalle EXACTO |
|---|---|---|---|---|---|
| Crear petición | `crearPeticion`, peticiones/actions.ts:158-166 | `nueva_peticion` | cada `para` de las filas creadas (asignaciones múltiples ⇒ una notif por fila) | `nueva petición de <yo.nombre>` | `<nombre de la petición>` (+ peticion_id) |
| Reabrir petición entregada | `cambiarEstatus`, peticiones/actions.ts:395-404 (solo si estatus entregado→pendiente y `para !== yo`) | `reabierta` | el asignado (`para`) | `<yo> reabrió "<nombre>"` | `vuelve a estar pendiente · revisa los detalles` |
| Creador extiende plazo | `cambiarFecha` rama soyCreador, peticiones/actions.ts:450-456 | `fecha_cambiada` | `t.para` | `<yo> extendió el plazo de "<nombre>"` | `nueva fecha: <fechaCorta> · motivo: <motivo>` + (si `extensionJustificada===false`) ` · cuenta contra la fecha original` |
| Asignado cambia fecha | misma función, rama else, L458-464 | `fecha_cambiada` | `t.creado_por` | `<yo> cambió la fecha de "<nombre>"` | `nueva fecha: <fechaCorta> · motivo: <motivo>` |
| Jefa/head mueve entrega de una petición | peticiones/actions.ts:512-518 | `fecha_cambiada` | `t.para` | `<yo> movió tu entrega de "<nombre>"` | `del <fecha> al <fecha> · motivo: <motivo>` + (si NO justificada) ` · cuenta contra la fecha original` (peticion_id: null) |
| Mover instancia recurrente | peticiones/actions.ts:552-558 | `fecha_cambiada` | `recur.para` | `<yo> movió tu entrega de "<nombre>"` | `del <fechaInstancia> al <nuevaFecha> · motivo: <motivo><notaJustif>` |
| Dar estrella | `darEstrella`(nombre aprox), estrellas/actions.ts:61-70 | `estrella` | receptor | `<yo> te dio una estrella ⭐` | `"<motivo>"` |
| Toque de ánimo | `darToque`, equipo/actions.ts:289 → `notificarToque`, notificar.ts:73-110 | `toque` | supervisada / cualquiera si dirección | `⚡ <de> te mandó un toque` | mensaje libre ≤60 chars |
| Recordatorio recurrente diario | pg_cron `recordatorio-recurrentes-diario` (0 13 * * * UTC) → `notificar_recurrentes_del_dia()`, migración 20260703230500:88-97 | `recurrente_hoy` | `r.para` de cada recurrente que "toca hoy" no resuelta | `↻ hoy toca "<nombre>"` (format SQL) | `entrega recurrente de hoy · creada por <creado_por>` (peticion_id = instancia pendiente si existe). Dedupe diario vía tabla `recurrentes_avisos` (on conflict do nothing, L85-87). Respeta persona activa y `pausada_hasta` (L48-54). |

Nota: el envío de feedback NO genera notificación al destinatario ni a dirección (no hay llamada a notificar* en feedback/actions.ts); la estrella derivada de un reconocimiento tampoco notifica (el INSERT de feedback/actions.ts:91-96 va directo a `estrellas_colaboracion` sin pasar por estrellas/actions.ts). Ver §7.

**Límite del toque**: 1 por persona/día POR REMITENTE, implementado comparando título exacto + `creada_en >= hoy` (notificar.ts:88-99); mensaje de rechazo EXACTO: `ya le mandaste un toque hoy a <nombre> — mañana otro 💪`.

**Iconos por tipo** (`iconoNotif`, lib/notificaciones.ts:31-38): nueva_peticion 📥 · fecha_cambiada 📅 · reabierta 🔄 · estrella ⭐ · recurrente_hoy ↻ · default 🔔 (el tipo `toque` cae al default 🔔 — el ⚡ va dentro del título).

**Cómo se ven / marcan / borran** (campana.tsx): carga inicial de 30 más recientes (L23-26); marcar vista individual al click (L46-51), "marcar vistas" masivo (L52-57), borrar individual (L58-61) y "borrar todas" (L62-67) — todo client-side con anon+RLS porque son filas propias (decisión comentada L4-6). Badge y punto naranja para no vistas; `tiempoRelativo` (lib/notificaciones.ts:40-47): `hace un momento` (<60s), `hace N min`, `hace N h`, `hace N d`, o fecha local.

**Realtime, no polling**: canal `notif-<nombre>` suscrito a `postgres_changes` INSERT en `public.notificaciones` con `filter: para=eq.<nombre>` (configurarCanalNotificaciones, lib/notificaciones.ts:63-76 — paridad exacta con `_notifChannel` del SPA); nuevas notifs se prependen al estado (campana.tsx:36-38); cleanup con `removeChannel` al desmontar (L39-41). No hay `setInterval` de polling.


---

# D. Pendiente de validación (solo verificable en el proyecto Supabase vivo)


1. **Estado real de las 3 migraciones 20260720***: ¿aplicadas o no? (contradicción triple del hallazgo 6.1). Verificar `pg_policies` de peticiones/recurrentes (¿la rama de equipo exige `mi_nivel()='head'`?) y los datos de Valeria/Brenda/Fátima/Antonio/Jimena.
2. Esquema base completo de las 10 tablas núcleo: columnas, tipos, defaults, constraints (p. ej. `personas_nivel_check`), índices, FKs.
3. Set completo real de policies por tabla — sobre todo personas (personas_self_link: expresión exacta), peticiones_insert/update/delete, recurrentes_insert, notif_select/update/delete, todos_*, anuncios_*, anuncios_vistos.
4. Cron activo: `select jobname, schedule from cron.job` (esperado `recordatorio-recurrentes-diario · 0 13 * * *`) y `cron.job_run_details` sin fallos/duplicados.
5. Security advisors actuales (esperado: solo 0029 intencionales + leaked-passwords si sigue pendiente).
6. Leaked password protection: ¿ya se activó el toggle? (docs lo marcan pendiente).
7. Prueba anónima por tabla (0 filas / 401/403), incl. clientes y feedback.
8. Extensión pgcrypto/gen_random_uuid habilitada; esquema `extensions` con unaccent y moddatetime.
9. Publicación `supabase_realtime`: qué tablas incluye realmente.
10. Grants efectivos de columna en historial_mensual y feedback (los REVOKE/GRANT del repo vs default privileges — ya hubo un caso de drift: fix 20260706160401).
11. Si 20260720130000 NO está aplicada: decisión de dirección sobre managers legacy de Antonio/Jimena (y los intactos Demian/Leonardo).
12. C8 del cutover: ¿el site legado y el index.html ya se retiraron?
