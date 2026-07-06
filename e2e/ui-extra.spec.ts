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

// ------------------------------------------------------------
test('nudge al crear con plazo ajustado: aparece con ≤2 días, no bloquea', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/peticiones')
  await page.getByTestId('btn-nueva-peticion').click()

  const dx = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

  // 7 días: sin nudge
  await page.locator('#pet-fecha').fill(dx(7))
  await expect(page.getByTestId('nudge-plazo')).toHaveCount(0)

  // 2 días: nudge amarillo
  await page.locator('#pet-fecha').fill(dx(2))
  await expect(page.getByTestId('nudge-plazo')).toContainText('estás dando poco tiempo para entregar')

  // 1 día + destinatario elegido: aviso fuerte y personalizado
  await page.locator('#pet-area').selectOption('imkt')
  await page.locator('#pet-para').selectOption('Brenda')
  await page.locator('#pet-fecha').fill(dx(1))
  await expect(page.getByTestId('nudge-plazo')).toContainText('¿ya verificaste con Brenda si es posible esta entrega?')

  // NO bloquea: crear procede igual
  await page.locator('#pet-nombre').fill('urgente verificada')
  await page.getByTestId('btn-crear-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'lo que pedí' }).click()
  await expect(page.getByTestId('card-peticion').filter({ hasText: 'urgente verificada' })).toBeVisible()
})

// ------------------------------------------------------------
test('meses cerrados: navegación ← → por mes y toggle de entradas', async ({ page }) => {
  // sembrar dos meses cerrados como dani (dirección)
  const tk = await (async () => {
    const r = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dani@movdi.mx', password: PASS }),
    })
    return ((await r.json()) as { access_token: string }).access_token
  })()
  await fetch(`${MOCK}/rest/v1/historial_mensual`, {
    method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      { persona: 'Antonio', mes: '2026-04', xp_total: 40, cumplimiento: 80 },
      { persona: 'Antonio', mes: '2026-05', xp_total: 55, cumplimiento: 90 },
    ]),
  })

  await login(page, 'antonio@movdi.mx')
  await page.goto('/progreso')

  // por default: el mes más reciente, con sus filas
  await expect(page.getByTestId('hist-mes-actual')).toHaveText('2026-05')
  await expect(page.getByTestId('historial-item')).toHaveCount(1)
  await expect(page.getByTestId('historial-item')).toContainText('55 XP')

  // ← un mes atrás
  await page.getByTestId('hist-mes-anterior').click()
  await expect(page.getByTestId('hist-mes-actual')).toHaveText('2026-04')
  await expect(page.getByTestId('historial-item')).toContainText('40 XP')
  await expect(page.getByTestId('hist-mes-anterior')).toBeDisabled()

  // → de regreso
  await page.getByTestId('hist-mes-siguiente').click()
  await expect(page.getByTestId('hist-mes-actual')).toHaveText('2026-05')
  await expect(page.getByTestId('hist-mes-siguiente')).toBeDisabled()

  // toggle de entradas
  await page.getByTestId('hist-toggle').click()
  await expect(page.getByTestId('historial-item')).toHaveCount(0)
  await page.getByTestId('hist-toggle').click()
  await expect(page.getByTestId('historial-item')).toHaveCount(1)
})
