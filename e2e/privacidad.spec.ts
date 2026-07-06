// Fase 4.8 — privacidad de gamificación por rol, contra la RLS simulada del
// mock (espejo de la migración cutover_gamificacion_privacidad):
//   · ejecutivo: NO puede leer estrellas/recompensas/historial ajenos NI por
//     API directa (fetch con su token, sin pasar por la UI)
//   · head: progreso de su equipo (leaderboard), sin estrellas ni recompensas
//   · rh: lista de recompensas ganadas + marcar entregada (solo esa columna)
//   · flag (Dani/Emmanuel): ve todo + editor del catálogo
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

// token de sesión REAL del mock (grant password), para llamadas API directas
async function token(email: string): Promise<string> {
  const r = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  })
  const j = (await r.json()) as { access_token: string }
  return j.access_token
}

async function apiGet(tabla: string, tk: string) {
  const r = await fetch(`${MOCK}/rest/v1/${tabla}?select=*`, {
    headers: { Authorization: `Bearer ${tk}`, apikey: 'sb_publishable_test' },
  })
  return { status: r.status, rows: r.ok ? ((await r.json()) as Record<string, unknown>[]) : [] }
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('API directa · ejecutivo: estrellas solo donde participa, recompensas 0, historial solo propio', async () => {
  // sembrar una estrella AJENA (Brenda → Karla) y un historial ajeno + propio
  const tkDani = await token('dani@movdi.mx')
  await fetch(`${MOCK}/rest/v1/historial_mensual`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tkDani}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      { persona: 'Antonio', mes: '2026-05', xp_total: 50, cumplimiento: 90, recompensa: null },
      { persona: 'Brenda', mes: '2026-05', xp_total: 70, cumplimiento: 95, recompensa: 'tarde libre' },
    ]),
  })
  const tkBrenda = await token('brenda@movdi.mx')
  await fetch(`${MOCK}/rest/v1/estrellas_colaboracion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tkBrenda}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ de_persona: 'Brenda', para_persona: 'Karla', motivo: 'apoyo x', semana: '2026-W26' }),
  })

  const tk = await token('antonio@movdi.mx')

  // estrellas: solo la que recibió (seed Brenda→Antonio); la Brenda→Karla NO
  const est = await apiGet('estrellas_colaboracion', tk)
  expect(est.rows.length).toBe(1)
  expect(est.rows[0].para_persona).toBe('Antonio')

  // recompensas (catálogo): cero filas
  const rec = await apiGet('recompensas', tk)
  expect(rec.rows.length).toBe(0)

  // historial: solo su fila
  const hist = await apiGet('historial_mensual', tk)
  expect(hist.rows.length).toBe(1)
  expect(hist.rows[0].persona).toBe('Antonio')

  // y NO puede marcar entregas (update denegado)
  const upd = await fetch(`${MOCK}/rest/v1/historial_mensual?persona=eq.Antonio`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recompensa_entregada: true }),
  })
  expect(upd.status).toBe(403)
})

// ------------------------------------------------------------
test('API directa · head: estrellas solo propias · flag: todas', async () => {
  const tkKarla = await token('karla@movdi.mx')
  const estK = await apiGet('estrellas_colaboracion', tkKarla)
  // la única estrella seed es Brenda→Antonio: Karla no participa → 0
  expect(estK.rows.length).toBe(0)
  const recK = await apiGet('recompensas', tkKarla)
  expect(recK.rows.length).toBe(0)

  const tkDani = await token('dani@movdi.mx')
  const estD = await apiGet('estrellas_colaboracion', tkDani)
  expect(estD.rows.length).toBe(1)
  const recD = await apiGet('recompensas', tkDani)
  expect(recD.rows.length).toBeGreaterThan(0)
})

// ------------------------------------------------------------
test('UI · ejecutivo: sin leaderboard, logros bloqueados como "???", mis recompensas propias', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.goto('/progreso')
  await expect(page.getByTestId('mi-progreso')).toBeVisible()
  await expect(page.getByTestId('leaderboard')).toHaveCount(0)
  await expect(page.getByTestId('reconocimientos')).toHaveCount(0)
  await expect(page.getByTestId('recompensas')).toHaveCount(0)
  await expect(page.getByTestId('entregas-rh')).toHaveCount(0)
  // bloqueados = candado sin nombre; ni un nombre de logro bloqueado visible
  await expect(page.getByTestId('logro-off').first()).toContainText('???')
  await expect(page.getByTestId('logros')).not.toContainText('10 entregas')
  await expect(page.getByTestId('mis-recompensas')).toBeVisible()
})

// ------------------------------------------------------------
test('UI · head: leaderboard de SU equipo visible, sin catálogo de recompensas', async ({ page }) => {
  await login(page, 'karla@movdi.mx')
  await page.goto('/progreso')
  await expect(page.getByTestId('leaderboard')).toBeVisible()
  await expect(page.getByTestId('leaderboard')).toContainText('(mi equipo)')
  await expect(page.getByTestId('recompensas')).toHaveCount(0)
  await expect(page.getByTestId('editor-catalogo')).toHaveCount(0)
})

// ------------------------------------------------------------
test('RH: ve las recompensas ganadas y las marca como entregadas', async ({ page, browser }) => {
  // dirección cierra el mes anterior (Antonio gana "tarde libre" con 88 XP → nivel 2)
  const ctx = await browser.newContext()
  const pDani = await ctx.newPage()
  await login(pDani, 'dani@movdi.mx')
  await pDani.goto('/progreso')
  pDani.on('dialog', (d) => void d.accept())
  await pDani.getByTestId('btn-cerrar-mes').click()
  await expect(pDani.getByTestId('cierre-ok')).toBeVisible()
  await ctx.close()

  // RH entra y entrega — la lista activa muestra SOLO pendientes
  await login(page, 'sarai@movdi.mx')
  await page.goto('/progreso')
  const entrega = page.getByTestId('entrega-item').filter({ hasText: 'Antonio' })
  await expect(entrega).toContainText('tarde libre')
  await entrega.getByTestId('btn-marcar-entregada').click()
  // al marcar ✓ la fila SALE de la lista activa (ya no crece infinita)
  await expect(entrega).toHaveCount(0)
  await expect(page.getByTestId('entregas-vacio')).toBeVisible()
  // el toggle recupera el historial de entregadas
  await page.getByTestId('entregas-toggle').click()
  await expect(entrega).toContainText('entregada ✓')
  await page.getByTestId('entregas-toggle').click()
  await expect(entrega).toHaveCount(0)

  // estado persistido en la "BD"
  await expect.poll(async () => {
    const st = await (await fetch(`${MOCK}/__test/state`)).json() as { historial_mensual: Record<string, unknown>[] }
    return st.historial_mensual.find((h) => h.persona === 'Antonio')?.recompensa_entregada
  }).toBe(true)

  // y RH NO ve el leaderboard ni el catálogo
  await expect(page.getByTestId('leaderboard')).toHaveCount(0)
  await expect(page.getByTestId('recompensas')).toHaveCount(0)
})

// ------------------------------------------------------------
test('editor del catálogo (Dani): guarda una recompensa y la RLS respalda la escritura', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await page.goto('/progreso')
  const editor = page.getByTestId('editor-catalogo')
  await expect(editor).toBeVisible()
  await editor.locator('#cat-nivel').selectOption('3')
  await editor.locator('#cat-desc').fill('kit de mercancía MOVDI')
  await editor.getByTestId('btn-guardar-recompensa').click()
  await expect(page.getByTestId('recompensas')).toContainText('kit de mercancía MOVDI')

  const st = await (await fetch(`${MOCK}/__test/state`)).json() as { recompensas: Record<string, unknown>[] }
  expect(st.recompensas.find((r) => r.nivel === 3)?.descripcion).toBe('kit de mercancía MOVDI')

  // API directa: un ejecutivo NO puede escribir el catálogo
  const tk = await token('antonio@movdi.mx')
  const w = await fetch(`${MOCK}/rest/v1/recompensas`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nivel: 5, descripcion: 'hack', activa: true }),
  })
  expect(w.status).toBe(403)
})

// ------------------------------------------------------------
test('podio: la RPC del mes cerrado responde el top 3 a cualquier rol (y solo eso)', async () => {
  const tkDani = await token('dani@movdi.mx')
  await fetch(`${MOCK}/rest/v1/historial_mensual`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tkDani}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      { persona: 'Antonio', mes: '2026-06', xp_total: 88, cumplimiento: 90 },
      { persona: 'Brenda', mes: '2026-06', xp_total: 95, cumplimiento: 97 },
      { persona: 'Karla', mes: '2026-06', xp_total: 40, cumplimiento: 60 },
      { persona: 'Arylene', mes: '2026-06', xp_total: 10, cumplimiento: 30 },
    ]),
  })
  // un ejecutivo (que NO puede leer historial ajeno) SÍ obtiene el podio
  const tk = await token('antonio@movdi.mx')
  const r = await fetch(`${MOCK}/rest/v1/rpc/podio_mes_cerrado`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_mes: '2026-06' }),
  })
  const podio = (await r.json()) as { persona: string; cumplimiento: number }[]
  expect(podio.map((p) => p.persona)).toEqual(['Brenda', 'Antonio', 'Karla'])
  // solo top 3, solo persona/cumplimiento/mes — sin xp ni recompensas
  expect(podio.length).toBe(3)
  expect(Object.keys(podio[0]).sort()).toEqual(['cumplimiento', 'mes', 'persona'])
})

// ------------------------------------------------------------
// Cutover 8 — visibilidad por equipos en peticiones y recurrentes
// (equipos del mock: Karla es principal de Brenda y apoyo de Antonio;
// Sarai/Dani/Emmanuel NO reportan a Karla)
test('equipos · ejecutivo: 0 peticiones y 0 recurrentes ajenas por API', async () => {
  // Brenda solo participa en p-seed-3 (Antonio→Brenda) y en ninguna recurrente
  const tk = await token('brenda@movdi.mx')
  const pets = await apiGet('peticiones', tk)
  expect(pets.rows.length).toBe(1)
  expect(pets.rows[0].nombre).toBe('diseñar reel')
  const recs = await apiGet('recurrentes', tk)
  expect(recs.rows.length).toBe(0) // los patrones de Antonio ya NO se filtran a otros
})

// ------------------------------------------------------------
test('equipos · head: ve su equipo en AMBAS direcciones, no lo de fuera; dirección ve todo', async () => {
  // fila fuera del equipo de Karla: Dani → Sarai
  const tkDani = await token('dani@movdi.mx')
  await fetch(`${MOCK}/rest/v1/peticiones`, {
    method: 'POST', headers: { Authorization: `Bearer ${tkDani}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      zona: 'general', nombre: 'auditoría rh', creado_por: 'Dani', para: 'Sarai',
      area: 'rh', fecha: '2026-07-20', prioridad: 'media', estatus: 'pendiente', privada: false,
    }),
  })
  await fetch(`${MOCK}/rest/v1/recurrentes`, {
    method: 'POST', headers: { Authorization: `Bearer ${tkDani}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: 'reporte dirección', para: 'Sarai', area: 'rh', frecuencia: 'mensual',
      dia_semana: null, dia_mes: 1, activa: true, creado_por: 'Dani',
    }),
  })

  const tkKarla = await token('karla@movdi.mx')
  const pets = await apiGet('peticiones', tkKarla)
  // sí: filas donde el creador o el para son de su equipo (Antonio apoyo, Brenda principal)
  expect(pets.rows.some((r) => r.nombre === 'reporte semanal')).toBe(true) // Dani→Antonio (para de su equipo)
  expect(pets.rows.some((r) => r.nombre === 'diseñar reel')).toBe(true)    // Antonio→Brenda (ambos)
  // no: fuera del equipo
  expect(pets.rows.some((r) => r.nombre === 'auditoría rh')).toBe(false)
  const recs = await apiGet('recurrentes', tkKarla)
  expect(recs.rows.some((r) => r.para === 'Antonio')).toBe(true)   // equipo
  expect(recs.rows.some((r) => r.para === 'Sarai')).toBe(false)    // fuera

  // dirección: todo
  const petsD = await apiGet('peticiones', tkDani)
  expect(petsD.rows.some((r) => r.nombre === 'auditoría rh')).toBe(true)
  const recsD = await apiGet('recurrentes', tkDani)
  expect(recsD.rows.some((r) => r.para === 'Sarai')).toBe(true)
})

// ------------------------------------------------------------
test('equipos · privadas intactas: el head NO ve una privada de su propio equipo', async () => {
  // Antonio (equipo de Karla) crea una privada para Brenda (también su equipo)
  const tk = await token('antonio@movdi.mx')
  await fetch(`${MOCK}/rest/v1/peticiones`, {
    method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      zona: 'general', nombre: 'tema delicado', creado_por: 'Antonio', para: 'Brenda',
      area: 'imkt', fecha: '2026-07-22', prioridad: 'media', estatus: 'pendiente', privada: true,
    }),
  })
  const tkKarla = await token('karla@movdi.mx')
  const pets = await apiGet('peticiones', tkKarla)
  expect(pets.rows.some((r) => r.nombre === 'tema delicado')).toBe(false) // privada: ni el head del equipo
  const tkBrenda = await token('brenda@movdi.mx')
  const petsB = await apiGet('peticiones', tkBrenda)
  expect(petsB.rows.some((r) => r.nombre === 'tema delicado')).toBe(true) // destinataria sí
})
