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

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// Regresión (2026-10-26): a 390px el grupo XP/tema/campana de la barra
// superior empujaba la página a 467px y se podía arrastrar de lado.
test('barra superior: a 390px no hay scroll horizontal y todo cabe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'antonio@movdi.mx')
  for (const ruta of ['/', '/peticiones']) {
    await page.goto(ruta)
    await expect(page.getByTestId('xp-header')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    // campana, selector de tema y XP dentro de la pantalla
    for (const sel of ['[data-testid="xp-header"]', '[data-testid="selector-tema"]', '[data-testid="chip-perfil"]']) {
      const caja = await page.locator(sel).boundingBox()
      expect(caja!.x + caja!.width).toBeLessThanOrEqual(390)
    }
  }
})
