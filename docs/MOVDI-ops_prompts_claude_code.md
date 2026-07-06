# Prompts para Claude Code — Refactor MOVDI · ops
Cópialos en Claude Code en orden. Cada uno es un paso. No pases al siguiente hasta que el anterior esté verificado. Todo el trabajo va en una rama nueva; main no se toca hasta el PR final.

Contexto que ya sabemos (dáselo si lo pide): app actual = un solo index.html con JS inline + @supabase/supabase-js@2 en Netlify. Supabase project ref nxyhgbrretusqbgfodmo. Tablas: personas, peticiones, recurrentes, todos, anuncios, anuncios_vistos, notificaciones, recompensas, historial_mensual, estrellas_colaboracion. Usa Supabase Auth real. Hallazgo crítico confirmado: la tabla personas es legible de forma anónima (SELECT abierto a anon) y expone a las 21 personas antes de login.

## Prompt 0 — Rama nueva + análisis (NO tocar main)
Vas a refactorizar esta app pero SIN modificar la rama main. Antes de nada:

1. Muéstrame la rama actual y confirma que estás en main y limpio (git status).
2. Crea y cámbiate a una rama nueva llamada `refactor/nextjs-migration`. Todo el trabajo va ahí.
3. Haz un análisis del repo actual y devuélveme un resumen: estructura de archivos, dónde vive el JS, qué llamadas a Supabase se hacen (from/rpc/auth), cómo funciona hoy el login y el panel RH, y dónde se carga la lista de personas que se ve antes de iniciar sesión.
4. Conéctate al proyecto Supabase `nxyhgbrretusqbgfodmo` y lístame las tablas y, MUY IMPORTANTE, las políticas RLS actuales de cada tabla. Corre también los security advisors.
5. NO hagas cambios todavía. Solo dame el análisis y espera mi OK.


## Prompt 1 — Scaffold Next.js + .env (en la rama)
En la rama refactor/nextjs-migration, arma el esqueleto del proyecto Next.js sin romper la app vieja (déjala en el repo como referencia hasta que migremos todo):

1. Scaffold Next.js con App Router + TypeScript + Tailwind.
2. Instala @supabase/ssr y @supabase/supabase-js.
3. Crea lib/supabase/client.ts (createBrowserClient con la anon key), server.ts (createServerClient con cookies) y admin.ts (service_role, con un comentario claro de que SOLO se importa en el servidor).
4. Crea .env.example con estas variables VACÍAS y comentadas:
   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RH_ACCESS_SECRET.
5. Crea .env.local con la URL y anon key reales (que ya están en el index.html actual). Deja SUPABASE_SERVICE_ROLE_KEY y RH_ACCESS_SECRET como placeholders para que yo los pegue — dime exactamente dónde generar la service_role en el dashboard de Supabase.
6. Asegúrate de que .env.local esté en .gitignore. Verifica que la service_role NUNCA tenga el prefijo NEXT_PUBLIC_ ni se importe en código cliente.
7. Corre el build/dev y confirma que arranca. Enséñame el árbol de archivos resultante.


## Prompt 2 — Auth con cookies + ocultar usuarios antes de login
Migra la autenticación a @supabase/ssr con cookies (no localStorage) y añade middleware.ts que proteja todas las rutas de la app y refresque la sesión.

Requisitos de seguridad (importante):
- La pantalla de login NO debe mostrar la lista de personas. En vez del selector "elige tu nombre", pide email + contraseña directamente. Si quieres mantener UX de autocompletar por nombre, esa lista debe venir de una Server Action / Route Handler que SOLO responda a usuarios ya autenticados; para un usuario anónimo no debe devolver nada.
- Mantén el reset de contraseña (resetPasswordForEmail) y el cambio de contraseña (updateUser).
- Después de login, redirige al dashboard; sin sesión, cualquier ruta protegida manda a /login.

Cuando termines, prueba: (a) abrir la app sin sesión no debe filtrar ningún nombre ni email; (b) login válido entra; (c) logout limpia la sesión. Muéstrame cómo lo probaste.


## Prompt 3 — Endurecer RLS (el fix del hallazgo crítico)
Ahora endurece la seguridad en Supabase. Trabaja con migraciones versionadas en supabase/migrations/ (no cambios sueltos en el dashboard).

1. HALLAZGO CRÍTICO: la tabla `personas` hoy es legible de forma anónima (rol anon puede hacer SELECT y ver las 21 personas con email/rol/nivel). Cierra eso: elimina/rescribe la política para que solo usuarios autenticados (auth.uid() no nulo) puedan leer personas, y solo los datos que les correspondan según su nivel.
2. Revisa las políticas RLS de TODAS las tablas (peticiones, recurrentes, todos, anuncios, anuncios_vistos, notificaciones, recompensas, historial_mensual, estrellas_colaboracion). Para cada una: describe la política actual, si permite acceso anónimo o demasiado amplio, y propón la versión endurecida basada en auth.uid() y el nivel/área de la persona. Respeta la lógica de negocio: peticiones privadas solo visibles para creador y destinatario; panel RH solo para personas con nivel RH; dirección ve lo que corresponda.
3. El panel RH con "contraseña adicional": esa verificación NO puede ser solo un modal en el cliente. Impleméntala en el servidor (Route Handler que valide contra RH_ACCESS_SECRET o una Edge Function con RLS), de modo que los datos de RH nunca lleguen al navegador sin pasar esa verificación.
4. Antes de aplicar cada migración, muéstrame el SQL y espera mi OK. Después de aplicar, vuelve a correr los security advisors y confírmame que no quedan tablas sin RLS ni políticas abiertas a anon.
5. Verificación final: haz una petición anónima (solo anon key, sin sesión) a cada tabla y confírmame que devuelven 0 filas o 401/403.


## Prompt 4 — Migrar módulos con paridad de funciones
Migra la UI módulo por módulo desde el index.html viejo a componentes Next.js, conservando exactamente las funcionalidades. Hazlo de uno en uno y, al final de cada módulo, dame una checklist de paridad contra la app vieja antes de seguir.

Orden: 1) peticiones (crear a persona/varias/área/heads/ejecutivos/todo el equipo + opción privada + prioridad + fecha límite), 2) recurrentes (semanal/quincenal/mensual), 3) todos, 4) anuncios (segmentados por audiencia) + notificaciones (campana) + anuncios_vistos, 5) estrellas de colaboración (máx 2 por semana), 6) gestión de equipo (alta/baja/desactivar con reasignación) y panel RH.

Reusa el CSS/diseño actual como referencia visual. Todas las mutaciones sensibles (crear/editar/borrar, desactivar personas, dar estrellas) deben respetar RLS; las que requieran privilegios de servidor van por Route Handler con el cliente server, no con service_role en el cliente.


## Prompt 5 — QA, deploy y PR
Cierre del refactor:

1. Pruebas por rol: crea o usa cuentas de prueba para ejecutivo, head, dirección y RH, y verifica que cada uno ve y puede hacer solo lo que le toca. Documenta los resultados.
2. Prueba de fuga anónima: sin sesión, confirma que no se expone ningún dato (ni la lista de personas).
3. Corre lint, typecheck y build de producción; arregla lo que salga.
4. Prepara el deploy (Netlify o Vercel): dime qué variables de entorno configurar en el panel del hosting (las mismas de .env.local, con service_role solo en el entorno de servidor).
5. Solo cuando todo lo anterior pase, abre un Pull Request de refactor/nextjs-migration hacia main con un resumen de cambios y de las mejoras de seguridad (cierre del SELECT anónimo en personas, RLS endurecido, auth por cookies, secretos en .env). NO hagas merge tú; déjamelo para revisión.


### Notas de uso
- Si en el Prompt 0 Claude Code no tiene acceso al proyecto Supabase correcto, dale el ref nxyhgbrretusqbgfodmo y pídele que use su conector de Supabase.
- Cada prompt te pide una verificación antes de avanzar — no te saltes esos OK, ahí es donde me puedes pasar las decisiones para que las revisemos.
- La service_role key genérala tú en Supabase → Project Settings → API y pégala solo en .env.local / variables del hosting. Que no toque el repo.
