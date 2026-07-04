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

async function estado() {
  const r = await fetch(`${MOCK}/__test/state`)
  return (await r.json()) as { todos: Record<string, unknown>[] }
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('crear: user_nombre derivado de la sesión en el servidor', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/todos')

  await page.locator('#todo-input').fill('llamar al cliente nuevo')
  await page.getByTestId('btn-agregar-todo').click()
  await expect(page.getByTestId('todo-item').filter({ hasText: 'llamar al cliente nuevo' })).toBeVisible()

  const st = await estado()
  const t = st.todos.find((x) => x.texto === 'llamar al cliente nuevo')!
  expect(t).toBeTruthy()
  expect(t.user_nombre).toBe('Antonio') // derivado de la sesión, no del cliente
  expect(t.hecho).toBe(false)
})

// ------------------------------------------------------------
test('toggle hecho/pendiente, editar y borrar (filas propias vía RLS)', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/todos')

  const item = page.getByTestId('todo-item').filter({ hasText: 'preparar junta con talento' })

  // toggle a hecho (la UI es optimista: esperar a que el PATCH aterrice)
  await item.getByTestId('todo-check').click()
  await expect.poll(async () => (await estado()).todos.find((t) => t.id === 't-seed-1')!.hecho).toBe(true)

  // toggle de regreso a pendiente
  await item.getByTestId('todo-check').click()
  await expect.poll(async () => (await estado()).todos.find((t) => t.id === 't-seed-1')!.hecho).toBe(false)

  // editar (extensión: la SPA no tenía editar; la RLS todos_update_own lo permite)
  await item.hover()
  await item.getByTestId('btn-editar-todo').click()
  await page.getByTestId('todo-edit-input').fill('preparar junta con talento y agencia')
  await page.getByTestId('todo-edit-input').press('Enter')
  await expect.poll(async () => (await estado()).todos.find((t) => t.id === 't-seed-1')!.texto)
    .toBe('preparar junta con talento y agencia')

  // borrar
  const item2 = page.getByTestId('todo-item').filter({ hasText: 'mandar factura de mayo' })
  await item2.hover()
  await item2.getByTestId('btn-borrar-todo').click()
  await expect(item2).toHaveCount(0)
  await expect.poll(async () => (await estado()).todos.find((t) => t.id === 't-seed-2')).toBeUndefined()
})

// ------------------------------------------------------------
test('aislamiento: un usuario nunca ve los to-dos de otro', async ({ page, browser }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/todos')
  // Antonio ve los suyos (2 seeds) y NO el de Brenda
  await expect(page.getByTestId('todo-item')).toHaveCount(2)
  await expect(page.getByTestId('todo-item').filter({ hasText: 'secreto de brenda' })).toHaveCount(0)

  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'brenda@movdi.mx')
  await p2.goto('/todos')
  await expect(p2.getByTestId('todo-item')).toHaveCount(1)
  await expect(p2.getByTestId('todo-item').filter({ hasText: 'secreto de brenda' })).toBeVisible()
  await expect(p2.getByTestId('todo-item').filter({ hasText: 'preparar junta' })).toHaveCount(0)
  await ctx.close()
})
