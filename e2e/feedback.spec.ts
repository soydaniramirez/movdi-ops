// Módulo de feedback interno (Fase 4.10) contra la RLS simulada del mock
// (espejo de la migración cutover 7): anonimato con doble candado,
// mejora/liderazgo solo dirección, muro público, 🙌→⭐ respetando límites,
// gestión solo dirección con grant de columna.
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

async function token(email: string): Promise<string> {
  const r = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  })
  return ((await r.json()) as { access_token: string }).access_token
}

async function estado() {
  const r = await fetch(`${MOCK}/__test/state`)
  return (await r.json()) as {
    feedback: Record<string, unknown>[]
    estrellas: Record<string, unknown>[]
    personas: { id: string; nombre: string }[]
  }
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('anonimato real: la fila queda SIN autor en BD; y no se puede firmar como otro', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/feedback')

  await page.getByTestId('cat-mejora').click()
  await page.locator('#fb-mensaje').fill('propongo rotar quién lleva el standup')
  await page.locator('#fb-anonimo').check()
  await page.getByTestId('btn-enviar-feedback').click()
  await expect(page.getByTestId('feedback-ok')).toBeVisible()

  const st = await estado()
  const fila = st.feedback.find((f) => f.mensaje === 'propongo rotar quién lleva el standup')!
  expect(fila.es_anonimo).toBe(true)
  expect(fila.autor_id).toBeNull() // doble candado: ni rastro de autoría en BD
  expect(fila.categoria).toBe('mejora')
  expect(fila.es_publico).toBe(false)

  // API directa: intentar FIRMAR como otra persona → RLS 42501
  const tk = await token('antonio@movdi.mx')
  const brendaId = st.personas.find((p) => p.nombre === 'Brenda')!.id
  const spoof = await fetch(`${MOCK}/rest/v1/feedback`, {
    method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoria: 'mejora', mensaje: 'spoof', es_anonimo: false, autor_id: brendaId }),
  })
  expect(spoof.status).toBe(403)

  // y un FIRMADO sin autor (bug de front hipotético) → check constraint 23514
  const sinAutor = await fetch(`${MOCK}/rest/v1/feedback`, {
    method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoria: 'mejora', mensaje: 'firmado sin autor', es_anonimo: false }),
  })
  expect(sinAutor.status).toBe(400)
})

// ------------------------------------------------------------
test('privacidad: mejora/liderazgo NO llegan al equipo (ni por API); dirección sí las ve', async ({ page, browser }) => {
  // antonio manda una mejora firmada
  await login(page, 'antonio@movdi.mx')
  await page.goto('/feedback')
  await page.getByTestId('cat-liderazgo').click()
  await page.locator('#fb-mensaje').fill('necesitamos 1:1 más seguidos')
  await page.getByTestId('btn-enviar-feedback').click()
  await expect(page.getByTestId('feedback-ok')).toBeVisible()

  // karla (head, sin flag): API directa → 0 filas de esa mejora
  const tkKarla = await token('karla@movdi.mx')
  const r = await fetch(`${MOCK}/rest/v1/feedback?select=*`, {
    headers: { Authorization: `Bearer ${tkKarla}`, apikey: 'sb_publishable_test' },
  })
  const rowsKarla = (await r.json()) as Record<string, unknown>[]
  expect(rowsKarla.find((f) => f.mensaje === 'necesitamos 1:1 más seguidos')).toBeUndefined()

  // el autor firmado SÍ ve lo suyo (en su propia sesión)
  const tkAntonio = await token('antonio@movdi.mx')
  const r2 = await fetch(`${MOCK}/rest/v1/feedback?select=*`, {
    headers: { Authorization: `Bearer ${tkAntonio}`, apikey: 'sb_publishable_test' },
  })
  const rowsAntonio = (await r2.json()) as Record<string, unknown>[]
  expect(rowsAntonio.find((f) => f.mensaje === 'necesitamos 1:1 más seguidos')).toBeTruthy()

  // dirección la ve en la bandeja
  const ctx = await browser.newContext()
  const pDani = await ctx.newPage()
  await login(pDani, 'dani@movdi.mx')
  await pDani.goto('/feedback')
  await expect(pDani.getByTestId('bandeja-item').filter({ hasText: 'necesitamos 1:1 más seguidos' })).toBeVisible()
  await ctx.close()
})

// ------------------------------------------------------------
test('🙌 firmado a una persona: muro público para todos + estrella privada', async ({ page, browser }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/feedback')
  await page.getByTestId('cat-reconocimiento').click()
  await page.locator('#fb-para').selectOption('Brenda')
  await page.locator('#fb-mensaje').fill('se aventó el reel en tiempo récord')
  await page.getByTestId('btn-enviar-feedback').click()
  await expect(page.getByTestId('feedback-ok')).toContainText('llevó estrella ⭐')

  // estrella creada con remitente real y límites respetados
  const st = await estado()
  const nueva = st.estrellas.find((e) => e.de_persona === 'Antonio' && e.para_persona === 'Brenda' && String(e.motivo).startsWith('🙌'))
  expect(nueva).toBeTruthy()
  expect(nueva!.semana).toBe(semanaActual())

  // el muro lo ve cualquiera del equipo (karla)
  const ctx = await browser.newContext()
  const pKarla = await ctx.newPage()
  await login(pKarla, 'karla@movdi.mx')
  await pKarla.goto('/feedback')
  const item = pKarla.getByTestId('muro-item').filter({ hasText: 'se aventó el reel' })
  await expect(item).toBeVisible()
  await expect(item).toContainText('de Antonio')
  await expect(item).toContainText('para Brenda')
  await ctx.close()
})

// ------------------------------------------------------------
test('límite 2/semana: el reconocimiento se publica igual pero SIN estrella', async ({ page }) => {
  // antonio quema sus 2 estrellas de la semana por API (RLS del mock las valida)
  const tk = await token('antonio@movdi.mx')
  const sem = semanaActual()
  for (const para of ['Karla', 'Arylene']) {
    const r = await fetch(`${MOCK}/rest/v1/estrellas_colaboracion`, {
      method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ de_persona: 'Antonio', para_persona: para, motivo: 'previa', semana: sem }),
    })
    expect(r.status).toBe(201)
  }
  const antes = (await estado()).estrellas.length

  await login(page, 'antonio@movdi.mx')
  await page.goto('/feedback')
  await page.getByTestId('cat-reconocimiento').click()
  await page.locator('#fb-para').selectOption('Brenda')
  await page.locator('#fb-mensaje').fill('gran apoyo con el cliente')
  await page.getByTestId('btn-enviar-feedback').click()

  // publicado SIN estrella
  await expect(page.getByTestId('feedback-ok')).toBeVisible()
  await expect(page.getByTestId('feedback-ok')).not.toContainText('estrella')
  await expect(page.getByTestId('muro-item').filter({ hasText: 'gran apoyo con el cliente' })).toBeVisible()
  const despues = await estado()
  expect(despues.estrellas.length).toBe(antes) // no se agregó estrella
  expect(despues.feedback.find((f) => f.mensaje === 'gran apoyo con el cliente')).toBeTruthy()
})

// ------------------------------------------------------------
test('bandeja de dirección: resolver + respuesta + compartible → loop público sin autor', async ({ page, browser }) => {
  // antonio manda mejora FIRMADA
  await login(page, 'antonio@movdi.mx')
  await page.goto('/feedback')
  await page.getByTestId('cat-mejora').click()
  await page.locator('#fb-mensaje').fill('el checklist de cierre está desactualizado')
  await page.getByTestId('btn-enviar-feedback').click()
  await expect(page.getByTestId('feedback-ok')).toBeVisible()

  // dani lo resuelve y lo marca compartible
  const ctx = await browser.newContext()
  const pDani = await ctx.newPage()
  await login(pDani, 'dani@movdi.mx')
  await pDani.goto('/feedback')
  const card = pDani.getByTestId('bandeja-item').filter({ hasText: 'checklist de cierre' })
  await expect(card.getByTestId('bandeja-autor')).toContainText('Antonio') // dirección sí ve autor firmado
  await card.locator('select').selectOption('resuelto')
  await card.locator('input[id^="resp-"]').fill('se actualizó el checklist y se publicó en anuncios')
  await card.getByTestId('check-compartible').check()
  await card.getByTestId('btn-guardar-gestion').click()
  await expect(card.getByTestId('btn-guardar-gestion')).toHaveText('guardar ✓')
  await ctx.close()

  // el loop público lo ve el equipo — SIN autor
  await page.reload()
  const loop = page.getByTestId('loop-item').filter({ hasText: 'checklist de cierre' })
  await expect(loop).toBeVisible()
  await expect(loop).toContainText('se actualizó el checklist')
  await expect(loop).not.toContainText('Antonio')

  // y el update directo por API como NO-dirección → 403
  const tk = await token('brenda@movdi.mx')
  const st = await estado()
  const fila = st.feedback.find((f) => f.mensaje === 'el checklist de cierre está desactualizado')!
  const upd = await fetch(`${MOCK}/rest/v1/feedback?id=eq.${fila.id}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado: 'resuelto' }),
  })
  expect(upd.status).toBe(403)
})
