import { test, expect, type Page } from '@playwright/test'
import { mapPeticionRow } from '../lib/peticiones'
import { mapEstrellaRow } from '../lib/estrellas'
import { calcularGamePersona, mesAnteriorStr, nombreMesLargo } from '../lib/gamificacion'

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
  return (await r.json()) as {
    peticiones: Record<string, unknown>[]
    estrellas: Record<string, unknown>[]
    historial_mensual: Record<string, unknown>[]
  }
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('mi progreso: la UI muestra exactamente el XP/nivel que dicta la fórmula portada', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/progreso')

  // expectativa calculada con la MISMA lib (fuente única) sobre los datos del mock
  const st = await estado()
  const game = calcularGamePersona(
    'Antonio',
    new Date().toISOString().slice(0, 7),
    st.peticiones.map(mapPeticionRow),
    st.estrellas.map(mapEstrellaRow),
  )
  await expect(page.getByTestId('mi-xp')).toContainText(`${game.xp} XP`)
  await expect(page.getByTestId('mi-nivel')).toHaveText(`nivel ${game.nivel} · ${game.nivelNombre}`)
})

// ------------------------------------------------------------
test('mi ritmo: lista el cumplimiento de MIS recurrentes activas', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/progreso')
  // Antonio tiene rec-1..4 activas asignadas
  await expect(page.getByTestId('ritmo-item')).toHaveCount(4)
  await expect(page.getByTestId('mi-ritmo')).toContainText('standup semanal')
})

// ------------------------------------------------------------
test('leaderboard: nunca aparecen ceo, rh ni los excluidos especiales', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await page.goto('/progreso')
  await expect(page.getByTestId('leaderboard')).toBeVisible()
  const texto = await page.getByTestId('leaderboard').textContent()
  // exclusiones de competeEnLeaderboard (paridad SPA)
  expect(texto).not.toContain('Sarai')    // rh
  expect(texto).not.toContain('Arylene')  // excluida especial
  expect(texto).not.toContain('Emmanuel') // ceo
})

// ------------------------------------------------------------
// Navegación de meses del leaderboard: arranca en el actual (› deshabilitada),
// un mes cerrado se pinta CONGELADO del archivo (orden por XP, "cierre
// oficial ✓") y un mes pasado sin cierre visible avisa "cálculo en vivo".
test('leaderboard: navegación de meses — mes cerrado congelado por XP, › deshabilitada en el actual', async ({ page }) => {
  const mesAnt = mesAnteriorStr()
  // dirección archiva el mes anterior con un ranking conocido (XP ≠ orden por %)
  const r = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dani@movdi.mx', password: PASS }),
  })
  const tk = ((await r.json()) as { access_token: string }).access_token
  await fetch(`${MOCK}/rest/v1/historial_mensual`, {
    method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      { persona: 'Karla', mes: mesAnt, xp_total: 120, nivel_alcanzado: 2, entregadas: 9, cumplimiento: 90 },
      { persona: 'Antonio', mes: mesAnt, xp_total: 190, nivel_alcanzado: 2, entregadas: 12, cumplimiento: 100 },
      { persona: 'Brenda', mes: mesAnt, xp_total: 80, nivel_alcanzado: 1, entregadas: 6, cumplimiento: 75 },
    ]),
  })

  await login(page, 'dani@movdi.mx')
  await page.goto('/progreso')

  // arranque: mes actual, › deshabilitada, sin etiqueta de cierre
  await expect(page.getByTestId('lb-mes-label')).toHaveText(nombreMesLargo(new Date().toISOString().slice(0, 7)))
  await expect(page.getByTestId('lb-mes-siguiente')).toBeDisabled()
  await expect(page.getByTestId('lb-cierre-oficial')).toHaveCount(0)

  // ‹ al mes cerrado: ranking congelado ordenado por XP desc con medallas
  await page.getByTestId('lb-mes-anterior').click()
  await expect(page.getByTestId('lb-mes-label')).toHaveText(nombreMesLargo(mesAnt))
  await expect(page.getByTestId('lb-cierre-oficial')).toHaveText('cierre oficial ✓')
  const filas = page.getByTestId('lb-item-cerrado')
  await expect(filas).toHaveCount(3)
  await expect(filas.nth(0)).toContainText('🥇')
  await expect(filas.nth(0)).toContainText('Antonio')
  await expect(filas.nth(0)).toContainText('190 XP')
  await expect(filas.nth(1)).toContainText('Karla')
  await expect(filas.nth(2)).toContainText('Brenda')
  // el archivo manda: no aparece la vista en vivo
  await expect(page.getByTestId('lb-item')).toHaveCount(0)
  // piso: no hay datos antes del mes archivado → ‹ deshabilitada
  await expect(page.getByTestId('lb-mes-anterior')).toBeDisabled()

  // › regresa al mes actual (vista en vivo de siempre)
  await page.getByTestId('lb-mes-siguiente').click()
  await expect(page.getByTestId('lb-cierre-oficial')).toHaveCount(0)
  await expect(page.getByTestId('lb-mes-siguiente')).toBeDisabled()
})

// head: la RLS de historial no le da filas ajenas → mes pasado = cálculo
// en vivo de SU equipo con el aviso "sin cierre oficial"
test('leaderboard: head navega a un mes pasado y ve cálculo en vivo (sin archivo ajeno)', async ({ page }) => {
  await login(page, 'karla@movdi.mx')
  await page.goto('/progreso')
  await expect(page.getByTestId('leaderboard')).toBeVisible()
  // sin cierres visibles, el piso es el mes más antiguo con peticiones (MES_PREV del seed)
  await page.getByTestId('lb-mes-anterior').click()
  await expect(page.getByTestId('lb-preliminar')).toContainText('cálculo en vivo')
  await expect(page.getByTestId('lb-cierre-oficial')).toHaveCount(0)
  await expect(page.getByTestId('lb-item-cerrado')).toHaveCount(0)
})

// ------------------------------------------------------------
test('cierre de mes (dirección): preview correcto, inserta historial y no se puede repetir', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await page.goto('/progreso')

  const mesAnt = mesAnteriorStr()
  // preview del mes anterior (fórmula 4.13): Antonio 7 a tiempo (70) +
  // anticipación (3) + estrella (15) + bono 100% (40) = 128 XP → nivel 2
  const cierre = page.getByTestId('cierre-pendiente')
  await expect(cierre).toBeVisible()
  await expect(cierre).toContainText(mesAnt)
  await expect(cierre).toContainText('Antonio · nivel 2 · 128 XP')
  await expect(cierre).toContainText('🎁 tarde libre')

  page.on('dialog', (d) => d.accept())
  await page.getByTestId('btn-cerrar-mes').click()
  await expect(page.getByTestId('cierre-ok')).toContainText('1 persona(s) archivadas')

  // fila exacta en historial_mensual (calculada en el SERVIDOR)
  const st = await estado()
  const h = st.historial_mensual.find((x) => x.persona === 'Antonio')!
  expect(h).toBeTruthy()
  expect(h).toMatchObject({
    mes: mesAnt,
    xp_total: 128,       // 70 a tiempo + 3 anticipación + 15 estrella + 40 bono 100%
    nivel_alcanzado: 2,  // 128 >= 100 (umbral 4.13)
    entregadas: 7,
    cumplimiento: 100,
    mejor_racha: 7,
    recompensa: 'tarde libre',
  })

  // el bloque pendiente desaparece → estado informativo "ya cerrado ✓"
  await expect(page.getByTestId('cierre-pendiente')).toHaveCount(0)
  await expect(page.getByTestId('cierre-hecho')).toContainText('ya está cerrado ✓')
  await expect(page.getByTestId('historial-item').filter({ hasText: 'Antonio' })).toBeVisible()
})

// ------------------------------------------------------------
test('gating del cierre: head/rh/ejecutivo NO ven el bloque de cierre', async ({ page, browser }) => {
  await login(page, 'karla@movdi.mx') // head, no dirección
  await page.goto('/progreso')
  await expect(page.getByTestId('leaderboard')).toBeVisible()
  await expect(page.getByTestId('cierre-pendiente')).toHaveCount(0)
  await expect(page.getByTestId('cierre-hecho')).toHaveCount(0)
  await expect(page.getByTestId('cierre-sin-actividad')).toHaveCount(0)
  await expect(page.getByTestId('btn-cerrar-mes')).toHaveCount(0)

  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'antonio@movdi.mx')
  await p2.goto('/progreso')
  await expect(p2.getByTestId('cierre-pendiente')).toHaveCount(0)
  await ctx.close()
})

// ------------------------------------------------------------
test('recompensas 4.8: catálogo OCULTO al equipo, visible solo para el flag', async ({ page, browser }) => {
  // ejecutivo: ni rastro del catálogo (la sorpresa se conoce al ganarla)
  await login(page, 'antonio@movdi.mx')
  await page.goto('/progreso')
  await expect(page.getByTestId('mi-progreso')).toBeVisible()
  await expect(page.getByTestId('recompensas')).toHaveCount(0)
  await expect(page.getByText('tarde libre')).toHaveCount(0)

  // flag (Dani): catálogo completo + editor de admin
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'dani@movdi.mx')
  await p2.goto('/progreso')
  const rec = p2.getByTestId('recompensas')
  await expect(rec).toContainText('nivel 2')
  await expect(rec).toContainText('tarde libre')
  await expect(p2.getByTestId('editor-catalogo')).toBeVisible()
  await ctx.close()
})

// ------------------------------------------------------------
test('logros: los desbloqueados por los datos aparecen encendidos', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/progreso')
  // Antonio: 7 entregadas prev-month + 1 estrella recibida
  const on = page.getByTestId('logro-on')
  await expect(on.filter({ hasText: 'primera entrega' })).toBeVisible()
  await expect(on.filter({ hasText: 'racha de 5' })).toBeVisible()      // mejor racha 7
  await expect(on.filter({ hasText: 'primera estrella' })).toBeVisible()
  await expect(on.filter({ hasText: '10 entregas' })).toHaveCount(0)    // solo 7
})

// ------------------------------------------------------------
// 4.11 — logros de podio: se computan del podio OFICIAL de meses cerrados
// (vía la RPC, que funciona para cualquier rol pese a la RLS de historial)
test('logros 4.11: oro/podio del mes cerrado se encienden desde la RPC', async ({ page }) => {
  // dirección archiva un mes con Antonio en 1er lugar
  const r = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dani@movdi.mx', password: PASS }),
  })
  const tk = ((await r.json()) as { access_token: string }).access_token
  await fetch(`${MOCK}/rest/v1/historial_mensual`, {
    method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      { persona: 'Antonio', mes: '2026-05', xp_total: 90, cumplimiento: 100 },
      { persona: 'Brenda', mes: '2026-05', xp_total: 60, cumplimiento: 80 },
      { persona: 'Karla', mes: '2026-05', xp_total: 40, cumplimiento: 70 },
    ]),
  })

  await login(page, 'antonio@movdi.mx')
  await page.goto('/progreso')
  const on = page.getByTestId('logro-on')
  await expect(on.filter({ hasText: 'oro del mes' })).toBeVisible()
  await expect(on.filter({ hasText: 'de podio' })).toBeVisible()
  // los bloqueados siguen en misterio
  await expect(page.getByTestId('logro-off').first()).toContainText('???')
  await expect(page.getByTestId('logros')).not.toContainText('semestre perfecto')
})

// ------------------------------------------------------------
// 4.13 — coach MOVDI: mensaje según el estado real (prioridad fija)
test('coach: "pendientes de la semana" sin vencidas; "recuerda marcar" con 1-2 vencidas', async ({ page, browser }) => {
  // Antonio: sin vencidas, con pendientes esta semana (p-seed-1 dx+5)
  await login(page, 'antonio@movdi.mx')
  await page.goto('/progreso')
  const coach = page.getByTestId('coach')
  await expect(coach).toHaveAttribute('data-tipo', 'semana')
  await expect(coach).toContainText('esta semana traes')

  // Brenda con 1 vencida → "recuerda marcar entregado"
  const r = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dani@movdi.mx', password: PASS }),
  })
  const tk = ((await r.json()) as { access_token: string }).access_token
  const dxs = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
  await fetch(`${MOCK}/rest/v1/peticiones`, {
    method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      zona: 'general', nombre: 'entrega olvidada', creado_por: 'Dani', para: 'Brenda',
      area: 'imkt', fecha: dxs(-2), prioridad: 'media', estatus: 'pendiente', privada: false,
    }),
  })
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'brenda@movdi.mx')
  await p2.goto('/progreso')
  const coach2 = p2.getByTestId('coach')
  await expect(coach2).toHaveAttribute('data-tipo', 'marcar')
  await expect(coach2).toContainText('recuerda marcar')
  await ctx.close()
})

test('coach: "vas retrasado" con 3+ vencidas (prioridad máxima)', async ({ page }) => {
  const r = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dani@movdi.mx', password: PASS }),
  })
  const tk = ((await r.json()) as { access_token: string }).access_token
  const dxs = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
  for (let i = 1; i <= 3; i++) {
    await fetch(`${MOCK}/rest/v1/peticiones`, {
      method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zona: 'general', nombre: `vencida ${i}`, creado_por: 'Dani', para: 'Brenda',
        area: 'imkt', fecha: dxs(-i), prioridad: 'media', estatus: 'pendiente', privada: false,
      }),
    })
  }
  await login(page, 'brenda@movdi.mx')
  await page.goto('/progreso')
  const coach = page.getByTestId('coach')
  await expect(coach).toHaveAttribute('data-tipo', 'retrasado')
  await expect(coach).toContainText('vas retrasado: 3 tareas vencidas')
})
