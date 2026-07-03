// Dominio de notificaciones — paridad con la campana del index.html
// (mapNotifRow, iconoNotif, tiempoRelativo, canal realtime notif-<nombre>).

export type Notificacion = {
  id: string
  para: string
  tipo: string
  titulo: string
  detalle: string | null
  peticionId: string | null
  vista: boolean
  creadaEn: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapNotifRow(r: any): Notificacion {
  return {
    id: r.id,
    para: r.para,
    tipo: r.tipo,
    titulo: r.titulo,
    detalle: r.detalle ?? null,
    peticionId: r.peticion_id ?? null,
    vista: r.vista === true,
    creadaEn: r.creada_en,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Paridad SPA + el tipo nuevo recurrente_hoy (cutover 4.2b)
export function iconoNotif(tipo: string): string {
  if (tipo === 'nueva_peticion') return '📥'
  if (tipo === 'fecha_cambiada') return '📅'
  if (tipo === 'reabierta') return '🔄'
  if (tipo === 'estrella') return '⭐'
  if (tipo === 'recurrente_hoy') return '↻'
  return '🔔'
}

export function tiempoRelativo(iso: string, ahora?: number): string {
  const diff = ((ahora ?? Date.now()) - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`
  return new Date(iso).toLocaleDateString()
}

// Interfaz mínima del cliente para poder probar el cableado sin red.
// (subconjunto estructural del SupabaseClient real; ver campana.tsx)
export type ClienteRealtime = {
  channel: (nombre: string) => {
    on: (tipo: string, filtro: Record<string, string>, cb: (payload: { new: unknown }) => void) => {
      subscribe: () => unknown
    }
  }
  removeChannel?: (canal: unknown) => void
}

// Suscripción realtime a INSERTs de mis notificaciones — paridad exacta con
// _notifChannel del SPA: canal 'notif-<nombre>', filtro para=eq.<nombre>.
// Devuelve el canal (para removeChannel en el cleanup del componente).
export function configurarCanalNotificaciones(
  cliente: ClienteRealtime,
  nombre: string,
  onNueva: (n: Notificacion) => void,
) {
  return cliente
    .channel('notif-' + nombre)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `para=eq.${nombre}` },
      (payload) => onNueva(mapNotifRow(payload.new)),
    )
    .subscribe()
}
