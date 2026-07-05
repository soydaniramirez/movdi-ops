# RUNBOOK de CUTOVER — SPA vieja (index.html) → Next.js

Estado: **borrador para revisión — nada de este documento se ha ejecutado.**
Proyecto Supabase: `nxyhgbrretusqbgfodmo` · Rama: `refactor/nextjs-migration`.

Qué ya está en producción (no confundir con lo pendiente):
- Login por email+contraseña en la SPA (PR #1, 2026-07-03) — el equipo **ya usa** email+contraseña.
- RLS endurecida: `personas` sin lectura anónima, policies always-true cerradas, funciones `mi_*` fijadas, tablas `ventas_*` eliminadas (respaldo en `backups/`).

Qué está construido y probado (79/79 e2e) pero **SIN aplicar**: las 5 migraciones
`cutover_*`, el cron, y el switch de hosting.

---

## P. PREPARACIÓN (antes de la ventana, sin riesgo para producción)

**P1. Merge del refactor.** PR #2 de `refactor/nextjs-migration` → `main`
(revisión humana, regla del proyecto). **Decisión 2026-07-04: el PR queda
ABIERTO; el merge a main se hace EN la ventana de cutover, en el paso C4a,
y SOLO con el site viejo ya congelado** (lock del deploy publicado + stop
builds — ver C4a; es el blindaje contra la autodetección de framework de
Netlify al entrar el package.json de Next a main). Build config del site
viejo confirmado por Daniela 2026-07-04: estático puro, sin build command,
sin plugins, branch main.

**P2. Site NUEVO de Netlify para el Next** (no tocar el site actual):
✅ Site creado (2026-07-04): `movdi-ops-next` · siteId `b121e6df-3d3f-45af-a793-25775970f5cc`
· https://movdi-ops-next.netlify.app · variables públicas ya cargadas
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
Pendiente MANUAL (Daniela, en la UI):
- [ ] Conectar el repo GitHub `soydaniramirez/movdi-ops` al site, rama
  **`refactor/nextjs-migration`** (decisión 2026-07-04: NO main — main se
  mergea hasta la ventana), runtime Next.js (Site configuration →
  Build & deploy → Link repository). El MCP de Netlify no puede vincular
  repos; es paso de UI.
- [ ] Pegar `SUPABASE_SERVICE_ROLE_KEY` (⚠️ scopes Functions/Runtime, **jamás**
  con prefijo NEXT_PUBLIC_; el valor sale de Supabase → Settings → API).
  Sin ella fallan el invite del alta y las notificaciones server-side.
- [ ] Supabase → Auth → URL Configuration → **añadir
  `https://movdi-ops-next.netlify.app` a Redirect URLs** (para que los links de
  recovery/invite aterricen en `/auth/confirm`). NO cambiar el Site URL todavía
  (sigue siendo el del SPA).

**P3. ✅ HECHO (2026-07-04):** todos los INSERT de `notificaciones` viven en un
único helper server-side auditable (`lib/supabase/notificar.ts`, admin client,
`import 'server-only'`); peticiones y estrellas delegan en él. Compatible hacia
atrás (funciona igual con la policy interim vigente) y listo para la migración 5.

**P4. Toggle manual pendiente:** Dashboard → Auth → Passwords → activar
**leaked password protection** (advisor conocido).

---

## A. STAGING — QA por rol con datos REALES (apunta al Supabase de producción)

La URL de staging (site `movdi-ops-next`) usa el MISMO auth y datos que el SPA
vivo. Regla de oro: **las escrituras en staging son escrituras reales** — usar el
registro "test persona" existente (o crear una persona de prueba) para flujos
destructivos, y revertir lo que se escriba.

Limitación pre-migraciones (documentada, esperada): hasta la ventana NO existen
en la BD `fecha_inicio`, la RPC de desactivación, las tablas del recordatorio,
ni la migración de privacidad 4.8 (flag `ve_gamificacion_completa`, columna
`recompensa_entregada`, RPC `podio_mes_cerrado`, policies cerradas). En staging
fallarán (con error claro, sin corromper nada): **crear quincenal**, **desactivar
con reasignación** y **marcar recompensa entregada**; el módulo **feedback** se
muestra desactivado con aviso (su tabla nace en C5c). Además, pre-cutover las
LECTURAS de estrellas/recompensas/historial siguen abiertas en BD — la UI ya
oculta todo por rol, pero la barrera RLS real llega con C5b. Todo lo demás es
QA completo.

### A1. QA común a TODOS los roles
- [ ] Login con email+contraseña · logout · sesión persiste al recargar (cookies).
- [ ] Ruta protegida sin sesión → /login; cero requests a `/rest/v1/*` pre-auth (network tab).
- [ ] Campana: lista propia, marcar leída/todas, borrar; badge correcto.
- [ ] Peticiones: ve exactamente lo que le corresponde (¡probar una privada!).
- [ ] Crear petición a una persona → notificación le llega al destinatario.
- [ ] To-dos: solo los propios.
- [ ] Estrellas: feed correcto (dar máximo UNA de prueba y avisar al receptor).
- [ ] Anuncios: solo su audiencia; marcar visto.

### A2. Por rol
- **Ejecutivo** (pedir a un ejecutivo real 10 min o usar su vista):
  - [ ] NO ve modos admin al crear petición; NO ve "+ nueva recurrente";
        NO ve gestión en /equipo; /rh → acceso restringido; sin semáforo; sin cierre de mes.
- **Head**:
  - [ ] Modos admin en peticiones; crear recurrente; semáforo "mi equipo directo" + "🤝 soy apoyo";
        leaderboard "(mi equipo)"; /rh denegado (si no es dirección); pausar/editar personas.
- **Dirección (Dani)**:
  - [ ] Todo lo anterior + /rh accesible + preview del cierre de mes
        (**NO ejecutar el cierre en staging**: escribe historial real).
  - [ ] Equipo: alta de persona de prueba (ver A3), editar, pausar/reanudar, reactivar.
- **RH (Sarai)**:
  - [ ] /rh accesible; crear anuncio; crear recurrente; candado privada ON por default al crear petición.

### A3. Pendientes "honestos" que el mock no cubrió
- [ ] **Recovery real**: "¿olvidaste tu contraseña?" con una cuenta de PRUEBA
      (no la tuya: cambia la contraseña real en el Auth compartido) → llega el
      email → el link aterriza en `/auth/confirm` → `/update-password` → define
      contraseña → entra.
- [ ] **Invite real**: alta de persona de prueba con un correo alterno tuyo →
      llega el email de invitación → definir contraseña → entra al ops.
      Limpieza: archivar la persona de prueba y borrar el usuario en Auth.
- [ ] **Realtime end-to-end**: 2 navegadores (A dirección, B ejecutivo): A crea
      petición para B → la campana de B se actualiza EN VIVO sin recargar.
      (Verificado ya en BD: `notificaciones` está en `supabase_realtime`.)
- [ ] Emails de Supabase caen a spam o no: revisar y, si aplica, configurar SMTP propio.

**GATE: no se abre la ventana de cutover sin A1–A3 en verde.**

---

## B. AVISOS (antes de la ventana)

- [ ] **Aviso de ventana** (1–2 días antes):
  > 📢 mantenimiento del ops: el [DÍA] de [HORA] a [HORA] el sistema puede fallar
  > por momentos — estamos estrenando la versión nueva. no crees ni edites nada
  > durante esa ventana. tu acceso no cambia: mismo correo y misma contraseña.
- [ ] **Confirmar que nadie está bloqueado del login**: el email+contraseña corre
  en producción desde el 3-jul; revisar si alguien ha reportado problemas o pedido
  reset y resolverlo ANTES de la ventana (`select nombre from personas where
  auth_user_id is null and activo` debe seguir devolviendo solo registros de prueba).
- [ ] **Aviso a Mariana** (quincenal — enviar el día del cutover):
  > tu "Entrega de objetivos digital" ahora sí es quincenal: te toca el lunes
  > [PRÓXIMA FECHA de la serie 2026-05-25 + 14k] y luego cada 14 días (antes
  > aparecía todos los lunes por un bug). además el ops te avisará con una
  > notificación la mañana del día que toca.

---

## C. SECUENCIA DE CUTOVER (en la ventana, EN ESTE ORDEN)

> Convención: tras cada paso, verifica el "estado esperado" antes de seguir.
> Si algo no cuadra → sección D (rollback) de ese paso, no improvisar.

**C0. Abrir ventana.** Mensaje al equipo. Snapshot de seguridad: verificación
rápida de conteos (`select count(*) from peticiones/recurrentes/notificaciones`)
para comparar al final.

**C1. Migración `20260703230500_cutover_recordatorio_recurrentes.sql`** (aditiva).
- Estado esperado: existen `recurrentes_avisos` y `notificar_recurrentes_del_dia()`;
  el SPA sigue funcionando igual (nada la llama aún).

**C2. Migración `20260704120000_cutover_rpc_desactivar_persona.sql`** (aditiva).
- Estado esperado: existe la RPC; `select desactivar_persona_con_reasignacion(...)`
  con un usuario NO admin → error "solo dirección o heads…". SPA intacta.

**C3. Migración `20260703230000_cutover_quincenal_fecha_inicio.sql`.**
⚠️ A partir de aquí el SPA ya no puede CREAR quincenales (check constraint) — por
eso estamos en ventana.
- Estado esperado: `select nombre, fecha_inicio from recurrentes where
  frecuencia='quincenal'` → la de Mariana con `2026-05-25`.

**C4a. Blindaje anti-autodetección: CONGELAR el site viejo, y solo entonces
mergear a main.** Confirmado 2026-07-04: `movdi-ops` es estático puro (sin build
command, sin plugins). El riesgo es que, al entrar el `package.json` de Next a
main, la autodetección de framework de Netlify dispare un build de Next en el
site viejo en su siguiente deploy — lo que además **rompería el rollback** (D-C4
depende de que el site viejo siga sirviendo el `index.html` intacto). El swap de
nombres por sí solo NO protege esto: el site viejo sigue linkeado a main y
seguiría deployando. Blindaje = congelarlo ANTES del merge, con DOS candados
independientes (por estado del site — un `netlify.toml` NO sirve aquí: el repo
lo comparten ambos sites y tras el cutover main ES Next; pinnearlo a estático
rompería el site nuevo):
1. **Lock del deploy publicado** — Deploys (site `movdi-ops`) → deploy publicado
   actual → **"Lock deploy" / Stop auto publishing**. Aunque llegara a correr un
   build, lo publicado queda clavado al deploy estático actual. Este candado es
   la garantía del rollback.
2. **Stop builds** — Project configuration → Build & deploy → Continuous
   deployment → Build settings → **Stop builds**. Netlify ya ni siquiera
   ejecuta builds para pushes a main → la autodetección no puede correr jamás.
- Estado esperado ANTES de mergear: la UI del site viejo muestra deploys
  bloqueados y builds detenidos; la URL vieja sirve el SPA idéntico.
- **Merge del PR #2 a main.** Estado esperado: en Deploys del site viejo NO
  aparece ningún build nuevo; la URL vieja sigue sirviendo el SPA.
- Site nuevo (`movdi-ops-next`): cambiar production branch a `main` (Build &
  deploy → Branches) y esperar **deploy verde de main** antes de seguir.
- Nota: estos toggles no existen en el MCP de Netlify; son pasos de UI.

**C4b. Switch de hosting: producción pasa a servir el Next.**
- Plan recomendado (reversible en minutos, sin builds):
  - Si el equipo entra por `movdi-ops.netlify.app`: **renombrar** el site viejo a
    `movdi-ops-legado` y el nuevo a `movdi-ops` (swap de nombres → la URL pública
    pasa a servir Next). El site viejo queda intacto, congelado y servible.
  - Si hay dominio propio: mover el dominio del site viejo al nuevo.
- Supabase → Auth → URL Configuration: **Site URL** = URL de producción del Next;
  mantener temporalmente la URL vieja en Redirect URLs.
- Estado esperado: la URL de producción muestra el login del Next; entrar con un
  usuario real funciona; crear una petición de prueba funciona y notifica.

**C5. Migración `20260704130000_cutover_endurecer_notif_insert.sql`** (requiere
el build con P3).
- Estado esperado: crear petición en prod → la notificación al destinatario SIGUE
  llegando (admin client + realtime); y un `POST /rest/v1/notificaciones` con
  token de usuario → 403/42501.

**C5b. Migración `20260705190000_cutover_gamificacion_privacidad.sql`** (requiere
el build con la Fase 4.8; la UI por rol ya la respeta).
- Estado esperado: con un usuario ejecutivo (API directa, su token):
  `estrellas_colaboracion` → solo filas donde participa; `recompensas` → 0 filas;
  `historial_mensual` → solo filas propias. `select ve_gamificacion_completa from
  personas where es_direccion` → true (Dani y Emmanuel). La RPC
  `podio_mes_cerrado(null)` responde el top 3 a cualquier autenticado.

**C5c. Migración `20260705220000_cutover_feedback_interno.sql`** (módulo de
feedback; aplicar DESPUÉS de C5b — usa `mi_ve_gamificacion()`).
- Estado esperado: existe `public.feedback` con RLS; con un usuario
  ejecutivo: INSERT anónimo → la fila queda con `autor_id = null` (trigger);
  INSERT con `autor_id` de OTRA persona → 42501; GET → solo muro + lo suyo;
  una fila de categoría `mejora` ajena NO aparece. Con dirección: GET → todo;
  UPDATE de `estado/respuesta/compartible_loop` → OK; UPDATE de `mensaje`
  → permission denied (grant de columna).

**C6. Migración `20260703231000_cutover_encender_cron_recordatorios.sql`** (el
interruptor del recordatorio; al final a propósito).
- Estado esperado: `select jobname, schedule from cron.job` muestra
  `recordatorio-recurrentes-diario · 0 13 * * *`.

**C7. Verificación de cierre de ventana:**
- [ ] Security advisors: solo deben quedar los 0029 intencionales (`mi_*`,
  `mi_es_direccion`, `notificar_recurrentes_del_dia` puede aparecer: EXECUTE está
  revocado a los roles de API, verificar) + leaked-passwords si P4 sigue pendiente.
- [ ] Petición anónima (solo anon key) a CADA tabla → 0 filas o 401/403.
- [ ] Conteos vs C0 (sin pérdidas inesperadas).
- [ ] Smoke por rol (10 min): login ejecutivo + dirección, campana, una petición.
- [ ] Mensaje al equipo: ventana cerrada + qué hay de nuevo. Aviso a Mariana.

**C8. (Días después, con prod estable) Retiro del legado:**
- PR que elimina `index.html` de main (se conserva en el historial de git).
- Borrar el site `movdi-ops-legado` de Netlify.
- Quitar la URL vieja de los Redirect URLs de Auth.
- Al día siguiente de C6: `select * from cron.job_run_details order by start_time
  desc limit 5` + revisar que los avisos de `recurrentes_avisos` no se dupliquen.

---

## D. ROLLBACK por paso

| Paso | Cómo revertir | Notas |
|---|---|---|
| C1 | `select cron.unschedule('recordatorio-recurrentes-diario');` (si ya C6) → `drop function public.notificar_recurrentes_del_dia(); drop table public.recurrentes_avisos;` | Aditiva: revertirla no afecta al SPA ni al Next |
| C2 | `drop function public.desactivar_persona_con_reasignacion(uuid, text, text);` | Aditiva; solo la usa el módulo equipo del Next |
| C3 | `alter table public.recurrentes drop constraint recurrentes_quincenal_requiere_fecha_inicio;` | Con esto el SPA vuelve a poder crear quincenales. La columna `fecha_inicio` puede QUEDARSE (el SPA la ignora); no hace falta revertir el backfill |
| C4a | Nada que revertir en el site viejo (congelarlo no cambia lo que sirve). Si se aborta la ventana ANTES del swap: el merge a main es inerte para producción (site viejo congelado); se puede dejar mergeado o `git revert` si se prefiere main limpio | El freeze se queda puesto hasta C8. Si algún día hay que hotfixear el `index.html` (rollback largo), reactivar builds temporalmente, deployar y volver a congelar |
| **C4b** | **El crítico y el más rápido**: deshacer el swap de nombres de Netlify (o reapuntar el dominio) → la URL vuelve a servir `index.html` en minutos, sin builds. Restaurar Site URL de Auth a la URL vieja | El deploy estático está GARANTIZADO intacto por el lock de C4a — el merge a main no pudo tocarlo. Por eso el site viejo NO se toca ni se borra hasta C8. Si C5 ya se aplicó, revertir también C5 (el SPA necesita la policy interim para notificar); si C3 ya se aplicó y el equipo necesita crear quincenales desde el SPA, revertir el constraint (fila C3) |
| C5 | `create policy notif_insert on public.notificaciones for insert to authenticated with check (public.mi_nombre() is not null); grant insert on public.notificaciones to authenticated;` | Vuelve al interim documentado (spoofing entre autenticados posible otra vez — temporal) |
| C5b | Recrear las policies abiertas: `create policy estrellas_select … using (true);` (ídem `hist_select`, `recomp_select`), `grant update on historial_mensual to authenticated;` y recrear `hist_update` con `mi_es_direccion()` | La columna flag y `recompensa_entregada` pueden QUEDARSE (aditivas); `podio_mes_cerrado` también. La UI 4.8 funciona igual con las policies abiertas |
| C5c | `drop table public.feedback; drop type public.feedback_categoria; drop type public.feedback_estado; drop function public.feedback_forzar_anonimato(); drop function public.feedback_before_update();` | Aditiva: solo la usa el módulo feedback del Next (que se auto-desactiva con aviso si la tabla no existe) |
| C6 | `select cron.unschedule('recordatorio-recurrentes-diario');` | Idempotente; `recurrentes_avisos` conserva el dedup para cuando se reactive |
| C8 | `git revert` del PR de retiro; recrear site desde el repo | El index.html vive en el historial de git |

Regla general: los pasos están ordenados para que **el punto de no retorno sea
tardío y pequeño** — hasta C4 todo es aditivo o reversible con un `drop
constraint`; C4b es un swap de minutos (con el deploy viejo garantizado por el
lock de C4a); C5/C6 tienen rollback de una línea.

---

## E. Referencia — las 5 migraciones de cutover

| # | Archivo | Tipo |
|---|---|---|
| 1 | `20260703230500_cutover_recordatorio_recurrentes.sql` | aditiva (tabla dedup + función del cron) |
| 2 | `20260704120000_cutover_rpc_desactivar_persona.sql` | aditiva (RPC transaccional, requerida por equipo) |
| 3 | `20260703230000_cutover_quincenal_fecha_inicio.sql` | cambia comportamiento (constraint rompe quincenales del SPA) |
| 4 | `20260704130000_cutover_endurecer_notif_insert.sql` | cambia comportamiento (rompe notifs del SPA; requiere build con P3) |
| 5 | `20260703231000_cutover_encender_cron_recordatorios.sql` | interruptor (pg_cron 07:00 MX) |
| 6 | `20260705190000_cutover_gamificacion_privacidad.sql` | cambia comportamiento (cierra lecturas de gamificación; requiere build 4.8) — se aplica como C5b |
| 7 | `20260705220000_cutover_feedback_interno.sql` | aditiva (tabla+enums+trigger+RLS del feedback; requiere build 4.10) — se aplica como C5c, después de la 6 |

(la numeración de C1–C6 usa este orden de aplicación, no el timestamp del archivo)
