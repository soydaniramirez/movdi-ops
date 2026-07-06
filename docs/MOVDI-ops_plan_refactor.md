# MOVDI · ops — Plan de refactorización a Next.js + Supabase
Análisis y plan preparado el 3 jul 2026. App analizada en vivo: https://movdi-ops.netlify.app/

## 1. Qué es hoy la app
Es una SPA de un solo archivo HTML (~593 KB) con ~233 KB de JavaScript inline y el cliente @supabase/supabase-js@2 cargado desde CDN. Todo (UI, lógica, llamadas a la base) vive en el mismo index.html desplegado en Netlify.

Backend: Supabase (proyecto nxyhgbrretusqbgfodmo), consumido directo desde el navegador con REST (/rest/v1/...) y Supabase Auth.

Autenticación: usa Supabase Auth real (signInWithPassword, resetPasswordForEmail, updateUser, getSession, onAuthStateChange). La sesión se guarda en localStorage (comportamiento default de supabase-js). No hay comparación de contraseñas del lado del cliente ni hashes caseros — eso es bueno.

Tablas detectadas (10):

| Tabla | Uso |
|---|---|
| personas | Directorio del equipo (nombre, email, rol, nivel, áreas, managers, es_direccion, needs_pass, activa) |
| peticiones | Peticiones/tareas asignadas |
| recurrentes | Tareas recurrentes (semanal/quincenal/mensual) |
| todos | To-dos personales |
| anuncios + anuncios_vistos | Comunicados internos y tracking de leído |
| notificaciones | Campana de notificaciones |
| recompensas | Sistema de recompensas por nivel |
| historial_mensual | Histórico por mes |
| estrellas_colaboracion | Estrellas / reconocimiento entre compañeros |

Funcionalidades a preservar: login por persona + reset de contraseña, panel RH con contraseña adicional, crear peticiones (a persona / varias / área / heads / ejecutivos / todo el equipo, con opción privada), tareas recurrentes, to-dos, anuncios segmentados por audiencia, notificaciones, estrellas de colaboración (máx 2/semana), gestión de equipo (alta/baja/reasignación de personas), niveles de acceso (ejecutivo / head / dirección / RH), semáforo de "soy apoyo".

## 2. Hallazgos de seguridad
### 🔴 Crítico — el directorio de personas es público
Confirmado en vivo: una petición anónima (solo con la publishable key, sin sesión) a GET /rest/v1/personas?select=* devuelve las 21 personas con email, rol, nivel y área. Cualquiera que abra la página —o que use la key que está en el HTML— puede listar a todo el equipo. Esto es lo que quieres tapar. La causa es una política RLS de SELECT abierta a anon en personas.
### 🟠 Medio — lógica de autorización en el cliente
Al ser una SPA, toda la decisión de "qué puede ver/hacer cada nivel" (dirección, RH, heads) vive en JS que el usuario controla. La publishable/anon key es pública por diseño, así que la seguridad real depende 100% de RLS en Postgres. Si una política es laxa, el navegador puede pedir datos que no debería. El panel RH "con contraseña extra" solo sirve si esa verificación ocurre en el servidor (RLS/Edge Function), no solo escondiendo un modal.
### 🟡 Menor — sin separación de entornos ni gestión de secretos
No hay .env: la URL y la key viven hardcodeadas en el HTML. No hay separación dev/prod. Cualquier key de servicio (service_role) que llegara a usarse en el front sería catastrófica (no vi ninguna, bien).
### Cómo lo resuelve el refactor a Next.js
- Ocultar usuarios antes de login: quitar el SELECT anónimo de personas; el selector de "elige tu nombre" se sirve desde una Route Handler / Server Action con lista mínima (solo nombre + id de personas activas), o directamente pedir email+contraseña sin mostrar el directorio.
- RLS estricto en todas las tablas, con auth.uid(); las lecturas sensibles pasan por el servidor.
- .env.local para separar secretos; la service_role solo en el servidor (nunca expuesta al navegador).
- Autorización en el servidor (middleware + RLS) en lugar de solo en el cliente.

## 3. Arquitectura destino (Next.js)
movdi-ops/
├── app/
│   ├── (auth)/login/            # login: email + contraseña, SIN listar personas
│   ├── (app)/                   # rutas protegidas por middleware
│   │   ├── peticiones/
│   │   ├── recurrentes/
│   │   ├── todos/
│   │   ├── anuncios/
│   │   ├── equipo/              # gestión de personas (solo dirección/RH)
│   │   ├── rh/                  # panel RH (doble verificación en servidor)
│   │   └── estrellas/
│   ├── api/                     # Route Handlers para acciones sensibles
│   └── layout.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # createBrowserClient (anon key)
│   │   ├── server.ts            # createServerClient (cookies)
│   │   └── admin.ts             # service_role — SOLO import en server
│   └── auth/                    # helpers de sesión y roles
├── middleware.ts                # protege rutas, refresca sesión
├── supabase/migrations/         # RLS y esquema versionado
├── .env.local                   # (gitignored)
├── .env.example                 # plantilla sin valores reales
└── ...

Stack recomendado: Next.js (App Router) + @supabase/ssr (cookies httpOnly en vez de localStorage) + TypeScript + Tailwind. Migrar la UI por módulos, reusando el HTML/CSS actual como referencia visual.

Decisión clave — misma DB o nueva: recomiendo conservar el mismo proyecto Supabase y sus datos, y solo endurecer RLS + mover la app al front nuevo. Migrar datos es innecesario y arriesgado.

## 4. .env.local (plantilla)
# Público — puede ir al navegador (NEXT_PUBLIC_*)
NEXT_PUBLIC_SUPABASE_URL=https://nxyhgbrretusqbgfodmo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxxx

# Secreto — SOLO servidor, nunca NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxxxxxxxxxxxxxx   # generar en Supabase → Project Settings → API

# Contraseña/secreto del panel RH si aplica lógica de servidor
RH_ACCESS_SECRET=定義_en_servidor

Regla: todo lo que empiece con NEXT_PUBLIC_ es visible en el navegador. La service_role jamás lleva ese prefijo y jamás se importa en un componente cliente. Añade .env.local a .gitignore y commitea solo .env.example con valores vacíos.

## 5. Fases de refactorización
- Setup + rama. Crear rama refactor/nextjs-migration, scaffold de Next.js, .env.local + .env.example, clientes de Supabase (browser/server/admin), Tailwind. Sin tocar main.
- Auth + middleware. Migrar a @supabase/ssr (cookies), login con email+contraseña, reset de contraseña, protección de rutas. Aquí se implementa "no mostrar usuarios antes de login".
- Endurecer RLS (backend). Revisar y reescribir políticas de todas las tablas; cerrar el SELECT anónimo de personas; verificación del panel RH en servidor. Versionar en supabase/migrations/.
- Migrar módulos uno por uno, verificando paridad con la app vieja: peticiones → recurrentes → todos → anuncios/notificaciones → estrellas → equipo/RH.
- QA + deploy. Pruebas por rol (ejecutivo/head/dirección/RH), pruebas anónimas (nada debe filtrarse), deploy a Netlify/Vercel con variables de entorno, y recién entonces PR a main.

## 6. ¿Chrome (yo) o Claude Code? — cuál conviene
Los dos, en este orden — se complementan:

- Yo (Claude en Chrome): bueno para el análisis externo y de seguridad — ver la app corriendo, inspeccionar red, probar accesos anónimos (ya lo hice: confirmé la fuga de personas). No tengo el código fuente ni el repo.
- Claude Code: es lo que conviene para el refactor real, porque tiene el código en GitHub y acceso a Supabase (RLS, migraciones, tipos). Puede crear la rama, mover archivos, escribir migraciones y correr todo.

Flujo recomendado: usas los prompts del otro archivo en Claude Code para que haga el trabajo en la rama nueva, y cuando algo sea de criterio (diseño de RLS, qué exponer en login, decisiones de arquitectura) me lo pasas y lo revisamos juntos. Yo actúo como revisor de seguridad; Code como ejecutor.
