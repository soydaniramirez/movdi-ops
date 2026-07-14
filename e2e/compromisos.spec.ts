import { test, expect, type Page } from '@playwright/test'

// Fase compromisos: auto-asignación ("✋ nuevo compromiso"), privada forzada
// a false, origen obligatorio, badge de atorada y panel "qué está atorado".

const MOCK = 'http://127.0.0.1:54321'
const PASS = 'correcta123'

const dx = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(PASS)
  await page.getByRole('button', { name: 'entrar →' }).click()
  await expect(page.getByTestId('user-email')).toHaveText(email)
}

async function irAPeticiones(page: Page) {
  await page.goto('/peticiones')
  await expect(page.getByRole('heading', { name: 'peticiones' })).toBeVisible()
}

async function estado() {
  const r = await fetch(`${MOCK}/__test/state`)
  return (await r.json()) as { peticiones: Record<string, unknown>[]; notificaciones: Record<string, unknown>[] }
}

// token directo contra el mock (para seeds con timestamps en el pasado)
async function tokenDe(email: string) {
  const r = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST', body: JSON.stringify({ email, password: PASS }),
  })
  return ((await r.json()) as { access_token: string }).access_token
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('crear compromiso: se auto-asigna, privada=false forzada, origen guardado, sin notificación', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await irAPeticiones(page)
  const notifAntes = (await estado()).notificaciones.length

  await page.getByTestId('btn-nuevo-compromiso').click()
  // NO existe el toggle de privada en el modal de compromiso
  await expect(page.locator('#pet-privada')).toHaveCount(0)
  await expect(page.getByText('petición privada')).toHaveCount(0)

  await page.locator('#comp-nombre').fill('contrato talento nuevo')
  await page.locator('#comp-desc').fill('nació en el grupo de whatsapp')

  // origen obligatorio: sin elegirlo no se crea
  await page.getByTestId('btn-compromiso-confirmar').click()
  await expect(page.getByRole('alert').filter({ hasText: 'de dónde nace' })).toBeVisible()

  await page.getByTestId('comp-origen').selectOption('talento')
  await page.getByTestId('btn-compromiso-confirmar').click()

  // aparece en "mis pendientes" como compromiso propio
  await page.getByRole('button', { name: 'mis pendientes' }).click()
  const fila = page.getByTestId('card-peticion').filter({ hasText: 'contrato talento nuevo' })
  await expect(fila).toBeVisible()
  await expect(fila.getByTestId('tag-compromiso')).toContainText('compromiso de')
  await expect(fila.getByTestId('tag-origen')).toContainText('talento')

  const st = await estado()
  const creada = st.peticiones.find((p) => p.nombre === 'contrato talento nuevo')!
  expect(creada.creado_por).toBe('Antonio') // solicitante = asignado, derivado de la sesión
  expect(creada.para).toBe('Antonio')
  expect(creada.privada).toBe(false)        // forzada en servidor
  expect(creada.origen).toBe('talento')
  expect(st.notificaciones.length).toBe(notifAntes) // nadie se notifica a sí mismo
})

// ------------------------------------------------------------
test('panel "qué está atorado": head ve la tarea atorada de su equipo; ejecutivo no ve la pestaña', async ({ page, browser }) => {
  // seed: Karla (head) creó hace 14 días una petición para Brenda (su equipo
  // directo) y nadie la ha movido → atorada (10 días hábiles sin movimiento)
  const tok = await tokenDe('karla@movdi.mx')
  const hace14 = new Date(Date.now() - 14 * 86400e3).toISOString()
  await fetch(`${MOCK}/rest/v1/peticiones`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      zona: 'general', nombre: 'guion campaña atorada', creado_por: 'Karla', para: 'Brenda',
      area: 'digital', fecha: dx(2), prioridad: 'media', estatus: 'pendiente', privada: false,
      origen: 'cliente', created_at: hace14, updated_at: hace14,
    }),
  })

  await login(page, 'karla@movdi.mx')
  await irAPeticiones(page)
  await page.getByRole('button', { name: 'qué está atorado' }).click()

  const grupo = page.getByTestId('grupo-atorado').filter({ hasText: 'Brenda' })
  await expect(grupo).toBeVisible()
  const filaAtorada = grupo.getByTestId('fila-atorada').filter({ hasText: 'guion campaña atorada' })
  await expect(filaAtorada).toBeVisible()
  await expect(filaAtorada).toContainText('atorada')
  await expect(filaAtorada).toContainText('cliente')
  await expect(filaAtorada).toContainText('hábiles') // días sin movimiento

  // la tabla del tablero también marca la atorada en rojo (para quien la ve)
  await page.getByRole('button', { name: 'general' }).click()
  await expect(
    page.getByTestId('card-peticion').filter({ hasText: 'guion campaña atorada' }).getByTestId('badge-atorada'),
  ).toBeVisible()

  // ejecutivo: sin pestaña de atorados
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'antonio@movdi.mx')
  await irAPeticiones(p2)
  await expect(p2.getByRole('button', { name: 'qué está atorado' })).toHaveCount(0)
  await ctx.close()
})

// ------------------------------------------------------------
test('nota de avance: limpia la atorada sin cambiar estatus (y cuenta como movimiento)', async ({ page }) => {
  // seed: tarea de Dani para Antonio sin movimiento hace 14 días → atorada
  const tok = await tokenDe('dani@movdi.mx')
  const hace14 = new Date(Date.now() - 14 * 86400e3).toISOString()
  await fetch(`${MOCK}/rest/v1/peticiones`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'p-bloqueada', zona: 'general', nombre: 'contrato bloqueado por cliente',
      creado_por: 'Dani', para: 'Antonio', area: 'pm', fecha: dx(9), prioridad: 'media',
      estatus: 'pendiente', privada: false, created_at: hace14, updated_at: hace14,
    }),
  })

  await login(page, 'antonio@movdi.mx')
  await irAPeticiones(page)
  await page.getByRole('button', { name: 'mis pendientes' }).click()
  const fila = page.getByTestId('card-peticion').filter({ hasText: 'contrato bloqueado por cliente' })
  await expect(fila.getByTestId('badge-atorada')).toBeVisible()

  // + nota: no toca estatus, pero es movimiento real → deja de estar atorada
  await fila.getByTestId('btn-nota-avance').click()
  await page.locator('#nota-avance').fill('mandé segundo recordatorio al cliente, sigo en espera')
  await page.getByTestId('btn-nota-confirmar').click()

  await expect(fila.getByTestId('badge-atorada')).toHaveCount(0)
  await expect(fila).toContainText('⏱ avance')
  await expect(fila).toContainText('sigo en espera')

  const st = await estado()
  const row = st.peticiones.find((p) => p.id === 'p-bloqueada')!
  expect(row.estatus).toBe('pendiente') // el estatus NO cambió
  expect(String(row.descripcion)).toContain('Antonio): mandé segundo recordatorio')
  expect((row.updated_at as string) > hace14).toBe(true) // sí contó como movimiento
})

// ------------------------------------------------------------
test('último movimiento: ocultar de mi vista NO resetea el contador; cambiar estatus sí lo mueve', async ({ page }) => {
  // seed como Dani: petición vieja para Antonio (7 días sin movimiento)
  const tok = await tokenDe('dani@movdi.mx')
  const hace7 = new Date(Date.now() - 7 * 86400e3).toISOString()
  await fetch(`${MOCK}/rest/v1/peticiones`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'p-vieja-mov', zona: 'general', nombre: 'entrega dormida', creado_por: 'Dani', para: 'Antonio',
      area: 'pm', fecha: dx(10), prioridad: 'media', estatus: 'entregado', privada: false,
      created_at: hace7, updated_at: hace7,
    }),
  })

  await login(page, 'antonio@movdi.mx')
  await irAPeticiones(page)
  await page.getByRole('button', { name: 'mis pendientes' }).click()
  const fila = page.getByTestId('card-peticion').filter({ hasText: 'entrega dormida' })

  // ocultarla de mi vista (update de oculta_para) → updated_at intacto
  await fila.getByTestId('btn-ocultar').click()
  await expect(fila).toHaveCount(0) // esperar a que la acción termine y recargue
  let st = await estado()
  expect(st.peticiones.find((p) => p.id === 'p-vieja-mov')!.updated_at).toBe(hace7)

  // reabrirla (cambio de estatus = movimiento real) → updated_at avanza
  await page.getByTestId('btn-toggle-ocultas').click()
  await fila.getByRole('button', { name: 'reabrir' }).click()
  await expect(fila.getByRole('button', { name: 'entregar ✓' })).toBeVisible() // ya quedó pendiente
  st = await estado()
  const upd = st.peticiones.find((p) => p.id === 'p-vieja-mov')!.updated_at as string
  expect(upd > hace7).toBe(true)
})
