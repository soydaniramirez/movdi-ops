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

// ⚡ Toque (4.14): notificación de ánimo con límite suave de 1 por persona
// por día POR REMITENTE. El chequeo del límite lee notificaciones con el
// admin client — sigue siendo ESTE archivo el único punto con service_role
// que toca notificaciones (lectura y escritura, ambas auditables aquí).
export async function notificarToque(opts: {
  de: string
  para: string
  mensaje: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()

  const { data: personasRows, error: eP } = await admin.from('personas').select('*')
  if (eP) return { ok: false, error: 'no se pudieron validar personas' }
  const personas = (personasRows ?? []).map(mapPersonaRow)
  const dest = personas.find((x) => matchNombre(x.nombre, opts.para))
  if (!dest || dest.activo === false) return { ok: false, error: 'destinatario inválido' }
  if (matchNombre(dest.nombre, opts.de)) return { ok: false, error: 'el toque es para alguien más 😉' }

  const titulo = `⚡ ${opts.de} te mandó un toque`
  const hoyInicio = new Date(new Date().toDateString()).toISOString()

  // límite 1/persona/día (por remitente): mismo título exacto + hoy
  const { data: previas, error: eQ } = await admin
    .from('notificaciones').select('id')
    .eq('para', dest.nombre).eq('tipo', 'toque').eq('titulo', titulo)
    .gte('creada_en', hoyInicio)
  if (eQ) return { ok: false, error: 'no se pudo verificar el límite diario' }
  if (previas && previas.length > 0) {
    return { ok: false, error: `ya le mandaste un toque hoy a ${dest.nombre} — mañana otro 💪` }
  }

  const { error } = await admin.from('notificaciones').insert({
    para: dest.nombre,
    tipo: 'toque',
    titulo,
    detalle: opts.mensaje || null,
    peticion_id: null,
  })
  if (error) return { ok: false, error: 'no se pudo enviar el toque' }
  return { ok: true }
}
