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

async function irAAnuncios(page: Page) {
  await page.goto('/anuncios')
  await expect(page.getByRole('heading', { name: /anuncios/ })).toBeVisible()
}

async function estado() {
  const r = await fetch(`${MOCK}/__test/state`)
  return (await r.json()) as {
    anuncios: Record<string, unknown>[]
    anuncios_vistos: Record<string, unknown>[]
  }
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('gating de creación: ejecutivo no ve el botón; rh y ceo sí', async ({ page, browser }) => {
  await login(page, 'antonio@movdi.mx') // ejecutivo
  await irAAnuncios(page)
  await expect(page.getByTestId('btn-nuevo-anuncio')).toHaveCount(0)

  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'sarai@movdi.mx') // rh
  await irAAnuncios(p2)
  await expect(p2.getByTestId('btn-nuevo-anuncio')).toBeVisible()
  await ctx.close()
})

// ------------------------------------------------------------
test('audiencia y expiración: cada quien ve solo lo suyo; expirados nunca', async ({ page, browser }) => {
  // Antonio (ejecutivo, pm): ve 'todos'; NO heads, NO area_imkt, NO expirado
  await login(page, 'antonio@movdi.mx')
  await irAAnuncios(page)
  await expect(page.getByTestId('card-anuncio').filter({ hasText: 'junta general viernes' })).toBeVisible()
  await expect(page.getByTestId('card-anuncio').filter({ hasText: 'revisión de presupuestos' })).toHaveCount(0)
  await expect(page.getByTestId('card-anuncio').filter({ hasText: 'nuevo brandbook imkt' })).toHaveCount(0)
  await expect(page.getByTestId('card-anuncio').filter({ hasText: 'anuncio expirado' })).toHaveCount(0)

  // Karla (head, digital): ve 'todos' + 'heads'; no area_imkt
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'karla@movdi.mx')
  await irAAnuncios(p2)
  await expect(p2.getByTestId('card-anuncio').filter({ hasText: 'revisión de presupuestos' })).toBeVisible()
  await expect(p2.getByTestId('card-anuncio').filter({ hasText: 'nuevo brandbook imkt' })).toHaveCount(0)
  await ctx.close()

  // Brenda (ejecutiva, imkt): ve area_imkt; no heads
  const ctx2 = await browser.newContext()
  const p3 = await ctx2.newPage()
  await login(p3, 'brenda@movdi.mx')
  await irAAnuncios(p3)
  await expect(p3.getByTestId('card-anuncio').filter({ hasText: 'nuevo brandbook imkt' })).toBeVisible()
  await expect(p3.getByTestId('card-anuncio').filter({ hasText: 'revisión de presupuestos' })).toHaveCount(0)
  await ctx2.close()
})

// ------------------------------------------------------------
test('crear anuncio (ceo): tipo, audiencia área y expiración fin-de-día', async ({ page, browser }) => {
  await login(page, 'dani@movdi.mx')
  await irAAnuncios(page)
  await page.getByTestId('btn-nuevo-anuncio').click()

  const maniana = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()
  await page.locator('#anu-titulo').fill('workshop de analítica')
  await page.locator('#anu-contenido').fill('taller para el área digital el jueves')
  await page.locator('#anu-tipo').selectOption('importante')
  await page.locator('#anu-audiencia').selectOption('area_digital')
  await page.locator('#anu-expira').fill(maniana)
  await page.getByTestId('btn-crear-anuncio-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const a = st.anuncios.find((x) => x.titulo === 'workshop de analítica')!
  expect(a).toBeTruthy()
  expect(a.creado_por).toBe('Dani') // derivado de la sesión
  expect(a.tipo).toBe('importante')
  expect(a.audiencia).toBe('area_digital')
  expect(a.activo).toBe(true)
  expect(String(a.expira_en)).toContain(maniana) // paridad: expira al final del día elegido

  // Karla (digital) lo ve; Antonio (pm) no
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'karla@movdi.mx')
  await irAAnuncios(p2)
  await expect(p2.getByTestId('card-anuncio').filter({ hasText: 'workshop de analítica' })).toBeVisible()
  await ctx.close()

  const ctx2 = await browser.newContext()
  const p3 = await ctx2.newPage()
  await login(p3, 'antonio@movdi.mx')
  await irAAnuncios(p3)
  await expect(p3.getByTestId('card-anuncio').filter({ hasText: 'workshop de analítica' })).toHaveCount(0)
  await ctx2.close()
})

// ------------------------------------------------------------
test('marcar visto: persona derivada de sesión; contador y estado leído', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await irAAnuncios(page)

  // solo ve 1 activo ('todos'); sin leer
  await expect(page.getByTestId('contador-no-vistos')).toContainText('1 activos · 1 sin leer')
  const card = page.getByTestId('card-anuncio').filter({ hasText: 'junta general viernes' })
  await expect(card.getByTestId('estado-visto')).toHaveText('● sin leer')

  await card.click()
  await page.getByTestId('btn-marcar-visto').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(card.getByTestId('estado-visto')).toHaveText('leído ✓')
  await expect(page.getByTestId('contador-no-vistos')).toContainText('1 activos · 0 sin leer')

  const st = await estado()
  const visto = st.anuncios_vistos.find((v) => v.anuncio_id === 'a-seed-1' && v.persona_nombre === 'Antonio')
  expect(visto).toBeTruthy()
})

// ------------------------------------------------------------
test('el creador ve quién ya lo vio; y puede archivar (desaparece para todos)', async ({ page, browser }) => {
  await login(page, 'dani@movdi.mx')
  await irAAnuncios(page)
  const card = page.getByTestId('card-anuncio').filter({ hasText: 'junta general viernes' })
  await card.click()

  // Brenda ya lo vio (seed)
  await expect(page.getByTestId('vistas-info')).toContainText('vistas (1)')
  await expect(page.getByTestId('vistas-info')).toContainText('Brenda')

  page.on('dialog', (d) => d.accept())
  await page.getByTestId('btn-archivar-anuncio').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(card).toHaveCount(0)

  const st = await estado()
  expect((st.anuncios.find((a) => a.id === 'a-seed-1'))!.activo).toBe(false)

  // ya no aparece para nadie
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'antonio@movdi.mx')
  await irAAnuncios(p2)
  await expect(p2.getByTestId('card-anuncio').filter({ hasText: 'junta general viernes' })).toHaveCount(0)
  await ctx.close()
})

// ------------------------------------------------------------
test('no-creador no ve botón archivar ni el panel de vistas', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await irAAnuncios(page)
  await page.getByTestId('card-anuncio').filter({ hasText: 'junta general viernes' }).click()
  await expect(page.getByTestId('btn-archivar-anuncio')).toHaveCount(0)
  await expect(page.getByTestId('vistas-info')).toHaveCount(0)
})
