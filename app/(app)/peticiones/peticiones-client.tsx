'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  AREAS_LABEL, AREAS_VALIDAS, AREA_COLOR, ORIGENES_VALIDOS, type ModoAsignacion,
  type Persona, type Peticion,
  destinatariosPorModo, diasHasta, diasSinMovimiento, dx, esCompromisoPropio,
  estadoMovimiento, fechaCorta, isAdmin, labelFecha,
  mapPeticionRow, margenPeticion, matchNombre, personaDisponible, puedoVerPeticion,
  tengoSupervisadas,
} from '@/lib/peticiones'
import { type Recurrente, mapRecurRow, obtenerInstanciasRecur } from '@/lib/recurrentes'
import {
  type PersonaConManagers, bloquesEquipo, calcularSemaforo, esDireccion,
  mapPersonaConManagers, ordenSemaforo,
} from '@/lib/equipo'
import {
  type HistorialMes, competeEnLeaderboard, mapHistorialRow, mesAnteriorStr,
} from '@/lib/gamificacion'
import {
  type CampoTipo, type Detalle, type TipoPeticion,
  aplicarCliente, areaTieneTipos, camposVisibles, etiquetaTipo, fechaPorSLA,
  tipoDe, tiposDeArea, validarDetalle,
} from '@/lib/tipos-peticion'
import { type Cliente, mapClienteRow } from '@/lib/clientes'
import {
  agregarNotaAvance, cambiarEstatus, cambiarFecha, crearCompromiso,
  crearPeticion, desocultarPeticion, eliminarPeticion, entregarPeticion,
  guardarClienteAlCatalogo, moverInstancia, ocultarEntregadas, ocultarPeticion,
} from './actions'

type Tab = 'general' | 'mis' | 'pedi' | 'recur' | 'atorado'
type Filtro = 'todas' | 'vencidas' | 'semana' | (typeof AREAS_VALIDAS)[number]

const PRIO_COLOR: Record<string, string> = {
  alta: 'text-movdi-naranja border-movdi-naranja/40',
  media: 'text-movdi-amarillo border-movdi-amarillo/40',
  baja: 'text-neutral-400 border-neutral-600',
}

// Colores por área (paridad visual .tag.area-* del SPA, adaptado a la paleta)
const SEM_COLOR: Record<'r' | 'y' | 'g' | 'x', string> = {
  r: 'bg-movdi-naranja',
  y: 'bg-movdi-amarillo',
  g: 'bg-movdi-verde',
  x: 'bg-neutral-600',
}

const estaOcultaParaMi = (t: Peticion, nombre: string) => (t.ocultaPara ?? []).includes(nombre)

export default function PeticionesClient({ yo }: { yo: PersonaConManagers }) {
  const [personas, setPersonas] = useState<PersonaConManagers[]>([])
  const [peticiones, setPeticiones] = useState<Peticion[]>([])
  const [recurrentes, setRecurrentes] = useState<Recurrente[]>([])
  const [historial, setHistorial] = useState<HistorialMes[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [tab, setTab] = useState<Tab>('general')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  // filtro por persona desde el semáforo (paridad verPersona/porpersona del SPA)
  const [personaFiltro, setPersonaFiltro] = useState<string | null>(null)
  // toggles "mostrar ocultas" por vista (paridad mostrarOcultasGeneral/Mis/Pedi)
  const [mostrarOcultas, setMostrarOcultas] = useState<Record<'general' | 'mis' | 'pedi', boolean>>({
    general: false, mis: false, pedi: false,
  })
  const [aviso, setAviso] = useState<string | null>(null)

  // modales
  const [modalCrear, setModalCrear] = useState(false)
  const [modalCompromiso, setModalCompromiso] = useState(false)
  const [modalEntrega, setModalEntrega] = useState<Peticion | null>(null)
  const [modalFecha, setModalFecha] = useState<Peticion | null>(null)
  const [modalMover, setModalMover] = useState<Peticion | null>(null)
  const [modalNota, setModalNota] = useState<Peticion | null>(null)

  const admin = isAdmin(yo)
  // panel "qué está atorado": dirección, heads y jefas directas (estas últimas
  // reconocidas por su relación de managers, que llega con la lista de personas)
  const veAtorados = esDireccion(yo) || yo.nivel === 'head' || tengoSupervisadas(yo, personas)
  // "guardar cliente al catálogo": área admi + dirección (RLS respalda)
  const esAdmi = yo.areas.includes('admi') || esDireccion(yo)

  // ---------- lecturas client-side (anon key + RLS) ----------
  const recargar = useCallback(async () => {
    const sb = createClient()
    const [pers, pets, recs, hist, clis] = await Promise.all([
      sb.from('personas').select('*').order('nivel'),
      sb.from('peticiones').select('*').order('fecha'),
      sb.from('recurrentes').select('*'),
      sb.from('historial_mensual').select('*'),
      sb.from('clientes').select('*').order('nombre'),
    ])
    if (!pers.error) setPersonas((pers.data ?? []).map(mapPersonaConManagers))
    if (!pets.error) setPeticiones((pets.data ?? []).map(mapPeticionRow))
    if (!recs.error) setRecurrentes((recs.data ?? []).map(mapRecurRow))
    if (!hist.error) setHistorial((hist.data ?? []).map(mapHistorialRow))
    if (!clis.error) setClientes((clis.data ?? []).map(mapClienteRow))
    setCargando(false)
  }, [])

  // Carga inicial client-side (anon+RLS). Los setState ocurren tras el await,
  // no síncronos — el disable es por el análisis conservador de la regla.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void recargar() }, [recargar])

  // ---------- lista filtrada (paridad renderGeneral/renderMis/renderPedi) ----------
  const scopeOcultas: 'general' | 'mis' | 'pedi' | null =
    tab === 'recur' || tab === 'atorado' ? null : tab

  const { lista, ocultasCount } = useMemo(() => {
    if (tab === 'atorado') return { lista: [], ocultasCount: 0 }
    let l = peticiones.filter((t) => puedoVerPeticion(t, yo))
    if (tab === 'recur') l = l.filter((t) => t.origenRecur)
    else l = l.filter((t) => !t.origenRecur)
    if (tab === 'mis') l = l.filter((t) => matchNombre(t.para, yo.nombre))
    if (tab === 'pedi') l = l.filter((t) => t.creadoPor === yo.nombre)
    if (tab === 'general' && personaFiltro) l = l.filter((t) => matchNombre(t.para, personaFiltro))
    if (filtro === 'vencidas') l = l.filter((t) => diasHasta(t.fecha) < 0 && t.estatus !== 'entregado')
    else if (filtro === 'semana') l = l.filter((t) => { const d = diasHasta(t.fecha); return d >= 0 && d <= 7 && t.estatus !== 'entregado' })
    else if ((AREAS_VALIDAS as readonly string[]).includes(filtro)) l = l.filter((t) => t.area === filtro)
    // ocultas (paridad SPA): contarlas antes de filtrarlas; el toggle las re-muestra
    const nOcultas = scopeOcultas ? l.filter((t) => estaOcultaParaMi(t, yo.nombre)).length : 0
    if (scopeOcultas && !mostrarOcultas[scopeOcultas]) l = l.filter((t) => !estaOcultaParaMi(t, yo.nombre))
    // orden de renderTabla: entregadas al final, luego por fecha ascendente
    l = l.slice().sort((a, b) => {
      const ea = a.estatus === 'entregado' ? 1 : 0
      const eb = b.estatus === 'entregado' ? 1 : 0
      if (ea !== eb) return ea - eb
      return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0
    })
    return { lista: l, ocultasCount: nOcultas }
  }, [peticiones, tab, filtro, yo, personaFiltro, mostrarOcultas, scopeOcultas])

  // ---------- semáforo lateral (paridad renderSide: solo vista general, ceo/head) ----------
  const bloques = useMemo(() => {
    if (tab !== 'general') return []
    const visiblesParaSem = peticiones.filter(
      (t) => !t.privada || t.creadoPor === yo.nombre || matchNombre(t.para, yo.nombre),
    )
    return bloquesEquipo(yo, personas).map((g) => ({
      titulo: g.titulo,
      items: g.personas
        .map((p) => calcularSemaforo(
          p,
          visiblesParaSem,
          obtenerInstanciasRecur({ recurrentes, peticiones, personas, nombre: p.nombre }),
        ))
        .sort(ordenSemaforo),
    }))
  }, [tab, peticiones, personas, recurrentes, yo])

  // ---------- panel "qué está atorado" (heads/dirección) ----------
  // Tareas atoradas (3+ días hábiles sin movimiento) o vencidas del equipo,
  // agrupadas por persona, más días sin movimiento arriba. Misma relación de
  // equipo del semáforo (manager principal o apoyo); dirección ve a todos.
  // Solo peticiones ya visibles por RLS — los to-dos privados NUNCA se
  // cargan aquí.
  const atorados = useMemo(() => {
    if (tab !== 'atorado' || !veAtorados) return []
    const equipo = esDireccion(yo)
      ? personas.filter((p) => p.activo !== false && p.nombre !== yo.nombre)
      : personas.filter((p) =>
          p.activo !== false &&
          (p.managerPrincipal === yo.nombre || (p.managers || []).includes(yo.nombre)))
    return equipo
      .map((p) => {
        const tareas = peticiones
          .filter((t) =>
            matchNombre(t.para, p.nombre) &&
            puedoVerPeticion(t, yo) &&
            t.estatus !== 'entregado' && t.estatus !== 'archivada')
          .map((t) => ({ t, estado: estadoMovimiento(t), dias: diasSinMovimiento(t) ?? 0 }))
          .filter((x) => x.estado === 'atorada' || x.estado === 'vencida')
          .sort((a, b) => b.dias - a.dias)
        return { p, tareas, maxDias: tareas[0]?.dias ?? 0 }
      })
      .filter((g) => g.tareas.length > 0)
      .sort((a, b) => b.maxDias - a.maxDias)
  }, [tab, veAtorados, personas, peticiones, yo])

  // card "peticiones privadas 🔒" (solo dirección, paridad renderSide)
  const rhCount = useMemo(
    () => peticiones.filter((t) => t.privada && t.estatus !== 'entregado' && puedoVerPeticion(t, yo)).length,
    [peticiones, yo],
  )

  // banner "📌 tareas asignadas a ti" (paridad renderGeneral)
  const misPendientes = useMemo(
    () => peticiones.filter((t) =>
      matchNombre(t.para, yo.nombre) && puedoVerPeticion(t, yo) && !t.origenRecur && t.estatus !== 'entregado',
    ).length,
    [peticiones, yo],
  )

  const kpis = useMemo(() => {
    const visibles = peticiones.filter((t) => puedoVerPeticion(t, yo) && !t.origenRecur)
    return {
      pendientes: visibles.filter((t) => t.estatus !== 'entregado').length,
      vencidas: visibles.filter((t) => diasHasta(t.fecha) < 0 && t.estatus !== 'entregado').length,
      semana: visibles.filter((t) => { const d = diasHasta(t.fecha); return d >= 0 && d <= 7 && t.estatus !== 'entregado' }).length,
      entregadas: visibles.filter((t) => t.estatus === 'entregado').length,
    }
  }, [peticiones, yo])

  // Deployment skew: si se despliega una versión nueva con esta pestaña
  // abierta, el POST de una Server Action del bundle viejo ya no existe en
  // el server y el runtime de Next LANZA (nuestras actions nunca lanzan:
  // siempre regresan {ok}). Sin esto, el click "no hace nada" en silencio
  // (bug reportado 2026-07-06 tras los redeploys del cutover). Se recarga
  // UNA vez para tomar el bundle vigente; si aun así falla, se pide el
  // reload manual en el aviso.
  const RELOAD_FLAG = 'movdi-recarga-version'
  function manejarSkew() {
    try {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1')
        setAviso('la app se actualizó — recargando para tomar la versión nueva…')
        location.reload()
        return
      }
    } catch { /* sessionStorage no disponible (modo privado) */ }
    setAviso('la app se actualizó y esta pestaña quedó con una versión vieja — recarga la página (⌘R / Ctrl+R) para continuar')
  }

  async function accion(fn: () => Promise<{ ok: boolean; error?: string }>) {
    let r: { ok: boolean; error?: string }
    try {
      r = await fn()
    } catch {
      manejarSkew()
      return false
    }
    try { sessionStorage.removeItem(RELOAD_FLAG) } catch { /* idem */ }
    if (!r.ok) setAviso(r.error ?? 'error')
    else setAviso(null)
    await recargar()
    return r.ok
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">movdi · ops</div>
            <h1 className="text-2xl font-bold tracking-tight">peticiones</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setModalCompromiso(true)}
              className="rounded-full border border-movdi-naranja px-4 py-2 text-sm font-medium text-movdi-naranja hover:bg-movdi-naranja/10"
              data-testid="btn-nuevo-compromiso"
              title="trabajo emergente que tomas tú — se asigna a ti"
            >
              ✋ nuevo compromiso
            </button>
            <button
              onClick={() => setModalCrear(true)}
              className="rounded-full bg-movdi-naranja px-4 py-2 text-sm font-medium hover:bg-movdi-naranja/85"
              data-testid="btn-nueva-peticion"
            >
              + nueva petición
            </button>
          </div>
        </header>

        {/* 🏆 podio del MES CERRADO (primeros 5 días; Fase 4.8: sin cálculo
            en vivo — solo el snapshot oficial del cierre) */}
        <BannerPodio yo={yo} historial={historial} />

        {/* KPIs (paridad calcKpis) — bloques sólidos de la paleta (zona resumen) */}
        <section className="mt-6 grid grid-cols-4 gap-3">
          {([
            ['pendientes', kpis.pendientes, 'bg-movdi-gris text-black'],
            ['vencidas', kpis.vencidas, kpis.vencidas > 0 ? 'bg-movdi-naranja text-black' : 'border border-neutral-800 bg-neutral-900 text-neutral-500'],
            ['esta semana', kpis.semana, kpis.semana > 0 ? 'bg-movdi-amarillo text-black' : 'border border-neutral-800 bg-neutral-900 text-neutral-500'],
            ['entregadas', kpis.entregadas, 'bg-movdi-verde text-black'],
          ] as const).map(([lab, val, bloque]) => (
            <div key={lab} className={`card-hover rounded-2xl px-4 py-3.5 ${bloque}`}>
              <div className="font-mono text-[10px] uppercase tracking-wider opacity-70">{lab}</div>
              <div className="text-3xl font-bold tracking-tight">{val}</div>
            </div>
          ))}
        </section>

        {/* 📌 banner tareas asignadas a mí (paridad renderGeneral) */}
        {tab === 'general' && misPendientes > 0 && (
          <button
            onClick={() => setTab('mis')}
            data-testid="banner-mis-pendientes"
            className="card-hover mt-4 flex w-full items-center justify-between rounded-2xl border border-movdi-naranja/40 bg-movdi-naranja/10 px-5 py-3.5 text-left transition-colors hover:bg-movdi-naranja/20"
          >
            <span>
              <span className="block font-mono text-[11px] uppercase tracking-widest text-movdi-naranja">📌 tareas asignadas a ti</span>
              <span className="mt-0.5 block text-[13px] text-neutral-300">
                tienes <strong className="text-neutral-100">{misPendientes}</strong> {misPendientes === 1 ? 'petición pendiente' : 'peticiones pendientes'} esperando tu acción
              </span>
            </span>
            <span className="font-mono text-xs text-movdi-naranja">ver mis peticiones →</span>
          </button>
        )}

        {/* Tabs + filtros */}
        <nav className="mt-6 flex flex-wrap items-center gap-2">
          {([
            ['general', 'general'], ['mis', 'mis pendientes'], ['pedi', 'lo que pedí'],
            ['recur', 'instancias recurrentes'],
            ...(veAtorados ? ([['atorado', '⏸ qué está atorado']] as const) : []),
          ] as readonly (readonly [Tab, string])[]).map(([k, lab]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-full border px-3 py-1.5 font-mono text-xs ${tab === k ? 'border-movdi-naranja text-movdi-naranja' : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'}`}>
              {lab}
            </button>
          ))}
          {tab !== 'atorado' && (
            <>
              <span className="mx-2 h-4 w-px bg-neutral-800" />
              {(['todas', 'vencidas', 'semana'] as Filtro[]).map((f) => (
                <button key={f} onClick={() => setFiltro(f)}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${filtro === f ? 'border-movdi-naranja text-movdi-naranja' : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'}`}>
                  {f === 'semana' ? 'esta semana' : f}
                </button>
              ))}
              {/* áreas como menú desplegable (misma semántica que los chips:
                  un solo filtro activo a la vez) */}
              <select
                aria-label="filtrar por área"
                data-testid="filtro-area"
                value={(AREAS_VALIDAS as readonly string[]).includes(filtro) ? filtro : ''}
                onChange={(e) => setFiltro((e.target.value || 'todas') as Filtro)}
                className={`rounded-full border bg-neutral-950 px-2.5 py-1 font-mono text-[11px] outline-none transition-colors ${(AREAS_VALIDAS as readonly string[]).includes(filtro) ? 'border-movdi-naranja text-movdi-naranja' : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'}`}
              >
                <option value="">área: todas</option>
                {AREAS_VALIDAS
                  .filter((a) => a !== 'rh' || yo.esDireccion || yo.nivel === 'rh')
                  .map((a) => <option key={a} value={a}>{AREAS_LABEL[a]}</option>)}
              </select>
            </>
          )}
        </nav>

        {/* filtro por persona activo (viene del semáforo) */}
        {tab === 'general' && personaFiltro && (
          <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-neutral-400">
            viendo peticiones de <strong className="text-movdi-naranja">{personaFiltro}</strong>
            <button onClick={() => setPersonaFiltro(null)} data-testid="quitar-filtro-persona"
              className="border border-neutral-700 px-1.5 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200">
              ✕ quitar filtro
            </button>
          </p>
        )}

        {/* controles de ocultas (paridad SPA: general/mis/pedi) */}
        {scopeOcultas && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {ocultasCount > 0 && (
              <button
                onClick={() => setMostrarOcultas((m) => ({ ...m, [scopeOcultas]: !m[scopeOcultas] }))}
                data-testid="btn-toggle-ocultas"
                className="border border-neutral-700 px-2.5 py-1 font-mono text-[11px] text-neutral-300 hover:border-neutral-500"
              >
                {mostrarOcultas[scopeOcultas] ? `🙈 ocultar (${ocultasCount})` : `👁 mostrar ocultas (${ocultasCount})`}
              </button>
            )}
            <button
              onClick={async () => {
                if (!confirm('¿ocultar todas las peticiones entregadas de tu vista?\n\nseguirán contando para tu progreso pero ya no se mostrarán aquí. puedes volver a mostrarlas con el botón "👁 mostrar ocultas".')) return
                await accion(() => ocultarEntregadas({ scope: scopeOcultas }))
              }}
              data-testid="btn-ocultar-entregadas"
              title="oculta de tu vista las que ya están entregadas · siguen contando en tu progreso"
              className="border border-neutral-700 px-2.5 py-1 font-mono text-[11px] text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
            >
              🙈 ocultar entregadas
            </button>
          </div>
        )}

        {aviso && (
          <p role="alert" className="mt-4 border border-movdi-naranja/40 bg-movdi-naranja/10 px-3 py-2 font-mono text-xs text-movdi-naranja">
            {aviso}
          </p>
        )}

        {/* ⏸ panel "qué está atorado" (heads/dirección): atoradas/vencidas del
            equipo agrupadas por persona · más días sin movimiento arriba ·
            SOLO peticiones/compromisos, jamás to-dos privados */}
        {tab === 'atorado' && veAtorados && (
          <section className="mt-6" data-testid="panel-atorados">
            {cargando && <p className="font-mono text-xs text-neutral-500">cargando…</p>}
            {!cargando && atorados.length === 0 && (
              <p className="font-mono text-xs text-neutral-500">
                nada atorado ni vencido en tu equipo ✓
              </p>
            )}
            <div className="space-y-6">
              {atorados.map((g) => (
                <div key={g.p.id} data-testid="grupo-atorado">
                  <h3 className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">
                    {g.p.nombre} {g.p.apellido}
                    <span className="ml-2 text-neutral-600">· {g.tareas.length} {g.tareas.length === 1 ? 'tarea' : 'tareas'}</span>
                  </h3>
                  <div className="mt-2 overflow-x-auto rounded-2xl border border-neutral-800">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-neutral-800 bg-neutral-900">
                          {['tarea', 'dueño', 'días sin movimiento', 'origen', 'fecha compromiso', 'estado'].map((h) => (
                            <th key={h} className="px-3 py-2 font-mono text-[10px] font-normal uppercase tracking-wider text-neutral-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.tareas.map(({ t, estado, dias }) => (
                          <tr key={t.id} data-testid="fila-atorada" className="border-b border-neutral-800/70 hover:bg-neutral-900/60">
                            <td className="max-w-[24rem] px-3 py-2.5">
                              <span className="text-sm font-semibold">{t.nombre}</span>
                              {esCompromisoPropio(t) && (
                                <span className="ml-2 font-mono text-[10px] text-movdi-amarillo" title="compromiso auto-asignado">✋ propio</span>
                              )}
                              {t.origenRecur && (
                                <span className="ml-2 font-mono text-[10px] text-movdi-amarillo" title="instancia de recurrente">↻</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-neutral-200">{t.para}</td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              <span className={`font-mono text-[13px] font-semibold ${dias >= 3 ? 'text-movdi-naranja' : 'text-neutral-300'}`}>
                                {dias}d {dias === 1 ? 'hábil' : 'hábiles'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              {t.origen
                                ? <span className="rounded-full border border-neutral-700 px-2 py-0.5 font-mono text-[10px] uppercase text-neutral-400">{t.origen}</span>
                                : <span className="font-mono text-[10px] text-neutral-600">—</span>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              <span className="text-[13px] text-neutral-300">{fechaCorta(t.fecha)}</span>
                              <span className="ml-2 font-mono text-[10px] text-neutral-500">{labelFecha(t)}</span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              <span className={`font-mono text-[10px] uppercase ${estado === 'atorada' ? 'text-movdi-naranja' : 'text-movdi-amarillo'}`}>
                                {estado === 'atorada' ? '⏸ atorada' : 'vencida'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Lista (tabla, paridad renderTabla) + semáforo lateral (paridad renderSide) */}
        {tab !== 'atorado' && (
        <div className="mt-6 flex items-start gap-6">
          <section className="min-w-0 flex-1" data-testid="lista-peticiones">
            {cargando && <p className="font-mono text-xs text-neutral-500">cargando…</p>}
            {!cargando && lista.length === 0 && (
              <p className="font-mono text-xs text-neutral-500">no hay peticiones en esta vista</p>
            )}
            {lista.length > 0 && (
              <div className="overflow-x-auto rounded-2xl border border-neutral-800">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-neutral-800 bg-neutral-900">
                      {['petición', 'de → para', 'área', 'fecha', 'prio', 'estatus', ''].map((h, i) => (
                        <th key={i} className="px-3 py-2 font-mono text-[10px] font-normal uppercase tracking-wider text-neutral-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((t) => (
                      <FilaPeticion
                        key={t.id}
                        t={t}
                        yo={yo}
                        admin={admin}
                        esAdmi={esAdmi}
                        onGuardarCliente={() => accion(() => guardarClienteAlCatalogo({ peticionId: t.id }))}
                        onEstatus={(nuevo) => accion(() => cambiarEstatus({ id: t.id, estatus: nuevo }))}
                        onEntregar={() => setModalEntrega(t)}
                        onCambiarFecha={() => setModalFecha(t)}
                        onMover={() => setModalMover(t)}
                        onNota={() => setModalNota(t)}
                        onEliminar={async () => {
                          if (!confirm('¿eliminar esta petición?')) return
                          await accion(() => eliminarPeticion({ id: t.id }))
                        }}
                        onOcultar={() => accion(() => ocultarPeticion({ id: t.id }))}
                        onDesocultar={() => accion(() => desocultarPeticion({ id: t.id }))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {(bloques.length > 0 || (tab === 'general' && esDireccion(yo))) && (
            <aside className="sticky top-16 hidden max-h-[calc(100vh-5rem)] w-64 shrink-0 space-y-5 overflow-y-auto lg:block" data-testid="semaforo">
              {bloques.map((b) => (
                <div key={b.titulo}>
                  <h3 className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">
                    {b.titulo} <span className="text-neutral-600">· {b.items.length}</span>
                  </h3>
                  <div className="mt-2 space-y-1">
                    {b.items.map(({ p, total, estado }) => (
                      <button key={p.id} data-testid="semaforo-item"
                        onClick={() => setPersonaFiltro((f) => (f === p.nombre ? null : p.nombre))}
                        className={`flex w-full items-center gap-2 rounded-full border px-2.5 py-1.5 text-left hover:border-neutral-600 ${personaFiltro === p.nombre ? 'border-movdi-naranja/60 bg-movdi-naranja/10' : 'border-neutral-800 bg-neutral-900'}`}>
                        <span data-testid={`sem-${estado}`} className={`h-2.5 w-2.5 rounded-full ${SEM_COLOR[estado]}`} />
                        <span className="flex-1 truncate text-xs">{p.nombre} {p.apellido}</span>
                        <span className="font-mono text-[10px] text-neutral-500">{total}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {tab === 'general' && esDireccion(yo) && (
                <div className="border border-movdi-naranja/30 bg-movdi-naranja/5 px-3 py-2.5" data-testid="card-privadas">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">peticiones privadas 🔒</div>
                  <div className="mt-1 text-2xl font-semibold">{rhCount}</div>
                  <div className="font-mono text-[10px] text-neutral-500">peticiones confidenciales activas</div>
                </div>
              )}
            </aside>
          )}
        </div>
        )}
      </div>

      {modalCrear && (
        <ModalCrear
          yo={yo}
          personas={personas}
          clientes={clientes}
          admin={admin}
          onCerrar={() => setModalCrear(false)}
          onCrear={async (input) => {
            let r: Awaited<ReturnType<typeof crearPeticion>>
            try {
              r = await crearPeticion(input)
            } catch {
              manejarSkew()
              return { ok: false, error: 'la app se actualizó — recarga la página e inténtalo de nuevo' }
            }
            setAviso(r.ok ? null : r.error)
            await recargar()
            if (r.ok) setModalCrear(false)
            return r
          }}
        />
      )}
      {modalCompromiso && (
        <ModalCompromiso
          yo={yo}
          onCerrar={() => setModalCompromiso(false)}
          onCrear={async (input) => {
            let r: Awaited<ReturnType<typeof crearCompromiso>>
            try {
              r = await crearCompromiso(input)
            } catch {
              manejarSkew()
              return { ok: false, error: 'la app se actualizó — recarga la página e inténtalo de nuevo' }
            }
            setAviso(r.ok ? null : r.error)
            await recargar()
            if (r.ok) setModalCompromiso(false)
            return r
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
      {modalNota && (
        <ModalNotaAvance
          t={modalNota}
          onCerrar={() => setModalNota(null)}
          onConfirmar={async (nota) => {
            const ok = await accion(() => agregarNotaAvance({ id: modalNota.id, nota }))
            if (ok) setModalNota(null)
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
// 🏆 Banner de podio — SOLO del MES CERRADO (Fase 4.8: nada de cálculo en
// vivo; todos ven exactamente el mismo podio, el archivado por dirección).
// Primeros 5 días del mes; dismiss por mes en localStorage. Los datos salen
// de la RPC podio_mes_cerrado (expone solo el top 3 — funciona para todos
// los roles aunque la RLS de historial esté cerrada); si la RPC aún no
// existe (pre-cutover), cae al historial que la RLS deje leer.
function BannerPodio({ yo, historial }: {
  yo: PersonaConManagers
  historial: HistorialMes[]
}) {
  const [dismissed, setDismissed] = useState(true) // hasta leer localStorage
  const [podioRpc, setPodioRpc] = useState<{ persona: string; cumplimiento: number }[] | null>(null)
  const mesActual = new Date().toISOString().slice(0, 7)
  const dismissKey = `movdi-podio-dismissed-${yo.nombre}-${mesActual}`

  // localStorage solo en el cliente (evita mismatch de hidratación); el
  // setState síncrono es intencional: sincroniza con un sistema externo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setDismissed(localStorage.getItem(dismissKey) === '1') } catch { setDismissed(false) }
  }, [dismissKey])

  useEffect(() => {
    if (new Date().getDate() > 5) return
    const sb = createClient()
    void sb.rpc('podio_mes_cerrado', { p_mes: mesAnteriorStr() }).then(({ data, error }) => {
      if (!error && Array.isArray(data)) setPodioRpc(data as { persona: string; cumplimiento: number }[])
    })
  }, [])

  const diaDelMes = new Date().getDate()
  if (diaDelMes > 5 || dismissed) return null
  if (!competeEnLeaderboard(yo) && !esDireccion(yo) && yo.nivel !== 'head') return null

  const mesAnt = mesAnteriorStr()
  const mesAntNombre = new Date(mesAnt + '-02T00:00:00').toLocaleDateString('es-MX', { month: 'long' })

  // RPC (post-cutover, para todos) > historial legible (pre-cutover/flag).
  // Sin mes cerrado NO hay banner — el podio nunca se calcula en vivo.
  const snapshot = historial.filter((h) => h.mes === mesAnt).sort((a, b) => b.xpTotal - a.xpTotal)
  const top3 = (podioRpc && podioRpc.length > 0)
    ? podioRpc.slice(0, 3).map((s) => ({ nombre: s.persona, porcentaje: s.cumplimiento }))
    : snapshot.slice(0, 3).map((s) => ({ nombre: s.persona, porcentaje: s.cumplimiento }))
  if (top3.length === 0) return null

  return (
    <section data-testid="banner-podio"
      className="card-hover mt-4 flex flex-wrap items-center gap-6 rounded-2xl bg-movdi-rosa px-6 py-5 text-black">
      <div className="min-w-[200px] flex-1">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-widest">
          🏆 podio de {mesAntNombre} <span className="opacity-60">· mes cerrado</span>
        </div>
        <div className="mt-1 text-sm opacity-80">felicidades al equipo — estos fueron los más constantes del mes pasado</div>
      </div>
      <div className="flex flex-wrap gap-5">
        {top3.map((r, i) => (
          <div key={r.nombre} className="min-w-[90px] rounded-xl bg-black/10 px-3 py-2 text-center">
            <div className="text-2xl leading-none">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
            <div className="mt-1 text-[13px] font-semibold">{r.nombre}</div>
            <div className="font-mono text-[10px] uppercase opacity-70">{r.porcentaje}%</div>
          </div>
        ))}
      </div>
      <button
        onClick={() => { try { localStorage.setItem(dismissKey, '1') } catch { /* sin storage */ } setDismissed(true) }}
        className="rounded-full border border-black/30 px-3 py-1.5 font-mono text-[11px] uppercase transition-colors hover:bg-black/10">
        ✕ cerrar
      </button>
    </section>
  )
}

// ============================================================
// Fila de la tabla (paridad renderFila del SPA: petición · de → para ·
// área · fecha · prio · estatus · acciones)
function FilaPeticion({ t, yo, admin, esAdmi, onGuardarCliente, onEstatus, onEntregar, onCambiarFecha, onMover, onNota, onEliminar, onOcultar, onDesocultar }: {
  t: Peticion
  yo: Persona
  admin: boolean
  esAdmi: boolean
  onGuardarCliente: () => void
  onEstatus: (n: 'pendiente' | 'proceso') => void
  onEntregar: () => void
  onCambiarFecha: () => void
  onMover: () => void
  onNota: () => void
  onEliminar: () => void
  onOcultar: () => void
  onDesocultar: () => void
}) {
  const soyCreador = t.creadoPor === yo.nombre
  const soyDest = matchNombre(t.para, yo.nombre)
  const puedoActuar = soyCreador || soyDest
  const lf = labelFecha(t)
  const vencida = t.estatus !== 'entregado' && diasHasta(t.fecha) < 0
  const oculta = estaOcultaParaMi(t, yo.nombre)
  const compromiso = esCompromisoPropio(t)
  // regla de los 3 días hábiles: atorada = ROJO (calculado, no hay campo)
  const atorada = estadoMovimiento(t) === 'atorada'
  const diasSinMov = diasSinMovimiento(t)
  // formularios dinámicos (cutover 10): el detalle se lee con la config del
  // tipo; los recomendados faltantes se calculan EN VIVO (no se almacenan)
  const tipoForm = tipoDe(t.area, t.tipoPeticion)
  const detalleForm = (t.detalle ?? {}) as Detalle
  const validForm = tipoForm
    ? validarDetalle(tipoForm, detalleForm, { descripcion: t.descripcion })
    : null

  const btn = 'rounded-md border px-2 py-0.5 font-mono text-[10px] whitespace-nowrap'

  return (
    <tr data-testid="card-peticion"
      className={`border-b border-neutral-800/70 align-top hover:bg-neutral-900/60 ${oculta ? 'opacity-50' : ''}`}>
      {/* petición: nombre + tags + descripción + banners */}
      <td className="max-w-[26rem] px-3 py-2.5">
        <div className="text-sm font-semibold">
          {oculta && <span className="mr-1 text-[11px] text-neutral-500" title="oculta de tu vista">🙈</span>}
          {t.privada && <span title="privada · solo creador y destinatario">🔒 </span>}
          {t.nombre}
          {t.origenRecur && <span className="ml-2 whitespace-nowrap font-mono text-[10px] text-movdi-amarillo" title="instancia de recurrente">↻ recurrente</span>}
          {t.grupoId && <span className="ml-2 font-mono text-[10px] text-neutral-500">grupo</span>}
          {t.origen && (
            <span className="ml-2 whitespace-nowrap rounded-full border border-neutral-700 px-1.5 font-mono text-[10px] uppercase text-neutral-400"
              title={`origen: ${t.origen}`} data-testid="tag-origen">
              {t.origen}
            </span>
          )}
          {t.estatus === 'entregado' && (t.linkEntrega || t.notaEntrega) && (
            <span className="ml-1 text-[11px] text-movdi-verde" title="con evidencia de entrega">📎</span>
          )}
          {/* ⚠ plazo ajustado (paridad SPA: margen de nacimiento ≤ 2 días;
              ≤ 1 = "muy ajustado" en naranja, 2 = "ajustado" en amarillo) */}
          {t.estatus !== 'entregado' && !t.origenRecur && (() => {
            const m = margenPeticion(t)
            if (m === null || m > 2) return null
            const txt = m <= 1 ? 'plazo muy ajustado' : 'plazo ajustado'
            return (
              <span data-testid="alerta-plazo"
                className={`ml-1 text-[11px] ${m <= 1 ? 'text-movdi-naranja' : 'text-movdi-amarillo'}`}
                title={`${txt}: pedida con ${m} ${m === 1 ? 'día' : 'días'} de margen`}>
                ⚠
              </span>
            )
          })()}
        </div>
        {/* whitespace-pre-line: las notas de avance se apilan una por línea */}
        {t.descripcion && <p className="mt-0.5 whitespace-pre-line text-xs text-neutral-400">{t.descripcion}</p>}
        {/* detalle del formulario dinámico (cutover 10) */}
        {tipoForm && (
          <div className="mt-1.5 space-y-0.5 border-l-2 border-neutral-800 pl-2" data-testid="detalle-tipo">
            <div className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
              {etiquetaTipo(t.area, t.tipoPeticion)}
              {tipoForm.slaLabel && <span className="ml-1.5 text-movdi-naranja">· {tipoForm.slaLabel}</span>}
            </div>
            {camposVisibles(tipoForm, detalleForm)
              .filter((c) => detalleForm[c.key] !== undefined && detalleForm[c.key] !== '')
              .map((c) => {
                const v = detalleForm[c.key]
                let texto = typeof v === 'boolean' ? (v ? 'sí' : 'no') : String(v)
                if (c.catalogo && typeof v === 'string') {
                  const clave = String(c.normaliza ? c.normaliza(v) : v)
                  const op = c.catalogo.find((x) => x.v === clave)
                  if (op) texto = c.catalogoMuestraClave ? `${op.v} · ${op.label}` : op.label
                }
                return (
                  <div key={c.key} className="font-mono text-[11px] text-neutral-400">
                    <span className="text-neutral-600">{c.label}:</span>{' '}
                    {c.input === 'url'
                      ? <a className="underline hover:text-movdi-naranja" href={texto} target="_blank" rel="noreferrer">{texto}</a>
                      : <span className="text-neutral-300">{texto}</span>}
                  </div>
                )
              })}
            {validForm && validForm.recomendadosFaltantes.length > 0 && (
              <div className="font-mono text-[10px] text-movdi-amarillo" data-testid="chip-faltantes"
                title="campos recomendados sin llenar — no bloquean, pero el área los va a pedir">
                ⚠ faltan: {validForm.recomendadosFaltantes.join(', ')}
              </div>
            )}
            {validForm?.avisos.map((a) => (
              <div key={a} className="font-mono text-[10px] text-movdi-naranja">{a}</div>
            ))}
            {esAdmi && !t.clienteId && typeof detalleForm.cliente_nombre === 'string' && detalleForm.cliente_nombre && (
              <button onClick={onGuardarCliente} data-testid="btn-guardar-cliente-catalogo"
                title="pasa los datos capturados a mano al catálogo — la próxima vez se autocompletan"
                className="mt-1 rounded-md border border-neutral-700 px-2 py-0.5 font-mono text-[10px] text-neutral-300 hover:border-movdi-naranja/60 hover:text-movdi-naranja">
                💾 guardar cliente al catálogo
              </button>
            )}
          </div>
        )}
        {t.motivoCambioFecha && (
          <p className="mt-1 border-l-2 border-movdi-amarillo/50 pl-2 font-mono text-[11px] text-movdi-amarillo/90">
            fecha movida{t.fechaOriginal ? ` (original: ${t.fechaOriginal})` : ''} · {t.motivoCambioFecha}
            {t.extensionJustificada === false && ' · cuenta contra la fecha original'}
          </p>
        )}
        {t.estatus === 'entregado' && (t.linkEntrega || t.notaEntrega) && (
          <p className="mt-1 font-mono text-[11px] text-movdi-verde/90" data-testid="evidencia">
            evidencia: {t.linkEntrega && <a className="underline" href={t.linkEntrega} target="_blank" rel="noreferrer">{t.linkEntrega}</a>}
            {t.linkEntrega && t.notaEntrega && ' · '}
            {t.notaEntrega}
          </p>
        )}
      </td>
      {/* de → para (compromiso propio: solicitante = asignado) */}
      <td className="whitespace-nowrap px-3 py-2.5">
        {compromiso ? (
          <span className="font-mono text-[11px] text-movdi-amarillo" title={`compromiso auto-asignado de ${t.para}`} data-testid="tag-compromiso">
            ✋ compromiso de <strong className="text-[13px] text-neutral-200">{t.para}</strong>
          </span>
        ) : (
          <>
            <span className="font-mono text-[11px] text-neutral-500">{t.creadoPor}</span>
            <span className="text-neutral-500"> → </span>
            <strong className="text-[13px] text-neutral-200">{t.para}</strong>
          </>
        )}
      </td>
      {/* área */}
      <td className="whitespace-nowrap px-3 py-2.5">
        {t.area
          ? <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${AREA_COLOR[t.area] ?? 'border-neutral-700 text-neutral-400'}`}>{AREAS_LABEL[t.area] ?? t.area}</span>
          : <span className="font-mono text-[10px] text-neutral-600">—</span>}
      </td>
      {/* fecha + sub (vencida Nd en rojo, paridad date-cell) */}
      <td className="whitespace-nowrap px-3 py-2.5">
        <div className={`text-[13px] ${t.estatus === 'entregado' ? 'text-movdi-verde' : vencida ? 'font-medium text-movdi-naranja' : 'text-neutral-300'}`}>
          {fechaCorta(t.fecha)}
        </div>
        <div className={`font-mono text-[10px] ${t.estatus === 'entregado' ? 'text-movdi-verde/80' : vencida ? 'text-movdi-naranja' : 'text-neutral-500'}`}>
          {lf}
        </div>
      </td>
      {/* prioridad */}
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${PRIO_COLOR[t.prioridad]}`}>{t.prioridad}</span>
      </td>
      {/* estatus (+ alerta de atorada: 3+ días hábiles sin movimiento) */}
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className={`font-mono text-[10px] uppercase ${t.estatus === 'entregado' ? 'text-movdi-verde' : t.estatus === 'proceso' ? 'text-movdi-amarillo' : 'text-neutral-400'}`}>
          {t.estatus === 'entregado' ? 'entregado ✓' : t.estatus === 'proceso' ? 'en proceso' : t.estatus}
        </span>
        {atorada && (
          <div className="mt-0.5 font-mono text-[10px] font-medium text-movdi-naranja" data-testid="badge-atorada"
            title={`sin movimiento real (estatus, notas o entrega) desde hace ${diasSinMov} días hábiles`}>
            ⏸ atorada · {diasSinMov}d sin mov.
          </div>
        )}
      </td>
      {/* acciones */}
      <td className="px-3 py-2.5">
        {puedoActuar && (
          <div className="reveal-acciones flex max-w-[15rem] flex-wrap gap-1.5">
            {t.estatus !== 'entregado' && (
              <>
                <button onClick={onEntregar} data-testid="btn-entregar"
                  className={`${btn} border-movdi-verde/50 text-movdi-verde hover:bg-movdi-verde/10`}>
                  entregar ✓
                </button>
                <button onClick={() => onEstatus(t.estatus === 'proceso' ? 'pendiente' : 'proceso')}
                  className={`${btn} border-neutral-700 text-neutral-300 hover:border-neutral-500`}>
                  {t.estatus === 'proceso' ? '↩ a pendiente' : '▶ en proceso'}
                </button>
                <button onClick={onCambiarFecha} data-testid="btn-cambiar-fecha"
                  className={`${btn} border-neutral-700 text-neutral-300 hover:border-neutral-500`}>
                  cambiar fecha
                </button>
                <button onClick={onNota} data-testid="btn-nota-avance"
                  title="deja constancia de avance sin cambiar el estatus · cuenta como movimiento"
                  className={`${btn} border-neutral-700 text-neutral-300 hover:border-neutral-500`}>
                  + nota
                </button>
              </>
            )}
            {t.estatus === 'entregado' && (
              <button onClick={() => onEstatus('pendiente')}
                className={`${btn} border-neutral-700 text-neutral-300 hover:border-neutral-500`}>
                reabrir
              </button>
            )}
            {t.estatus === 'entregado' && !oculta && (
              <button onClick={onOcultar} data-testid="btn-ocultar" title="ocultar de mi vista · sigue contando en el progreso"
                className={`${btn} border-neutral-700 text-neutral-400 hover:border-neutral-500`}>
                🙈
              </button>
            )}
            {oculta && (
              <button onClick={onDesocultar} data-testid="btn-desocultar" title="mostrar de nuevo"
                className={`${btn} border-neutral-700 text-neutral-400 hover:border-neutral-500`}>
                👁
              </button>
            )}
            {t.origenRecur && (soyCreador || admin) && t.estatus !== 'entregado' && (
              <button onClick={onMover} data-testid="btn-mover-instancia"
                className={`${btn} border-movdi-amarillo/50 text-movdi-amarillo hover:bg-movdi-amarillo/10`}>
                mover instancia
              </button>
            )}
            {soyCreador && (
              <button onClick={onEliminar}
                className={`${btn} border-movdi-naranja/40 text-movdi-naranja hover:bg-movdi-naranja/10`}>
                eliminar
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
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

const inputCls = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-movdi-naranja'
const labelCls = 'mb-1 block font-mono text-[11px] uppercase tracking-wider text-neutral-400'

// ============================================================
function ModalCrear({ yo, personas, clientes, admin, onCerrar, onCrear }: {
  yo: Persona
  personas: Persona[]
  clientes: Cliente[]
  admin: boolean
  onCerrar: () => void
  onCrear: (input: Parameters<typeof crearPeticion>[0]) => Promise<{ ok: boolean; error?: string }>
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
  // fricción de plazo ajustado (nunca bloqueo total): con margen ≤ 2 días el
  // botón se habilita solo tras confirmar que ya se verificó con quien entrega
  const [verificado, setVerificado] = useState(false)

  // ---- formulario dinámico por área (cutover 10) ----
  const [tipoKey, setTipoKey] = useState('')
  const [detalle, setDetalle] = useState<Detalle>({})
  const [clienteId, setClienteId] = useState('')
  // el candado aplica al dirigir a un área con tipos, en modos con área explícita
  const areaActiva = modo === 'una' ? areaUna : modo === 'area' ? areaGrupo : null
  const candadoActivo = areaTieneTipos(areaActiva)
  const tipo: TipoPeticion | null = candadoActivo ? tipoDe(areaActiva, tipoKey || null) : null
  const slaActiva = !!tipo?.slaDiasHabiles
  const validacion = tipo ? validarDetalle(tipo, detalle, { descripcion: desc }) : null

  function resetTipo() {
    setTipoKey('')
    setDetalle({})
    setClienteId('')
  }
  function cambiarTipo(key: string) {
    setTipoKey(key)
    setDetalle({})
    setClienteId('')
    const t = tipoDe(areaActiva, key || null)
    const fSLA = t ? fechaPorSLA(t) : null
    if (fSLA) setFecha(fSLA)
  }
  function elegirCliente(id: string) {
    setClienteId(id)
    if (!tipo) return
    const cli = clientes.find((c) => c.id === id)
    if (cli) setDetalle((d) => aplicarCliente(tipo, d, cli))
  }

  const margenNudge = diasHasta(fecha)
  // con SLA la fecha es la pactada del proceso — el nudge de plazo no aplica
  const nudgeActivo = !slaActiva && !isNaN(margenNudge) && margenNudge <= 2

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
    if (candadoActivo && !tipo) { setErr('elige el tipo de petición — esta área lo requiere'); return }
    if (tipo && validacion && !validacion.ok) {
      setErr(`faltan campos obligatorios: ${validacion.bloqueantesFaltantes.join(', ')}`)
      return
    }
    const { destinatarios } = destinatariosPorModo(modo, {
      personas, yo, para, seleccion, area: modo === 'una' ? areaUna : areaGrupo,
    })
    if (!destinatarios.length) { setErr(modo === 'una' ? 'falta destinatario' : 'selecciona al menos una persona'); return }
    // Confirmación si son más de 5 (paridad SPA)
    if (destinatarios.length > 5 &&
      !confirm(`vas a asignar esta petición a ${destinatarios.length} personas. ¿confirmas?\n\n${destinatarios.join(', ')}`)) return
    setGuardando(true)
    const r = await onCrear({
      nombre, descripcion: desc, fecha, prioridad: prio, privada, modo,
      para: modo === 'una' ? para : undefined,
      seleccion: modo === 'varias' ? seleccion : undefined,
      area: modo === 'una' ? areaUna : modo === 'area' ? areaGrupo : undefined,
      tipoPeticion: tipo ? tipo.key : undefined,
      detalle: tipo ? detalle : undefined,
      clienteId: tipo && clienteId ? clienteId : undefined,
    })
    setGuardando(false)
    if (!r.ok) setErr(r.error || 'no se pudo crear la petición')
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
                  onChange={() => { setModo(m.v); resetTipo() }} />
                <span>{m.lab}</span>
              </label>
            ))}
          </div>
        </div>

        {modo === 'una' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="pet-area">área</label>
              <select id="pet-area" className={inputCls} value={areaUna} onChange={(e) => { setAreaUna(e.target.value); setPara(''); resetTipo() }}>
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
            <select id="pet-area-grupo" className={inputCls} value={areaGrupo} onChange={(e) => { setAreaGrupo(e.target.value); resetTipo() }}>
              {AREAS_VALIDAS.map((a) => <option key={a} value={a}>{AREAS_LABEL[a]}</option>)}
            </select>
            <p className="mt-1 font-mono text-[11px] text-neutral-500">
              — se asignará a {delArea(areaGrupo).length} persona(s) de {AREAS_LABEL[areaGrupo]} —
            </p>
          </div>
        )}

        {/* ---- formulario dinámico por área (cutover 10) ---- */}
        {candadoActivo && (
          <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3" data-testid="form-dinamico">
            <div>
              <label className={labelCls} htmlFor="pet-tipo">
                tipo de petición <span className="text-movdi-naranja">*</span>
              </label>
              <select id="pet-tipo" data-testid="pet-tipo" className={inputCls} value={tipoKey}
                onChange={(e) => cambiarTipo(e.target.value)}>
                <option value="">— elige el tipo —</option>
                {(() => {
                  const tipos = tiposDeArea(areaActiva!)
                  const grupos = [...new Set(tipos.map((t) => t.grupo).filter(Boolean))] as string[]
                  if (!grupos.length) return tipos.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)
                  return [
                    ...grupos.map((g) => (
                      <optgroup key={g} label={g}>
                        {tipos.filter((t) => t.grupo === g).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </optgroup>
                    )),
                    ...tipos.filter((t) => !t.grupo).map((t) => <option key={t.key} value={t.key}>{t.label}</option>),
                  ]
                })()}
              </select>
            </div>

            {tipo?.usaCliente && (
              <div>
                <label className={labelCls} htmlFor="pet-cliente">cliente (autocompleta del catálogo)</label>
                <select id="pet-cliente" data-testid="pet-cliente" className={inputCls} value={clienteId}
                  onChange={(e) => elegirCliente(e.target.value)}>
                  <option value="">— nuevo cliente / capturar manualmente —</option>
                  {clientes.filter((c) => c.activo).map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}{c.rfc ? ` · ${c.rfc}` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {tipo && camposVisibles(tipo, detalle).map((c) => (
              <CampoDinamico key={c.key} campo={c} detalle={detalle}
                onChange={(v) => setDetalle((d) => ({ ...d, [c.key]: v }))} />
            ))}

            {tipo?.requiereDescripcion && (
              <p className="font-mono text-[10px] text-neutral-500">
                este tipo se explica en la <strong>descripción</strong> de arriba — es obligatoria
              </p>
            )}
            {validacion && validacion.avisos.map((a) => (
              <p key={a} role="status" className="border border-movdi-amarillo/40 bg-movdi-amarillo/10 px-2.5 py-1.5 font-mono text-[11px] text-movdi-amarillo" data-testid="aviso-detalle">
                {a}
              </p>
            ))}
            {validacion && validacion.ok && validacion.recomendadosFaltantes.length > 0 && (
              <p className="font-mono text-[10px] text-neutral-500" data-testid="nota-recomendados">
                se puede crear, pero quedará marcada con faltantes recomendados: {validacion.recomendadosFaltantes.join(', ')}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="pet-fecha">
              {slaActiva ? <>fecha compromiso · <span className="text-movdi-naranja">{tipo!.slaLabel}</span> (automática)</> : 'fecha límite'}
            </label>
            <input id="pet-fecha" type="date" className={`${inputCls} ${slaActiva ? 'opacity-60' : ''}`} value={fecha}
              disabled={slaActiva}
              title={slaActiva ? `la fecha la fija el SLA del tipo (${tipo!.slaLabel}, días hábiles)` : undefined}
              onChange={(e) => { setFecha(e.target.value); setVerificado(false) }} />
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

        {/* nudge de plazo ajustado (mismo umbral del ⚠: margen ≤ 2 días).
            Fricción, no bloqueo: el aviso pide confirmar con quien entrega y
            el botón de crear se habilita al marcar el checkbox. Cambiar la
            fecha resetea la confirmación. */}
        {nudgeActivo && (() => {
          const m = margenNudge
          const quien = modo === 'una' && para ? para : 'quien va a entregar'
          const fuerte = m <= 1
          return (
            <div data-testid="nudge-plazo" role="status"
              className={`space-y-2 rounded-xl border px-3 py-2 text-xs ${fuerte
                ? 'border-movdi-naranja/60 bg-movdi-naranja/10 text-movdi-naranja'
                : 'border-movdi-amarillo/50 bg-movdi-amarillo/10 text-movdi-amarillo'}`}>
              <p>
                ⚠ estás dando poco tiempo para entregar ({m <= 0 ? 'para hoy' : m === 1 ? 'mañana' : `${m} días`}) —{' '}
                ¿ya verificaste con <strong>{quien}</strong> si es posible esta entrega?
              </p>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" data-testid="nudge-verificado" checked={verificado}
                  onChange={(e) => setVerificado(e.target.checked)} />
                <span>✓ sí, ya verifiqué con <strong>{quien}</strong> que es posible esta entrega</span>
              </label>
            </div>
          )
        })()}

        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" id="pet-privada" checked={privada} onChange={(e) => setPrivada(e.target.checked)} />
          <span>🔒 petición privada <span className="text-neutral-500">— solo tú y el destinatario la ven (ni dirección)</span></span>
        </label>

        {err && <p role="alert" className="font-mono text-xs text-movdi-naranja">{err}</p>}

        {/* candado (cutover 10): sin tipo o sin bloqueantes, crear ni se habilita */}
        {candadoActivo && (!tipo || (validacion && !validacion.ok)) && (
          <p className="font-mono text-[11px] text-movdi-naranja" data-testid="hint-bloqueantes">
            {!tipo
              ? '🔒 elige el tipo de petición — esta área lo requiere'
              : `🔒 faltan obligatorios: ${validacion!.bloqueantesFaltantes.join(', ')}`}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button onClick={guardar}
            disabled={guardando || (nudgeActivo && !verificado) || (candadoActivo && (!tipo || !validacion?.ok))}
            data-testid="btn-crear-confirmar"
            title={nudgeActivo && !verificado ? 'confirma que ya verificaste la entrega con el plazo ajustado' : undefined}
            className="rounded-full bg-movdi-naranja px-4 py-2 text-xs font-medium hover:bg-movdi-naranja/85 disabled:opacity-50">
            {guardando ? 'creando…' : 'crear petición'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ============================================================
// Campo del formulario dinámico (cutover 10) — un input por CampoTipo de la
// config. El asterisco naranja marca bloqueantes; los recomendados dicen
// "(recomendado)".
function CampoDinamico({ campo, detalle, onChange }: {
  campo: CampoTipo
  detalle: Detalle
  onChange: (v: string | boolean) => void
}) {
  const id = `det-${campo.key}`
  const v = detalle[campo.key]
  const etiqueta = (
    <label className={labelCls} htmlFor={id}>
      {campo.label}{' '}
      {campo.clase === 'bloqueante'
        ? <span className="text-movdi-naranja">*</span>
        : <span className="normal-case text-neutral-600">(recomendado)</span>}
    </label>
  )
  if (campo.input === 'textarea') {
    return (
      <div>{etiqueta}
        <textarea id={id} rows={2} className={inputCls} placeholder={campo.placeholder}
          value={typeof v === 'string' ? v : ''} onChange={(e) => onChange(e.target.value)} />
      </div>
    )
  }
  if (campo.input === 'select') {
    // valor normalizado: capturas legadas del catálogo caen a la clave
    const val = typeof v === 'string' ? String(campo.normaliza ? campo.normaliza(v) : v) : ''
    const opTexto = (o: { v: string; label: string }) =>
      campo.catalogoMuestraClave ? `${o.v} · ${o.label}` : o.label
    const frecuentes = (campo.catalogo ?? []).filter((o) => o.frecuente)
    const resto = (campo.catalogo ?? []).filter((o) => !o.frecuente)
    return (
      <div>{etiqueta}
        <select id={id} className={inputCls} value={val}
          onChange={(e) => onChange(e.target.value)}>
          <option value="">— elige —</option>
          {campo.catalogo ? (
            frecuentes.length ? (
              <>
                <optgroup label="frecuentes">
                  {frecuentes.map((o) => <option key={o.v} value={o.v}>{opTexto(o)}</option>)}
                </optgroup>
                <optgroup label="todo el catálogo">
                  {resto.map((o) => <option key={o.v} value={o.v}>{opTexto(o)}</option>)}
                </optgroup>
              </>
            ) : (campo.catalogo.map((o) => <option key={o.v} value={o.v}>{opTexto(o)}</option>))
          ) : (
            (campo.opciones ?? []).map((o) => <option key={o} value={o}>{o}</option>)
          )}
        </select>
      </div>
    )
  }
  if (campo.input === 'si_no') {
    return (
      <div>
        <span className={labelCls}>{campo.label}{' '}
          {campo.clase === 'bloqueante'
            ? <span className="text-movdi-naranja">*</span>
            : <span className="normal-case text-neutral-600">(recomendado)</span>}
        </span>
        <div className="flex gap-4 text-xs" data-testid={id}>
          {[['sí', true], ['no', false]].map(([lab, val]) => (
            <label key={String(lab)} className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" name={id} checked={v === val} onChange={() => onChange(val as boolean)} />
              {lab}
            </label>
          ))}
        </div>
      </div>
    )
  }
  const tipoInput =
    campo.input === 'fecha' ? 'date'
    : campo.input === 'monto' ? 'number'
    : campo.input === 'correo' ? 'email'
    : campo.input === 'url' ? 'url' : 'text'
  return (
    <div>{etiqueta}
      <input id={id} type={tipoInput} step={campo.input === 'monto' ? '0.01' : undefined}
        className={inputCls} placeholder={campo.placeholder}
        value={typeof v === 'string' ? v : ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

// ============================================================
// ✋ Nuevo compromiso (Fase compromisos): trabajo emergente que uno mismo
// toma — solicitante = asignado. SIN toggle de privada (forzado false en el
// servidor: un compromiso privado sería invisible para el líder). origen
// OBLIGATORIO y sin preselección: es el dato que se quiere medir.
function ModalCompromiso({ yo, onCerrar, onCrear }: {
  yo: Persona
  onCerrar: () => void
  onCrear: (input: Parameters<typeof crearCompromiso>[0]) => Promise<{ ok: boolean; error?: string }>
}) {
  const [nombre, setNombre] = useState('')
  const [desc, setDesc] = useState('')
  const [fecha, setFecha] = useState(dx(3))
  const [prio, setPrio] = useState<'alta' | 'media' | 'baja'>('media')
  const [origen, setOrigen] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const ORIGEN_DESC: Record<string, string> = {
    talento: 'talento — lo pidió un talento',
    cliente: 'cliente — lo pidió un cliente',
    interno: 'interno — nace del equipo / la agencia',
    propio: 'propio — iniciativa mía',
  }

  async function guardar() {
    setErr(null)
    if (!nombre.trim()) { setErr('el nombre del compromiso es obligatorio'); return }
    if (!origen) { setErr('indica de dónde nace el compromiso'); return }
    setGuardando(true)
    const r = await onCrear({ nombre, descripcion: desc, fecha, prioridad: prio, origen })
    setGuardando(false)
    if (!r.ok) setErr(r.error || 'no se pudo crear el compromiso')
  }

  return (
    <ModalShell titulo="✋ nuevo compromiso" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300">
          se asigna a <strong>ti ({yo.nombre})</strong> — queda en el mismo tablero,
          visible para tu líder y dirección. no da XP.
          <span className="block font-mono text-[10px] text-neutral-500">
            para pendientes 100% personales usa &quot;mis to-dos&quot; (esos sí son privados)
          </span>
        </p>
        <div>
          <label className={labelCls} htmlFor="comp-nombre">¿qué te comprometes a entregar?</label>
          <input id="comp-nombre" className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </div>
        <div>
          <label className={labelCls} htmlFor="comp-desc">descripción</label>
          <textarea id="comp-desc" rows={3} className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="comp-origen">¿de dónde nace? (obligatorio)</label>
          <select id="comp-origen" data-testid="comp-origen" className={inputCls} value={origen} onChange={(e) => setOrigen(e.target.value)}>
            <option value="">— elige el origen —</option>
            {ORIGENES_VALIDOS.map((o) => <option key={o} value={o}>{ORIGEN_DESC[o]}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="comp-fecha">fecha compromiso</label>
            <input id="comp-fecha" type="date" min={dx(0)} className={inputCls} value={fecha}
              onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="comp-prio">prioridad</label>
            <select id="comp-prio" className={inputCls} value={prio} onChange={(e) => setPrio(e.target.value as typeof prio)}>
              <option value="media">media</option>
              <option value="alta">alta</option>
              <option value="baja">baja</option>
            </select>
          </div>
        </div>

        {err && <p role="alert" className="font-mono text-xs text-movdi-naranja">{err}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button onClick={guardar} disabled={guardando} data-testid="btn-compromiso-confirmar"
            className="rounded-full bg-movdi-naranja px-4 py-2 text-xs font-medium hover:bg-movdi-naranja/85 disabled:opacity-50">
            {guardando ? 'creando…' : 'tomar compromiso ✋'}
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
          <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button onClick={() => onConfirmar(link, nota)} data-testid="btn-entrega-confirmar"
            className="rounded-full bg-movdi-verde px-4 py-2 text-xs font-medium hover:bg-movdi-verde/85">
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
        <p className="border border-movdi-amarillo/30 bg-movdi-amarillo/5 px-3 py-2 text-xs text-neutral-300">
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
        {err && <p role="alert" className="font-mono text-xs text-movdi-naranja">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button data-testid="btn-fecha-confirmar"
            onClick={async () => {
              if (motivo.trim().length < 10) { setErr('escribe al menos 10 caracteres explicando el motivo'); return }
              await onConfirmar(fecha, motivo, soyCreador ? justif : undefined)
            }}
            className="rounded-full bg-movdi-naranja px-4 py-2 text-xs font-medium hover:bg-movdi-naranja/85">
            guardar cambio
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ============================================================
// ⏱ Nota de avance: una línea que deja constancia SIN tocar estatus ni
// entrega. Cuenta como movimiento real (limpia "atorada") — la salida
// legítima para tareas bloqueadas por terceros. Cambiar la fecha, a
// propósito, NO limpia el rojo.
function ModalNotaAvance({ t, onCerrar, onConfirmar }: {
  t: Peticion
  onCerrar: () => void
  onConfirmar: (nota: string) => Promise<void>
}) {
  const [nota, setNota] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setErr(null)
    if (nota.trim().length < 3) { setErr('escribe la nota de avance (mínimo 3 caracteres)'); return }
    setGuardando(true)
    await onConfirmar(nota)
    setGuardando(false)
  }

  return (
    <ModalShell titulo={`⏱ nota de avance · ${t.nombre}`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="font-mono text-[11px] text-neutral-500">
          no cambia el estatus — solo deja constancia de que la tarea se movió
          (p. ej. &quot;esperando respuesta del cliente&quot;). resetea el contador de días sin movimiento.
        </p>
        <div>
          <label className={labelCls} htmlFor="nota-avance">¿en qué va?</label>
          <input id="nota-avance" maxLength={200} className={inputCls} autoFocus
            placeholder="ej: mandé segundo recordatorio al cliente, sigo en espera"
            value={nota} onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void guardar() }} />
        </div>
        {err && <p role="alert" className="font-mono text-xs text-movdi-naranja">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button onClick={guardar} disabled={guardando} data-testid="btn-nota-confirmar"
            className="rounded-full bg-movdi-naranja px-4 py-2 text-xs font-medium hover:bg-movdi-naranja/85 disabled:opacity-50">
            {guardando ? 'guardando…' : 'guardar nota'}
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
        <p className="border border-movdi-amarillo/20 bg-movdi-amarillo/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-neutral-400">
          ℹ la siguiente entrega del patrón llegará en su fecha habitual
        </p>
        {err && <p role="alert" className="font-mono text-xs text-movdi-naranja">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button data-testid="btn-mover-confirmar"
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
