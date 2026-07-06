import { test, expect } from '@playwright/test'
import {
  type Recurrente, calcularFechasEsperadas, esOcurrenciaEnFecha,
  proximaOcurrenciaQuincenal, siguienteOcurrencia, sumarDias,
} from '../lib/recurrentes'

// Tests unitarios puros del motor (sin navegador): la misma lógica que
// replica la función SQL notificar_recurrentes_del_dia() del cron.

const base: Recurrente = {
  id: 'r1', nombre: 'x', descripcion: null, para: 'Antonio', area: 'pm',
  frecuencia: 'quincenal', diaSemana: 1, diaMes: null,
  fechaInicio: '2026-05-25', // lunes (el caso real de Mariana)
  activa: true, creadoPor: 'Dani',
}

test('quincenal real: solo cada 14 días desde el ancla', () => {
  expect(esOcurrenciaEnFecha(base, '2026-05-25')).toBe(true)  // ancla
  expect(esOcurrenciaEnFecha(base, '2026-06-01')).toBe(false) // +7 NO toca
  expect(esOcurrenciaEnFecha(base, '2026-06-08')).toBe(true)  // +14
  expect(esOcurrenciaEnFecha(base, '2026-06-22')).toBe(true)  // +28
  expect(esOcurrenciaEnFecha(base, '2026-07-06')).toBe(true)  // +42
  expect(esOcurrenciaEnFecha(base, '2026-07-13')).toBe(false) // semana intermedia
  expect(esOcurrenciaEnFecha(base, '2026-05-11')).toBe(false) // antes del ancla
  expect(esOcurrenciaEnFecha({ ...base, activa: false }, '2026-06-08')).toBe(false)
})

test('quincenal legacy (sin ancla): se comporta como semanal — paridad SPA pre-cutover', () => {
  const legacy = { ...base, fechaInicio: null }
  expect(esOcurrenciaEnFecha(legacy, '2026-06-01')).toBe(true) // cualquier lunes
  expect(esOcurrenciaEnFecha(legacy, '2026-06-08')).toBe(true)
  expect(esOcurrenciaEnFecha(legacy, '2026-06-09')).toBe(false) // martes
})

test('semanal y mensual: sin cambios de semántica', () => {
  const sem = { ...base, frecuencia: 'semanal' as const, fechaInicio: null, diaSemana: 5 }
  expect(esOcurrenciaEnFecha(sem, '2026-07-03')).toBe(true)  // viernes
  expect(esOcurrenciaEnFecha(sem, '2026-07-04')).toBe(false)
  const men = { ...base, frecuencia: 'mensual' as const, fechaInicio: null, diaMes: 28 }
  expect(esOcurrenciaEnFecha(men, '2026-07-28')).toBe(true)
  expect(esOcurrenciaEnFecha(men, '2026-07-27')).toBe(false)
})

test('proximaOcurrenciaQuincenal: hoy si toca, si no la siguiente de la serie', () => {
  expect(proximaOcurrenciaQuincenal('2026-05-25', '2026-05-25')).toBe('2026-05-25')
  expect(proximaOcurrenciaQuincenal('2026-05-25', '2026-06-08')).toBe('2026-06-08') // justo toca
  expect(proximaOcurrenciaQuincenal('2026-05-25', '2026-06-09')).toBe('2026-06-22') // pasó → +14
  expect(proximaOcurrenciaQuincenal('2026-05-25', '2026-07-03')).toBe('2026-07-06') // caso real Mariana
  expect(proximaOcurrenciaQuincenal('2026-05-25', '2026-05-01')).toBe('2026-05-25') // antes del ancla
})

test('siguienteOcurrencia: quincenal real +14, legacy +7, mensual +1 mes', () => {
  expect(siguienteOcurrencia('2026-07-06', base)).toBe('2026-07-20')
  expect(siguienteOcurrencia('2026-07-06', { ...base, fechaInicio: null })).toBe('2026-07-13')
  expect(siguienteOcurrencia('2026-07-15', { frecuencia: 'mensual', fechaInicio: null })).toBe('2026-08-15')
  expect(siguienteOcurrencia('2026-07-03', { frecuencia: 'semanal', fechaInicio: null })).toBe('2026-07-10')
})

test('cumplimiento alineado: toda fecha esperada ES ocurrencia (quincenal real)', () => {
  const hoy = '2026-07-03'
  const esperadas = calcularFechasEsperadas(base, hoy)
  expect(esperadas.length).toBeGreaterThan(0)
  for (const f of esperadas) {
    expect(esOcurrenciaEnFecha(base, f), `esperada ${f} debe ser ocurrencia`).toBe(true)
  }
  // exactamente las de la serie (desde el ancla) dentro de la ventana de 12 semanas
  expect(sumarDias(hoy, -84) < '2026-05-25').toBe(true) // el ancla cae dentro de la ventana
  expect(esperadas).toEqual(['2026-05-25', '2026-06-08', '2026-06-22'])
})

test('cumplimiento mensual y semanal dentro de ventana', () => {
  const men = { ...base, frecuencia: 'mensual' as const, fechaInicio: null, diaMes: 15 }
  const esperadasM = calcularFechasEsperadas(men, '2026-07-03')
  expect(esperadasM).toContain('2026-06-15')
  expect(esperadasM).toContain('2026-05-15')
  expect(esperadasM).not.toContain('2026-07-15') // aún no llega
  for (const f of esperadasM) expect(esOcurrenciaEnFecha(men, f)).toBe(true)

  const sem = { ...base, frecuencia: 'semanal' as const, fechaInicio: null, diaSemana: 1 }
  const esperadasS = calcularFechasEsperadas(sem, '2026-07-03')
  expect(esperadasS[esperadasS.length - 1]).toBe('2026-06-29') // último lunes <= hoy
  expect(esperadasS.length).toBe(12) // ventana 2026-04-10..07-03 → lunes del 04-13 al 06-29
  for (const f of esperadasS) expect(esOcurrenciaEnFecha(sem, f)).toBe(true)
})
