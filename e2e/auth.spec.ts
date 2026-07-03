import { test, expect, type Page } from '@playwright/test'

const EMAIL = 'antonio@movdi.mx'
const PASS_OK = 'correcta123'
const PASS_MAL = 'incorrecta'

// Colecciona todas las requests que salen del navegador para poder afirmar
// "cero lecturas de datos pre-auth" (el equivalente al network tab).
function capturarRed(page: Page) {
  const urls: string[] = []
  page.on('request', (req) => urls.push(req.url()))
  return urls
}

test('ruta protegida sin sesión redirige a /login sin exponer datos', async ({ page }) => {
  const red = capturarRed(page)

  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('ingresa con tu correo y contraseña.')).toBeVisible()

  // ni una sola lectura de datos (personas ni ninguna tabla) antes de autenticar
  const lecturasDb = red.filter((u) => u.includes('/rest/v1/'))
  expect(lecturasDb).toHaveLength(0)

  // el HTML servido tampoco trae nombres/correos del equipo
  const html = await page.content()
  expect(html).not.toContain('@movdi.mx".replace') // sanity
  expect(html.match(/[a-z.]+@movdi\.mx/g) ?? []).toEqual(['tucorreo@movdi.mx']) // solo el placeholder
})

test('login inválido muestra error genérico y no entra', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#login-email').fill(EMAIL)
  await page.locator('#login-password').fill(PASS_MAL)
  await page.getByRole('button', { name: 'entrar →' }).click()

  // p[role=alert] del form (Next añade su propio route-announcer con role=alert)
  await expect(page.locator('p[role="alert"]')).toHaveText('correo o contraseña incorrectos')
  await expect(page).toHaveURL(/\/login$/)
})

test('login válido entra al dashboard; logout limpia la sesión', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#login-email').fill(EMAIL)
  await page.locator('#login-password').fill(PASS_OK)
  await page.getByRole('button', { name: 'entrar →' }).click()

  // dashboard renderizado por Server Component leyendo la sesión de cookies
  await expect(page).toHaveURL(/\/$|\/$/)
  await expect(page.getByTestId('user-email')).toHaveText(EMAIL)

  // la sesión vive en cookies (no localStorage)
  const cookies = await page.context().cookies()
  expect(cookies.some((c) => c.name.includes('auth-token'))).toBe(true)
  const ls = await page.evaluate(() => JSON.stringify(Object.keys(localStorage)))
  expect(ls).not.toContain('auth-token')

  // con sesión, /login redirige al dashboard
  await page.goto('/login')
  await expect(page.getByTestId('user-email')).toHaveText(EMAIL)

  // logout → vuelve a /login y la ruta protegida vuelve a estar bloqueada
  await page.getByRole('button', { name: 'cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('olvidaste tu contraseña: mensaje neutro anti-enumeración', async ({ page }) => {
  await page.goto('/login')

  // sin correo: pide escribirlo
  await page.getByRole('button', { name: '¿olvidaste tu contraseña?' }).click()
  await expect(page.getByRole('status')).toContainText('escribe tu correo')

  // con correo: mensaje neutro (no confirma existencia) y llamada a /recover
  const recoverReq = page.waitForRequest((r) => r.url().includes('/auth/v1/recover'))
  await page.locator('#login-email').fill(EMAIL)
  await page.getByRole('button', { name: '¿olvidaste tu contraseña?' }).click()
  await recoverReq
  await expect(page.getByRole('status')).toContainText(`si ${EMAIL} está registrado`)
})
