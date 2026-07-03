import { test, expect, type Page } from '@playwright/test'

const MOCK = 'http://127.0.0.1:54321'
const PASS = 'correcta123'
const hoy = () => new Date().toISOString().slice(0, 10)
const dxTest = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(PASS)
  await page.getByRole('button', { name: 'entrar →' }).click()
  await expect(page.getByTestId('user-email')).toHaveText(email)
}

async function irARecurrentes(page: Page) {
  await page.goto('/recurrentes')
  await expect(page.getByRole('heading', { name: /tareas recurrentes/ })).toBeVisible()
}

async function estado() {
  const r = await fetch(`${MOCK}/__test/state`)
  return (await r.json()) as {
    peticiones: Record<string, unknown>[]
    notificaciones: Record<string, unknown>[]
    recurrentes: Record<string, unknown>[]
  }
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('gating de creación: ejecutivo normal no crea; rh crea sin modos admin; ceo ve todo', async ({ page, browser }) => {
  // Brenda (ejecutiva normal): sin botón de crear
  await login(page, 'brenda@movdi.mx')
  await irARecurrentes(page)
  await expect(page.getByTestId('btn-nueva-recurrente')).toHaveCount(0)

  // Sarai (rh): puede crear, pero sin modos admin-only
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'sarai@movdi.mx')
  await irARecurrentes(p2)
  await p2.getByTestId('btn-nueva-recurrente').click()
  await expect(p2.getByText('una persona')).toBeVisible()
  await expect(p2.getByText('solo ejecutivos · admin only')).toHaveCount(0)
  await expect(p2.getByText('todo el equipo · admin only')).toHaveCount(0)
  await expect(p2.getByText('solo heads')).toHaveCount(0) // recurrentes no tiene modo heads
  await ctx.close()

  // Dani (ceo): modos admin visibles
  const ctx2 = await browser.newContext()
  const p3 = await ctx2.newPage()
  await login(p3, 'dani@movdi.mx')
  await irARecurrentes(p3)
  await p3.getByTestId('btn-nueva-recurrente').click()
  await expect(p3.getByText('solo ejecutivos · admin only')).toBeVisible()
  await expect(p3.getByText('todo el equipo · admin only')).toBeVisible()
  await ctx2.close()
})

// ------------------------------------------------------------
test('visibilidad de patrones: admin ve todas; no-admin solo las de sus áreas', async ({ page, browser }) => {
  await login(page, 'dani@movdi.mx')
  await irARecurrentes(page)
  await expect(page.getByTestId('fila-recurrente')).toHaveCount(4)

  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'sarai@movdi.mx') // áreas: [rh]
  await irARecurrentes(p2)
  await expect(p2.getByTestId('fila-recurrente')).toHaveCount(1)
  await expect(p2.getByTestId('fila-recurrente')).toContainText('reporte rh')
  await ctx.close()
})

// ------------------------------------------------------------
test('crear semanal (rh, varias): fila con creado_por derivado, dia_semana y frecuencia', async ({ page }) => {
  await login(page, 'sarai@movdi.mx')
  await irARecurrentes(page)
  await page.getByTestId('btn-nueva-recurrente').click()

  await page.locator('#rec-nombre').fill('checklist onboarding')
  await page.locator('#rec-desc').fill('revisar altas de la semana')
  await page.getByText('varias personas · selección manual').click()
  await page.getByText('Brenda Mora').click()
  await page.locator('#rec-frec').selectOption('semanal')
  await page.locator('#rec-dia').selectOption('3') // miércoles
  await page.getByTestId('btn-crear-rec-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const r = st.recurrentes.find((x) => x.nombre === 'checklist onboarding')!
  expect(r).toBeTruthy()
  expect(r.creado_por).toBe('Sarai') // derivado de la sesión
  expect(r.para).toBe('Brenda')
  expect(r.frecuencia).toBe('semanal')
  expect(r.dia_semana).toBe(3)
  expect(r.dia_mes).toBeNull()
  expect(r.activa).toBe(true)
  // paridad: crear recurrente NO notifica
  expect(st.notificaciones).toHaveLength(0)
})

// ------------------------------------------------------------
test('crear a todo el equipo (ceo): una recurrente independiente por persona', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irARecurrentes(page)
  await page.getByTestId('btn-nueva-recurrente').click()

  await page.locator('#rec-nombre').fill('bitácora mensual')
  await page.getByText('todo el equipo · admin only').click()
  await page.locator('#rec-frec').selectOption('mensual')
  await page.locator('#rec-dia').selectOption('28')
  await page.getByTestId('btn-crear-rec-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const filas = st.recurrentes.filter((x) => x.nombre === 'bitácora mensual')
  expect(filas.map((f) => f.para).sort()).toEqual(['Antonio', 'Arylene', 'Brenda', 'Karla', 'Sarai'])
  expect(filas.every((f) => f.creado_por === 'Dani' && f.dia_mes === 28 && f.frecuencia === 'mensual')).toBe(true)
})

// ------------------------------------------------------------
test('generación de instancias: virtual HOY, materializa al entregar y avanza +7d', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await irARecurrentes(page)

  // rec-2 (semanal, dia_semana = hoy) → instancia virtual con fecha HOY
  const card = page.getByTestId('card-instancia').filter({ hasText: 'standup semanal' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('próxima del patrón') // virtual
  await expect(card).toContainText(hoy())

  // entregar con evidencia → materializa fila entregada
  await card.getByTestId('btn-entregar-instancia').click()
  await page.locator('#ent-link').fill('https://drive.movdi.mx/minuta')
  await page.getByTestId('btn-entrega-inst-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const fila = st.peticiones.find((x) => x.origen_recur === 'rec-2')!
  expect(fila).toBeTruthy()
  expect(fila.estatus).toBe('entregado')
  expect(fila.fecha).toBe(hoy())
  expect(fila.fecha_entrega).toBe(hoy())
  expect(fila.creado_por).toBe('Dani') // el creador del patrón, no quien entrega
  expect(fila.para).toBe('Antonio')
  expect(fila.link_entrega).toBe('https://drive.movdi.mx/minuta')
  // paridad: materializar por entrega NO notifica
  expect(st.notificaciones).toHaveLength(0)

  // el motor avanza a la siguiente ocurrencia (+7 días), de nuevo virtual
  const cardNueva = page.getByTestId('card-instancia').filter({ hasText: 'standup semanal' })
  await expect(cardNueva).toContainText(dxTest(7))
  await expect(cardNueva).toContainText('próxima del patrón')
})

// ------------------------------------------------------------
test('mover próxima instancia VIRTUAL (rama insert): materializa pendiente movida sin fantasma', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irARecurrentes(page)

  // desde la tabla de patrones, mover la próxima de rec-2 (virtual, fecha hoy)
  const fila = page.getByTestId('fila-recurrente').filter({ hasText: 'standup semanal' })
  await fila.getByTestId('btn-mover-proxima').click()
  await expect(page.getByText('(aún virtual — se materializa al moverla)')).toBeVisible()

  await page.locator('#mi-fecha').fill(dxTest(4))
  await page.locator('#mi-motivo').fill('Antonio está en el offsite del cliente')
  await page.getByTestId('btn-mover-inst-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const inst = st.peticiones.find((x) => x.origen_recur === 'rec-2')!
  expect(inst).toBeTruthy()
  expect(inst.estatus).toBe('pendiente')
  expect(inst.fecha).toBe(dxTest(4))
  expect(inst.fecha_original).toBe(hoy()) // la fecha del patrón que se movió
  expect(inst.motivo_cambio_fecha).toBe('Antonio está en el offsite del cliente')
  expect(inst.extension_justificada).toBe(true)
  expect(inst.cambio_visto_por_creador).toBe(true)
  expect(inst.creado_por).toBe('Dani')

  // notificación fecha_cambiada al destinatario, generada en el servidor
  const notif = st.notificaciones.find((n) => n.tipo === 'fecha_cambiada')!
  expect(notif.para).toBe('Antonio')
  expect(notif.titulo).toContain('Dani movió tu entrega de "standup semanal"')

  // el destinatario ve UNA sola instancia (la movida) — sin virtual fantasma
  const ctx = await page.context().browser()!.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'antonio@movdi.mx')
  await irARecurrentes(p2)
  const cards = p2.getByTestId('card-instancia').filter({ hasText: 'standup semanal' })
  await expect(cards).toHaveCount(1)
  await expect(cards).toContainText('instancia programada') // real, ya no virtual
  await expect(cards).toContainText('movida · Antonio está en el offsite del cliente')
  await ctx.close()
})

// ------------------------------------------------------------
test('quincenal REAL: instancia hoy (ancla -14d), al entregar avanza +14 (no +7)', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await irARecurrentes(page)

  const card = page.getByTestId('card-instancia').filter({ hasText: 'objetivos digital' })
  await expect(card).toBeVisible()
  await expect(card).toContainText(hoy()) // (hoy - ancla) = 14 → toca hoy

  await card.getByTestId('btn-entregar-instancia').click()
  await page.getByTestId('btn-entrega-inst-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // el motor avanza CATORCE días, no siete
  const cardNueva = page.getByTestId('card-instancia').filter({ hasText: 'objetivos digital' })
  await expect(cardNueva).toContainText(dxTest(14))
  await expect(cardNueva).not.toContainText(dxTest(7))
})

// ------------------------------------------------------------
test('crear quincenal: date picker de primera entrega; fecha_inicio y dia_semana derivado', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irARecurrentes(page)
  await page.getByTestId('btn-nueva-recurrente').click()

  const primera = dxTest(3)
  await page.locator('#rec-nombre').fill('corte quincenal admi')
  await page.getByText('varias personas · selección manual').click()
  await page.getByText('Brenda Mora').click()
  await page.locator('#rec-frec').selectOption('quincenal')
  await expect(page.locator('#rec-dia')).toHaveCount(0) // sin selector de día: es date picker
  await page.locator('#rec-fecha-inicio').fill(primera)
  await page.getByTestId('btn-crear-rec-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const r = st.recurrentes.find((x) => x.nombre === 'corte quincenal admi')!
  expect(r.frecuencia).toBe('quincenal')
  expect(r.fecha_inicio).toBe(primera)
  expect(r.dia_semana).toBe(new Date(primera + 'T00:00:00Z').getUTCDay()) // derivado del ancla
  expect(r.creado_por).toBe('Dani')
})

// ------------------------------------------------------------
test('pausar/activar y eliminar: admin no-creador puede (policy creador o ceo|head)', async ({ page }) => {
  await login(page, 'dani@movdi.mx') // ceo, NO creó rec-3 (la creó Sarai)
  await irARecurrentes(page)

  const fila = page.getByTestId('fila-recurrente').filter({ hasText: 'reporte rh' })
  await fila.getByTestId('btn-toggle-recurrente').click()
  await expect(fila.getByText('pausada')).toBeVisible()
  let st = await estado()
  expect((st.recurrentes.find((r) => r.id === 'rec-3'))!.activa).toBe(false)

  page.on('dialog', (d) => d.accept())
  await fila.getByTestId('btn-eliminar-recurrente').click()
  await expect(page.getByTestId('fila-recurrente').filter({ hasText: 'reporte rh' })).toHaveCount(0)
  st = await estado()
  expect(st.recurrentes.find((r) => r.id === 'rec-3')).toBeUndefined()
})

// ------------------------------------------------------------
test('paridad de pausa: una recurrente pausada no genera instancias', async ({ page }) => {
  // pausar rec-2 directamente en el estado (simulando patrón pausado)
  await login(page, 'dani@movdi.mx')
  await irARecurrentes(page)
  const fila = page.getByTestId('fila-recurrente').filter({ hasText: 'standup semanal' })
  await fila.getByTestId('btn-toggle-recurrente').click()
  await expect(fila.getByText('pausada')).toBeVisible()

  const ctx = await page.context().browser()!.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'antonio@movdi.mx')
  await irARecurrentes(p2)
  await expect(p2.getByTestId('card-instancia').filter({ hasText: 'standup semanal' })).toHaveCount(0)
  await ctx.close()
})
