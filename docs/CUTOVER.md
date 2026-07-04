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

**P1. Merge del refactor.** PR de `refactor/nextjs-migration` → `main` (revisión
humana, regla del proyecto). El site viejo de Netlify sirve `index.html` estático:
un push a main con los archivos de Next NO lo rompe mientras su configuración de
build siga siendo "publicar raíz estática" (verificar antes de mergear; si el site
viejo tiene autodetección de framework, fijar su build command a estático o
mergear hasta el paso C4).

**P2. Site NUEVO de Netlify para el Next** (no tocar el site actual):
- Crear site `movdi-ops-next` desde el repo, rama `refactor/nextjs-migration`
  (o `main` tras P1), runtime Next.js.
- Variables de entorno: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (las públicas) y `SUPABASE_SERVICE_ROLE_KEY` (⚠️ **solo** en el contexto de
  servidor/functions de Netlify; jamás con prefijo NEXT_PUBLIC_).
- Supabase → Auth → URL Configuration → **añadir la URL de staging a Redirect URLs**
  (para que los links de recovery/invite aterricen en `/auth/confirm`). NO cambiar
  el Site URL todavía (sigue siendo el del SPA).

**P3. Cambio de código pendiente (pequeño, requiere OK):** mover los INSERT de
`notificaciones` de las Server Actions del cliente de sesión al **admin client**
(peticiones/estrellas). Hoy usan la sesión + policy interim; la migración 5 la
elimina, así que el build desplegado en el cutover debe llevar este cambio.
Es compatible hacia atrás (funciona igual con la policy interim vigente).

**P4. Toggle manual pendiente:** Dashboard → Auth → Passwords → activar
**leaked password protection** (advisor conocido).

---

## A. STAGING — QA por rol con datos REALES (apunta al Supabase de producción)

La URL de staging (site `movdi-ops-next`) usa el MISMO auth y datos que el SPA
vivo. Regla de oro: **las escrituras en staging son escrituras reales** — usar el
registro "test persona" existente (o crear una persona de prueba) para flujos
destructivos, y revertir lo que se escriba.

Limitación pre-migraciones (documentada, esperada): hasta la ventana NO existen
en la BD `fecha_inicio`, la RPC de desactivación, ni las tablas del recordatorio.
En staging fallarán (con error claro, sin corromper nada): **crear quincenal** y
**desactivar con reasignación**. Todo lo demás es QA completo.

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

**C4. Switch de hosting: producción pasa a servir el Next.**
- Plan recomendado (reversible en minutos, sin builds):
  - Si el equipo entra por `movdi-ops.netlify.app`: **renombrar** el site viejo a
    `movdi-ops-legado` y el nuevo a `movdi-ops` (swap de nombres → la URL pública
    pasa a servir Next). El site viejo queda intacto y servible.
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
| **C4** | **El crítico y el más rápido**: deshacer el swap de nombres de Netlify (o reapuntar el dominio) → la URL vuelve a servir `index.html` en minutos, sin builds. Restaurar Site URL de Auth a la URL vieja | Por eso el site viejo NO se toca ni se borra hasta C8. Si C5 ya se aplicó, revertir también C5 (el SPA necesita la policy interim para notificar); si C3 ya se aplicó y el equipo necesita crear quincenales desde el SPA, revertir el constraint (fila C3) |
| C5 | `create policy notif_insert on public.notificaciones for insert to authenticated with check (public.mi_nombre() is not null); grant insert on public.notificaciones to authenticated;` | Vuelve al interim documentado (spoofing entre autenticados posible otra vez — temporal) |
| C6 | `select cron.unschedule('recordatorio-recurrentes-diario');` | Idempotente; `recurrentes_avisos` conserva el dedup para cuando se reactive |
| C8 | `git revert` del PR de retiro; recrear site desde el repo | El index.html vive en el historial de git |

Regla general: los pasos están ordenados para que **el punto de no retorno sea
tardío y pequeño** — hasta C4 todo es aditivo o reversible con un `drop
constraint`; C4 es un swap de minutos; C5/C6 tienen rollback de una línea.

---

## E. Referencia — las 5 migraciones de cutover

| # | Archivo | Tipo |
|---|---|---|
| 1 | `20260703230500_cutover_recordatorio_recurrentes.sql` | aditiva (tabla dedup + función del cron) |
| 2 | `20260704120000_cutover_rpc_desactivar_persona.sql` | aditiva (RPC transaccional, requerida por equipo) |
| 3 | `20260703230000_cutover_quincenal_fecha_inicio.sql` | cambia comportamiento (constraint rompe quincenales del SPA) |
| 4 | `20260704130000_cutover_endurecer_notif_insert.sql` | cambia comportamiento (rompe notifs del SPA; requiere build con P3) |
| 5 | `20260703231000_cutover_encender_cron_recordatorios.sql` | interruptor (pg_cron 07:00 MX) |

(la numeración de C1–C6 usa este orden de aplicación, no el timestamp del archivo)
