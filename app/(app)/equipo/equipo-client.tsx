'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  AREAS_LABEL, AREAS_VALIDAS, type Peticion,
  dx, estaPausada, isAdmin, mapPeticionRow, matchNombre,
} from '@/lib/peticiones'
import { type Recurrente, mapRecurRow, obtenerInstanciasRecur } from '@/lib/recurrentes'
import {
  type PersonaConManagers, bloquesEquipo, calcularSemaforo, mapPersonaConManagers, ordenSemaforo,
} from '@/lib/equipo'
import {
  crearPersona, desactivarConReasignacion, editarPersona,
  pausarPersona, reactivarPersona, reanudarPersona,
} from './actions'

const inputCls = 'w-full border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-orange-600'
const labelCls = 'mb-1 block font-mono text-[11px] uppercase tracking-wider text-neutral-400'

const SEM_COLOR: Record<string, string> = {
  r: 'bg-red-500', y: 'bg-amber-400', g: 'bg-emerald-500', x: 'bg-neutral-600',
}

type FiltroEquipo = 'activas' | 'pausadas' | 'inactivas'

export default function EquipoClient({ yo }: { yo: PersonaConManagers }) {
  const [personas, setPersonas] = useState<PersonaConManagers[]>([])
  const [peticiones, setPeticiones] = useState<Peticion[]>([])
  const [recurrentes, setRecurrentes] = useState<Recurrente[]>([])
  const [filtro, setFiltro] = useState<FiltroEquipo>('activas')
  const [aviso, setAviso] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [modalPersona, setModalPersona] = useState<{ editar: PersonaConManagers | null } | null>(null)
  const [modalReasign, setModalReasign] = useState<PersonaConManagers | null>(null)

  const admin = isAdmin(yo)

  const recargar = useCallback(async () => {
    const sb = createClient()
    const [pers, pets, recs] = await Promise.all([
      sb.from('personas').select('*').order('nivel'),
      sb.from('peticiones').select('*'),
      sb.from('recurrentes').select('*'),
    ])
    if (!pers.error) setPersonas((pers.data ?? []).map(mapPersonaConManagers))
    if (!pets.error) setPeticiones((pets.data ?? []).map(mapPeticionRow))
    if (!recs.error) setRecurrentes((recs.data ?? []).map(mapRecurRow))
    setCargando(false)
  }, [])

  // Carga inicial client-side (anon+RLS); setState tras await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void recargar() }, [recargar])

  const activas = personas.filter((p) => p.activo !== false && !estaPausada(p))
  const pausadas = personas.filter((p) => p.activo !== false && estaPausada(p))
  const inactivas = personas.filter((p) => p.activo === false)
  const lista = filtro === 'activas' ? activas : filtro === 'pausadas' ? pausadas : inactivas

  // semáforo (paridad renderSide) — instancias del motor por persona
  const bloques = useMemo(() => {
    const grupos = bloquesEquipo(yo, personas)
    return grupos.map((g) => ({
      titulo: g.titulo,
      items: g.personas
        .map((p) => calcularSemaforo(
          p,
          peticiones.filter((t) => !t.privada || t.creadoPor === yo.nombre || matchNombre(t.para, yo.nombre)),
          obtenerInstanciasRecur({ recurrentes, peticiones, personas, nombre: p.nombre }),
        ))
        .sort(ordenSemaforo),
    }))
  }, [yo, personas, peticiones, recurrentes])

  async function accion(fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>) {
    const r = await fn()
    setAviso(r.ok ? null : r.error ?? 'error')
    setNota(r.ok && r.aviso ? r.aviso : null)
    await recargar()
    return r.ok
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto flex max-w-5xl gap-6">
        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">movdi · ops</div>
              <h1 className="text-xl font-semibold">👥 equipo</h1>
              <p className="mt-0.5 font-mono text-[11px] text-neutral-500">
                {activas.length} activas · {pausadas.length} pausadas · {inactivas.length} inactivas
              </p>
            </div>
            {admin && (
              <button onClick={() => setModalPersona({ editar: null })} data-testid="btn-agregar-persona"
                className="bg-orange-600 px-4 py-2 text-sm font-medium hover:bg-orange-500">
                + agregar persona
              </button>
            )}
          </header>

          {aviso && (
            <p role="alert" className="mt-4 border border-orange-600/40 bg-orange-600/10 px-3 py-2 font-mono text-xs text-orange-500">
              {aviso}
            </p>
          )}
          {nota && (
            <p role="status" data-testid="nota-equipo" className="mt-4 border border-amber-400/40 bg-amber-400/10 px-3 py-2 font-mono text-xs text-amber-400">
              {nota}
            </p>
          )}

          <nav className="mt-5 flex gap-2">
            {(['activas', 'pausadas', 'inactivas'] as FiltroEquipo[]).map((f) => (
              <button key={f} onClick={() => setFiltro(f)}
                className={`border px-3 py-1.5 font-mono text-xs ${filtro === f ? 'border-orange-600 text-orange-500' : 'border-neutral-800 text-neutral-400'}`}>
                {f}
              </button>
            ))}
          </nav>

          <section className="mt-5 space-y-2">
            {cargando && <p className="font-mono text-xs text-neutral-500">cargando…</p>}
            {!cargando && lista.length === 0 && (
              <p className="font-mono text-xs text-neutral-500">nadie en esta vista</p>
            )}
            {lista.map((p) => (
              <article key={p.id} data-testid="card-persona" className="border border-neutral-800 bg-neutral-900 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {p.nombre} {p.apellido}
                      <span className="ml-2 font-mono text-[10px] uppercase text-neutral-500">
                        {p.nivel === 'ceo' ? 'dirección' : p.nivel}
                      </span>
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-neutral-500">
                      {p.rol} · {(p.areas ?? []).map((a) => AREAS_LABEL[a] ?? a).join(', ') || 'sin área'}
                      {p.managerPrincipal && <> · manager: <span className="text-neutral-300">{p.managerPrincipal}</span></>}
                      {p.managers.length > 0 && <> · apoyo: {p.managers.join(', ')}</>}
                    </p>
                    {estaPausada(p) && (
                      <p className="mt-0.5 font-mono text-[10px] text-amber-400">⏸ pausada hasta {p.pausadaHasta}</p>
                    )}
                  </div>
                  {admin && (
                    <div className="flex flex-wrap gap-1.5">
                      {p.activo !== false ? (
                        <>
                          <button data-testid="btn-editar-persona"
                            onClick={() => setModalPersona({ editar: p })}
                            className="border border-neutral-700 px-2 py-1 font-mono text-[10px] text-neutral-300">
                            editar
                          </button>
                          {estaPausada(p) ? (
                            <button data-testid="btn-reanudar"
                              onClick={async () => {
                                if (!confirm(`¿reanudar a ${p.nombre} antes de tiempo?`)) return
                                await accion(() => reanudarPersona({ id: p.id }))
                              }}
                              className="border border-neutral-700 px-2 py-1 font-mono text-[10px] text-neutral-300">
                              ▶ reanudar
                            </button>
                          ) : (
                            <button data-testid="btn-pausar"
                              onClick={async () => {
                                const hasta = prompt(`¿hasta cuándo pausar a ${p.nombre}? (AAAA-MM-DD)`, dx(30))
                                if (!hasta) return
                                await accion(() => pausarPersona({ id: p.id, hasta }))
                              }}
                              className="border border-neutral-700 px-2 py-1 font-mono text-[10px] text-neutral-300">
                              ⏸ pausar
                            </button>
                          )}
                          {p.id !== yo.id && (
                            <button data-testid="btn-desactivar"
                              onClick={() => {
                                // paridad eliminarPersona: sin nada activo → confirm directo
                                const pets = peticiones.filter((t) => matchNombre(t.para, p.nombre) && t.estatus !== 'entregado')
                                const recs = recurrentes.filter((r) => matchNombre(r.para, p.nombre) && r.activa)
                                if (pets.length === 0 && recs.length === 0) {
                                  if (!confirm(`¿desactivar a ${p.nombre} ${p.apellido}?\n\nsu histórico se conserva.`)) return
                                  void accion(() => desactivarConReasignacion({ personaId: p.id }))
                                  return
                                }
                                setModalReasign(p)
                              }}
                              className="border border-red-500/40 px-2 py-1 font-mono text-[10px] text-red-400">
                              desactivar
                            </button>
                          )}
                        </>
                      ) : (
                        <button data-testid="btn-reactivar"
                          onClick={async () => {
                            if (!confirm(`¿reactivar a ${p.nombre} ${p.apellido}?`)) return
                            await accion(() => reactivarPersona({ id: p.id }))
                          }}
                          className="border border-emerald-500/40 px-2 py-1 font-mono text-[10px] text-emerald-400">
                          reactivar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </section>
        </div>

        {/* Semáforo (dirección/heads — paridad renderSide) */}
        {bloques.length > 0 && (
          <aside className="w-64 shrink-0 space-y-5" data-testid="semaforo">
            {bloques.map((b) => (
              <div key={b.titulo}>
                <h3 className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">
                  {b.titulo} <span className="text-neutral-600">· {b.items.length}</span>
                </h3>
                <div className="mt-2 space-y-1">
                  {b.items.map(({ p, total, estado }) => (
                    <div key={p.id} data-testid="semaforo-item"
                      className="flex items-center gap-2 border border-neutral-800 bg-neutral-900 px-2.5 py-1.5">
                      <span data-testid={`sem-${estado}`} className={`h-2.5 w-2.5 rounded-full ${SEM_COLOR[estado]}`} />
                      <span className="flex-1 truncate text-xs">{p.nombre}</span>
                      <span className="font-mono text-[10px] text-neutral-500">{total}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </aside>
        )}
      </div>

      {modalPersona && (
        <ModalPersona
          editar={modalPersona.editar}
          personas={personas}
          onCerrar={() => setModalPersona(null)}
          onGuardar={async (datos) => {
            const ok = await accion(() =>
              modalPersona.editar
                ? editarPersona({ ...datos, id: modalPersona.editar.id })
                : crearPersona(datos))
            if (ok) setModalPersona(null)
            return ok
          }}
        />
      )}
      {modalReasign && (
        <ModalReasignacion
          persona={modalReasign}
          personas={personas}
          peticiones={peticiones.filter((t) => matchNombre(t.para, modalReasign.nombre) && t.estatus !== 'entregado')}
          recurrentes={recurrentes.filter((r) => matchNombre(r.para, modalReasign.nombre) && r.activa)}
          onCerrar={() => setModalReasign(null)}
          onConfirmar={async (pet, rec) => {
            const ok = await accion(() => desactivarConReasignacion({
              personaId: modalReasign.id,
              reasignPeticionesA: pet || undefined,
              reasignRecurrentesA: rec || undefined,
            }))
            if (ok) setModalReasign(null)
          }}
        />
      )}
    </main>
  )
}

// ============================================================
function ModalPersona({ editar, personas, onCerrar, onGuardar }: {
  editar: PersonaConManagers | null
  personas: PersonaConManagers[]
  onCerrar: () => void
  onGuardar: (d: {
    nombre: string; apellido: string; rol: string; email: string; area: string
    nivel: 'ejecutivo' | 'head' | 'ceo' | 'rh'; managerPrincipal: string | null; managers: string[]
  }) => Promise<boolean>
}) {
  const [nombre, setNombre] = useState(editar?.nombre ?? '')
  const [apellido, setApellido] = useState(editar?.apellido ?? '')
  const [rol, setRol] = useState(editar?.rol ?? '')
  const [email, setEmail] = useState(editar?.email ?? '')
  const [area, setArea] = useState(editar?.areas?.[0] ?? 'imkt')
  const [nivel, setNivel] = useState<'ejecutivo' | 'head' | 'ceo' | 'rh'>(editar?.nivel ?? 'ejecutivo')
  const [principal, setPrincipal] = useState(editar?.managerPrincipal ?? '')
  const [apoyo, setApoyo] = useState<string[]>(editar?.managers ?? [])
  const [err, setErr] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // paridad: solo ceo|head activos como managers
  const candidatos = personas.filter((p) => (p.nivel === 'ceo' || p.nivel === 'head') && p.activo !== false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCerrar}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-neutral-700 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={editar ? 'editar persona' : 'agregar persona'}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{editar ? 'editar persona' : 'agregar persona'}</h2>
          <button onClick={onCerrar} className="text-neutral-500 hover:text-neutral-200">✕</button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="per-nombre">nombre</label>
              <input id="per-nombre" className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
            </div>
            <div>
              <label className={labelCls} htmlFor="per-apellido">apellido</label>
              <input id="per-apellido" className={inputCls} value={apellido} onChange={(e) => setApellido(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="per-rol">rol</label>
              <input id="per-rol" className={inputCls} value={rol} onChange={(e) => setRol(e.target.value)} placeholder="ej: project manager" />
            </div>
            <div>
              <label className={labelCls} htmlFor="per-email">correo</label>
              <input id="per-email" type="email" className={inputCls} value={email ?? ''} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@movdi.mx" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="per-area">área principal</label>
              <select id="per-area" className={inputCls} value={area} onChange={(e) => setArea(e.target.value)}>
                {AREAS_VALIDAS.map((a) => <option key={a} value={a}>{AREAS_LABEL[a]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="per-nivel">nivel de acceso</label>
              <select id="per-nivel" className={inputCls} value={nivel} onChange={(e) => setNivel(e.target.value as typeof nivel)}>
                <option value="ejecutivo">ejecutivo</option>
                <option value="head">head</option>
                <option value="ceo">dirección</option>
                <option value="rh">RH</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="per-manager-principal">manager principal</label>
            <select id="per-manager-principal" className={inputCls} value={principal} onChange={(e) => setPrincipal(e.target.value)}>
              <option value="">— sin manager principal —</option>
              {candidatos.map((p) => <option key={p.id} value={p.nombre}>{p.nombre} {p.apellido} · {p.rol}</option>)}
            </select>
          </div>
          <div>
            <span className={labelCls}>managers de apoyo</span>
            <div className="max-h-32 space-y-1 overflow-y-auto border border-neutral-800 bg-neutral-950 p-2">
              {candidatos.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-neutral-900">
                  <input type="checkbox" checked={apoyo.includes(p.nombre)}
                    onChange={(e) => setApoyo((s) => e.target.checked ? [...s, p.nombre] : s.filter((x) => x !== p.nombre))} />
                  <span>{p.nombre} {p.apellido} <span className="text-neutral-500">{p.rol}</span></span>
                </label>
              ))}
            </div>
          </div>
          {err && <p role="alert" className="font-mono text-xs text-orange-500">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCerrar} className="border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
            <button data-testid="btn-guardar-persona" disabled={guardando}
              onClick={async () => {
                setErr(null)
                if (!nombre.trim() || !apellido.trim() || !rol.trim()) { setErr('completa nombre, apellido y rol'); return }
                setGuardando(true)
                const ok = await onGuardar({
                  nombre, apellido, rol, email: email ?? '', area,
                  nivel, managerPrincipal: principal || null, managers: apoyo,
                })
                setGuardando(false)
                if (!ok) setErr('no se pudo guardar — revisa el aviso')
              }}
              className="bg-orange-600 px-4 py-2 text-xs font-medium hover:bg-orange-500 disabled:opacity-50">
              {guardando ? 'guardando…' : editar ? 'guardar cambios' : 'agregar e invitar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
function ModalReasignacion({ persona, personas, peticiones, recurrentes, onCerrar, onConfirmar }: {
  persona: PersonaConManagers
  personas: PersonaConManagers[]
  peticiones: Peticion[]
  recurrentes: Recurrente[]
  onCerrar: () => void
  onConfirmar: (pet: string, rec: string) => Promise<void>
}) {
  const [destPet, setDestPet] = useState('')
  const [destRec, setDestRec] = useState('')
  const [err, setErr] = useState<string | null>(null)

  // paridad: candidatos activos, no pausados, no la persona
  const candidatos = personas
    .filter((p) => p.id !== persona.id && p.activo !== false && !estaPausada(p))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCerrar}>
      <div className="w-full max-w-lg border border-neutral-700 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`desactivar a ${persona.nombre}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">desactivar a {persona.nombre} {persona.apellido}</h2>
          <button onClick={onCerrar} className="text-neutral-500 hover:text-neutral-200">✕</button>
        </div>
        <div className="mb-4 border border-orange-600/30 bg-orange-600/5 px-3 py-2.5 text-xs leading-relaxed">
          <p className="font-mono text-[10px] uppercase tracking-widest text-orange-500">⚠ requiere reasignación</p>
          <p className="mt-1">
            <strong>{persona.nombre}</strong> tiene
            {peticiones.length > 0 && <> · <strong>{peticiones.length}</strong> petición(es) activa(s)</>}
            {recurrentes.length > 0 && <> · <strong>{recurrentes.length}</strong> recurrente(s) activa(s)</>}.
            elige a quién pasan antes de desactivar — todo o nada.
          </p>
        </div>
        <div className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="reasign-pet">reasignar peticiones a</label>
            <select id="reasign-pet" className={inputCls} value={destPet} onChange={(e) => setDestPet(e.target.value)}>
              <option value="">— elige una persona —</option>
              {candidatos.map((p) => <option key={p.id} value={p.nombre}>{p.nombre} {p.apellido} · {p.rol}</option>)}
            </select>
            {peticiones.length === 0 && <p className="mt-1 font-mono text-[10px] text-neutral-500">no tiene peticiones, este campo es opcional</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="reasign-rec">reasignar recurrentes a</label>
            <select id="reasign-rec" className={inputCls} value={destRec} onChange={(e) => setDestRec(e.target.value)}>
              <option value="">— elige una persona —</option>
              {candidatos.map((p) => <option key={p.id} value={p.nombre}>{p.nombre} {p.apellido} · {p.rol}</option>)}
            </select>
            {recurrentes.length === 0 && <p className="mt-1 font-mono text-[10px] text-neutral-500">no tiene recurrentes, este campo es opcional</p>}
          </div>
          {err && <p role="alert" className="font-mono text-xs text-orange-500">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onCerrar} className="border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
            <button data-testid="btn-reasign-confirmar"
              onClick={async () => {
                setErr(null)
                if (peticiones.length > 0 && !destPet) { setErr('elige a quién reasignar las peticiones'); return }
                if (recurrentes.length > 0 && !destRec) { setErr('elige a quién reasignar las recurrentes'); return }
                await onConfirmar(destPet, destRec)
              }}
              className="bg-red-600 px-4 py-2 text-xs font-medium hover:bg-red-500">
              reasignar y desactivar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
