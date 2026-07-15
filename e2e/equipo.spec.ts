import { test, expect, type Page } from '@playwright/test'

const MOCK = 'http://127.0.0.1:54321'
const PASS = 'correcta123'
const dxTest = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(PASS)
  await page.getByRole('button', { name: 'entrar →' }).click()
  await expect(page.getByTestId('user-email')).toHaveText(email)
}

async function irAEquipo(page: Page) {
  await page.goto('/equipo')
  await expect(page.getByRole('heading', { name: /equipo/, level: 1 })).toBeVisible()
}

async function estado() {
  const r = await fetch(`${MOCK}/__test/state`)
  return (await r.json()) as {
    personas: Record<string, unknown>[]
    peticiones: Record<string, unknown>[]
    recurrentes: Record<string, unknown>[]
    invites: string[]
  }
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('gating 4.14: ejecutivo NO entra a /equipo (redirect a home) ni ve la pestaña', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/equipo')
  // redirigido a home, sin mensaje de "no acceso"
  await expect(page.getByTestId('user-email')).toHaveText('antonio@movdi.mx')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('card-persona')).toHaveCount(0)
  // la nav no ofrece equipo ni rh
  await expect(page.getByRole('link', { name: 'equipo' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'rh', exact: true })).toHaveCount(0)
})

// ------------------------------------------------------------
test('alta completa: payload correcto + INVITE automático con service key', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irAEquipo(page)
  await page.getByTestId('btn-agregar-persona').click()

  await page.locator('#per-nombre').fill('Pepe')
  await page.locator('#per-apellido').fill('Nuevo')
  await page.locator('#per-rol').fill('legal ops')
  await page.locator('#per-email').fill('Pepe@movdi.mx') // se normaliza a lowercase
  await page.locator('#per-area').selectOption('legal')
  await page.locator('#per-nivel').selectOption('ejecutivo')
  await page.locator('#per-manager-principal').selectOption('Karla')
  // marca a Karla también como apoyo (el servidor debe excluirla por ser principal)
  const dlg = page.getByRole('dialog')
  await dlg.locator('label').filter({ hasText: 'Karla Vega' }).locator('input[type=checkbox]').check()
  await dlg.locator('label').filter({ hasText: 'Emmanuel Soto' }).locator('input[type=checkbox]').check()
  await page.getByTestId('btn-guardar-persona').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const p = st.personas.find((x) => x.nombre === 'Pepe')!
  expect(p).toBeTruthy()
  expect(p.email).toBe('pepe@movdi.mx')
  expect(p.areas).toEqual(['legal'])
  expect(p.nivel).toBe('ejecutivo')
  expect(p.needs_pass).toBe(false)
  expect(p.manager_principal).toBe('Karla')
  expect(p.managers).toEqual(['Emmanuel']) // Karla excluida server-side por ser principal

  // invite disparado con la SERVICE key (el mock la exige) y el email correcto
  expect(st.invites).toContain('pepe@movdi.mx')
  // y el vínculo auth ↔ persona queda hecho DESDE el alta (bug Valeria
  // 2026-07-15): sin esperar el primer login, mi_nombre() ya funciona
  expect(p.auth_user_id).toBeTruthy()
})

// ------------------------------------------------------------
test('alta nivel RH: áreas [area, rh] y needs_pass (paridad SPA)', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irAEquipo(page)
  await page.getByTestId('btn-agregar-persona').click()
  await page.locator('#per-nombre').fill('Rita')
  await page.locator('#per-apellido').fill('Recursos')
  await page.locator('#per-rol').fill('rh generalista')
  await page.locator('#per-email').fill('rita@movdi.mx')
  await page.locator('#per-area').selectOption('admi')
  await page.locator('#per-nivel').selectOption('rh')
  await page.getByTestId('btn-guardar-persona').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const p = st.personas.find((x) => x.nombre === 'Rita')!
  expect(p.areas).toEqual(['admi', 'rh'])
  expect(p.needs_pass).toBe(true)
  expect(st.invites).toContain('rita@movdi.mx')
})

// ------------------------------------------------------------
test('invite degradado con gracia: email ya existente en Auth no duplica', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irAEquipo(page)
  await page.getByTestId('btn-agregar-persona').click()
  await page.locator('#per-nombre').fill('Ex')
  await page.locator('#per-apellido').fill('Empleado')
  await page.locator('#per-rol').fill('freelance')
  await page.locator('#per-email').fill('exempleado@movdi.mx') // existe en Auth, no en personas
  await page.getByTestId('btn-guardar-persona').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // la persona se creó, el invite NO se duplicó, y hay aviso claro
  const st = await estado()
  expect(st.personas.find((x) => x.nombre === 'Ex')).toBeTruthy()
  expect(st.invites).not.toContain('exempleado@movdi.mx')
  await expect(page.getByTestId('nota-equipo')).toContainText('ya tenía cuenta en Auth')
})

// ------------------------------------------------------------
test('edición: payload actualizado y principal excluido de apoyo', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irAEquipo(page)
  const card = page.getByTestId('card-persona').filter({ hasText: 'Antonio' })
  await card.getByTestId('btn-editar-persona').click()

  await page.locator('#per-rol').fill('sr project manager')
  // Antonio: principal Dani, apoyo [Karla] → cambiar principal a Karla
  await page.locator('#per-manager-principal').selectOption('Karla')
  await page.getByTestId('btn-guardar-persona').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const p = st.personas.find((x) => x.nombre === 'Antonio')!
  expect(p.rol).toBe('sr project manager')
  expect(p.manager_principal).toBe('Karla')
  expect(p.managers).toEqual([]) // Karla salió de apoyo al volverse principal
})

// ------------------------------------------------------------
test('pausar y reanudar', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irAEquipo(page)
  const hasta = dxTest(30)
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? hasta : undefined))

  await page.getByTestId('card-persona').filter({ hasText: 'Brenda' }).getByTestId('btn-pausar').click()
  // la card sale del filtro 'activas' cuando la action + recarga terminan
  await expect(page.getByTestId('card-persona').filter({ hasText: 'Brenda' })).toHaveCount(0)
  let st = await estado()
  expect((st.personas.find((x) => x.nombre === 'Brenda'))!.pausada_hasta).toBe(hasta)

  // aparece bajo el filtro pausadas, con botón reanudar
  await page.getByRole('button', { name: 'pausadas' }).click()
  const card = page.getByTestId('card-persona').filter({ hasText: 'Brenda' })
  await expect(card).toContainText(`pausada hasta ${hasta}`)
  await card.getByTestId('btn-reanudar').click()
  await expect(page.getByTestId('card-persona').filter({ hasText: 'Brenda' })).toHaveCount(0) // sale de 'pausadas'
  st = await estado()
  expect((st.personas.find((x) => x.nombre === 'Brenda'))!.pausada_hasta).toBeNull()
})

// ------------------------------------------------------------
test('desactivar sin tareas activas: directo con confirmación, y reactivar', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irAEquipo(page)
  page.on('dialog', (d) => d.accept())

  // Sarai no tiene peticiones ni recurrentes asignadas a ella
  await page.getByTestId('card-persona').filter({ hasText: 'Sarai' }).getByTestId('btn-desactivar').click()
  await expect(page.getByTestId('card-persona').filter({ hasText: 'Sarai' })).toHaveCount(0) // sale de 'activas'
  let st = await estado()
  expect((st.personas.find((x) => x.nombre === 'Sarai'))!.activo).toBe(false)

  await page.getByRole('button', { name: 'inactivas' }).click()
  await page.getByTestId('card-persona').filter({ hasText: 'Sarai' }).getByTestId('btn-reactivar').click()
  await expect(page.getByTestId('card-persona').filter({ hasText: 'Sarai' })).toHaveCount(0) // sale de 'inactivas'
  st = await estado()
  expect((st.personas.find((x) => x.nombre === 'Sarai'))!.activo).toBe(true)
})

// ------------------------------------------------------------
test('desactivar CON reasignación: peticiones y recurrentes pasan al destino elegido', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irAEquipo(page)

  // Antonio tiene 2 peticiones activas (p-seed-1/2) y 4 recurrentes activas
  await page.getByTestId('card-persona').filter({ hasText: 'Antonio' }).getByTestId('btn-desactivar').click()
  await expect(page.getByText('requiere reasignación')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('2')
  await expect(page.getByRole('dialog')).toContainText('4')

  await page.locator('#reasign-pet').selectOption('Arylene')
  await page.locator('#reasign-rec').selectOption('Brenda')
  await page.getByTestId('btn-reasign-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  expect((st.peticiones.find((x) => x.id === 'p-seed-1'))!.para).toBe('Arylene')
  expect((st.peticiones.find((x) => x.id === 'p-seed-2'))!.para).toBe('Arylene')
  expect(st.recurrentes.filter((r) => r.para === 'Brenda')).toHaveLength(4)
  expect((st.personas.find((x) => x.nombre === 'Antonio'))!.activo).toBe(false)
})

// ------------------------------------------------------------
test('ATOMICIDAD: si falla la desactivación, TODO se revierte y la persona sigue activa', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irAEquipo(page)

  // inyectar fallo en la RPC transaccional (equivale a un raise en Postgres:
  // la transacción entera se revierte, nada muta)
  await fetch(`${MOCK}/__test/fallar`, {
    method: 'POST',
    body: JSON.stringify({ tabla: 'rpc/desactivar_persona_con_reasignacion', metodo: 'POST' }),
  })

  await page.getByTestId('card-persona').filter({ hasText: 'Antonio' }).getByTestId('btn-desactivar').click()
  await page.locator('#reasign-pet').selectOption('Arylene')
  await page.locator('#reasign-rec').selectOption('Brenda')
  await page.getByTestId('btn-reasign-confirmar').click()

  // error visible y NADA quedó aplicado
  await expect(page.locator('p[role="alert"]').first()).toContainText('nada quedó desactivado')

  const st = await estado()
  expect((st.personas.find((x) => x.nombre === 'Antonio'))!.activo).toBe(true) // NO desactivado
  expect((st.peticiones.find((x) => x.id === 'p-seed-1'))!.para).toBe('Antonio') // revertido
  expect((st.peticiones.find((x) => x.id === 'p-seed-2'))!.para).toBe('Antonio') // revertido
  expect(st.recurrentes.filter((r) => r.para === 'Antonio')).toHaveLength(4) // revertido
})

// ------------------------------------------------------------
test('semáforo: dirección ve directos+resto; head ve directos+soy apoyo; ejecutivo nada', async ({ page, browser }) => {
  await login(page, 'dani@movdi.mx')
  await irAEquipo(page)
  const sem = page.getByTestId('semaforo')
  await expect(sem.getByText('mi equipo directo')).toBeVisible()
  await expect(sem.getByText('resto del equipo')).toBeVisible()
  // directos de Dani: Antonio y Arylene (manager_principal = Dani)
  await expect(sem.getByTestId('semaforo-item').filter({ hasText: 'Antonio' })).toBeVisible()
  await expect(sem.getByTestId('semaforo-item').filter({ hasText: 'Arylene' })).toBeVisible()

  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'karla@movdi.mx') // head: Brenda directa, Antonio en apoyo
  await irAEquipo(p2)
  await expect(p2.getByTestId('semaforo').getByText('mi equipo directo')).toBeVisible()
  await expect(p2.getByTestId('semaforo').getByText('🤝 soy apoyo')).toBeVisible()
  await ctx.close()

  const ctx2 = await browser.newContext()
  const p3 = await ctx2.newPage()
  await login(p3, 'antonio@movdi.mx') // ejecutivo: 4.14 → redirect a home
  await p3.goto('/equipo')
  await expect(p3).toHaveURL(/\/$/)
  await expect(p3.getByTestId('semaforo')).toHaveCount(0)
  await ctx2.close()
})

// ------------------------------------------------------------
test('panel RH: acceso por nivel verificado en servidor (rh y dirección sí; ejecutivo no)', async ({ page, browser }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/rh')
  // 4.14: sin pantalla de "no acceso" — redirect directo a home
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('rh-titulo')).toHaveCount(0)

  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'sarai@movdi.mx') // nivel rh
  await p2.goto('/rh')
  await expect(p2.getByTestId('rh-titulo')).toBeVisible()
  await ctx.close()

  const ctx2 = await browser.newContext()
  const p3 = await ctx2.newPage()
  await login(p3, 'dani@movdi.mx') // dirección
  await p3.goto('/rh')
  await expect(p3.getByTestId('rh-titulo')).toBeVisible()
  await ctx2.close()
})

// ------------------------------------------------------------
test('REASIGNACIÓN DE TERCEROS (hallazgo 4.6): la RPC reasigna peticiones que el admin no creó', async ({ page }) => {
  // p-seed-3: creada por ANTONIO para Brenda. Dani (dirección) no es creadora
  // ni destinataria → la RLS peticiones_update se lo impediría; la RPC
  // SECURITY DEFINER debe poder reasignarla igual. (4.14: la gestión quedó
  // solo en dirección, por eso el flujo corre como Dani.)
  await login(page, 'dani@movdi.mx')
  await irAEquipo(page)

  await page.getByTestId('card-persona').filter({ hasText: 'Brenda' }).getByTestId('btn-desactivar').click()
  await expect(page.getByText('requiere reasignación')).toBeVisible()
  await page.locator('#reasign-pet').selectOption('Arylene')
  await page.getByTestId('btn-reasign-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  expect((st.peticiones.find((x) => x.id === 'p-seed-3'))!.para).toBe('Arylene') // fila de un tercero, reasignada
  expect((st.personas.find((x) => x.nombre === 'Brenda'))!.activo).toBe(false)
})
