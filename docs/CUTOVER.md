# Checklist de CUTOVER — SPA vieja → Next.js

Pasos a ejecutar cuando el Next.js llegue a paridad y se retire el
`index.html` de producción. **Nada de esta lista debe aplicarse antes**:
cambian comportamiento o romperían la SPA viva.

## 1. Migraciones de recurrentes 4.2b (en este orden)

| # | Archivo | Qué hace |
|---|---|---|
| 1 | `20260703230000_cutover_quincenal_fecha_inicio.sql` | Columna `fecha_inicio` + backfill + check constraint. ⚠️ El constraint rompe la creación de quincenales desde el index.html — aplicar solo con la SPA retirada |
| 2 | `20260703230500_cutover_recordatorio_recurrentes.sql` | Tabla dedup `recurrentes_avisos` + función `notificar_recurrentes_del_dia()` |
| 3 | `20260703231000_cutover_encender_cron_recordatorios.sql` | `pg_cron`: recordatorio diario 07:00 MX (13:00 UTC). Es el interruptor — aplicar al final |

Verificación post-aplicación:
- `select nombre, para, fecha_inicio from recurrentes where frecuencia='quincenal';`
  → la de Mariana debe tener `fecha_inicio = 2026-05-25`.
- Tras el primer run del cron: `select * from cron.job_run_details order by start_time desc limit 5;`
  y que exista a lo más un aviso por (recurrente, fecha) en `recurrentes_avisos`.
- Correr security advisors (la función es SECURITY DEFINER: debe quedar solo
  el warning 0029 de las funciones `mi_*`, ya conocido e intencional).

## 2. Avisar a Mariana (cadencia quincenal corregida)

Su "Entrega de objetivos digital" hoy aparece **cada lunes** (bug: quincenal
se generaba semanal). Con el cutover será quincenal real anclada al
2026-05-25: próximas **6-jul, 20-jul, 3-ago…** Mensaje sugerido:
> tu "Entrega de objetivos digital" ahora sí es quincenal: te toca el 6 de
> julio y luego cada 14 días (antes aparecía todos los lunes por un bug).

## 3. Endurecer RLS de notificaciones (pendiente desde el fix de seguridad)

La policy interim `notif_insert` (`with check (mi_nombre() is not null)`)
existe porque la SPA inserta notificaciones para otros desde el navegador.
Con la SPA retirada, todos los INSERT salen de Server Actions / la función
del cron, así que se puede cerrar el spoofing por REST directo:

```sql
drop policy if exists notif_insert on public.notificaciones;
-- Los INSERT legítimos vienen de: Server Actions (rol authenticated, pero
-- podrían moverse a service_role/admin client si se quiere cerrar del todo)
-- y de notificar_recurrentes_del_dia() (SECURITY DEFINER, no pasa por RLS
-- como authenticated). Decidir en cutover:
--   Opción A (cero inserts de cliente): sin policy de INSERT para
--     authenticated + Server Actions migradas al admin client (service_role).
--   Opción B (mínima): with check (para <> mi_nombre() and mi_nombre() is not null)
--     — sigue permitiendo REST directo entre usuarios autenticados.
-- Recomendada: A.
```

## 4. Resto del cutover (se completará al llegar la fase 5)

- [ ] Deploy del Next.js con variables de entorno de producción
  (la service key **solo** en el entorno del servidor).
- [ ] Redirigir el dominio/site de Netlify al app nuevo; retirar `index.html`.
- [ ] Revocar/limpiar lo que dependa de la SPA (p. ej. plantillas de email
  apuntando al path viejo de recovery).
- [ ] QA por rol (ejecutivo / head / dirección / RH) + prueba de fuga anónima.
- [ ] QA del INVITE automático (no cubierto por el mock — el envío real del
  email lo hace Supabase Auth): dar de alta una persona de prueba con un
  correo real → debe llegarle el email de invitación, y el link debe
  aterrizar en /auth/confirm → /update-password. Verificar también el caso
  "email ya registrado en Auth" (debe crear la persona sin duplicar invite,
  con aviso). Requiere SUPABASE_SERVICE_ROLE_KEY configurada en el entorno
  del servidor. La lógica (payload, gating ceo|head, service key, degradación
  con gracia) está cubierta por e2e/equipo.spec.ts contra el mock.
- [ ] (opcional) Sustituir la compensación de "desactivar con reasignación"
  por una función RPC transaccional si se quiere atomicidad a nivel de BD;
  hoy la Server Action revierte todos los pasos aplicados si algo falla
  (probado), pero una caída del proceso a mitad dejaría estado intermedio.
- [ ] QA de REALTIME (no cubierto por el mock — los websockets no se pueden
  probar desde el sandbox de CI): dos navegadores con usuarios distintos;
  desde A asignar una petición a B → la campana de B debe actualizarse en
  vivo sin recargar (canal `notif-<nombre>`, filtro `para=eq.<nombre>`).
  Verificado ya en BD real: `notificaciones` está en la publicación
  `supabase_realtime` (es la misma vía que usa la SPA hoy). El cableado del
  canal (nombre/filtro/evento/mapeo) tiene test unitario en
  e2e/notificaciones.spec.ts.
