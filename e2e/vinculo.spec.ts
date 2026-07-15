import { test, expect, type Page } from '@playwright/test'

// Vínculo sesión ↔ persona (bug Valeria 2026-07-15): una persona dada de
// alta antes del vínculo automático entraba con personas.auth_user_id NULL →
// mi_nombre() = null → la RLS le rechazaba su primera petición con el error
// crudo. Estas pruebas cubren las tres capas del fix: autocuración en el
// layout, aviso visible si no se puede curar, y error claro (no el de RLS)
// si la escritura se intenta de todos modos.

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
  return (await r.json()) as { personas: Record<string, unknown>[]; peticiones: Record<string, unknown>[] }
}

async function desvincular(email: string) {
  await fetch(`${MOCK}/__test/desvincular`, { method: 'POST', body: JSON.stringify({ email }) })
}

async function fallarUnaVez(tabla: string, metodo: string, veces = 1) {
  await fetch(`${MOCK}/__test/fallar`, { method: 'POST', body: JSON.stringify({ tabla, metodo, veces }) })
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('autocuración: login sin vínculo → auth_user_id se llena solo y puede crear', async ({ page }) => {
  await desvincular('antonio@movdi.mx')
  await login(page, 'antonio@movdi.mx')

  // el layout ya curó el vínculo en la primera página: sin aviso
  await expect(page.getByTestId('aviso-cuenta-incompleta')).toHaveCount(0)
  const st = await estado()
  const p = st.personas.find((x) => x.email === 'antonio@movdi.mx')!
  expect(p.auth_user_id).toBe('uid-1')

  // y su primera petición pasa (antes: "new row violates row-level security policy")
  await page.goto('/peticiones')
  await page.getByTestId('btn-nueva-peticion').click()
  await page.locator('#pet-nombre').fill('primera petición de cuenta nueva')
  await page.locator('#pet-area').selectOption('imkt')
  await page.locator('#pet-para').selectOption('Brenda')
  await page.getByTestId('btn-crear-confirmar').click()
  await expect(page.getByTestId('card-peticion').filter({ hasText: 'primera petición de cuenta nueva' })).toBeVisible()
})

// ------------------------------------------------------------
test('vínculo imposible: aviso de cuenta incompleta en vez de silencio', async ({ page }) => {
  await desvincular('antonio@movdi.mx')
  // el login renderiza la home 2 veces (router.replace + router.refresh):
  // el fallo debe sobrevivir ambos intentos de autocuración
  await fallarUnaVez('personas', 'PATCH', 5)
  await login(page, 'antonio@movdi.mx')

  await expect(page.getByTestId('aviso-cuenta-incompleta')).toBeVisible()
  await expect(page.getByTestId('aviso-cuenta-incompleta')).toContainText('no está terminada de configurar')
})

// ------------------------------------------------------------
test('crear sin vínculo y sin autocuración posible: error claro, no el crudo de RLS', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/peticiones')
  await page.getByTestId('btn-nueva-peticion').click()
  await page.locator('#pet-nombre').fill('petición condenada')
  await page.locator('#pet-area').selectOption('imkt')
  await page.locator('#pet-para').selectOption('Brenda')

  // romper el vínculo DESPUÉS de cargar la página (la autocuración del
  // layout ya corrió) y hacer fallar el intento de curar de la action
  await desvincular('antonio@movdi.mx')
  await fallarUnaVez('personas', 'PATCH')
  await page.getByTestId('btn-crear-confirmar').click()

  await expect(page.getByRole('alert').filter({ hasText: 'no está terminada de configurar' })).toBeVisible()
  const st = await estado()
  expect(st.peticiones.find((x) => x.nombre === 'petición condenada')).toBeFalsy()
})
