'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  AREAS_LABEL, AREAS_VALIDAS, type ModoAsignacion,
  type Persona, type Peticion,
  destinatariosPorModo, diasHasta, dx, isAdmin, labelFecha,
  mapPeticionRow, mapPersonaRow, matchNombre, personaDisponible, puedoVerPeticion,
} from '@/lib/peticiones'
import {
  cambiarEstatus, cambiarFecha, crearPeticion, eliminarPeticion,
  entregarPeticion, moverInstancia,
} from './actions'

type Tab = 'general' | 'mis' | 'pedi' | 'recur'
type Filtro = 'todas' | 'vencidas' | 'semana' | (typeof AREAS_VALIDAS)[number]

const PRIO_COLOR: Record<string, string> = {
  alta: 'text-red-400 border-red-400/40',
  media: 'text-amber-400 border-amber-400/40',
  baja: 'text-neutral-400 border-neutral-600',
}

export default function PeticionesClient({ yo }: { yo: Persona }) {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [peticiones, setPeticiones] = useState<Peticion[]>([])
  const [cargando, setCargando] = useState(true)
  const [tab, setTab] = useState<Tab>('general')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [aviso, setAviso] = useState<string | null>(null)

  // modales
  const [modalCrear, setModalCrear] = useState(false)
  const [modalEntrega, setModalEntrega] = useState<Peticion | null>(null)
  const [modalFecha, setModalFecha] = useState<Peticion | null>(null)
  const [modalMover, setModalMover] = useState<Peticion | null>(null)

  const admin = isAdmin(yo)

  // ---------- lecturas client-side (anon key + RLS) ----------
  const recargar = useCallback(async () => {
    const sb = createClient()
    const [pers, pets] = await Promise.all([
      sb.from('personas').select('*').order('nivel'),
      sb.from('peticiones').select('*').order('fecha'),
    ])
    if (!pers.error) setPersonas((pers.data ?? []).map(mapPersonaRow))
    if (!pets.error) setPeticiones((pets.data ?? []).map(mapPeticionRow))
    setCargando(false)
  }, [])

  // Carga inicial client-side (anon+RLS). Los setState ocurren tras el await,
  // no síncronos — el disable es por el análisis conservador de la regla.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void recargar() }, [recargar])

  // ---------- lista filtrada (paridad renderGeneral/renderMis/renderPedi) ----------
  const lista = useMemo(() => {
    let l = peticiones.filter((t) => puedoVerPeticion(t, yo))
    if (tab === 'recur') l = l.filter((t) => t.origenRecur)
    else l = l.filter((t) => !t.origenRecur)
    if (tab === 'mis') l = l.filter((t) => matchNombre(t.para, yo.nombre))
    if (tab === 'pedi') l = l.filter((t) => t.creadoPor === yo.nombre)
    if (filtro === 'vencidas') l = l.filter((t) => diasHasta(t.fecha) < 0 && t.estatus !== 'entregado')
    else if (filtro === 'semana') l = l.filter((t) => { const d = diasHasta(t.fecha); return d >= 0 && d <= 7 && t.estatus !== 'entregado' })
    else if ((AREAS_VALIDAS as readonly string[]).includes(filtro)) l = l.filter((t) => t.area === filtro)
    return l
  }, [peticiones, tab, filtro, yo])

  const kpis = useMemo(() => {
    const visibles = peticiones.filter((t) => puedoVerPeticion(t, yo) && !t.origenRecur)
    return {
      pendientes: visibles.filter((t) => t.estatus !== 'entregado').length,
      vencidas: visibles.filter((t) => diasHasta(t.fecha) < 0 && t.estatus !== 'entregado').length,
      semana: visibles.filter((t) => { const d = diasHasta(t.fecha); return d >= 0 && d <= 7 && t.estatus !== 'entregado' }).length,
      entregadas: visibles.filter((t) => t.estatus === 'entregado').length,
    }
  }, [peticiones, yo])

  async function accion(fn: () => Promise<{ ok: boolean; error?: string }>) {
    const r = await fn()
    if (!r.ok) setAviso(r.error ?? 'error')
    else setAviso(null)
    await recargar()
    return r.ok
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">movdi · ops</div>
            <h1 className="text-xl font-semibold">peticiones</h1>
          </div>
          <button
            onClick={() => setModalCrear(true)}
            className="bg-orange-600 px-4 py-2 text-sm font-medium hover:bg-orange-500"
            data-testid="btn-nueva-peticion"
          >
            + nueva petición
          </button>
        </header>

        {/* KPIs (paridad calcKpis básica) */}
        <section className="mt-6 grid grid-cols-4 gap-3">
          {([['pendientes', kpis.pendientes], ['vencidas', kpis.vencidas], ['esta semana', kpis.semana], ['entregadas', kpis.entregadas]] as const).map(([lab, val]) => (
            <div key={lab} className="border border-neutral-800 bg-neutral-900 px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">{lab}</div>
              <div className="text-2xl font-semibold">{val}</div>
            </div>
          ))}
        </section>

        {/* Tabs + filtros */}
        <nav className="mt-6 flex flex-wrap items-center gap-2">
          {([['general', 'general'], ['mis', 'mis pendientes'], ['pedi', 'lo que pedí'], ['recur', 'instancias recurrentes']] as const).map(([k, lab]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`border px-3 py-1.5 font-mono text-xs ${tab === k ? 'border-orange-600 text-orange-500' : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'}`}>
              {lab}
            </button>
          ))}
          <span className="mx-2 h-4 w-px bg-neutral-800" />
          {(['todas', 'vencidas', 'semana', ...AREAS_VALIDAS] as Filtro[])
            .filter((f) => f !== 'rh' || yo.esDireccion || yo.nivel === 'rh')
            .map((f) => (
              <button key={f} onClick={() => setFiltro(f)}
                className={`border px-2.5 py-1 font-mono text-[11px] ${filtro === f ? 'border-orange-600 text-orange-500' : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'}`}>
                {AREAS_LABEL[f] ?? f}
              </button>
            ))}
        </nav>

        {aviso && (
          <p role="alert" className="mt-4 border border-orange-600/40 bg-orange-600/10 px-3 py-2 font-mono text-xs text-orange-500">
            {aviso}
          </p>
        )}

        {/* Lista */}
        <section className="mt-6 space-y-3" data-testid="lista-peticiones">
          {cargando && <p className="font-mono text-xs text-neutral-500">cargando…</p>}
          {!cargando && lista.length === 0 && (
            <p className="font-mono text-xs text-neutral-500">no hay peticiones en esta vista</p>
          )}
          {lista.map((t) => (
            <CardPeticion
              key={t.id}
              t={t}
              yo={yo}
              admin={admin}
              onEstatus={(nuevo) => accion(() => cambiarEstatus({ id: t.id, estatus: nuevo }))}
              onEntregar={() => setModalEntrega(t)}
              onCambiarFecha={() => setModalFecha(t)}
              onMover={() => setModalMover(t)}
              onEliminar={async () => {
                if (!confirm('¿eliminar esta petición?')) return
                await accion(() => eliminarPeticion({ id: t.id }))
              }}
            />
          ))}
        </section>
      </div>

      {modalCrear && (
        <ModalCrear
          yo={yo}
          personas={personas}
          admin={admin}
          onCerrar={() => setModalCrear(false)}
          onCrear={async (input) => {
            const ok = await accion(() => crearPeticion(input))
            if (ok) setModalCrear(false)
            return ok
          }}
        />
      )}
      {modalEntrega && (
        <ModalEntrega
          t={modalEntrega}
          onCerrar={() => setModalEntrega(null)}
          onConfirmar={async (link, nota) => {
            const ok = await accion(() => entregarPeticion({ id: modalEntrega.id, link, nota }))
            if (ok) setModalEntrega(null)
          }}
        />
      )}
      {modalFecha && (
        <ModalCambioFecha
          t={modalFecha}
          soyCreador={modalFecha.creadoPor === yo.nombre}
          onCerrar={() => setModalFecha(null)}
          onConfirmar={async (nuevaFecha, motivo, justificada) => {
            const ok = await accion(() =>
              cambiarFecha({ id: modalFecha.id, nuevaFecha, motivo, extensionJustificada: justificada }))
            if (ok) setModalFecha(null)
          }}
        />
      )}
      {modalMover && (
        <ModalMoverInstancia
          t={modalMover}
          onCerrar={() => setModalMover(null)}
          onConfirmar={async (nuevaFecha, motivo, justificada) => {
            const ok = await accion(() =>
              moverInstancia({ peticionId: modalMover.id, nuevaFecha, motivo, justificada }))
            if (ok) setModalMover(null)
          }}
        />
      )}
    </main>
  )
}

// ============================================================
function CardPeticion({ t, yo, admin, onEstatus, onEntregar, onCambiarFecha, onMover, onEliminar }: {
  t: Peticion
  yo: Persona
  admin: boolean
  onEstatus: (n: 'pendiente' | 'proceso') => void
  onEntregar: () => void
  onCambiarFecha: () => void
  onMover: () => void
  onEliminar: () => void
}) {
  const soyCreador = t.creadoPor === yo.nombre
  const soyDest = matchNombre(t.para, yo.nombre)
  const puedoActuar = soyCreador || soyDest
  const lf = labelFecha(t)
  const vencida = t.estatus !== 'entregado' && diasHasta(t.fecha) < 0

  return (
    <article data-testid="card-peticion" className="border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {t.privada && <span title="privada · solo creador y destinatario">🔒 </span>}
            {t.nombre}
            {t.grupoId && <span className="ml-2 font-mono text-[10px] text-neutral-500">grupo</span>}
            {t.origenRecur && <span className="ml-2 font-mono text-[10px] text-amber-400">↻ recurrente</span>}
          </h3>
          <p className="mt-0.5 font-mono text-[11px] text-neutral-500">
            de <strong className="text-neutral-300">{t.creadoPor}</strong> para{' '}
            <strong className="text-neutral-300">{t.para}</strong>
            {t.area && <> · <span className="uppercase">{AREAS_LABEL[t.area] ?? t.area}</span></>}
          </p>
          {t.descripcion && <p className="mt-1 text-xs text-neutral-400">{t.descripcion}</p>}
          {t.motivoCambioFecha && (
            <p className="mt-1 border-l-2 border-amber-400/50 pl-2 font-mono text-[11px] text-amber-400/90">
              fecha movida{t.fechaOriginal ? ` (original: ${t.fechaOriginal})` : ''} · {t.motivoCambioFecha}
              {t.extensionJustificada === false && ' · cuenta contra la fecha original'}
            </p>
          )}
          {t.estatus === 'entregado' && (t.linkEntrega || t.notaEntrega) && (
            <p className="mt-1 font-mono text-[11px] text-emerald-400/90" data-testid="evidencia">
              evidencia: {t.linkEntrega && <a className="underline" href={t.linkEntrega} target="_blank" rel="noreferrer">{t.linkEntrega}</a>}
              {t.linkEntrega && t.notaEntrega && ' · '}
              {t.notaEntrega}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${PRIO_COLOR[t.prioridad]}`}>{t.prioridad}</span>
          <span className={`px-2 py-0.5 font-mono text-[10px] ${t.estatus === 'entregado' ? 'text-emerald-400' : vencida ? 'text-red-400' : 'text-neutral-300'}`}>
            {lf}
          </span>
          <span className="font-mono text-[10px] uppercase text-neutral-500">{t.estatus}</span>
        </div>
      </div>

      {puedoActuar && (
        <div className="mt-3 flex flex-wrap gap-2">
          {t.estatus !== 'entregado' && (
            <>
              <button onClick={onEntregar} data-testid="btn-entregar"
                className="border border-emerald-500/50 px-2.5 py-1 font-mono text-[11px] text-emerald-400 hover:bg-emerald-500/10">
                entregar ✓
              </button>
              <button onClick={() => onEstatus(t.estatus === 'proceso' ? 'pendiente' : 'proceso')}
                className="border border-neutral-700 px-2.5 py-1 font-mono text-[11px] text-neutral-300 hover:border-neutral-500">
                {t.estatus === 'proceso' ? '↩ a pendiente' : '▶ en proceso'}
              </button>
              <button onClick={onCambiarFecha} data-testid="btn-cambiar-fecha"
                className="border border-neutral-700 px-2.5 py-1 font-mono text-[11px] text-neutral-300 hover:border-neutral-500">
                cambiar fecha
              </button>
            </>
          )}
          {t.estatus === 'entregado' && (
            <button onClick={() => onEstatus('pendiente')}
              className="border border-neutral-700 px-2.5 py-1 font-mono text-[11px] text-neutral-300 hover:border-neutral-500">
              reabrir
            </button>
          )}
          {t.origenRecur && (soyCreador || admin) && t.estatus !== 'entregado' && (
            <button onClick={onMover} data-testid="btn-mover-instancia"
              className="border border-amber-400/50 px-2.5 py-1 font-mono text-[11px] text-amber-400 hover:bg-amber-400/10">
              mover instancia
            </button>
          )}
          {soyCreador && (
            <button onClick={onEliminar}
              className="border border-red-500/40 px-2.5 py-1 font-mono text-[11px] text-red-400 hover:bg-red-500/10">
              eliminar
            </button>
          )}
        </div>
      )}
    </article>
  )
}

// ============================================================
function ModalShell({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCerrar}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-neutral-700 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <button onClick={onCerrar} className="text-neutral-500 hover:text-neutral-200">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputCls = 'w-full border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-orange-600'
const labelCls = 'mb-1 block font-mono text-[11px] uppercase tracking-wider text-neutral-400'

// ============================================================
function ModalCrear({ yo, personas, admin, onCerrar, onCrear }: {
  yo: Persona
  personas: Persona[]
  admin: boolean
  onCerrar: () => void
  onCrear: (input: Parameters<typeof crearPeticion>[0]) => Promise<boolean>
}) {
  const areaDefault = yo.areas?.find((a) => (AREAS_VALIDAS as readonly string[]).includes(a)) || 'imkt'
  // candado por default para RH / Salvador (paridad SPA)
  const candadoDefault = yo.nivel === 'rh' || yo.nombre === 'Salvador'

  const [nombre, setNombre] = useState('')
  const [desc, setDesc] = useState('')
  const [fecha, setFecha] = useState(dx(7))
  const [prio, setPrio] = useState<'alta' | 'media' | 'baja'>('media')
  const [privada, setPrivada] = useState(candadoDefault)
  const [modo, setModo] = useState<ModoAsignacion>('una')
  const [para, setPara] = useState('')
  const [areaUna, setAreaUna] = useState(areaDefault)
  const [areaGrupo, setAreaGrupo] = useState(areaDefault)
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const elegibles = personas
    .filter((p) => p.nombre !== yo.nombre && personaDisponible(p))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
  const delArea = (area: string) => elegibles.filter((p) => p.areas.includes(area))

  const modos: { v: ModoAsignacion; lab: string; adminOnly?: boolean }[] = [
    { v: 'una', lab: 'una persona' },
    { v: 'varias', lab: 'varias personas · selección manual' },
    { v: 'area', lab: 'un área completa' },
    { v: 'heads', lab: 'solo heads · admin only', adminOnly: true },
    { v: 'ejecutivos', lab: 'solo ejecutivos · admin only', adminOnly: true },
    { v: 'todos', lab: 'todo el equipo · admin only', adminOnly: true },
  ]

  async function guardar() {
    setErr(null)
    if (!nombre.trim()) { setErr('el nombre de la petición es obligatorio'); return }
    const { destinatarios } = destinatariosPorModo(modo, {
      personas, yo, para, seleccion, area: modo === 'una' ? areaUna : areaGrupo,
    })
    if (!destinatarios.length) { setErr(modo === 'una' ? 'falta destinatario' : 'selecciona al menos una persona'); return }
    // Confirmación si son más de 5 (paridad SPA)
    if (destinatarios.length > 5 &&
      !confirm(`vas a asignar esta petición a ${destinatarios.length} personas. ¿confirmas?\n\n${destinatarios.join(', ')}`)) return
    setGuardando(true)
    const ok = await onCrear({
      nombre, descripcion: desc, fecha, prioridad: prio, privada, modo,
      para: modo === 'una' ? para : undefined,
      seleccion: modo === 'varias' ? seleccion : undefined,
      area: modo === 'una' ? areaUna : modo === 'area' ? areaGrupo : undefined,
    })
    setGuardando(false)
    if (!ok) setErr('no se pudo crear — revisa el aviso')
  }

  return (
    <ModalShell titulo="nueva petición" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="pet-nombre">nombre de la petición</label>
          <input id="pet-nombre" className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </div>
        <div>
          <label className={labelCls} htmlFor="pet-desc">descripción</label>
          <textarea id="pet-desc" rows={3} className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>

        <div>
          <span className={labelCls}>asignar a</span>
          <div className="space-y-1 border border-neutral-800 bg-neutral-950 p-2">
            {modos.filter((m) => !m.adminOnly || admin).map((m) => (
              <label key={m.v} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-neutral-900">
                <input type="radio" name="pet-modo" value={m.v} checked={modo === m.v}
                  onChange={() => setModo(m.v)} />
                <span>{m.lab}</span>
              </label>
            ))}
          </div>
        </div>

        {modo === 'una' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="pet-area">área</label>
              <select id="pet-area" className={inputCls} value={areaUna} onChange={(e) => { setAreaUna(e.target.value); setPara('') }}>
                {AREAS_VALIDAS.map((a) => <option key={a} value={a}>{AREAS_LABEL[a]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="pet-para">para</label>
              <select id="pet-para" className={inputCls} value={para} onChange={(e) => setPara(e.target.value)}>
                <option value="">— elige —</option>
                {delArea(areaUna).map((p) => (
                  <option key={p.id} value={p.nombre}>{p.nombre} {p.apellido} · {p.rol}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {modo === 'varias' && (
          <div>
            <span className={labelCls}>personas · seleccionadas: {seleccion.length}</span>
            <div className="max-h-44 space-y-1 overflow-y-auto border border-neutral-800 bg-neutral-950 p-2">
              {elegibles.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-neutral-900">
                  <input type="checkbox" checked={seleccion.includes(p.nombre)}
                    onChange={(e) => setSeleccion((s) => e.target.checked ? [...s, p.nombre] : s.filter((x) => x !== p.nombre))} />
                  <span>{p.nombre} {p.apellido} <span className="text-neutral-500">{p.nivel}</span></span>
                </label>
              ))}
            </div>
          </div>
        )}

        {modo === 'area' && (
          <div>
            <label className={labelCls} htmlFor="pet-area-grupo">área destino</label>
            <select id="pet-area-grupo" className={inputCls} value={areaGrupo} onChange={(e) => setAreaGrupo(e.target.value)}>
              {AREAS_VALIDAS.map((a) => <option key={a} value={a}>{AREAS_LABEL[a]}</option>)}
            </select>
            <p className="mt-1 font-mono text-[11px] text-neutral-500">
              — se asignará a {delArea(areaGrupo).length} persona(s) de {AREAS_LABEL[areaGrupo]} —
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="pet-fecha">fecha límite</label>
            <input id="pet-fecha" type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="pet-prio">prioridad</label>
            <select id="pet-prio" className={inputCls} value={prio} onChange={(e) => setPrio(e.target.value as typeof prio)}>
              <option value="media">media</option>
              <option value="alta">alta</option>
              <option value="baja">baja</option>
            </select>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" id="pet-privada" checked={privada} onChange={(e) => setPrivada(e.target.checked)} />
          <span>🔒 petición privada <span className="text-neutral-500">— solo tú y el destinatario la ven (ni dirección)</span></span>
        </label>

        {err && <p role="alert" className="font-mono text-xs text-orange-500">{err}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCerrar} className="border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button onClick={guardar} disabled={guardando} data-testid="btn-crear-confirmar"
            className="bg-orange-600 px-4 py-2 text-xs font-medium hover:bg-orange-500 disabled:opacity-50">
            {guardando ? 'creando…' : 'crear petición'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ============================================================
function ModalEntrega({ t, onCerrar, onConfirmar }: {
  t: Peticion
  onCerrar: () => void
  onConfirmar: (link: string, nota: string) => Promise<void>
}) {
  const [link, setLink] = useState('')
  const [nota, setNota] = useState('')
  return (
    <ModalShell titulo={`marcar entregado · ${t.nombre}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="font-mono text-[11px] text-neutral-500">la evidencia es opcional — puedes dejar ambos campos vacíos.</p>
        <div>
          <label className={labelCls} htmlFor="ent-link">link de entrega (opcional)</label>
          <input id="ent-link" className={inputCls} placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="ent-nota">nota (opcional)</label>
          <textarea id="ent-nota" rows={2} className={inputCls} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button onClick={() => onConfirmar(link, nota)} data-testid="btn-entrega-confirmar"
            className="bg-emerald-600 px-4 py-2 text-xs font-medium hover:bg-emerald-500">
            marcar entregado ✓
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ============================================================
function ModalCambioFecha({ t, soyCreador, onCerrar, onConfirmar }: {
  t: Peticion
  soyCreador: boolean
  onCerrar: () => void
  onConfirmar: (nuevaFecha: string, motivo: string, justificada?: boolean) => Promise<void>
}) {
  const sugerida = (() => { const f = new Date(t.fecha); f.setDate(f.getDate() + 7); return f.toISOString().slice(0, 10) })()
  const [fecha, setFecha] = useState(sugerida)
  const [motivo, setMotivo] = useState('')
  const [justif, setJustif] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  return (
    <ModalShell titulo={`cambiar fecha · ${t.nombre}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-neutral-300">
          {soyCreador
            ? <>tú creaste esta petición para <strong>{t.para}</strong>. al cambiar la fecha le das más tiempo — verá la nueva fecha y tu motivo.</>
            : <>esta petición fue creada por <strong>{t.creadoPor}</strong>. al cambiarla, le aparecerá una alerta con tu motivo.</>}
        </p>
        <div>
          <label className={labelCls} htmlFor="cf-fecha">nueva fecha</label>
          <input id="cf-fecha" type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="cf-motivo">motivo del cambio (obligatorio)</label>
          <textarea id="cf-motivo" rows={3} className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder={soyCreador ? 'ej: le di unos días más por incapacidad médica…' : 'ej: el cliente aún no manda los archivos finales…'} />
          <p className="mt-1 font-mono text-[10px] text-neutral-500">mínimo 10 caracteres</p>
        </div>
        {soyCreador && (
          <div>
            <span className={labelCls}>¿esta extensión cuenta como entrega a tiempo?</span>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-2 border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs">
                <input type="radio" name="cf-justif" checked={justif} onChange={() => setJustif(true)} />
                <span><strong>sí</strong> · causa justificada — la puntualidad se mide contra la fecha nueva</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs">
                <input type="radio" name="cf-justif" checked={!justif} onChange={() => setJustif(false)} />
                <span><strong>no</strong> · se les pasó — se mide contra la fecha original, cuenta como tarde</span>
              </label>
            </div>
          </div>
        )}
        {err && <p role="alert" className="font-mono text-xs text-orange-500">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button data-testid="btn-fecha-confirmar"
            onClick={async () => {
              if (motivo.trim().length < 10) { setErr('escribe al menos 10 caracteres explicando el motivo'); return }
              await onConfirmar(fecha, motivo, soyCreador ? justif : undefined)
            }}
            className="bg-orange-600 px-4 py-2 text-xs font-medium hover:bg-orange-500">
            guardar cambio
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ============================================================
function ModalMoverInstancia({ t, onCerrar, onConfirmar }: {
  t: Peticion
  onCerrar: () => void
  onConfirmar: (nuevaFecha: string, motivo: string, justificada: boolean) => Promise<void>
}) {
  const sugerida = (() => { const f = new Date(t.fecha + 'T00:00:00'); f.setDate(f.getDate() + 2); return f.toISOString().slice(0, 10) })()
  const [fecha, setFecha] = useState(sugerida)
  const [motivo, setMotivo] = useState('')
  const [justif, setJustif] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  return (
    <ModalShell titulo={`mover entrega · ${t.nombre}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs">
          para <strong>{t.para}</strong> · fecha original de esta entrega: {t.fecha}
        </p>
        <div>
          <label className={labelCls} htmlFor="mi-fecha">nueva fecha</label>
          <input id="mi-fecha" type="date" className={inputCls} min={dx(0)} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mi-motivo">motivo (obligatorio)</label>
          <textarea id="mi-motivo" rows={3} className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder={`ej: ${t.para} está enferma esta semana`} />
          <p className="mt-1 font-mono text-[10px] text-neutral-500">mínimo 10 caracteres · {t.para} verá este motivo</p>
        </div>
        <div>
          <span className={labelCls}>¿cuenta como entrega a tiempo?</span>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-2 border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs">
              <input type="radio" name="mi-justif" checked={justif} onChange={() => setJustif(true)} />
              <span><strong>sí</strong> · causa justificada</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs">
              <input type="radio" name="mi-justif" checked={!justif} onChange={() => setJustif(false)} />
              <span><strong>no</strong> · cuenta contra la fecha original</span>
            </label>
          </div>
        </div>
        <p className="border border-amber-400/20 bg-amber-400/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-neutral-400">
          ℹ la siguiente entrega del patrón llegará en su fecha habitual
        </p>
        {err && <p role="alert" className="font-mono text-xs text-orange-500">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button data-testid="btn-mover-confirmar"
            onClick={async () => {
              if (motivo.trim().length < 10) { setErr('el motivo debe tener al menos 10 caracteres'); return }
              if (fecha === t.fecha) { setErr('la nueva fecha es igual a la actual. elige otra'); return }
              await onConfirmar(fecha, motivo, justif)
            }}
            className="bg-amber-500 px-4 py-2 text-xs font-medium text-black hover:bg-amber-400">
            mover entrega
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
