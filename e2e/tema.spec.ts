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

const tema = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'))

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

test('tema: sistema por defecto sigue al SO; claro/oscuro se guardan y sobreviven a recargar', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await login(page, 'dani@movdi.mx')
  // sistema (default) + SO claro → light
  expect(await tema(page)).toBe('light')
  await expect(page.getByRole('radio', { name: 'tema sistema' })).toHaveAttribute('aria-checked', 'true')

  // en "sistema" sigue en vivo al SO
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => tema(page)).toBe('dark')

  // forzar claro aunque el SO esté oscuro, y que sobreviva a recargar
  await page.getByRole('radio', { name: 'tema claro' }).click()
  expect(await tema(page)).toBe('light')
  await page.reload()
  expect(await tema(page)).toBe('light')
  await expect(page.getByRole('radio', { name: 'tema claro' })).toHaveAttribute('aria-checked', 'true')

  // el fondo realmente cambia (la escala neutral sigue al tema)
  const fondoClaro = await page.evaluate(() => getComputedStyle(document.querySelector('.min-h-screen')!).backgroundColor)
  await page.getByRole('radio', { name: 'tema oscuro' }).click()
  const fondoOscuro = await page.evaluate(() => getComputedStyle(document.querySelector('.min-h-screen')!).backgroundColor)
  expect(fondoClaro).not.toBe(fondoOscuro)
  expect(await tema(page)).toBe('dark')
})
