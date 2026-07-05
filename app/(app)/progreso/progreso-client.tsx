'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type Peticion, mapPeticionRow, mapPersonaRow, matchNombre, type Persona } from '@/lib/peticiones'
import { type Recurrente, mapRecurRow } from '@/lib/recurrentes'
import { type Estrella, mapEstrellaRow } from '@/lib/estrellas'
import { type PersonaConManagers, esDireccion } from '@/lib/equipo'
import {
  type HistorialMes, type Recompensa,
  calcularCumplimiento, calcularGamePersona, calcularLeaderboardMes, calcularLogros,
  calcularReconocimientosMes, calcularReporteCierre, mapHistorialRow, mapRecompensaRow,
  mesAnteriorStr, mesCerrado,
} from '@/lib/gamificacion'
import { cerrarMes, guardarRecompensa, marcarRecompensaEntregada } from './actions'

export default function ProgresoClient({ yo }: { yo: PersonaConManagers }) {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [peticiones, setPeticiones] = useState<Peticion[]>([])
  const [recurrentes, setRecurrentes] = useState<Recurrente[]>([])
  const [estrellas, setEstrellas] = useState<Estrella[]>([])
  const [recompensas, setRecompensas] = useState<Recompensa[]>([])
  const [historial, setHistorial] = useState<HistorialMes[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const soyDireccion = esDireccion(yo)
  // Fase 4.8 — visibilidad por rol:
  // · flag ve_gamificacion_completa (Dani/Emmanuel) → ve todo
  // · head → progreso de SU equipo (leaderboard soloEquipo), sin estrellas
  //   ni recompensas ajenas
  // · rh → entrega de recompensas ganadas
  // · ejecutivo → SOLO lo suyo
  // La RLS de la migración cutover_gamificacion_privacidad lo respalda en BD.
  const veTodo = yo.veGamificacionCompleta
  const soyHead = yo.nivel === 'head' && !veTodo
  const soyRH = yo.nivel === 'rh'

  const recargar = useCallback(async () => {
    const sb = createClient()
    const [pers, pets, recs, est, rec, hist] = await Promise.all([
      sb.from('personas').select('*'),
      sb.from('peticiones').select('*'),
      sb.from('recurrentes').select('*'),
      sb.from('estrellas_colaboracion').select('*'),
      sb.from('recompensas').select('*').order('nivel'),
      sb.from('historial_mensual').select('*').order('mes', { ascending: false }),
    ])
    if (!pers.error) setPersonas((pers.data ?? []).map(mapPersonaRow))
    if (!pets.error) setPeticiones((pets.data ?? []).map(mapPeticionRow))
    if (!recs.error) setRecurrentes((recs.data ?? []).map(mapRecurRow))
    if (!est.error) setEstrellas((est.data ?? []).map(mapEstrellaRow))
    if (!rec.error) setRecompensas((rec.data ?? []).map(mapRecompensaRow))
    if (!hist.error) setHistorial((hist.data ?? []).map(mapHistorialRow))
    setCargando(false)
  }, [])

  // Carga inicial client-side (anon+RLS); setState tras await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void recargar() }, [recargar])

  const mes = new Date().toISOString().slice(0, 7)
  const game = useMemo(() => calcularGamePersona(yo.nombre, mes, peticiones, estrellas), [yo, mes, peticiones, estrellas])
  const logros = useMemo(() => calcularLogros({ nombre: yo.nombre, peticiones, estrellas, historial }), [yo, peticiones, estrellas, historial])

  // leaderboard: dirección/todos · head no-dirección: solo su equipo (paridad)
  const lb = useMemo(() => calcularLeaderboardMes({
    mes, personas, peticiones,
    soloEquipo: yo.nivel === 'head' && !veTodo ? yo.nombre : undefined,
  }), [mes, personas, peticiones, yo, veTodo])
  const recos = useMemo(() => calcularReconocimientosMes({ mes, personas, peticiones }), [mes, personas, peticiones])

  // mi ritmo: cumplimiento de MIS recurrentes activas (paridad renderMiRitmo)
  const miRitmo = useMemo(() =>
    recurrentes
      .filter((r) => r.activa && matchNombre(r.para, yo.nombre))
      .map((r) => ({ recur: r, cumpli: calcularCumplimiento(r, peticiones, 12) })),
    [recurrentes, peticiones, yo])

  // meses cerrados: navegación ← → un mes a la vez + toggle de entradas
  // (solo presentación — nada de editar los valores archivados)
  const [mesHistSel, setMesHistSel] = useState<string | null>(null)
  const [ocultarHistorial, setOcultarHistorial] = useState(false)
  const historialVisible = useMemo(
    () => historial.filter((h) => veTodo || soyRH || h.persona === yo.nombre),
    [historial, veTodo, soyRH, yo],
  )
  const mesesHistorial = useMemo(
    () => [...new Set(historialVisible.map((h) => h.mes))].sort((a, b) => (a < b ? 1 : -1)),
    [historialVisible],
  )
  const mesHistActivo = mesHistSel && mesesHistorial.includes(mesHistSel) ? mesHistSel : mesesHistorial[0] ?? null
  const idxMesHist = mesHistActivo ? mesesHistorial.indexOf(mesHistActivo) : -1
  const filasMesHist = useMemo(
    () => historialVisible.filter((h) => h.mes === mesHistActivo),
    [historialVisible, mesHistActivo],
  )

  const mesAnt = mesAnteriorStr()
  const cerrado = mesCerrado(historial, mesAnt)
  const preview = useMemo(() => calcularReporteCierre({
    mes: mesAnt, personas, peticiones, estrellas, recompensas,
  }), [mesAnt, personas, peticiones, estrellas, recompensas])

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="border-b border-neutral-800 pb-4">
          <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">movdi · ops</div>
          <h1 className="text-2xl font-bold tracking-tight">🏆 progreso</h1>
        </header>

        {aviso && <p role="alert" className="border border-movdi-naranja/40 bg-movdi-naranja/10 px-3 py-2 font-mono text-xs text-movdi-naranja">{aviso}</p>}
        {okMsg && <p role="status" data-testid="cierre-ok" className="border border-movdi-verde/40 bg-movdi-verde/10 px-3 py-2 font-mono text-xs text-movdi-verde">{okMsg}</p>}

        {/* Mi progreso del mes */}
        <section data-testid="mi-progreso" className="bg-blueprint rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">mi progreso · {mes}</h2>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold text-movdi-naranja" data-testid="mi-xp">{game.xp} <span className="text-sm text-neutral-400">XP</span></p>
              <p className="mt-1 font-mono text-xs text-neutral-300" data-testid="mi-nivel">nivel {game.nivel} · {game.nivelNombre}</p>
              <p className="mt-0.5 font-mono text-[10px] text-neutral-500">
                base {game.xpBase} · anticipación +{game.bonusAnticipacion} · estrellas +{game.xpEstrellas} · {game.entregadas} entrega(s)
              </p>
            </div>
            <div className="w-full max-w-xs">
              {game.siguienteNivel ? (
                <>
                  <div className="h-2 w-full bg-neutral-800">
                    <div className="h-2 bg-movdi-naranja" style={{ width: `${Math.max(0, Math.min(100, game.progresoNivel))}%` }} />
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-neutral-500">
                    {game.xpParaSiguiente} XP para nivel {game.siguienteNivel.nivel} · {game.siguienteNivel.nombre}
                  </p>
                </>
              ) : <p className="font-mono text-[10px] text-movdi-verde">nivel máximo 🎉</p>}
            </div>
          </div>
        </section>

        {/* Mi ritmo (cumplimiento de mis recurrentes) */}
        <section data-testid="mi-ritmo">
          <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">↻ mi ritmo · últimos 3 meses</h2>
          <div className="mt-3 space-y-2">
            {!cargando && miRitmo.length === 0 && (
              <p className="font-mono text-xs text-neutral-500">no tienes recurrentes asignadas todavía</p>
            )}
            {miRitmo.map(({ recur, cumpli }) => (
              <div key={recur.id} data-testid="ritmo-item" className="flex items-center justify-between card-hover rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5">
                <span className="text-sm">↻ {recur.nombre}</span>
                <span className={`font-mono text-sm ${cumpli.porcentaje >= 80 ? 'text-movdi-verde' : cumpli.porcentaje >= 50 ? 'text-movdi-amarillo' : 'text-movdi-naranja'}`}>
                  {cumpli.entregadas}/{cumpli.total} · {cumpli.porcentaje}%
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Leaderboard + reconocimientos — flag: todo · head: SU equipo · ejecutivo/rh: oculto */}
        {(veTodo || soyHead) && (
          <section data-testid="leaderboard">
            <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">
              🏆 leaderboard del equipo {soyHead ? '(mi equipo)' : ''} · {mes}
            </h2>
            <div className="mt-3 space-y-1.5">
              {lb.ranking.length === 0 && !cargando && (
                <p className="font-mono text-xs text-neutral-500">aún no hay entregas suficientes este mes</p>
              )}
              {lb.ranking.map((r, i) => (
                <div key={r.persona.id} data-testid="lb-item"
                  className={`flex items-center gap-3 border px-3.5 py-2 transition-colors hover:border-neutral-600 ${r.persona.nombre === yo.nombre ? 'border-movdi-naranja/40 bg-movdi-naranja/5' : 'border-neutral-800 bg-neutral-900'}`}>
                  <span className="w-7 text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                  <span className="flex-1 text-sm">{r.persona.nombre} {r.persona.apellido}</span>
                  <span className="font-mono text-[11px] text-neutral-400">{r.aTiempo}/{r.total}</span>
                  <span className={`font-mono text-sm ${r.porcentaje >= 80 ? 'text-movdi-verde' : r.porcentaje >= 50 ? 'text-movdi-amarillo' : 'text-movdi-naranja'}`}>{r.porcentaje}%</span>
                </div>
              ))}
            </div>
            {veTodo && recos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2" data-testid="reconocimientos">
                {recos.map((r) => (
                  <span key={r.tipo} className="border border-neutral-700 px-2.5 py-1 font-mono text-[11px] text-neutral-300">
                    {r.icono} {r.titulo}: <strong className="text-neutral-100">{r.persona}</strong> · {r.valor}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Logros — los bloqueados son sorpresa: "???" con candado (Fase 4.8) */}
        <section data-testid="logros">
          <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">
            logros · {logros.desbloqueados.length}/{logros.desbloqueados.length + logros.bloqueados.length}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {logros.desbloqueados.map((l) => (
              <span key={l.id} data-testid="logro-on" title={l.desc}
                className="border border-movdi-verde/40 bg-movdi-verde/10 px-2.5 py-1 font-mono text-[11px] text-movdi-verde">
                {l.icono} {l.nombre}
              </span>
            ))}
            {logros.bloqueados.map((l) => (
              <span key={l.id} data-testid="logro-off" title="sigue participando para desbloquearlo"
                className="border border-neutral-800 px-2.5 py-1 font-mono text-[11px] text-neutral-600">
                🔒 ???
              </span>
            ))}
          </div>
        </section>

        {/* Mis recompensas ganadas (todas las personas ven las SUYAS) */}
        <section data-testid="mis-recompensas">
          <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">🎁 mis recompensas ganadas</h2>
          <div className="mt-3 space-y-1.5">
            {!cargando && historial.filter((h) => h.persona === yo.nombre && h.recompensa).length === 0 && (
              <p className="font-mono text-xs text-neutral-500">
                aún no ganas recompensas — al cerrar un mes con nivel suficiente, aparecerá aquí la sorpresa 🎁
              </p>
            )}
            {historial.filter((h) => h.persona === yo.nombre && h.recompensa).map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-3 border border-movdi-verde/30 bg-movdi-verde/5 px-3.5 py-2">
                <span className="font-mono text-[11px] text-neutral-400">{h.mes}</span>
                <span className="flex-1 text-sm text-movdi-verde">🎁 {h.recompensa}</span>
                <span className={`font-mono text-[10px] uppercase ${h.recompensaEntregada ? 'text-movdi-verde' : 'text-movdi-amarillo'}`}>
                  {h.recompensaEntregada ? 'entregada ✓' : 'pendiente de entrega'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* RH / dirección: entregar recompensas ganadas */}
        {(soyRH || veTodo) && historial.some((h) => h.recompensa) && (
          <section data-testid="entregas-rh" className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">🎁 entrega de recompensas</h2>
            <p className="mt-1 font-mono text-[10px] text-neutral-500">recompensas ganadas en meses cerrados · márcalas al entregarlas físicamente</p>
            <div className="mt-3 space-y-1.5">
              {historial.filter((h) => h.recompensa).map((h) => (
                <div key={h.id} data-testid="entrega-item" className="flex flex-wrap items-center gap-3 border border-neutral-800 bg-neutral-950 px-3.5 py-2">
                  <span className="font-mono text-[11px] text-neutral-400">{h.mes}</span>
                  <span className="text-sm text-neutral-200">{h.persona}</span>
                  <span className="flex-1 text-sm text-movdi-verde">🎁 {h.recompensa}</span>
                  {h.recompensaEntregada ? (
                    <span className="font-mono text-[10px] uppercase text-movdi-verde">entregada ✓</span>
                  ) : (
                    <button data-testid="btn-marcar-entregada"
                      onClick={async () => {
                        const r = await marcarRecompensaEntregada({ id: h.id })
                        if (!r.ok) setAviso(r.error)
                        await recargar()
                      }}
                      className="border border-movdi-verde/50 px-2.5 py-1 font-mono text-[10px] uppercase text-movdi-verde transition-colors hover:bg-movdi-verde/10">
                      marcar entregada ✓
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Catálogo de recompensas — OCULTO al equipo; solo el flag lo ve (Fase 4.8) */}
        {veTodo && (
          <section data-testid="recompensas">
            <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">🎁 catálogo de recompensas por nivel</h2>
            <p className="mt-1 font-mono text-[10px] text-neutral-500">
              oculto para el equipo — cada quien descubre su recompensa al ganarla
            </p>
            <div className="mt-3 space-y-1.5">
              {recompensas.filter((r) => r.activa).map((r) => (
                <div key={r.id} className="flex items-center gap-3 card-hover rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-2">
                  <span className="font-mono text-[11px] text-movdi-naranja">nivel {r.nivel}</span>
                  <span className="text-sm text-neutral-200">{r.descripcion}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 font-mono text-[10px] text-neutral-500">las recompensas se entregan manualmente por dirección / rh</p>
            {/* Editor del catálogo — decisión 4.8: el lugar de admin lo usa Dani;
                el respaldo real es RLS (escritura solo dirección) */}
            {yo.nombre === 'Dani' && (
              <EditorCatalogo recompensas={recompensas} onGuardado={recargar} onError={setAviso} />
            )}
          </section>
        )}

        {/* Cierre de mes (solo dirección): SIEMPRE visible con su estado —
            pendiente (botón) / ya cerrado (informativo) / sin actividad.
            El cierre opera sobre el MES ANTERIOR (paridad SPA). */}
        {soyDireccion && cerrado && (
          <section data-testid="cierre-hecho" className="rounded-2xl border border-movdi-verde/30 bg-movdi-verde/5 p-5">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-movdi-verde">📋 cierre de mes</h2>
            <p className="mt-2 text-sm text-neutral-300">
              <strong className="text-movdi-verde">{mesAnt} ya está cerrado ✓</strong> ·{' '}
              {historial.filter((h) => h.mes === mesAnt).length} persona(s) archivadas.
              el cierre de <strong>{mes}</strong> estará disponible a partir del 1º del mes siguiente.
            </p>
          </section>
        )}
        {soyDireccion && !cerrado && preview.length === 0 && !cargando && (
          <section data-testid="cierre-sin-actividad" className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">📋 cierre de mes</h2>
            <p className="mt-2 text-sm text-neutral-400">
              no hay entregas registradas en <strong>{mesAnt}</strong> — no hay nada que archivar todavía.
            </p>
          </section>
        )}
        {soyDireccion && !cerrado && preview.length > 0 && (
          <section data-testid="cierre-pendiente" className="rounded-2xl border border-movdi-naranja/30 bg-movdi-naranja/5 p-5">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-movdi-naranja">📋 cierre de mes pendiente</h2>
            <p className="mt-2 text-sm text-neutral-300">
              el mes <strong>{mesAnt}</strong> aún no se cierra. al cerrarlo se archivará el progreso de{' '}
              {preview.length} persona(s) y {preview.filter((r) => r.recompensa).length} calificarán para recompensa.
            </p>
            <div className="mt-3 space-y-1">
              {preview.slice(0, 5).map((r, i) => (
                <p key={r.persona} className="font-mono text-[11px] text-neutral-400">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {r.persona} · nivel {r.nivel} · {r.xp} XP ·{' '}
                  {r.recompensa ? <span className="text-movdi-verde">🎁 {r.recompensa}</span> : 'sin recompensa'}
                </p>
              ))}
            </div>
            <button data-testid="btn-cerrar-mes"
              onClick={async () => {
                if (!confirm(`¿cerrar el mes ${mesAnt}?\n\nse archivará el progreso de ${preview.length} personas. esta acción no se puede deshacer.`)) return
                const r = await cerrarMes()
                if (r.ok) { setOkMsg(`mes ${r.data?.mes} cerrado ✓ · ${r.data?.filas} persona(s) archivadas`); setAviso(null) }
                else { setAviso(r.error); setOkMsg(null) }
                await recargar()
              }}
              className="mt-4 rounded-full bg-movdi-naranja px-4 py-2 text-sm font-medium hover:bg-movdi-naranja/85">
              cerrar {mesAnt} y generar recompensas
            </button>
          </section>
        )}

        {historialVisible.length > 0 && (
          <section data-testid="historial">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">
                📚 meses cerrados {!veTodo && !soyRH && <span className="text-neutral-600">· lo mío</span>}
              </h2>
              {/* navegación por mes (un mes a la vez) + toggle de entradas.
                  Solo presentación: los valores archivados no se tocan. */}
              <div className="flex items-center gap-1.5">
                <button data-testid="hist-mes-anterior" aria-label="mes anterior"
                  disabled={idxMesHist >= mesesHistorial.length - 1}
                  onClick={() => setMesHistSel(mesesHistorial[idxMesHist + 1])}
                  className="rounded-full border border-neutral-700 px-2.5 py-1 font-mono text-xs text-neutral-300 transition-colors hover:border-neutral-500 disabled:opacity-30">
                  ←
                </button>
                <span data-testid="hist-mes-actual" className="min-w-[5.5rem] text-center font-mono text-xs text-movdi-azul">
                  {mesHistActivo ?? '—'}
                </span>
                <button data-testid="hist-mes-siguiente" aria-label="mes siguiente"
                  disabled={idxMesHist <= 0}
                  onClick={() => setMesHistSel(mesesHistorial[idxMesHist - 1])}
                  className="rounded-full border border-neutral-700 px-2.5 py-1 font-mono text-xs text-neutral-300 transition-colors hover:border-neutral-500 disabled:opacity-30">
                  →
                </button>
                <button data-testid="hist-toggle" onClick={() => setOcultarHistorial((v) => !v)}
                  className="ml-2 rounded-full border border-neutral-700 px-2.5 py-1 font-mono text-[11px] text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200">
                  {ocultarHistorial ? `👁 mostrar (${filasMesHist.length})` : '🙈 ocultar entradas'}
                </button>
              </div>
            </div>
            {!ocultarHistorial && (
              <div className="mt-3 space-y-1.5">
                {filasMesHist.map((h) => (
                  <div key={h.id} data-testid="historial-item" className="flex flex-wrap items-center gap-3 card-hover rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-2 font-mono text-[11px] text-neutral-400">
                    <span className="text-neutral-200">{h.mes}</span>
                    <span className="flex-1">{h.persona}</span>
                    <span>{h.xpTotal} XP · nivel {h.nivelAlcanzado}</span>
                    <span>{h.entregadas} entregas · {h.cumplimiento}%</span>
                    {h.recompensa && <span className="text-movdi-verde">🎁 {h.recompensa}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}

// ============================================================
// Editor del catálogo de recompensas (decisión 4.8: solo Dani lo ve;
// la RLS recomp_write = mi_es_direccion() respalda cada escritura).
function EditorCatalogo({ recompensas, onGuardado, onError }: {
  recompensas: Recompensa[]
  onGuardado: () => Promise<void>
  onError: (e: string) => void
}) {
  const inicial = recompensas.find((r) => r.nivel === 2)
  const [nivel, setNivel] = useState(2)
  const actual = recompensas.find((r) => r.nivel === nivel)
  const [desc, setDesc] = useState(inicial?.descripcion ?? '')
  const [activa, setActiva] = useState(inicial?.activa ?? true)
  const [guardando, setGuardando] = useState(false)

  // sincronizar el formulario SOLO cuando el admin cambia de nivel (sin
  // effect: un effect re-sincronizaría también tras recargar y pisaría lo
  // que se esté tecleando)
  function elegirNivel(n: number) {
    setNivel(n)
    const r = recompensas.find((x) => x.nivel === n)
    setDesc(r?.descripcion ?? '')
    setActiva(r?.activa ?? true)
  }

  return (
    <div data-testid="editor-catalogo" className="mt-4 border border-movdi-naranja/30 bg-movdi-naranja/5 p-4">
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-movdi-naranja">✏️ editar catálogo (admin)</h3>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-neutral-400" htmlFor="cat-nivel">nivel</label>
          <select id="cat-nivel" value={nivel} onChange={(e) => elegirNivel(Number(e.target.value))}
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-movdi-naranja">
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>nivel {n}</option>)}
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-neutral-400" htmlFor="cat-desc">recompensa</label>
          <input id="cat-desc" value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder={actual ? undefined : '— este nivel no tiene recompensa aún —'}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-movdi-naranja" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 font-mono text-[11px] text-neutral-300">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} /> activa
        </label>
        <button data-testid="btn-guardar-recompensa" disabled={guardando}
          onClick={async () => {
            setGuardando(true)
            const r = await guardarRecompensa({ nivel, descripcion: desc, activa })
            setGuardando(false)
            if (!r.ok) { onError(r.error); return }
            await onGuardado()
          }}
          className="rounded-full bg-movdi-naranja px-4 py-2 text-xs font-medium transition-colors hover:bg-movdi-naranja/85 disabled:opacity-50">
          {guardando ? 'guardando…' : 'guardar'}
        </button>
      </div>
    </div>
  )
}
