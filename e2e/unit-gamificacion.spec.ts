import { test, expect } from '@playwright/test'
import { type Peticion, type Persona } from '../lib/peticiones'
import { type Recurrente } from '../lib/recurrentes'
import { type Estrella } from '../lib/estrellas'
import {
  LOGROS, type StatsLogros,
  calcularCumplimiento, calcularGamePersona, calcularLeaderboardMes, calcularLogros,
  calcularMejorRacha, calcularRachaActual, calcularReporteCierre, calcularStatsPersona,
  calcularXPMes, competeEnLeaderboard, estadoPuntualidad, nivelDesdeXP,
} from '../lib/gamificacion'

// Tests unitarios puros con fechas fijas — las fórmulas EXACTAS del SPA.

const pet = (o: Partial<Peticion>): Peticion => ({
  id: Math.random().toString(36).slice(2), zona: 'general', nombre: 'x', descripcion: null,
  creadoPor: 'Dani', para: 'Antonio', area: 'pm', fecha: '2026-06-10', prioridad: 'media',
  estatus: 'pendiente', privada: false, origenRecur: null, grupoId: null, fechaOriginal: null,
  motivoCambioFecha: null, cambioVistoPorCreador: true, extensionJustificada: null,
  linkEntrega: null, notaEntrega: null, fechaEntrega: null, ocultaPara: [], creadaEn: null, ...o,
})
const per = (o: Partial<Persona>): Persona => ({
  id: Math.random().toString(36).slice(2), nombre: 'Antonio', apellido: 'L', rol: 'pm',
  nivel: 'ejecutivo', areas: ['pm'], email: null, activo: true, pausadaHasta: null, esDireccion: false,
  veGamificacionCompleta: false, ...o,
})
const est = (o: Partial<Estrella>): Estrella => ({
  id: Math.random().toString(36).slice(2), de: 'Brenda', para: 'Antonio', motivo: 'x',
  semana: '2026-W24', creadaEn: '2026-06-10T12:00:00Z', ...o,
})

test('niveles: umbrales exactos 0/80/200/400/700', () => {
  expect(nivelDesdeXP(0).nivel).toBe(1)
  expect(nivelDesdeXP(79).nivel).toBe(1)
  expect(nivelDesdeXP(80)).toMatchObject({ nivel: 2, nombre: 'constante' })
  expect(nivelDesdeXP(199).nivel).toBe(2)
  expect(nivelDesdeXP(200)).toMatchObject({ nivel: 3, nombre: 'confiable' })
  expect(nivelDesdeXP(400).nivel).toBe(4)
  expect(nivelDesdeXP(700)).toMatchObject({ nivel: 5, nombre: 'élite MOVDI' })
})

test('XP del mes: +10 por entrega, +3 anticipación (3+ días), +15 por estrella', () => {
  const peticiones = [
    pet({ estatus: 'entregado', fecha: '2026-06-10', fechaEntrega: '2026-06-07' }), // -3d → bonus
    pet({ estatus: 'entregado', fecha: '2026-06-15', fechaEntrega: '2026-06-14' }), // -1d → sin bonus
    pet({ estatus: 'entregado', fecha: '2026-06-20', fechaEntrega: null }),         // sin dato → sin bonus
    pet({ estatus: 'entregado', fecha: '2026-07-01' }),                             // otro mes → no cuenta
    pet({ estatus: 'pendiente', fecha: '2026-06-12' }),                             // no entregada
  ]
  const estrellas = [est({}), est({ creadaEn: '2026-05-30T12:00:00Z' })] // solo 1 en junio
  const xp = calcularXPMes('Antonio', '2026-06', peticiones, estrellas)
  expect(xp).toMatchObject({ xpBase: 30, bonusAnticipacion: 3, xpEstrellas: 15, xpTotal: 48, entregadas: 3 })
  const game = calcularGamePersona('Antonio', '2026-06', peticiones, estrellas)
  expect(game.nivel).toBe(1)
  expect(game.xpParaSiguiente).toBe(32) // 80 - 48
  expect(game.progresoNivel).toBe(60)   // 48/80
})

test('puntualidad: extensión NO justificada se mide contra la fecha ORIGINAL', () => {
  const justificada = pet({ estatus: 'entregado', fecha: '2026-06-20', fechaOriginal: '2026-06-10', extensionJustificada: true, fechaEntrega: '2026-06-18' })
  const noJustificada = pet({ estatus: 'entregado', fecha: '2026-06-20', fechaOriginal: '2026-06-10', extensionJustificada: false, fechaEntrega: '2026-06-18' })
  expect(estadoPuntualidad(justificada)).toBe('a_tiempo')  // contra 06-20
  expect(estadoPuntualidad(noJustificada)).toBe('tarde')   // contra 06-10
  expect(estadoPuntualidad(pet({ estatus: 'entregado', fechaEntrega: null }))).toBe('sin_dato')
})

test('rachas: actual (desde la más reciente) y mejor (histórica)', () => {
  const peticiones = [
    pet({ fecha: '2026-06-01', estatus: 'entregado' }),
    pet({ fecha: '2026-06-02', estatus: 'entregado' }),
    pet({ fecha: '2026-06-03', estatus: 'pendiente' }), // corta la racha
    pet({ fecha: '2026-06-04', estatus: 'entregado' }),
    pet({ fecha: '2026-06-05', estatus: 'entregado' }),
    pet({ fecha: '2026-06-06', estatus: 'entregado' }),
  ]
  expect(calcularRachaActual('Antonio', peticiones)).toBe(3) // 06,05,04 entregadas → corta en 03
  expect(calcularMejorRacha('Antonio', peticiones)).toBe(3)
})

test('stats de periodo: quirk del SPA — las vencidas actuales pesan aunque estén fuera del rango', () => {
  const peticiones = [
    pet({ estatus: 'entregado', fecha: '2026-06-10' }),
    pet({ estatus: 'entregado', fecha: '2026-06-12' }),
    pet({ estatus: 'pendiente', fecha: '2026-05-01' }), // vencida de MAYO: cuenta igual (quirk)
  ]
  const s = calcularStatsPersona('Antonio', peticiones, { desde: '2026-06-01', hasta: '2026-06-30' }, '2026-06-20')
  expect(s.entregadas).toBe(2)
  expect(s.pendientesVencidas).toBe(1)
  expect(s.total).toBe(3)
  expect(s.porcentaje).toBe(67) // 2/3
})

test('leaderboard: exclusiones (ceo, rh, Salvador, Arylene) y orden % desc → entregadas desc', () => {
  expect(competeEnLeaderboard(per({ nivel: 'ceo' }))).toBe(false)
  expect(competeEnLeaderboard(per({ nivel: 'rh' }))).toBe(false)
  expect(competeEnLeaderboard(per({ nombre: 'Salvador' }))).toBe(false)
  expect(competeEnLeaderboard(per({ nombre: 'Arylene' }))).toBe(false)
  expect(competeEnLeaderboard(per({ activo: false }))).toBe(false)
  expect(competeEnLeaderboard(per({ nivel: 'head' }))).toBe(true)

  const personas = [per({ nombre: 'Ana' }), per({ nombre: 'Beto' }), per({ nombre: 'Caro' })]
  const peticiones = [
    // Ana: 2 entregadas, 0 vencidas → 100%
    pet({ para: 'Ana', estatus: 'entregado', fecha: '2026-06-05' }),
    pet({ para: 'Ana', estatus: 'entregado', fecha: '2026-06-06' }),
    // Beto: 3 entregadas, 0 vencidas → 100% (empate: gana por entregadas)
    pet({ para: 'Beto', estatus: 'entregado', fecha: '2026-06-05' }),
    pet({ para: 'Beto', estatus: 'entregado', fecha: '2026-06-06' }),
    pet({ para: 'Beto', estatus: 'entregado', fecha: '2026-06-07' }),
    // Caro: 1 entregada + 1 vencida → 50%
    pet({ para: 'Caro', estatus: 'entregado', fecha: '2026-06-05' }),
    pet({ para: 'Caro', estatus: 'pendiente', fecha: '2026-06-01' }),
  ]
  const lb = calcularLeaderboardMes({ mes: '2026-06', personas, peticiones, hoy: '2026-06-20' })
  expect(lb.ranking.map((r) => r.persona.nombre)).toEqual(['Beto', 'Ana', 'Caro'])
  expect(lb.ranking[2].porcentaje).toBe(50)
})

test('reporte de cierre: solo con actividad, orden por XP, recompensa del nivel alcanzado', () => {
  const personas = [per({ nombre: 'Ana' }), per({ nombre: 'Beto' }), per({ nombre: 'Zoe' })]
  const peticiones = [
    // Ana: 8 entregadas + 1 estrella = 95 XP → nivel 2
    ...Array.from({ length: 8 }, (_, i) => pet({ para: 'Ana', estatus: 'entregado', fecha: `2026-06-${String(2 + i).padStart(2, '0')}` })),
    // Beto: 2 entregadas = 20 XP → nivel 1
    pet({ para: 'Beto', estatus: 'entregado', fecha: '2026-06-05' }),
    pet({ para: 'Beto', estatus: 'entregado', fecha: '2026-06-06' }),
    // Zoe: sin actividad → fuera
  ]
  const estrellas = [est({ para: 'Ana', creadaEn: '2026-06-15T12:00:00Z' })]
  const recompensas = [{ id: 'r2', nivel: 2, descripcion: 'tarde libre', activa: true }]
  const rep = calcularReporteCierre({ mes: '2026-06', personas, peticiones, estrellas, recompensas, hoy: '2026-07-01' })
  expect(rep.map((r) => r.persona)).toEqual(['Ana', 'Beto'])
  expect(rep[0]).toMatchObject({ xp: 95, nivel: 2, recompensa: 'tarde libre', entregadas: 8, cumplimiento: 100 })
  expect(rep[1]).toMatchObject({ xp: 20, nivel: 1, recompensa: null })
})

test('cumplimiento de recurrente: ancla en la primera entrega, archivadas fuera, no_registrada', () => {
  const recur: Recurrente = {
    id: 'r1', nombre: 'standup', descripcion: null, para: 'Antonio', area: 'pm',
    frecuencia: 'semanal', diaSemana: 1, diaMes: null, fechaInicio: null, activa: true, creadoPor: 'Dani',
  }
  // lunes: 06-01, 06-08, 06-15, 06-22 (hoy 2026-06-24)
  const peticiones = [
    pet({ origenRecur: 'r1', fecha: '2026-06-01', estatus: 'entregado' }),  // primera entrega → ancla
    pet({ origenRecur: 'r1', fecha: '2026-06-08', estatus: 'archivada' }),  // fuera del cálculo
    pet({ origenRecur: 'r1', fecha: '2026-06-15', estatus: 'pendiente' }),  // pendiente/atrasada
    // 06-22: sin instancia → no_registrada
  ]
  const c = calcularCumplimiento(recur, peticiones, 12, '2026-06-24')
  expect(c.total).toBe(3) // 01 entregada, 15 pendiente, 22 no_registrada (08 archivada excluida)
  expect(c.entregadas).toBe(1)
  expect(c.porcentaje).toBe(33)
  expect(c.detalle.map((d) => d.estado)).toEqual(['no_registrada', 'pendiente', 'entregada'])
})

// ------------------------------------------------------------
// 4.11 — 16 logros nuevos: umbrales exactos (encienden/apagan al límite)
test('logros 4.11: umbrales exactos de los 16 nuevos', () => {
  const base: StatsLogros = {
    entregadasTotales: 0, mejorRacha: 0, rachaActual: 0, areasUnicas: 0,
    reabiertas: 0, mesPerfecto: false, estrellasRecibidasTotal: 0,
    estrellasRecibidasMes: 0, estrellasDadasTotal: 0, mesesNivel3: 0,
    entregasAnticipadas: 0, mesPuntual: false,
    mesesOro: 0, mesesPodio: 0, mesesCien: 0, mesesPuntualesSeguidos: 0,
    reconocimientosDados: 0, reconocimientosRecibidos: 0, ritmoImpecable: false,
  }
  const on = (id: string, s: Partial<StatsLogros>) =>
    LOGROS.find((l) => l.id === id)!.criterio({ ...base, ...s })

  // entregas acumuladas
  expect(on('volumen_500', { entregadasTotales: 499 })).toBe(false)
  expect(on('volumen_500', { entregadasTotales: 500 })).toBe(true)
  expect(on('volumen_1000', { entregadasTotales: 999 })).toBe(false)
  expect(on('volumen_1000', { entregadasTotales: 1000 })).toBe(true)
  // rachas
  expect(on('racha_50', { mejorRacha: 49 })).toBe(false)
  expect(on('racha_50', { mejorRacha: 50 })).toBe(true)
  expect(on('racha_100', { mejorRacha: 99 })).toBe(false)
  expect(on('racha_100', { mejorRacha: 100 })).toBe(true)
  // podio de meses cerrados
  expect(on('oro_mes', { mesesOro: 0 })).toBe(false)
  expect(on('oro_mes', { mesesOro: 1 })).toBe(true)
  expect(on('podio_mes', { mesesPodio: 0 })).toBe(false)
  expect(on('podio_mes', { mesesPodio: 1 })).toBe(true)
  // consistencia
  expect(on('trio_perfecto', { mesesCien: 2 })).toBe(false)
  expect(on('trio_perfecto', { mesesCien: 3 })).toBe(true)
  expect(on('semestre_perfecto', { mesesCien: 5 })).toBe(false)
  expect(on('semestre_perfecto', { mesesCien: 6 })).toBe(true)
  // puntualidad
  expect(on('reloj_suizo', { mesesPuntualesSeguidos: 2 })).toBe(false)
  expect(on('reloj_suizo', { mesesPuntualesSeguidos: 3 })).toBe(true)
  // estrellas recibidas
  expect(on('estrellas_5', { estrellasRecibidasTotal: 4 })).toBe(false)
  expect(on('estrellas_5', { estrellasRecibidasTotal: 5 })).toBe(true)
  expect(on('estrellas_10', { estrellasRecibidasTotal: 9 })).toBe(false)
  expect(on('estrellas_10', { estrellasRecibidasTotal: 10 })).toBe(true)
  expect(on('estrellas_25', { estrellasRecibidasTotal: 24 })).toBe(false)
  expect(on('estrellas_25', { estrellasRecibidasTotal: 25 })).toBe(true)
  // reconocimiento (badges sin XP)
  expect(on('rec_dado_1', { reconocimientosDados: 0 })).toBe(false)
  expect(on('rec_dado_1', { reconocimientosDados: 1 })).toBe(true)
  expect(on('rec_recibido_1', { reconocimientosRecibidos: 1 })).toBe(true)
  expect(on('rec_recibido_10', { reconocimientosRecibidos: 9 })).toBe(false)
  expect(on('rec_recibido_10', { reconocimientosRecibidos: 10 })).toBe(true)
  // recurrentes
  expect(on('ritmo_impecable', { ritmoImpecable: false })).toBe(false)
  expect(on('ritmo_impecable', { ritmoImpecable: true })).toBe(true)
})

// ------------------------------------------------------------
test('logros 4.11: stats derivadas — podio con acentos, meses al 100 y reloj suizo', () => {
  const hoy = new Date('2026-07-10T12:00:00')

  // 15 entregas puntuales: 5 en abril, 5 en mayo, 5 en junio (entregadas el
  // mismo día de la fecha límite → a_tiempo)
  const pets = ['2026-04', '2026-05', '2026-06'].flatMap((m) =>
    Array.from({ length: 5 }, (_, i) =>
      pet({ estatus: 'entregado', fecha: `${m}-1${i}`, fechaEntrega: `${m}-1${i}` })),
  )
  const r1 = calcularLogros({
    nombre: 'Antonio', peticiones: pets, estrellas: [],
    historial: [
      { id: 'h1', persona: 'Antonio', mes: '2026-04', xpTotal: 50, nivelAlcanzado: 2, entregadas: 5, cumplimiento: 100, mejorRacha: 5, recompensa: null, recompensaEntregada: false },
      { id: 'h2', persona: 'Antonio', mes: '2026-05', xpTotal: 50, nivelAlcanzado: 2, entregadas: 5, cumplimiento: 100, mejorRacha: 5, recompensa: null, recompensaEntregada: false },
      { id: 'h3', persona: 'Antonio', mes: '2026-06', xpTotal: 50, nivelAlcanzado: 2, entregadas: 5, cumplimiento: 100, mejorRacha: 5, recompensa: null, recompensaEntregada: false },
    ],
    // el podio llega con acento (BD) y el nombre local sin él → matchNombre
    podios: [
      { mes: '2026-05', personas: ['Antônio', 'Brenda', 'Karla'] },
      { mes: '2026-06', personas: ['Brenda', 'Antonio', 'Karla'] },
    ],
    hoy,
  })
  expect(r1.stats.mesesOro).toBe(1)               // 1er lugar solo en mayo
  expect(r1.stats.mesesPodio).toBe(2)             // top 3 en ambos
  expect(r1.stats.mesesCien).toBe(3)              // trío perfecto ✓
  expect(r1.stats.mesesPuntualesSeguidos).toBe(3) // reloj suizo ✓
  const ids1 = r1.desbloqueados.map((l) => l.id)
  expect(ids1).toContain('oro_mes')
  expect(ids1).toContain('podio_mes')
  expect(ids1).toContain('trio_perfecto')
  expect(ids1).toContain('reloj_suizo')
  expect(ids1).not.toContain('semestre_perfecto') // solo 3 meses al 100

  // una entrega TARDE en mayo corta la racha de meses puntuales en 1 (junio)
  const petsConTarde = [...pets, pet({ estatus: 'entregado', fecha: '2026-05-20', fechaEntrega: '2026-05-25' })]
  const r2 = calcularLogros({ nombre: 'Antonio', peticiones: petsConTarde, estrellas: [], historial: [], hoy })
  expect(r2.stats.mesesPuntualesSeguidos).toBe(1)
  expect(r2.desbloqueados.map((l) => l.id)).not.toContain('reloj_suizo')
})
