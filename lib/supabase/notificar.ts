import 'server-only'

import { createAdminClient } from './admin'
import { mapPersonaRow, matchNombre } from '@/lib/peticiones'

// ═══════════════════════════════════════════════════════════════════
// ÚNICO punto de inserción de notificaciones de toda la aplicación.
// (Auditoría: si buscas quién puede escribir en `notificaciones`,
// es ESTE archivo + la función SQL notificar_recurrentes_del_dia().)
//
// Usa el ADMIN CLIENT (service_role) porque tras el cutover la policy
// de INSERT para authenticated desaparece (migración
// 20260704130000_cutover_endurecer_notif_insert): cero inserts de
// cliente, el payload siempre se construye en el servidor (anti-spoof).
// `import 'server-only'` arriba: el build FALLA si algún componente
// cliente intenta importar esto.
//
// Compatible pre-cutover: funciona igual con la policy interim vigente.
// ═══════════════════════════════════════════════════════════════════

export type NotifRow = {
  para: string
  tipo: string
  titulo: string
  detalle: string | null
  peticion_id: string | null
}

// Reglas (paridad crearNotificacion/crearNotificacionesBatch del SPA):
// nunca a uno mismo, nunca a personas inexistentes o inactivas.
export async function notificarServidor(opts: { de: string; rows: NotifRow[] }): Promise<void> {
  const admin = createAdminClient()
  const { data: personasRows, error: eP } = await admin.from('personas').select('*')
  if (eP) {
    console.warn('[notificar] no se pudieron leer personas:', eP.message)
    return
  }
  const personas = (personasRows ?? []).map(mapPersonaRow)

  const validas = opts.rows.filter((r) => {
    if (!r.para || r.para === opts.de) return false
    const p = personas.find((x) => matchNombre(x.nombre, r.para))
    return !!p && p.activo !== false
  }).map((r) => ({
    ...r,
    detalle: r.detalle || null,
    peticion_id: r.peticion_id || null,
  }))
  if (!validas.length) return

  const { error } = await admin.from('notificaciones').insert(validas)
  if (error) console.warn('[notificar] inserción fallida:', error.message)
}
