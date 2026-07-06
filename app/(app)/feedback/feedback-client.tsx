'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type Persona, fechaCorta, mapPersonaRow, personaDisponible } from '@/lib/peticiones'
import { esDireccion } from '@/lib/equipo'
import {
  type Feedback, type FeedbackCategoria, type FeedbackEstado,
  CATEGORIAS, ESTADOS, MAX_MENSAJE, REGLA_DE_LA_CASA, mapFeedbackRow,
} from '@/lib/feedback'
import { enviarFeedback, gestionarFeedback } from './actions'

const inputCls = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-movdi-naranja'
const labelCls = 'mb-1 block font-mono text-[11px] uppercase tracking-wider text-neutral-400'

export default function FeedbackClient({ yo }: { yo: Persona }) {
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [personaIds, setPersonaIds] = useState<Record<string, string>>({}) // id → nombre
  const [cargando, setCargando] = useState(true)
  const [moduloActivo, setModuloActivo] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const soyGestion = esDireccion({ esDireccion: yo.esDireccion, nivel: yo.nivel }) || yo.veGamificacionCompleta

  const recargar = useCallback(async () => {
    const sb = createClient()
    const [fb, pers] = await Promise.all([
      sb.from('feedback').select('*').order('created_at', { ascending: false }),
      sb.from('personas').select('*'),
    ])
    if (fb.error) {
      // pre-cutover la tabla no existe: el módulo avisa sin romper nada
      setModuloActivo(false)
    } else {
      setModuloActivo(true)
      setFeedback((fb.data ?? []).map(mapFeedbackRow))
    }
    if (!pers.error) {
      const rows = pers.data ?? []
      setPersonas(rows.map(mapPersonaRow))
      setPersonaIds(Object.fromEntries(rows.map((r) => [r.id, r.nombre])))
    }
    setCargando(false)
  }, [])

  // Carga inicial client-side (anon+RLS); setState tras await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void recargar() }, [recargar])

  const nombreDe = useCallback(
    (id: string | null) => (id ? personaIds[id] ?? '—' : null),
    [personaIds],
  )

  // muro 🙌 (reconocimientos públicos)
  const muro = useMemo(
    () => feedback.filter((f) => f.categoria === 'reconocimiento' && f.esPublico),
    [feedback],
  )

  // "qué nos dijeron / qué hicimos": resueltos compartibles, agrupados por mes
  const loop = useMemo(() => {
    const items = feedback.filter((f) => f.estado === 'resuelto' && f.compartibleLoop && f.respuesta)
    const porMes = new Map<string, Feedback[]>()
    for (const f of items) {
      const mes = (f.creadaEn || '').slice(0, 7) || 'sin fecha'
      porMes.set(mes, [...(porMes.get(mes) ?? []), f])
    }
    return [...porMes.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [feedback])

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="border-b border-neutral-800 pb-4">
          <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">movdi · ops</div>
          <h1 className="text-2xl font-bold tracking-tight">💬 feedback interno</h1>
          <p className="mt-0.5 font-mono text-[11px] text-neutral-500">
            reconocimientos al muro · mejora y liderazgo solo los lee dirección · anónimo de verdad (se borra la autoría en la base)
          </p>
        </header>

        {aviso && <p role="alert" className="rounded-xl border border-movdi-naranja/40 bg-movdi-naranja/10 px-3 py-2 font-mono text-xs text-movdi-naranja">{aviso}</p>}
        {okMsg && <p role="status" data-testid="feedback-ok" className="rounded-xl border border-movdi-verde/40 bg-movdi-verde/10 px-3 py-2 font-mono text-xs text-movdi-verde">{okMsg}</p>}

        {!moduloActivo && !cargando && (
          <p data-testid="feedback-inactivo" className="rounded-2xl border border-movdi-amarillo/40 bg-movdi-amarillo/10 px-4 py-3 font-mono text-xs text-movdi-amarillo">
            el módulo de feedback se activa en el cutover (la tabla aún no existe en esta base) — la UI ya está lista.
          </p>
        )}

        {/* ── formulario ─────────────────────────────────── */}
        {moduloActivo && (
          <FormularioFeedback
            personas={personas}
            yo={yo}
            onEnviar={async (input) => {
              const r = await enviarFeedback(input)
              if (!r.ok) { setAviso(r.error); setOkMsg(null); return false }
              setAviso(null)
              setOkMsg(
                input.categoria === 'reconocimiento'
                  ? `¡reconocimiento publicado! 🙌${r.data?.estrella ? ' · llevó estrella ⭐' : ''}`
                  : 'recibido — dirección lo revisará. gracias por decirlo 💬',
              )
              await recargar()
              return true
            }}
          />
        )}

        {/* ── muro de reconocimientos ─────────────────────── */}
        {moduloActivo && (
          <section data-testid="muro">
            <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">🙌 muro de reconocimientos</h2>
            <div className="mt-3 space-y-2">
              {!cargando && muro.length === 0 && (
                <p className="font-mono text-xs text-neutral-500">aún no hay reconocimientos — sé quien arranque el muro 🙌</p>
              )}
              {muro.map((f) => (
                <article key={f.id} data-testid="muro-item"
                  className="card-hover rounded-xl border border-movdi-rosa/30 bg-movdi-rosa/5 px-4 py-3">
                  <p className="text-sm">&ldquo;{f.mensaje}&rdquo;</p>
                  <p className="mt-1 font-mono text-[10px] uppercase text-neutral-500">
                    de <strong className="text-neutral-300">{f.esAnonimo ? 'anónimo' : nombreDe(f.autorId) ?? 'anónimo'}</strong>
                    {' '}para <strong className="text-movdi-rosa">{nombreDe(f.destinatarioId) ?? 'todo el equipo'}</strong>
                    {f.creadaEn && <> · {fechaCorta(f.creadaEn.slice(0, 10))}</>}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ── qué nos dijeron / qué hicimos ───────────────── */}
        {moduloActivo && loop.length > 0 && (
          <section data-testid="loop-publico">
            <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">🔁 qué nos dijeron / qué hicimos</h2>
            <p className="mt-1 font-mono text-[10px] text-neutral-500">resumen de feedback atendido — siempre sin autores</p>
            <div className="mt-3 space-y-4">
              {loop.map(([mes, items]) => (
                <div key={mes}>
                  <h3 className="font-mono text-[11px] uppercase tracking-widest text-movdi-azul">
                    {mes} · {items.length} {items.length === 1 ? 'tema atendido' : 'temas atendidos'}
                  </h3>
                  <div className="mt-2 space-y-2">
                    {items.map((f) => (
                      <article key={f.id} data-testid="loop-item"
                        className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
                        <p className="font-mono text-[10px] uppercase text-neutral-500">nos dijeron:</p>
                        <p className="mt-0.5 text-sm text-neutral-300">&ldquo;{f.mensaje}&rdquo;</p>
                        <p className="mt-2 font-mono text-[10px] uppercase text-movdi-verde">qué hicimos:</p>
                        <p className="mt-0.5 text-sm">{f.respuesta}</p>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── bandeja de dirección ────────────────────────── */}
        {moduloActivo && soyGestion && (
          <BandejaDireccion
            feedback={feedback}
            nombreDe={nombreDe}
            onGestionar={async (input) => {
              const r = await gestionarFeedback(input)
              if (!r.ok) setAviso(r.error)
              else setAviso(null)
              await recargar()
            }}
          />
        )}
      </div>
    </main>
  )
}

// ============================================================
function FormularioFeedback({ personas, yo, onEnviar }: {
  personas: Persona[]
  yo: Persona
  onEnviar: (i: { categoria: FeedbackCategoria; mensaje: string; esAnonimo: boolean; destinatarioNombre: string | null }) => Promise<boolean>
}) {
  const [categoria, setCategoria] = useState<FeedbackCategoria>('reconocimiento')
  const [destinatario, setDestinatario] = useState('') // '' = todo el equipo
  const [mensaje, setMensaje] = useState('')
  const [esAnonimo, setEsAnonimo] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const elegibles = personas
    .filter((p) => p.nombre !== yo.nombre && personaDisponible(p))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return (
    <section data-testid="form-feedback" className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">enviar feedback</h2>

      {/* 1) categoría primero */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {CATEGORIAS.map((c) => (
          <button key={c.v} onClick={() => { setCategoria(c.v); if (c.v !== 'reconocimiento') setDestinatario('') }}
            data-testid={`cat-${c.v}`}
            className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${categoria === c.v ? 'border-movdi-naranja bg-movdi-naranja/10' : 'border-neutral-800 hover:border-neutral-600'}`}>
            <span className="block text-sm font-semibold">{c.icono} {c.label}</span>
            <span className="mt-0.5 block font-mono text-[10px] text-neutral-500">{c.hint}</span>
          </button>
        ))}
      </div>

      {/* 2) destinatario (solo reconocimiento) */}
      {categoria === 'reconocimiento' && (
        <div className="mt-4 max-w-xs">
          <label className={labelCls} htmlFor="fb-para">¿para quién?</label>
          <select id="fb-para" className={inputCls} value={destinatario} onChange={(e) => setDestinatario(e.target.value)}>
            <option value="">🙌 todo el equipo</option>
            {elegibles.map((p) => <option key={p.id} value={p.nombre}>{p.nombre} {p.apellido}</option>)}
          </select>
        </div>
      )}

      <div className="mt-4">
        <label className={labelCls} htmlFor="fb-mensaje">tu mensaje</label>
        <textarea id="fb-mensaje" rows={3} maxLength={MAX_MENSAJE} className={inputCls}
          value={mensaje} onChange={(e) => setMensaje(e.target.value)}
          placeholder={categoria === 'reconocimiento' ? 'ej: se aventó el cierre del cliente en tiempo récord…' : 'ej: propongo que…'} />
      </div>

      {/* 3) anónimo/firmado en las 3 categorías */}
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs">
        <input type="checkbox" id="fb-anonimo" checked={esAnonimo} onChange={(e) => setEsAnonimo(e.target.checked)} />
        <span>🕶 enviar como <strong>anónimo</strong> <span className="text-neutral-500">— la autoría se elimina en la base, no solo se oculta</span></span>
      </label>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-wide text-neutral-500">
          regla de la casa: {REGLA_DE_LA_CASA}
        </p>
        <button data-testid="btn-enviar-feedback" disabled={enviando}
          onClick={async () => {
            setEnviando(true)
            const ok = await onEnviar({
              categoria, mensaje, esAnonimo,
              destinatarioNombre: categoria === 'reconocimiento' && destinatario ? destinatario : null,
            })
            setEnviando(false)
            if (ok) { setMensaje(''); setDestinatario(''); setEsAnonimo(false) }
          }}
          className="rounded-full bg-movdi-naranja px-4 py-2 text-xs font-medium transition-colors hover:bg-movdi-naranja/85 disabled:opacity-50">
          {enviando ? 'enviando…' : 'enviar →'}
        </button>
      </div>
    </section>
  )
}

// ============================================================
function BandejaDireccion({ feedback, nombreDe, onGestionar }: {
  feedback: Feedback[]
  nombreDe: (id: string | null) => string | null
  onGestionar: (i: { id: string; estado?: FeedbackEstado; respuesta?: string; compartibleLoop?: boolean }) => Promise<void>
}) {
  const [fCat, setFCat] = useState<'todas' | FeedbackCategoria>('todas')
  const [fEstado, setFEstado] = useState<'todos' | FeedbackEstado>('todos')

  const lista = feedback
    .filter((f) => fCat === 'todas' || f.categoria === fCat)
    .filter((f) => fEstado === 'todos' || f.estado === fEstado)

  return (
    <section data-testid="bandeja-direccion" className="rounded-2xl border border-movdi-azul/30 bg-movdi-azul/5 p-5">
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-movdi-azul">📥 bandeja de dirección</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <select aria-label="filtrar por categoría" data-testid="bandeja-filtro-cat" value={fCat}
          onChange={(e) => setFCat(e.target.value as typeof fCat)}
          className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 font-mono text-[11px] text-neutral-300 outline-none">
          <option value="todas">categoría: todas</option>
          {CATEGORIAS.map((c) => <option key={c.v} value={c.v}>{c.icono} {c.label}</option>)}
        </select>
        <select aria-label="filtrar por estado" data-testid="bandeja-filtro-estado" value={fEstado}
          onChange={(e) => setFEstado(e.target.value as typeof fEstado)}
          className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 font-mono text-[11px] text-neutral-300 outline-none">
          <option value="todos">estado: todos</option>
          {ESTADOS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
      </div>

      <div className="mt-3 space-y-2">
        {lista.length === 0 && <p className="font-mono text-xs text-neutral-500">sin feedback con esos filtros</p>}
        {lista.map((f) => <CardBandeja key={f.id} f={f} nombreDe={nombreDe} onGestionar={onGestionar} />)}
      </div>
    </section>
  )
}

function CardBandeja({ f, nombreDe, onGestionar }: {
  f: Feedback
  nombreDe: (id: string | null) => string | null
  onGestionar: (i: { id: string; estado?: FeedbackEstado; respuesta?: string; compartibleLoop?: boolean }) => Promise<void>
}) {
  const [estado, setEstado] = useState<FeedbackEstado>(f.estado)
  const [respuesta, setRespuesta] = useState(f.respuesta ?? '')
  const [compartible, setCompartible] = useState(f.compartibleLoop)
  const [guardando, setGuardando] = useState(false)
  const cat = CATEGORIAS.find((c) => c.v === f.categoria)!

  return (
    <article data-testid="bandeja-item" className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-neutral-700 px-2 py-0.5 font-mono text-[10px] uppercase text-neutral-300">{cat.icono} {cat.label}</span>
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${f.estado === 'resuelto' ? 'border-movdi-verde/40 text-movdi-verde' : f.estado === 'en_revision' ? 'border-movdi-amarillo/40 text-movdi-amarillo' : 'border-neutral-700 text-neutral-400'}`}>
          {ESTADOS.find((s) => s.v === f.estado)?.label}
        </span>
        <span className="font-mono text-[10px] text-neutral-500">
          {f.creadaEn ? fechaCorta(f.creadaEn.slice(0, 10)) : ''} · de{' '}
          <strong className="text-neutral-300" data-testid="bandeja-autor">{f.esAnonimo ? '🕶 anónimo' : nombreDe(f.autorId) ?? '🕶 anónimo'}</strong>
          {f.destinatarioId && <> para <strong className="text-neutral-300">{nombreDe(f.destinatarioId)}</strong></>}
        </span>
      </div>
      <p className="mt-2 text-sm text-neutral-200">&ldquo;{f.mensaje}&rdquo;</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls} htmlFor={`estado-${f.id}`}>estado</label>
          <select id={`estado-${f.id}`} value={estado} onChange={(e) => setEstado(e.target.value as FeedbackEstado)}
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 font-mono text-[11px] text-neutral-200 outline-none">
            {ESTADOS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label className={labelCls} htmlFor={`resp-${f.id}`}>respuesta (al resolver)</label>
          <input id={`resp-${f.id}`} value={respuesta} onChange={(e) => setRespuesta(e.target.value)}
            placeholder="qué se hizo / qué se decidió…"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-movdi-naranja" />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 pb-1.5 font-mono text-[11px] text-neutral-300">
          <input type="checkbox" checked={compartible} onChange={(e) => setCompartible(e.target.checked)}
            data-testid="check-compartible" />
          🔁 compartible
        </label>
        <button data-testid="btn-guardar-gestion" disabled={guardando}
          onClick={async () => {
            setGuardando(true)
            await onGestionar({ id: f.id, estado, respuesta, compartibleLoop: compartible })
            setGuardando(false)
          }}
          className="rounded-full border border-movdi-verde/50 px-3 py-1.5 font-mono text-[11px] text-movdi-verde transition-colors hover:bg-movdi-verde/10 disabled:opacity-50">
          {guardando ? 'guardando…' : 'guardar ✓'}
        </button>
      </div>
    </article>
  )
}
