'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  AREAS_LABEL, AREAS_VALIDAS, type Peticion,
  dx, estaPausada, mapPeticionRow, matchNombre,
} from '@/lib/peticiones'
import { type Recurrente, mapRecurRow, obtenerInstanciasRecur } from '@/lib/recurrentes'
import {
  type PersonaConManagers, bloquesEquipo, calcularSemaforo, esDireccion,
  mapPersonaConManagers, ordenSemaforo,
} from '@/lib/equipo'
import {
  crearPersona, darToque, desactivarConReasignacion, editarPersona,
  pausarPersona, reactivarPersona, reanudarPersona,
} from './actions'

// mensajes de ánimo listos para el ⚡ toque (custom máx. 60)
const TOQUE_PRESETS = [
  '¡vas muy bien, sigue así! 💪',
  'ánimo con esta semana ⚡',
  'gran trabajo con tus entregas 🙌',
  'cuenta conmigo si necesitas apoyo 🤝',
  'recta final — tú puedes 🚀',
]

const SEM_TEXTO: Record<string, string> = {
  r: 'text-movdi-naranja', y: 'text-movdi-amarillo', g: 'text-movdi-verde', x: 'text-neutral-300',
}

const inputCls = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-movdi-naranja'
const labelCls = 'mb-1 block font-mono text-[11px] uppercase tracking-wider text-neutral-400'

const SEM_COLOR: Record<string, string> = {
  r: 'bg-movdi-naranja', y: 'bg-movdi-amarillo', g: 'bg-movdi-verde', x: 'bg-neutral-600',
}

// "hace Nd" relativo para la última actividad
const haceLabel = (iso: string | null) => {
  if (!iso) return '—'
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias}d`
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
  const [modalToque, setModalToque] = useState<PersonaConManagers | null>(null)

  // 4.14: gestión SOLO dirección; heads en modo panorama (ver + toque)
  const dir = esDireccion(yo)

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

  // heads ven SOLO su equipo (manager principal o apoyo — como el semáforo);
  // dirección ve a todos
  const visibles = useMemo(() => (
    dir ? personas : personas.filter((p) =>
      p.managerPrincipal === yo.nombre || (p.managers || []).includes(yo.nombre))
  ), [dir, personas, yo])

  const activas = visibles.filter((p) => p.activo !== false && !estaPausada(p))
  const pausadas = visibles.filter((p) => p.activo !== false && estaPausada(p))
  const inactivas = visibles.filter((p) => p.activo === false)
  const lista = filtro === 'activas' ? activas : filtro === 'pausadas' ? pausadas : inactivas

  // estado de semáforo por persona (para pintar el nombre)
  const estadoSemaforo = useMemo(() => {
    const visiblesParaSem = peticiones.filter(
      (t) => !t.privada || t.creadoPor === yo.nombre || matchNombre(t.para, yo.nombre))
    return Object.fromEntries(visibles.map((p) => [
      p.id,
      calcularSemaforo(p, visiblesParaSem,
        obtenerInstanciasRecur({ recurrentes, peticiones, personas, nombre: p.nombre })).estado,
    ]))
  }, [visibles, peticiones, recurrentes, personas, yo])

  // actividad por persona (Fase compromisos): "última actividad en OPS" =
  // último movimiento real (updated_at, trigger condicional de BD) de las
  // peticiones visibles donde participa; "tiempo promedio de respuesta" =
  // promedio de (fecha_entrega − creada) de sus entregadas con dato. Todo
  // calculado de tareas — SIN tracking de presencia ni geolocalización.
  const actividad = useMemo(() => {
    const out: Record<string, { ultima: string | null; promRespuesta: number | null }> = {}
    for (const p of visibles) {
      const participa = peticiones.filter(
        (t) => matchNombre(t.para, p.nombre) || matchNombre(t.creadoPor, p.nombre),
      )
      const ultima = participa
        .map((t) => t.actualizadaEn ?? t.creadaEn ?? '')
        .filter(Boolean)
        .sort()
        .at(-1) || null
      const conDato = participa.filter(
        (t) => matchNombre(t.para, p.nombre) && t.estatus === 'entregado' && t.fechaEntrega && t.creadaEn,
      )
      const promRespuesta = conDato.length
        ? conDato.reduce((s, t) => {
            const creada = new Date((t.creadaEn || '').slice(0, 10) + 'T00:00:00').getTime()
            const entregada = new Date(t.fechaEntrega + 'T00:00:00').getTime()
            return s + Math.max(0, (entregada - creada) / 86400000)
          }, 0) / conDato.length
        : null
      out[p.id] = { ultima, promRespuesta }
    }
    return out
  }, [visibles, peticiones])

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
              <h1 className="text-2xl font-bold tracking-tight">👥 equipo</h1>
              <p className="mt-0.5 font-mono text-[11px] text-neutral-500">
                {activas.length} activas · {pausadas.length} pausadas · {inactivas.length} inactivas
              </p>
            </div>
            {dir && (
              <button onClick={() => setModalPersona({ editar: null })} data-testid="btn-agregar-persona"
                className="rounded-full bg-movdi-naranja px-4 py-2 text-sm font-medium hover:bg-movdi-naranja/85">
                + agregar persona
              </button>
            )}
          </header>

          {aviso && (
            <p role="alert" className="mt-4 border border-movdi-naranja/40 bg-movdi-naranja/10 px-3 py-2 font-mono text-xs text-movdi-naranja">
              {aviso}
            </p>
          )}
          {nota && (
            <p role="status" data-testid="nota-equipo" className="mt-4 border border-movdi-amarillo/40 bg-movdi-amarillo/10 px-3 py-2 font-mono text-xs text-movdi-amarillo">
              {nota}
            </p>
          )}

          <nav className="mt-5 flex gap-2">
            {(['activas', 'pausadas', 'inactivas'] as FiltroEquipo[]).map((f) => (
              <button key={f} onClick={() => setFiltro(f)}
                className={`rounded-full border px-3 py-1.5 font-mono text-xs ${filtro === f ? 'border-movdi-naranja text-movdi-naranja' : 'border-neutral-800 text-neutral-400'}`}>
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
                      <span data-sem={estadoSemaforo[p.id] ?? 'x'}
                        className={SEM_TEXTO[estadoSemaforo[p.id] ?? 'x']}
                        title={{ r: 'con vencidas', y: 'entregas esta semana', g: 'al corriente', x: 'sin tareas activas' }[estadoSemaforo[p.id] ?? 'x']}>
                        {p.nombre} {p.apellido}
                      </span>
                      <span className="ml-2 font-mono text-[10px] uppercase text-neutral-500">
                        {p.nivel === 'ceo' ? 'dirección' : p.nivel}
                      </span>
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-neutral-500">
                      {p.rol} · {(p.areas ?? []).map((a) => AREAS_LABEL[a] ?? a).join(', ') || 'sin área'}
                      {p.managerPrincipal && <> · manager: <span className="text-neutral-300">{p.managerPrincipal}</span></>}
                      {p.managers.length > 0 && <> · apoyo: {p.managers.join(', ')}</>}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-neutral-500" data-testid="actividad-persona">
                      última actividad en OPS: <span className="text-neutral-300">{haceLabel(actividad[p.id]?.ultima ?? null)}</span>
                      <span className="mx-1 text-neutral-700">·</span>
                      respuesta prom.: <span className="text-neutral-300">
                        {actividad[p.id]?.promRespuesta != null ? `${actividad[p.id]!.promRespuesta!.toFixed(1)}d` : '—'}
                      </span>
                    </p>
                    {estaPausada(p) && (
                      <p className="mt-0.5 font-mono text-[10px] text-movdi-amarillo">⏸ pausada hasta {p.pausadaHasta}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.activo !== false && p.id !== yo.id && (
                      <button data-testid="btn-toque"
                        onClick={() => setModalToque(p)}
                        className="rounded-full border border-movdi-amarillo/50 px-2.5 py-1 font-mono text-[10px] text-movdi-amarillo transition-colors hover:bg-movdi-amarillo/10">
                        ⚡ toque
                      </button>
                    )}
                  {dir && (
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
                              className="border border-movdi-naranja/40 px-2 py-1 font-mono text-[10px] text-movdi-naranja">
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
                          className="border border-movdi-verde/40 px-2 py-1 font-mono text-[10px] text-movdi-verde">
                          reactivar
                        </button>
                      )}
                    </div>
                  )}
                  </div>
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

      {modalToque && (
        <ModalToque
          para={modalToque}
          onCerrar={() => setModalToque(null)}
          onEnviar={async (mensaje) => {
            const r = await darToque({ para: modalToque.nombre, mensaje })
            if (r.ok) { setNota(`⚡ toque enviado a ${modalToque.nombre}`); setAviso(null) }
            else { setAviso(r.error); setNota(null) }
            setModalToque(null) // cerrar siempre: el aviso/nota queda visible en la página
          }}
        />
      )}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCerrar}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900/90 p-5 shadow-2xl backdrop-blur-xl"
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
          {err && <p role="alert" className="font-mono text-xs text-movdi-naranja">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
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
              className="rounded-full bg-movdi-naranja px-4 py-2 text-xs font-medium hover:bg-movdi-naranja/85 disabled:opacity-50">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCerrar}>
      <div className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900/90 p-5 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`desactivar a ${persona.nombre}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">desactivar a {persona.nombre} {persona.apellido}</h2>
          <button onClick={onCerrar} className="text-neutral-500 hover:text-neutral-200">✕</button>
        </div>
        <div className="mb-4 border border-movdi-naranja/30 bg-movdi-naranja/5 px-3 py-2.5 text-xs leading-relaxed">
          <p className="font-mono text-[10px] uppercase tracking-widest text-movdi-naranja">⚠ requiere reasignación</p>
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
          {err && <p role="alert" className="font-mono text-xs text-movdi-naranja">{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
            <button data-testid="btn-reasign-confirmar"
              onClick={async () => {
                setErr(null)
                if (peticiones.length > 0 && !destPet) { setErr('elige a quién reasignar las peticiones'); return }
                if (recurrentes.length > 0 && !destRec) { setErr('elige a quién reasignar las recurrentes'); return }
                await onConfirmar(destPet, destRec)
              }}
              className="bg-red-600 px-4 py-2 text-xs font-medium hover:bg-movdi-naranja">
              reasignar y desactivar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ============================================================
// ⚡ Modal de toque: preset alentador o mensaje corto (máx 60); muestra
// quién lo envía (el título de la notificación lleva el remitente).
function ModalToque({ para, onCerrar, onEnviar }: {
  para: PersonaConManagers
  onCerrar: () => void
  onEnviar: (mensaje: string) => Promise<void>
}) {
  const [preset, setPreset] = useState(TOQUE_PRESETS[0])
  const [custom, setCustom] = useState('')
  const [enviando, setEnviando] = useState(false)
  const mensaje = custom.trim() || preset

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCerrar}>
      <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900/90 p-5 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="dar toque">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">⚡ toque para {para.nombre}</h2>
          <button onClick={onCerrar} className="text-neutral-500 hover:text-neutral-200">✕</button>
        </div>
        <p className="mb-3 font-mono text-[11px] text-neutral-500">
          un empujón de ánimo — {para.nombre} verá quién se lo manda · máx. 1 al día
        </p>
        <div className="space-y-1.5">
          {TOQUE_PRESETS.map((t) => (
            <label key={t} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${!custom.trim() && preset === t ? 'border-movdi-amarillo/60 bg-movdi-amarillo/10' : 'border-neutral-800 hover:border-neutral-600'}`}>
              <input type="radio" name="toque-preset" checked={!custom.trim() && preset === t}
                onChange={() => { setPreset(t); setCustom('') }} />
              <span>{t}</span>
            </label>
          ))}
        </div>
        <div className="mt-3">
          <label className={labelCls} htmlFor="toque-custom">o escribe el tuyo (máx. 60)</label>
          <input id="toque-custom" maxLength={60} className={inputCls}
            placeholder="ej: ese cliente difícil no te merece 😄"
            value={custom} onChange={(e) => setCustom(e.target.value)} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button data-testid="btn-toque-enviar" disabled={enviando}
            onClick={async () => { setEnviando(true); await onEnviar(mensaje); setEnviando(false) }}
            className="rounded-full bg-movdi-amarillo px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-movdi-amarillo/85 disabled:opacity-50">
            {enviando ? 'enviando…' : 'enviar toque ⚡'}
          </button>
        </div>
      </div>
    </div>
  )
}
