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

async function token(email: string) {
  const r = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  })
  return ((await r.json()) as { access_token: string }).access_token
}

async function estado() {
  const r = await fetch(`${MOCK}/__test/state`)
  return (await r.json()) as { peticiones: Record<string, unknown>[] }
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// Regresión 2026-10-19 (peticiones de Isaac): solo el creador puede eliminar,
// así que lo que pidió alguien que ya salió se quedaba abierto para siempre.
test('solicitante dado de baja: quien la recibe la cancela con rastro (y antes de la baja no hay botón)', async ({ page }) => {
  // Brenda le pide algo a Antonio
  const tkBrenda = await token('brenda@movdi.mx')
  await fetch(`${MOCK}/rest/v1/peticiones`, {
    method: 'POST', headers: { Authorization: `Bearer ${tkBrenda}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      zona: 'general', nombre: 'tarea de alguien que se fue', creado_por: 'Brenda', para: 'Antonio',
      area: 'pm', fecha: new Date().toISOString().slice(0, 10), prioridad: 'media', estatus: 'pendiente',
      privada: false, oculta_para: [],
    }),
  })

  // con Brenda ACTIVA, Antonio no ve el botón
  await login(page, 'antonio@movdi.mx')
  await page.goto('/peticiones')
  const fila = page.locator('tr', { hasText: 'tarea de alguien que se fue' })
  await expect(fila).toBeVisible()
  await expect(fila.getByTestId('btn-cancelar-huerfana')).toHaveCount(0)

  // dirección da de baja a Brenda (activo=false)
  const tkDani = await token('dani@movdi.mx')
  await fetch(`${MOCK}/rest/v1/personas?nombre=eq.Brenda`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${tkDani}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ activo: false }),
  })

  await page.reload()
  await expect(fila.getByTestId('btn-cancelar-huerfana')).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await fila.getByTestId('btn-cancelar-huerfana').click()

  await expect.poll(async () => {
    const p = (await estado()).peticiones.find((x) => x.nombre === 'tarea de alguien que se fue')
    return p?.estatus
  }).toBe('cancelada')
  const p = (await estado()).peticiones.find((x) => x.nombre === 'tarea de alguien que se fue')!
  expect(String(p.descripcion)).toContain('Brenda (solicitante) ya no está en MOVDI')
  expect(p.fecha_entrega).toBeNull()
})
