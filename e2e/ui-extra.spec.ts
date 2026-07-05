// Controles de UI añadidos post-4.9: filtro por persona en recurrentes y
// toggle "ocultar entregadas" del panel RH. Solo presentación — los datos
// siguen viniendo de RLS; aquí validamos el filtrado de vista.
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

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('recurrentes: filtro por persona acota la tabla de patrones', async ({ page }) => {
  await login(page, 'dani@movdi.mx') // admin: ve todos los patrones
  await page.goto('/recurrentes')

  // seeds: 4 patrones, todos para Antonio
  await expect(page.getByTestId('fila-recurrente')).toHaveCount(4)

  const filtro = page.getByTestId('filtro-persona-recur')
  await expect(filtro).toBeVisible()
  await filtro.selectOption('Antonio')
  await expect(page.getByTestId('fila-recurrente')).toHaveCount(4)
  await expect(page.getByText('· Antonio (4)')).toBeVisible()

  // volver a todas
  await filtro.selectOption('')
  await expect(page.getByTestId('fila-recurrente')).toHaveCount(4)
})

// ------------------------------------------------------------
test('panel RH: toggle ocultar entregadas', async ({ page, browser }) => {
  // dani crea una petición del área rh para Sarai (única persona con área rh)
  const ctx = await browser.newContext()
  const pDani = await ctx.newPage()
  await login(pDani, 'dani@movdi.mx')
  await pDani.goto('/peticiones')
  await pDani.getByTestId('btn-nueva-peticion').click()
  await pDani.locator('#pet-nombre').fill('checklist onboarding')
  await pDani.locator('#pet-area').selectOption('rh')
  await pDani.locator('#pet-para').selectOption('Sarai')
  await pDani.getByTestId('btn-crear-confirmar').click()
  await expect(pDani.getByRole('dialog')).toHaveCount(0)
  await ctx.close()

  // sarai (destinataria) la entrega
  await login(page, 'sarai@movdi.mx')
  await page.goto('/peticiones')
  await page.getByRole('button', { name: 'mis pendientes' }).click()
  const fila = page.getByTestId('card-peticion').filter({ hasText: 'checklist onboarding' })
  await fila.getByTestId('btn-entregar').click()
  await page.getByTestId('btn-entrega-confirmar').click()
  await expect(fila).toContainText('entregado ✓')

  // panel RH: la entregada aparece; el toggle la oculta y la regresa
  await page.goto('/rh')
  const item = page.getByTestId('rh-peticion').filter({ hasText: 'checklist onboarding' })
  await expect(item).toBeVisible()
  await expect(item).toContainText('entregado ✓')

  const toggle = page.getByTestId('btn-rh-toggle-entregadas')
  await expect(toggle).toContainText('🙈 ocultar entregadas (1)')
  await toggle.click()
  await expect(item).toHaveCount(0)
  await expect(toggle).toContainText('👁 mostrar entregadas (1)')
  await toggle.click()
  await expect(item).toBeVisible()
})
