'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  AREAS_LABEL, AREAS_VALIDAS, type ModoAsignacion, type Persona, type Peticion,
  destinatariosPorModo, dx, fechaCorta, isAdmin, labelFecha,
  mapPeticionRow, mapPersonaRow, personaDisponible,
} from '@/lib/peticiones'
import {
  type Instancia, type Recurrente, etiquetaFrecuencia, mapRecurRow,
  obtenerInstanciasRecur, proximaFecha, puedeCrearRecurrentes,
} from '@/lib/recurrentes'
import { moverInstancia } from '../peticiones/actions'
import { entregarPeticion } from '../peticiones/actions'
import { crearRecurrente, eliminarRecurrente, entregarInstanciaVirtual, toggleRecurrente } from './actions'

const inputCls = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-movdi-naranja'
const labelCls = 'mb-1 block font-mono text-[11px] uppercase tracking-wider text-neutral-400'

export default function RecurrentesClient({ yo }: { yo: Persona }) {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [recurrentes, setRecurrentes] = useState<Recurrente[]>([])
  const [peticiones, setPeticiones] = useState<Peticion[]>([])
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)
  const [modalCrear, setModalCrear] = useState(false)
  const [modalEntrega, setModalEntrega] = useState<Instancia | null>(null)
  const [modalMover, setModalMover] = useState<Instancia | null>(null)

  const admin = isAdmin(yo)
  const puedeCrear = puedeCrearRecurrentes(yo)

  const recargar = useCallback(async () => {
    const sb = createClient()
    const [pers, recs, pets] = await Promise.all([
      sb.from('personas').select('*'),
      sb.from('recurrentes').select('*'),
      sb.from('peticiones').select('*').order('fecha'),
    ])
    if (!pers.error) setPersonas((pers.data ?? []).map(mapPersonaRow))
    if (!recs.error) setRecurrentes((recs.data ?? []).map(mapRecurRow))
    if (!pets.error) setPeticiones((pets.data ?? []).map(mapPeticionRow))
    setCargando(false)
  }, [])

  // Carga inicial client-side (anon+RLS); setState tras await, no síncrono.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void recargar() }, [recargar])

  // Visibilidad de patrones (paridad renderRecurrentes):
  // admins ven todas; los demás solo las de sus áreas.
  const visibles = useMemo(() => {
    if (admin) return recurrentes
    const misAreas = yo.areas || []
    return recurrentes.filter((r) => r.area && misAreas.includes(r.area))
  }, [recurrentes, admin, yo])

  // Filtro POR PERSONA (mismo acomodo que en peticiones, aquí como menú)
  const [filtroPersona, setFiltroPersona] = useState<string>('')
  const personasConPatron = useMemo(
    () => [...new Set(visibles.map((r) => r.para))].sort((a, b) => a.localeCompare(b)),
    [visibles],
  )
  const visiblesFiltradas = useMemo(
    () => (filtroPersona ? visibles.filter((r) => r.para === filtroPersona) : visibles),
    [visibles, filtroPersona],
  )

  // Mis próximas entregas (motor de instancias, paridad obtenerInstanciasRecur)
  const misInstancias = useMemo(
    () => obtenerInstanciasRecur({ recurrentes, peticiones, personas, nombre: yo.nombre }),
    [recurrentes, peticiones, personas, yo],
  )

  async function accion(fn: () => Promise<{ ok: boolean; error?: string }>) {
    const r = await fn()
    setAviso(r.ok ? null : r.error ?? 'error')
    await recargar()
    return r.ok
  }

  // Próxima instancia de un patrón (para "mover próxima" del creador/admin)
  function proximaInstanciaDe(r: Recurrente): Instancia | null {
    const inst = obtenerInstanciasRecur({ recurrentes: [r], peticiones, personas, nombre: r.para })
    return inst[0] ?? null
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">movdi · ops</div>
            <h1 className="text-2xl font-bold tracking-tight">tareas recurrentes ↻</h1>
            <p className="mt-0.5 font-mono text-[11px] text-neutral-500">
              se generan automáticamente · {visibles.length} configuradas
            </p>
          </div>
          {puedeCrear && (
            <button onClick={() => setModalCrear(true)} data-testid="btn-nueva-recurrente"
              className="rounded-full bg-movdi-naranja px-4 py-2 text-sm font-medium hover:bg-movdi-naranja/85">
              + nueva recurrente
            </button>
          )}
        </header>

        {aviso && (
          <p role="alert" className="mt-4 border border-movdi-naranja/40 bg-movdi-naranja/10 px-3 py-2 font-mono text-xs text-movdi-naranja">
            {aviso}
          </p>
        )}

        {/* Mis próximas entregas */}
        <section className="mt-6">
          <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">mis próximas entregas</h2>
          <div className="mt-3 space-y-2" data-testid="mis-instancias">
            {!cargando && misInstancias.length === 0 && (
              <p className="font-mono text-xs text-neutral-500">no tienes entregas recurrentes próximas</p>
            )}
            {misInstancias.map((t) => (
              <article key={t.id} data-testid="card-instancia" className="flex flex-wrap items-center justify-between gap-2 border border-neutral-800 bg-neutral-900 p-3">
                <div>
                  <span className="text-sm font-semibold">↻ {t.nombre}</span>
                  <span className="ml-2 font-mono text-[11px] text-neutral-500">
                    de {t.creadoPor} · {t.esVirtual ? 'próxima del patrón' : 'instancia programada'}
                  </span>
                  {t.motivoCambioFecha && (
                    <p className="mt-0.5 font-mono text-[11px] text-movdi-amarillo/90">movida · {t.motivoCambioFecha}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-neutral-300">{labelFecha(t)} · {t.fecha}</span>
                  <button data-testid="btn-entregar-instancia"
                    onClick={() => setModalEntrega(t)}
                    className="border border-movdi-verde/50 px-2.5 py-1 font-mono text-[11px] text-movdi-verde hover:bg-movdi-verde/10">
                    entregar ✓
                  </button>
                  {(t.creadoPor === yo.nombre || admin) && (
                    <button data-testid="btn-mover-mi-instancia" onClick={() => setModalMover(t)}
                      className="border border-movdi-amarillo/50 px-2.5 py-1 font-mono text-[11px] text-movdi-amarillo hover:bg-movdi-amarillo/10">
                      mover
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Patrones */}
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">
              patrones configurados
              {filtroPersona && <span className="ml-2 text-movdi-naranja">· {filtroPersona} ({visiblesFiltradas.length})</span>}
            </h2>
            <select
              aria-label="filtrar patrones por persona"
              data-testid="filtro-persona-recur"
              value={filtroPersona}
              onChange={(e) => setFiltroPersona(e.target.value)}
              className={`rounded-full border bg-neutral-950 px-2.5 py-1 font-mono text-[11px] outline-none transition-colors ${filtroPersona ? 'border-movdi-naranja text-movdi-naranja' : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'}`}
            >
              <option value="">persona: todas ({visibles.length})</option>
              {personasConPatron.map((n) => (
                <option key={n} value={n}>{n} ({visibles.filter((r) => r.para === n).length})</option>
              ))}
            </select>
          </div>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="w-full text-left text-xs" data-testid="tabla-recurrentes">
              <thead className="bg-neutral-900 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-3 py-2">tarea</th><th className="px-3 py-2">para</th>
                  <th className="px-3 py-2">frecuencia</th><th className="px-3 py-2">próxima</th>
                  <th className="px-3 py-2">creada por</th><th className="px-3 py-2">estado</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visiblesFiltradas.map((r) => {
                  const puedeAdministrar = r.creadoPor === yo.nombre || admin
                  return (
                    <tr key={r.id} data-testid="fila-recurrente" className="border-t border-neutral-800">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-neutral-100">{r.nombre}</div>
                        {r.descripcion && <div className="text-neutral-500">{r.descripcion}</div>}
                      </td>
                      <td className="px-3 py-2 font-semibold">{r.para}</td>
                      <td className="px-3 py-2"><span className="border border-neutral-700 px-1.5 py-0.5 font-mono text-[10px]">{etiquetaFrecuencia(r)}</span></td>
                      <td className="px-3 py-2 font-mono text-[11px]">{fechaCorta(proximaFecha(r))}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-neutral-500">{r.creadoPor}</td>
                      <td className="px-3 py-2">
                        <span className={`font-mono text-[10px] ${r.activa ? 'text-movdi-verde' : 'text-neutral-500'}`}>
                          {r.activa ? 'activa' : 'pausada'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {puedeAdministrar ? (
                          <div className="flex gap-1.5">
                            {r.activa && (
                              <button data-testid="btn-mover-proxima" title="mover próxima instancia"
                                onClick={() => {
                                  const inst = proximaInstanciaDe(r)
                                  if (!inst) { setAviso(`no hay una entrega pendiente próxima de ${r.para} (¿pausada/inactiva?)`); return }
                                  setModalMover(inst)
                                }}
                                className="border border-movdi-amarillo/40 px-2 py-0.5 font-mono text-[10px] text-movdi-amarillo">
                                mover próxima
                              </button>
                            )}
                            <button data-testid="btn-toggle-recurrente" title={r.activa ? 'pausar' : 'activar'}
                              onClick={() => accion(() => toggleRecurrente({ id: r.id, activa: !r.activa }))}
                              className="border border-neutral-700 px-2 py-0.5 font-mono text-[10px] text-neutral-300">
                              {r.activa ? '⏸ pausar' : '▶ activar'}
                            </button>
                            <button data-testid="btn-eliminar-recurrente"
                              onClick={async () => {
                                if (!confirm('¿eliminar esta recurrente?')) return
                                await accion(() => eliminarRecurrente({ id: r.id }))
                              }}
                              className="border border-movdi-naranja/40 px-2 py-0.5 font-mono text-[10px] text-movdi-naranja">
                              ✕
                            </button>
                          </div>
                        ) : (
                          <span className="font-mono text-[10px] text-neutral-600">solo {r.creadoPor} edita</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {!cargando && visibles.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center font-mono text-neutral-500">sin recurrentes</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {modalCrear && (
        <ModalCrearRecurrente
          yo={yo} personas={personas} admin={admin}
          onCerrar={() => setModalCrear(false)}
          onCrear={async (input) => {
            const ok = await accion(() => crearRecurrente(input))
            if (ok) setModalCrear(false)
            return ok
          }}
        />
      )}
      {modalEntrega && (
        <ModalEntregaInstancia
          t={modalEntrega}
          onCerrar={() => setModalEntrega(null)}
          onConfirmar={async (link, nota) => {
            const ok = await accion(() =>
              modalEntrega.esVirtual
                ? entregarInstanciaVirtual({ recurId: modalEntrega.recurOrigen, fecha: modalEntrega.fecha, link, nota })
                : entregarPeticion({ id: modalEntrega.id, link, nota }))
            if (ok) setModalEntrega(null)
          }}
        />
      )}
      {modalMover && (
        <ModalMover
          t={modalMover}
          onCerrar={() => setModalMover(null)}
          onConfirmar={async (nuevaFecha, motivo, justificada) => {
            const ok = await accion(() =>
              moverInstancia(
                modalMover.esVirtual
                  ? { recurId: modalMover.recurOrigen, fechaInstancia: modalMover.fecha, nuevaFecha, motivo, justificada }
                  : { peticionId: modalMover.id, nuevaFecha, motivo, justificada }))
            if (ok) setModalMover(null)
          }}
        />
      )}
    </main>
  )
}

// ============================================================
function ModalShell({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCerrar}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900/90 p-5 shadow-2xl backdrop-blur-xl"
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

// ============================================================
function ModalCrearRecurrente({ yo, personas, admin, onCerrar, onCrear }: {
  yo: Persona
  personas: Persona[]
  admin: boolean
  onCerrar: () => void
  onCrear: (input: Parameters<typeof crearRecurrente>[0]) => Promise<boolean>
}) {
  const areaDefault = yo.areas?.find((a) => (AREAS_VALIDAS as readonly string[]).includes(a)) || 'imkt'
  const [nombre, setNombre] = useState('')
  const [desc, setDesc] = useState('')
  const [frec, setFrec] = useState<'semanal' | 'quincenal' | 'mensual'>('semanal')
  const [dia, setDia] = useState(1)
  const [fechaInicio, setFechaInicio] = useState(dx(0)) // quincenal: primera entrega
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

  // Paridad SPA: recurrentes NO tiene modo 'heads'; ejecutivos/todos admin-only
  const modos: { v: ModoAsignacion; lab: string; adminOnly?: boolean }[] = [
    { v: 'una', lab: 'una persona' },
    { v: 'varias', lab: 'varias personas · selección manual' },
    { v: 'area', lab: 'un área completa' },
    { v: 'ejecutivos', lab: 'solo ejecutivos · admin only', adminOnly: true },
    { v: 'todos', lab: 'todo el equipo · admin only', adminOnly: true },
  ]
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes']

  async function guardar() {
    setErr(null)
    if (!nombre.trim()) { setErr('el nombre es obligatorio'); return }
    const { destinatarios } = destinatariosPorModo(modo, {
      personas, yo, para, seleccion, area: modo === 'una' ? areaUna : areaGrupo,
    })
    if (!destinatarios.length) { setErr(modo === 'una' ? 'falta destinatario' : 'selecciona al menos una persona'); return }
    if (destinatarios.length > 5 &&
      !confirm(`vas a crear esta recurrente para ${destinatarios.length} personas. ¿confirmas?\n\n${destinatarios.join(', ')}\n\ncada una tendrá su propia recurrente independiente.`)) return
    setGuardando(true)
    const ok = await onCrear({
      nombre, descripcion: desc, frecuencia: frec, modo,
      dia: frec === 'quincenal' ? undefined : dia,
      fechaInicio: frec === 'quincenal' ? fechaInicio : undefined,
      para: modo === 'una' ? para : undefined,
      seleccion: modo === 'varias' ? seleccion : undefined,
      area: modo === 'una' ? areaUna : modo === 'area' ? areaGrupo : undefined,
    })
    setGuardando(false)
    if (!ok) setErr('no se pudo crear — revisa el aviso')
  }

  return (
    <ModalShell titulo="nueva tarea recurrente" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="rec-nombre">nombre</label>
          <input id="rec-nombre" className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </div>
        <div>
          <label className={labelCls} htmlFor="rec-desc">descripción</label>
          <textarea id="rec-desc" rows={2} className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>

        <div>
          <span className={labelCls}>asignar a</span>
          <div className="space-y-1 border border-neutral-800 bg-neutral-950 p-2">
            {modos.filter((m) => !m.adminOnly || admin).map((m) => (
              <label key={m.v} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-neutral-900">
                <input type="radio" name="rec-modo" value={m.v} checked={modo === m.v} onChange={() => setModo(m.v)} />
                <span>{m.lab}</span>
              </label>
            ))}
          </div>
        </div>

        {modo === 'una' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="rec-area">área</label>
              <select id="rec-area" className={inputCls} value={areaUna} onChange={(e) => { setAreaUna(e.target.value); setPara('') }}>
                {AREAS_VALIDAS.map((a) => <option key={a} value={a}>{AREAS_LABEL[a]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="rec-para">para</label>
              <select id="rec-para" className={inputCls} value={para} onChange={(e) => setPara(e.target.value)}>
                <option value="">— elige —</option>
                {delArea(areaUna).map((p) => <option key={p.id} value={p.nombre}>{p.nombre} {p.apellido}</option>)}
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
            <label className={labelCls} htmlFor="rec-area-grupo">área destino</label>
            <select id="rec-area-grupo" className={inputCls} value={areaGrupo} onChange={(e) => setAreaGrupo(e.target.value)}>
              {AREAS_VALIDAS.map((a) => <option key={a} value={a}>{AREAS_LABEL[a]}</option>)}
            </select>
            <p className="mt-1 font-mono text-[11px] text-neutral-500">
              — se creará una recurrente para cada una de las {delArea(areaGrupo).length} persona(s) de {AREAS_LABEL[areaGrupo]} —
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="rec-frec">frecuencia</label>
            <select id="rec-frec" className={inputCls} value={frec}
              onChange={(e) => { const f = e.target.value as typeof frec; setFrec(f); setDia(f === 'mensual' ? 28 : 1) }}>
              <option value="semanal">semanal</option>
              <option value="quincenal">quincenal</option>
              <option value="mensual">mensual</option>
            </select>
          </div>
          {frec === 'quincenal' ? (
            <div>
              <label className={labelCls} htmlFor="rec-fecha-inicio">fecha de la primera entrega</label>
              <input id="rec-fecha-inicio" type="date" className={inputCls} min={dx(0)}
                value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
              <p className="mt-1 font-mono text-[10px] text-neutral-500">después, cada 14 días desde esa fecha</p>
            </div>
          ) : (
            <div>
              <label className={labelCls} htmlFor="rec-dia">{frec === 'mensual' ? 'día del mes' : 'día de la semana'}</label>
              <select id="rec-dia" className={inputCls} value={dia} onChange={(e) => setDia(Number(e.target.value))}>
                {frec === 'mensual'
                  ? Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)
                  : DIAS.map((d, i) => <option key={i + 1} value={i + 1}>{d}</option>)}
              </select>
            </div>
          )}
        </div>

        {err && <p role="alert" className="font-mono text-xs text-movdi-naranja">{err}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button onClick={guardar} disabled={guardando} data-testid="btn-crear-rec-confirmar"
            className="rounded-full bg-movdi-naranja px-4 py-2 text-xs font-medium hover:bg-movdi-naranja/85 disabled:opacity-50">
            {guardando ? 'creando…' : 'crear recurrente'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ============================================================
function ModalEntregaInstancia({ t, onCerrar, onConfirmar }: {
  t: Instancia
  onCerrar: () => void
  onConfirmar: (link: string, nota: string) => Promise<void>
}) {
  const [link, setLink] = useState('')
  const [nota, setNota] = useState('')
  return (
    <ModalShell titulo={`marcar entregado · ${t.nombre}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="font-mono text-[11px] text-neutral-500">
          entrega del {t.fecha} · la siguiente del patrón llegará en su fecha habitual. evidencia opcional.
        </p>
        <div>
          <label className={labelCls} htmlFor="ent-link">link de entrega (opcional)</label>
          <input id="ent-link" className={inputCls} placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="ent-nota">nota (opcional)</label>
          <textarea id="ent-nota" rows={2} className={inputCls} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button onClick={() => onConfirmar(link, nota)} data-testid="btn-entrega-inst-confirmar"
            className="rounded-full bg-movdi-verde px-4 py-2 text-xs font-medium hover:bg-movdi-verde/85">
            marcar entregado ✓
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ============================================================
function ModalMover({ t, onCerrar, onConfirmar }: {
  t: Instancia
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
          {t.esVirtual && <span className="ml-1 font-mono text-[10px] text-neutral-500">(aún virtual — se materializa al moverla)</span>}
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
        <p className="border border-movdi-amarillo/20 bg-movdi-amarillo/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-neutral-400">
          ℹ la siguiente entrega del patrón llegará en su fecha habitual
        </p>
        {err && <p role="alert" className="font-mono text-xs text-movdi-naranja">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button data-testid="btn-mover-inst-confirmar"
            onClick={async () => {
              if (motivo.trim().length < 10) { setErr('el motivo debe tener al menos 10 caracteres'); return }
              if (fecha === t.fecha) { setErr('la nueva fecha es igual a la actual. elige otra'); return }
              await onConfirmar(fecha, motivo, justif)
            }}
            className="rounded-full bg-movdi-amarillo px-4 py-2 text-xs font-medium text-black hover:bg-movdi-amarillo/85">
            mover entrega
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
