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

const opacidad = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => getComputedStyle(el).opacity)

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

test('quién hace qué: ejecutivo la ve en la nav, preselecciona su área, filtra y recuerda', async ({ page }) => {
  // Antonio = ejecutivo de PM, sin gente a cargo ni permisos especiales
  await login(page, 'antonio@movdi.mx')
  await page.getByRole('link', { name: 'quién hace qué' }).click()
  await expect(page).toHaveURL(/\/quien-hace-que$/)
  await expect(page.getByRole('heading', { name: 'Quién hace qué', level: 1 })).toBeVisible()

  // su área (pm) viene preseleccionada y el resumen aparece
  const filtro = page.getByTestId('qhq-filtro')
  await expect(filtro.getByRole('button', { name: 'PM' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('qhq-resumen')).toContainText('Lo que le toca a Personal Management')
  await expect(page.getByTestId('qhq-resumen')).toContainText('Copy de un talento (bio, press, pitch, mensajes a marcas)')

  // columnas, tarjetas y pasos de otras áreas se atenúan
  await expect.poll(() => opacidad(page, 'th[data-area="ven"]')).toBe('0.2')
  await expect.poll(() => opacidad(page, 'th[data-area="pm"]')).toBe('1')
  await expect.poll(() => opacidad(page, '[data-testid="qhq-paso"][data-area="dig"]')).toBe('0.2')
  // el paso compartido "PM o IMKT" cuenta para PM
  await expect.poll(() => opacidad(page, '[data-testid="qhq-paso"][data-area="pmimk"]')).toBe('1')

  // cambiar a Ventas y que se recuerde al recargar
  await filtro.getByRole('button', { name: 'Ventas' }).click()
  await expect(page.getByTestId('qhq-resumen')).toContainText('Lo que le toca a Ventas')
  await expect(page.getByTestId('qhq-resumen')).toContainText('Mover la press con marcas y agencias')
  await page.reload()
  await expect(filtro.getByRole('button', { name: 'Ventas' })).toHaveAttribute('aria-pressed', 'true')

  // volver a tocarla quita el filtro (y "sin filtro" también se recuerda)
  await filtro.getByRole('button', { name: 'Ventas' }).click()
  await expect(page.getByTestId('qhq-resumen')).toHaveCount(0)
  await expect.poll(() => opacidad(page, 'th[data-area="ven"]')).toBe('1')
  await page.reload()
  await expect(page.getByTestId('qhq-filtro').getByRole('button', { name: 'PM' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('qhq-resumen')).toHaveCount(0)
})

test('quién hace qué: "Copiar plantilla" copia el correo de campaña', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:3100' })
  await login(page, 'antonio@movdi.mx')
  await page.goto('/quien-hace-que')
  await page.getByTestId('qhq-copiar').click()
  await expect(page.getByTestId('qhq-copiar')).toHaveText('Copiada')
  const copiado = await page.evaluate(() => navigator.clipboard.readText())
  expect(copiado).toContain('Asunto: [ID de campaña] Campaña confirmada · [Marca] · [Talento]')
  expect(copiado).toContain('¿Me confirmas de recibido cuando la tengas en el dashboard?')
})

test('quién hace qué: alguien sin área de la matriz entra sin filtro', async ({ page }) => {
  // Sarai = rh: su área no está en la matriz → sin preselección
  await login(page, 'sarai@movdi.mx')
  await page.goto('/quien-hace-que')
  await expect(page.getByRole('heading', { name: 'Quién hace qué', level: 1 })).toBeVisible()
  await expect(page.getByTestId('qhq-resumen')).toHaveCount(0)
  await expect(page.getByTestId('qhq-filtro').locator('[aria-pressed="true"]')).toHaveCount(0)
})
