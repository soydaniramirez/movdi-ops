import { test, expect, type Page } from '@playwright/test'

// RH gestiona personas (2026-10-19): alta + edición con candados, y el
// organigrama se baja en PDF. Sarai = nivel rh en el mock.
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
  return (await r.json()) as { personas: Record<string, unknown>[]; invites: string[] }
}

const card = (page: Page, nombre: string) =>
  page.getByTestId('card-persona').filter({ hasText: nombre })

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

test('RH entra a equipo, ve a todo el equipo y da de alta con invite', async ({ page }) => {
  await login(page, 'sarai@movdi.mx')
  await expect(page.getByRole('link', { name: 'equipo' })).toBeVisible()
  await page.goto('/equipo')
  await expect(page).toHaveURL(/\/equipo$/)
  await expect(page.getByRole('heading', { name: /equipo/, level: 1 })).toBeVisible()
  // RH ve a todas las personas activas (no solo "su equipo")
  await expect(card(page, 'Antonio López')).toBeVisible()
  await expect(card(page, 'Dani Ramírez')).toBeVisible()

  await page.getByTestId('btn-agregar-persona').click()
  // la opción dirección no le aparece
  await expect(page.locator('#per-nivel option[value="ceo"]')).toHaveCount(0)
  await expect(page.locator('#per-nivel option')).toHaveText(['ejecutivo', 'head', 'RH'])
  await page.locator('#per-nombre').fill('Rocío')
  await page.locator('#per-apellido').fill('Nueva')
  await page.locator('#per-rol').fill('diseño')
  await page.locator('#per-email').fill('rocio@movdi.mx')
  await page.locator('#per-area').selectOption('digital')
  await page.locator('#per-nivel').selectOption('head')
  await page.getByTestId('btn-guardar-persona').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const p = st.personas.find((x) => x.nombre === 'Rocío')!
  expect(p.nivel).toBe('head')
  expect(p.email).toBe('rocio@movdi.mx')
  expect(st.invites).toContain('rocio@movdi.mx')
  expect(p.auth_user_id).toBeTruthy() // vínculo hecho con la sesión de RH
})

test('RH edita a alguien, pero no a dirección ni a sí misma; sin pausar ni baja', async ({ page }) => {
  await login(page, 'sarai@movdi.mx')
  await page.goto('/equipo')
  await expect(card(page, 'Antonio López')).toBeVisible()

  // dirección y su propia ficha: sin botón editar
  await expect(card(page, 'Dani Ramírez').getByTestId('btn-editar-persona')).toHaveCount(0)
  await expect(card(page, 'Sarai Luna').getByTestId('btn-editar-persona')).toHaveCount(0)
  // pausar / desactivar siguen siendo de dirección
  await expect(page.getByTestId('btn-pausar')).toHaveCount(0)
  await expect(page.getByTestId('btn-desactivar')).toHaveCount(0)

  await card(page, 'Antonio López').getByTestId('btn-editar-persona').click()
  await page.locator('#per-rol').fill('project manager sr')
  await page.locator('#per-nivel').selectOption('rh')
  await page.getByTestId('btn-guardar-persona').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const a = (await estado()).personas.find((x) => x.nombre === 'Antonio')!
  expect(a.rol).toBe('project manager sr')
  expect(a.nivel).toBe('rh')
})

test('RH no puede volver dirección a nadie aunque fuerce el select (candado de servidor)', async ({ page }) => {
  await login(page, 'sarai@movdi.mx')
  await page.goto('/equipo')
  await card(page, 'Arylene Ruiz').getByTestId('btn-editar-persona').click()
  // inyecta la opción oculta: el servidor debe rechazarla igual
  await page.locator('#per-nivel').evaluate((el) => {
    const o = document.createElement('option'); o.value = 'ceo'; o.textContent = 'dirección'
    el.appendChild(o)
  })
  await page.locator('#per-nivel').selectOption('ceo')
  await page.getByTestId('btn-guardar-persona').click()
  await expect(page.getByRole('alert').filter({ hasText: 'RH no puede poner a nadie con nivel dirección' })).toBeVisible()
  const ar = (await estado()).personas.find((x) => x.nombre === 'Arylene')!
  expect(ar.nivel).toBe('ejecutivo')

  // y el alta con nivel dirección tampoco pasa
  await page.getByRole('button', { name: 'cancelar' }).click()
  await page.getByTestId('btn-agregar-persona').click()
  await page.locator('#per-nombre').fill('Colado')
  await page.locator('#per-apellido').fill('X')
  await page.locator('#per-rol').fill('x')
  await page.locator('#per-email').fill('colado@movdi.mx')
  await page.locator('#per-nivel').evaluate((el) => {
    const o = document.createElement('option'); o.value = 'ceo'; o.textContent = 'dirección'
    el.appendChild(o)
  })
  await page.locator('#per-nivel').selectOption('ceo')
  await page.getByTestId('btn-guardar-persona').click()
  await expect(page.getByRole('alert').filter({ hasText: 'RH no puede dar de alta a alguien con nivel dirección' })).toBeVisible()
  expect((await estado()).personas.find((x) => x.nombre === 'Colado')).toBeUndefined()
})

test('RLS simulada: RH no escribe filas de dirección ni la suya por API directa', async ({ page }) => {
  await login(page, 'sarai@movdi.mx')
  // token de la sesión real del navegador (cookie de @supabase/ssr)
  const cookies = await page.context().cookies()
  const raw = cookies.filter((c) => c.name.includes('auth-token')).sort((x, y) => x.name.localeCompare(y.name)).map((c) => c.value).join('')
  const sesion = JSON.parse(Buffer.from(raw.replace(/^base64-/, ''), 'base64').toString())
  const h = { apikey: 'sb_publishable_test', Authorization: `Bearer ${sesion.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }

  const patch = (id: string, body: object) =>
    fetch(`${MOCK}/rest/v1/personas?id=eq.${id}`, { method: 'PATCH', headers: h, body: JSON.stringify(body) })
  const st = await estado()
  const id = (n: string) => String(st.personas.find((x) => x.nombre === n)!.id)

  // fila de dirección → 0 filas tocadas
  expect(await (await patch(id('Dani'), { rol: 'hackeado' })).json()).toEqual([])
  // su propia fila → 0 filas
  expect(await (await patch(id('Sarai'), { nivel: 'ceo' })).json()).toEqual([])
  // volver dirección a otra persona → rechazado por el WITH CHECK
  expect((await patch(id('Antonio'), { es_direccion: true })).status).toBe(403)
  expect((await patch(id('Antonio'), { nivel: 'ceo' })).status).toBe(403)
  const fin = await estado()
  expect(fin.personas.find((x) => x.nombre === 'Dani')!.rol).not.toBe('hackeado')
  expect(fin.personas.find((x) => x.nombre === 'Sarai')!.nivel).toBe('rh')
  expect(fin.personas.find((x) => x.nombre === 'Antonio')!.es_direccion).toBe(false)
})

test('organigrama: "descargar pdf" imprime en blanco con fecha de generación', async ({ page }) => {
  await login(page, 'sarai@movdi.mx')
  await page.goto('/organigrama')
  await expect(page.getByTestId('org-card').first()).toBeVisible()
  // stub de window.print para poder revisar el estado de impresión
  await page.evaluate(() => {
    (window as unknown as { __prints: number }).__prints = 0
    window.print = () => { (window as unknown as { __prints: number }).__prints++ }
  })
  await page.getByTestId('btn-descargar-pdf').click()
  expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1)
  await expect(page.locator('body')).toHaveClass(/imprimiendo-org/)
  await expect(page.getByTestId('org-fecha-pdf')).toHaveText(/^generado el \d+ de .+ de \d{4}/)

  await page.emulateMedia({ media: 'print' })
  // fondo blanco en impresión y sin la barra de navegación
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)')
  await expect(page.getByRole('link', { name: 'peticiones' })).toBeHidden()
  await expect(page.getByTestId('btn-descargar-pdf')).toBeHidden()
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
  if (process.env.ORG_PDF_OUT) {
    const fs = await import('node:fs')
    fs.writeFileSync(process.env.ORG_PDF_OUT, pdf)
  }
})
