// Fase 4.14 — visibilidad de pestañas por rol, panorama de equipo y ⚡ toque.
import { test, expect, type Page } from '@playwright/test'

const MOCK = 'http://127.0.0.1:54321'
const PASS = 'correcta123'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(PASS)
  await page.getByRole('button', { name: 'entrar →' }).click()
  await expect(page.getByTestId('user-email')).toHaveText(email)
}

async function notifs() {
  const r = await fetch(`${MOCK}/__test/state`)
  return ((await r.json()) as { notificaciones: Record<string, unknown>[] }).notificaciones
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('pestañas por rol: rh solo rh/dirección · equipo solo heads/dirección · rutas redirigen', async ({ page, browser }) => {
  // sarai (rh): ve rh, no equipo; /equipo la regresa a home
  await login(page, 'sarai@movdi.mx')
  await expect(page.getByRole('link', { name: 'rh', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'equipo' })).toHaveCount(0)
  await page.goto('/equipo')
  await expect(page).toHaveURL(/\/$/)

  // karla (head): ve equipo, no rh; /rh la regresa a home
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'karla@movdi.mx')
  await expect(p2.getByRole('link', { name: 'equipo' })).toBeVisible()
  await expect(p2.getByRole('link', { name: 'rh', exact: true })).toHaveCount(0)
  await p2.goto('/rh')
  await expect(p2).toHaveURL(/\/$/)
  await ctx.close()

  // dani (dirección): ambas
  const ctx2 = await browser.newContext()
  const p3 = await ctx2.newPage()
  await login(p3, 'dani@movdi.mx')
  await expect(p3.getByRole('link', { name: 'equipo' })).toBeVisible()
  await expect(p3.getByRole('link', { name: 'rh', exact: true })).toBeVisible()
  await ctx2.close()
})

// ------------------------------------------------------------
test('panorama head: SOLO su equipo, sin gestión, nombres semaforizados, con toque', async ({ page }) => {
  await login(page, 'karla@movdi.mx')
  await page.goto('/equipo')

  // equipo de Karla: Brenda (principal) y Antonio (apoyo) — nadie más
  await expect(page.getByTestId('card-persona')).toHaveCount(2)
  await expect(page.getByTestId('card-persona').filter({ hasText: 'Brenda' })).toBeVisible()
  await expect(page.getByTestId('card-persona').filter({ hasText: 'Antonio' })).toBeVisible()
  await expect(page.getByTestId('card-persona').filter({ hasText: 'Sarai' })).toHaveCount(0)

  // modo panorama: cero acciones de gestión, sí toque
  await expect(page.getByTestId('btn-agregar-persona')).toHaveCount(0)
  await expect(page.getByTestId('btn-editar-persona')).toHaveCount(0)
  await expect(page.getByTestId('btn-desactivar')).toHaveCount(0)
  await expect(page.getByTestId('btn-toque')).toHaveCount(2)

  // nombres pintados por estado del semáforo (Antonio tiene tareas → estado con color)
  const nombreAntonio = page.getByTestId('card-persona').filter({ hasText: 'Antonio' }).locator('[data-sem]')
  await expect(nombreAntonio).toHaveAttribute('data-sem', /r|y|g/)
})

// ------------------------------------------------------------
test('dirección: ve a todos y conserva la gestión completa', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await page.goto('/equipo')
  // roster completo (7 personas activas en el mock)
  await expect(page.getByTestId('card-persona')).toHaveCount(7)
  await expect(page.getByTestId('btn-agregar-persona')).toBeVisible()
  await expect(page.getByTestId('btn-editar-persona').first()).toBeVisible()
})

// ------------------------------------------------------------
test('⚡ toque: head a su equipo, con remitente visible y límite 1/persona/día', async ({ page }) => {
  await login(page, 'karla@movdi.mx')
  await page.goto('/equipo')

  const cardAntonio = page.getByTestId('card-persona').filter({ hasText: 'Antonio' })
  await cardAntonio.getByTestId('btn-toque').click()
  await page.getByText('recta final — tú puedes 🚀').click()
  await page.getByTestId('btn-toque-enviar').click()
  await expect(page.getByTestId('nota-equipo')).toContainText('⚡ toque enviado a Antonio')

  // notificación con remitente y mensaje elegido
  const n = (await notifs()).find((x) => x.tipo === 'toque' && x.para === 'Antonio')!
  expect(n).toBeTruthy()
  expect(n.titulo).toBe('⚡ Karla te mandó un toque')
  expect(n.detalle).toBe('recta final — tú puedes 🚀')

  // segundo toque el mismo día → rechazado por el límite suave
  await cardAntonio.getByTestId('btn-toque').click()
  await page.getByTestId('btn-toque-enviar').click()
  await expect(page.locator('p[role="alert"]')).toContainText('ya le mandaste un toque hoy')
  const dobles = (await notifs()).filter((x) => x.tipo === 'toque' && x.para === 'Antonio')
  expect(dobles.length).toBe(1)

  // …pero a OTRA persona del equipo sí puede (custom, muestra remitente)
  const cardBrenda = page.getByTestId('card-persona').filter({ hasText: 'Brenda' })
  await cardBrenda.getByTestId('btn-toque').click()
  await page.locator('#toque-custom').fill('ese cliente ya casi cae 💪')
  await page.getByTestId('btn-toque-enviar').click()
  await expect(page.getByTestId('nota-equipo')).toContainText('⚡ toque enviado a Brenda')
  const nB = (await notifs()).find((x) => x.tipo === 'toque' && x.para === 'Brenda')!
  expect(nB.detalle).toBe('ese cliente ya casi cae 💪')
})
