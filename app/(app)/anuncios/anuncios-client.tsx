'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type Persona } from '@/lib/peticiones'
import {
  type Anuncio, type AnuncioVisto, AUDIENCIAS, AUDIENCIAS_LABEL, TIPOS_ANUNCIO,
  anunciosActivosPara, anuncioVistoPor, mapAnuncioRow, mapVistoRow, puedeCrearAnuncios,
} from '@/lib/anuncios'
import { archivarAnuncio, crearAnuncio, marcarAnuncioVisto } from './actions'

const inputCls = 'w-full border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-orange-600'
const labelCls = 'mb-1 block font-mono text-[11px] uppercase tracking-wider text-neutral-400'

export default function AnunciosClient({ yo }: { yo: Persona }) {
  const [anuncios, setAnuncios] = useState<Anuncio[]>([])
  const [vistos, setVistos] = useState<AnuncioVisto[]>([])
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)
  const [modalCrear, setModalCrear] = useState(false)
  const [detalle, setDetalle] = useState<Anuncio | null>(null)

  const recargar = useCallback(async () => {
    const sb = createClient()
    const [anun, vis] = await Promise.all([
      // paridad SPA: solo activos, más recientes primero
      sb.from('anuncios').select('*').eq('activo', true).order('creado_en', { ascending: false }),
      sb.from('anuncios_vistos').select('*'),
    ])
    if (!anun.error) setAnuncios((anun.data ?? []).map(mapAnuncioRow))
    if (!vis.error) setVistos((vis.data ?? []).map(mapVistoRow))
    setCargando(false)
  }, [])

  // Carga inicial client-side (anon+RLS); setState tras await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void recargar() }, [recargar])

  // Audiencia + expiración (paridad anunciosActivosParaMi)
  const visibles = useMemo(() => anunciosActivosPara(anuncios, yo), [anuncios, yo])
  const noVistos = useMemo(
    () => visibles.filter((a) => !anuncioVistoPor(vistos, a.id, yo.nombre)).length,
    [visibles, vistos, yo],
  )

  async function accion(fn: () => Promise<{ ok: boolean; error?: string }>) {
    const r = await fn()
    setAviso(r.ok ? null : r.error ?? 'error')
    await recargar()
    return r.ok
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">movdi · ops</div>
            <h1 className="text-xl font-semibold">📣 anuncios</h1>
            <p className="mt-0.5 font-mono text-[11px] text-neutral-500" data-testid="contador-no-vistos">
              {visibles.length} activos · {noVistos} sin leer
            </p>
          </div>
          {puedeCrearAnuncios(yo) && (
            <button onClick={() => setModalCrear(true)} data-testid="btn-nuevo-anuncio"
              className="bg-orange-600 px-4 py-2 text-sm font-medium hover:bg-orange-500">
              + nuevo anuncio
            </button>
          )}
        </header>

        {aviso && (
          <p role="alert" className="mt-4 border border-orange-600/40 bg-orange-600/10 px-3 py-2 font-mono text-xs text-orange-500">
            {aviso}
          </p>
        )}

        <section className="mt-6 space-y-3">
          {cargando && <p className="font-mono text-xs text-neutral-500">cargando…</p>}
          {!cargando && visibles.length === 0 && (
            <p className="font-mono text-xs text-neutral-500">no hay anuncios activos para ti</p>
          )}
          {visibles.map((a) => {
            const t = TIPOS_ANUNCIO[a.tipo]
            const visto = anuncioVistoPor(vistos, a.id, yo.nombre)
            return (
              <article key={a.id} data-testid="card-anuncio"
                onClick={() => setDetalle(a)}
                className={`cursor-pointer border p-4 hover:bg-neutral-900 ${visto ? 'border-neutral-800 opacity-70' : 'border-neutral-700'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`border px-1.5 py-0.5 font-mono text-[10px] ${t.clase}`}>{t.label}</span>
                    <h3 className="mt-2 text-sm font-semibold">{a.titulo}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{a.contenido}</p>
                    <p className="mt-2 font-mono text-[10px] text-neutral-500">
                      {a.creadoPor} · para {AUDIENCIAS_LABEL[a.audiencia] ?? a.audiencia}
                      {a.expiraEn ? ` · expira ${a.expiraEn.slice(0, 10)}` : ' · no expira'}
                    </p>
                  </div>
                  <span data-testid="estado-visto"
                    className={`shrink-0 font-mono text-[10px] ${visto ? 'text-emerald-400' : 'text-orange-500'}`}>
                    {visto ? 'leído ✓' : '● sin leer'}
                  </span>
                </div>
              </article>
            )
          })}
        </section>
      </div>

      {modalCrear && (
        <ModalCrearAnuncio
          onCerrar={() => setModalCrear(false)}
          onCrear={async (input) => {
            const ok = await accion(() => crearAnuncio(input))
            if (ok) setModalCrear(false)
            return ok
          }}
        />
      )}
      {detalle && (
        <ModalDetalle
          a={detalle}
          yo={yo}
          vistos={vistos}
          onCerrar={() => setDetalle(null)}
          onVisto={async () => {
            await accion(() => marcarAnuncioVisto({ anuncioId: detalle.id }))
            setDetalle(null)
          }}
          onArchivar={async () => {
            if (!confirm('¿archivar este anuncio?\n\ndejará de aparecer en el tablón. esta acción no se puede deshacer.')) return
            const ok = await accion(() => archivarAnuncio({ id: detalle.id }))
            if (ok) setDetalle(null)
          }}
        />
      )}
    </main>
  )
}

// ============================================================
function ModalDetalle({ a, yo, vistos, onCerrar, onVisto, onArchivar }: {
  a: Anuncio
  yo: Persona
  vistos: AnuncioVisto[]
  onCerrar: () => void
  onVisto: () => Promise<void>
  onArchivar: () => Promise<void>
}) {
  const t = TIPOS_ANUNCIO[a.tipo]
  const visto = anuncioVistoPor(vistos, a.id, yo.nombre)
  const esCreador = a.creadoPor === yo.nombre
  const quienesVieron = vistos.filter((v) => v.anuncioId === a.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCerrar}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-neutral-700 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={a.titulo}>
        <div className="mb-3 flex items-center justify-between">
          <span className={`border px-1.5 py-0.5 font-mono text-[10px] ${t.clase}`}>{t.label}</span>
          <button onClick={onCerrar} className="text-neutral-500 hover:text-neutral-200">✕</button>
        </div>
        <h2 className="text-base font-semibold">{a.titulo}</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{a.contenido}</p>
        <div className="mt-4 border-t border-neutral-800 pt-3 font-mono text-[11px] leading-relaxed text-neutral-400">
          creado por <strong className="text-neutral-200">{a.creadoPor}</strong> · para {AUDIENCIAS_LABEL[a.audiencia] ?? a.audiencia}<br />
          publicado: {a.creadoEn.slice(0, 10)} · {a.expiraEn ? `expira: ${a.expiraEn.slice(0, 10)}` : 'no expira'}<br />
          {visto
            ? <span className="text-emerald-400">tú ya lo viste ✓</span>
            : <span className="text-orange-500">aún no marcado como visto</span>}
        </div>

        {esCreador && (
          <div className="mt-3 border-t border-neutral-800 pt-3" data-testid="vistas-info">
            <p className="font-mono text-[11px] uppercase tracking-wider text-neutral-500">vistas ({quienesVieron.length})</p>
            {quienesVieron.length === 0
              ? <p className="mt-1 text-xs text-neutral-500">aún nadie lo ha visto</p>
              : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {quienesVieron.map((v) => (
                    <span key={v.personaNombre} className="border border-neutral-700 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300">
                      {v.personaNombre}
                    </span>
                  ))}
                </div>
              )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCerrar} className="border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cerrar</button>
          {!visto && !esCreador && (
            <button onClick={onVisto} data-testid="btn-marcar-visto"
              className="bg-orange-600 px-4 py-2 text-xs font-medium hover:bg-orange-500">
              ✓ marcar como visto
            </button>
          )}
          {esCreador && (
            <button onClick={onArchivar} data-testid="btn-archivar-anuncio"
              className="border border-red-500/40 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10">
              archivar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
function ModalCrearAnuncio({ onCerrar, onCrear }: {
  onCerrar: () => void
  onCrear: (input: Parameters<typeof crearAnuncio>[0]) => Promise<boolean>
}) {
  const [titulo, setTitulo] = useState('')
  const [contenido, setContenido] = useState('')
  const [tipo, setTipo] = useState<'urgente' | 'importante' | 'informativo' | 'cultura'>('informativo')
  const [audiencia, setAudiencia] = useState('todos')
  const [expira, setExpira] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCerrar}>
      <div className="w-full max-w-lg border border-neutral-700 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="nuevo anuncio">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">nuevo anuncio</h2>
          <button onClick={onCerrar} className="text-neutral-500 hover:text-neutral-200">✕</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="anu-titulo">título</label>
            <input id="anu-titulo" className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          </div>
          <div>
            <label className={labelCls} htmlFor="anu-contenido">contenido</label>
            <textarea id="anu-contenido" rows={4} className={inputCls} value={contenido} onChange={(e) => setContenido(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="anu-tipo">tipo</label>
              <select id="anu-tipo" className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
                <option value="informativo">🔵 informativo</option>
                <option value="urgente">🔴 urgente</option>
                <option value="importante">🟡 importante</option>
                <option value="cultura">🎉 cultura</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="anu-audiencia">audiencia</label>
              <select id="anu-audiencia" className={inputCls} value={audiencia} onChange={(e) => setAudiencia(e.target.value)}>
                {AUDIENCIAS.map((a) => <option key={a} value={a}>{AUDIENCIAS_LABEL[a]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="anu-expira">expira (opcional — vacío = permanente)</label>
            <input id="anu-expira" type="date" className={inputCls} value={expira} onChange={(e) => setExpira(e.target.value)} />
          </div>
          {err && <p role="alert" className="font-mono text-xs text-orange-500">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCerrar} className="border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
            <button data-testid="btn-crear-anuncio-confirmar" disabled={guardando}
              onClick={async () => {
                setErr(null)
                if (!titulo.trim() || !contenido.trim()) { setErr('completa título y contenido del anuncio'); return }
                setGuardando(true)
                const ok = await onCrear({ titulo, contenido, tipo, audiencia, expira: expira || undefined })
                setGuardando(false)
                if (!ok) setErr('no se pudo publicar — revisa el aviso')
              }}
              className="bg-orange-600 px-4 py-2 text-xs font-medium hover:bg-orange-500 disabled:opacity-50">
              {guardando ? 'publicando…' : 'publicar anuncio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
