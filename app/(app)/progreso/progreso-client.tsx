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
import { cerrarMes } from './actions'

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
    soloEquipo: yo.nivel === 'head' && !soyDireccion ? yo.nombre : undefined,
  }), [mes, personas, peticiones, yo, soyDireccion])
  const recos = useMemo(() => calcularReconocimientosMes({ mes, personas, peticiones }), [mes, personas, peticiones])

  // mi ritmo: cumplimiento de MIS recurrentes activas (paridad renderMiRitmo)
  const miRitmo = useMemo(() =>
    recurrentes
      .filter((r) => r.activa && matchNombre(r.para, yo.nombre))
      .map((r) => ({ recur: r, cumpli: calcularCumplimiento(r, peticiones, 12) })),
    [recurrentes, peticiones, yo])

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
          <h1 className="text-xl font-semibold">🏆 progreso</h1>
        </header>

        {aviso && <p role="alert" className="border border-orange-600/40 bg-orange-600/10 px-3 py-2 font-mono text-xs text-orange-500">{aviso}</p>}
        {okMsg && <p role="status" data-testid="cierre-ok" className="border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-mono text-xs text-emerald-400">{okMsg}</p>}

        {/* Mi progreso del mes */}
        <section data-testid="mi-progreso" className="border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">mi progreso · {mes}</h2>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold text-orange-500" data-testid="mi-xp">{game.xp} <span className="text-sm text-neutral-400">XP</span></p>
              <p className="mt-1 font-mono text-xs text-neutral-300" data-testid="mi-nivel">nivel {game.nivel} · {game.nivelNombre}</p>
              <p className="mt-0.5 font-mono text-[10px] text-neutral-500">
                base {game.xpBase} · anticipación +{game.bonusAnticipacion} · estrellas +{game.xpEstrellas} · {game.entregadas} entrega(s)
              </p>
            </div>
            <div className="w-full max-w-xs">
              {game.siguienteNivel ? (
                <>
                  <div className="h-2 w-full bg-neutral-800">
                    <div className="h-2 bg-orange-600" style={{ width: `${Math.max(0, Math.min(100, game.progresoNivel))}%` }} />
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-neutral-500">
                    {game.xpParaSiguiente} XP para nivel {game.siguienteNivel.nivel} · {game.siguienteNivel.nombre}
                  </p>
                </>
              ) : <p className="font-mono text-[10px] text-emerald-400">nivel máximo 🎉</p>}
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
              <div key={recur.id} data-testid="ritmo-item" className="flex items-center justify-between border border-neutral-800 bg-neutral-900 px-4 py-2.5">
                <span className="text-sm">↻ {recur.nombre}</span>
                <span className={`font-mono text-sm ${cumpli.porcentaje >= 80 ? 'text-emerald-400' : cumpli.porcentaje >= 50 ? 'text-amber-400' : 'text-orange-500'}`}>
                  {cumpli.entregadas}/{cumpli.total} · {cumpli.porcentaje}%
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Leaderboard + reconocimientos */}
        <section data-testid="leaderboard">
          <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">
            🏆 leaderboard del equipo {yo.nivel === 'head' && !soyDireccion ? '(mi equipo)' : ''} · {mes}
          </h2>
          <div className="mt-3 space-y-1.5">
            {lb.ranking.length === 0 && !cargando && (
              <p className="font-mono text-xs text-neutral-500">aún no hay entregas suficientes este mes</p>
            )}
            {lb.ranking.map((r, i) => (
              <div key={r.persona.id} data-testid="lb-item"
                className={`flex items-center gap-3 border px-3.5 py-2 ${r.persona.nombre === yo.nombre ? 'border-orange-600/40 bg-orange-600/5' : 'border-neutral-800 bg-neutral-900'}`}>
                <span className="w-7 text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                <span className="flex-1 text-sm">{r.persona.nombre} {r.persona.apellido}</span>
                <span className="font-mono text-[11px] text-neutral-400">{r.aTiempo}/{r.total}</span>
                <span className={`font-mono text-sm ${r.porcentaje >= 80 ? 'text-emerald-400' : r.porcentaje >= 50 ? 'text-amber-400' : 'text-orange-500'}`}>{r.porcentaje}%</span>
              </div>
            ))}
          </div>
          {recos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2" data-testid="reconocimientos">
              {recos.map((r) => (
                <span key={r.tipo} className="border border-neutral-700 px-2.5 py-1 font-mono text-[11px] text-neutral-300">
                  {r.icono} {r.titulo}: <strong className="text-neutral-100">{r.persona}</strong> · {r.valor}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Logros */}
        <section data-testid="logros">
          <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">
            logros · {logros.desbloqueados.length}/{logros.desbloqueados.length + logros.bloqueados.length}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {logros.desbloqueados.map((l) => (
              <span key={l.id} data-testid="logro-on" title={l.desc}
                className="border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300">
                {l.icono} {l.nombre}
              </span>
            ))}
            {logros.bloqueados.map((l) => (
              <span key={l.id} title={l.desc}
                className="border border-neutral-800 px-2.5 py-1 font-mono text-[11px] text-neutral-600">
                {l.icono} {l.nombre}
              </span>
            ))}
          </div>
        </section>

        {/* Recompensas (catálogo; se entregan manualmente por dirección/rh) */}
        <section data-testid="recompensas">
          <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">🎁 recompensas por nivel</h2>
          <div className="mt-3 space-y-1.5">
            {recompensas.filter((r) => r.activa).map((r) => (
              <div key={r.id} className="flex items-center gap-3 border border-neutral-800 bg-neutral-900 px-3.5 py-2">
                <span className="font-mono text-[11px] text-orange-500">nivel {r.nivel}</span>
                <span className="text-sm text-neutral-200">{r.descripcion}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px] text-neutral-500">las recompensas se entregan manualmente por dirección / rh</p>
        </section>

        {/* Cierre de mes (solo dirección) + historial */}
        {soyDireccion && !cerrado && preview.length > 0 && (
          <section data-testid="cierre-pendiente" className="border border-orange-600/30 bg-orange-600/5 p-5">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-orange-500">📋 cierre de mes pendiente</h2>
            <p className="mt-2 text-sm text-neutral-300">
              el mes <strong>{mesAnt}</strong> aún no se cierra. al cerrarlo se archivará el progreso de{' '}
              {preview.length} persona(s) y {preview.filter((r) => r.recompensa).length} calificarán para recompensa.
            </p>
            <div className="mt-3 space-y-1">
              {preview.slice(0, 5).map((r, i) => (
                <p key={r.persona} className="font-mono text-[11px] text-neutral-400">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {r.persona} · nivel {r.nivel} · {r.xp} XP ·{' '}
                  {r.recompensa ? <span className="text-emerald-400">🎁 {r.recompensa}</span> : 'sin recompensa'}
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
              className="mt-4 bg-orange-600 px-4 py-2 text-sm font-medium hover:bg-orange-500">
              cerrar {mesAnt} y generar recompensas
            </button>
          </section>
        )}

        {historial.length > 0 && (
          <section data-testid="historial">
            <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">📚 meses cerrados</h2>
            <div className="mt-3 space-y-1.5">
              {historial.map((h) => (
                <div key={h.id} data-testid="historial-item" className="flex flex-wrap items-center gap-3 border border-neutral-800 bg-neutral-900 px-3.5 py-2 font-mono text-[11px] text-neutral-400">
                  <span className="text-neutral-200">{h.mes}</span>
                  <span className="flex-1">{h.persona}</span>
                  <span>{h.xpTotal} XP · nivel {h.nivelAlcanzado}</span>
                  <span>{h.entregadas} entregas · {h.cumplimiento}%</span>
                  {h.recompensa && <span className="text-emerald-400">🎁 {h.recompensa}</span>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
