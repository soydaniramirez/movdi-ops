# 04 · Hallazgos — MOVDI OPS

Auditoría técnica de solo lectura · 2026-07-20. **Solo se documenta; nada fue corregido.** Cada hallazgo tiene evidencia `archivo:línea`. La lista completa de "pendiente de validación" está en §12 y las dudas para dirección en §13.

---

## 1. Botones que no hacen nada / handlers rotos

En la app Next **no se encontró ningún botón sin handler ni handler que apunte a una función inexistente** (verificado por conteo exhaustivo: los 129 `onClick` + resto de handlers están inventariados en `02-inventario-funcional.md`).

1.1 **Legado**: el modal de contraseña RH del `index.html` está roto dentro del propio legado — el HTML invoca `validarRhLogin`/`cerrarRhLogin` que NO están definidas (index.html:868-887; grep sin definición) → clic daría ReferenceError. Irrelevante en producción Next (la contraseña RH se eliminó a propósito, decisión 2026-07-03), pero confirma que el legado ya no es 100% funcional como referencia.

1.2 **KPIs de /peticiones no clicables**: las 4 tarjetas (pendientes/vencidas/esta semana/entregadas, peticiones-client.tsx:273-285) son solo visuales aunque existen los filtros equivalentes a un clic de distancia — posible paridad perdida con la SPA (pendiente de validación contra index.html).

## 2. Funciones/código no accesibles desde la UI (sin conexión)

2.1 `public/` = 5 SVGs default del scaffold de Next sin ninguna referencia en app/ ni lib/ (grep negativo) — código muerto.
2.2 Fallback local del podio (progreso-client.tsx:83-90): solo se ejecutaría si la RPC `podio_mes_cerrado` no existiera; con la migración aplicada es camino muerto. Además, para un ejecutivo ese fallback solo vería sus propias filas (podría "autoconcederse" oro del mes en un entorno sin RPC).
2.3 `Notificacion.peticionId` se mapea (lib/notificaciones.ts:23) pero la campana nunca lo usa: clic en una notificación solo marca vista, **no navega a la petición** (campana.tsx:46-51). Campo muerto en la UI (¿paridad SPA pendiente?).
2.4 Grant de columna `es_publico` en feedback: la BD permite editarla (comentario feedback/actions.ts:107) pero `gestionarFeedback` nunca la escribe ni la bandeja la expone — capacidad sin uso.
2.5 `mapFeedbackRow.actualizadaEn` (lib/feedback.ts:55) sin ningún consumidor.
2.6 `usoCfdiLabel` (lib/clientes.ts:98-101) sin uso dentro de /clientes (verificar si peticiones la usa; si no, muerta).
2.7 `calcularCumplimiento` devuelve `tarde` que es `const = 0` (lib/gamificacion.ts:354) y el campo `detalle[].tarde` no lo lee ningún consumidor — semi-muerto.
2.8 `estadoMovimiento` calcula `por_vencer` (lib/peticiones.ts:257-269) pero la UI de peticiones no lo usa (probable uso solo vía semáforo).
2.9 `personas.needs_pass`: se sigue escribiendo `true` en cada alta/edición de nivel rh (equipo/actions.ts:60,75) pese a que la contraseña extra de RH se eliminó (decisión 2026-07-03) — columna probablemente vestigial (consumidores: pendiente de validación).
2.10 En `lib/recurrentes.ts` NO hay código muerto: todos los exports tienen consumidores (gamificación, equipo, peticiones, tests).

## 3. Elementos o lógica duplicada

3.1 El patrón "sesión → fila propia de personas por email → map" se repite en TODAS las pages de módulo, en cada `getContexto`/`getYo`/`getAdminContexto` y en el layout — ~15 implementaciones casi idénticas.
3.2 Wrapper `notificar` de peticiones con args vestigiales: recibe `_supabase` y `_personas` que ya no usa (peticiones/actions.ts:51-58); sus call sites cargan `personas.select('*')` COMPLETA solo para pasarla (4 SELECTs innecesarios por acción de notificación: A16/A19/A22/A25 del inventario).
3.3 Mapeos de color/texto del semáforo duplicados entre peticiones-client (SEM_COLOR, L43-48) y equipo-client (L28-37).
3.4 Doble clase CSS repetida `"card-hover rounded-xl card-hover rounded-xl"` (estrellas-client.tsx:84) — cosmético.
3.5 Redundancia `!cargando` dentro de un bloque ya condicionado a `!cargando` (progreso-client.tsx:244 vs 249, 270, 428) — inofensivo.
3.6 Validaciones triplicadas (cliente + server action + RLS) en estrellas, reasignación y feedback: duplicación INTENCIONAL (defensa en profundidad), se documenta para distinguirla de la accidental.

## 4. Flujos que terminan sin confirmación / feedback al usuario

4.1 "marcar entregada ✓" (recompensas) no muestra mensaje de éxito ni loading; solo recarga (progreso-client.tsx:364-368).
4.2 `guardarClienteAlCatalogo` liga la petición al cliente best-effort e ignora el resultado: si RLS rechaza el UPDATE de `peticiones.cliente_id`, el cliente queda en catálogo pero la petición sin ligar y el botón 💾 reaparece sin explicación (peticiones/actions.ts:253).
4.3 `ocultarEntregadas` devuelve el contador de ocultadas pero el cliente no lo muestra; éxito parcial silencioso (peticiones/actions.ts:601-613).
4.4 To-dos: `toggle`, `guardarEdicion` y `borrar` ignoran el `error` de Supabase y actualizan la UI de forma optimista — ante fallo de red/RLS la UI muestra un cambio que no se guardó (todos-client.tsx:44-58).
4.5 Campana: `marcarVista/marcarTodas/borrar/borrarTodas` igual — errores silenciados con UI optimista (campana.tsx:48-65).
4.6 `darEstrella` no verifica el resultado de `notificarServidor`: si la notificación falla, nadie se entera (estrellas/actions.ts:61-70; el helper es best-effort por diseño).
4.7 `crearCompromiso` no notifica a nadie (decisión comentada, peticiones/actions.ts:265-266) — se documenta como comportamiento esperado.

## 5. Campos sin validación (o validación débil)

5.1 **`cambiarFecha` no valida la fecha**: a diferencia de `moverInstancia` y `crearCompromiso`, acepta fecha PASADA y fecha IGUAL a la actual (peticiones/actions.ts:412-470; el input ni siquiera tiene `min`, client L1506). Se puede "cambiar" a la misma fecha generando notificación y marca de cambio, o auto-vencer la petición.
5.2 **`crearPeticion` acepta nacer vencida**: sin check `fecha >= hoy` (peticiones/actions.ts:114); el único freno es el nudge de plazo (frontend, evitable).
5.3 **Fecha de pausa de persona**: solo regex `/^\d{4}-\d{2}-\d{2}$/` (equipo/actions.ts:161) — acepta `2026-13-99` o fechas pasadas; entrada por `prompt()` nativo sin datepicker.
5.4 Link de entrega sin validación de formato URL (ModalEntrega, peticiones-client.tsx:1465; también en entrega de instancias).
5.5 Email de persona OPCIONAL en el alta: sin email no hay invite → puede existir persona activa sin cuenta Auth, justo el hueco que el invite automático quería cerrar "de raíz" (equipo/actions.ts:51-53,103; la UI no marca el correo como requerido).
5.6 `ilike` sin escapar comodines en el match de clientes: un nombre con `%`/`_` actúa como wildcard y podría completar huecos de OTRO cliente (peticiones/actions.ts:225).

## 6. Acciones irreversibles sin confirm

6.1 **Borrar to-do**: elimina al primer clic, sin confirm (todos-client.tsx:55-58,130-133) — inconsistente con "eliminar recurrente", que sí confirma.
6.2 **Campana "🗑 borrar todas"**: borra hasta 30 notificaciones de un clic sin confirm (campana.tsx:62-67); además `borrar todas`/`marcar vistas` solo operan sobre las 30 cargadas (`limit(30)`, L25) aunque el botón diga "todas".
6.3 **Borrar notificación individual** (✕): sin confirm (campana.tsx:58-61) — impacto bajo.
6.4 **"reasignar y desactivar"** (ModalReasignacion): el clic ejecuta la desactivación + reasignación directamente; el banner ⚠ del modal es la única "confirmación". La ruta SIN pendientes sí tiene `confirm()` (equipo-client.tsx:278 vs 552-558). Reactivar existe, pero la reasignación de peticiones/recurrentes no se deshace sola.
6.5 Con confirm pero genérico: "¿eliminar esta petición?" no menciona el nombre de la petición (peticiones-client.tsx:489).
6.6 Con confirm correcto (se listan como contraste): cierre de mes ("esta acción no se puede deshacer"), archivar anuncio, eliminar cliente definitivo, eliminar recurrente, ocultar entregadas, desactivar/reactivar persona, >5 destinatarios.

## 7. Información que se puede perder al cambiar de vista

7.1 **ModalCrear de peticiones**: cambiar modo (L1080), área (L1091/1125) o tipo (L1141) ejecuta `resetTipo`/`cambiarTipo` que VACÍAN `detalle` y cliente sin aviso — se puede perder una factura de 13 campos capturada.
7.2 **Todos los modales** (patrón ModalShell en peticiones, recurrentes, equipo, estrellas, anuncios, clientes, feedback no usa modal): clic fuera del modal o ✕ descarta lo tecleado sin guard de "cambios sin guardar".
7.3 **Reentrega pisa evidencia**: reabrir y volver a entregar sin recapturar escribe `link_entrega`/`nota_entrega` con `null`, borrando la evidencia anterior sin aviso (peticiones/actions.ts:365-366).
7.4 Fecha SLA residual: elegir tipo con SLA fija la fecha; cambiar a un tipo sin SLA deja la fecha anterior en el input (editable pero confusa) (peticiones-client.tsx:1004-1006).

## 8. Posibles problemas de permisos o exposición de datos

> Contexto del proyecto: el gating de UI se declara explícitamente como UX y la RLS como barrera real (layout.tsx:45-47, organigrama/page.tsx:9-10). Aun así hay puntos donde UI y RLS divergen o donde la política real no es auditable desde el repo.

8.1 **Segmentación de audiencia de anuncios solo en cliente**: el SELECT trae TODOS los anuncios activos y `anuncioAplicaA` filtra en el navegador (anuncios-client.tsx:27,40; lib/anuncios.ts:71-78). Si la RLS de SELECT de `anuncios` es abierta a authenticated (su SQL NO está en el repo), un ejecutivo puede leer por API anuncios "solo heads". No es fuga externa (requiere sesión) pero rompe la expectativa.
8.2 **Directorio de personas legible por cualquier autenticado**: la carga client trae `personas.select('*')` completa; el filtro "heads solo ven su gente" es solo frontend (equipo-client.tsx:68,84-87). Declarado como diseño (RLS de personas abierta a autenticados), pero es un límite de confianza: cualquier sesión ve nombres, emails, niveles, managers de las 21 personas.
8.3 **UI vs RLS desalineadas en administración de recurrentes** (post-cutover jefa directa 2026-07-20): el cliente muestra pausar/eliminar/mover-próxima con `creador || admin(ceo|head)` (recurrentes-client.tsx:186) mientras la RLS final es `creador ∨ dirección ∨ es_de_mi_equipo(para)` (migración 20260720120100:54-71). Consecuencias: (a) un head ve botones sobre patrones de equipos ajenos que la RLS le negará (recibe "solo el creador o dirección pueden…"); (b) una jefa directa NO ve botones sobre patrones de sus supervisadas creados por otros aunque la RLS se lo permitiría.
8.4 **`moverInstancia` exige creador o ceo|head en el server** (peticiones/actions.ts:495-497,527-529) — criterio distinto al de pausar/eliminar (RLS `es_de_mi_equipo`): una jefa directa no puede mover instancias de patrones que no creó. Parece intencional (CLAUDE.md: "sus recurrentes") pero el modelo difiere entre acciones hermanas.
8.5 **Card "peticiones privadas 🔒" de dirección** cuenta SOLO las privadas propias (por RLS dirección no ve privadas ajenas) pero el copy "peticiones confidenciales activas" sugiere un total global (peticiones-client.tsx:183-186,522-528).
8.6 **Auto-desactivación bloqueada solo en UI**: `p.id !== yo.id` oculta el botón (equipo-client.tsx:271) pero la action no rechaza `personaId === yo.id` (equipo/actions.ts:206-255); dependería del check interno de la RPC (pendiente de validación).
8.7 **Editor del catálogo de recompensas**: la UI lo limita a `yo.nombre === 'Dani'` (progreso-client.tsx:409) pero servidor y RLS aceptan a cualquier dirección — Emmanuel podría invocar la action directamente (coherente con la decisión 4.8 documentada, pero la restricción "solo Dani" es únicamente cosmética).
8.8 **`entregarInstanciaVirtual` no verifica en código quién entrega** (recurrentes/actions.ts:161-194): descansa 100% en la RLS `peticiones_insert` (rama `origen_recur`), cuyo SQL no está en el repo. Además inserta `creado_por = creador del patrón` aunque entregue el destinatario (paridad, pero vale documentarlo).
8.9 **Loop público de feedback asimétrico**: el texto promete "resumen sin autores" para todos, pero la RLS `feedback_select` no tiene rama `compartible_loop → visible a todos`: una `mejora` resuelta y compartible solo la ve completa dirección; para un ejecutivo el loop casi siempre estará vacío salvo reconocimientos (feedback-client.tsx:64-72 vs migración 20260705220000:107-115). Gap producto/intención a confirmar.
8.10 **`clientes_update` sin WITH CHECK** (migración 20260715120000:98-100): un usuario admi podría en teoría reescribir `creado_por` de una fila; asimetría vs `clientes_insert`. Impacto bajo.
8.11 **Carreras teóricas**: límite 2/semana de estrellas dentro del WITH CHECK es susceptible a carrera de inserts concurrentes (mitigada por el `not exists` por persona-semana; sin unique constraint visible) (migración 20260703211000:24-43); `cerrarMes` sin candado de BD — dos direcciones cerrando a la vez podrían duplicar filas si no hay `unique(persona,mes)` (progreso/actions.ts:42-44; constraint pendiente de validación); `marcarAnuncioVisto` SELECT-then-INSERT contra PK (benigna).
8.12 **`?next=` sin whitelist en /auth/confirm** (route.ts:16-28): siempre se prefija con el origin (no permite dominio externo), pero un link manipulado puede aterrizar en cualquier ruta interna tras validar el OTP. Riesgo bajo; endurecer sería trivial.
8.13 **Anon key + URL hardcodeadas en index.html versionado** (L1397-1398): key pública por diseño y RLS cerrada, pero el project-ref queda expuesto en el repo; los CSVs de `backups/` contienen datos de contacto reales (el README advierte repo privado).
8.14 **`user!.email!` con non-null assertion** en las pages de módulo (p. ej. equipo/page.tsx:11, anuncios/page.tsx:9): si el proxy fallara en proteger la ruta sería TypeError en runtime, no redirect. Dependencia total de proxy.ts.

## 9. Inconsistencias desktop/mobile

9.1 Nav global sin hamburguesa: `flex flex-wrap` — con ~12 pestañas (dirección) el header crece varias líneas en móvil (layout.tsx:72).
9.2 /peticiones: el semáforo lateral está `hidden lg:block` SIN alternativa móvil (el filtro por persona es inaccesible en móvil) (peticiones-client.tsx:503); KPIs `grid-cols-4` fijos — 4 columnas apretadas (L273). Prácticamente cero breakpoints `sm:`/`md:` en el módulo más grande.
9.3 /equipo: aside del semáforo `w-64 shrink-0` sin breakpoint — comprime la columna principal en pantallas angostas (equipo-client.tsx:161,310).
9.4 To-dos: botones "editar" y "✕" con `opacity-0 group-hover:opacity-100` — invisibles en touch (sin hover); la alternativa de edición es doble-tap, también hostil en touch (todos-client.tsx:121,127,131).
9.5 Campana: botón ✕ por notificación también depende de hover (campana.tsx:122-127); panel `w-96` fijo puede desbordar en viewports <384px (sin `max-w-[100vw]`).
9.6 Modales de clientes con `grid-cols-2` sin colapso `sm:` — pares de campos angostos en móvil (clientes-client.tsx:265,305); igual el ModalPersona de equipo (grid-cols-2 fijo).
9.7 Chip de perfil oculta nombre/rol en `<sm` (solo iniciales) — intencional (layout.tsx:108).

## 10. Nombres/textos que no reflejan lo que hace el código

10.1 Aviso de alta "persona creada, pero la invitación no se pudo enviar… **reintenta desde editar**" (equipo/actions.ts:115): `editarPersona` NO reintenta el invite ni toca `auth_user_id` (L138-156). El reintento sugerido no existe; si el invite nunca salió, tampoco hay cuenta que la autocuración pueda ligar. **Gap funcional real.**
10.2 Mensajes/comentarios RLS desactualizados en recurrentes: actions.ts:129/143 dicen "creador o ceo|head" y los errores L136/L150 "solo el creador o dirección pueden…" — el modelo real post-2026-07-20 es `es_de_mi_equipo` (pueden confundir a una jefa directa).
10.3 Comentarios de equipo/actions.ts:4-5,27 dicen "re-validan nivel ceo|head" pero el código exige dirección (L30-32) — el código es el correcto, el comentario no.
10.4 Logros de racha dicen "N entregas seguidas **sin retraso**" pero la racha se rompe por estatus ≠ entregado, NO por entregar tarde (lib/gamificacion.ts:73-77,400).
10.5 Reconocimiento 🎯 "sin reabrir" y logro `sin_reabrir_10`: como `reabiertas = 0` está hardcodeado (sin histórico), se otorgan solo por volumen — "100% sin reabrir" es un valor fijo (lib/gamificacion.ts:257-260,404,466).
10.6 Columna `mejor_racha` de historial_mensual guarda la mejor racha HISTÓRICA total, no la del mes cerrado (lib/gamificacion.ts:322) — paridad SPA, pero el nombre engaña.
10.7 "borrar todas"/"marcar vistas" de la campana solo alcanzan las 30 cargadas (ver 6.2).
10.8 "cumplimiento 100%" convive con entregas tarde: el % nunca descuenta tardes (quirk documentado, ver §11.4).
10.9 Bandeja de feedback: un feedback FIRMADO cuyo autor ya no resuelve en `personas` se muestra "🕶 anónimo" (feedback-client.tsx:320) — caso borde engañoso.

## 11. Dependencias frágiles y bugs potenciales de lógica

**Hardcodes de personas/valores en código** (todos deliberados según comentarios/CLAUDE.md, pero frágiles ante renombres u homónimos):
11.1 `'Salvador'`/`'Arylene'`: creadores privilegiados de recurrentes (lib/recurrentes.ts:48) y excluidos de gamificación (lib/gamificacion.ts:176). `'Salvador'` además activa candado privado por defecto al crear petición (peticiones-client.tsx:966). `'Dani'`: única que ve el editor del catálogo (progreso-client.tsx:409).
11.2 **Toda la relación de jerarquía es por NOMBRE de pila** (manager_principal/managers, `para`, `creado_por`, `user_nombre` de todos, `para` de notificaciones, canal realtime `notif-<nombre>`): dos personas homónimas colisionarían en semáforo, organigrama, toques, RLS `es_de_mi_equipo`, notificaciones y to-dos.
11.3 **Comparación de nombres inconsistente**: `===` estricto en unos sitios (creador de petición client L714 y actions; filtro de equipo equipo-client L86; XP de estrellas gamificacion.ts:132; `soloEquipo` L223-224) vs `matchNombre`/normalizada (destinatarios, organigrama, toques, RLS con lower+unaccent). Un nombre con acento/caso distinto entre tablas se comporta diferente según pantalla: el creador puede perder sus botones, estrellas pueden no sumar XP, un miembro puede no aparecer en el leaderboard de su jefa.
11.4 **Quirks de gamificación conservados a propósito** (documentados en código, contraintuitivos para el manual): entregar tarde NO baja el % de cumplimiento (`tarde=0` siempre, gamificacion.ts:198-199); las pendientes vencidas ACTUALES castigan el % de CUALQUIER periodo consultado (L201-203); entregas sin `fecha_entrega` cuentan a tiempo (+10).
11.5 **Zonas horarias mixtas**: `hoyISO()` usa UTC (lib/peticiones.ts:161) mientras el motor de recurrentes usa medianoche local y el cron usa America/Mexico_City explícito. Ventana real 18:00-24:00 CDMX donde "hoy" difiere: crear una quincenal con primera entrega "hoy" en la noche es rechazado ("fecha pasada"), `fecha_entrega` de entregas nocturnas queda fechada mañana, y la sugerencia de fecha del ModalCambioFecha usa `new Date(t.fecha)` UTC vs ModalMover local (off-by-one potencial; peticiones-client.tsx:1491 vs 1602; margenPeticion mezcla ambos, lib/peticiones.ts:117-125).
11.6 **Precedencia atorada > vencida** en el panel de atorados: una tarea vencida hace semanas sin movimiento se clasifica "⏸ atorada", no "vencida" (lib/peticiones.ts:257-269) — clasificación excluyente en el panel.
11.7 Rendimiento (no corrección): sin paginación — `select('*')` de tablas completas en cada `recargar` y en el layout en CADA navegación (4 queries); N+1 en `ocultarEntregadas` (un UPDATE por fila); hasta 12 llamadas seriales a la RPC del podio (progreso-client.tsx:77-82); `desactivarConReasignacion` descarga 3 tablas completas para pre-validar; import CSV inserta fila por fila. Escala actual (21 personas) lo tolera.
11.8 Anuncios expirados quedan `activo=true` para siempre (solo se ocultan en cliente) (lib/anuncios.ts:80-84).
11.9 Eliminar un patrón recurrente no toca sus instancias materializadas en `peticiones` (`origen_recur`): la FK y su ON DELETE no constan en el repo — ¿huérfanas, cascade o restrict? (pendiente de validación).
11.10 Estrella creada vía feedback NO notifica al receptor; la misma estrella desde /estrellas SÍ (feedback/actions.ts:91-96 vs estrellas/actions.ts:61-70) — inconsistencia funcional.
11.11 Icono del tipo `toque` no existe en `iconoNotif` → cae al 🔔 genérico (lib/notificaciones.ts:31-38).
11.12 El dashboard raíz `/` sigue siendo placeholder de fase 2: enlaza 2 de 11 módulos con `<a>` (full reload) y es el ÚNICO lugar con "cerrar sesión" (app/(app)/page.tsx).
11.13 Deployment skew: el cliente de peticiones tiene manejo especial (recarga única con flag en sessionStorage) — comportamiento en producción no reproducible desde código (peticiones-client.tsx:206-239).

**Documentación/estado contradictorio (repo vs docs vs PRs):**
11.14 **Las 3 migraciones del 2026-07-20 tienen estado contradictorio en tres fuentes**: sus cabeceras dicen "⏳ SIN APLICAR — requiere OK explícito"; CLAUDE.md marca las dos primeras "✅ APLICADA" y a la vez dice que la limpieza de managers (la tercera) está "NO limpiada, pendiente de decisión"; los mensajes de merge de los PRs #7/#8 dicen "aplicadas y verificadas". El estado real solo es verificable en la BD viva. Si la 130000 sí se aplicó, la nota de CLAUDE.md sobre Antonio/Jimena está desactualizada.
11.15 CUTOVER.md aún dice "Rama: refactor/nextjs-migration" (rama que ya no existe) y su numeración C1-C6 no coincide con los timestamps de archivo (documentado ahí mismo).

## 12. Pendiente de validación (consolidado)

**En el proyecto Supabase vivo (no auditable desde el repo):**
1. Estado real de las 3 migraciones `20260720*` (contradicción 11.14): `pg_policies` de peticiones/recurrentes y datos de Valeria/Brenda/Fátima/Antonio/Jimena.
2. Esquema base completo de las 10 tablas núcleo (columnas, tipos, defaults, constraints — p. ej. `personas_nivel_check`, `unique(persona,mes)` de historial_mensual, FK y ON DELETE de `peticiones.origen_recur` y de `peticiones.grupo_id`).
3. Set completo real de policies NO versionadas: `personas_select_all_auth`, `personas_modify_admin`, **`personas_self_link`** (pieza de seguridad del vínculo auth, sin SQL en repo), `peticiones_insert/update/delete` (incl. rama `origen_recur`), `recurrentes_insert`, `todos_*`, `anuncios_*` (en particular SELECT — hallazgo 8.1), `anuncios_vistos_*`, `notif_select/update/delete`.
4. RPC `desactivar_persona_con_reasignacion`: confirmar que su check interno (ceo|head) y validaciones (¿rechaza auto-desactivación?) coinciden con lo que la action asume.
5. Cron `recordatorio-recurrentes-diario` activo (`cron.job`, `cron.job_run_details`).
6. Security advisors actuales + **leaked password protection** (pendiente manual declarado en CLAUDE.md).
7. Prueba anónima por tabla (0 filas / 401-403), incluidas clientes y feedback.
8. Extensiones (pgcrypto) y publicación `supabase_realtime` (¿incluye notificaciones?).
9. Grants efectivos de columna en historial_mensual y feedback (ya hubo un drift: fix 20260706160401).
10. Trigger condicional de `updated_at` en peticiones operando como asume la UI (base de "atorada" y "última actividad").

**Fuera del repo / infraestructura:**
11. Qué build sirve realmente movdi-ops.netlify.app y si el site legado con index.html sigue publicado (paso C8 del cutover).
12. Site URL / Redirect URLs de Auth y `SUPABASE_SERVICE_ROLE_KEY` en el hosting.

**Contra datos reales:**
13. Incidencia de los mismatches de normalización de nombres (11.3): ¿existen `creado_por`/`de_persona`/managers con acentos o casing distinto a `personas.nombre`?
14. Clientes con `%`/`_` en el nombre (riesgo `ilike`, 5.6).

**Contra la SPA legada (paridad):**
15. KPIs clicables, flujo `limpiarEntregadas`, navegación desde notificaciones (peticionId), notificaciones del SO: ¿gaps o descartes deliberados?
16. Paridad exacta de las vistas legadas general/por persona/cumplimiento dentro de /peticiones y /progreso.

**Visual (requiere navegador/dispositivo):**
17. Todos los puntos de §9 (wrap del nav con 12 pestañas, semáforos, modales grid-cols-2, panel campana w-96, botones hover-only en touch).

## 13. Información que necesito confirmar con Daniela

Solo dudas que NO se resuelven leyendo el código:

1. **¿Cuál es el estado real de las 3 migraciones del 2026-07-20** (Valeria head + RLS jefa directa + limpieza managers)? Las cabeceras, CLAUDE.md y los PRs se contradicen (11.14). ¿Y quedó pendiente la decisión sobre los managers legacy de Demian y Leonardo?
2. **¿Qué sirve hoy movdi-ops.netlify.app** — el build Next o todavía existe el site del index.html legado? (paso C8 del cutover: retirar legado y limpiar Redirect URLs).
3. **Jefa directa vs UI de recurrentes** (8.3/8.4): ¿es intencional que una jefa directa NO vea botones de pausar/eliminar sobre patrones de su gente creados por otros (aunque la RLS se lo permite), y que "mover instancia" siga limitado a creador/ceo|head?
4. **Loop público de feedback** (8.9): ¿la intención es que las mejoras resueltas "compartibles" las vea TODO el equipo? Hoy la RLS solo se las muestra a dirección.
5. **Aviso "reintenta desde editar"** (10.1): confirmar que se sabe que el reintento de invitación no existe — ¿el flujo esperado cuando falla un invite es rehacer el alta, o falta esa función?
6. **¿Debe el correo ser obligatorio en el alta de personas?** (5.5) Hoy es opcional y permite personas sin cuenta Auth.
7. **KPIs de /peticiones**: ¿eran clicables en la SPA y deben serlo aquí? (1.2)
8. **Notificaciones del SO** (Web Notifications del legado): ¿descartadas a propósito en Next?
9. **Navegación desde la campana**: ¿clic en una notificación debería llevar a la petición (`peticion_id` existe pero no se usa)? (2.3)
10. **Card "peticiones privadas 🔒"** (8.5): ¿dirección espera ver el conteo global de privadas o solo las propias? El copy sugiere lo primero; la RLS impone lo segundo.
11. **¿`personas.needs_pass` ya no tiene consumidores** y puede considerarse columna muerta? (2.9)
12. **Estatus `archivada` de peticiones**: aparece en tipos y filtros pero ningún elemento de la app lo asigna — ¿es legacy, se asigna a mano en BD, o falta la UI?
13. **Prioridad del soporte móvil**: los gaps de §9 (semáforo invisible, botones hover-only, nav sin colapsar) — ¿el equipo usa la app en móvil como para priorizarlos en el manual?
