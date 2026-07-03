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
- Panel RH: NO hay contraseña extra (decisión 2026-07-03). El acceso RH se controla por nivel='rh' en personas + políticas RLS. Los datos de RH nunca deben depender de lógica solo-cliente.
- Peticiones privadas: visibles solo para creador y destinatario, ni siquiera dirección.
## Hallazgo crítico — RESUELTO (2026-07-03)
La tabla personas era legible de forma anónima (política RLS de SELECT abierta a anon exponía a las 21 personas con email, rol, nivel y área). Cerrado en dos pasos: (1) PR #1 a main eliminó el grid de login que dependía de esa lectura (login por email+contraseña), (2) migración cerrar_personas_select_anon aplicada: drop policy personas_select_anon + revoke select from anon. Verificado: petición anónima → permission denied; usuarios autenticados siguen leyendo. También resueltos: tablas ventas_* huérfanas públicas (respaldadas en backups/ y eliminadas), policies always-true (notificaciones/historial/estrellas/recompensas) y search_path/EXECUTE de las funciones mi_*.
## Decisiones acordadas para fases siguientes
- Fase 4, módulo "agregar persona": la Server Action de alta debe, además de insertar en personas, invitar al usuario a Auth automáticamente (supabase.auth.admin.inviteUserByEmail con service_role, solo en servidor), para cerrar de raíz el hueco de "persona sin cuenta". Ya no debe existir el flujo manual de invitar desde el dashboard.
- Escrituras sensibles por Server Action (enfoque híbrido): INSERT de notificaciones (su policy interim `mi_nombre() is not null` se endurece cuando este INSERT pase a servidor), historial_mensual, estrellas_colaboracion (límite 2/semana validado en servidor; la RLS ya lo respalda), recompensas y administración de personas. Lecturas siguen client-side con anon key + RLS.
- Pendiente manual (dashboard): activar leaked password protection en Authentication → Passwords.
- Recurrentes 4.2b (quincenal real con fecha_inicio + recordatorio diario por pg_cron): construido y probado, pero las 3 migraciones cutover_* están SIN APLICAR y el cron SIN programar — cambian comportamiento y el check constraint rompería la creación de quincenales del index.html vivo. Checklist completa en docs/CUTOVER.md (incluye backfill de Mariana, encendido del cron y el endurecimiento definitivo de la RLS de notificaciones).
## Variables de entorno
NEXT_PUBLIC_SUPABASE_URL=          # público
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # público (publishable)
SUPABASE_SERVICE_ROLE_KEY=         # SECRETO — solo servidor
## Arquitectura destino
app/(auth)/login/        · login por email, sin listar personas
app/(app)/...            · rutas protegidas por middleware
app/api/...              · Route Handlers para acciones sensibles
lib/supabase/client.ts   · createBrowserClient (anon)
lib/supabase/server.ts   · createServerClient (cookies)
lib/supabase/admin.ts    · service_role — SOLO server
proxy.ts                 · protege rutas y refresca sesión (Next 16 renombró middleware→proxy; la lógica vive en lib/supabase/middleware.ts)
supabase/migrations/     · esquema y RLS versionados

Usar @supabase/ssr con cookies (no localStorage). Migrar la UI módulo por módulo conservando paridad de funciones con el index.html viejo.
## Flujo de verificación
Después de cambios de seguridad, correr los security advisors de Supabase y hacer una petición anónima (solo anon key, sin sesión) a cada tabla: debe devolver 0 filas o 401/403. Probar la app por rol (ejecutivo / head / dirección / RH) antes de dar por cerrado un módulo.
