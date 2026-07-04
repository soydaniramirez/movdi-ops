import { test, expect, type Page } from '@playwright/test'
import { semanaActual } from '../lib/estrellas'

const MOCK = 'http://127.0.0.1:54321'
const PASS = 'correcta123'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(PASS)
  await page.getByRole('button', { name: 'entrar →' }).click()
  await expect(page.getByTestId('user-email')).toHaveText(email)
}

async function estado() {
  const r = await fetch(`${MOCK}/__test/state`)
  return (await r.json()) as {
    estrellas: Record<string, unknown>[]
    notificaciones: Record<string, unknown>[]
  }
}

async function darEstrellaUI(page: Page, para: string, motivo: string) {
  await page.getByTestId('btn-dar-estrella').click()
  await page.locator('#estrella-para').selectOption(para)
  await page.locator('#estrella-motivo').fill(motivo)
  await page.getByTestId('btn-dar-confirmar').click()
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('semanaActual: ISO 8601 (lunes-domingo, jueves define el año) — misma definición que la RLS', () => {
  // casos ISO conocidos
  expect(semanaActual('2026-01-01T12:00:00')).toBe('2026-W01') // jueves 1 ene 2026
  expect(semanaActual('2026-07-03T12:00:00')).toBe('2026-W27') // viernes
  expect(semanaActual('2026-07-05T12:00:00')).toBe('2026-W27') // domingo, misma semana
  expect(semanaActual('2026-07-06T12:00:00')).toBe('2026-W28') // lunes, cambia
  expect(semanaActual('2024-12-30T12:00:00')).toBe('2025-W01') // lunes 30 dic 2024 → W01 de 2025
})

// ------------------------------------------------------------
test('dar estrella: de_persona y semana derivados en servidor + notificación al receptor', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/estrellas')
  await expect(page.getByTestId('btn-dar-estrella')).toContainText('(2)')

  await darEstrellaUI(page, 'Brenda', 'me salvó con el cierre del cliente')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const e = st.estrellas.find((x) => x.motivo === 'me salvó con el cierre del cliente')!
  expect(e).toBeTruthy()
  expect(e.de_persona).toBe('Antonio') // derivado de la sesión — no spoofeable
  expect(e.para_persona).toBe('Brenda')
  expect(e.semana).toBe(semanaActual()) // formato ISO YYYY-Www calculado en servidor

  const notif = st.notificaciones.find((n) => n.tipo === 'estrella' && !String(n.id).startsWith('n-seed-'))!
  expect(notif.para).toBe('Brenda')
  expect(notif.titulo).toBe('Antonio te dio una estrella ⭐')
  expect(notif.detalle).toBe('"me salvó con el cierre del cliente"')

  // el contador de restantes baja
  await expect(page.getByTestId('btn-dar-estrella')).toContainText('(1)')
})

// ------------------------------------------------------------
test('límites: 2 ok · 3ª bloqueada · duplicada bloqueada · a sí mismo imposible', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/estrellas')

  // 1ª y 2ª ok
  await darEstrellaUI(page, 'Brenda', 'apoyo con el pitch')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await darEstrellaUI(page, 'Arylene', 'revisó el contrato exprés')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  let st = await estado()
  expect(st.estrellas.filter((e) => e.de_persona === 'Antonio' && e.semana === semanaActual())).toHaveLength(2)

  // 3ª: el botón muestra 0 restantes y el modal bloquea
  await expect(page.getByTestId('btn-dar-estrella')).not.toContainText('(')
  await page.getByTestId('btn-dar-estrella').click()
  await expect(page.getByTestId('estrellas-restantes')).toContainText('ya diste tus 2 estrellas de esta semana')
  await expect(page.getByTestId('btn-dar-confirmar')).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.locator('body').click({ position: { x: 5, y: 5 } }) // cerrar overlay

  st = await estado()
  expect(st.estrellas.filter((e) => e.de_persona === 'Antonio' && e.semana === semanaActual())).toHaveLength(2)
})

// ------------------------------------------------------------
test('duplicada a la misma persona en la semana: bloqueada (y no aparece en el selector)', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/estrellas')

  await darEstrellaUI(page, 'Brenda', 'gran apoyo con campaña')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // al reabrir el modal, Brenda ya NO es elegible esta semana (paridad SPA)
  await page.getByTestId('btn-dar-estrella').click()
  await expect(page.locator('#estrella-para option', { hasText: 'Brenda' })).toHaveCount(0)
  // …y Arylene sí sigue disponible
  await expect(page.locator('#estrella-para option', { hasText: 'Arylene' })).toHaveCount(1)
})

// ------------------------------------------------------------
test('a sí mismo: imposible desde la UI (excluido del selector) — y la RLS lo respalda', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/estrellas')
  await page.getByTestId('btn-dar-estrella').click()
  await expect(page.locator('#estrella-para option', { hasText: 'Antonio' })).toHaveCount(0)
})

// ------------------------------------------------------------
test('feed: mis recibidas (desc, con conteos) y últimas del equipo', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/estrellas')

  // seed: Antonio tiene 1 recibida de Brenda (hace 12 días → total 1, mes actual 0)
  await expect(page.getByTestId('contador-estrellas')).toContainText('1 recibida(s) en total')
  const item = page.getByTestId('estrella-item')
  await expect(item).toHaveCount(1)
  await expect(item).toContainText('me ayudó con el pitch')
  await expect(item).toContainText('de Brenda')

  // feed del equipo visible para todos (estrellas_select true)
  await expect(page.getByTestId('feed-equipo')).toContainText('Brenda')
  await expect(page.getByTestId('feed-equipo')).toContainText('Antonio')
})
