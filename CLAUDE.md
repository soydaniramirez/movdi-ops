# CLAUDE.md — MOVDI · ops
Reglas y contexto del proyecto para Claude Code. Léelas antes de hacer cambios.
## Qué es este proyecto
Sistema interno de operaciones de MOVDI (gestión de peticiones, tareas, equipo). Se está refactorizando de una SPA de un solo index.html (JS inline + @supabase/supabase-js@2 en Netlify) a Next.js (App Router) + TypeScript + Tailwind con Supabase como backend. La app vieja se conserva como referencia visual hasta terminar la migración.

- Supabase project ref: nxyhgbrretusqbgfodmo
- Tablas: personas, peticiones, recurrentes, todos, anuncios, anuncios_vistos, notificaciones, recompensas, historial_mensual, estrellas_colaboracion
- Auth: Supabase Auth real (email + contraseña, reset de contraseña, panel RH con verificación adicional).
## Reglas de trabajo con Git
- Nunca trabajar en main. Todo va en la rama refactor/nextjs-migration.
- No hacer merge a main; abrir PR y dejarlo para revisión humana.
- Antes de cada migración de base de datos o cambio de seguridad, mostrar el SQL/diff y esperar OK.
## Reglas de seguridad (no negociables)
- La service_role key JAMÁS lleva el prefijo NEXT_PUBLIC_, ni se importa en código cliente, ni se commitea. Solo en .env.local y en variables de servidor del hosting. Su único uso es en lib/supabase/admin.ts, importado exclusivamente desde código de servidor.
- .env.local está en .gitignore. Solo se commitea .env.example con valores vacíos.
- RLS es la única barrera real. La anon key es pública; toda autorización se hace con políticas RLS basadas en auth.uid() y el nivel/área de la persona, no con lógica solo del cliente.
- El login NO muestra la lista de personas. Se pide email + contraseña. Cualquier listado de personas requiere sesión autenticada; un usuario anónimo no debe recibir ningún nombre ni email.
- Panel RH: la verificación de la contraseña adicional se hace en el servidor (Route Handler contra RH_ACCESS_SECRET o Edge Function con RLS). Los datos de RH nunca llegan al navegador sin pasar esa verificación.
- Peticiones privadas: visibles solo para creador y destinatario, ni siquiera dirección.
## Hallazgo crítico ya identificado (arreglar en el refactor)
La tabla personas hoy es legible de forma anónima: con solo la anon key y sin sesión, un SELECT devuelve las 21 personas con email, rol, nivel y área. Causa: política RLS de SELECT abierta a anon. Debe cerrarse para que solo usuarios autenticados lean personas, y solo lo que les corresponda.
## Variables de entorno
NEXT_PUBLIC_SUPABASE_URL=          # público
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # público (publishable)
SUPABASE_SERVICE_ROLE_KEY=         # SECRETO — solo servidor
RH_ACCESS_SECRET=                  # SECRETO — verificación panel RH
## Arquitectura destino
app/(auth)/login/        · login por email, sin listar personas
app/(app)/...            · rutas protegidas por middleware
app/api/...              · Route Handlers para acciones sensibles
lib/supabase/client.ts   · createBrowserClient (anon)
lib/supabase/server.ts   · createServerClient (cookies)
lib/supabase/admin.ts    · service_role — SOLO server
middleware.ts            · protege rutas y refresca sesión
supabase/migrations/     · esquema y RLS versionados

Usar @supabase/ssr con cookies (no localStorage). Migrar la UI módulo por módulo conservando paridad de funciones con el index.html viejo.
## Flujo de verificación
Después de cambios de seguridad, correr los security advisors de Supabase y hacer una petición anónima (solo anon key, sin sesión) a cada tabla: debe devolver 0 filas o 401/403. Probar la app por rol (ejecutivo / head / dirección / RH) antes de dar por cerrado un módulo.
