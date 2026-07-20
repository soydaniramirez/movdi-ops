# 02 · Inventario funcional — MOVDI OPS

Auditoría técnica de solo lectura · 2026-07-20. Lista estructurada por módulo (formato permitido por el encargo) con TODOS los elementos interactivos de la app Next: para cada elemento se documenta pantalla/sección, nombre visible exacto, tipo, objetivo, acción del usuario, resultado (código + tabla Supabase), validaciones, información requerida/generada, dependencias, permisos (condicionales exactos), estados, errores posibles, mensajes exactos, comportamiento mobile, evidencia (función + línea) y estatus.

**Cobertura verificada contra el código**: 129 `onClick` + el resto de handlers (`onChange`/`onSubmit`/`onKeyDown`/`onDoubleClick`/`onBlur`) de todos los archivos de `app/` están cubiertos. Conteos por archivo: peticiones-client 77 handlers (E1-E73 + decorativos) · equipo-client 35 (A/B/C/D) · recurrentes-client 33 (R1-R33) · clientes-client 22 · anuncios-client 18 · feedback-client 11 · progreso-client 10 · estrellas-client 8 · todos-client 7 elementos (9 handlers) · campana 6 · login-form 4 · update-password 3 · rh-lista 1 · logout-button 1 · organigrama 1 Link.

**Estatus usados**: funcional · incompleto · duplicado · sin conexión · decorativo · pendiente de validación. Nota: las referencias internas tipo "§7"/"§8" de cada bloque apuntan a los hallazgos y pendientes de ese módulo, consolidados en `04-hallazgos.md`.

Cada bloque de módulo incluye además su **lógica de negocio** (fórmulas y reglas con números exactos) y el **consolidado de validaciones y mensajes textuales**.

---

# MÓDULO: PETICIONES (`/peticiones`)

## Inventario de elementos interactivos

Conteo real de handlers DOM en `peticiones-client.tsx`: **77** (35 `onClick`, 41 `onChange`, 1 `onKeyDown`; verificado con grep — el enunciado decía 73; los 77 incluyen handlers repetidos por `.map()` contados una vez por atributo en código). Todos cubiertos abajo. Además hay 2 links `<a>` sin handler (evidencia/URL de detalle) y elementos decorativos (KPIs).

Leyenda: **P**=pantalla/sección · **T**=tipo · **A**=acción código (tabla Supabase) · **V**=validaciones · **Roles**=condición de visibilidad · **Msg**=mensajes exactos · **Mob**=mobile · **Ev**=evidencia · **St**=estatus.

### 2.1 Cabecera y navegación

**E1. "✋ nuevo compromiso"** · P: header · T: botón · A: `setModalCompromiso(true)` (sin Supabase) · Roles: todos · Msg tooltip: `title="trabajo emergente que tomas tú — se asigna a ti"` · Mob: sin clases responsive (header flex fijo) · Ev: L250-257 · St: funcional.

**E2. "+ nueva petición"** · P: header · T: botón · A: `setModalCrear(true)` · Roles: todos · Ev: L258-264 · St: funcional.

**E3. Banner "📌 tareas asignadas a ti"** · P: bajo KPIs · T: botón ancho completo · Objetivo: llevar a "mis pendientes" · A: `setTab('mis')` · Roles: tab general + `misPendientes>0` · Texto: "tienes **{N}** {petición pendiente|peticiones pendientes} esperando tu acción" + "ver mis peticiones →" · Ev: L288-302 · St: funcional.

**E4. Tabs (4-5 botones)** · P: nav · T: botones · A: `setTab(k)` · Roles: `atorado` solo si `veAtorados` (L309: `esDireccion(yo) || yo.nivel==='head' || tengoSupervisadas(yo, personas)`, def L80) · Labels exactos: "general", "mis pendientes", "lo que pedí", "instancias recurrentes", "⏸ qué está atorado" · Ev: L305-315 · St: funcional.

**E5. Chips de filtro "todas"/"vencidas"/"esta semana"** · T: 3 botones · A: `setFiltro(f)` · V: `vencidas`= `diasHasta<0 && !entregado` (L119); `semana`= `0<=d<=7 && !entregado` (L120) · Roles: todos, ocultos en tab atorado · Ev: L319-324 · St: funcional.

**E6. Select "filtrar por área"** · T: `<select>` (aria-label="filtrar por área", data-testid `filtro-area`) · A: `setFiltro(area||'todas')` · Opciones: "área: todas" + `AREAS_LABEL` (IMKT, P.Mgrs, Legal, Admi, Ventas, Digital, RH) · Roles: opción `rh` solo si `yo.esDireccion || yo.nivel==='rh'` (L336 — filtro **solo frontend**) · Ev: L327-338 · St: funcional.

**E7. "✕ quitar filtro"** · P: bajo nav, cuando `personaFiltro` activo · T: botón · A: `setPersonaFiltro(null)` · Ev: L347-350 · St: funcional.

**E8. Toggle ocultas "👁 mostrar ocultas (N)" / "🙈 ocultar (N)"** · P: controles ocultas · T: botón · A: `setMostrarOcultas` por scope (sin Supabase) · Roles: tabs general/mis/pedi y `ocultasCount>0` · Ev: L357-365 · St: funcional.

**E9. "🙈 ocultar entregadas"** · T: botón · A: `confirm(...)` → `ocultarEntregadas({scope})` → UPDATE `peticiones.oculta_para` por fila (actions L584-613) · Msg confirm EXACTO: `"¿ocultar todas las peticiones entregadas de tu vista?\n\nseguirán contando para tu progreso pero ya no se mostrarán aquí. puedes volver a mostrarlas con el botón \"👁 mostrar ocultas\"."` · Tooltip: `"oculta de tu vista las que ya están entregadas · siguen contando en tu progreso"` · Ev: L366-376, actions L584 · St: funcional (nota §7: N+1 updates, éxito "parcial" silencioso por diseño).

### 2.2 BannerPodio

**E10. "✕ cerrar" (podio)** · T: botón · A: `localStorage.setItem(dismissKey,'1')` + `setDismissed(true)` · Roles: días 1-5 del mes Y (`competeEnLeaderboard(yo) || esDireccion(yo) || yo.nivel==='head'`, L656) Y hay top3 · Datos: `rpc('podio_mes_cerrado', {p_mes: mesAnteriorStr()})` (L649) con fallback a `historial` filtrado por mes anterior ordenado por `xpTotal` desc (L663-666) · Texto: "🏆 podio de {mes} · mes cerrado", "felicidades al equipo — estos fueron los más constantes del mes pasado", medallas 🥇🥈🥉 + "%": `cumplimiento` · Ev: L630-694 · St: funcional.

### 2.3 Semáforo y privadas

**E11. Item de semáforo (por persona)** · P: aside derecho · T: botón · A: toggle `setPersonaFiltro(f=> f===p.nombre ? null : p.nombre)` · Roles: tab general + `bloquesEquipo(yo, personas).length>0` (definición en lib/equipo.ts L65 — quién recibe bloques: pendiente de validación §8; dirección siempre ve el aside por la card privadas, L502) · Muestra: punto `SEM_COLOR[estado]` (r naranja / y amarillo / g verde / x gris), nombre, total · Estado calculado por `calcularSemaforo` con instancias recurrentes incluidas (L144-148) · Mob: **oculto en <lg** (`hidden lg:block`, L503) · Ev: L511-517 · St: funcional.

**E12. Card "peticiones privadas 🔒"** · T: informativa (sin handler) · Roles: tab general + `esDireccion(yo)` · Muestra `rhCount` = privadas no entregadas que YO puedo ver (L184: `t.privada && t.estatus!=='entregado' && puedoVerPeticion(t,yo)`) · Texto: "peticiones confidenciales activas" · Ev: L522-528 · St: funcional pero **engañosa** (§7-H9: dirección NO ve privadas ajenas, cuenta solo las propias).

### 2.4 Fila de petición (`FilaPeticion`, L699-934) — condiciones base

`soyCreador = t.creadoPor === yo.nombre` (L714, comparación estricta), `soyDest = matchNombre(t.para, yo.nombre)` (L715, normalizada), `puedoActuar = soyCreador || soyDest` (L716). Los botones de acción solo se renderizan si `puedoActuar` (L876).

**E13. Link de campo URL en detalle** · T: `<a target="_blank" rel="noreferrer">` · Roles: cualquiera que vea la fila con detalle de tipo · Ev: L792 · St: funcional.

**E14. "💾 guardar cliente al catálogo"** · T: botón · A: `guardarClienteAlCatalogo({peticionId})` → SELECT peticiones, SELECT/UPDATE/INSERT `clientes`, UPDATE `peticiones.cliente_id` (actions L201-258) · Roles cliente: `esAdmi && !t.clienteId && detalle.cliente_nombre` no vacío (L806; `esAdmi = yo.areas.includes('admi') || esDireccion(yo)`, L82); servidor: RLS de `clientes` (error 42501 → "solo el área admi (o dirección) puede escribir al catálogo", actions L246) · Tooltip: `"pasa los datos capturados a mano al catálogo — la próxima vez se autocompletan"` · Errores: "petición no encontrada", "esta petición no tiene nombre de cliente capturado" · Ev: client L806-812, actions L201 · St: funcional (liga a petición best-effort sin manejo de error, actions L253).

**E15. "entregar ✓"** · T: botón · A: `setModalEntrega(t)` · Roles: `puedoActuar && t.estatus!=='entregado'` · Ev: L880-883 · St: funcional.

**E16. "▶ en proceso" / "↩ a pendiente"** · T: botón toggle · A: `cambiarEstatus({id, estatus})` → SELECT + UPDATE `peticiones.estatus` (actions L379-410) · Roles: `puedoActuar && !entregado`; servidor confía en RLS (0 filas → error) · Errores: "petición no encontrada", "no puedes cambiar el estatus de esta petición" · Ev: client L884-887, actions L379 · St: funcional.

**E17. "cambiar fecha"** · T: botón · A: `setModalFecha(t)` · Roles: `puedoActuar && !entregado` · Ev: L888-891 · St: funcional.

**E18. "+ nota"** · T: botón · A: `setModalNota(t)` · Tooltip: `"deja constancia de avance sin cambiar el estatus · cuenta como movimiento"` · Roles: `puedoActuar && !entregado` · Ev: L892-896 · St: funcional.

**E19. "reabrir"** · T: botón · A: `cambiarEstatus({id, estatus:'pendiente'})`; si estaba `entregado` y `para !== yo`, notifica al destinatario (tipo `reabierta`, título `` `${yo.nombre} reabrió "${nombre}"` ``, detalle "vuelve a estar pendiente · revisa los detalles", actions L396-405) · Roles: `puedoActuar && t.estatus==='entregado'` · Ev: client L899-904 · St: funcional.

**E20. "🙈" (ocultar fila)** · T: botón icono · A: `ocultarPeticion({id})` → SELECT + UPDATE `oculta_para` añadiendo mi nombre (actions L615-632) · Roles: `puedoActuar && entregado && !oculta` (L905) · Tooltip: `"ocultar de mi vista · sigue contando en el progreso"` · Errores: "petición no encontrada", "no tienes permiso para ocultar esta petición" · Ev: client L905-910 · St: funcional.

**E21. "👁" (desocultar fila)** · T: botón icono · A: `desocultarPeticion({id})` → UPDATE `oculta_para` sin mi nombre (actions L634-650) · Roles: `puedoActuar && oculta` · Tooltip: `"mostrar de nuevo"` · Error: "no tienes permiso para modificar esta petición" · Ev: client L911-916 · St: funcional.

**E22. "mover instancia"** · T: botón · A: `setModalMover(t)` · Roles: `t.origenRecur && (soyCreador || admin) && !entregado` (L917; `admin = isAdmin(yo)` = ceo|head) · Ev: L917-922 · St: funcional.

**E23. "eliminar"** · T: botón · A: `confirm('¿eliminar esta petición?')` → `eliminarPeticion({id})` → DELETE `peticiones` (actions L565-576, RLS: solo creador) · Roles cliente: `soyCreador` (L923) · Error: "solo el creador puede eliminar esta petición" · Ev: client L488-491 + L923-928 · St: funcional (confirm nativo genérico, sin nombre de la petición).

**E24. Link de evidencia de entrega** · T: `<a>` subrayado target_blank · Roles: `entregado && (linkEntrega||notaEntrega)` · Ev: L821-827 · St: funcional.

Indicadores no interactivos de fila (decorativos con tooltip): 🙈 "oculta de tu vista" (L740), 🔒 "privada · solo creador y destinatario" (L741), "↻ recurrente" (L743), "grupo" (L744), tag origen `title="origen: {origen}"` (L745-750), 📎 "con evidencia de entrega" (L751-753), ⚠ plazo `title="plazo (muy) ajustado: pedida con {m} día(s) de margen"` (L754-767), banner fecha movida "fecha movida (original: X) · {motivo}" + "· cuenta contra la fecha original" (L815-820), chip "⚠ faltan: {recomendados}" `title="campos recomendados sin llenar — no bloquean, pero el área los va a pedir"` (L797-801), badge "⏸ atorada · {N}d sin mov." `title="sin movimiento real (estatus, notas o entrega) desde hace {N} días hábiles"` (L867-872), "✋ compromiso de {para}" `title="compromiso auto-asignado de {para}"` (L831-834).

### 2.5 ModalShell (todos los modales)

**E25. Overlay (clic fuera)** · A: `onCerrar` (L939) — **descarta lo tecleado sin confirmación** (§7-H12). **E26. Contenedor** · `onClick stopPropagation` (L941). **E27. "✕"** · botón cierra (L944). St: funcionales.

### 2.6 ModalCrear "nueva petición" (L956-1270)

Estado inicial: fecha `dx(7)` (hoy+7, L970), prio `media`, privada por defecto si `yo.nivel==='rh' || yo.nombre==='Salvador'` (L966, **hardcode**), área default = primera área válida de `yo` o `'imkt'` (L964).

**E28. Input "nombre de la petición"** · text, autoFocus · Ev: L1066-1068.
**E29. Textarea "descripción"** · rows 3 · bloqueante solo si el tipo tiene `requiereDescripcion` · Ev: L1069-1072.
**E30. Radios "asignar a" (6 modos)** · labels exactos: "una persona", "varias personas · selección manual", "un área completa", "solo heads · admin only", "solo ejecutivos · admin only", "todo el equipo · admin only" · los 3 admin-only solo se renderizan si `admin` (L1077); servidor re-verifica (actions L85: "ese modo de asignación es solo para dirección/heads") · cambiar modo ejecuta `resetTipo()` → **borra tipo/detalle/cliente capturados sin aviso** · Ev: L1024-1031, L1077-1083.
**E31. Select "área" (modo una)** · cambia área, limpia `para` y resetea tipo (L1091) · Ev: L1087-1094.
**E32. Select "para" (modo una)** · opciones: personas disponibles del área (`delArea`, L1022; excluye a `yo` y no disponibles — `personaDisponible` = activo y no pausada, lib/peticiones L298) con formato "{nombre} {apellido} · {rol}"; placeholder "— elige —" · Ev: L1095-1103.
**E33. Checkboxes personas (modo varias)** · contador "personas · seleccionadas: {N}" · Ev: L1107-1120.
**E34. Select "área destino" (modo area)** · con leyenda "— se asignará a {N} persona(s) de {ÁREA} —" · resetea tipo · Ev: L1122-1132.
**E35. Select "tipo de petición *"** (`pet-tipo`) · solo si `candadoActivo` (`areaTieneTipos(areaActiva)`, L989-991; modos una/area) · opciones agrupadas por `optgroup` (`grupo`: "con brief"/"sin brief"/"ruta") · `cambiarTipo` limpia detalle+cliente y si el tipo tiene SLA fija `fecha=fechaPorSLA` (L1000-1007) · Ev: L1135-1158.
**E36. Select "cliente (autocompleta del catálogo)"** (`pet-cliente`) · solo si `tipo?.usaCliente` · opciones: clientes activos "{nombre} · {rfc}"; placeholder "— nuevo cliente / capturar manualmente —" · `elegirCliente` aplica snapshot `aplicarCliente` (L1008-1013) · Ev: L1160-1171.
**E37-E40. `CampoDinamico` (4 variantes de input)** (L1276-1360): textarea (L1291), select con optgroups "frecuentes"/"todo el catálogo" (L1299-1327), radios sí/no (L1329-1346), input text/date/number(step 0.01)/email/url (L1348-1359). Etiqueta: `*` naranja = bloqueante, "(recomendado)" = recomendado. Un handler `onChange` cada uno → `setDetalle` (L1174-1175). St: funcionales.
**E41. Input "fecha límite" / "fecha compromiso"** · type date · **disabled si `slaActiva`** con label "fecha compromiso · {SLA} (automática)" y `title="la fecha la fija el SLA del tipo ({slaLabel}, días hábiles)"` (L1198-1204) · cambiarla resetea `verificado` · Ev: L1196-1205.
**E42. Select "prioridad"** · media/alta/baja · Ev: L1206-1213.
**E43. Checkbox nudge "✓ sí, ya verifiqué con {quien} que es posible esta entrega"** · aparece si `nudgeActivo` (`!slaActiva && diasHasta(fecha)<=2`, L1015-1017) · banner: "⚠ estás dando poco tiempo para entregar ({para hoy|mañana|N días}) — ¿ya verificaste con **{quien}** si es posible esta entrega?" ({quien}= `para` en modo una, o "quien va a entregar") · fricción, no bloqueo: habilita el botón crear · Ev: L1216-1240.
**E44. Checkbox "🔒 petición privada"** · texto: "— solo tú y el destinatario la ven (ni dirección)" · Ev: L1242-1245.
**E45. "cancelar"** · cierra sin confirmación · Ev: L1258.
**E46. "crear petición"** (`btn-crear-confirmar`) · `disabled = guardando || (nudgeActivo && !verificado) || (candadoActivo && (!tipo || !validacion?.ok))` (L1260) · `title` cuando falta nudge: "confirma que ya verificaste la entrega con el plazo ajustado" · texto "creando…" mientras guarda · A: `guardar()` (L1033-1060) → `crearPeticion` → SELECT personas + INSERT `peticiones` (1 fila por destinatario, `grupo_id` si >1) + INSERT notificaciones vía `notificarServidor` · V cliente (mensajes exactos): "el nombre de la petición es obligatorio", "elige el tipo de petición — esta área lo requiere", "faltan campos obligatorios: {lista}", "falta destinatario" / "selecciona al menos una persona"; confirm >5 destinatarios: `` `vas a asignar esta petición a ${N} personas. ¿confirmas?\n\n${lista}` `` (L1046-1047) · hint candado: "🔒 elige el tipo de petición — esta área lo requiere" / "🔒 faltan obligatorios: {lista}" (L1250-1256) · Ev: L1259-1266 · St: funcional.

### 2.7 ModalCompromiso (L1367-1450)

Aviso fijo: "se asigna a **ti ({nombre})** — queda en el mismo tablero, visible para tu líder y dirección. no da XP." + "para pendientes 100% personales usa \"mis to-dos\" (esos sí son privados)". Fecha default `dx(3)`.

**E47. Input "¿qué te comprometes a entregar?"** (L1408-1409) · **E48. Textarea descripción** (L1411-1413) · **E49. Select "¿de dónde nace? (obligatorio)"** (`comp-origen`, L1415-1421; opciones exactas: "talento — lo pidió un talento", "cliente — lo pidió un cliente", "interno — nace del equipo / la agencia", "propio — iniciativa mía"; sin preselección) · **E50. Input fecha (min=hoy)** (L1424-1426) · **E51. Select prioridad** (L1428-1435) · **E52. "cancelar"** (L1441) · **E53. "tomar compromiso ✋"** (`btn-compromiso-confirmar`, L1442-1445; "creando…" al guardar) · A: `crearCompromiso` → INSERT `peticiones` (para=creado_por=yo, `privada:false` forzado, `origen` obligatorio, área = primera del creador o 'imkt', sin notificación) · V cliente: "el nombre del compromiso es obligatorio", "indica de dónde nace el compromiso" (L1389-1390) · V servidor (actions L277-284): mismos + "prioridad inválida", "indica de dónde nace el compromiso (talento, cliente, interno o propio)", "elige la fecha de compromiso", "la fecha de compromiso no puede ser en el pasado"; fallback pre-cutover: "los compromisos aún no están habilitados — falta aplicar la migración de BD (cutover 9)" (L303) · St: funcional.

### 2.8 ModalEntrega (L1453-1482)

Leyenda: "la evidencia es opcional — puedes dejar ambos campos vacíos."
**E54. Input "link de entrega (opcional)"** (L1465-1466, placeholder "https://…") · **E55. Textarea "nota (opcional)"** (L1468-1470) · **E56. "cancelar"** (L1473) · **E57. "marcar entregado ✓"** (`btn-entrega-confirmar`, L1474-1477) · A: `entregarPeticion` → UPDATE `peticiones` {estatus:'entregado', link_entrega, nota_entrega, fecha_entrega:hoy} (actions L353-377) · V: ninguna del link (no valida formato URL) · Errores: "no puedes cambiar el estatus de esta petición" · St: funcional.

### 2.9 ModalCambioFecha (L1485-1545)

Fecha sugerida = fecha actual +7 (L1491, `new Date(t.fecha)` **sin 'T00:00:00'** — §7-H5). Aviso contextual: creador → "tú creaste esta petición para **{para}**. al cambiar la fecha le das más tiempo — verá la nueva fecha y tu motivo."; destinatario → "esta petición fue creada por **{creadoPor}**. al cambiarla, le aparecerá una alerta con tu motivo."
**E58. Input "nueva fecha"** (L1506-1507, **sin `min`**) · **E59. Textarea "motivo del cambio (obligatorio)"** (L1509-1513, placeholders "ej: le di unos días más por incapacidad médica…" / "ej: el cliente aún no manda los archivos finales…", hint "mínimo 10 caracteres") · **E60-E61. Radios "¿esta extensión cuenta como entrega a tiempo?"** solo creador (L1515-1529): "**sí** · causa justificada — la puntualidad se mide contra la fecha nueva" / "**no** · se les pasó — se mide contra la fecha original, cuenta como tarde" · **E62. "cancelar"** (L1532) · **E63. "guardar cambio"** (`btn-fecha-confirmar`, L1533-1540) · V cliente: motivo ≥10 ("escribe al menos 10 caracteres explicando el motivo") · A: `cambiarFecha` (actions L412-470) → SELECT + UPDATE `peticiones` {fecha, fecha_original (preserva la primera), motivo_cambio_fecha, cambio_visto_por_creador, extension_justificada solo si creador} + notificación `fecha_cambiada` (creador→para: `` `${yo} extendió el plazo de "{nombre}"` `` det "nueva fecha: {f} · motivo: {m}[ · cuenta contra la fecha original]"; destinatario→creador: `` `${yo} cambió la fecha de "{nombre}"` ``) · V servidor: "elige una nueva fecha", "escribe al menos 10 caracteres explicando el motivo", "solo el creador o el destinatario pueden cambiar la fecha", "no se pudo actualizar" · **NO valida fecha futura ni distinta** (§7-H6) · St: funcional.

### 2.10 ModalNotaAvance (L1552-1594)

Leyenda: "no cambia el estatus — solo deja constancia de que la tarea se movió (p. ej. \"esperando respuesta del cliente\"). resetea el contador de días sin movimiento."
**E64. Input "¿en qué va?"** (L1577-1581, maxLength 200, autoFocus, placeholder "ej: mandé segundo recordatorio al cliente, sigo en espera") · **E65. onKeyDown Enter → guardar** (L1581) · **E66. "cancelar"** (L1585) · **E67. "guardar nota"** (`btn-nota-confirmar`, L1586-1589, "guardando…") · V cliente: ≥3 caracteres ("escribe la nota de avance (mínimo 3 caracteres)") · A: `agregarNotaAvance` (actions L321-351) → SELECT + UPDATE `peticiones.descripcion` añadiendo línea `` `⏱ avance (${fechaCorta(hoy)}, ${yo.nombre}): ${nota}` `` · V servidor: colapsa espacios, ≥3 ("escribe la nota de avance (mínimo 3 caracteres)"), ≤200 ("máximo 200 caracteres — es una nota de una línea"), "solo el creador o el destinatario pueden dejar notas de avance", "esta petición ya está cerrada" (entregado/archivada), "no se pudo guardar la nota" · St: funcional.

### 2.11 ModalMoverInstancia (L1597-1656)

Cabecera: "para **{para}** · fecha original de esta entrega: {fecha}". Fecha sugerida = fecha+2 (L1602, con 'T00:00:00'). Nota fija: "ℹ la siguiente entrega del patrón llegará en su fecha habitual".
**E68. Input "nueva fecha"** (min=hoy, L1616) · **E69. Textarea "motivo (obligatorio)"** (placeholder `` `ej: ${t.para} está enferma esta semana` ``, hint "mínimo 10 caracteres · {para} verá este motivo") · **E70-E71. Radios "¿cuenta como entrega a tiempo?"**: "**sí** · causa justificada" / "**no** · cuenta contra la fecha original" · **E72. "cancelar"** (L1642) · **E73. "mover entrega"** (`btn-mover-confirmar`, L1643-1651) · V cliente: motivo ≥10 ("el motivo debe tener al menos 10 caracteres"), fecha ≠ actual ("la nueva fecha es igual a la actual. elige otra") · A: `moverInstancia` (actions L474-563; desde este módulo siempre rama "instancia real" con `peticionId`) → UPDATE `peticiones` {fecha, fecha_original, motivo_cambio_fecha, extension_justificada, cambio_visto_por_creador:true} + notificación `fecha_cambiada` a `para` (`` `${yo} movió tu entrega de "{nombre}"` ``, "del {f1} al {f2} · motivo: {m}[ · cuenta contra la fecha original]", `peticion_id: null`) · V servidor: "selecciona una nueva fecha", "el motivo debe tener al menos 10 caracteres", "no puedes mover la entrega a una fecha que ya pasó", "no se encontró esa instancia", "esta no es una instancia recurrente", "solo el creador o dirección puede mover una instancia", "la nueva fecha es igual a la actual", "no se pudo mover (RLS)" · Rama virtual (recurId+fechaInstancia → INSERT con `origen_recur`) se invoca desde `app/(app)/recurrentes/recurrentes-client.tsx:276` (verificado por grep), no desde este client · St: funcional.

**Comportamiento mobile global**: prácticamente sin breakpoints: solo `lg:block` en el semáforo (L503, oculto en móvil sin alternativa) y `sm:` inexistente. KPIs `grid-cols-4` fijo (L273) — 4 columnas apretadas en móvil. Tablas con `overflow-x-auto` (L404, L465). Modales `max-w-lg` + `max-h-[90vh] overflow-y-auto` (L940). Botones header sin colapsar.

---

## Lógica de negocio

### 5.1 Tipos de petición (lib/tipos-peticion.ts, config única cliente+servidor)
- **digital** (L132-143): 7 tipos "con brief" (pitch_deck, pieza_rrss_talento, pieza_rrss_movdi, ideacion, ajuste_pieza, email_talento, roster_web) con único campo bloqueante `link_brief` (url, placeholder "https://www.notion.so/…"); 3 "sin brief" (asesoria_notion, asesoria_everest, revision_talento) con `requiereDescripcion:true` y 0 campos.
- **admi** (L144-194):
  - `factura` (usaCliente, **SLA 2 días hábiles**, label "SLA 24-48h"): 13 campos TODOS bloqueantes — cliente_nombre, nombre_campana, id_campana, razon_social, rfc, regimen_fiscal, cp_fiscal, uso_cfdi (select catálogo SAT `USO_CFDI`, guarda clave, `normalizarUsoCFDI`), metodo_pago (select "PUE — pago en una sola exhibición"/"PPD — pago en parcialidades o diferido"), forma_pago, concepto (textarea), importe_sin_iva (monto), correo_envio.
  - `cobranza` (usaCliente, sin SLA): cliente_nombre (recomendado), nombre_campana (bloqueante), id_campana (bloqueante), correo_contacto (bloqueante, autocompleta contactoCorreo), observaciones (recomendado).
  - `alta_portales` (**SLA 3 días hábiles**, "SLA 24-72h"): nombre_campana, id_campana, link_portal, correo_alta — todos bloqueantes.
  - `consulta_admin` (`requiereDescripcion`): id_campana bloqueante, nombre_campana recomendado.
- **legal** (L195-208): `contrato_movdi` (ruta A) y `contrato_cliente` (ruta B, añade `contrato_cliente_url` bloqueante). Ambos usan `LEGAL_COMUNES` (L110-117: nombre_campana, talento_firmar, correo_contacto_cliente bloqueantes; checklist_contractual, caracteristicas_negociacion recomendados) + `INFO_CLIENTE_LEGAL` (L64-108: cliente_nombre y firmante_nombre bloqueantes; resto recomendados). Condicionales: `facultades_doc_url` y `firmante_cargo` visibles solo si `tipo_persona==='moral' || persona_moral===true` (L91, L104); `domicilio_comercial` solo si `domicilio_difiere===true` (L97). Aviso: constancia fiscal >3 meses → "⚠ la constancia fiscal tiene más de 3 meses — pide una actualizada" (L69-72, vía `constanciaVigente`).
- Helpers: `areaTieneTipos` (L212), `sanitizarDetalle` (L232-241: whitelist de claves, solo campos visibles, normaliza, trims, descarta vacíos), `validarDetalle` (L244-269: bloqueantes → `ok=false`; `requiereDescripcion` añade "descripción de la solicitud" al frente), `fechaPorSLA` (L272-273 = `sumaDiasHabiles(hoy, slaDiasHabiles)`), `aplicarCliente` (L278-294: snapshot editable; auto-marca `domicilio_difiere=true` si el catálogo trae domicilio comercial).
- Candado servidor (actions L107-134): aplica en modos una/area cuando `areaTieneTipos(area)`; sin tipo → error; sanitiza + valida; **el servidor recalcula la fecha por SLA** ("no confía en el cliente", L125-127); clienteId se verifica que exista o se ignora (L129-133).

### 5.2 Compromisos (Fase 2026-07-14)
- `esCompromisoPropio(t)` (lib/peticiones L204-209): `!origenRecur && (origen==='propio' || matchNombre(creadoPor, para))`.
- Creación: `crearCompromiso` — privada FORZADA false, origen obligatorio (`ORIGENES_VALIDOS=['talento','cliente','interno','propio']`, lib L66), fecha ≥ hoy, sin notificación, sin XP (exclusión en lib/gamificacion.ts, fuera de alcance).
- UI: tag "✋ compromiso de {para}" en la columna de→para (L831-834); "✋ propio" en panel atorados (L418-420).

### 5.3 Regla "atorada" (3 días hábiles) y movimiento
- `diasHabilesEntre` (lib L213-224): días L-V estrictamente después de `desde` hasta `hasta` inclusive; viernes→lunes = 1; mismo día = 0.
- `diasSinMovimiento` (lib L243-250): desde `updated_at` (trigger condicional BD: solo estatus/descripcion/nota_entrega/link_entrega/fecha_entrega, per CLAUDE.md) con fallback a `created_at`, hasta hoy.
- `estadoMovimiento` (lib L257-269): entregado/archivada → null; **atorada si sinMov ≥ 3** (precedencia máxima); vencida si `fecha` < hoy; `por_vencer` si faltan ≤2 días; si no `al_dia`. Nota: `por_vencer` no se usa en la UI de este módulo (probable uso en semáforo — pendiente de validación).
- Nota de avance = movimiento legítimo (dispara trigger por tocar `descripcion`); cambiar `fecha` NO limpia el rojo a propósito (comentarios actions L313-320).

### 5.4 Plazo ajustado
- `margenPeticion` (lib L117-125): `round((fechaOriginal||fecha − created_at.slice(0,10)) / 86400000)`. Indicador ⚠ si margen ≤2 (amarillo "plazo ajustado") o ≤1 (naranja "plazo muy ajustado"); solo no-entregadas y nunca instancias recurrentes (client L754-767). Nudge de creación con el mismo umbral ≤2 sobre `diasHasta(fecha)` (client L1015-1017), desactivado si SLA.

### 5.5 Fechas y etiquetas
- `labelFecha` (lib L180-195): entregada → "entregada ✓" o "entregada · {N}d tarde" (límite = fecha original si `extensionJustificada===false`, si no la fecha vigente); pendiente → "vencida {N}d" / "hoy" / "mañana" / "en {N}d" (≤7) / fecha corta.
- `diasHasta` (lib L171-172), `fechaCorta` "d mes" abreviado es (L175-178), `dx(offset)` (L162).
- Cambio de fecha: `fecha_original` preserva SIEMPRE la primera (`t.fecha_original || t.fecha`, actions L436/L502); `extension_justificada` solo la fija el creador (default true si no manda false, L440); `cambio_visto_por_creador` = true si cambió el creador, false si cambió el destinatario (L438).

### 5.6 Ordenamientos
- Lista: entregadas al final, después `fecha` asc (client L126-131). Carga ya ordenada por fecha (L89).
- Atorados: grupos por `maxDias` desc; dentro, `dias` desc (L175-179).
- Semáforo: `ordenSemaforo` (lib/equipo, no auditado). Podio fallback: `xpTotal` desc (L663).
- Personas elegibles en modal: `localeCompare` por nombre (L1021).

---

## Validaciones y mensajes (texto exacto)

### Confirms nativos
1. "¿ocultar todas las peticiones entregadas de tu vista?\n\nseguirán contando para tu progreso pero ya no se mostrarán aquí. puedes volver a mostrarlas con el botón \"👁 mostrar ocultas\"." (client L368)
2. "¿eliminar esta petición?" (client L489)
3. "vas a asignar esta petición a {N} personas. ¿confirmas?\n\n{lista}" (client L1047)

### Errores/valid. cliente
- "el nombre de la petición es obligatorio" (L1035) · "elige el tipo de petición — esta área lo requiere" (L1036) · "faltan campos obligatorios: {…}" (L1038) · "falta destinatario" / "selecciona al menos una persona" (L1044) · "no se pudo crear la petición" (L1059) · "el nombre del compromiso es obligatorio" (L1389) · "indica de dónde nace el compromiso" (L1390) · "no se pudo crear el compromiso" (L1394) · "escribe al menos 10 caracteres explicando el motivo" (L1535) · "escribe la nota de avance (mínimo 3 caracteres)" (L1563) · "el motivo debe tener al menos 10 caracteres" (L1645) · "la nueva fecha es igual a la actual. elige otra" (L1646) · Skew: "la app se actualizó — recargando para tomar la versión nueva…" (L218), "la app se actualizó y esta pestaña quedó con una versión vieja — recarga la página (⌘R / Ctrl+R) para continuar" (L223), "la app se actualizó — recarga la página e inténtalo de nuevo" (L548, L567).

### Errores servidor (actions.ts)
- getContexto: "sin sesión" (L31), "tu cuenta no está ligada a una persona del equipo" (L34), "cuenta archivada" (L36), `MSG_CUENTA_SIN_VINCULO` (L42, texto en lib/supabase/vinculo — pendiente de validación).
- crearPeticion: "el nombre de la petición es obligatorio" (L79), "prioridad inválida" (L80), "área inválida" (L82), "ese modo de asignación es solo para dirección/heads" (L86), "falta destinatario" (L97), "destinatario inválido: {d}" (L103), "elige el tipo de petición — esta área lo requiere" (L118), "faltan campos obligatorios: {…}" (L122).
- guardarClienteAlCatalogo: "petición no encontrada" (L206), "esta petición no tiene nombre de cliente capturado" (L209), "solo el área admi (o dirección) puede escribir al catálogo" (L246).
- crearCompromiso: "el nombre del compromiso es obligatorio" (L278), "prioridad inválida" (L279), "indica de dónde nace el compromiso (talento, cliente, interno o propio)" (L281), "elige la fecha de compromiso" (L283), "la fecha de compromiso no puede ser en el pasado" (L284), "los compromisos aún no están habilitados — falta aplicar la migración de BD (cutover 9)" (L303).
- agregarNotaAvance: "escribe la nota de avance (mínimo 3 caracteres)" (L328), "máximo 200 caracteres — es una nota de una línea" (L329), "petición no encontrada" (L333), "solo el creador o el destinatario pueden dejar notas de avance" (L335), "esta petición ya está cerrada" (L338), "no se pudo guardar la nota" (L346).
- entregarPeticion: "no puedes cambiar el estatus de esta petición" (L372).
- cambiarEstatus: "petición no encontrada" (L388), "no puedes cambiar el estatus de esta petición" (L393).
- cambiarFecha: "elige una nueva fecha" (L421), "escribe al menos 10 caracteres explicando el motivo" (L422), "petición no encontrada" (L426), "solo el creador o el destinatario pueden cambiar la fecha" (L431), "no se pudo actualizar" (L444).
- moverInstancia: "selecciona una nueva fecha" (L485), "el motivo debe tener al menos 10 caracteres" (L486), "no puedes mover la entrega a una fecha que ya pasó" (L487), "no se encontró esa instancia" (L493), "esta no es una instancia recurrente" (L494), "solo el creador o dirección puede mover una instancia" (L496, L528), "la nueva fecha es igual a la actual" (L498), "no se pudo mover (RLS)" (L508), "falta la recurrente origen" (L523), "no se encontró la recurrente origen" (L526).
- eliminarPeticion: "solo el creador puede eliminar esta petición" (L571).
- ocultar/desocultar: "petición no encontrada" (L619, L638), "no tienes permiso para ocultar esta petición" (L627), "no tienes permiso para modificar esta petición" (L645).
- Catch genérico en todas: "error inesperado". Fallback de `accion`: "error" (client L235).

---


---

# MÓDULOS: RECURRENTES (`/recurrentes`) y TO-DOS (`/todos`)

## Inventario de elementos interactivos

Convención: los campos no repetidos por brevedad valen lo indicado en la entrada; "Mobile" = no existe NINGUNA clase `sm:`/`md:`/media query en `recurrentes-client.tsx` ni `todos-client.tsx` (verificado: cero ocurrencias de `sm:`/`md:` en ambos archivos); el layout es de una sola columna fluida (`max-w-5xl` / `max-w-2xl`), la tabla de patrones scrollea con `overflow-x-auto` (L174) y las cards usan `flex-wrap` (L125, L156).

### 2.A — RecurrentesClient (33 handlers)

**R1 · Botón "+ nueva recurrente"**
- Pantalla/Sección: /recurrentes · header. Texto visible exacto: `+ nueva recurrente`. Tipo: botón (`data-testid="btn-nueva-recurrente"`).
- Objetivo: abrir el modal de creación. Acción: clic → `setModalCrear(true)` (L104).
- Resultado: solo estado local (abre `ModalCrearRecurrente`); sin llamada Supabase directa.
- Permisos: solo se renderiza si `puedeCrear` (L103) = `puedeCrearRecurrentes(yo, personas)` (L34) → privilegiados (ceo/head/rh/Salvador/Arylene) o jefa directa con supervisadas (ver §4). Nota: `personas` llega tras el primer fetch, así que para una jefa directa el botón "aparece" tras cargar (comentario L32-33).
- Estados: visible/oculto. Errores: n/a. Mobile: header `flex items-center justify-between` sin wrap — en pantallas muy angostas título y botón comparten fila (sin breakpoint). Evidencia: L103-108. **Estatus: funcional.**

**R2 · Botón "entregar ✓" (card de instancia)**
- Sección: "mis próximas entregas". Texto exacto: `entregar ✓` (`data-testid="btn-entregar-instancia"`).
- Objetivo: abrir modal de entrega de esa instancia. Acción: clic → `setModalEntrega(t)` (L138).
- Resultado: abre `ModalEntregaInstancia`; la escritura ocurre en R22.
- Permisos: cualquier usuario con instancias propias (la card solo lista instancias donde `matchNombre(r.para, yo.nombre)` — `lib/recurrentes.ts:190`). Estados: siempre visible en cada card. Evidencia: L137-141. **Estatus: funcional.**

**R3 · Botón "mover" (card de instancia)**
- Sección: "mis próximas entregas". Texto exacto: `mover` (`data-testid="btn-mover-mi-instancia"`).
- Objetivo: abrir modal para reprogramar la entrega. Acción: clic → `setModalMover(t)` (L143).
- Permisos (condicional exacto): `(t.creadoPor === yo.nombre || admin)` (L142), con `admin = isAdmin(yo)` = `nivel === 'ceo' || nivel === 'head'` (`lib/peticiones.ts:272-273`). El servidor revalida lo mismo en `moverInstancia` (`peticiones/actions.ts:495-497` y 527-529).
- Evidencia: L142-147. **Estatus: funcional.** Hallazgo: una jefa directa que NO creó el patrón no puede mover instancias de su gente ni las suyas asignadas por otra persona (ver §7.6).

**R4 · Select "filtrar patrones por persona"**
- Sección: "patrones configurados". `aria-label="filtrar patrones por persona"`, `data-testid="filtro-persona-recur"`. Opciones: `persona: todas ({N})` + una por persona con patrón `"{nombre} ({count})"` (L168-171).
- Objetivo: filtrar la tabla por destinatario. Acción: change → `setFiltroPersona` (L165). Resultado: solo estado local (`visiblesFiltradas`, L68-71). Info generada: contador junto al título `· {persona} ({N})` (L159).
- Estados: borde/texto naranja cuando hay filtro activo, gris si no (clases condicionales L166). Evidencia: L161-172. **Estatus: funcional.**

**R5 · Botón "mover próxima" (fila de patrón)**
- Sección: tabla de patrones. Texto exacto: `mover próxima`, `title="mover próxima instancia"`, `data-testid="btn-mover-proxima"`.
- Objetivo: mover la siguiente instancia del patrón sin ser el destinatario. Acción: clic → calcula `proximaInstanciaDe(r)` (L87-90, motor `obtenerInstanciasRecur` con `nombre: r.para`); si no hay instancia → `setAviso` con mensaje exacto: **"no hay una entrega pendiente próxima de {r.para} (¿pausada/inactiva?)"** (L209); si hay → `setModalMover(inst)` (L210).
- Permisos: solo si `puedeAdministrar` = `r.creadoPor === yo.nombre || admin` (L186) **y** `r.activa` (L205). Dependencias: persona destino activa y no pausada (si está pausada, `obtenerInstanciasRecur` devuelve vacío — `lib/recurrentes.ts:180-181` — y sale el aviso).
- Evidencia: L205-215. **Estatus: funcional.**

**R6 · Botón "⏸ pausar / ▶ activar" (fila de patrón)**
- Texto exacto alternante: `⏸ pausar` / `▶ activar` (`data-testid="btn-toggle-recurrente"`, `title` = 'pausar'|'activar').
- Objetivo: pausar/reactivar el patrón. Acción: clic → `accion(() => toggleRecurrente({ id, activa: !r.activa }))` (L217).
- Resultado: `UPDATE recurrentes SET activa=... WHERE id=...` con `.select()` (`recurrentes/actions.ts:133-134`), tabla `recurrentes`. Sin confirmación previa.
- Validaciones servidor: si `data.length === 0` (RLS negó) → error exacto: **"solo el creador o dirección pueden pausar/activar"** (`actions.ts:136`).
- Permisos UI: `puedeAdministrar` (L186). Permisos reales: RLS `recurrentes_update` (según CLAUDE.md 2026-07-20: creador, `es_de_mi_equipo(para)` o dirección — **pendiente de validación** la política SQL exacta; el comentario del código en `actions.ts:129` aún dice "creador o ceo|head", desactualizado).
- Errores: mensaje de RLS o de red vía `aviso`. Evidencia: cliente L216-220, servidor `actions.ts:130-141`. **Estatus: funcional** (con comentario/mensaje desactualizado, ver §7.4).

**R7 · Botón "✕" eliminar (fila de patrón)**
- Texto exacto: `✕` (`data-testid="btn-eliminar-recurrente"`).
- Objetivo: eliminar el patrón. Acción: clic → `confirm('¿eliminar esta recurrente?')` (mensaje exacto, L223); si acepta → `accion(() => eliminarRecurrente({ id }))` (L224).
- Resultado: `DELETE FROM recurrentes WHERE id=...` con `.select()` (`actions.ts:147-148`). Si RLS negó → **"solo el creador o dirección pueden eliminar"** (`actions.ts:150`).
- Permisos UI: `puedeAdministrar` (L186); RLS real `recurrentes_delete` (mismo caso que R6). Nota: eliminar el patrón NO borra instancias materializadas en `peticiones` (no hay código que lo haga; **pendiente de validación** si hay FK/cascade en BD — `origen_recur` referencia `recurrentes.id`).
- Evidencia: L221-228, `actions.ts:144-155`. **Estatus: funcional.**

**R8-R10 · ModalShell (compartido por los 3 modales — 3 handlers)**
- R8 overlay: clic fuera de la caja cierra el modal (`onClick={onCerrar}`, L291).
- R9 caja interna: `onClick={(e) => e.stopPropagation()}` (L293) — evita cierre al clicar dentro. Tipo: técnico, no visible.
- R10 botón `✕` del encabezado del modal: cierra (`onClick={onCerrar}`, L296).
- Mobile: overlay con `p-4`, caja `max-h-[90vh] w-full max-w-lg overflow-y-auto` (L292) — usable en móvil. Evidencia: L289-302. **Estatus: funcional (los 3).**

#### ModalCrearRecurrente (L305-495)

**R11 · Input "nombre"** — `id="rec-nombre"`, label exacto `nombre`, `autoFocus`. onChange → `setNombre` (L377). Obligatorio (validación cliente L352 y servidor `actions.ts:57-58`). **Funcional.**

**R12 · Textarea "descripción"** — `id="rec-desc"`, 2 filas. onChange → `setDesc` (L381). Opcional; el servidor guarda `null` si queda vacío (`actions.ts:110`). **Funcional.**

**R13 · Radios "asignar a" (grupo `rec-modo`)** — un handler por opción (`onChange={() => setModo(m.v)}`, L389). Opciones con textos exactos: `una persona`, `varias personas · selección manual`, `un área completa`, `solo ejecutivos · admin only`, `todo el equipo · admin only` (L340-346). Los dos últimos solo se renderizan si `admin` (`m.adminOnly || admin`, L387). Si `restringida` (jefa directa no privilegiada) solo se muestra `una` (L347). Nota: NO existe modo `heads` en recurrentes (comentario L339, y `MODOS_RECUR` en `actions.ts:19`). **Funcional.**

**R14 · Select "para (tu equipo)" (rama restringida)** — `id="rec-para"`, label exacto `para (tu equipo)`; solo cuando `modo==='una' && restringida` (L396). Opciones: supervisadas disponibles (`supervisadasDe(yo, personas).filter(personaDisponible)`, L335). onChange → `setPara` (L399). Si no hay supervisadas disponibles muestra el texto exacto: **"— no tienes personas a tu cargo disponibles —"** (L404). **Funcional.**

**R15 · Select "área" (rama no restringida, modo una)** — `id="rec-area"`, opciones `AREAS_VALIDAS` con labels `AREAS_LABEL`. onChange → `setAreaUna` + resetea `setPara('')` (L413). Default: primera área válida del usuario o `'imkt'` (L312). **Funcional.**

**R16 · Select "para" (rama no restringida, modo una)** — `id="rec-para"`, opción vacía `— elige —` + elegibles del área (`delArea(areaUna)`: activos, no pausados, distintos de mí — L326-329). onChange → `setPara` (L419). **Funcional.**

**R17 · Checkboxes de personas (modo varias)** — encabezado `personas · seleccionadas: {N}` (L429); lista scrolleable `max-h-44` con todos los `elegibles` mostrando `{nombre} {apellido} {nivel}`. onChange agrega/quita del array `seleccion` (L433-434). **Funcional.**

**R18 · Select "área destino" (modo area)** — `id="rec-area-grupo"`. onChange → `setAreaGrupo` (L445). Debajo, texto informativo exacto: **"— se creará una recurrente para cada una de las {N} persona(s) de {label} —"** (L448-450). **Funcional.**

**R19 · Select "frecuencia"** — `id="rec-frec"`, opciones `semanal|quincenal|mensual`. onChange → `setFrec(f)` y resetea `setDia(f === 'mensual' ? 28 : 1)` (L458). **Funcional.**

**R20 · Input date "fecha de la primera entrega" (solo quincenal)** — `id="rec-fecha-inicio"`, `type="date"`, `min={dx(0)}` (hoy). onChange → `setFechaInicio` (L468). Ayuda con texto exacto: **"después, cada 14 días desde esa fecha"** (L469). Default `dx(0)` (L317). Servidor revalida formato y que no sea pasada (`actions.ts:65-70`). **Funcional.**

**R21 · Select "día del mes / día de la semana" (semanal/mensual)** — `id="rec-dia"`, label dinámico exacto `día del mes` (mensual) o `día de la semana` (semanal). Opciones: 1-28 (mensual) o `lunes…viernes` (valores 1-5, L348, L476-477). onChange → `setDia(Number(...))` (L474). **Funcional.**

**R22 (=botones finales del modal crear):**
- **Botón "cancelar"** — onClick `onCerrar` (L486). **Funcional.**
- **Botón "crear recurrente"** — `data-testid="btn-crear-rec-confirmar"`, texto `crear recurrente` / `creando…` mientras `guardando` (disabled, L487-490). Acción: `guardar()` (L350-370):
  - Validaciones cliente con mensajes exactos: `el nombre es obligatorio` (L352); `falta destinatario` (modo una) / `selecciona al menos una persona` (otros modos) (L356); si >5 destinatarios, `confirm` nativo con texto exacto: **"vas a crear esta recurrente para {N} personas. ¿confirmas?\n\n{lista}\n\ncada una tendrá su propia recurrente independiente."** (L357-358); si la action falla: **"no se pudo crear — revisa el aviso"** (L369).
  - Resultado: server action `crearRecurrente` → `INSERT` en `recurrentes` de UNA fila POR destinatario (`actions.ts:108-121`), columnas: `nombre, descripcion, para, area, frecuencia, activa:true, creado_por` (derivado de sesión, L115), `dia_mes` (mensual) o `dia_semana` (semanal; quincenal lo deriva del ancla con `getUTCDay`, L71), `fecha_inicio` (solo quincenal, L118). Sin `grupo_id` (comentario L107: independientes, paridad SPA). No notifica (comentario de cabecera `actions.ts:5-7`).
  - Validaciones servidor (mensajes exactos, ver §6). Info generada: `{ creadas: N }` (L123, no se muestra al usuario).
- Evidencia: L350-370, 485-491; `actions.ts:34-127`. **Estatus: funcional.**

#### ModalEntregaInstancia (L498-529)
Título exacto: `marcar entregado · {nombre}`. Texto informativo exacto: **"entrega del {fecha} · la siguiente del patrón llegará en su fecha habitual. evidencia opcional."** (L508-510).

**R23 · Input "link de entrega (opcional)"** — `id="ent-link"`, placeholder `https://…`. onChange → `setLink` (L513). **Funcional.**

**R24 · Textarea "nota (opcional)"** — `id="ent-nota"`. onChange → `setNota` (L517). **Funcional.**

**R25 · Botón "cancelar"** — onClick `onCerrar` (L520). **Funcional.**

**R26 · Botón "marcar entregado ✓"** — `data-testid="btn-entrega-inst-confirmar"` (L521-524). Acción: `onConfirmar(link, nota)` → en el padre (L261-267):
- Si `esVirtual`: `entregarInstanciaVirtual({ recurId, fecha, link, nota })` → lee el patrón (`recurrentes` SELECT, `actions.ts:169`) y hace `INSERT` en `peticiones` de una fila ya `estatus:'entregado'` con `zona:'general'`, `prioridad:'media'`, `privada:false`, `origen_recur`, `link_entrega`/`nota_entrega` (trim o null), `fecha_entrega: hoyISO()` (`actions.ts:173-188`). Error posible exacto: **"no se encontró la recurrente origen"** (L171). RLS que la respalda (comentario L160): `peticiones_insert` con `origen_recur` no nulo AND `para = mi_nombre()` (o creador) — **pendiente de validación** SQL.
- Si NO es virtual (instancia materializada): `entregarPeticion({ id, link, nota })` → `UPDATE peticiones SET estatus='entregado', link_entrega, nota_entrega, fecha_entrega=hoyISO()` (`peticiones/actions.ts:361-370`); si RLS niega: **"no puedes cambiar el estatus de esta petición"** (L372).
- Sin validaciones cliente (link/nota opcionales, sin formato). Sin notificación (comentario `recurrentes/actions.ts:158`). **Estatus: funcional.**

#### ModalMover (L532-592)
Título exacto: `mover entrega · {nombre}`. Contexto: **"para {para} · fecha original de esta entrega: {fecha}"** + si virtual: **"(aún virtual — se materializa al moverla)"** (L546-549). Banner informativo exacto: **"ℹ la siguiente entrega del patrón llegará en su fecha habitual"** (L573-575).

**R27 · Input date "nueva fecha"** — `id="mi-fecha"`, `min={dx(0)}`, valor inicial sugerido = fecha de la instancia +2 días (cálculo L537: `new Date(t.fecha+'T00:00:00')` local → `toISOString().slice(0,10)`; posible corrimiento de día en TZ UTC+, ver §7.9). onChange → `setFecha` (L552). **Funcional.**

**R28 · Textarea "motivo (obligatorio)"** — `id="mi-motivo"`, placeholder exacto: `ej: {para} está enferma esta semana` (L557), ayuda exacta: **"mínimo 10 caracteres · {para} verá este motivo"** (L558). onChange → `setMotivo` (L556). **Funcional.**

**R29/R30 · Radios "¿cuenta como entrega a tiempo?"** (grupo `mi-justif`) — opciones con texto exacto: **"sí · causa justificada"** (L564-565, `setJustif(true)`) y **"no · cuenta contra la fecha original"** (L568-569, `setJustif(false)`). Default: sí (L540). Afecta `extension_justificada` (usada por `labelFecha` para "entregada · Nd tarde", `lib/peticiones.ts:182`). **Funcional.**

**R31 · Botón "cancelar"** — onClick `onCerrar` (L578). **Funcional.**

**R32 · Botón "mover entrega"** — `data-testid="btn-mover-inst-confirmar"` (L579-586). Validaciones cliente con mensajes exactos: **"el motivo debe tener al menos 10 caracteres"** (L581), **"la nueva fecha es igual a la actual. elige otra"** (L582). Acción: `onConfirmar` → en el padre (L274-281) llama `moverInstancia` de `peticiones/actions.ts:474-560`:
- Virtual → `INSERT` en `peticiones` de fila `pendiente` con `fecha: nuevaFecha`, `fecha_original: fechaInstancia`, `motivo_cambio_fecha`, `extension_justificada`, `origen_recur`, `cambio_visto_por_creador:true` (L531-547). Real → `UPDATE` con `fecha`, `fecha_original: t.fecha_original || t.fecha`, motivo, justificada (L500-506).
- Validaciones servidor (mensajes exactos): "selecciona una nueva fecha" (L485), "el motivo debe tener al menos 10 caracteres" (L486), "no puedes mover la entrega a una fecha que ya pasó" (L487), "no se encontró esa instancia" (L493), "esta no es una instancia recurrente" (L494), "solo el creador o dirección puede mover una instancia" (L496, L528), "la nueva fecha es igual a la actual" (L498), "no se pudo mover (RLS)" (L508), "no se encontró la recurrente origen" (L526), "falta la recurrente origen" (L523).
- Info generada: notificación `fecha_cambiada` al destinatario: **"{yo} movió tu entrega de \"{nombre}\""** con detalle **"del {fechaCorta} al {fechaCorta} · motivo: {motivo}"** + sufijo **" · cuenta contra la fecha original"** si no justificada (L511-518 y 550-556, vía helper `notificar`).
- **Estatus: funcional.**

**R33 · (conteo)** Los 33 handlers de `recurrentes-client.tsx`: R1-R7 (7) + ModalShell ×3 (overlay, stopPropagation, ✕ — L291/293/296) + crear: nombre, desc, radios modo, select para-restringida, select área, select para, checkboxes varias, select área-grupo, select frecuencia, date inicio, select día, cancelar, crear (13) + entrega: link, nota, cancelar, confirmar (4) + mover: fecha, motivo, radio sí, radio no, cancelar, confirmar (6) = **33**. ✔ coincide con lo esperado.

### 2.B — TodosClient (handlers)

**T1 · Formulario "agregar" (onSubmit)**
- Pantalla: /todos. Elementos: input `id="todo-input"` placeholder exacto `agregar tarea personal…` (onChange → `setTexto`, L85 — **T2**) + botón submit texto exacto `agregar` (`data-testid="btn-agregar-todo"`, L87).
- Acción: submit → `agregar(e)` (L34-41): `preventDefault`; si `!texto.trim()` retorna silenciosamente (sin mensaje); llama server action `crearTodo({ texto })`.
- Resultado: `INSERT INTO todos (user_nombre, texto, hecho:false)` con `user_nombre` derivado de la sesión en servidor (`todos/actions.ts:25-29`, comentario L26 "derivado de la sesión"). Al éxito limpia el input y recarga.
- Validaciones servidor (mensajes exactos): "sin sesión" (L16), "tu cuenta no está ligada a una persona del equipo" (L19), "escribe la tarea" (L23), o `error.message` de Supabase (L30).
- Mensajes al usuario: banner `aviso` (L73-77). Evidencia: `todos-client.tsx:34-41, 79-91`; `todos/actions.ts:12-35`. **Estatus: funcional.**

**T3 · Botón check (marcar hecho/pendiente)**
- Texto: `✓` (visible solo si hecho; si no, `text-transparent`), `data-testid="todo-check"`, `aria-label` exacto: `marcar pendiente` / `marcar hecho` (L104).
- Acción: clic → `toggle(t)` (L44-47): `UPDATE todos SET hecho=!t.hecho WHERE id=...` **client-side** con anon+RLS, y actualización optimista del estado local.
- Validaciones: ninguna; **el error de Supabase se ignora** (no se lee el resultado) → si RLS/red falla, la UI muestra el cambio igual (ver §7.7). Permisos: RLS `todos_*_own` (filas propias; comentario L43; **pendiente de validación** SQL).
- Estados: hecho → card `opacity-60` + texto `line-through` (L103, L122). Evidencia: L44-47, 104-107. **Estatus: funcional con hueco de manejo de errores.**

**T4 · Doble clic en el texto (editar)** — `data-testid="todo-texto"`, `onDoubleClick` → `setEditando(t.id)` + `setTextoEdit(t.texto)` (L121). Mobile: doble tap poco fiable en touch; además existe T6 como alternativa, pero T6 está oculto sin hover (ver §7.8). **Funcional (con fricción en touch).**

**T5 · Input de edición inline** — `data-testid="todo-edit-input"`, `autoFocus`; 3 handlers: onChange → `setTextoEdit` (L114), onBlur → `guardarEdicion(t)` (L115), onKeyDown → Enter guarda / Escape cancela (L116).
- `guardarEdicion` (L48-54): trim; si vacío o igual, solo cierra edición (sin guardar, sin aviso); si cambió → `UPDATE todos SET texto=... WHERE id=...` client-side + estado local. Error de Supabase ignorado (igual que T3). **Funcional con hueco de manejo de errores.**

**T6 · Botón "editar"** — texto exacto `editar`, `data-testid="btn-editar-todo"` (L126-129). Clic → mismo efecto que T4. Estados: `opacity-0 group-hover:opacity-100` → invisible hasta hover (problema touch, §7.8). **Funcional.**

**T7 · Botón borrar "✕"** — texto `✕`, `data-testid="btn-borrar-todo"` (L130-133). Clic → `borrar(id)` (L55-58): `DELETE FROM todos WHERE id=...` client-side + quita del estado local. **SIN confirmación** y con error ignorado (§7.7). También `opacity-0 group-hover:opacity-100`. **Funcional, sin confirm.**

Conteo todos-client: 7 elementos interactivos (T1-T7), con 9 handlers de evento si se cuentan los 3 del input de edición por separado (onChange/onBlur/onKeyDown, L114-116) y el onChange del input de alta.

---

## Motor de recurrentes (lib/recurrentes.ts)

**Modelo**: las instancias son VIRTUALES — se calculan al vuelo y solo se materializan como fila de `peticiones` al **entregar** (`entregarInstanciaVirtual`) o al **mover** (`moverInstancia` rama virtual) (comentario L1-3). Id virtual determinista: `rec__{recurId}__{fecha}` (`idVirtual`, L167).

**Aritmética de fechas** (L67-74): días julianos UTC (`aDias` = `Date.UTC(...)/86400000`), `sumarDias`, `diffDias`, `dowDe` (getUTCDay del `YYYY-MM-DDT00:00:00Z`). `hoyEngine()` (L74): medianoche LOCAL → ISO (ver §7.9).

**`proximaFecha(r)`** (L87-101) — próxima ocurrencia del patrón:
- mensual: `dia_mes` del mes en curso; si ya pasó, mes siguiente (L89-93).
- quincenal CON `fecha_inicio`: `proximaOcurrenciaQuincenal(ancla, hoy)` (L94-96) con fórmula exacta (L77-81): `k = d<=0 ? 0 : ceil(d/14)`; resultado `ancla + 14k`. Hoy cuenta si toca.
- semanal Y quincenal legacy sin ancla: próximo `dia_semana` con `diff = ((diaSemana - hoy.getDay()) + 7) % 7` (hoy cuenta; L97-100). ⇒ **una quincenal legacy se comporta como semanal** (paridad SPA, comentario L17-18 y L86).

**`siguienteOcurrencia(fecha, r)`** (L105-113) — avance cuando la actual ya se entregó: mensual `+1 mes` (setMonth), quincenal real `+14d`, semanal/legacy `+7d`.

**`esOcurrenciaEnFecha(r, fecha)`** (L117-125): inactiva → false; mensual `day(fecha)===dia_mes`; quincenal real `(fecha-ancla) >= 0 && %14===0`; resto `dow(fecha)===dia_semana`. Es la "fuente única de verdad" espejada por la función SQL del cron (comentario L115-116).

**`calcularFechasEsperadas(r, hoy?, semanasAtras=12)`** (L131-163): ventana `[hoy-84d, hoy]` para cumplimiento/gamificación (consumida por `lib/gamificacion.ts:340`). Mensual: cursor UTC hacia atrás mes a mes; quincenal real: serie desde el ancla `+14`; semanal/legacy: última ocurrencia `hoy - ((dow(hoy)-diaSemana+7)%7)` retrocediendo `paso` (14 legacy / 7 semanal). Comentario L128-130: el bug de la SPA (ancla implícita "hoy" que desfasaba qué semanas tocan) "muere aquí" para quincenales reales.

**`obtenerInstanciasRecur({recurrentes, peticiones, personas, nombre})`** (L170-240) — instancias visibles de una persona:
1. Si la persona no existe, está inactiva o pausada (`estaPausada`: `pausadaHasta && hoy <= pausadaHasta`, `lib/peticiones.ts:297`) → lista vacía (L179-181).
2. Por cada patrón activo cuyo `para` haga `matchNombre` (normalización sin acentos, `lib/peticiones.ts:300-303`):
   - `fechaR = proximaFecha(r)`; busca "instancia efectiva": fila de `peticiones` con `origenRecur === r.id` y (`fecha === fechaR` **o** `fechaOriginal === fechaR`) — así una instancia MOVIDA "tapa" su fecha original y no genera virtual fantasma (L185-186).
   - Si esa instancia está entregada/archivada → avanza a `siguienteOcurrencia` y re-busca UNA vez (L197-200).
   - Si hay instancia pendiente → la devuelve real (`esVirtual:false`); si la re-buscada también está entregada → omite el patrón (L202-204); si no hay → construye la **virtual** con `id = idVirtual(...)`, `estatus:'pendiente'`, `prioridad:'media'`, `privada:false`, `zona:'general'` y todos los demás campos de Peticion en null/[] (L206-236).
3. Devuelve máximo 1 instancia por patrón.

**Mover instancia** (resumen; código en `peticiones/actions.ts:474-560`): virtual → INSERT materializado `pendiente` con `fecha_original = fecha de la ocurrencia` y motivo; real → UPDATE conservando `fecha_original` primigenio (`t.fecha_original || t.fecha`). Ambos notifican `fecha_cambiada` al destinatario. La ocurrencia SIGUIENTE del patrón no se altera (banner del modal, client L573-575).

**Pausar**: `activa=false` (R6) hace que `obtenerInstanciasRecur` (L189) y el cron ignoren el patrón; `proximaFecha` en la tabla se sigue mostrando (columna "próxima" no se condiciona a `activa`, client L195). Pausa de PERSONA (`pausada_hasta`) también suprime instancias (L181) y avisos del cron.

**Recordatorios (cron)** — `notificar_recurrentes_del_dia()` (`supabase/migrations/20260703230500_cutover_recordatorio_recurrentes.sql:34-106`), programado por `20260703231000` como job `recordatorio-recurrentes-diario`, schedule `0 13 * * *` UTC (CLAUDE.md):
- `hoy = (now() AT TIME ZONE 'America/Mexico_City')::date` (L41).
- Recorre patrones activos con persona activa/no pausada (L48-54). "Ocurre hoy" espeja el motor cliente (L57-65: mensual `day=dia_mes`; quincenal con ancla `(hoy-fecha_inicio)>=0 y %14=0`, legacy por `dow`; semanal por `dow`).
- No avisa si la ocurrencia de hoy está "resuelta" (entregada/archivada o movida a otra fecha, L68-74); SÍ avisa por instancias reales pendientes con `fecha=hoy` (cubre movidas HACIA hoy, L77-84).
- Dedupe en tabla `recurrentes_avisos` PK `(recurrente_id, fecha)` (L23-28, `on conflict do nothing` L87) — sin RLS policies ni grants de API (L31-32). Inserta en `notificaciones` con título exacto `↻ hoy toca "{nombre}"` y detalle `entrega recurrente de hoy · creada por {creado_por}` (L89-96). SECURITY DEFINER, `search_path=''`, EXECUTE revocado a public/anon/authenticated (L37-38, L108).

---

## Validaciones y mensajes exactos

### Cliente — recurrentes-client.tsx
| Dónde | Condición | Mensaje exacto |
|---|---|---|
| guardar L352 | nombre vacío | `el nombre es obligatorio` |
| guardar L356 | sin destinatarios | `falta destinatario` (una) / `selecciona al menos una persona` (resto) |
| guardar L357-358 | >5 destinatarios | confirm: `vas a crear esta recurrente para {N} personas. ¿confirmas?\n\n{lista}\n\ncada una tendrá su propia recurrente independiente.` |
| guardar L369 | action falló | `no se pudo crear — revisa el aviso` |
| mover próxima L209 | sin instancia | `no hay una entrega pendiente próxima de {para} (¿pausada/inactiva?)` |
| eliminar L223 | confirm | `¿eliminar esta recurrente?` |
| ModalMover L581 | motivo <10 chars | `el motivo debe tener al menos 10 caracteres` |
| ModalMover L582 | fecha igual | `la nueva fecha es igual a la actual. elige otra` |
| vacíos | — | `no tienes entregas recurrentes próximas` (L122) · `sin recurrentes` (L238) · `solo {creadoPor} edita` (L231) |

### Servidor — recurrentes/actions.ts
| Línea | Condición | Mensaje exacto |
|---|---|---|
| 25 | sin user | `sin sesión` |
| 28 | sin fila personas | `tu cuenta no está ligada a una persona del equipo` |
| 30 | `!yo.activo` | `cuenta archivada` |
| 55 | `!puedeCrearRecurrentes` | `no tienes permiso para crear recurrentes` |
| 58 | nombre vacío | `el nombre es obligatorio` |
| 60 | frecuencia fuera de {semanal,quincenal,mensual} | `frecuencia inválida` |
| 66 | quincenal sin fechaInicio o formato ≠ `\d{4}-\d{2}-\d{2}` | `elige la fecha de la primera entrega` |
| 69 | `fechaInicio < hoyISO()` | `la primera entrega no puede ser una fecha pasada` |
| 73 | mensual dia∉[1,28] · semanal dia∉[1,5] | `día inválido` |
| 75 | modo ∉ MODOS_RECUR | `modo inválido` |
| 77 | modo admin-only sin isAdmin | `ese modo de asignación es solo para dirección/heads` |
| 80 | área ∉ AREAS_VALIDAS | `área inválida` |
| 88 | no privilegiada y modo≠una | `como jefa directa solo puedes crear recurrentes de una en una, para tu equipo` |
| 92 | no privilegiada y para ∉ supervisadas | `solo puedes crear recurrentes para las personas a tu cargo` |
| 99 | sin destinatarios | `falta destinatario` |
| 103 | destinatario inexistente/no disponible/yo mismo | `destinatario inválido: {d}` |
| 136 | toggle sin filas (RLS) | `solo el creador o dirección pueden pausar/activar` |
| 150 | delete sin filas (RLS) | `solo el creador o dirección pueden eliminar` |
| 171 | recurrente origen no encontrada | `no se encontró la recurrente origen` |
| catch-all | excepción | `error inesperado` (L125, 139, 153, 192) |

### Servidor — todos/actions.ts
`sin sesión` (L16) · `tu cuenta no está ligada a una persona del equipo` (L19) · `escribe la tarea` (L23) · `error inesperado` (L33). Cliente todos: sin mensajes propios (alta vacía retorna en silencio, `todos-client.tsx:36`); textos de vacío: `tu lista está vacía` / `agrega tareas personales que solo tú podrás ver` (L97-98), `cargando…` (L94).

### moverInstancia / entregarPeticion (peticiones/actions.ts, usadas por este módulo)
Ver R32 y R26 — mensajes listados ahí (L485-528, L372).

---


---

# MÓDULOS: EQUIPO (`/equipo`), ORGANIGRAMA (`/organigrama`) y RH (`/rh`)

## Inventario de elementos interactivos

Conteo: **35 elementos con handler en `equipo-client.tsx`** (EquipoClient: 8 · ModalPersona: 13 · ModalReasignacion: 7 · ModalToque: 7), **1 en `rh-lista.tsx`**, **1 Link en `organigrama-view.tsx`**. Total inventariado: **37**.

### 2.A — EquipoClient (pantalla principal `/equipo`)

#### A1. Botón "+ agregar persona"
- **Pantalla/Sección**: /equipo · header derecha.
- **Nombre visible exacto**: `+ agregar persona`.
- **Tipo**: botón (`data-testid="btn-agregar-persona"`).
- **Objetivo**: abrir el modal de alta de persona.
- **Acción del usuario**: click.
- **Resultado**: `setModalPersona({ editar: null })` (L172) → abre `ModalPersona` en modo alta. No escribe en Supabase por sí mismo.
- **Validaciones**: ninguna al abrir.
- **Info requerida**: ninguna.
- **Info generada**: estado local `modalPersona`.
- **Dependencias**: `ModalPersona`.
- **Permisos**: solo se renderiza si `dir` (L171: `{dir && (...)}`) — dirección (`es_direccion` flag o `nivel='ceo'`).
- **Estados**: sin estado propio.
- **Errores posibles**: n/a.
- **Mensajes**: n/a.
- **Mobile**: header con `flex items-center justify-between`; sin breakpoints específicos (pendiente de validación visual).
- **Evidencia**: `equipo-client.tsx` L171-176.
- **Estatus**: funcional.

#### A2. Botones de filtro "activas" / "pausadas" / "inactivas"
- **Pantalla/Sección**: /equipo · nav bajo el header.
- **Nombre visible exacto**: `activas`, `pausadas`, `inactivas` (literal del array, L191).
- **Tipo**: 3 botones tipo pill (generados en un map — 1 handler).
- **Objetivo**: filtrar la lista de personas por estado.
- **Acción del usuario**: click.
- **Resultado**: `setFiltro(f)` (L192); la lista se recalcula client-side (L89-92: `activas` = `activo !== false && !estaPausada`, `pausadas` = `activo !== false && estaPausada`, `inactivas` = `activo === false`). Sin llamada a Supabase.
- **Validaciones / Info requerida**: ninguna.
- **Permisos**: visible para todo quien entre a /equipo (head/dirección/jefa directa), pero cada quien solo ve sus `visibles` (L84-87).
- **Estados**: activo se pinta `border-movdi-naranja text-movdi-naranja` (L193).
- **Mensajes**: si la lista queda vacía: **"nadie en esta vista"** (L202); mientras carga: **"cargando…"** (L200).
- **Mobile**: pills en `flex gap-2`; ok en ancho reducido (pendiente de validación visual).
- **Evidencia**: L190-197, L89-92.
- **Estatus**: funcional.

#### A3. Botón "⚡ toque" (por tarjeta de persona)
- **Pantalla/Sección**: /equipo · tarjeta de persona.
- **Nombre visible exacto**: `⚡ toque`.
- **Tipo**: botón (`data-testid="btn-toque"`).
- **Objetivo**: abrir el modal para enviar una notificación de ánimo.
- **Acción**: click → `setModalToque(p)` (L237).
- **Resultado**: abre `ModalToque`; el envío real ocurre en el modal (ver D6).
- **Permisos (condicional exacto)**: se renderiza si `p.activo !== false && p.id !== yo.id` (L235) — NO hay check de rol en el botón; el gating real está en el server action `darToque` (actions.ts L281-287: dirección a cualquiera; no-dirección solo si `dest.manager_principal === yo.nombre || (dest.managers ?? []).includes(yo.nombre)`; mensaje si no: **"solo puedes dar toques a las personas a tu cargo"**). Nota: como `visibles` para no-dirección ya filtra a su gente (L84-87), en la práctica un head solo ve tarjetas de su equipo.
- **Estados / Errores / Mensajes**: ver D1-D7 (ModalToque) y darToque.
- **Mobile**: botonera `flex flex-wrap gap-1.5` (L234) — envuelve.
- **Evidencia**: L235-241.
- **Estatus**: funcional.

#### A4. Botón "editar" (por tarjeta)
- **Nombre visible exacto**: `editar`.
- **Tipo**: botón (`data-testid="btn-editar-persona"`).
- **Objetivo**: abrir `ModalPersona` en modo edición.
- **Acción**: click → `setModalPersona({ editar: p })` (L247).
- **Resultado**: abre modal precargado; el guardado llama `editarPersona` (server action, ver §3/§4).
- **Permisos**: dentro de `{dir && (...)}` (L242) y solo si `p.activo !== false` (L244) — solo dirección, solo personas activas.
- **Evidencia**: L246-250.
- **Estatus**: funcional.

#### A5. Botón "▶ reanudar" (por tarjeta, persona pausada)
- **Nombre visible exacto**: `▶ reanudar`.
- **Tipo**: botón (`data-testid="btn-reanudar"`).
- **Objetivo**: quitar la pausa antes de la fecha `pausada_hasta`.
- **Acción**: click → `confirm()` nativo con texto exacto **"¿reanudar a {nombre} antes de tiempo?"** (L254); si acepta → `accion(() => reanudarPersona({ id: p.id }))` (L255).
- **Resultado (código+tabla)**: server action `reanudarPersona` (actions.ts L172-183): `UPDATE personas SET pausada_hasta = null WHERE id = …` (L175-176) con sesión de dirección; luego `recargar()` re-lee personas/peticiones/recurrentes (L155).
- **Validaciones**: server: gating `getAdminContexto` (solo dirección).
- **Errores/mensajes**: `error.message` de Supabase o **"no se pudo reanudar (RLS)"** si el update no devolvió filas (L178); errores de contexto: **"sin sesión"**, **"tu cuenta no está ligada a una persona del equipo"**, **"cuenta archivada"**, **"solo dirección puede gestionar personas"** (actions.ts L21-31). Se pintan en el banner `aviso`.
- **Permisos**: dirección + condicional `estaPausada(p)` (L251, helper `lib/peticiones.ts` L297: `!!p.pausadaHasta && hoyISO() <= p.pausadaHasta`).
- **Evidencia**: L251-259; actions.ts L172-183.
- **Estatus**: funcional.

#### A6. Botón "⏸ pausar" (por tarjeta, persona no pausada)
- **Nombre visible exacto**: `⏸ pausar`.
- **Tipo**: botón (`data-testid="btn-pausar"`).
- **Objetivo**: pausar (p. ej. vacaciones) hasta una fecha.
- **Acción**: click → `prompt()` nativo con texto exacto **"¿hasta cuándo pausar a {nombre}? (AAAA-MM-DD)"** y default `dx(30)` (hoy+30 días, `lib/peticiones.ts` L162-166) (L263); si escribe fecha → `pausarPersona({ id, hasta })` (L265).
- **Resultado**: `UPDATE personas SET pausada_hasta = '<hasta>' WHERE id = …` (actions.ts L162-163).
- **Validaciones**: server: regex `/^\d{4}-\d{2}-\d{2}$/` (actions.ts L161) → error exacto **"usa AAAA-MM-DD (ej: 2026-06-15)"**. No valida que sea fecha futura ni fecha real (p. ej. `2026-13-99` pasa el regex) — ver §7.
- **Info requerida**: fecha AAAA-MM-DD.
- **Errores/mensajes**: los de A5 + **"no se pudo pausar (RLS)"** (L165).
- **Permisos**: dirección, persona activa no pausada.
- **Evidencia**: L261-269; actions.ts L158-170.
- **Estatus**: funcional (con validación de fecha débil).

#### A7. Botón "desactivar" (por tarjeta)
- **Nombre visible exacto**: `desactivar`.
- **Tipo**: botón (`data-testid="btn-desactivar"`).
- **Objetivo**: baja lógica de la persona conservando histórico.
- **Acción del usuario**: click. Lógica (L273-283): calcula client-side `pets` = peticiones de la persona con `estatus !== 'entregado'` y `recs` = recurrentes activas (L275-276). Si ambas listas vacías → `confirm()` con texto exacto **"¿desactivar a {nombre} {apellido}?\n\nsu histórico se conserva."** (L278) y llama `desactivarConReasignacion({ personaId })` directo. Si hay pendientes → abre `ModalReasignacion` (L282).
- **Resultado (código+tabla)**: server action `desactivarConReasignacion` (actions.ts L206-255) → `supabase.rpc('desactivar_persona_con_reasignacion', { p_persona_id, p_reasignar_peticiones_a, p_reasignar_recurrentes_a })` (L243-247). RPC SECURITY DEFINER transaccional "todo o nada" (comentario L198-205; migración `20260704120000_cutover_rpc_desactivar_persona`). Afecta `personas` (activo=false) y reasigna `peticiones`/`recurrentes` (detalle exacto dentro de la RPC — pendiente de validación en la migración).
- **Validaciones server (pre-RPC, actions.ts L215-241)**: persona existe (**"persona no encontrada"**); si tiene N peticiones sin destino → **"elige a quién reasignar las peticiones"**; recurrentes → **"elige a quién reasignar las recurrentes"**; destino debe existir, no ser la misma persona y estar `personaDisponible` (activo y no pausado, `lib/peticiones.ts` L298) → **"destino inválido: {nombre}"**.
- **Errores**: fallo de RPC → **"no se pudo completar — nada quedó desactivado: {error.message}"** (L249).
- **Permisos**: dirección (`{dir && ...}` L242 + `getAdminContexto` L212) y `p.id !== yo.id` (L271) — no puedes desactivarte a ti misma desde la UI (server no re-chequea esto — ver §7).
- **Evidencia**: L271-287; actions.ts L206-255.
- **Estatus**: funcional.

#### A8. Botón "reactivar" (por tarjeta, filtro inactivas)
- **Nombre visible exacto**: `reactivar`.
- **Tipo**: botón (`data-testid="btn-reactivar"`).
- **Acción**: click → `confirm()` exacto **"¿reactivar a {nombre} {apellido}?"** (L292) → `reactivarPersona({ id })` (L293).
- **Resultado**: `UPDATE personas SET activo = true WHERE id = …` (actions.ts L188-189).
- **Errores/mensajes**: los de A5 + **"no se pudo reactivar (RLS)"** (L191).
- **Permisos**: dirección; solo si `p.activo === false` (rama else L289).
- **Evidencia**: L289-298; actions.ts L185-196.
- **Estatus**: funcional.

### 2.B — ModalPersona (alta/edición) — `equipo-client.tsx` L381-495

#### B1. Overlay (fondo oscuro)
- **Tipo**: div clickeable (cierre). **Acción**: click fuera del diálogo → `onCerrar` → `setModalPersona(null)` (L408, L348). **Evidencia**: L408. **Estatus**: funcional.
#### B2. Contenedor del diálogo (stopPropagation)
- **Tipo**: div con `onClick={(e) => e.stopPropagation()}` (L410) para que el click dentro no cierre. `role="dialog"` `aria-label` "editar persona"/"agregar persona". **Estatus**: funcional (técnico, no accionable).
#### B3. Botón "✕" (cerrar)
- **Nombre visible**: `✕`. **Acción**: `onCerrar` (L413). **Estatus**: funcional.
#### B4. Input "nombre"
- **Label exacto**: `nombre` (`id="per-nombre"`, autoFocus). **Acción**: tipear → `setNombre` (L419). **Validación**: requerido (cliente L478 y servidor actions.ts L48). **Estatus**: funcional.
#### B5. Input "apellido"
- **Label exacto**: `apellido` (`id="per-apellido"`). `setApellido` (L423). Requerido (mismas validaciones). **Estatus**: funcional.
#### B6. Input "rol"
- **Label exacto**: `rol`, placeholder exacto **"ej: project manager"** (`id="per-rol"`). `setRol` (L429). Requerido. **Estatus**: funcional.
#### B7. Input "correo"
- **Label exacto**: `correo`, `type="email"`, placeholder exacto **"nombre@movdi.mx"** (`id="per-email"`). `setEmail` (L433). **Validación**: OPCIONAL; si viene, servidor valida `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` (actions.ts L15, L51-53) → **"revisa el formato del correo (ej: nombre@movdi.mx)"**. Se normaliza `trim().toLowerCase()` (L62). Sin email NO hay invite de Auth (L103). **Estatus**: funcional (ver hallazgo §7 sobre persona sin cuenta).
#### B8. Select "área principal"
- **Label exacto**: `área principal` (`id="per-area"`). Opciones: `AREAS_VALIDAS` = `['imkt','pm','legal','admi','ventas','digital','rh']` con labels `IMKT, P.Mgrs, Legal, Admi, Ventas, Digital, RH` (`lib/peticiones.ts` L69-73). Default `'imkt'` en alta (L394). `setArea` (L439). Server valida pertenencia → **"área inválida"** (actions.ts L54). **Estatus**: funcional.
#### B9. Select "nivel de acceso"
- **Label exacto**: `nivel de acceso` (`id="per-nivel"`). Opciones visibles: `ejecutivo`, `head`, `dirección` (value `ceo`), `RH` (value `rh`) (L446-449). Server valida contra `NIVELES = ['ejecutivo','head','ceo','rh']` → **"nivel inválido"** (actions.ts L16, L55). **Estatus**: funcional.
#### B10. Select "manager principal"
- **Label exacto**: `manager principal` (`id="per-manager-principal"`). Opción vacía exacta: **"— sin manager principal —"**; candidatos = **cualquier persona ACTIVA** (L405, cambio 2026-07-20; antes solo ceo|head — comentario L402-404: los poderes de jefa se derivan de la relación, no del nivel). Guarda por NOMBRE (`value={p.nombre}`, L457). **Estatus**: funcional.
#### B11. Checkboxes "managers de apoyo"
- **Label exacto**: `managers de apoyo`. Lista scrolleable (`max-h-32 overflow-y-auto`) de checkboxes por candidato activo (L462-470); `setApoyo` agrega/quita nombres (L466). Server filtra al principal de la lista de apoyo (`payloadPersona` L63: `managers.filter(m => m !== managerPrincipal)`). **Estatus**: funcional.
#### B12. Botón "cancelar"
- **Nombre visible**: `cancelar`. `onCerrar` (L474). **Estatus**: funcional.
#### B13. Botón "agregar e invitar" / "guardar cambios"
- **Nombre visible exacto**: en alta **"agregar e invitar"**, en edición **"guardar cambios"**, durante guardado **"guardando…"** (L488, `data-testid="btn-guardar-persona"`, `disabled={guardando}`).
- **Acción**: click → validación cliente: si falta nombre/apellido/rol → err exacto **"completa nombre, apellido y rol"** (L478). Luego `onGuardar(...)` → `accion(() => editar ? editarPersona({...datos, id}) : crearPersona(datos))` (L349-356).
- **Resultado alta** (`crearPersona`, actions.ts L81-136): `INSERT INTO personas` con payload `{nombre, apellido, rol, email, areas, nivel, needs_pass, managers, manager_principal}` (L61-79, L88) + si hay email: `admin.auth.admin.inviteUserByEmail(email)` con service_role (L105-106) + `UPDATE personas SET auth_user_id = <invitado.user.id> WHERE id = <nueva.id>` con la SESIÓN de dirección (L121-123). Detalle: nivel `rh` → `needs_pass=true` y área `'rh'` añadida a las áreas (L64-67).
- **Resultado edición** (`editarPersona`, actions.ts L138-156): `SELECT` de la fila (L144), `UPDATE personas SET <payload> WHERE id` (L149). NO reenvía invite ni toca `auth_user_id`.
- **Errores/mensajes exactos**: duplicado 23505 → **"ese correo ya está registrado en personas"** (L90); genérico `error.message`; edición: **"persona no encontrada"** (L146), **"no se pudo actualizar (RLS)"** (L151). Avisos amarillos de alta parcial (retornan ok:true + aviso): **"{email} ya tenía cuenta en Auth — no se envió invitación (se vinculará al iniciar sesión)"** (L113); **"persona creada, pero la invitación no se pudo enviar: {mensaje}. reintenta desde editar o avisa a dirección"** (L115); **"persona creada e invitada; el vínculo de su cuenta quedó pendiente y se completará en su primer inicio de sesión"** (L125); **"persona creada, pero la invitación no se pudo enviar: {error}"** (L129). Si el modal recibe ok=false: err local **"no se pudo guardar — revisa el aviso"** (L485).
- **Estados**: `guardando` deshabilita el botón (L475, L487 `disabled:opacity-50`).
- **Mobile**: modal `max-h-[90vh] overflow-y-auto` (L409) — scrollea en pantallas chicas; grids de 2 columnas fijas (`grid-cols-2`, sin breakpoint).
- **Evidencia**: L475-489; actions.ts L81-156.
- **Estatus**: funcional. Ojo: el aviso "reintenta desde editar" es engañoso — `editarPersona` NO reintenta el invite (ver §7).

### 2.C — ModalReasignacion — `equipo-client.tsx` L498-567

#### C1. Overlay → `onCerrar` (L516). Funcional.
#### C2. Contenedor stopPropagation (L518), `role="dialog"` `aria-label="desactivar a {nombre}"`. Funcional (técnico).
#### C3. Botón "✕" → `onCerrar` (L521). Funcional.
#### C4. Select "reasignar peticiones a"
- **Label exacto**: `reasignar peticiones a` (`id="reasign-pet"`). Opción vacía: **"— elige una persona —"**. Candidatos: activos, no pausados, distintos de la persona, orden alfabético (L511-513). Si no tiene peticiones, hint exacto: **"no tiene peticiones, este campo es opcional"** (L539). **Evidencia**: L534-540. Funcional.
#### C5. Select "reasignar recurrentes a"
- **Label exacto**: `reasignar recurrentes a` (`id="reasign-rec"`). Igual que C4; hint: **"no tiene recurrentes, este campo es opcional"** (L547). **Evidencia**: L541-548. Funcional.
#### C6. Botón "cancelar" → `onCerrar` (L551). Funcional.
#### C7. Botón "reasignar y desactivar"
- **Nombre visible exacto**: `reasignar y desactivar` (`data-testid="btn-reasign-confirmar"`, fondo `bg-red-600`).
- **Validación cliente**: con peticiones y sin destino → **"elige a quién reasignar las peticiones"** (L555); con recurrentes y sin destino → **"elige a quién reasignar las recurrentes"** (L556) — mismos textos que el server (actions.ts L229, L232).
- **Acción/Resultado**: `onConfirmar(destPet, destRec)` → `desactivarConReasignacion({ personaId, reasignPeticionesA, reasignRecurrentesA })` (L366-371) → RPC transaccional (ver A7). Banner informativo del modal (texto exacto, L524-530): **"⚠ requiere reasignación"** / **"{nombre} tiene · N petición(es) activa(s) · N recurrente(s) activa(s). elige a quién pasan antes de desactivar — todo o nada."**
- **Evidencia**: L552-561. **Estatus**: funcional. Nota: NO hay `confirm()` adicional en esta ruta — el click ejecuta la desactivación (ver §7).

### 2.D — ModalToque — `equipo-client.tsx` L573-620

#### D1. Overlay → `onCerrar` (L584). Funcional.
#### D2. Contenedor stopPropagation (L586), `role="dialog"` `aria-label="dar toque"`. Funcional (técnico).
#### D3. Botón "✕" → `onCerrar` (L589). Funcional.
#### D4. Radios de presets (5 opciones, 1 handler)
- **Textos exactos** (`TOQUE_PRESETS`, L20-26): "¡vas muy bien, sigue así! 💪" · "ánimo con esta semana ⚡" · "gran trabajo con tus entregas 🙌" · "cuenta conmigo si necesitas apoyo 🤝" · "recta final — tú puedes 🚀".
- **Acción**: seleccionar → `setPreset(t); setCustom('')` (L598). El seleccionado se marca solo si no hay texto custom (L596-597). **Evidencia**: L595-601. Funcional.
#### D5. Input "o escribe el tuyo (máx. 60)"
- **Label exacto**: `o escribe el tuyo (máx. 60)` (`id="toque-custom"`, `maxLength={60}`), placeholder exacto **"ej: ese cliente difícil no te merece 😄"**. `setCustom` (L607). El mensaje final es `custom.trim() || preset` (L581). Funcional.
#### D6. Botón "cancelar" → `onCerrar` (L610). Funcional.
#### D7. Botón "enviar toque ⚡"
- **Nombre visible exacto**: `enviar toque ⚡` / durante envío **"enviando…"** (`data-testid="btn-toque-enviar"`, `disabled={enviando}`).
- **Acción/Resultado**: `onEnviar(mensaje)` (L612) → `darToque({ para: nombre, mensaje })` (L337) → server action (actions.ts L262-293) → `notificarToque` (`lib/supabase/notificar.ts` L73-110): con service_role (helper único) valida destinatario y hace `INSERT INTO notificaciones {para, tipo:'toque', titulo:'⚡ {de} te mandó un toque', detalle: mensaje, peticion_id: null}` (notificar.ts L101-107) con **límite 1/día por remitente-destinatario** (query previa por título exacto + `creada_en >= hoy`, L91-99).
- **Validaciones server (darToque)**: sesión y persona ligada (**"sin sesión"**, **"tu cuenta no está ligada a una persona del equipo"**, L266-269); mensaje no vacío → **"elige o escribe un mensaje de ánimo"** (L275); >60 chars → **"máximo 60 caracteres"** (L276); no-dirección solo a su gente → **"solo puedes dar toques a las personas a tu cargo"** (L286). En notificar.ts: **"las notificaciones no están configuradas en el servidor"** (L79), **"no se pudieron validar personas"** (L82), **"destinatario inválido"** (L85), auto-toque → **"el toque es para alguien más 😉"** (L86), **"no se pudo verificar el límite diario"** (L96), límite → **"ya le mandaste un toque hoy a {nombre} — mañana otro 💪"** (L98), **"no se pudo enviar el toque"** (L108).
- **Éxito**: nota amarilla exacta **"⚡ toque enviado a {nombre}"** (equipo-client L338); el modal se cierra siempre (L340). Subtexto informativo del modal (exacto, L591-593): **"un empujón de ánimo — {nombre} verá quién se lo manda · máx. 1 al día"**.
- **Evidencia**: L611-615; actions.ts L262-293; notificar.ts L73-110.
- **Estatus**: funcional.

### 2.E — RH (`rh-lista.tsx`)

#### E1. Botón toggle "ocultar/mostrar entregadas"
- **Pantalla/Sección**: /rh · encima de la lista.
- **Nombre visible exacto**: `🙈 ocultar entregadas (N)` / `👁 mostrar entregadas (N)` (L22).
- **Tipo**: botón (`data-testid="btn-rh-toggle-entregadas"`). Único handler del archivo.
- **Objetivo**: filtro de vista sobre peticiones entregadas.
- **Acción**: click → `setOcultarEntregadas(v => !v)` (L18). Sin escritura a Supabase (comentario L6-8: "el toggle es un filtro de vista, no escribe nada").
- **Permisos**: página solo rh/dirección (guard en page.tsx L17-20); el botón solo aparece si `entregadas > 0` (L16).
- **Mensajes exactos vacío**: ocultando → **"sin pendientes — todo entregado 🎉"**; sin datos → **"no hay peticiones del área RH visibles para ti"** (L28).
- **Evidencia**: L16-24, L26-29.
- **Estatus**: funcional.

### 2.F — Organigrama (`organigrama-view.tsx`)

#### F1. Link "editar en equipo →"
- **Nombre visible exacto**: `editar en equipo →` (`data-testid="link-editar-equipo"`).
- **Tipo**: `<Link href="/equipo">` de Next (navegación, no handler de estado).
- **Permisos**: solo si `puedeEditarEquipo` (view L79; calculado en page.tsx L35-36: dirección, head o jefa directa). RH/admi sin gente a cargo no lo ven (comentario page.tsx L33-34).
- **Evidencia**: view L79-87.
- **Estatus**: funcional.
- El resto del organigrama es 100% presentacional (tarjetas `data-testid="org-card"`, badges "dir", "⏸ en pausa · {fecha}", chips de apoyo "⋯ {nombre}") — sin handlers. Estatus: decorativo/informativo por diseño.

---

## Lógica de negocio

### 5.1 Flujo de alta completo (`crearPersona`, actions.ts L81-136)
1. `getAdminContexto()` — sesión + fila propia + activo + dirección (L18-34).
2. `validarDatos` (L47-57): nombre/apellido/rol obligatorios; email opcional pero con formato; área ∈ AREAS_VALIDAS; nivel ∈ NIVELES.
3. `payloadPersona` (L61-79): email trim+lowercase o null; managers de apoyo excluyen al principal; nivel rh → `needs_pass=true` y áreas = existentes ∪ {área elegida, 'rh'}; otros niveles → `areas=[área]` (una sola).
4. `INSERT INTO personas ... .select()` (L88) — 23505 → "ese correo ya está registrado en personas".
5. Si hay email: `inviteUserByEmail` con service_role (L106). Degradaciones con gracia (ok:true + aviso): usuario ya existente en Auth (status 422 o mensaje `/already|registered|exists/i`, L108-114), fallo de envío (L115), excepción (L128-130).
6. Si el invite devolvió user.id: `UPDATE personas SET auth_user_id` con sesión de dirección (L121-123); si falla, aviso de vínculo pendiente (L125) — se autocura en el primer login (policy `personas_self_link`).
7. Sin email: la persona se crea SIN cuenta ni invite (L103 condiciona todo a `payload.email`).

### 5.2 Managers / manager_principal
- Modelo: `manager_principal` (string, nombre de pila) = línea sólida; `managers` (array de nombres) = apoyos. Mapeo en `mapPersonaConManagers` (`lib/equipo.ts` L9-27: `managers: r.managers ?? []`, `managerPrincipal: r.manager_principal ?? null`).
- La relación se compara por nombre: igualdad estricta en filtros de UI (`===`, equipo-client L86, lib/equipo.ts L76/L87) y normalizada (`normalizarTexto`: lowercase+trim+sin acentos, lib/peticiones.ts L300-303) en organigrama y en darToque (`matchNombre`).
- Candidatos a manager: cualquier persona activa desde 2026-07-20 (equipo-client L401-405).
- `bloquesEquipo` (lib/equipo.ts L65-99): elegibles = ejecutivo|rh|head activos, distintos de yo (L69-74; excluye nivel ceo del semáforo). Dirección → bloques "mi equipo directo" (principal=yo) + "resto del equipo"; head/jefa → "mi equipo directo" + "🤝 soy apoyo" (en managers sin ser principal); otros → `[]` (el aside no se pinta, equipo-client L309).
- Semáforo (`calcularSemaforo`, lib/equipo.ts L36-53): tareas = peticiones no entregadas no-recurrentes de la persona + instancias recurrentes pendientes; `r` si hay vencidas (diasHasta<0), `y` si hay entregas ≤7 días, `g` si tiene tareas al corriente, `x` sin tareas. Orden r→y→g→x, luego por total desc (L55-58).
- Métricas de actividad (equipo-client L110-134): "última actividad" = max(updated_at|created_at) de peticiones donde participa (trigger condicional de BD, comentario L105-109 — "SIN tracking de presencia ni geolocalización"); "respuesta prom." = promedio en días de (fecha_entrega − creada) de sus entregadas con dato.

### 5.3 Áreas y niveles disponibles
- Áreas: `['imkt','pm','legal','admi','ventas','digital','rh']` (`lib/peticiones.ts` L69). Labels L70-73 (incluye `heads: 'Heads'` como label extra no seleccionable como área).
- Niveles: `['ejecutivo','head','ceo','rh']` (actions.ts L16); en UI `ceo` se muestra como "dirección" (equipo-client L215, L448).

### 5.4 Organigrama — construcción del árbol (`construirOrganigrama`, lib/equipo.ts L119-154)
- Solo personas activas (L123). Mapa por nombre normalizado (L126-134). Apoyos del nodo = managers menos el principal y menos vacíos (L132).
- Raíces = personas con `es_direccion` (cada una su propio árbol, L140). Cada no-dirección cuelga de `manager_principal` (lookup normalizado, L141-142); si no existe o es ella misma → `sinAsignar` (detector de datos incompletos, L143).
- Sin profundidad fija; orden alfabético estable por nivel (L147-152).
- Render: árbol CSS `.orgchart` de globals.css (comentario view L5-7), scroll horizontal en móvil (view L107). Mensajes exactos de "sin asignar": ✓ **"todas las personas activas tienen manager principal."** (L121) / ⚠ **"estas personas activas no tienen manager principal válido — revisa su ficha en equipo."** (L125).

---

## Validaciones y mensajes exactos (consolidado)

### Validaciones cliente (equipo-client.tsx)
- ModalPersona L478: nombre/apellido/rol no vacíos → "completa nombre, apellido y rol".
- ModalPersona L485: fallo del server action → "no se pudo guardar — revisa el aviso".
- ModalReasignacion L555-556: destinos obligatorios si hay pendientes.
- ModalToque: `maxLength={60}` en el input (L605); mensaje = custom.trim() || preset (L581, nunca vacío desde la UI).
- Confirms/prompts nativos: "¿reanudar a {nombre} antes de tiempo?" (L254) · "¿hasta cuándo pausar a {nombre}? (AAAA-MM-DD)" (L263) · "¿desactivar a {nombre} {apellido}?\n\nsu histórico se conserva." (L278) · "¿reactivar a {nombre} {apellido}?" (L292).

### Validaciones servidor (actions.ts)
- getAdminContexto: "sin sesión" (L21) · "tu cuenta no está ligada a una persona del equipo" (L24) · "cuenta archivada" (L26) · "solo dirección puede gestionar personas" (L31).
- validarDatos: "completa nombre, apellido y rol" (L49) · "revisa el formato del correo (ej: nombre@movdi.mx)" (L52) · "área inválida" (L54) · "nivel inválido" (L55).
- crearPersona: "ese correo ya está registrado en personas" (L90) + 4 avisos de invite (L113, L115, L125, L129 — texto completo en §2.B13).
- editarPersona: "persona no encontrada" (L146) · "no se pudo actualizar (RLS)" (L151).
- pausarPersona: "usa AAAA-MM-DD (ej: 2026-06-15)" (L161) · "no se pudo pausar (RLS)" (L165).
- reanudarPersona: "no se pudo reanudar (RLS)" (L178). reactivarPersona: "no se pudo reactivar (RLS)" (L191).
- desactivarConReasignacion: "persona no encontrada" (L222) · "elige a quién reasignar las peticiones" (L229) · "elige a quién reasignar las recurrentes" (L232) · "destino inválido: {nombre}" (L237) · "no se pudo completar — nada quedó desactivado: {mensaje}" (L249).
- darToque: "sin sesión" (L266) · "tu cuenta no está ligada a una persona del equipo" (L269) · "elige o escribe un mensaje de ánimo" (L275) · "máximo 60 caracteres" (L276) · "solo puedes dar toques a las personas a tu cargo" (L286).
- notificarToque (notificar.ts): 7 mensajes (§2.D7).
- Fallback genérico en todas las actions: "error inesperado" (catch-all, p. ej. L134, L292); en `accion()` del cliente: `r.error ?? 'error'` (equipo-client L153).

### Mensajes informativos de UI
- /equipo: "cargando…" (L200) · "nadie en esta vista" (L202) · "⏸ pausada hasta {fecha}" (L231) · "⚡ toque enviado a {nombre}" (L338) · tooltips del semáforo: "con vencidas"/"entregas esta semana"/"al corriente"/"sin tareas activas" (L211) · "última actividad en OPS: …" con haceLabel "hoy"/"ayer"/"hace Nd"/"—" (L40-46).
- /rh: subtítulo "peticiones del área RH · acceso por nivel ({nivel}) verificado en servidor · las privadas solo las ven creador y destinatario" (page L35) · vacíos y toggle (§2.E1).
- /organigrama: intro L73-77, leyenda, mensajes de "sin asignar" (§5.4).

---


---

# MÓDULOS: PROGRESO / GAMIFICACIÓN (`/progreso`) y ESTRELLAS (`/estrellas`)

## Inventario de elementos interactivos

### PROGRESO — progreso-client.tsx (10 handlers)

**P1. Botón "marcar entregada ✓"**
- Pantalla/Sección: /progreso → "🎁 entrega de recompensas"
- Nombre visible EXACTO: `marcar entregada ✓` (línea 370)
- Tipo: botón (data-testid="btn-marcar-entregada")
- Objetivo: registrar que la recompensa física de un mes cerrado ya se entregó a la persona
- Acción del usuario: click sobre la fila pendiente
- Resultado: llama server action `marcarRecompensaEntregada({ id: h.id })` (progreso-client.tsx:365) → `UPDATE historial_mensual SET recompensa_entregada = true WHERE id = input.id` con `.select('id')` (actions.ts:133-134); luego `recargar()` (línea 367). La fila desaparece de "pendientes" y pasa al toggle de entregadas.
- Validaciones (servidor, actions.ts:126-141): sesión válida y ligada a persona (getYo, actions.ts:78-86); rol `rh` O dirección (actions.ts:129-131); si el UPDATE no devuelve filas → error (línea 136). Respaldo BD: grant de columna (solo `recompensa_entregada` es actualizable por API, migración 20260705190000 líneas 81-82) + policy `hist_update` rh/dirección (líneas 84-88).
- Info requerida: id de la fila de historial_mensual (implícito del render)
- Info generada: `recompensa_entregada=true` en la fila
- Dependencias: historial_mensual con filas `recompensa != null && !recompensaEntregada`
- Permisos/roles: sección visible solo `(soyRH || veTodo)` (progreso-client.tsx:340); servidor exige `yo.nivel==='rh'` o `esDireccion` (actions.ts:129-131)
- Estados: sin loading propio (no disabled durante el await)
- Errores posibles: "sin sesión", "tu cuenta no está ligada a una persona del equipo", "solo rh o dirección pueden marcar entregas", "no se encontró la fila (o sin permiso)", mensaje crudo de Supabase, "error inesperado" (actions.ts:81-84,131,135-136,139)
- Mensajes al usuario EXACTOS: el error se pinta en el aviso naranja superior (setAviso, progreso-client.tsx:366); no hay mensaje de éxito, solo recarga
- Mobile: fila con `flex flex-wrap` (línea 359); sin lógica mobile específica
- Evidencia: onClick progreso-client.tsx:364-368 → actions.ts:126-141
- Estatus: implementado y respaldado por RLS/grant

**P2. Toggle "👁 mostrar entregadas (N)" / "🙈 ocultar entregadas"**
- Pantalla/Sección: /progreso → "🎁 entrega de recompensas"
- Nombre visible EXACTO: `👁 mostrar entregadas (${entregadasLista.length})` u `🙈 ocultar entregadas` (línea 347)
- Tipo: botón toggle (data-testid="entregas-toggle")
- Objetivo: mostrar/ocultar el historial de recompensas ya entregadas
- Acción: click → `setMostrarEntregadas(v => !v)` (línea 345)
- Resultado: solo estado local; muestra hasta `ENTREGADAS_MAX = 20` filas (línea 164, render 374-381); si hay más: "mostrando las 20 más recientes de N entregadas" (líneas 382-385). Sin llamadas Supabase.
- Validaciones: se renderiza solo si `entregadasLista.length > 0` (línea 344)
- Permisos: dentro de sección `(soyRH || veTodo)` (línea 340)
- Errores: ninguno
- Mobile: flex-wrap; sin lógica específica
- Evidencia: progreso-client.tsx:344-349, 163-174, 374-386
- Estatus: implementado, solo presentación

**P3. Botón "cerrar {mesAnt} y generar recompensas"**
- Pantalla/Sección: /progreso → "📋 cierre de mes pendiente"
- Nombre visible EXACTO: `cerrar {mesAnt} y generar recompensas` (línea 460, ej. "cerrar 2026-06 y generar recompensas")
- Tipo: botón (data-testid="btn-cerrar-mes")
- Objetivo: archivar el mes ANTERIOR en historial_mensual (XP, nivel, entregas, cumplimiento, mejor racha, recompensa por persona)
- Acción: click → `confirm()` nativo con texto EXACTO: `¿cerrar el mes ${mesAnt}?\n\nse archivará el progreso de ${preview.length} personas. esta acción no se puede deshacer.` (línea 453); si acepta, llama `cerrarMes()` (línea 454) y `recargar()` (línea 457)
- Resultado (servidor, actions.ts:18-74): lee personas/peticiones/estrellas_colaboracion/recompensas/historial_mensual frescos (actions.ts:33-39); recalcula `calcularReporteCierre` EN EL SERVIDOR (el cliente no manda cifras, actions.ts:46-52); `INSERT` en `historial_mensual` una fila por persona con actividad: columnas `persona, mes, xp_total, nivel_alcanzado, entregadas, cumplimiento, mejor_racha, recompensa` (actions.ts:58-68)
- Validaciones: sesión + persona ligada (actions.ts:21-25); `esDireccion` (actions.ts:27-29); mes no cerrado previamente (`mesCerrado`, actions.ts:42-44); reporte no vacío (actions.ts:53-55). Respaldo BD: policy `hist_insert = mi_es_direccion()` (migración 20260703211000:46-49)
- Info requerida: ninguna del usuario (mes = `mesAnteriorStr()` derivado en servidor, actions.ts:31)
- Info generada: filas de historial_mensual (`recompensa_entregada` queda default false)
- Permisos: sección visible solo `soyDireccion && !cerrado && preview.length > 0` (línea 436); servidor exige dirección
- Estados: sin disabled/loading en el botón
- Errores EXACTOS: "sin sesión" · "tu cuenta no está ligada a una persona del equipo" · "solo dirección puede cerrar el mes" · `el mes ${mesAnt} ya fue cerrado anteriormente` · `no hay entregas registradas en ${mesAnt} para cerrar` · "no se pudo cerrar el mes: " + error.message (actions.ts:22,25,28,43,54,69)
- Mensaje de éxito EXACTO: `mes ${mes} cerrado ✓ · ${filas} persona(s) archivadas` (progreso-client.tsx:455, data-testid="cierre-ok")
- Mobile: sin lógica específica
- Evidencia: progreso-client.tsx:451-461 → actions.ts:18-74
- Estatus: implementado; idempotencia garantizada por chequeo `mesCerrado` (no hay unique constraint verificado en estas fuentes — pendiente de validación)

**P4. Botón "←" (mes anterior del historial)**
- Sección: "📚 meses cerrados"
- Nombre visible EXACTO: `←` (aria-label="mes anterior", data-testid="hist-mes-anterior")
- Tipo: botón de navegación
- Acción: click → `setMesHistSel(mesesHistorial[idxMesHist + 1])` (línea 476); `mesesHistorial` está ordenado desc (línea 148), así que +1 = mes más viejo
- Resultado: cambia el mes mostrado en `filasMesHist` (líneas 153-156); solo estado local
- Validaciones: `disabled={idxMesHist >= mesesHistorial.length - 1}` (línea 475) — no pasa del más antiguo
- Permisos: sección visible si `historialVisible.length > 0` (línea 465); qué filas ve cada rol: `veTodo || soyRH || h.persona === yo.nombre` (línea 144)
- Estados: disabled con `disabled:opacity-30`
- Evidencia: progreso-client.tsx:474-479
- Estatus: implementado, solo presentación

**P5. Botón "→" (mes siguiente del historial)**
- Nombre visible EXACTO: `→` (aria-label="mes siguiente", data-testid="hist-mes-siguiente")
- Acción: `setMesHistSel(mesesHistorial[idxMesHist - 1])` (línea 485); `disabled={idxMesHist <= 0}` (línea 484)
- Resto idéntico a P4. Evidencia: progreso-client.tsx:483-488. Estatus: implementado.

**P6. Toggle "🙈 ocultar entradas" / "👁 mostrar (N)" del historial**
- Nombre visible EXACTO: `🙈 ocultar entradas` / `👁 mostrar (${filasMesHist.length})` (línea 491)
- Tipo: botón toggle (data-testid="hist-toggle")
- Acción: `setOcultarHistorial(v => !v)` (línea 489); si oculto, no se renderiza la lista (condición `!ocultarHistorial`, línea 495)
- Resultado: solo estado local. Evidencia: progreso-client.tsx:489-493, 495-514. Estatus: implementado.

**P7. Select "nivel" del editor de catálogo**
- Sección: "🎁 catálogo…" → `EditorCatalogo` ("✏️ editar catálogo (admin)")
- Nombre visible EXACTO: label `nivel` (id="cat-nivel"), opciones `nivel 1`…`nivel 5` (líneas 553-557)
- Tipo: select
- Acción: onChange → `elegirNivel(Number(e.target.value))` (línea 554): setea nivel y sincroniza desc/activa con la recompensa existente de ese nivel (líneas 541-546). Comentario explícito: sin useEffect a propósito para no pisar lo tecleado (líneas 538-540)
- Permisos: solo se renderiza si `veTodo && yo.nombre === 'Dani'` (líneas 392, 409)
- Evidencia: progreso-client.tsx:541-546, 553-557. Estatus: implementado, solo estado local.

**P8. Input "recompensa" del editor**
- Nombre visible EXACTO: label `recompensa` (id="cat-desc"); placeholder cuando el nivel no tiene recompensa: `— este nivel no tiene recompensa aún —` (línea 562)
- Tipo: input texto controlado; onChange → `setDesc(e.target.value)` (línea 561)
- Evidencia: progreso-client.tsx:559-563. Estatus: implementado.

**P9. Checkbox "activa" del editor**
- Nombre visible EXACTO: `activa` (línea 565-567)
- Tipo: checkbox controlado; onChange → `setActiva(e.target.checked)` (línea 566)
- Evidencia: progreso-client.tsx:565-567. Estatus: implementado.

**P10. Botón "guardar" del editor de catálogo**
- Nombre visible EXACTO: `guardar` / `guardando…` mientras corre (línea 577)
- Tipo: botón (data-testid="btn-guardar-recompensa"), `disabled={guardando}` (línea 568)
- Objetivo: crear/actualizar la recompensa asociada a un nivel del catálogo
- Acción: click → `guardarRecompensa({ nivel, descripcion: desc, activa })` (línea 571) → si hay recompensa de ese nivel: `UPDATE recompensas SET descripcion, activa WHERE id` (actions.ts:109-110); si no: `INSERT recompensas (nivel, descripcion, activa)` (actions.ts:113-114). Luego `onGuardado()` = recargar (línea 574)
- Validaciones (servidor, actions.ts:91-121): dirección (`esDireccion`, líneas 98-100); `nivel` entero 1-5 (líneas 102-104); descripción no vacía tras trim (línea 105). Respaldo BD: policy `recomp_write = mi_es_direccion()` for ALL (migración 20260703211000:61-64)
- Errores EXACTOS: "solo dirección puede editar el catálogo de recompensas" · "nivel inválido" · "escribe la recompensa" · error.message crudo de Supabase · "sin sesión" / "tu cuenta no está ligada…" vía getYo (actions.ts:99,103,105,111,115)
- Permisos: UI solo Dani (progreso-client.tsx:409); servidor/RLS aceptan cualquier dirección (Emmanuel podría invocar la action directamente — coherente con la decisión 4.8 documentada en actions.ts:88-90)
- Estados: guardando (disabled + texto)
- Mobile: `flex flex-wrap items-end gap-3` (línea 551)
- Evidencia: progreso-client.tsx:568-578 → actions.ts:91-121. Estatus: implementado.

Elementos NO interactivos destacados de /progreso (informativos): Coach MOVDI (sin handlers), card "mi progreso", listas de ritmo/leaderboard/logros/mis recompensas/historial. El `confirm()` de P3 es el único diálogo.

### ESTRELLAS — estrellas-client.tsx (8 handlers)

**E1. Botón "⭐ dar estrella (N)"**
- Pantalla/Sección: /estrellas → header
- Nombre visible EXACTO: `⭐ dar estrella (${restantes})` cuando restantes > 0; `⭐ dar estrella ` cuando restantes = 0 (línea 64)
- Tipo: botón (data-testid="btn-dar-estrella")
- Objetivo: abrir el modal para dar una estrella
- Acción: click → `setModalDar(true)` (línea 62)
- Resultado: renderiza `ModalDarEstrella` (líneas 136-151); sin llamada Supabase
- Dependencias: `restantes = Math.max(0, MAX_ESTRELLAS_SEMANA - dadasEstaSemana.length)` (línea 49) con `dadasEstaSemana = estrellas.filter(e => e.de === yo.nombre && e.semana === sem)` (línea 48)
- Permisos: cualquier usuario autenticado con persona ligada (no hay condicional de rol)
- Evidencia: estrellas-client.tsx:62-65. Estatus: implementado.

**E2. Overlay del modal (click fuera cierra)**
- Nombre visible: N/A (div overlay `fixed inset-0`)
- Tipo: onClick en el contenedor → `onCerrar` = `setModalDar(false)` (línea 178, prop en línea 141)
- Evidencia: estrellas-client.tsx:178, 141-142. Estatus: implementado.

**E3. stopPropagation del cuerpo del modal**
- Tipo: handler `onClick={(e) => e.stopPropagation()}` en el div interno (línea 180) — evita que el click dentro del modal lo cierre
- Evidencia: estrellas-client.tsx:179-180. Estatus: implementado (técnico, sin efecto visible propio).

**E4. Botón "✕" (cerrar modal)**
- Nombre visible EXACTO: `✕` (línea 183)
- Acción: click → `onCerrar` (cierra sin guardar). Evidencia: estrellas-client.tsx:183. Estatus: implementado.

**E5. Select "para" (destinatario)**
- Nombre visible EXACTO: label `para` (id="estrella-para"); opción por defecto `— elige a quién —` (línea 194); opciones `{p.nombre} {p.apellido}` (línea 195)
- Tipo: select controlado; onChange → `setPara(e.target.value)` (línea 193); `disabled={restantes === 0}`
- Dependencias/filtro de elegibles (líneas 167-170): todos MENOS yo, menos no disponibles (`personaDisponible` = activo y no pausada, lib/peticiones.ts:298), menos a quienes YA di estrella esta semana; orden alfabético por nombre
- Evidencia: estrellas-client.tsx:192-196, 167-170. Estatus: implementado.

**E6. Input "motivo (máx 60)"**
- Nombre visible EXACTO: label `motivo (máx ${MAX_MOTIVO})` = "motivo (máx 60)" (línea 199); placeholder EXACTO: `ej: me salvó con el cierre del cliente` (línea 201)
- Tipo: input texto, `maxLength={60}` (MAX_MOTIVO, lib/estrellas.ts:41), `disabled={restantes === 0}`; onChange → `setMotivo` (línea 202)
- Evidencia: estrellas-client.tsx:198-203. Estatus: implementado.

**E7. Botón "cancelar"**
- Nombre visible EXACTO: `cancelar` (línea 206)
- Acción: click → `onCerrar`. Evidencia: estrellas-client.tsx:206. Estatus: implementado.

**E8. Botón "dar estrella ⭐" (confirmar)**
- Nombre visible EXACTO: `dar estrella ⭐` / `dando…` mientras guarda (línea 220)
- Tipo: botón (data-testid="btn-dar-confirmar"), `disabled={guardando || restantes === 0}` (línea 207)
- Objetivo: insertar la estrella y notificar al receptor
- Acción del usuario: elegir destinatario + escribir motivo + click
- Validaciones CLIENTE (líneas 209-213): `!para` → "elige a quién darle la estrella"; `!motivo.trim()` → "escribe un motivo breve para la estrella"; `puedoDarEstrella` (lib/estrellas.ts:44-58) → razones EXACTAS: "no puedes darte una estrella a ti misma" (línea 52) · "ya diste tus 2 estrellas de esta semana" (línea 53) · `ya le diste una estrella a ${para} esta semana` (línea 55)
- Resultado (servidor, estrellas/actions.ts:15-75): re-lee personas, valida destinatario existente y activo → "destinatario inválido" (líneas 31-34); re-lee estrellas frescas de MI semana (líneas 37-40) y re-corre `puedoDarEstrella` (líneas 41-47); `INSERT estrellas_colaboracion (de_persona, para_persona, motivo, semana)` con `de_persona` y `semana` DERIVADOS EN SERVIDOR (líneas 49-54, comentarios anti-spoof líneas 3-6); luego notifica al receptor vía `notificarServidor` (helper service_role, líneas 61-70) con título EXACTO `${yo.nombre} te dio una estrella ⭐` y detalle `"${motivo}"` 
- Validaciones SERVIDOR adicionales: sesión (línea 19), persona ligada (línea 22), `!input.para` (línea 26), motivo vacío (línea 27), `motivo.length > MAX_MOTIVO` → "el motivo no puede pasar de 60 caracteres" (línea 28)
- Respaldo BD (RLS `estrellas_insert`, migración 20260703211000:24-43): `de_persona = mi_nombre()`, `para <> de`, count de mi semana < 2, sin repetir para_persona en la semana
- Info requerida: `para` (nombre), `motivo` (texto ≤60)
- Info generada: fila en estrellas_colaboracion + notificación tipo 'estrella'
- Errores EXACTOS servidor: "sin sesión" · "tu cuenta no está ligada a una persona del equipo" · "elige a quién darle la estrella" · "escribe un motivo breve para la estrella" · "el motivo no puede pasar de 60 caracteres" · "destinatario inválido" · razones de puedoDarEstrella · "no se pudo dar la estrella: " + error.message · "error inesperado" (actions.ts:19-73)
- Mensajes en UI: error de validación cliente en el modal (`err`, línea 204); si la action falla el aviso general de la página muestra el error (línea 145) y el modal muestra "no se pudo — revisa el aviso" (línea 217); en éxito, cierra el modal y recarga (líneas 146-147)
- Mensajes de cupo EXACTOS (línea 185-188, data-testid="estrellas-restantes"): `ya diste tus 2 estrellas de esta semana · se renuevan el lunes` · `te queda 1 estrella esta semana` · `te quedan 2 estrellas esta semana`
- Estados: guardando; disabled con restantes=0
- Mobile: modal `max-w-md` con padding, sin lógica específica
- Evidencia: estrellas-client.tsx:207-221 → estrellas/actions.ts:15-75; lib/estrellas.ts:44-58
- Estatus: implementado con triple validación (cliente + server action + RLS)

**Conteo del inventario: 10 elementos en progreso-client + 8 en estrellas-client = 18 handlers, todos cubiertos.**

---

## FÓRMULAS EXACTAS de gamificación

### 5.1 XP mensual — `calcularXPMes` (lib/gamificacion.ts:114-144)
Universo: peticiones donde `matchNombre(t.para, nombre)`, `estatus==='entregado'`, `t.fecha` dentro del mes (`desde = mes+'-01'`, `hasta = finDeMes(mes)`, líneas 117-121), EXCLUYENDO compromisos propios (línea 119 vía `sinCompromisosPropios`).
- **Entrega a tiempo: +10 XP** (línea 127; incluye "sin dato": si no hay `fechaEntrega` cuenta a tiempo — heurística, comentario línea 109 y `estadoPuntualidad` líneas 40-45)
- **Entrega tarde: +3 XP** (línea 126)
- **Anticipación: +3 XP** si `diasRetraso <= -3` (entregó 3+ días antes del límite; líneas 128-129, cálculo diasRetraso líneas 47-52)
- **Estrella recibida en el mes: +15 XP** cada una (líneas 131-132; filtro `e.para === nombre && creadaEn.slice(0,7) === mes`)
- **Bono de cumplimiento mensual** (líneas 134-138): 0 si no entregó nada ese mes; `cumplimiento === 100` → **+40**; `>= 90` → **+20**; `>= 80` → **+10**; menos → 0
- `xpTotal = xpBase + bonusAnticipacion + xpEstrellas + bonoCumplimiento` (línea 140)
- Puntualidad medida contra `fechaLimiteParaPuntualidad` (líneas 34-38): la fecha vigente, SALVO `extensionJustificada === false` con `fechaOriginal` → se mide contra la original.
- Los meses archivados en historial_mensual NO se recalculan (comentario línea 113).

### 5.2 Niveles — `NIVELES` (líneas 17-23) y `nivelDesdeXP` (25-29)
| Nivel | XP mín | Nombre |
|---|---|---|
| 1 | 0 | en arranque |
| 2 | 100 | constante |
| 3 | 265 | confiable |
| 4 | 370 | referente |
| 5 | 480 | élite MOVDI |
`calcularGamePersona` (146-167): `xpParaSiguiente = siguienteNivel.xpMin - xpTotal`; `progresoNivel = round(((xp - nivelActual.xpMin)/(sig.xpMin - actual.xpMin))*100)`, 100 en nivel máximo (líneas 152-156).

### 5.3 Rachas (líneas 68-91)
- `calcularRachaActual` (68-78): mis peticiones no-archivadas (sin compromisos propios), ordenadas por `fecha` DESC; cuenta 'entregado' consecutivos desde la más reciente; se ROMPE con la primera no entregada (pendiente/en curso, cualquier estatus ≠ entregado). Nota: la ruptura es por estatus, no por "retraso" (los textos de logros dicen "sin retraso", el código solo mira estatus — ver §7).
- `calcularMejorRacha` (80-91): mismo universo ordenado ASC; máximo de entregados consecutivos históricos; cualquier no-entregada reinicia el contador a 0.

### 5.4 Cumplimiento % — `calcularStatsPersona` (líneas 185-207) con QUIRKS del SPA conservados a propósito (comentario 181-184)
- `entregadas` = mis entregadas del rango (fecha dentro de desde/hasta)
- **QUIRK 1**: `aTiempo = entregadas.length` y `tarde = 0` SIEMPRE (líneas 198-199) — las entregas tarde NO restan el %.
- **QUIRK 2**: `pendientesVencidas` = mis no-entregadas/no-archivadas con `fecha < hoy` SIN filtrar por el rango (líneas 201-203) — las vencidas ACTUALES castigan el % de cualquier periodo.
- `porcentaje = total === 0 ? 0 : round((aTiempo / (entregadas + pendientesVencidas)) * 100)` (líneas 204-205).

### 5.5 Leaderboard — `calcularLeaderboardMes` (líneas 210-232)
- Candidatos: `competeEnLeaderboard` (excluye ceo/rh/Salvador/Arylene/inactivos, líneas 171-178); si `soloEquipo`: `managerPrincipal === soloEquipo || managers.includes(soloEquipo)` (líneas 222-225, comparación EXACTA de string, sin matchNombre)
- Solo quienes tienen `total > 0` en el mes (línea 229)
- Orden: `porcentaje` DESC, empate por `entregadas` DESC (línea 230).

### 5.6 Reconocimientos del mes — `calcularReconocimientosMes` (líneas 234-266), solo visibles con veTodo
- ⚡ "más entregas del mes": persona con más entregas, mínimo **5** (líneas 253-256); valor `${n} peticiones`
- 🎯 "sin reabrir": persona con más entregas entre quienes tienen ≥**5** — como `reabiertas` no se rastrea, SIEMPRE se otorga y coincide con "más entregas" (líneas 257-260, valor fijo "100% sin reabrir"; ver §7)
- 🔥 "racha más larga": mejor `rachaActual`, mínimo **5** (líneas 261-264); valor `${n} entregas seguidas`.

### 5.7 Logros — 37 en total: 21 originales + 16 de la ampliación 4.11 (LOGROS, líneas 393-440); stats en `calcularLogros` (446-535)
Volumen (entregadas totales históricas, sin compromisos propios, líneas 462-464): primera entrega ≥1 · 10 · 25 · 50 · centenario 100 · 200 · leyenda 500 · mítico 1000 (líneas 394-399, 417-418).
Racha (mejorRacha): 5 · 10 · 20 · 30 · 50 · 100 (líneas 400-403, 420-421).
Calidad: "sin reabrir" 💎 = `entregadasTotales >= 10 && reabiertas === 0` — `reabiertas = 0` hardcodeado "sin histórico de cambios de estatus (paridad)" (línea 466) ⇒ en la práctica se desbloquea con 10 entregas (línea 404).
Velocidad: "anticipado" ≥5 entregas con `diasRetraso <= -3` (línea 405, stat línea 483) · "adelantado crónico" ≥15 (línea 406) · "mes puntual" 🎯 = MES ANTERIOR con ≥5 entregas con dato de puntualidad y 0 tardes (línea 407; cálculo líneas 485-488).
Colaboración: "primera estrella" ≥1 recibida total (línea 408) · "querido del equipo" ≥5 recibidas EN EL MES ACTUAL (línea 409, stat línea 480) · "el que apoya" ≥10 dadas totales (línea 410) · "5/10/25 estrellas" recibidas totales (líneas 431-433).
Especial: "variedad" ≥3 áreas distintas con entregas (línea 411, stat 465) · "todólogo" ≥5 áreas (línea 412) · "mes perfecto" 🏆 = mes ANTERIOR con ≥3 peticiones y 0 vencidas sin entregar (línea 413; cálculo líneas 472-476) · "constancia" 🏛️ = `nivel_alcanzado >= 3` en ≥2 meses CERRADOS del historial (línea 414, stat 482).
Podio (solo meses CERRADOS, vía RPC): "oro del mes" 🏅 = 1er lugar ≥1 vez (`podios[i].personas[0]` con matchNombre, línea 423, stat 493) · "de podio" 🎖️ = top 3 ≥1 vez (línea 424, stat 494).
Consistencia: "trío perfecto" 💯 = ≥3 meses cerrados propios con `cumplimiento === 100` (línea 426, stat 497) · "semestre perfecto" 🏵️ = ≥6 (línea 427).
Puntualidad: "reloj suizo" ⏱️ = ≥3 meses puntuales SEGUIDOS hacia atrás desde el mes anterior, ventana máx 12 meses, cada mes exige ≥5 entregas con dato y 0 tardes; corta al primer mes que no cumple (línea 429; loop líneas 501-510).
Reconocimiento (módulo feedback, badges sin XP — anti-farmeo, línea 434): "primer 🙌 dado" ≥1 firmado (los anónimos no cuentan: se filtra por `autorId === yo.id`, progreso-client.tsx:107) · "primer 🙌 recibido" ≥1 (`destinatarioId === yo.id`, línea 108) · "10 reconocimientos" recibidos ≥10 (líneas 435-437).
Recurrentes: "ritmo impecable" 🥁 = TODAS mis recurrentes activas al 100% en ventana de 4 semanas, exige ≥1 recurrente y `total > 0` en cada una (línea 439; cálculo líneas 514-518).
Evaluación: `desbloqueados = LOGROS.filter(criterio)` con try/catch por logro (línea 532); bloqueados se pintan "🔒 ???" con title "sigue participando para desbloquearlo" (progreso-client.tsx:307-311).

### 5.8 Cumplimiento de recurrentes — `calcularCumplimiento` (líneas 333-366)
- Ventana: `calcularFechasEsperadas(recur, hoy, semanasAtras)` — 12 semanas en "mi ritmo" (progreso-client.tsx:122), 4 semanas para "ritmo impecable" (gamificacion.ts:515)
- El conteo empieza en la PRIMERA entrega real; si no hay entregas, solo fechas con instancia registrada (líneas 344-351)
- Instancias archivadas se saltan (línea 358); entregada suma; con instancia no entregada = 'pendiente' (marca tarde:true en el detalle); sin instancia = 'no_registrada' (cuenta en el total sin sumar) (líneas 356-362)
- `porcentaje = round(entregadas/total*100)`, 0 si total 0 (línea 364). `tarde` es `const = 0` (línea 354, nunca reportado >0).

### 5.9 Estrellas de colaboración (lib/estrellas.ts)
- **Límite: MAX_ESTRELLAS_SEMANA = 2** (línea 40); **MAX_MOTIVO = 60** (línea 41)
- Semana ISO 8601 lunes-domingo, el jueves define el año, formato `YYYY-Www` (`semanaActual`, líneas 28-38) — la MISMA definición que valida la RLS (comentario líneas 2-3)
- `puedoDarEstrella` (44-58), razones en orden: (1) no a mí mismo, (2) `mias.length >= 2` en la semana, (3) ya le di a esa persona esta semana
- Validación en 3 capas: cliente (estrellas-client.tsx:209-213), server action con datos frescos (estrellas/actions.ts:37-47) y RLS `estrellas_insert` (count < 2 + not exists por persona-semana + de=mi_nombre + para<>de, migración 20260703211000:24-43; la RLS es "el respaldo final (p.ej. carrera entre dos inserts)", estrellas/actions.ts:56-57)
- Valor en XP: +15 por estrella recibida en el mes (gamificacion.ts:131-132; mostrado en header de /estrellas: `+{recibidasMes.length * 15} XP`, estrellas-client.tsx:59).

### 5.10 Podio — RPC `podio_mes_cerrado` (migración 20260705190000:92-109)
- `security definer`, `search_path = ''`; EXECUTE revocado a public/anon, concedido a authenticated
- Devuelve jsonb con top **3** filas de `historial_mensual` del mes pedido (o, por default, el último mes cerrado ANTERIOR al mes actual en zona `America/Mexico_City`), orden `xp_total desc`, exponiendo solo `persona, cumplimiento, mes`
- Consumo: progreso-client.tsx:75-82 (una llamada por mes del historial, máx 12); fallback local si todas vacían: top 3 por `xp_total` de las filas visibles (líneas 83-90) — para roles sin flag ese fallback solo ve filas propias.

### 5.11 Cierre de mes / historial_mensual
- `calcularReporteCierre` (gamificacion.ts:298-328): por persona que compite → `calcularGamePersona` del mes + stats del rango + `calcularMejorRacha` (histórica completa, no del mes — línea 322) + `recompensaParaNivel`; filtra `entregadas > 0` (línea 326); orden XP desc (línea 327)
- El servidor recalcula todo y hace el INSERT (progreso/actions.ts:46-68); mes objetivo SIEMPRE `mesAnteriorStr()` (actions.ts:31; gamificacion.ts:99-102)
- `mesCerrado` = existe alguna fila del mes en historial (gamificacion.ts:294)
- Los valores archivados jamás se recalculan ni editan por API (solo `recompensa_entregada`; grant de columna, migración 20260705190000:78-82).

### 5.12 Recompensas
- Catálogo: tabla `recompensas` (id, nivel, descripcion, activa — mapRecompensaRow, gamificacion.ts:277-279); una por nivel 1-5 (guardarRecompensa upsert manual por nivel, actions.ts:107-116)
- Se GANAN al cierre de mes: `recompensaParaNivel(recompensas, nivelAlcanzado)` — la recompensa activa del nivel alcanzado (gamificacion.ts:289-292) queda escrita en `historial_mensual.recompensa` (actions.ts:66)
- El equipo NO ve el catálogo (RLS `recomp_select = mi_ve_gamificacion()`); cada quien descubre la suya al ganarla en su fila de historial (comentario migración 20260705190000:12-14; texto UI progreso-client.tsx:395-397)
- Entrega física manual por RH/dirección (§2 P1).

### 5.13 EXCLUSIONES (anti-farmeo, Fase compromisos)
- `esCompromisoPropio` (lib/peticiones.ts:204-209): `origen === 'propio'` o `matchNombre(creadoPor, para)`; las instancias recurrentes (`origenRecur` presente) NUNCA son compromiso propio (línea 207) — sí cuentan en gamificación
- `sinCompromisosPropios` (gamificacion.ts:64-65) filtra en las funciones base: rachas (69, 81), XP (119), stats/% (191), logros (461) — cubre leaderboard, bono, cierre y reconocimientos por composición (comentario 54-63)
- Consecuencia: los compromisos propios ni suman XP/entregas/rachas NI restan cumplimiento al vencerse
- No compiten: ceo, rh, Salvador, Arylene, inactivos (gamificacion.ts:171-178)
- Entregas viejas sin `fechaEntrega`: no penalizan (cuentan a tiempo, +10) — `estadoPuntualidad` → 'sin_dato' (gamificacion.ts:42, 127)
- Reconocimientos (🙌 del módulo feedback) NO dan XP, solo badges (comentario gamificacion.ts:434).

---

## Validaciones y mensajes exactos

### Server actions — progreso/actions.ts
- "sin sesión" (22, 81)
- "tu cuenta no está ligada a una persona del equipo" (25, 84)
- "solo dirección puede cerrar el mes" (28)
- `el mes ${mesAnt} ya fue cerrado anteriormente` (43)
- `no hay entregas registradas en ${mesAnt} para cerrar` (54)
- "no se pudo cerrar el mes: " + error.message (69)
- "solo dirección puede editar el catálogo de recompensas" (99)
- "nivel inválido" — Number.isInteger y rango 1-5 (102-104)
- "escribe la recompensa" — descripción vacía tras trim (105)
- "solo rh o dirección pueden marcar entregas" (131)
- "no se encontró la fila (o sin permiso)" (136)
- "error inesperado" (catch genérico: 72, 119, 139)

### Server action — estrellas/actions.ts
- "sin sesión" (19) · "tu cuenta no está ligada a una persona del equipo" (22)
- "elige a quién darle la estrella" (26) · "escribe un motivo breve para la estrella" (27)
- "el motivo no puede pasar de 60 caracteres" (28)
- "destinatario inválido" — no existe o `!activo` (34)
- Razones de puedoDarEstrella (lib/estrellas.ts:52-55): "no puedes darte una estrella a ti misma" · "ya diste tus 2 estrellas de esta semana" · `ya le diste una estrella a ${para} esta semana`
- "no se pudo dar la estrella: " + error.message (57) · "error inesperado" (73)

### UI /progreso (textos exactos)
- Éxito cierre: `mes ${mes} cerrado ✓ · ${filas} persona(s) archivadas` (455)
- Cierre hecho: `{mesAnt} ya está cerrado ✓ · N persona(s) archivadas. el cierre de {mes} estará disponible a partir del 1º del mes siguiente.` (422-425)
- Sin actividad: `no hay entregas registradas en {mesAnt} — no hay nada que archivar todavía.` (431-433)
- Cierre pendiente: `el mes {mesAnt} aún no se cierra. al cerrarlo se archivará el progreso de N persona(s) y M calificarán para recompensa.` (440-442)
- confirm(): `¿cerrar el mes ${mesAnt}?\n\nse archivará el progreso de ${preview.length} personas. esta acción no se puede deshacer.` (453)
- Vacíos: "no tienes recurrentes asignadas todavía" (250) · "aún no hay entregas suficientes este mes" (271) · "aún no ganas recompensas — al cerrar un mes con nivel suficiente, aparecerá aquí la sorpresa 🎁" (322) · "🎉 sin entregas pendientes" (355)
- Desglose XP: `base {xpBase} ({tarde} tarde) · anticipación +{n} · estrellas +{n} · bono cumplimiento +{n} · {n} entrega(s)` (212)
- Nivel máx: "nivel máximo 🎉" (225); barra: `{xpParaSiguiente} XP para nivel {n} · {nombre}` (222)
- Coach MOVDI (6 mensajes, prioridad fija retrasado > marcar > nivel > increíble > semana > bien; CoachMovdi 588-627):
  1. 🔥 (vencidas ≥ 3): "vas retrasado: **{n} tareas vencidas** — empieza por la más antigua y márcala al terminar." (595-598)
  2. 📌 (vencidas ≥ 1): "tienes **{n} con fecha vencida** — si ya la entregaste, recuerda marcar **✓ entregado** para que cuente en tu XP." (599-602)
  3. 🚀 (0 < xpParaSiguiente ≤ 30): "estás a **{n} XP** del nivel {n} · {nombre} — una entrega a tiempo te acerca." (603-606)
  4. ✨ (entregadas ≥ 5 y cumplimiento ≥ 90): "vas increíble: **{n} entregas** y **{n}%** de cumplimiento este mes. sigue así." (607-610)
  5. 🗓 (semana > 0): "esta semana traes **{n} entrega(s) programada(s)** — planéalas hoy y gana el bono de anticipación." (611-614)
  6. 🌿 (default): "vas bien — al corriente y sin vencidas[, y tus recurrentes van al **{n}%**]. sigue con tu ritmo." (615-618)
  Insumos del coach: vencidas/semana solo de peticiones NO recurrentes mías (`!t.origenRecur`, progreso-client.tsx:127-128).

### UI /estrellas (textos exactos)
- Contador header: `{n} recibida(s) en total · {n} este mes (+{n*15} XP)` (59)
- Cupo modal: "ya diste tus 2 estrellas de esta semana · se renuevan el lunes" / `te queda(n) N estrella(s) esta semana` (186-188)
- Vacíos: "aún no has recibido estrellas · cuando un compañero reconozca tu trabajo, aparecerá aquí" (80) · "aún no das estrellas · tienes 2 por semana" (111) · "todavía no hay estrellas en el equipo" (129)
- Overflow: `+ {n} más` (95)
- Error genérico modal: "no se pudo — revisa el aviso" (217)

---


---

# MÓDULOS: ANUNCIOS (`/anuncios`), FEEDBACK (`/feedback`), CLIENTES (`/clientes`) y CAMPANA (notificaciones)

## Inventario de elementos interactivos (57 en total: 18 + 11 + 22 + 6)

Leyenda de campos: **P**=pantalla/sección · **N**=nombre visible exacto · **T**=tipo · **O**=objetivo · **A**=acción usuario · **R**=resultado (código+tabla) · **V**=validaciones · **IR**=info requerida · **IG**=info generada · **D**=dependencias · **Perm**=permisos/roles · **E**=estados · **Err**=errores posibles · **M**=mensajes exactos · **Mob**=mobile · **Ev**=evidencia · **S**=estatus.

### 2.A ANUNCIOS — `anuncios-client.tsx` (18 elementos)

**A1. Botón "+ nuevo anuncio"**
- P: header de /anuncios · N: `+ nuevo anuncio` · T: button.
- O: abrir el modal de creación. A: click. R: `setModalCrear(true)` (solo estado local, sin Supabase).
- V/IR: ninguna. IG: modal visible. D: `puedeCrearAnuncios`.
- Perm: **solo se renderiza si `puedeCrearAnuncios(yo)`** = `['ceo','head','rh'].includes(p.nivel)` (lib/anuncios.ts:67-68); condicional de render en anuncios-client.tsx:64.
- E: siempre habilitado cuando visible. Err: n/a. M: n/a.
- Mob: botón `rounded-full` en header flex; sin manejo mobile específico (pendiente de validación visual).
- Ev: `AnunciosClient`, anuncios-client.tsx:64-69, `data-testid="btn-nuevo-anuncio"`. S: funcional.

**A2. Card de anuncio (click)**
- P: lista de anuncios · N: card con badge de tipo + título + extracto (`data-testid="card-anuncio"`) · T: `<article>` clickeable.
- O: abrir detalle. A: click en cualquier parte de la card. R: `setDetalle(a)` (local).
- V: la card solo existe para anuncios en `visibles` = `anunciosActivosPara(anuncios, yo)` (L40) — activos + no expirados + audiencia aplica (lib/anuncios.ts:83-84 → `anuncioAplicaA` L71-78, `anuncioExpirado` L80-81).
- IR: n/a. IG: modal detalle. D: datos de `anuncios` + `anuncios_vistos` cargados en `recargar()` (L23-33).
- Perm: cualquier autenticado cuya audiencia aplique. E: card con `opacity-70` y borde `border-neutral-800` si ya vista; borde `border-neutral-700` si no (L89). Indicador `estado-visto`: "leído ✓" (verde) / "● sin leer" (naranja) (L100-103).
- M en card: pie "`{creadoPor} · para {AUDIENCIAS_LABEL[a.audiencia]}`" + "` · expira YYYY-MM-DD`" o "` · no expira`" (L95-98).
- Mob: card block full-width; ok. Ev: anuncios-client.tsx:87-105. S: funcional.

**A3. Overlay del ModalDetalle (click fuera)**
- P: modal detalle · N: (sin texto; fondo `bg-black/60`) · T: div onClick.
- O/A/R: cerrar el modal (`onCerrar` → `setDetalle(null)`, L126). Perm: n/a. Ev: `ModalDetalle`, anuncios-client.tsx:157. S: funcional.

**A4. Contenedor interno del ModalDetalle (stopPropagation)**
- T: div onClick `e.stopPropagation()` — evita que un click dentro cierre el modal. Ev: anuncios-client.tsx:159. S: funcional (handler técnico, sin efecto de negocio).

**A5. Botón "✕" del ModalDetalle**
- N: `✕` · T: button · O/A/R: cerrar modal (`onCerrar`). Ev: anuncios-client.tsx:162. S: funcional.

**A6. Botón "cerrar" del ModalDetalle**
- N: `cerrar` · T: button · R: `onCerrar`. Ev: anuncios-client.tsx:192. S: funcional.

**A7. Botón "✓ marcar como visto"**
- P: modal detalle · N: `✓ marcar como visto` · T: button (`data-testid="btn-marcar-visto"`).
- O: registrar lectura. A: click. R: Server Action `marcarAnuncioVisto({anuncioId})` (actions.ts:81-99) → SELECT idempotente en `anuncios_vistos` (L85-88: si ya existe, `{ok:true}` sin duplicar; PK anuncio_id+persona_nombre) → INSERT `anuncios_vistos {anuncio_id, persona_nombre: yo.nombre}` (L90-93; `persona_nombre` derivado de sesión, comentario L92). Después `recargar()` y `setDetalle(null)` (client L127-130).
- V: sesión válida + persona ligada + activa (`getContexto`, actions.ts:13-23). IR: id del anuncio. IG: fila en `anuncios_vistos` (con `visto_en` por default de BD).
- D: RLS `anuncios_vistos_insert_self` (citada en comentario actions.ts:5; SQL no está en el repo → §8).
- Perm: **solo se renderiza si `!visto && !esCreador`** (client L193) — el creador no se marca visto a sí mismo.
- E: n/a (sin spinner propio). Err: errores de getContexto ("sin sesión" / "tu cuenta no está ligada a una persona del equipo" / "cuenta archivada") o `error.message` de Supabase → mostrados en el banner `aviso` (client L48, L72-76, role="alert").
- Mob: botón pill; modal `max-h-[90vh] overflow-y-auto` (L158) → scrolleable en pantallas chicas.
- Ev: anuncios-client.tsx:127-130+193-198; actions.ts:81-99. S: funcional.

**A8. Botón "archivar"**
- P: modal detalle · N: `archivar` · T: button (`data-testid="btn-archivar-anuncio"`).
- O: baja lógica del anuncio. A: click → `confirm()` nativo con texto EXACTO: `¿archivar este anuncio?\n\ndejará de aparecer en el tablón. esta acción no se puede deshacer.` (client L132). R: Server Action `archivarAnuncio({id})` (actions.ts:67-79) → UPDATE `anuncios SET activo=false WHERE id=…` con `.select()` (L71-72).
- V: si `data.length===0` (RLS filtró) → error `solo el creador puede archivar este anuncio` (actions.ts:74).
- Perm: botón **solo si `esCreador`** (`a.creadoPor === yo.nombre`, client L153+199); en BD, RLS `anuncios_update_creador` (comentario actions.ts:70; SQL no en repo → §8).
- IG: `activo=false`; el anuncio desaparece del tablón de todos (query L27 filtra `eq('activo', true)`).
- Err/M: los de getContexto o RLS, en banner `aviso`. Mob: ok. Ev: anuncios-client.tsx:131-135+199-204; actions.ts:67-79. S: funcional.

**A9. Overlay del ModalCrearAnuncio** — cierra el modal (`onCerrar` → `setModalCrear(false)` L113). Ev: anuncios-client.tsx:225. S: funcional.
**A10. Contenedor interno ModalCrear (stopPropagation)** — Ev: anuncios-client.tsx:227. S: funcional.
**A11. Botón "✕" del ModalCrear** — cierra modal. Ev: anuncios-client.tsx:230. S: funcional.

**A12. Input "título"**
- P: modal crear · N (label): `título` · T: input text controlado, `autoFocus`.
- A: escribir. R: `setTitulo` local. V: obligatorio al enviar (ver A18). Ev: anuncios-client.tsx:234-235 (id `anu-titulo`). S: funcional.

**A13. Textarea "contenido"**
- N (label): `contenido` · T: textarea rows=4. R: `setContenido`. V: obligatorio al enviar. Ev: anuncios-client.tsx:238-239 (id `anu-contenido`). S: funcional.

**A14. Select "tipo"**
- N (label): `tipo` · T: select con opciones EXACTAS: `🔵 informativo` (default), `🔴 urgente`, `🟡 importante`, `🎉 cultura` (values: informativo/urgente/importante/cultura). R: `setTipo`. V servidor: whitelist actions.ts:42-44 (`tipo inválido`). Ev: anuncios-client.tsx:243-249. S: funcional.

**A15. Select "audiencia"**
- N (label): `audiencia` · T: select; opciones = `AUDIENCIAS` con labels de `AUDIENCIAS_LABEL` (lib/anuncios.ts:51-64): `todo el equipo` (todos, default), `solo heads`, `solo ejecutivos`, `área IMKT`, `área P. Managers`, `área Legal`, `área Admi`, `área Ventas`, `área Digital`, `área RH`. R: `setAudiencia`. V servidor: `AUDIENCIAS.includes` (actions.ts:45, `audiencia inválida`). Ev: anuncios-client.tsx:252-256. S: funcional.

**A16. Input date "expira"**
- N (label): `expira (opcional — vacío = permanente)` · T: input type=date. R: `setExpira`. V servidor: regex `^\d{4}-\d{2}-\d{2}$` (actions.ts:46-48, `fecha de expiración inválida`). IG: en BD `expira_en = fecha + 'T23:59:59'` ISO (paridad SPA "expira al final del día", actions.ts:56-57). Ev: anuncios-client.tsx:259-260. S: funcional.

**A17. Botón "cancelar" (modal crear)** — cierra modal sin guardar. Ev: anuncios-client.tsx:264. S: funcional.

**A18. Botón "publicar anuncio"**
- N: `publicar anuncio` (→ `publicando…` mientras guarda) · T: button (`data-testid="btn-crear-anuncio-confirmar"`), `disabled={guardando}` + `disabled:opacity-50`.
- O: crear el anuncio. A: click. R: validación cliente (título/contenido no vacíos, L268) → Server Action `crearAnuncio` (actions.ts:25-65) → INSERT `anuncios {titulo, contenido, tipo, audiencia, creado_por: yo.nombre, expira_en, activo:true}` (L50-59). `creado_por` SIEMPRE derivado de sesión (L55). Al éxito: cierra modal y `recargar()`.
- V cliente: `completa título y contenido del anuncio` (L268). V servidor: gating `puedeCrearAnuncios` (L36-38), trims, tipo/audiencia whitelist, formato de fecha (L39-48).
- Err/M EXACTOS del servidor: `solo dirección, heads o RH pueden publicar anuncios` · `completa título y contenido del anuncio` · `tipo inválido` · `audiencia inválida` · `fecha de expiración inválida` · `error.message` de Supabase · errores de getContexto. En el modal si falla: `no se pudo publicar — revisa el aviso` (client L272); el detalle queda en el banner `aviso` de la pantalla.
- Perm: server-side `['ceo','head','rh']` + RLS `anuncios_insert_admin_rh` (comentario actions.ts:5+35; SQL no en repo → §8).
- Ev: anuncios-client.tsx:265-276; actions.ts:25-65. S: funcional.

*(Elemento informativo no interactivo pero relevante: bloque "vistas (N)" con chips de quién vio, SOLO para el creador — `data-testid="vistas-info"`, anuncios-client.tsx:174-189; vacío: `aún nadie lo ha visto`.)*

### 2.B FEEDBACK — `feedback-client.tsx` (11 elementos)

**F1. Botones de categoría (grupo de 3)**
- P: formulario "enviar feedback" · N EXACTOS: `🙌 reconocimiento` (hint `celebra a una persona o al equipo — va al muro`), `🔧 mejora` (hint `procesos, herramientas, formas de trabajar — solo lo lee dirección`), `🧭 liderazgo` (hint `feedback hacia arriba — solo lo lee dirección`) (lib/feedback.ts:23-27) · T: 3 buttons tipo card (`data-testid="cat-<v>"`).
- A: click. R: `setCategoria(c.v)`; **si la categoría elegida no es reconocimiento, limpia el destinatario** (`setDestinatario('')`, L206).
- E: seleccionado = borde/fondo naranja (L208). Default: `reconocimiento` (L189).
- Perm: cualquier autenticado con persona ligada. Mob: grid `sm:grid-cols-3` → apilados en móvil (L204).
- Ev: `FormularioFeedback`, feedback-client.tsx:204-213. S: funcional.

**F2. Select "¿para quién?"**
- N (label): `¿para quién?` · T: select (id `fb-para`); primera opción `🙌 todo el equipo` (value ''), luego personas elegibles (`{p.nombre} {p.apellido}`).
- Visible **solo si categoría = reconocimiento** (L216). Elegibles = personas ≠ yo y `personaDisponible(p)`, orden alfabético (L195-197).
- R: `setDestinatario` local. D: SELECT `personas` de `recargar()` (L31).
- Ev: feedback-client.tsx:216-224. S: funcional.

**F3. Textarea "tu mensaje"**
- N (label): `tu mensaje` · T: textarea rows=3, `maxLength={MAX_MENSAJE}`=2000 (lib/feedback.ts:35).
- Placeholder EXACTO: reconocimiento → `ej: se aventó el cierre del cliente en tiempo récord…`; otras → `ej: propongo que…` (L230).
- Ev: feedback-client.tsx:227-231. S: funcional.

**F4. Checkbox "enviar como anónimo"**
- N EXACTO: `🕶 enviar como **anónimo** — la autoría se elimina en la base, no solo se oculta` · T: checkbox (id `fb-anonimo`).
- R: `setEsAnonimo`. Aplica a las 3 categorías (comentario L233).
- Ev: feedback-client.tsx:234-237. S: funcional.

**F5. Botón "enviar →"**
- N: `enviar →` (→ `enviando…`) · T: button (`data-testid="btn-enviar-feedback"`), `disabled={enviando}`.
- O: crear feedback (y quizá estrella). A: click. R: Server Action `enviarFeedback` (feedback/actions.ts:33-104):
  1. Validaciones (ver §6).
  2. Si reconocimiento con destinatario: resuelve persona por `matchNombre` contra SELECT `personas` (L56-61); guarda `destinatario_id`.
  3. INSERT `feedback {categoria, mensaje, es_anonimo, autor_id: esAnonimo? null : yoId, destinatario_id, es_publico: categoria==='reconocimiento'}` (L64-73). ANONIMATO: sin identidad si anónimo; trigger `feedback_anonimato`/`feedback_before_update` lo fuerza en BD (comentario L4-6; migración 20260705220000 L85-97 congela `autor_id`/`es_anonimo` en UPDATE).
  4. Si reconocimiento + destinatario + FIRMADO: intenta estrella — SELECT `estrellas_colaboracion` de mi semana (L81-83), `puedoDarEstrella` (lib/estrellas, límite 2/semana) y si ok INSERT `estrellas_colaboracion {de_persona: yo.nombre, para_persona, motivo: ('🙌 '+mensaje).slice(0,MAX_MOTIVO), semana}` (L91-96). Si el límite ya se alcanzó, el reconocimiento se publica SIN estrella (comentario L7-9). Anónimo nunca genera estrella (L79).
  5. Cero XP por enviar (anti-farmeo, comentario L11).
- Al éxito (cliente L100-109): limpia mensaje/destinatario/anónimo y muestra `okMsg` EXACTO: reconocimiento → `¡reconocimiento publicado! 🙌` + (si hubo estrella) ` · llevó estrella ⭐`; mejora/liderazgo → `recibido — dirección lo revisará. gracias por decirlo 💬`.
- Err EXACTOS del servidor: `categoría inválida` · `escribe tu mensaje` · `máximo 2000 caracteres` · `solo los reconocimientos llevan destinatario` · `destinatario inválido` · `el reconocimiento es para alguien más 😉` · `no se pudo enviar: <error.message>` · errores de getYo. Se muestran en banner `aviso` (client L85, role="alert").
- Perm: cualquier autenticado activo; RLS `feedback_insert`: `autor_id is null or autor_id = (mi_persona()).id` (migración 20260705220000_cutover_feedback_interno.sql:119-124).
- Ev: feedback-client.tsx:243-255; feedback/actions.ts:33-104. S: funcional.

**F6. Select filtro "categoría: todas"** (bandeja dirección)
- N: opciones `categoría: todas` + las 3 categorías con icono · T: select (`data-testid="bandeja-filtro-cat"`, aria-label `filtrar por categoría`). R: filtra `lista` en memoria (L270-272). Perm: solo se ve dentro de `BandejaDireccion` (solo `soyGestion`). Ev: feedback-client.tsx:278-283. S: funcional.

**F7. Select filtro "estado: todos"**
- N: `estado: todos` + `nuevo`/`en revisión`/`resuelto` (lib/feedback.ts:29-33) · T: select (`data-testid="bandeja-filtro-estado"`). R: filtro en memoria. Vacío: `sin feedback con esos filtros` (L293). Ev: feedback-client.tsx:284-289. S: funcional.

**F8. Select "estado" por card de bandeja**
- N (label): `estado` · T: select por item (id `estado-<id>`), opciones ESTADOS. R: estado local `estado` de `CardBandeja`; se persiste solo al guardar (F11). Ev: feedback-client.tsx:328-333. S: funcional.

**F9. Input "respuesta (al resolver)"**
- N (label): `respuesta (al resolver)` · T: input text, placeholder EXACTO `qué se hizo / qué se decidió…`. R: estado local; persiste al guardar. Nota: el loop público solo muestra items con `estado==='resuelto' && compartibleLoop && respuesta` (L65). Ev: feedback-client.tsx:335-339. S: funcional.

**F10. Checkbox "🔁 compartible"**
- N: `🔁 compartible` · T: checkbox (`data-testid="check-compartible"`). R: estado local; persiste al guardar → `compartible_loop`. Ev: feedback-client.tsx:340-344. S: funcional.

**F11. Botón "guardar ✓"**
- N: `guardar ✓` (→ `guardando…`) · T: button (`data-testid="btn-guardar-gestion"`), `disabled={guardando}`.
- R: Server Action `gestionarFeedback({id, estado, respuesta, compartibleLoop})` (feedback/actions.ts:108-136) → UPDATE `feedback SET estado/respuesta/compartible_loop WHERE id` con `.select('id')` (L128-129). `respuesta` vacía → null (L124).
- Perm: server gating `esDireccion || veGamificacionCompleta` (L116-118, error `solo dirección gestiona el feedback`); RLS `feedback_update` (`mi_es_direccion() or mi_ve_gamificacion()`, migración L127-131) + grant de columna solo estado/respuesta/compartible_loop/es_publico (comentario actions L106-107; grants fix en `20260706160401_cutover_feedback_grants_fix.sql`).
- Err EXACTOS: `estado inválido` · `nada que actualizar` · `no se encontró el feedback (o sin permiso)` · `error.message`. Al banner `aviso` (client L172-173).
- Ev: feedback-client.tsx:345-353; feedback/actions.ts:108-136. S: funcional.

### 2.C CLIENTES — `clientes-client.tsx` (22 elementos)

**C1. Botón "⬆ importar CSV"**
- P: header /clientes · N: `⬆ importar CSV` · T: button (`data-testid="btn-importar-csv"`). R: `setModalCSV(true)`. Perm: solo render si `puedeEditar` (L82). Ev: clientes-client.tsx:84-87. S: funcional.

**C2. Botón "+ agregar cliente"**
- N: `+ agregar cliente` · T: button (`data-testid="btn-agregar-cliente"`). R: `setModal({editar: null})`. Perm: solo `puedeEditar`. Ev: clientes-client.tsx:88-91. S: funcional.

**C3. Input buscador**
- N: placeholder `buscar por nombre, RFC o razón social…` (aria-label `buscar cliente`) · T: input controlado. R: filtro en memoria case-insensitive por `nombre`, `rfc`, `razonSocial` (L55-60). Perm: todos. Ev: clientes-client.tsx:100-105. S: funcional.

**C4. Checkbox "ver inactivos"**
- N: `ver inactivos` · T: checkbox. R: incluye filas con `activo=false` (renderizadas con `opacity-50` + sufijo `· inactivo`, L134-136). Ev: clientes-client.tsx:106-109. S: funcional.

**C5. Botón "editar" (por fila)**
- N: `editar` · T: button (`data-testid="btn-editar-cliente"`). R: `setModal({editar: c})` — abre ModalCliente precargado (L232-241). Perm: solo `puedeEditar` (L156). Ev: clientes-client.tsx:158-161. S: funcional.

**C6. Botón "⏸ desactivar" / "▶ reactivar" (por fila)**
- N EXACTO: `⏸ desactivar` si activo, `▶ reactivar` si no · T: button (`data-testid="btn-activo-cliente"`).
- O: **baja LÓGICA como acción principal** (comentario L162, "el FK protege el histórico"). R: Server Action `setActivoCliente({id, activo: !c.activo})` (clientes/actions.ts:85-96) → UPDATE `clientes SET activo` con `.select('id')`.
- IG: mensaje verde `nota` EXACTO: `<nombre> desactivado` / `<nombre> reactivado` (client L164).
- Perm UI: `puedeEditar`; BD: RLS `clientes_update` (`mi_tiene_area('admi') or mi_es_direccion()`, migración 20260715120000 L98-100). Si RLS filtra (0 filas): `solo el área admi (o dirección) puede editar el catálogo de clientes` (actions.ts:25+91).
- Ev: clientes-client.tsx:163-167; actions.ts:85-96. S: funcional.

**C7. Botón "eliminar" (por fila)**
- N: `eliminar` · T: button (`data-testid="btn-eliminar-cliente"`).
- Perm de render: **solo `esDireccion && !c.activo`** (client L169) — hay que desactivar primero. BD: RLS `clientes_delete` solo dirección (migración L101-102).
- A: click → `confirm()` EXACTO: `¿eliminar DEFINITIVAMENTE a <nombre> del catálogo?\n\nsolo funciona si ninguna petición lo usa; para clientes con historial usa "desactivar".` (L172). R: `eliminarCliente({id})` (actions.ts:100-110) → DELETE `clientes`.
- Err traducidos (actions.ts:26-31): FK `23503` → `este cliente tiene peticiones ligadas — desactívalo en lugar de eliminarlo`; RLS 0 filas → `solo dirección puede eliminar registros del catálogo` (L105). Éxito: nota `registro eliminado` (client L173).
- Ev: clientes-client.tsx:169-178; actions.ts:100-110. S: funcional.

**C8. Overlay ModalCliente (click fuera)** — cierra (`setModal(null)`). Ev: clientes-client.tsx:255. S: funcional.
**C9. Contenedor ModalCliente (stopPropagation)** — Ev: clientes-client.tsx:257. S: funcional.
**C10. Botón "✕" ModalCliente** — cierra. Ev: clientes-client.tsx:260. S: funcional.

**C11. Input "nombre comercial / marca (obligatorio)"**
- T: input text vía helper `campo()` (L246-252, handler genérico `set(k)` L244). V: obligatoria en cliente (`el nombre comercial es obligatorio`, L322) y servidor (actions.ts:58 crear / 73 editar). Ev: clientes-client.tsx:263. S: funcional.

**C12. Grupo de campos fiscales (inputs `campo()`)**
- Sección `fiscales (factura)` (L264): `razón social`, `RFC`, `régimen fiscal` (placeholder `ej: 601 — General de Ley`), `CP fiscal`, `correo de contacto` (type email) (L266-269, 288). Todos opcionales; handler común L244+250. Ev: clientes-client.tsx:265-289. S: funcional.

**C13. Select "uso CFDI (catálogo SAT)"**
- N (label): `uso CFDI (catálogo SAT)` · T: select (id `cli-uso_cfdi`) con `— sin dato —` + optgroup `frecuentes` (G03, G01, S01, CP01) + optgroup `todo el catálogo` (resto de `USO_CFDI`, 25 claves totales, lib/clientes.ts:71-96). Opciones muestran `clave · descripción`; se guarda la CLAVE.
- El value se pasa por `normalizarUsoCFDI(f.uso_cfdi)` (L273) → capturas legadas tipo "G03 — Gastos en general" caen a `G03` (lib/clientes.ts:105-108; si no matchea, conserva el valor sin inventar).
- Ev: clientes-client.tsx:270-287. S: funcional.

**C14. Radios "tipo de persona"**
- N: `tipo de persona` con opciones `persona física` (false) / `persona moral` (true) / `sin dato` (null) · T: 3 radios name `cli-persona-moral`. Columna en BD sigue siendo `persona_moral` boolean (comentario L292-293; ajuste 2026-07-15). Ev: clientes-client.tsx:294-304. S: funcional.

**C15. Grupo de campos legales (inputs `campo()`)**
- Sección `legales (contratos)` (L290): `fecha de constancia fiscal` (date), `constancia (link)` (url), `domicilio fiscal`, `domicilio comercial (si difiere)`, `nombre del firmante`, `cargo del firmante`, `documento de facultades (link)` (url), `identificación del firmante (link)` (url), `correo para notificaciones` (email) (L305-315). Ev: clientes-client.tsx:305-315. S: funcional.

**C16. Botón "cancelar" (ModalCliente)** — cierra sin guardar. Ev: clientes-client.tsx:318. S: funcional.

**C17. Botón "agregar cliente" / "guardar cambios"**
- N: `agregar cliente` (alta) o `guardar cambios` (edición) → `guardando…` · T: button (`data-testid="btn-guardar-cliente"`), disabled mientras guarda.
- R: `crearCliente(datos)` (actions.ts:54-66 → INSERT `clientes {...limpiarDatos, creado_por: yo.nombre}` con `.select('id')`) o `editarCliente({id,...})` (actions.ts:68-81 → UPDATE). `limpiarDatos` (L36-52) es whitelist por `CLIENTE_COLUMNAS_CSV` (lib/clientes.ts:60-66): trims, ''→null, `uso_cfdi` normalizado, `persona_moral` boolean o null.
- Éxito: nota `cliente agregado al catálogo` / `cliente actualizado` (client L199), cierra modal.
- Err EXACTOS: cliente `el nombre comercial es obligatorio` (L322) y `no se pudo guardar — revisa el aviso` (L326); servidor vía `traducirError` (actions.ts:26-31): 42501 → `solo el área admi (o dirección) puede editar el catálogo de clientes`; 23505 (índice único `clientes_nombre_unico`, migración L82-84 con `unaccent_inmutable`) → `ya existe un cliente con ese nombre (el catálogo no admite duplicados)`; 23503 → mensaje FK; default `e.message`. Edición con 0 filas → RLS_DENEGADO (actions.ts:76).
- Perm: RLS `clientes_insert` exige además `creado_por = mi_nombre()` (migración L92-97).
- Mob: modal `max-w-2xl max-h-[90vh] overflow-y-auto`; grids `grid-cols-2` fijos (L265, L305) — en móvil quedan 2 columnas estrechas (sin breakpoint `sm:`) → posible apretujón, pendiente de validación visual.
- Ev: clientes-client.tsx:319-330; actions.ts:36-81. S: funcional.

**C18. Overlay ModalImportCSV** — cierra (`setModalCSV(false)`). Ev: clientes-client.tsx:347. S: funcional.
**C19. Contenedor ModalImportCSV (stopPropagation)** — Ev: clientes-client.tsx:349. S: funcional.
**C20. Botón "✕" ModalImportCSV** — cierra. Ev: clientes-client.tsx:352. S: funcional.

**C21. Input file "archivo CSV" + textarea "o pega el contenido"**
- N (labels): `archivo CSV` (input file `accept=".csv,text/csv"`) y `o pega el contenido` (textarea rows=8, placeholder EXACTO `nombre,razon_social,rfc\nURBAN DECAY,Urban Decay México SA de CV,UDM910101ABC`).
- A: elegir archivo → `file.text()` llena el estado `csv` (L363-366); o pegar directo (L372). El modal muestra el header esperado = `CLIENTE_COLUMNAS_CSV.join(',')` (L357-359) con nota `header esperado (solo nombre es obligatorio; el orden no importa, columnas extra se ignoran):` y al pie `las filas cuyo nombre ya existe se saltan — la importación nunca pisa el catálogo.` (L374-376).
- Ev: clientes-client.tsx:360-373. S: funcional. (Se cuentan como 2 handlers: file onChange + textarea onChange.)

**C22. Botón "importar"**
- N: `importar` (→ `importando…`) · T: button (`data-testid="btn-csv-confirmar"`), `disabled={importando || !csv.trim()}`.
- R: Server Action `importarClientesCSV({csv})` (actions.ts:138-192): parser propio con comillas/CRLF (`parseCSV` L117-136) → valida ≥2 filas y columna `nombre` → SELECT `clientes.nombre` existentes (L156) → por fila: whitelist de columnas, `persona_moral` acepta `true/sí/si/1/moral` (L171), `uso_cfdi` normalizado (L172), duplicados case-insensitive se SALTAN (L177), INSERT por fila con `creado_por: yo.nombre` (L179). Si un insert da 42501 aborta todo con RLS_DENEGADO (L181).
- Resultado en UI (client L209-218): aviso naranja `errores: <lista ' · '>` si hubo; nota verde `importados: N` + ` · saltados (ya existían): N` + ` · columnas ignoradas: <lista>`; cierra modal y recarga.
- Err EXACTOS servidor: `el CSV necesita un header y al menos una fila` (L147) · `el CSV debe traer una columna "nombre" (nombre comercial del cliente)` (L151) · por fila `fila N: sin nombre` / `fila N (<nombre>): <traducirError>` (L176, L182).
- Ev: clientes-client.tsx:379-383; actions.ts:117-192. S: funcional.

### 2.D CAMPANA — `campana.tsx` (6 elementos)

**N1. Botón "🔔" (toggle)**
- P: header del layout protegido (todas las rutas app) · N: `🔔` + badge numérico (`9+` si >9) · T: button (`data-testid="btn-campana"`, aria-label `notificaciones`).
- R: `setAbierto(!a)` — abre/cierra el panel. Badge `data-testid="badge-notif"` = `notifs.filter(n => !n.vista).length` (L44, L78-83).
- D: carga inicial SELECT `notificaciones` (30 más recientes, L21-27) + realtime (L29-42). Perm: RLS de SELECT `para = mi_nombre()` (referida en campana.tsx:4-5 y en migración 20260704130000 L20 — definición SQL no en repo → §8).
- Mob: panel `w-96 absolute right-0` — en viewports <384px puede desbordar (sin `max-w-[100vw]`); pendiente de validación visual.
- Ev: campana.tsx:71-84. S: funcional.

**N2. Botón "marcar vistas"**
- N: `marcar vistas` · T: button (`data-testid="btn-marcar-todas"`), solo visible si `sinVer > 0` (L92).
- R: `marcarTodas()` (L52-57): UPDATE `notificaciones SET vista=true WHERE id IN (…)` client-side (anon+RLS, filas propias) + estado optimista.
- Ev: campana.tsx:52-57+92-97. S: funcional.

**N3. Botón "🗑 borrar todas"**
- N: `🗑 borrar todas` · T: button (`data-testid="btn-borrar-todas"`), visible si `notifs.length > 0`. R: `borrarTodas()` (L62-67): DELETE `notificaciones WHERE id IN (…)` + `setNotifs([])`. **Sin confirm()** — borrado inmediato. Ev: campana.tsx:62-67+98-103. S: funcional (hallazgo UX en §7).

**N4. Botón "✕" (cerrar panel)** — `setAbierto(false)`. Ev: campana.tsx:104. S: funcional.

**N5. Item de notificación (click)**
- N: icono `iconoNotif(tipo)` + `titulo` + `detalle` + tiempo relativo; punto naranja `data-testid="notif-dot"` si no vista · T: div clickeable (`data-testid="notif-item"`).
- R: `marcarVista(n)` (L46-51): si no vista, UPDATE `notificaciones SET vista=true WHERE id=…` + estado optimista. Vista → `opacity-60`. **No navega a la petición** aunque exista `peticion_id` (§7).
- Ev: campana.tsx:111-121+46-51. S: funcional.

**N6. Botón "✕" por notificación (borrar)**
- N: `✕` (aparece on hover: `opacity-0 group-hover:opacity-100`) · T: button (`data-testid="btn-borrar-notif"`), `stopPropagation` para no marcar vista. R: `borrar(id)` (L58-61): DELETE fila propia. Mob: al depender de hover, en touch es poco accesible (§7). Ev: campana.tsx:122-127+58-61. S: funcional.

---

## Lógica de negocio

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

### 5.2 Anuncios
- **Vigencia**: un anuncio se muestra si `activo && !anuncioExpirado && anuncioAplicaA` (lib/anuncios.ts:83-84). Expiración comparada contra `new Date()` en cliente (L80-81); `expira_en` se guarda como fin del día elegido (actions.ts:57). Archivar = `activo=false` (soft delete, sin DELETE físico en la UI).
- **Vistos** (`anuncios_vistos`): fila por persona+anuncio (PK compuesta, comentario actions.ts:84), insert idempotente (actions.ts:85-88), lectura de quién vio SOLO en el modal del creador (anuncios-client.tsx:174-189: "vistas (N)" + chips de nombres). Estado leído/sin leer de cada card = `anuncioVistoPor` (lib/anuncios.ts:86-87). Contador de header: `X activos · Y sin leer` (client L60-62). ⚠ El SELECT client-side de `anuncios_vistos` es sin filtro (L28): cuántas filas regresa depende de la RLS de la tabla (no está en el repo → §8); la UI del creador asume que puede ver las de sus anuncios.
- **Audiencias**: 10 valores (todos/heads/ejecutivos/7 áreas). "heads" incluye ceo (lib/anuncios.ts:74); "ejecutivos" excluye a heads/ceo/rh (L75).

### 5.3 Feedback — flujo completo
1. **Envío** (cualquiera): categoría → (solo reconocimiento) destinatario opcional → mensaje ≤2000 → anónimo opcional. INSERT con `es_publico = (categoria==='reconocimiento')` (actions.ts:72). Anonimato REAL: `autor_id=null` en el insert (L69) y trigger BD que congela `autor_id`/`es_anonimo` en cualquier UPDATE (migración 20260705220000:85-97). Sin registro de IP/metadata (comentario actions.ts:6).
2. **Estrella acoplada**: reconocimiento firmado con destinatario intenta `estrellas_colaboracion` respetando `puedoDarEstrella` (límite 2/semana); si no procede, el reconocimiento queda publicado sin estrella (actions.ts:76-99). Motivo de la estrella: `🙌 <mensaje>` truncado a MAX_MOTIVO.
3. **Muro**: client-side filtra `categoria==='reconocimiento' && esPublico` (feedback-client.tsx:58-61); muestra `de <autor|anónimo> para <destinatario|todo el equipo>` + fecha.
4. **Bandeja de dirección**: filtros por categoría/estado; por item se editan estado (nuevo/en revisión/resuelto), respuesta y flag `compartible_loop`; persiste vía `gestionarFeedback`.
5. **Loop público** "qué nos dijeron / qué hicimos": items `resuelto + compartibleLoop + respuesta` agrupados por mes desc (client L64-72), SIEMPRE sin autores (solo mensaje y respuesta, L149-156). Encabezado por mes: `<YYYY-MM> · N tema(s) atendido(s)`.
6. **Cero XP por enviar** (anti-farmeo, actions.ts:11).
7. **Degradado pre-cutover**: si la tabla no existe, banner amarillo y se ocultan formulario/muro/bandeja (client L33-35, L88-92).

### 5.4 Clientes — catálogo
- **Propósito**: memoria fiscal/legal interna para autocompletar facturas y contratos (header client L77-80); SIN conexión a la herramienta administrativa (CLAUDE.md).
- **Uso CFDI / catálogo SAT**: 25 claves `c_UsoCFDI` verificadas contra satcfdi 4.6.0 (lib/clientes.ts:68-96); se guarda la CLAVE; frecuentes G03/G01/S01/CP01 arriba; normalización de capturas legadas en cliente (select value, clientes-client.tsx:273), en server actions (`limpiarDatos` L45, import L172) y al guardar desde petición (peticiones/actions.ts:223).
- **persona_moral**: boolean nullable en BD, presentado como radios "tipo de persona" (física=false/moral=true/sin dato=null) (clientes-client.tsx:294-304); en CSV acepta `true/sí/si/1/moral` (actions.ts:171); desde peticiones se deriva de `detalle.tipo_persona==='moral'` (peticiones/actions.ts:218-220). En la tabla se muestra "persona moral"/"persona física" (client L137-139).
- **activo=false (baja lógica)**: acción principal de baja (client L162-167); DELETE físico reservado a dirección y solo sobre inactivos sin peticiones ligadas (FK 23503 lo bloquea, actions.ts:29). Índice único de nombre `lower(unaccent_inmutable(nombre))` (migración L82-84).
- **Constancia fiscal**: `constanciaVigente` = fecha + 3 meses ≥ hoy (lib/clientes.ts:112-118); chip en tabla `data-testid="chip-constancia"`: `<fecha> · vigente` o `<fecha> · ⚠ vencida (>3 meses)` en naranja, o `sin dato`. Es AVISO, nunca bloqueo (comentario L111).
- **Carga CSV**: parser propio con comillas dobles escapadas y CR/LF (actions.ts:117-136); header flexible (orden libre, extra ignoradas con aviso), solo `nombre` obligatorio; duplicados por nombre (case-insensitive) se saltan; inserts fila a fila; reporte de insertados/saltados/errores/columnas ignoradas.
- **"Guardar cliente al catálogo"**: vive en peticiones (`guardarClienteAlCatalogo`, peticiones/actions.ts:201-260; botón en la UI de peticiones, fuera del alcance de estos archivos): mapea `detalle` jsonb → columnas vía `DETALLE_A_CLIENTE` (L176-193, nota `correo_contacto`→`contacto_correo`); si el cliente existe (ilike por nombre) solo COMPLETA huecos sin pisar (L228-240); si no, INSERT; al final liga `peticiones.cliente_id` best-effort (L255). Solo admi/dirección (RLS; 42501 → `solo el área admi (o dirección) puede escribir al catálogo`).

---

## Validaciones y mensajes exactos (consolidado)

### Anuncios
| Dónde | Validación | Mensaje EXACTO |
|---|---|---|
| cliente (modal crear L268) | título y contenido no vacíos | `completa título y contenido del anuncio` |
| cliente (modal crear L272) | server action falló | `no se pudo publicar — revisa el aviso` |
| server crearAnuncio:36-38 | nivel ∈ ceo/head/rh | `solo dirección, heads o RH pueden publicar anuncios` |
| server crearAnuncio:41 | título/contenido trim | `completa título y contenido del anuncio` |
| server crearAnuncio:42-44 | tipo whitelist | `tipo inválido` |
| server crearAnuncio:45 | audiencia whitelist | `audiencia inválida` |
| server crearAnuncio:46-48 | regex fecha | `fecha de expiración inválida` |
| server archivarAnuncio:74 | 0 filas tras RLS | `solo el creador puede archivar este anuncio` |
| confirm archivar (client L132) | — | `¿archivar este anuncio?\n\ndejará de aparecer en el tablón. esta acción no se puede deshacer.` |
| getContexto:16/19/21 | sesión/persona/activo | `sin sesión` · `tu cuenta no está ligada a una persona del equipo` · `cuenta archivada` |
| vacíos | — | `no hay anuncios activos para ti` (L81) · `cargando…` (L79) · `aún nadie lo ha visto` (L178) |
| estado visto | — | `leído ✓` / `● sin leer` (L102) · en modal `tú ya lo viste ✓` / `aún no marcado como visto` (L169-171) |

### Feedback
| Dónde | Validación | Mensaje EXACTO |
|---|---|---|
| server enviarFeedback:43-45 | categoría whitelist | `categoría inválida` |
| :46 | mensaje no vacío | `escribe tu mensaje` |
| :47 | ≤2000 | `máximo 2000 caracteres` |
| :48-50 | destinatario solo en reconocimiento | `solo los reconocimientos llevan destinatario` |
| :58 | destinatario existe y activo | `destinatario inválido` |
| :59 | no auto-reconocimiento | `el reconocimiento es para alguien más 😉` |
| :74 | insert falló | `no se pudo enviar: <error.message>` |
| server gestionarFeedback:116-118 | dirección/flag | `solo dirección gestiona el feedback` |
| :121 | estado whitelist | `estado inválido` |
| :126 | payload no vacío | `nada que actualizar` |
| :131 | 0 filas | `no se encontró el feedback (o sin permiso)` |
| éxito (client L103-107) | — | `¡reconocimiento publicado! 🙌` (+ ` · llevó estrella ⭐`) · `recibido — dirección lo revisará. gracias por decirlo 💬` |
| módulo inactivo (L89-91) | — | `el módulo de feedback se activa en el cutover (la tabla aún no existe en esta base) — la UI ya está lista.` |
| vacíos | — | `aún no hay reconocimientos — sé quien arranque el muro 🙌` (L120) · `sin feedback con esos filtros` (L293) |
| regla de la casa (L240-242) | informativo | `regla de la casa: sobre el comportamiento, no la persona · constructivo · lo que propondrías` |

### Clientes
| Dónde | Validación | Mensaje EXACTO |
|---|---|---|
| cliente modal (L322) | nombre obligatorio | `el nombre comercial es obligatorio` |
| cliente modal (L326) | acción falló | `no se pudo guardar — revisa el aviso` |
| server crear:58 / editar:73 | nombre obligatorio | `el nombre comercial es obligatorio` |
| traducirError 42501 (:26-28) | RLS | `solo el área admi (o dirección) puede editar el catálogo de clientes` |
| traducirError 23505 | duplicado | `ya existe un cliente con ese nombre (el catálogo no admite duplicados)` |
| traducirError 23503 | FK | `este cliente tiene peticiones ligadas — desactívalo en lugar de eliminarlo` |
| eliminar 0 filas (:105) | RLS delete | `solo dirección puede eliminar registros del catálogo` |
| CSV (:147) | ≥ header+1 | `el CSV necesita un header y al menos una fila` |
| CSV (:150-152) | col nombre | `el CSV debe traer una columna "nombre" (nombre comercial del cliente)` |
| CSV por fila (:176/:182) | — | `fila N: sin nombre` · `fila N (<nombre>): <error>` |
| confirm eliminar (L172) | — | `¿eliminar DEFINITIVAMENTE a <nombre> del catálogo?\n\nsolo funciona si ninguna petición lo usa; para clientes con historial usa "desactivar".` |
| notas de éxito (L164/173/199/214-216) | — | `<nombre> desactivado` · `<nombre> reactivado` · `registro eliminado` · `cliente agregado al catálogo` · `cliente actualizado` · `importados: N · saltados (ya existían): N · columnas ignoradas: …` · `errores: …` |
| vacíos (L116-118) | — | `catálogo vacío — la carga inicial se hace con "⬆ importar CSV"` · `sin resultados con ese filtro` · `cargando…` |
| solo lectura (L79) | — | ` · solo lectura (edición: área admi y dirección)` |

### Campana
- Vacío: `sin notificaciones todavía` (campana.tsx:109). Badge `9+` si >9 (L81). Sin mensajes de error visibles: los fallos de UPDATE/DELETE client-side se ignoran silenciosamente (§7).

---


---

# MÓDULO: AUTENTICACIÓN y NAVEGACIÓN GLOBAL (login · update-password · logout · layout)

## Inventario de elementos interactivos

### login-form.tsx (4 elementos)
1. **correo** · input email (id `login-email`, placeholder `tucorreo@movdi.mx`, autoComplete username) · Objetivo: capturar email · Validación: requerido (junto con contraseña) en submit; se normaliza trim+lowercase · Mobile: full-width (`w-full`) · Evidencia: login-form.tsx:65-73 · **OK**
2. **contraseña** · input password (id `login-password`, placeholder `••••••••`, autoComplete current-password) · Validación: requerido · Evidencia: l.79-87 · **OK**
3. **¿olvidaste tu contraseña?** · botón type=button (deshabilitado con `cargando`) · Acción: `olvidasteContrasena()` → `resetPasswordForEmail` con redirectTo `/auth/confirm?next=/update-password` · Resultado: info neutra "si {mail} está registrado…revisa también spam." · Errores: "no se pudo enviar el email: {msg}" · Sin email: "escribe tu correo en el campo de arriba…" · Evidencia: l.98-105 y 37-57 · **OK**
4. **entrar →** / **autenticando…** (mientras carga) · botón submit (disabled cargando) · Acción: `entrar()` → signInWithPassword · Resultado ok: replace('/') · Errores: "ingresa tu correo y contraseña" / "correo o contraseña incorrectos" (role=alert naranja l.90-92; info role=status gris l.93-95) · Evidencia: l.106-112, 15-35 · **OK**

### update-password/page.tsx (3 elementos)
1. **nueva contraseña** · input password (id `pass1`, autoComplete new-password) · Validación: ≥8 chars · Evidencia: l.54-61 · **OK**
2. **confirmar contraseña** · input password (id `pass2`, autoComplete new-password) · Validación: igual a pass1 · Evidencia: l.67-74 · **OK**
3. **guardar contraseña** / **guardando…** · botón submit full-width (disabled cargando) · Acción: `guardar()` → `auth.updateUser({password})` · Resultado ok: replace('/')+refresh · Mensajes error EXACTOS: "la contraseña debe tener al menos 8 caracteres" · "las contraseñas no coinciden" · "error: {msg}" (role=alert l.76) · Mobile: max-w-sm centrado · Evidencia: l.77-83, 18-39 · **OK**

### logout-button.tsx (1 elemento)
1. **cerrar sesión** · botón · Acción: `salir()` → `auth.signOut()` → replace('/login')+refresh · Sin confirmación ni estado de carga (doble click posible, inocuo) · Evidencia: logout-button.tsx:9-23 · **OK** (solo visible en `/`, ver §7)

## Flujo de autenticación completo

### Login (app/(auth)/login/page.tsx + login-form.tsx)
- `page.tsx` es Server Component; NO lista personas (comentario explícito líneas 3-4). Muestra encabezado "/ acceso interno", "MOVDI · ops", "ingresa con tu correo y contraseña."
- Si llega `?error=link_invalido` (desde /auth/confirm) muestra banner: **"el link expiró o no es válido. solicita uno nuevo con "¿olvidaste tu contraseña?"."** (page.tsx:26-30).
- `login-form.tsx` — handler `entrar()` (líneas 15-35):
  - Normaliza email: `trim().toLowerCase()` (l.19).
  - Validación: ambos campos requeridos → **"ingresa tu correo y contraseña"** (l.21).
  - `supabase.auth.signInWithPassword({ email, password })` (l.26).
  - Error → mensaje genérico anti-enumeración: **"correo o contraseña incorrectos"** (l.30, comentario l.29 "no distinguimos correo inexistente de contraseña mala").
  - Éxito → `router.replace('/')` + `router.refresh()` (l.33-34).
- Handler `olvidasteContrasena()` (l.37-57):
  - Sin email → info: **"escribe tu correo en el campo de arriba y vuelve a dar clic en "¿olvidaste tu contraseña?"."** (l.42).
  - `supabase.auth.resetPasswordForEmail(mail, { redirectTo: `${window.location.origin}/auth/confirm?next=/update-password` })` (l.47-49).
  - Error → **"no se pudo enviar el email: " + error.message** (l.52).
  - Éxito → mensaje neutro anti-enumeración (comentario l.55): **"si {mail} está registrado, recibirás un link para restablecer tu contraseña. revisa también spam."** (l.56).

### Confirmación de links de email (app/auth/confirm/route.ts, 29 líneas)
- GET handler; soporta AMBOS formatos de link Supabase (comentario l.5-10):
  - PKCE `?code=...` → `supabase.auth.exchangeCodeForSession(code)` (l.20-22).
  - Token hash `?token_hash=...&type=recovery|invite` → `supabase.auth.verifyOtp({ type, token_hash })` (l.23-25).
- `next` por defecto `/update-password` (l.16). Éxito → redirect a `${origin}${next}`; fallo → `${origin}/login?error=link_invalido` (l.28).
- Nota: `next` viene del query string sin whitelist — solo se concatena con `origin` (path relativo), riesgo bajo de open-redirect interno; ver §7.

### Definir/restablecer contraseña (app/(auth)/update-password/page.tsx, 87 líneas)
- Client Component; se llega vía /auth/confirm CON sesión en cookies; middleware bloquea sin sesión (comentario l.7-9). Réplica de `guardarNuevaPassword` de la SPA (l.10).
- Handler `guardar()` (l.18-39): mínimo 8 chars → **"la contraseña debe tener al menos 8 caracteres"** (l.22); confirmación → **"las contraseñas no coinciden"** (l.26); `supabase.auth.updateUser({ password: pass1 })` (l.31); error → **"error: " + error.message** (l.34); éxito → `router.replace('/')` + refresh.
- Textos: h1 "define tu contraseña", sub "esta contraseña la usarás para entrar siempre." (mismos textos que `mostrarSetPassword` del legado, index.html:1971-1973).

### signOut (app/(app)/logout-button.tsx, 24 líneas)
- `salir()` (l.9-14): `supabase.auth.signOut()` (comentario: "limpia cookies + revoca en el servidor") → `router.replace('/login')` + `router.refresh()`.

### Middleware / proxy
- `proxy.ts` (15 líneas): Next 16 renombró middleware→proxy (comentario l.4-5); delega en `updateSession` de lib/supabase/middleware.ts. Matcher (l.13): todas las rutas EXCEPTO `_next/static`, `_next/image`, `favicon.ico` y assets con extensión (svg/png/jpg/jpeg/gif/webp/ico/css/js/map).
- `lib/supabase/middleware.ts` (58 líneas):
  - `PUBLIC_PATHS = ['/login', '/auth']` (l.6) — exacto o con `/` (l.8-10); `/auth` cubre el route handler de confirm.
  - Patrón oficial @supabase/ssr: crea client con cookies del request, sincroniza cookies en la respuesta (l.16-35), `auth.getUser()` refresca sesión en cada request (l.37-39).
  - Sin user y ruta no pública → redirect a `/login` con search limpio (l.43-48).
  - Con user en `/login` → redirect a `/` (l.50-55).
  - Nota: `/update-password` NO está en PUBLIC_PATHS → requiere sesión (la deja el link de email), consistente con el comentario de update-password/page.tsx:9.

### Vínculo auth ↔ persona (lib/supabase/vinculo.ts, 39 líneas)
- Contexto (comentarios l.1-14): `personas.auth_user_id` alimenta `mi_nombre()` y toda la RLS de escritura; el legado lo llenaba en el primer login (index.html:2058-2061), la app Next no lo hacía → bug Valeria/Alfredo 2026-07-15. Fix en 3 capas: alta de equipo, autocuración en layout, pre-check en getContexto de peticiones.
- `asegurarVinculoAuth(supabase, personaId, authUserId)` (l.26-39): `update({ auth_user_id }).eq('id', personaId).is('auth_user_id', null).select('auth_user_id')` — el `.is(null)` evita pisar vínculo existente; devuelve true si quedó ligado. Respaldado por policy `personas_self_link` (solo fila propia por email del JWT y solo si vacío).
- Exporta `MSG_CUENTA_SIN_VINCULO` = "tu cuenta no está terminada de configurar (falta ligarla a tu usuario). avisa a dirección para que la revisen — no pierdas lo que escribiste." (l.20-22) — usado en getContexto de peticiones (fuera de mis módulos).
- Autocuración en layout: app/(app)/layout.tsx:23-27 — si hay user + persona sin `authUserId`, llama `asegurarVinculoAuth`; `cuentaIncompleta = !!user && (!persona || !vinculoOk)`.
- Banner (layout.tsx:120-130, `data-testid="aviso-cuenta-incompleta"`, role=alert):
  - Con persona: **"tu cuenta no está terminada de configurar — puedes ver la app, pero crear o editar va a fallar. avisa a dirección."**
  - Sin persona: **"tu cuenta existe pero no está ligada a una persona del equipo. avisa a dirección."**

