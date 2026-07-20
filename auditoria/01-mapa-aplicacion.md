# 01 · Mapa de la aplicación — MOVDI OPS

Auditoría técnica de solo lectura · 2026-07-20 · rama `claude/movdi-ops-technical-audit-rgqhmm`.
Alcance: la app Next.js (App Router) que vive en `main` — el sistema actual. El `index.html` legado (SPA original, 6,810 líneas en la raíz del repo) se perfila al final como artefacto de referencia; NO es alcanzable desde la app Next (§7).

Convención de evidencia: `archivo:línea` (líneas aproximadas, verificadas sobre el commit `f4fc881`).

---

## 1. Inventario de archivos y su rol

### Aplicación (app/)
| Archivo | Rol |
|---|---|
| `app/layout.tsx` | Layout raíz HTML (fuentes, globals.css) |
| `app/(auth)/login/page.tsx` + `login-form.tsx` | Login por email+contraseña (sin listar personas) |
| `app/(auth)/update-password/page.tsx` | Definir/restablecer contraseña (requiere sesión del link) |
| `app/auth/confirm/route.ts` | Route handler GET: intercambio de tokens de recovery/invite (PKCE `?code=` y `?token_hash=`) |
| `app/(app)/layout.tsx` | Layout protegido: nav global, chip XP, chip perfil, campana, autocuración de vínculo auth↔persona |
| `app/(app)/page.tsx` | Raíz `/`: dashboard **placeholder de fase 2** (único lugar con botón "cerrar sesión") |
| `app/(app)/campana.tsx` | Campana de notificaciones (realtime) montada en el layout |
| `app/(app)/logout-button.tsx` | Botón cerrar sesión (signOut) |
| `app/(app)/peticiones/` | Módulo peticiones: page (guard) + client (1,656 líneas, 5 tabs + 6 modales) + actions (13 server actions) |
| `app/(app)/recurrentes/` | Módulo recurrentes: patrones + instancias virtuales + 3 modales |
| `app/(app)/todos/` | To-dos personales privados (CRUD inline) |
| `app/(app)/anuncios/` | Tablón de anuncios (crear/archivar/marcar visto) |
| `app/(app)/feedback/` | Feedback interno (reconocimiento/mejora/liderazgo, anonimato real, bandeja dirección) |
| `app/(app)/estrellas/` | Estrellas de colaboración (2/semana) |
| `app/(app)/progreso/` | Gamificación: XP, niveles, logros, leaderboard, recompensas, cierre de mes, historial |
| `app/(app)/equipo/` | Gestión de personas (solo dirección) + panorama para heads/jefas + toque ⚡ |
| `app/(app)/organigrama/` | Organigrama de solo lectura |
| `app/(app)/rh/page.tsx` + `rh-lista.tsx` | Panel RH: peticiones del área rh |
| `app/(app)/clientes/` | Catálogo interno de clientes (fiscal/legal) + import CSV |

### Lógica compartida (lib/)
| Archivo | Rol |
|---|---|
| `lib/peticiones.ts` | Tipos y helpers núcleo: mapeos de filas, `isAdmin`, `matchNombre`, `supervisadasDe`/`tengoSupervisadas` (jefa directa), `esCompromisoPropio`, fechas/días hábiles, `estadoMovimiento` (atorada), modos de asignación |
| `lib/tipos-peticion.ts` | Config ÚNICA de formularios dinámicos por área (digital/admi/legal): campos bloqueante/recomendado, SLA en días hábiles |
| `lib/recurrentes.ts` | Motor de recurrentes (instancias virtuales, quincenal real con `fecha_inicio`) + permisos de creación (hardcodes Salvador/Arylene) |
| `lib/gamificacion.ts` | Fórmulas de XP/niveles/rachas/logros/cumplimiento/leaderboard/cierre (535 líneas) |
| `lib/estrellas.ts` | Semana ISO + regla 2/semana (`puedoDarEstrella`) |
| `lib/equipo.ts` | `esDireccion`, semáforo, bloques de equipo, `veOrganigrama`, `construirOrganigrama` |
| `lib/anuncios.ts` | Audiencias, expiración, vistos, `puedeCrearAnuncios` |
| `lib/feedback.ts` | Categorías/estados/máximos de feedback |
| `lib/clientes.ts` | Columnas CSV, catálogo SAT c_UsoCFDI (25 claves), `normalizarUsoCFDI`, `constanciaVigente` |
| `lib/notificaciones.ts` | Iconos por tipo, tiempo relativo, canal realtime `notif-<nombre>` |
| `lib/supabase/client.ts` / `server.ts` | Clientes browser (anon) / server (cookies, @supabase/ssr) |
| `lib/supabase/admin.ts` | Cliente service_role, `import 'server-only'` |
| `lib/supabase/notificar.ts` | ÚNICO punto de escritura de notificaciones (service_role): `notificarServidor` + `notificarToque` |
| `lib/supabase/middleware.ts` + `proxy.ts` | Protección de rutas + refresh de sesión (Next 16: middleware→proxy) |
| `lib/supabase/vinculo.ts` | Autocuración del vínculo `auth_user_id` + `MSG_CUENTA_SIN_VINCULO` |

### Resto
- `supabase/migrations/` — 18 migraciones SQL (1,241 líneas) desde 2026-07-03. **El esquema base de las 10 tablas núcleo NO está versionado** (ver `03-backend-supabase.md`).
- `e2e/` — 21 specs de Playwright contra un mock local de Supabase (`mock-supabase.mjs`) con RLS simulada.
- `docs/` — CUTOVER.md (runbook), ONBOARDING.md (alta correcta), CAMPOS-FORMULARIOS.md (borrador pendiente de validar con áreas), planes de refactor.
- `backups/` — CSVs de las tablas `ventas_*` eliminadas el 2026-07-03 (contienen datos de contacto reales; README advierte no publicar).
- `index.html` — SPA legada completa (referencia visual, §7).
- `public/` — 5 SVGs default del scaffold de Next, sin uso (código muerto).
- Config: `package.json` (next 16.2.10, react 19, @supabase/ssr), `next.config.ts` (vacío), `playwright.config.ts`, tooling estándar.

---

## 2. Mapa jerárquico

```
MOVDI OPS (app Next)
│
├── Zona pública (middleware: solo /login y /auth)
│   ├── /login
│   │   ├── Form: correo + contraseña → "entrar →" (signInWithPassword)
│   │   ├── "¿olvidaste tu contraseña?" → resetPasswordForEmail → email
│   │   └── Banner "?error=link_invalido" (link caducado)
│   ├── /auth/confirm (route handler, sin UI) → canjea code/token_hash → redirect
│   └── /update-password (requiere sesión del link)
│       └── nueva contraseña + confirmar → "guardar contraseña" (updateUser)
│
├── Layout protegido (todas las demás rutas)
│   ├── Nav global: MOVDI·ops→ (/) · peticiones · recurrentes · anuncios · to-dos ·
│   │   estrellas · feedback · progreso · [equipo] · [organigrama] · [clientes] · [rh]
│   ├── Chip XP (nv{n} + barra + ⚡ xp) → link a /progreso
│   ├── Chip perfil (iniciales + nombre/rol, nombre oculto en <sm)
│   ├── Campana 🔔 → panel dropdown (30 notifs, realtime, marcar/borrar)
│   └── Banner "cuenta no terminada de configurar" (vínculo auth↔persona incompleto)
│
├── / — dashboard placeholder (fase 2)
│   ├── email de sesión · botón "cerrar sesión" (ÚNICO logout de la app)
│   └── links "📋 peticiones →" y "↻ recurrentes →" (solo 2 de 11 módulos)
│
├── /peticiones (todos)
│   ├── Header: "✋ nuevo compromiso" · "+ nueva petición"
│   ├── Banner podio 🏆 (días 1-5, mes cerrado, dismissible por mes)
│   ├── KPIs: pendientes/vencidas/esta semana/entregadas (NO clicables)
│   ├── Banner "📌 tareas asignadas a ti" → tab mis
│   ├── Tabs: general · mis pendientes · lo que pedí · instancias recurrentes ·
│   │        [⏸ qué está atorado] (solo dirección/head/jefa directa)
│   ├── Filtros: todas/vencidas/esta semana + select de área + filtro por persona (vía semáforo)
│   ├── Ocultas: toggle 👁/🙈 + "🙈 ocultar entregadas"
│   ├── Tabla de peticiones → FilaPeticion
│   │   └── Acciones (creador/destinatario): entregar ✓ · ▶ en proceso/↩ a pendiente ·
│   │       cambiar fecha · + nota · reabrir · 🙈/👁 ocultar · mover instancia ·
│   │       eliminar · 💾 guardar cliente al catálogo (admi)
│   ├── Semáforo lateral (solo desktop lg) → clic = filtro por persona
│   ├── Card "peticiones privadas 🔒" (solo dirección)
│   └── Modales: Crear (formularios dinámicos por tipo/área + SLA + cliente) ·
│       Compromiso ✋ · Entrega · Cambio de fecha · Nota de avance · Mover instancia
│
├── /recurrentes (todos ven; crear = privilegiados/jefas)
│   ├── "+ nueva recurrente" (ceo/head/rh/Salvador/Arylene o jefa directa)
│   ├── "mis próximas entregas" (instancias virtuales o reales) → entregar ✓ · mover
│   ├── "patrones configurados": filtro por persona + tabla
│   │   └── mover próxima · ⏸ pausar/▶ activar · ✕ eliminar (creador o admin en UI)
│   └── Modales: CrearRecurrente (modos una/varias/área/ejecutivos/todos; frecuencias
│       semanal/quincenal real/mensual) · EntregaInstancia · Mover
│
├── /todos (todos; lista 100% privada)
│   └── alta (form) · check hecho · edición inline (doble clic o "editar") · borrar ✕ (sin confirm)
│
├── /anuncios (todos ven; publicar = ceo/head/rh)
│   ├── "+ nuevo anuncio" → ModalCrear (título/contenido/tipo/audiencia/expira)
│   └── Card → ModalDetalle: ✓ marcar como visto · archivar (solo creador) ·
│       "vistas (N)" (solo creador)
│
├── /estrellas (todos)
│   ├── "⭐ dar estrella (N)" → ModalDarEstrella (para + motivo ≤60, 2/semana ISO)
│   └── Feeds: recibidas · dadas · [últimas del equipo — solo ve_gamificacion_completa]
│
├── /feedback (todos)
│   ├── Form: categoría (🙌/🔧/🧭) + destinatario (solo 🙌) + mensaje ≤2000 + 🕶 anónimo
│   ├── Muro de reconocimientos (públicos)
│   ├── "🔁 qué nos dijeron / qué hicimos" (loop público: resueltos compartibles)
│   └── Bandeja dirección: filtros + estado/respuesta/compartible → guardar ✓
│
├── /progreso (todos; secciones por rol)
│   ├── 🤖 Coach MOVDI (6 mensajes por prioridad)
│   ├── Mi progreso del mes (XP/nivel/desglose) · ↻ mi ritmo (recurrentes 12 semanas)
│   ├── 🏆 Leaderboard (dirección: todos · head/jefa: su equipo) + reconocimientos (solo flag)
│   ├── Logros X/37 (bloqueados = 🔒 ???) · 🎁 mis recompensas
│   ├── 🎁 Entrega de recompensas (rh/dirección): marcar entregada ✓ + toggle
│   ├── 🎁 Catálogo por nivel (solo flag) + editor (UI: solo Dani)
│   ├── 📋 Cierre de mes (solo dirección): confirm → archiva mes anterior
│   └── 📚 Meses cerrados: ← mes → + toggle
│
├── /equipo (head/dirección/jefa directa; gestión = SOLO dirección)
│   ├── "+ agregar persona" (dirección) → ModalPersona (alta + invite Auth automático)
│   ├── Filtros activas/pausadas/inactivas
│   ├── Tarjetas de persona: ⚡ toque → ModalToque · editar → ModalPersona ·
│   │   ⏸ pausar (prompt fecha) / ▶ reanudar · desactivar → confirm o ModalReasignacion
│   │   (RPC transaccional) · reactivar
│   └── Aside semáforo (bloques por relación de equipo)
│
├── /organigrama (dirección/rh/área admi; solo lectura)
│   ├── Árbol (línea sólida = manager principal, punteada = apoyo)
│   ├── Sección "sin asignar" (detector de datos incompletos)
│   └── Link "editar en equipo →" (dirección/head/jefa)
│
├── /rh (nivel rh o dirección)
│   └── Lista de peticiones del área rh + toggle 🙈/👁 entregadas
│
└── /clientes (pestaña: admi/dirección; URL accesible a todo autenticado, solo lectura)
    ├── "⬆ importar CSV" → ModalImportCSV (archivo o pegado, dedupe por nombre)
    ├── "+ agregar cliente" / editar → ModalCliente (fiscales + uso CFDI SAT +
    │   tipo de persona + legales)
    ├── Buscador + "ver inactivos"
    └── Por fila: editar · ⏸ desactivar/▶ reactivar (baja lógica) ·
        eliminar (solo dirección, solo inactivos, FK protege histórico)
```

---

## 3. Navegación: cómo se llega a cada cosa

### Protección de rutas
- `proxy.ts` → `lib/supabase/middleware.ts:15-58`: refresca sesión en cada request; sin sesión y ruta no pública (`PUBLIC_PATHS = ['/login','/auth']`, middleware.ts:6) → redirect a `/login`; con sesión en `/login` → redirect a `/`. `/update-password` NO es pública (requiere la sesión que deja el link de email).
- Guards de página (server, redirect a `/`): `/equipo` (`equipo/page.tsx:29`, head/dirección/jefa), `/organigrama` (`organigrama/page.tsx:28`, `veOrganigrama`), `/rh` (`rh/page.tsx:19-20`, rh/dirección). El resto de rutas no redirige por rol (los datos los protege RLS; el gating de pestañas es UX — comentario `app/(app)/layout.tsx:45-47`).
- Todas las pages de módulo repiten el patrón "persona por email"; si el email de sesión no tiene fila en `personas` → pantalla estática "tu cuenta no está ligada a una persona del equipo. avisa a dirección."

### Nav global (app/(app)/layout.tsx:76-88)
| Pestaña | Condición | Evidencia |
|---|---|---|
| peticiones · recurrentes · anuncios · to-dos · estrellas · feedback · progreso | siempre | layout.tsx:77-78 |
| equipo | `nivel==='head' \|\| esDir \|\| tengoGente` (jefa directa) | layout.tsx:55,79 |
| organigrama | `veOrganigrama` = dirección \| rh \| área admi | layout.tsx:57,80; lib/equipo.ts:105-107 |
| clientes | `areas.includes('admi') \|\| esDir` | layout.tsx:60,81 |
| rh | `nivel==='rh' \|\| esDir` | layout.tsx:49,82 |

Mobile: el nav usa `flex flex-wrap` (layout.tsx:72) — sin hamburguesa; con ~12 pestañas (dirección) envuelve a varias líneas.

### Flujos que abren otros flujos
- Semáforo (peticiones y equipo) → clic en persona = filtro de peticiones de esa persona.
- Banner "📌 tareas asignadas a ti" → tab "mis pendientes".
- `/peticiones` botón 💾 → escribe al catálogo de `/clientes` (`guardarClienteAlCatalogo`, peticiones/actions.ts:201-260).
- `/recurrentes` "mover próxima"/"mover" y "entregar ✓" → reusan `moverInstancia`/`entregarPeticion` del módulo peticiones (materializan instancias en `peticiones`).
- `/equipo` "desactivar" → confirm directo (sin pendientes) o ModalReasignacion → RPC transaccional.
- `/feedback` reconocimiento firmado con destinatario → intenta dar estrella (misma regla 2/semana de `/estrellas`).
- Chip XP del header → `/progreso`. Banner podio en `/peticiones` ← RPC `podio_mes_cerrado` (mismo dato que `/progreso`).
- Todos los modales: overlay clic-fuera cierra, botón ✕, `stopPropagation` en el cuerpo (patrón ModalShell).

---

## 4. Roles y niveles de acceso

### Cómo se asignan
- `personas.nivel` ∈ `['ejecutivo','head','ceo','rh']` (equipo/actions.ts:16); en UI `ceo` se muestra "dirección". Se asigna en el alta/edición de `/equipo` (solo dirección).
- `personas.es_direccion` boolean → `esDireccion(u) = es_direccion===true || nivel==='ceo'` (lib/equipo.ts:29-30).
- `personas.ve_gamificacion_completa` (flag, true solo dirección Dani/Emmanuel — migración 20260705190000:24-28): ve TODA la gamificación (leaderboard completo, reconocimientos, catálogo, feed de estrellas del equipo, bandeja feedback).
- **Jefa directa** (2026-07-20): NO es un nivel — es la relación `manager_principal`/`managers` (por NOMBRE de pila). `supervisadasDe`/`tengoSupervisadas` (lib/peticiones.ts:281-295) en cliente; `es_de_mi_equipo()` en RLS (migración 20260705230000:29-47). Otorga: pestaña equipo (panorama), tab atorados, crear recurrentes modo `una` hacia supervisadas, toques, leaderboard de su equipo.
- `personas.areas` text[] ∈ `['imkt','pm','legal','admi','ventas','digital','rh']` (lib/peticiones.ts:69): condiciona pestañas clientes/organigrama y la escritura del catálogo (`mi_tiene_area('admi')`).
- Hardcodes por nombre en código: `'Salvador'`/`'Arylene'` (creadores privilegiados de recurrentes, lib/recurrentes.ts:48; excluidos de gamificación, lib/gamificacion.ts:176), `'Salvador'` (privada por defecto al crear petición, peticiones-client.tsx:966), `'Dani'` (editor del catálogo de recompensas, progreso-client.tsx:409).

### Matriz resumida (detalle por elemento en 02)
| Capacidad | ejecutivo | jefa directa | head | rh | dirección |
|---|---|---|---|---|---|
| Peticiones propias (crear/entregar/etc.) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Ver peticiones de su equipo / tab atorados | — | ✔ | ✔ | — | ✔ (todo) |
| Modos de asignación heads/ejecutivos/todos | — | — | ✔ | — | ✔ |
| Crear recurrentes | — | solo `una` a supervisadas | ✔ | ✔ | ✔ |
| Publicar anuncios | — | — | ✔ | ✔ | ✔ |
| Gestión de personas (alta/pausa/baja) | — | — | — | — | ✔ |
| Toque ⚡ | — | a su gente | a su gente | a su gente* | a cualquiera |
| Panel /rh | — | — | — | ✔ | ✔ |
| Marcar recompensa entregada | — | — | — | ✔ | ✔ |
| Cierre de mes / catálogo recompensas | — | — | — | — | ✔ |
| Leaderboard | — | su equipo | su equipo | — | todos |
| Feed de estrellas del equipo / bandeja feedback | — | — | — | — | solo flag |

\* rh entra a /equipo solo si tiene supervisadas (el guard exige head/dirección/jefa; rh sin gente es redirigida).

---

## 5. Integraciones externas detectadas

| Integración | Uso | Evidencia |
|---|---|---|
| Supabase (proyecto `nxyhgbrretusqbgfodmo`) | Base de datos + Auth + RLS; URL/keys por env (`NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` solo servidor) | lib/supabase/*, .env.example |
| Supabase Auth | signInWithPassword, resetPasswordForEmail, updateUser, verifyOtp/exchangeCodeForSession, signOut, admin.inviteUserByEmail (service_role, solo alta de equipo) | login-form.tsx, update-password, auth/confirm/route.ts, equipo/actions.ts:106 |
| Supabase Realtime | Canal `notif-<nombre>` (INSERT en `notificaciones`) para la campana — sin polling | lib/notificaciones.ts:63-76 |
| pg_cron (en BD) | Job `recordatorio-recurrentes-diario` `0 13 * * *` UTC → `notificar_recurrentes_del_dia()` | migración 20260703231000 |
| Netlify | Hosting declarado (movdi-ops.netlify.app); qué build sirve exactamente NO es verificable desde el repo — **pendiente de validación** | CLAUDE.md, docs/CUTOVER.md |
| Links salientes de usuario | `target="_blank"` a briefs (placeholder Notion), links de entrega, constancias, portales — URLs capturadas por usuarios | peticiones-client.tsx:792,821; clientes |
| Solo en el legado | CDN jsdelivr (@supabase/supabase-js), Google Fonts, Web Notifications API del SO | index.html:9-10,1576 |

No se detectaron links a WhatsApp ni otras APIs externas en la app Next.

---

## 6. Pantallas o vistas sin acceso claro desde la navegación

1. **`/` (dashboard placeholder)**: solo se llega por el logo del nav; enlaza únicamente 2 de 11 módulos y es el ÚNICO lugar con "cerrar sesión" (app/(app)/page.tsx:24,31-36). Desde cualquier otra ruta no hay logout visible.
2. **`/clientes` para quien no es admi/dirección**: la pestaña no aparece, pero la URL es accesible a cualquier autenticado (solo lectura por RLS; sin redirect en la page).
3. **`/update-password`**: solo alcanzable vía link de email (recovery/invite) → `/auth/confirm`.
4. **`/equipo`, `/organigrama`, `/rh` por URL sin rol**: redirect silencioso a `/` (sin pantalla de "no acceso").
5. **Fallback local del podio** (progreso-client.tsx:83-90): camino muerto si la RPC existe en BD (solo se activaría en un entorno sin la migración aplicada).
6. **Rama "virtual" de `moverInstancia`** (peticiones/actions.ts:521-560): no se invoca desde /peticiones; solo desde /recurrentes (recurrentes-client.tsx:276).
7. **`index.html` legado**: NO servido por Next (está en la raíz del repo, no en `public/`; `next.config.ts` sin rewrites). Si el site viejo de Netlify sigue publicado, viviría fuera de este repo — pendiente de validación (paso C8 del cutover).

---

## 7. Perfil del `index.html` legado (referencia)

- SPA completa HTML+CSS+JS inline con `@supabase/supabase-js@2` por CDN (index.html:10) y 145 atributos `onclick`. Conservada como referencia visual hasta terminar la migración (CLAUDE.md).
- **11 tabs** (`renderTabs` L2255, router `renderActiveTab` L2334-2352): general · mis peticiones · lo que yo pedí · por persona · ↻ recurrentes · 📊 cumplimiento · 🏆 progreso · 📢 anuncios · equipo · mi to-do · ↻ mi ritmo (condicional). Más: login con reloj, modal set-password, panel de notificaciones realtime, semáforo lateral, banners de podio/anuncios y notificaciones del SO (Web Notifications API, L1576-1598).
- **Hardcodea URL y anon key** de Supabase (L1397-1398: `https://nxyhgbrretusqbgfodmo.supabase.co` + `sb_publishable_…`). Es la key pública (RLS es la barrera); no hay service_role en el archivo, pero el project-ref queda versionado.
- Funcionalidad legada SIN equivalente Next: notificaciones del SO, reloj de login, tabs separadas general/por persona/cumplimiento (absorbidas por /peticiones y /progreso — paridad exacta pendiente de validación). Su modal de contraseña RH está ROTO dentro del propio legado (`validarRhLogin`/`cerrarRhLogin` invocadas pero no definidas) — coherente con la decisión de eliminarla.
- Lo que Next tiene y el legado no: feedback, organigrama, catálogo de clientes, /rh como ruta, formularios dinámicos por área, compromisos, jefa directa.
