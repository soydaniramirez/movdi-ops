import { test, expect } from '@playwright/test'
import { type Peticion, type Persona } from '../lib/peticiones'
import { type Recurrente } from '../lib/recurrentes'
import { type Estrella } from '../lib/estrellas'
import {
  calcularCumplimiento, calcularGamePersona, calcularLeaderboardMes, calcularMejorRacha,
  calcularRachaActual, calcularReporteCierre, calcularStatsPersona, calcularXPMes,
  competeEnLeaderboard, estadoPuntualidad, nivelDesdeXP,
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
  nivel: 'ejecutivo', areas: ['pm'], email: null, activo: true, pausadaHasta: null, esDireccion: false, ...o,
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
