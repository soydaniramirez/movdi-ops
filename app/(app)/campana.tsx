'use client'

// Campana de notificaciones (paridad con la del SPA):
// - lecturas y toggles client-side con anon+RLS (para = mi_nombre): son filas
//   PROPIAS del usuario — decisión consistente con el enfoque híbrido, las
//   escrituras "hacia otros" siguen en Server Actions.
// - realtime: canal notif-<nombre> filtrado para=eq.<nombre> (paridad SPA).

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  type ClienteRealtime, type Notificacion,
  configurarCanalNotificaciones, iconoNotif, mapNotifRow, tiempoRelativo,
} from '@/lib/notificaciones'

export default function Campana({ nombre }: { nombre: string }) {
  const [notifs, setNotifs] = useState<Notificacion[]>([])
  const [abierto, setAbierto] = useState(false)
  const canalRef = useRef<unknown>(null)

  const recargar = useCallback(async () => {
    const sb = createClient()
    const { data, error } = await sb
      .from('notificaciones').select('*')
      .order('creada_en', { ascending: false }).limit(30)
    if (!error) setNotifs((data ?? []).map(mapNotifRow))
  }, [])

  useEffect(() => {
    // carga inicial + suscripción realtime (cleanup al desmontar)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recargar()
    const sb = createClient()
    // el cliente real satisface la interfaz en runtime; los overloads de TS
    // del SDK no unifican con el subconjunto estructural testeable
    canalRef.current = configurarCanalNotificaciones(sb as unknown as ClienteRealtime, nombre, (n) =>
      setNotifs((prev) => [n, ...prev]),
    )
    return () => {
      if (canalRef.current) sb.removeChannel(canalRef.current as Parameters<typeof sb.removeChannel>[0])
    }
  }, [nombre, recargar])

  const sinVer = notifs.filter((n) => !n.vista).length

  async function marcarVista(n: Notificacion) {
    if (!n.vista) {
      await createClient().from('notificaciones').update({ vista: true }).eq('id', n.id)
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, vista: true } : x)))
    }
  }
  async function marcarTodas() {
    const ids = notifs.filter((n) => !n.vista).map((n) => n.id)
    if (!ids.length) return
    await createClient().from('notificaciones').update({ vista: true }).in('id', ids)
    setNotifs((prev) => prev.map((x) => ({ ...x, vista: true })))
  }
  async function borrar(id: string) {
    await createClient().from('notificaciones').delete().eq('id', id)
    setNotifs((prev) => prev.filter((x) => x.id !== id))
  }
  async function borrarTodas() {
    const ids = notifs.map((n) => n.id)
    if (!ids.length) return
    await createClient().from('notificaciones').delete().in('id', ids)
    setNotifs([])
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((a) => !a)}
        data-testid="btn-campana"
        className="relative border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-movdi-naranja"
        aria-label="notificaciones"
      >
        🔔
        {sinVer > 0 && (
          <span data-testid="badge-notif"
            className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-movdi-naranja px-1 font-mono text-[10px] text-white">
            {sinVer > 9 ? '9+' : sinVer}
          </span>
        )}
      </button>

      {abierto && (
        <div data-testid="panel-notif"
          className="absolute right-0 top-10 z-50 w-96 border border-neutral-700 bg-neutral-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
            <strong className="text-xs">notificaciones</strong>
            <div className="flex items-center gap-2">
              {sinVer > 0 && (
                <button onClick={marcarTodas} data-testid="btn-marcar-todas"
                  className="font-mono text-[10px] text-neutral-400 hover:text-neutral-200">
                  marcar vistas
                </button>
              )}
              {notifs.length > 0 && (
                <button onClick={borrarTodas} data-testid="btn-borrar-todas"
                  className="font-mono text-[10px] text-neutral-400 hover:text-movdi-naranja">
                  🗑 borrar todas
                </button>
              )}
              <button onClick={() => setAbierto(false)} className="text-neutral-500 hover:text-neutral-200">✕</button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifs.length === 0 && (
              <p className="px-3 py-6 text-center font-mono text-xs text-neutral-500">sin notificaciones todavía</p>
            )}
            {notifs.map((n) => (
              <div key={n.id} data-testid="notif-item"
                onClick={() => marcarVista(n)}
                className={`group flex cursor-pointer items-start gap-2 border-b border-neutral-800/60 px-3 py-2.5 hover:bg-neutral-800/40 ${n.vista ? 'opacity-60' : ''}`}>
                <span className="text-sm">{iconoNotif(n.tipo)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-neutral-100">{n.titulo}</p>
                  {n.detalle && <p className="mt-0.5 text-[11px] text-neutral-400">{n.detalle}</p>}
                  <p className="mt-0.5 font-mono text-[10px] text-neutral-500">{tiempoRelativo(n.creadaEn)}</p>
                </div>
                {!n.vista && <span data-testid="notif-dot" className="mt-1 h-2 w-2 shrink-0 rounded-full bg-movdi-naranja" />}
                <button
                  onClick={(e) => { e.stopPropagation(); void borrar(n.id) }}
                  data-testid="btn-borrar-notif"
                  className="text-neutral-600 opacity-0 hover:text-movdi-naranja group-hover:opacity-100">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
