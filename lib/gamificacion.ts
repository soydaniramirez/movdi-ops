// Gamificación — puerto EXACTO de las fórmulas del index.html (XP, niveles,
// rachas, stats, leaderboard, reconocimientos, cierre de mes, cumplimiento,
// logros). No se inventó ninguna fórmula; los quirks del SPA se conservan y
// están señalados.

import { type Peticion, type Persona, matchNombre } from './peticiones'
import { type Recurrente, calcularFechasEsperadas } from './recurrentes'
import { type Estrella } from './estrellas'

// ---------- niveles ----------
export const NIVELES = [
  { nivel: 1, xpMin: 0, nombre: 'en arranque' },
  { nivel: 2, xpMin: 80, nombre: 'constante' },
  { nivel: 3, xpMin: 200, nombre: 'confiable' },
  { nivel: 4, xpMin: 400, nombre: 'referente' },
  { nivel: 5, xpMin: 700, nombre: 'élite MOVDI' },
] as const

export function nivelDesdeXP(xp: number) {
  let resultado: (typeof NIVELES)[number] = NIVELES[0]
  for (const n of NIVELES) if (xp >= n.xpMin) resultado = n
  return resultado
}

// ---------- puntualidad ----------
// Límite contra el que se mide: la fecha vigente, salvo extensión NO
// justificada (se mide contra la original).
export function fechaLimiteParaPuntualidad(t: Peticion): string | null {
  if (!t) return null
  if (t.extensionJustificada === false && t.fechaOriginal) return t.fechaOriginal
  return t.fecha
}

export function estadoPuntualidad(t: Peticion): 'a_tiempo' | 'tarde' | 'sin_dato' | null {
  if (!t || t.estatus !== 'entregado') return null
  if (!t.fechaEntrega) return 'sin_dato' // entregas viejas no cuentan
  const limite = fechaLimiteParaPuntualidad(t)!
  return t.fechaEntrega <= limite ? 'a_tiempo' : 'tarde'
}

export function diasRetraso(t: Peticion): number | null {
  if (!t || !t.fechaEntrega) return null
  const limite = fechaLimiteParaPuntualidad(t)
  if (!limite) return null
  return Math.round((new Date(t.fechaEntrega).getTime() - new Date(limite).getTime()) / 86400000)
}

// ---------- rachas ----------
export function calcularRachaActual(nombre: string, peticiones: Peticion[]): number {
  const lista = peticiones
    .filter((t) => matchNombre(t.para, nombre) && t.estatus !== 'archivada')
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
  let racha = 0
  for (const t of lista) {
    if (t.estatus === 'entregado') racha++
    else break
  }
  return racha
}

export function calcularMejorRacha(nombre: string, peticiones: Peticion[]): number {
  const lista = peticiones
    .filter((t) => matchNombre(t.para, nombre) && t.estatus !== 'archivada')
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  let mejor = 0
  let actual = 0
  for (const t of lista) {
    if (t.estatus === 'entregado') { actual++; if (actual > mejor) mejor = actual }
    else actual = 0
  }
  return mejor
}

// ---------- XP ----------
export const mesActualStr = () => new Date().toISOString().slice(0, 7)
export const finDeMes = (mes: string) => {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m, 0).toISOString().slice(0, 10)
}
export const mesAnteriorStr = () => {
  const hoy = new Date()
  return new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().slice(0, 7)
}

// XP = +10 por entrega del mes, +3 si se entregó 3+ días antes del límite,
// +15 por estrella recibida en el mes.
export function calcularXPMes(nombre: string, mes: string, peticiones: Peticion[], estrellas: Estrella[]) {
  const desde = mes + '-01'
  const hasta = finDeMes(mes)
  const entregadas = peticiones.filter(
    (t) => matchNombre(t.para, nombre) && t.estatus === 'entregado' && t.fecha >= desde && t.fecha <= hasta,
  )
  let xp = 0
  let bonusAnticipacion = 0
  for (const t of entregadas) {
    xp += 10
    const dr = diasRetraso(t)
    if (dr !== null && dr <= -3) bonusAnticipacion += 3
  }
  const xpEstrellas = estrellas
    .filter((e) => e.para === nombre && (e.creadaEn || '').slice(0, 7) === mes).length * 15
  return { xpTotal: xp + bonusAnticipacion + xpEstrellas, xpBase: xp, bonusAnticipacion, xpEstrellas, entregadas: entregadas.length }
}

export function calcularGamePersona(nombre: string, mes: string, peticiones: Peticion[], estrellas: Estrella[]) {
  const xpData = calcularXPMes(nombre, mes, peticiones, estrellas)
  const nivelData = nivelDesdeXP(xpData.xpTotal)
  const idx = NIVELES.findIndex((n) => n.nivel === nivelData.nivel)
  const siguienteNivel = idx < NIVELES.length - 1 ? NIVELES[idx + 1] : null
  const xpParaSiguiente = siguienteNivel ? siguienteNivel.xpMin - xpData.xpTotal : 0
  const progresoNivel = siguienteNivel
    ? Math.round(((xpData.xpTotal - nivelData.xpMin) / (siguienteNivel.xpMin - nivelData.xpMin)) * 100)
    : 100
  return {
    nombre, mes,
    xp: xpData.xpTotal, xpBase: xpData.xpBase,
    bonusAnticipacion: xpData.bonusAnticipacion, xpEstrellas: xpData.xpEstrellas,
    nivel: nivelData.nivel, nivelNombre: nivelData.nombre,
    siguienteNivel, xpParaSiguiente, progresoNivel,
    entregadas: xpData.entregadas,
  }
}

// ---------- quién compite ----------
// ceo y rh no compiten; Salvador y Arylene tampoco (naturaleza distinta).
export function competeEnLeaderboard(p: Persona | null): boolean {
  if (!p) return false
  if (p.activo === false) return false
  if (p.nivel === 'ceo') return false
  if (p.nivel === 'rh') return false
  if (p.nombre === 'Salvador' || p.nombre === 'Arylene') return false
  return true
}

// ---------- stats de periodo ----------
// Quirks del SPA conservados a propósito:
// · aTiempo = todas las entregadas (heurística: sin dato ⇒ a tiempo), tarde = 0
// · pendientesVencidas NO se filtran por el rango (el if(opts.desde) del SPA
//   está vacío) — las vencidas actuales pesan en el % de cualquier periodo.
export function calcularStatsPersona(
  nombre: string,
  peticiones: Peticion[],
  opts: { desde?: string; hasta?: string } = {},
  hoy?: string,
) {
  let entregadas = peticiones.filter(
    (t) => matchNombre(t.para, nombre) && t.estatus === 'entregado',
  )
  if (opts.desde) entregadas = entregadas.filter((t) => t.fecha >= opts.desde!)
  if (opts.hasta) entregadas = entregadas.filter((t) => t.fecha <= opts.hasta!)

  const aTiempo = entregadas.length
  const tarde = 0
  const h = hoy ?? new Date(new Date().toDateString()).toISOString().slice(0, 10)
  const pendientesVencidas = peticiones.filter(
    (t) => matchNombre(t.para, nombre) && t.estatus !== 'entregado' && t.estatus !== 'archivada' && t.fecha < h,
  )
  const total = entregadas.length + pendientesVencidas.length
  const porcentaje = total === 0 ? 0 : Math.round((aTiempo / total) * 100)
  return { nombre, entregadas: entregadas.length, aTiempo, tarde, pendientesVencidas: pendientesVencidas.length, total, porcentaje }
}

// ---------- leaderboard y reconocimientos ----------
export function calcularLeaderboardMes(opts: {
  mes?: string
  soloEquipo?: string
  personas: Persona[]
  peticiones: Peticion[]
  hoy?: string
}) {
  const mes = opts.mes || mesActualStr()
  const desde = mes + '-01'
  const hasta = finDeMes(mes)
  let candidatos = opts.personas.filter(competeEnLeaderboard)
  if (opts.soloEquipo) {
    candidatos = candidatos.filter((p) => {
      const pm = p as Persona & { managerPrincipal?: string | null; managers?: string[] }
      return pm.managerPrincipal === opts.soloEquipo || (pm.managers || []).includes(opts.soloEquipo!)
    })
  }
  const ranking = candidatos
    .map((p) => ({ ...calcularStatsPersona(p.nombre, opts.peticiones, { desde, hasta }, opts.hoy), persona: p }))
    .filter((r) => r.total > 0)
  ranking.sort((a, b) => (b.porcentaje !== a.porcentaje ? b.porcentaje - a.porcentaje : b.entregadas - a.entregadas))
  return { mes, desde, hasta, ranking }
}

export function calcularReconocimientosMes(opts: {
  mes?: string
  personas: Persona[]
  peticiones: Peticion[]
  hoy?: string
}) {
  const m = opts.mes || mesActualStr()
  const desde = m + '-01'
  const hasta = finDeMes(m)
  const stats = opts.personas
    .filter(competeEnLeaderboard)
    .map((p) => ({
      persona: p,
      stats: calcularStatsPersona(p.nombre, opts.peticiones, { desde, hasta }, opts.hoy),
      rachaActual: calcularRachaActual(p.nombre, opts.peticiones),
    }))
    .filter((s) => s.stats.total > 0)
  if (!stats.length) return []
  const recos: { tipo: string; icono: string; titulo: string; persona: string; valor: string }[] = []
  const masEntregas = [...stats].sort((a, b) => b.stats.entregadas - a.stats.entregadas)[0]
  if (masEntregas && masEntregas.stats.entregadas >= 5) {
    recos.push({ tipo: 'volumen', icono: '⚡', titulo: 'más entregas del mes', persona: masEntregas.persona.nombre, valor: `${masEntregas.stats.entregadas} peticiones` })
  }
  const sinReabrir = stats.filter((s) => s.stats.entregadas >= 5).sort((a, b) => b.stats.entregadas - a.stats.entregadas)[0]
  if (sinReabrir) {
    recos.push({ tipo: 'calidad', icono: '🎯', titulo: 'sin reabrir', persona: sinReabrir.persona.nombre, valor: '100% sin reabrir' })
  }
  const mejorRacha = [...stats].sort((a, b) => b.rachaActual - a.rachaActual)[0]
  if (mejorRacha && mejorRacha.rachaActual >= 5) {
    recos.push({ tipo: 'racha', icono: '🔥', titulo: 'racha más larga', persona: mejorRacha.persona.nombre, valor: `${mejorRacha.rachaActual} entregas seguidas` })
  }
  return recos
}

// ---------- recompensas e historial ----------
export type Recompensa = { id: string; nivel: number; descripcion: string; activa: boolean }
export type HistorialMes = {
  id: string; persona: string; mes: string; xpTotal: number; nivelAlcanzado: number
  entregadas: number; cumplimiento: number; mejorRacha: number; recompensa: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const mapRecompensaRow = (r: any): Recompensa => ({
  id: r.id, nivel: r.nivel, descripcion: r.descripcion, activa: r.activa !== false,
})
export const mapHistorialRow = (r: any): HistorialMes => ({
  id: r.id, persona: r.persona, mes: r.mes, xpTotal: r.xp_total ?? 0,
  nivelAlcanzado: r.nivel_alcanzado ?? 1, entregadas: r.entregadas ?? 0,
  cumplimiento: r.cumplimiento ?? 0, mejorRacha: r.mejor_racha ?? 0,
  recompensa: r.recompensa ?? null,
})
/* eslint-enable @typescript-eslint/no-explicit-any */

export function recompensaParaNivel(recompensas: Recompensa[], nivel: number): string | null {
  const r = recompensas.find((x) => x.nivel === nivel && x.activa)
  return r ? r.descripcion : null
}

export const mesCerrado = (historial: HistorialMes[], mes: string) => historial.some((h) => h.mes === mes)

// Reporte de cierre (paridad calcularReporteCierre): solo quienes compiten
// y entregaron algo ese mes, ordenado por XP desc.
export function calcularReporteCierre(opts: {
  mes: string
  personas: Persona[]
  peticiones: Peticion[]
  estrellas: Estrella[]
  recompensas: Recompensa[]
  hoy?: string
}) {
  const { mes } = opts
  const desde = mes + '-01'
  const hasta = finDeMes(mes)
  return opts.personas
    .filter(competeEnLeaderboard)
    .map((p) => {
      const game = calcularGamePersona(p.nombre, mes, opts.peticiones, opts.estrellas)
      const stats = calcularStatsPersona(p.nombre, opts.peticiones, { desde, hasta }, opts.hoy)
      return {
        persona: p.nombre,
        apellido: p.apellido,
        xp: game.xp,
        nivel: game.nivel,
        nivelNombre: game.nivelNombre,
        entregadas: stats.entregadas,
        cumplimiento: stats.porcentaje,
        mejorRacha: calcularMejorRacha(p.nombre, opts.peticiones),
        recompensa: recompensaParaNivel(opts.recompensas, game.nivel),
      }
    })
    .filter((f) => f.entregadas > 0)
    .sort((a, b) => b.xp - a.xp)
}

// ---------- cumplimiento de recurrentes ----------
// Paridad exacta: el conteo empieza en la PRIMERA entrega real (o, si no hay,
// solo fechas con instancia registrada); archivadas ni se muestran ni cuentan.
export function calcularCumplimiento(
  recur: Recurrente,
  peticiones: Peticion[],
  semanasAtras = 12,
  hoy?: string,
) {
  const h = hoy ?? new Date(new Date().toDateString()).toISOString().slice(0, 10)
  const fechas = calcularFechasEsperadas(recur, h, semanasAtras)
  const instancias = peticiones.filter((p) => p.origenRecur === recur.id)

  const entregadasInst = instancias.filter((i) => i.estatus === 'entregado')
  let fechaInicio: string | null = null
  if (entregadasInst.length > 0) {
    fechaInicio = entregadasInst.reduce((min, i) => (i.fecha < min ? i.fecha : min), entregadasInst[0].fecha)
  }

  const fechasRelevantes = fechaInicio
    ? fechas.filter((f) => f >= fechaInicio! && f < h)
    : fechas.filter((f) => f < h && instancias.some((i) => i.fecha === f))

  let entregadas = 0
  const tarde = 0
  const detalle: { fecha: string; estado: 'entregada' | 'pendiente' | 'no_registrada'; tarde: boolean }[] = []
  for (const fecha of fechasRelevantes) {
    const inst = instancias.find((i) => i.fecha === fecha)
    if (inst && inst.estatus === 'archivada') continue
    if (inst && inst.estatus === 'entregado') { entregadas++; detalle.push({ fecha, estado: 'entregada', tarde: false }) }
    else if (inst) detalle.push({ fecha, estado: 'pendiente', tarde: true })
    else detalle.push({ fecha, estado: 'no_registrada', tarde: false })
  }
  const total = detalle.length
  const porcentaje = total === 0 ? 0 : Math.round((entregadas / total) * 100)
  return { total, entregadas, tarde, porcentaje, detalle: detalle.sort((a, b) => b.fecha.localeCompare(a.fecha)) }
}

// ---------- logros ----------
export type StatsLogros = {
  entregadasTotales: number
  mejorRacha: number
  rachaActual: number
  areasUnicas: number
  reabiertas: number
  mesPerfecto: boolean
  estrellasRecibidasTotal: number
  estrellasRecibidasMes: number
  estrellasDadasTotal: number
  mesesNivel3: number
  entregasAnticipadas: number
  mesPuntual: boolean
}

export const LOGROS: { id: string; nombre: string; icono: string; categoria: string; desc: string; criterio: (s: StatsLogros) => boolean }[] = [
  { id: 'volumen_1', nombre: 'primera entrega', icono: '🌱', categoria: 'volumen', criterio: (s) => s.entregadasTotales >= 1, desc: 'tu primera entrega completada' },
  { id: 'volumen_10', nombre: '10 entregas', icono: '🌿', categoria: 'volumen', criterio: (s) => s.entregadasTotales >= 10, desc: '10 peticiones entregadas' },
  { id: 'volumen_25', nombre: '25 entregas', icono: '🌳', categoria: 'volumen', criterio: (s) => s.entregadasTotales >= 25, desc: '25 peticiones entregadas' },
  { id: 'volumen_50', nombre: '50 entregas', icono: '🏔️', categoria: 'volumen', criterio: (s) => s.entregadasTotales >= 50, desc: '50 peticiones entregadas' },
  { id: 'volumen_100', nombre: 'centenario', icono: '⭐', categoria: 'volumen', criterio: (s) => s.entregadasTotales >= 100, desc: '100 peticiones entregadas' },
  { id: 'volumen_200', nombre: '200 entregas', icono: '🥇', categoria: 'volumen', criterio: (s) => s.entregadasTotales >= 200, desc: '200 peticiones entregadas' },
  { id: 'racha_5', nombre: 'racha de 5', icono: '🔥', categoria: 'racha', criterio: (s) => s.mejorRacha >= 5, desc: '5 entregas seguidas sin retraso' },
  { id: 'racha_10', nombre: 'racha de 10', icono: '🔥🔥', categoria: 'racha', criterio: (s) => s.mejorRacha >= 10, desc: '10 entregas seguidas sin retraso' },
  { id: 'racha_20', nombre: 'racha de 20', icono: '🔥🔥🔥', categoria: 'racha', criterio: (s) => s.mejorRacha >= 20, desc: '20 entregas seguidas sin retraso' },
  { id: 'racha_30', nombre: 'racha de 30', icono: '👑', categoria: 'racha', criterio: (s) => s.mejorRacha >= 30, desc: '30 entregas seguidas sin retraso' },
  { id: 'sin_reabrir_10', nombre: 'sin reabrir', icono: '💎', categoria: 'calidad', criterio: (s) => s.entregadasTotales >= 10 && s.reabiertas === 0, desc: '10+ entregas sin que ninguna se reabra' },
  { id: 'anticipado_5', nombre: 'anticipado', icono: '⚡', categoria: 'velocidad', criterio: (s) => s.entregasAnticipadas >= 5, desc: '5 entregas hechas 3+ días antes de la fecha límite' },
  { id: 'anticipado_15', nombre: 'adelantado crónico', icono: '🏎️', categoria: 'velocidad', criterio: (s) => s.entregasAnticipadas >= 15, desc: '15 entregas anticipadas' },
  { id: 'mes_puntual', nombre: 'mes puntual', icono: '🎯', categoria: 'velocidad', criterio: (s) => s.mesPuntual, desc: 'un mes con 100% de entregas a tiempo (mín. 5)' },
  { id: 'estrella_1', nombre: 'primera estrella', icono: '✨', categoria: 'colaboracion', criterio: (s) => s.estrellasRecibidasTotal >= 1, desc: 'recibiste tu primera estrella de un compañero' },
  { id: 'querido_equipo', nombre: 'querido del equipo', icono: '❤️', categoria: 'colaboracion', criterio: (s) => s.estrellasRecibidasMes >= 5, desc: 'recibiste 5 estrellas en un mismo mes' },
  { id: 'el_que_apoya', nombre: 'el que apoya', icono: '🤝', categoria: 'colaboracion', criterio: (s) => s.estrellasDadasTotal >= 10, desc: 'diste 10 estrellas a compañeros' },
  { id: 'variedad_5', nombre: 'variedad', icono: '🌍', categoria: 'especial', criterio: (s) => s.areasUnicas >= 3, desc: 'entregas en 3+ áreas distintas' },
  { id: 'todologo', nombre: 'todólogo', icono: '🗂️', categoria: 'especial', criterio: (s) => s.areasUnicas >= 5, desc: 'entregas en 5+ áreas distintas' },
  { id: 'mes_perfecto', nombre: 'mes perfecto', icono: '🏆', categoria: 'especial', criterio: (s) => s.mesPerfecto, desc: 'un mes completo sin tareas vencidas' },
  { id: 'constancia', nombre: 'constancia', icono: '🏛️', categoria: 'especial', criterio: (s) => s.mesesNivel3 >= 2, desc: 'nivel 3 o más en 2 meses cerrados' },
]

// Puerto exacto de calcularLogros (stats + evaluación de criterios).
export function calcularLogros(opts: {
  nombre: string
  peticiones: Peticion[]
  estrellas: Estrella[]
  historial: HistorialMes[]
  hoy?: Date
}) {
  const { nombre } = opts
  const hoy = opts.hoy ?? new Date()
  const todasEntregadas = opts.peticiones.filter(
    (t) => matchNombre(t.para, nombre) && t.estatus === 'entregado',
  )
  const areasUnicas = new Set(todasEntregadas.map((t) => t.area)).size
  const reabiertas = 0 // sin histórico de cambios de estatus (paridad)

  const mesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const inicioMesAnt = mesAnt.toISOString().slice(0, 10)
  const finMesAnt = new Date(hoy.getFullYear(), hoy.getMonth(), 0).toISOString().slice(0, 10)

  const peticionesDelMesAnt = opts.peticiones.filter(
    (t) => matchNombre(t.para, nombre) && t.estatus !== 'archivada' && t.fecha >= inicioMesAnt && t.fecha <= finMesAnt,
  )
  const vencidasDelMesAnt = peticionesDelMesAnt.filter((t) => t.estatus !== 'entregado')
  const mesPerfecto = peticionesDelMesAnt.length >= 3 && vencidasDelMesAnt.length === 0

  const mesActual = hoy.toISOString().slice(0, 7)
  const estrellasRecibidasTotal = opts.estrellas.filter((e) => e.para === nombre).length
  const estrellasRecibidasMes = opts.estrellas.filter((e) => e.para === nombre && (e.creadaEn || '').slice(0, 7) === mesActual).length
  const estrellasDadasTotal = opts.estrellas.filter((e) => e.de === nombre).length
  const mesesNivel3 = opts.historial.filter((h) => h.persona === nombre && h.nivelAlcanzado >= 3).length
  const entregasAnticipadas = todasEntregadas.filter((t) => { const dr = diasRetraso(t); return dr !== null && dr <= -3 }).length

  const entregadasMesAnt = todasEntregadas.filter((t) => t.fecha >= inicioMesAnt && t.fecha <= finMesAnt)
  const conDato = entregadasMesAnt.filter((t) => estadoPuntualidad(t) !== 'sin_dato')
  const tardeMesAnt = conDato.filter((t) => estadoPuntualidad(t) === 'tarde').length
  const mesPuntual = conDato.length >= 5 && tardeMesAnt === 0

  const stats: StatsLogros = {
    entregadasTotales: todasEntregadas.length,
    mejorRacha: calcularMejorRacha(nombre, opts.peticiones),
    rachaActual: calcularRachaActual(nombre, opts.peticiones),
    areasUnicas, reabiertas, mesPerfecto,
    estrellasRecibidasTotal, estrellasRecibidasMes, estrellasDadasTotal,
    mesesNivel3, entregasAnticipadas, mesPuntual,
  }
  const desbloqueados = LOGROS.filter((l) => { try { return l.criterio(stats) } catch { return false } })
  const bloqueados = LOGROS.filter((l) => !desbloqueados.some((d) => d.id === l.id))
  return { desbloqueados, bloqueados, stats }
}
