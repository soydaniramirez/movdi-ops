-- ============================================================
-- ✅ APLICADA en el cutover del 2026-07-06 (histórico: estuvo staged sin aplicar).
-- Rompe los INSERT de notificaciones del index.html vivo: aplicar solo
-- cuando la SPA ya no sea la app servida. Requiere además que el build
-- de Next inserte notificaciones con el admin client (cambio de código
-- pre-cutover, ver docs/CUTOVER.md paso P3).
-- ============================================================
-- CUTOVER 5/5 — endurecer notificaciones (cierre definitivo del interim)
--
-- Historia: notif_insert nació WITH CHECK (true) (spoofing total por REST),
-- se endureció a `mi_nombre() is not null` como interim porque la SPA
-- insertaba notificaciones para otros desde el navegador. Con la SPA
-- retirada, TODOS los INSERT legítimos salen de:
--   · Server Actions (admin client / service_role — no pasa por RLS)
--   · notificar_recurrentes_del_dia() (SECURITY DEFINER — tampoco)
-- Opción A acordada: CERO inserts de cliente. Sin policy de INSERT para
-- authenticated, RLS niega por defecto → un usuario autenticado ya no
-- puede fabricar notificaciones a nadie vía REST directo.
-- Realtime no se afecta: los eventos INSERT llegan al destinatario
-- filtrados por la policy de SELECT (para = mi_nombre()), que no cambia.
-- ============================================================

drop policy if exists notif_insert on public.notificaciones;

-- cinturón y tirantes: sin privilegio de INSERT aunque alguien recree
-- una policy permisiva por accidente (mismo criterio que personas/anon)
revoke insert on public.notificaciones from anon, authenticated;

-- Verificación post-aplicación (con token de usuario, NO service):
--   POST /rest/v1/notificaciones → debe dar 42501/403.
-- Y en la app: crear una petición → la notificación del destinatario
-- debe seguir llegando (via admin client) y sonar en realtime.
