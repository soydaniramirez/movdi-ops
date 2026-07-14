import { test, expect } from '@playwright/test'
import {
  type Peticion,
  diasHabilesEntre, diasSinMovimiento, esCompromisoPropio, estadoMovimiento,
} from '../lib/peticiones'
import {
  calcularLogros, calcularMejorRacha, calcularRachaActual,
  calcularStatsPersona, calcularXPMes,
} from '../lib/gamificacion'

// Tests unitarios de la Fase compromisos: regla de los 3 días hábiles,
// detección de compromiso propio y anti-farmeo de gamificación.
// Fechas fijas — julio 2026: 06 lun · 10 vie · 11 sáb · 13 lun.

const pet = (o: Partial<Peticion>): Peticion => ({
  id: Math.random().toString(36).slice(2), zona: 'general', nombre: 'x', descripcion: null,
  creadoPor: 'Dani', para: 'Antonio', area: 'pm', fecha: '2026-07-20', prioridad: 'media',
  estatus: 'pendiente', privada: false, origenRecur: null, grupoId: null, fechaOriginal: null,
  motivoCambioFecha: null, cambioVistoPorCreador: true, extensionJustificada: null,
  linkEntrega: null, notaEntrega: null, fechaEntrega: null, ocultaPara: [], creadaEn: null,
  origen: null, actualizadaEn: null, ...o,
})

// ---------- días hábiles ----------
test('diasHabilesEntre: L–V, excluye fines de semana', () => {
  expect(diasHabilesEntre('2026-07-06', '2026-07-06')).toBe(0) // mismo día
  expect(diasHabilesEntre('2026-07-06', '2026-07-07')).toBe(1) // lun → mar
  expect(diasHabilesEntre('2026-07-06', '2026-07-09')).toBe(3) // lun → jue
  expect(diasHabilesEntre('2026-07-10', '2026-07-13')).toBe(1) // vie → lun (finde no cuenta)
  expect(diasHabilesEntre('2026-07-10', '2026-07-12')).toBe(0) // vie → dom
  expect(diasHabilesEntre('2026-07-06', '2026-07-13')).toBe(5) // semana completa
})

test('diasSinMovimiento: usa actualizadaEn y cae a creadaEn', () => {
  expect(diasSinMovimiento(pet({ actualizadaEn: '2026-07-06T10:00:00Z' }), '2026-07-09')).toBe(3)
  expect(diasSinMovimiento(pet({ actualizadaEn: null, creadaEn: '2026-07-10T10:00:00Z' }), '2026-07-13')).toBe(1)
  expect(diasSinMovimiento(pet({ actualizadaEn: null, creadaEn: null }), '2026-07-13')).toBeNull()
})

// ---------- estados ----------
test('estadoMovimiento: atorada con 3+ días hábiles sin movimiento (aunque la fecha no venza)', () => {
  const t = pet({ fecha: '2026-08-30', actualizadaEn: '2026-07-06T10:00:00Z' })
  expect(estadoMovimiento(t, '2026-07-09')).toBe('atorada')   // 3 hábiles
  expect(estadoMovimiento(t, '2026-07-08')).toBe('al_dia')    // 2 hábiles, fecha lejana
})

test('estadoMovimiento: vencida > por_vencer > al_dia cuando hay movimiento reciente', () => {
  const base = { actualizadaEn: '2026-07-13T09:00:00Z' }
  expect(estadoMovimiento(pet({ ...base, fecha: '2026-07-10' }), '2026-07-13')).toBe('vencida')
  expect(estadoMovimiento(pet({ ...base, fecha: '2026-07-13' }), '2026-07-13')).toBe('por_vencer') // hoy
  expect(estadoMovimiento(pet({ ...base, fecha: '2026-07-15' }), '2026-07-13')).toBe('por_vencer') // en 2 días
  expect(estadoMovimiento(pet({ ...base, fecha: '2026-07-16' }), '2026-07-13')).toBe('al_dia')
})

test('estadoMovimiento: entregadas y archivadas no tienen estado', () => {
  expect(estadoMovimiento(pet({ estatus: 'entregado', actualizadaEn: '2026-07-01T00:00:00Z' }), '2026-07-13')).toBeNull()
  expect(estadoMovimiento(pet({ estatus: 'archivada', actualizadaEn: '2026-07-01T00:00:00Z' }), '2026-07-13')).toBeNull()
})

// ---------- compromiso propio ----------
test('esCompromisoPropio: origen propio o solicitante = asignado; instancias recurrentes nunca', () => {
  expect(esCompromisoPropio(pet({ creadoPor: 'Antonio', para: 'Antonio' }))).toBe(true)
  expect(esCompromisoPropio(pet({ creadoPor: 'Dani', para: 'Antonio', origen: 'propio' }))).toBe(true)
  expect(esCompromisoPropio(pet({ creadoPor: 'antonio ', para: 'Antonio' }))).toBe(true) // matchNombre normaliza
  expect(esCompromisoPropio(pet({ creadoPor: 'Dani', para: 'Antonio', origen: 'cliente' }))).toBe(false)
  // instancia recurrente: aunque creador = destinatario, no es compromiso
  expect(esCompromisoPropio(pet({ creadoPor: 'Antonio', para: 'Antonio', origenRecur: 'rec-1' }))).toBe(false)
})

// ---------- anti-farmeo: gamificación ignora compromisos propios ----------
test('XP: compromisos propios entregados NO suman XP ni cuentan como entregas', () => {
  const normales = [
    pet({ estatus: 'entregado', fecha: '2026-06-10', fechaEntrega: '2026-06-09' }), // +10
    pet({ estatus: 'entregado', fecha: '2026-06-15', fechaEntrega: '2026-06-15' }), // +10
  ]
  const farmeo = Array.from({ length: 20 }, (_, i) =>
    pet({
      creadoPor: 'Antonio', para: 'Antonio', origen: 'propio', estatus: 'entregado',
      fecha: `2026-06-${String(2 + i).padStart(2, '0')}`, fechaEntrega: `2026-06-${String(2 + i).padStart(2, '0')}`,
    }))
  const sin = calcularXPMes('Antonio', '2026-06', normales, [], '2026-06-30')
  const con = calcularXPMes('Antonio', '2026-06', [...normales, ...farmeo], [], '2026-06-30')
  expect(con).toEqual(sin) // farmear compromisos no mueve NADA del XP
  expect(con.entregadas).toBe(2)
  expect(con.xpTotal).toBe(60) // 20 base + 40 bono 100%
})

test('cumplimiento: un compromiso propio vencido NO castiga el porcentaje', () => {
  const peticiones = [
    pet({ estatus: 'entregado', fecha: '2026-06-10', fechaEntrega: '2026-06-10' }),
    // compromiso propio vencido — sin el filtro bajaría el % a 50
    pet({ creadoPor: 'Antonio', para: 'Antonio', origen: 'propio', estatus: 'pendiente', fecha: '2026-06-05' }),
  ]
  const stats = calcularStatsPersona('Antonio', peticiones, { desde: '2026-06-01', hasta: '2026-06-30' }, '2026-06-30')
  expect(stats.porcentaje).toBe(100)
  expect(stats.pendientesVencidas).toBe(0)
})

test('rachas y logros: los compromisos propios no cuentan ni cortan', () => {
  const peticiones = [
    pet({ estatus: 'entregado', fecha: '2026-06-01' }),
    pet({ estatus: 'entregado', fecha: '2026-06-02' }),
    // compromiso propio pendiente con fecha posterior: sin filtro cortaría la racha
    pet({ creadoPor: 'Antonio', para: 'Antonio', origen: 'propio', estatus: 'pendiente', fecha: '2026-06-30' }),
  ]
  expect(calcularRachaActual('Antonio', peticiones)).toBe(2)
  expect(calcularMejorRacha('Antonio', peticiones)).toBe(2)

  const farmeo = Array.from({ length: 30 }, (_, i) =>
    pet({
      creadoPor: 'Antonio', para: 'Antonio', origen: 'propio', estatus: 'entregado',
      fecha: `2026-05-${String(1 + (i % 28)).padStart(2, '0')}`,
    }))
  const { stats } = calcularLogros({
    nombre: 'Antonio', peticiones: [...peticiones, ...farmeo], estrellas: [], historial: [],
  })
  expect(stats.entregadasTotales).toBe(2) // las 30 farmeadas no existen para logros
})
