'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { selectTodo } from '@/lib/supabase/select-todo'
import { type Persona, mapPersonaRow, personaDisponible } from '@/lib/peticiones'
import { tiempoRelativo } from '@/lib/notificaciones'
import {
  type Estrella, MAX_ESTRELLAS_SEMANA, MAX_MOTIVO,
  mapEstrellaRow, puedoDarEstrella, semanaActual,
} from '@/lib/estrellas'
import { darEstrella } from './actions'

const inputCls = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-movdi-naranja'
const labelCls = 'mb-1 block font-mono text-[11px] uppercase tracking-wider text-neutral-400'

export default function EstrellasClient({ yo }: { yo: Persona }) {
  const [estrellas, setEstrellas] = useState<Estrella[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [modalDar, setModalDar] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    const sb = createClient()
    const [est, pers] = await Promise.all([
      // Fase 4.8: estrellas_select (cutover) devuelve solo aquellas donde
      // participo (di o recibí); el flag ve_gamificacion_completa ve todas.
      selectTodo(() => sb.from('estrellas_colaboracion').select('*'), [{ col: 'creada_en', asc: false }]),
      sb.from('personas').select('*'),
    ])
    if (!est.error) setEstrellas((est.data ?? []).map(mapEstrellaRow))
    if (!pers.error) setPersonas((pers.data ?? []).map(mapPersonaRow))
    setCargando(false)
  }, [])

  // Carga inicial client-side (anon+RLS); setState tras await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void recargar() }, [recargar])

  const sem = semanaActual()
  const mesActual = new Date().toISOString().slice(0, 7)
  // Paridad SPA (vista personal de "mi ritmo"/progreso):
  const misRecibidas = useMemo(
    () => estrellas.filter((e) => e.para === yo.nombre),
    [estrellas, yo],
  )
  const recibidasMes = misRecibidas.filter((e) => (e.creadaEn || '').slice(0, 7) === mesActual)
  const dadasEstaSemana = estrellas.filter((e) => e.de === yo.nombre && e.semana === sem)
  const restantes = Math.max(0, MAX_ESTRELLAS_SEMANA - dadasEstaSemana.length)

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">movdi · ops</div>
            <h1 className="text-2xl font-bold tracking-tight">⭐ estrellas de colaboración</h1>
            <p className="mt-0.5 font-mono text-[11px] text-neutral-500" data-testid="contador-estrellas">
              {misRecibidas.length} recibida(s) en total · {recibidasMes.length} este mes (+{recibidasMes.length * 15} XP)
            </p>
          </div>
          <button onClick={() => setModalDar(true)} data-testid="btn-dar-estrella"
            className="rounded-full bg-movdi-naranja px-4 py-2 text-sm font-medium hover:bg-movdi-naranja/85">
            ⭐ dar estrella {restantes > 0 ? `(${restantes})` : ''}
          </button>
        </header>

        {aviso && (
          <p role="alert" className="mt-4 border border-movdi-naranja/40 bg-movdi-naranja/10 px-3 py-2 font-mono text-xs text-movdi-naranja">
            {aviso}
          </p>
        )}

        {/* Mis estrellas recibidas (paridad: feed personal desc, top 8) */}
        <section className="mt-6">
          <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">mis estrellas recibidas</h2>
          <div className="mt-3 space-y-2" data-testid="feed-recibidas">
            {!cargando && misRecibidas.length === 0 && (
              <p className="py-6 text-center font-mono text-xs text-neutral-500">
                aún no has recibido estrellas · cuando un compañero reconozca tu trabajo, aparecerá aquí
              </p>
            )}
            {misRecibidas.slice(0, 8).map((e) => (
              <div key={e.id} data-testid="estrella-item" className="flex items-start gap-3 card-hover rounded-xl card-hover rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-2.5">
                <span className="text-lg leading-tight">⭐</span>
                <div>
                  <p className="text-sm">&ldquo;{e.motivo}&rdquo;</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase text-neutral-500">
                    de {e.de} · {tiempoRelativo(e.creadaEn)}
                  </p>
                </div>
              </div>
            ))}
            {misRecibidas.length > 8 && (
              <p className="font-mono text-[10px] text-neutral-500">+ {misRecibidas.length - 8} más</p>
            )}
          </div>
        </section>

        {/* Las que he dado (mis propias, siempre visibles para mí) */}
        <section className="mt-8">
          <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">las que he dado</h2>
          <div className="mt-3 space-y-1.5" data-testid="feed-dadas">
            {estrellas.filter((e) => e.de === yo.nombre).slice(0, 10).map((e) => (
              <p key={e.id} className="font-mono text-[11px] text-neutral-400">
                ⭐ para <strong className="text-neutral-200">{e.para}</strong>
                <span className="text-neutral-500"> · &ldquo;{e.motivo}&rdquo; · {e.semana}</span>
              </p>
            ))}
            {!cargando && estrellas.filter((e) => e.de === yo.nombre).length === 0 && (
              <p className="font-mono text-xs text-neutral-500">aún no das estrellas · tienes {MAX_ESTRELLAS_SEMANA} por semana</p>
            )}
          </div>
        </section>

        {/* Feed del equipo — SOLO flag ve_gamificacion_completa (Fase 4.8:
            las estrellas ajenas son privadas; la RLS del cutover lo respalda) */}
        {yo.veGamificacionCompleta && (
          <section className="mt-8">
            <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">últimas del equipo <span className="text-neutral-600">· vista dirección</span></h2>
            <div className="mt-3 space-y-1.5" data-testid="feed-equipo">
              {estrellas.slice(0, 10).map((e) => (
                <p key={e.id} className="font-mono text-[11px] text-neutral-400">
                  ⭐ <strong className="text-neutral-200">{e.de}</strong> → <strong className="text-neutral-200">{e.para}</strong>
                  <span className="text-neutral-500"> · &ldquo;{e.motivo}&rdquo; · {e.semana}</span>
                </p>
              ))}
              {!cargando && estrellas.length === 0 && (
                <p className="font-mono text-xs text-neutral-500">todavía no hay estrellas en el equipo</p>
              )}
            </div>
          </section>
        )}
      </div>

      {modalDar && (
        <ModalDarEstrella
          yo={yo}
          personas={personas}
          estrellas={estrellas}
          restantes={restantes}
          onCerrar={() => setModalDar(false)}
          onDar={async (para, motivo) => {
            const r = await darEstrella({ para, motivo })
            setAviso(r.ok ? null : ('error' in r ? r.error : 'error'))
            await recargar()
            if (r.ok) setModalDar(false)
            return r.ok
          }}
        />
      )}
    </main>
  )
}

// ============================================================
function ModalDarEstrella({ yo, personas, estrellas, restantes, onCerrar, onDar }: {
  yo: Persona
  personas: Persona[]
  estrellas: Estrella[]
  restantes: number
  onCerrar: () => void
  onDar: (para: string, motivo: string) => Promise<boolean>
}) {
  const sem = semanaActual()
  // Paridad SPA: elegibles = todos menos yo, menos a quienes ya di esta semana
  const yaDiEstaSemana = estrellas.filter((e) => e.de === yo.nombre && e.semana === sem).map((e) => e.para)
  const elegibles = personas
    .filter((p) => p.nombre !== yo.nombre && personaDisponible(p) && !yaDiEstaSemana.includes(p.nombre))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  const [para, setPara] = useState('')
  const [motivo, setMotivo] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCerrar}>
      <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900/90 p-5 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="dar estrella">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">⭐ dar una estrella</h2>
          <button onClick={onCerrar} className="text-neutral-500 hover:text-neutral-200">✕</button>
        </div>
        <p className="mb-4 font-mono text-[11px] text-neutral-500" data-testid="estrellas-restantes">
          {restantes === 0
            ? 'ya diste tus 2 estrellas de esta semana · se renuevan el lunes'
            : `te ${restantes === 1 ? 'queda' : 'quedan'} ${restantes} ${restantes === 1 ? 'estrella' : 'estrellas'} esta semana`}
        </p>
        <div className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="estrella-para">para</label>
            <select id="estrella-para" className={inputCls} value={para} onChange={(e) => setPara(e.target.value)} disabled={restantes === 0}>
              <option value="">— elige a quién —</option>
              {elegibles.map((p) => <option key={p.id} value={p.nombre}>{p.nombre} {p.apellido}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="estrella-motivo">motivo (máx {MAX_MOTIVO})</label>
            <input id="estrella-motivo" className={inputCls} maxLength={MAX_MOTIVO} disabled={restantes === 0}
              placeholder="ej: me salvó con el cierre del cliente"
              value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          {err && <p role="alert" className="font-mono text-xs text-movdi-naranja">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
            <button data-testid="btn-dar-confirmar" disabled={guardando || restantes === 0}
              onClick={async () => {
                setErr(null)
                if (!para) { setErr('elige a quién darle la estrella'); return }
                if (!motivo.trim()) { setErr('escribe un motivo breve para la estrella'); return }
                const check = puedoDarEstrella({ yo: yo.nombre, para, estrellas, semana: sem })
                if (!check.ok) { setErr(check.razon); return }
                setGuardando(true)
                const ok = await onDar(para, motivo)
                setGuardando(false)
                if (!ok) setErr('no se pudo — revisa el aviso')
              }}
              className="rounded-full bg-movdi-naranja px-4 py-2 text-xs font-medium hover:bg-movdi-naranja/85 disabled:opacity-50">
              {guardando ? 'dando…' : 'dar estrella ⭐'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
