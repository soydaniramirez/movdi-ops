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

async function irAPeticiones(page: Page) {
  await page.goto('/peticiones')
  await expect(page.getByRole('heading', { name: 'peticiones' })).toBeVisible()
}

async function estado() {
  const r = await fetch(`${MOCK}/__test/state`)
  return (await r.json()) as {
    peticiones: Record<string, unknown>[]
    notificaciones: Record<string, unknown>[]
  }
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
// Regresión 2026-08-06: PostgREST corta cada respuesta en 1000 filas y un
// select('*') sin paginar truncaba EN SILENCIO — peticiones recientes (las
// de fecha más lejana, al final del orden) desaparecían de "lo que pedí".
// El mock simula el tope; sin lib/supabase/select-todo este test falla.
test('paginación >1000 filas: una petición más allá del tope sigue apareciendo en "lo que pedí"', async ({ page }) => {
  const r = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dani@movdi.mx', password: PASS }),
  })
  const tk = ((await r.json()) as { access_token: string }).access_token
  // 1009 filas de relleno entregadas y ocultas para Dani (no ensucian el DOM)
  // + 1 pendiente con la fecha MÁS LEJANA: queda al final del orden por fecha,
  // más allá de la primera página de 1000.
  const f = (i: number) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10)
  const lote = Array.from({ length: 1009 }, (_, i) => ({
    zona: 'general', nombre: `relleno paginación ${i}`, creado_por: 'Dani', para: 'Antonio',
    area: 'pm', fecha: f(i), prioridad: 'baja', estatus: 'entregado', privada: false,
    oculta_para: ['Dani'],
  }))
  lote.push({
    zona: 'general', nombre: 'aguja más allá del tope', creado_por: 'Dani', para: 'Antonio',
    area: 'pm', fecha: f(1200), prioridad: 'alta', estatus: 'pendiente', privada: false,
    oculta_para: [],
  })
  await fetch(`${MOCK}/rest/v1/peticiones`, {
    method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(lote),
  })
  // sanity del mock: una página del API se corta en 1000 (paridad PostgREST)
  const pagina = await fetch(`${MOCK}/rest/v1/peticiones?select=*&order=fecha.asc`, {
    headers: { Authorization: `Bearer ${tk}` },
  })
  expect(((await pagina.json()) as unknown[]).length).toBe(1000)

  await login(page, 'dani@movdi.mx')
  await irAPeticiones(page)
  await page.getByRole('button', { name: 'lo que pedí' }).click()
  await expect(page.getByText('aguja más allá del tope')).toBeVisible()
})

// ------------------------------------------------------------
test('gating de modos: ejecutivo NO ve los modos admin-only; ceo sí', async ({ page, browser }) => {
  await login(page, 'antonio@movdi.mx')
  await irAPeticiones(page)
  await page.getByTestId('btn-nueva-peticion').click()
  await expect(page.getByText('una persona')).toBeVisible()
  await expect(page.getByText('solo heads · admin only')).toHaveCount(0)
  await expect(page.getByText('solo ejecutivos · admin only')).toHaveCount(0)
  await expect(page.getByText('todo el equipo · admin only')).toHaveCount(0)

  const ctx = await browser.newContext()
  const page2 = await ctx.newPage()
  await login(page2, 'dani@movdi.mx')
  await irAPeticiones(page2)
  await page2.getByTestId('btn-nueva-peticion').click()
  await expect(page2.getByText('solo heads · admin only')).toBeVisible()
  await expect(page2.getByText('solo ejecutivos · admin only')).toBeVisible()
  await expect(page2.getByText('todo el equipo · admin only')).toBeVisible()
  await ctx.close()
})

// ------------------------------------------------------------
test('crear a una persona: fila + notificación al destinatario', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await irAPeticiones(page)
  await page.getByTestId('btn-nueva-peticion').click()

  await page.locator('#pet-nombre').fill('brief campaña')
  await page.locator('#pet-desc').fill('brief para el cliente nuevo')
  await page.locator('#pet-area').selectOption('imkt')
  await page.locator('#pet-para').selectOption('Brenda')
  await page.locator('#pet-prio').selectOption('alta')
  await page.getByTestId('btn-crear-confirmar').click()

  // aparece en "lo que pedí"
  await page.getByRole('button', { name: 'lo que pedí' }).click()
  await expect(page.getByTestId('card-peticion').filter({ hasText: 'brief campaña' })).toBeVisible()

  const st = await estado()
  const creada = st.peticiones.find((p) => p.nombre === 'brief campaña')!
  expect(creada).toBeTruthy()
  expect(creada.creado_por).toBe('Antonio') // derivado de la sesión en el servidor
  expect(creada.para).toBe('Brenda')
  expect(creada.grupo_id).toBeNull()
  expect(creada.privada).toBe(false)
  expect(creada.zona).toBe('general')

  const notif = st.notificaciones.find((n) => n.tipo === 'nueva_peticion' && !String(n.id).startsWith('n-seed-'))!
  expect(notif).toBeTruthy()
  expect(notif.para).toBe('Brenda')
  expect(notif.titulo).toBe('nueva petición de Antonio')
  expect(notif.detalle).toBe('brief campaña')
  expect(notif.peticion_id).toBe(creada.id)
})

// ------------------------------------------------------------
test('crear a todo el equipo (ceo): una fila por persona, grupo_id compartido, notifs batch', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irAPeticiones(page)
  await page.getByTestId('btn-nueva-peticion').click()

  await page.locator('#pet-nombre').fill('actualizar firma de correo')
  await page.getByText('todo el equipo · admin only').click()
  // con 6 destinatarios (>5) aparece el confirm de asignación masiva
  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('btn-crear-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const filas = st.peticiones.filter((p) => p.nombre === 'actualizar firma de correo')
  // disponibles menos ceo (Dani, Emmanuel): Antonio, Arylene, Brenda, Karla, Lucia, Sarai
  expect(filas.map((f) => f.para).sort()).toEqual(['Antonio', 'Arylene', 'Brenda', 'Karla', 'Lucia', 'Sarai'])
  const grupos = new Set(filas.map((f) => f.grupo_id))
  expect(grupos.size).toBe(1)
  expect([...grupos][0]).not.toBeNull()
  expect(filas.every((f) => f.creado_por === 'Dani')).toBe(true)

  const notifs = st.notificaciones.filter((n) => n.tipo === 'nueva_peticion' && !String(n.id).startsWith('n-seed-'))
  expect(notifs).toHaveLength(6)
  expect(notifs.every((n) => n.titulo === 'nueva petición de Dani')).toBe(true)
})

// ------------------------------------------------------------
test('privada: ni dirección la ve; creador y destinatario sí', async ({ page, browser }) => {
  await login(page, 'antonio@movdi.mx')
  await irAPeticiones(page)
  await page.getByTestId('btn-nueva-peticion').click()
  await page.locator('#pet-nombre').fill('bono confidencial')
  await page.locator('#pet-area').selectOption('imkt')
  await page.locator('#pet-para').selectOption('Brenda')
  await page.locator('#pet-privada').check()
  await page.getByTestId('btn-crear-confirmar').click()
  await page.getByRole('button', { name: 'lo que pedí' }).click()
  await expect(page.getByTestId('card-peticion').filter({ hasText: 'bono confidencial' })).toBeVisible()

  // Dani (ceo/dirección) NO debe verla — pero sí ve las no privadas ajenas
  const ctx = await browser.newContext()
  const page2 = await ctx.newPage()
  await login(page2, 'dani@movdi.mx')
  await irAPeticiones(page2)
  await expect(page2.getByTestId('card-peticion').filter({ hasText: 'diseñar reel' })).toBeVisible()
  await expect(page2.getByTestId('card-peticion').filter({ hasText: 'bono confidencial' })).toHaveCount(0)
  await ctx.close()

  // Brenda (destinataria) sí la ve
  const ctx2 = await browser.newContext()
  const page3 = await ctx2.newPage()
  await login(page3, 'brenda@movdi.mx')
  await irAPeticiones(page3)
  await expect(page3.getByTestId('card-peticion').filter({ hasText: '🔒 bono confidencial' })).toBeVisible()
  await ctx2.close()
})

// ------------------------------------------------------------
test('aislamiento RLS: un ejecutivo ajeno no ve peticiones de otros', async ({ page }) => {
  await login(page, 'arylene@movdi.mx')
  await irAPeticiones(page)
  // seeds: reporte semanal (Dani→Antonio), diseñar reel (Antonio→Brenda) — ninguna suya
  await expect(page.getByText('no hay peticiones en esta vista')).toBeVisible()
})

// ------------------------------------------------------------
test('entregar con evidencia (link + nota)', async ({ page }) => {
  await login(page, 'brenda@movdi.mx')
  await irAPeticiones(page)
  await page.getByRole('button', { name: 'mis pendientes' }).click()
  const card = page.getByTestId('card-peticion').filter({ hasText: 'diseñar reel' })
  await card.getByTestId('btn-entregar').click()

  await page.locator('#ent-link').fill('https://drive.movdi.mx/reel-final')
  await page.locator('#ent-nota').fill('quedó aprobado por el talento')
  await page.getByTestId('btn-entrega-confirmar').click()

  await expect(card.getByText('entregada ✓')).toBeVisible()
  await expect(card.getByTestId('evidencia')).toContainText('https://drive.movdi.mx/reel-final')
  await expect(card.getByTestId('evidencia')).toContainText('quedó aprobado por el talento')

  const st = await estado()
  const p = st.peticiones.find((x) => x.id === 'p-seed-3')!
  expect(p.estatus).toBe('entregado')
  expect(p.link_entrega).toBe('https://drive.movdi.mx/reel-final')
  expect(p.nota_entrega).toBe('quedó aprobado por el talento')
  expect(p.fecha_entrega).toBe(new Date().toISOString().slice(0, 10))
})

// ------------------------------------------------------------
test('cambiar fecha (destinatario): motivo obligatorio ≥10, alerta al creador y notificación', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await irAPeticiones(page)
  await page.getByRole('button', { name: 'mis pendientes' }).click()
  const card = page.getByTestId('card-peticion').filter({ hasText: 'reporte semanal' })
  await card.getByTestId('btn-cambiar-fecha').click()

  // motivo corto → error, no guarda
  await page.locator('#cf-motivo').fill('corto')
  await page.getByTestId('btn-fecha-confirmar').click()
  await expect(page.getByRole('dialog').locator('p[role="alert"]')).toContainText('al menos 10 caracteres')

  // motivo válido → guarda
  const nueva = (() => { const d = new Date(); d.setDate(d.getDate() + 12); return d.toISOString().slice(0, 10) })()
  await page.locator('#cf-fecha').fill(nueva)
  await page.locator('#cf-motivo').fill('el cliente aún no manda los archivos finales')
  await page.getByTestId('btn-fecha-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(card.getByText('fecha movida')).toBeVisible()

  const st = await estado()
  const p = st.peticiones.find((x) => x.id === 'p-seed-1')!
  expect(p.fecha).toBe(nueva)
  expect(p.fecha_original).toBeTruthy() // guardó la original
  expect(p.motivo_cambio_fecha).toBe('el cliente aún no manda los archivos finales')
  expect(p.cambio_visto_por_creador).toBe(false) // lo cambió el destinatario → alerta para el creador
  expect(p.extension_justificada).toBeNull() // el destinatario no toca ese campo

  const notif = st.notificaciones.find((n) => n.tipo === 'fecha_cambiada' && !String(n.id).startsWith('n-seed-'))!
  expect(notif.para).toBe('Dani')
  expect(notif.titulo).toContain('Antonio cambió la fecha de "reporte semanal"')
  expect(notif.detalle).toContain('motivo: el cliente aún no manda los archivos finales')
})

// ------------------------------------------------------------
test('cambiar fecha (creador) con extensión NO justificada', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irAPeticiones(page)
  const card = page.getByTestId('card-peticion').filter({ hasText: 'reporte semanal' })
  await card.getByTestId('btn-cambiar-fecha').click()

  await page.locator('#cf-motivo').fill('se le pasó pero le doy chance esta vez')
  await page.getByText('no · se les pasó').click()
  await page.getByTestId('btn-fecha-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const p = st.peticiones.find((x) => x.id === 'p-seed-1')!
  expect(p.extension_justificada).toBe(false)
  expect(p.cambio_visto_por_creador).toBe(true) // lo cambió el creador, no hay alerta para él

  const notif = st.notificaciones.find((n) => n.tipo === 'fecha_cambiada' && !String(n.id).startsWith('n-seed-'))!
  expect(notif.para).toBe('Antonio')
  expect(notif.titulo).toContain('Dani extendió el plazo')
  expect(notif.detalle).toContain('cuenta contra la fecha original')
})

// ------------------------------------------------------------
test('mover instancia de recurrente (creador): fecha, justificación y notificación', async ({ page }) => {
  await login(page, 'dani@movdi.mx')
  await irAPeticiones(page)
  await page.getByRole('button', { name: 'instancias recurrentes' }).click()
  const card = page.getByTestId('card-peticion').filter({ hasText: 'nómina quincenal' })
  await expect(card.getByText('↻ recurrente')).toBeVisible()
  await card.getByTestId('btn-mover-instancia').click()

  const nueva = (() => { const d = new Date(); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10) })()
  await page.locator('#mi-fecha').fill(nueva)
  await page.locator('#mi-motivo').fill('Antonio está enfermo esta semana')
  await page.getByTestId('btn-mover-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const p = st.peticiones.find((x) => x.id === 'p-seed-2')!
  expect(p.fecha).toBe(nueva)
  expect(p.fecha_original).toBeTruthy()
  expect(p.extension_justificada).toBe(true)
  expect(p.cambio_visto_por_creador).toBe(true)

  const notif = st.notificaciones.find((n) => n.tipo === 'fecha_cambiada' && !String(n.id).startsWith('n-seed-'))!
  expect(notif.para).toBe('Antonio')
  expect(notif.titulo).toContain('Dani movió tu entrega de "nómina quincenal"')
})

// ------------------------------------------------------------
test('mover instancia NO visible para quien no es creador ni admin', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await irAPeticiones(page)
  await page.getByRole('button', { name: 'instancias recurrentes' }).click()
  const card = page.getByTestId('card-peticion').filter({ hasText: 'nómina quincenal' })
  await expect(card).toBeVisible() // es el destinatario, la ve
  await expect(card.getByTestId('btn-mover-instancia')).toHaveCount(0) // pero no puede moverla
})

// ------------------------------------------------------------
test('⚠ plazo ajustado (paridad margenPeticion): margen 1 → naranja, 2 → amarillo, 3+ → nada', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await irAPeticiones(page)

  const dx = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
  const crear = async (nombre: string, fecha: string) => {
    await page.getByTestId('btn-nueva-peticion').click()
    await page.locator('#pet-nombre').fill(nombre)
    await page.locator('#pet-area').selectOption('imkt')
    await page.locator('#pet-para').selectOption('Brenda')
    await page.locator('#pet-fecha').fill(fecha)
    // plazo ajustado: confirmar el checkbox de verificación (fricción, no bloqueo)
    const verificado = page.getByTestId('nudge-verificado')
    if (await verificado.count()) await verificado.check()
    await page.getByTestId('btn-crear-confirmar').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }

  await crear('urgencia mañana', dx(1))   // margen 1 → muy ajustado
  await crear('urgencia pasado', dx(2))   // margen 2 → ajustado
  await crear('con margen', dx(5))        // margen 5 → sin alerta

  await page.getByRole('button', { name: 'lo que pedí' }).click()
  const f1 = page.getByTestId('card-peticion').filter({ hasText: 'urgencia mañana' })
  const f2 = page.getByTestId('card-peticion').filter({ hasText: 'urgencia pasado' })
  const f3 = page.getByTestId('card-peticion').filter({ hasText: 'con margen' })

  await expect(f1.getByTestId('alerta-plazo')).toBeVisible()
  await expect(f1.getByTestId('alerta-plazo')).toHaveAttribute('title', /plazo muy ajustado: pedida con 1 día de margen/)
  await expect(f2.getByTestId('alerta-plazo')).toBeVisible()
  await expect(f2.getByTestId('alerta-plazo')).toHaveAttribute('title', /plazo ajustado: pedida con 2 días de margen/)
  await expect(f3.getByTestId('alerta-plazo')).toHaveCount(0)

  // grados → color (amarillo advertencia vs naranja urgente)
  await expect(f1.getByTestId('alerta-plazo')).toHaveClass(/text-movdi-naranja/)
  await expect(f2.getByTestId('alerta-plazo')).toHaveClass(/text-movdi-amarillo/)
})

// ------------------------------------------------------------
test('deployment skew: si la Server Action del bundle viejo ya no existe, avisa en vez de morir en silencio', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await irAPeticiones(page)

  // con la app al día, crear funciona normal
  await page.getByTestId('btn-nueva-peticion').click()
  await page.locator('#pet-nombre').fill('tarea skew')
  await page.locator('#pet-area').selectOption('imkt')
  await page.locator('#pet-para').selectOption('Brenda')
  await page.getByTestId('btn-crear-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // pestaña "vieja": todo POST de Server Action falla (deploy nuevo con la
  // app abierta). El flag simula que el auto-reload ya ocurrió, para poder
  // observar el aviso manual en vez de recargar la página del test.
  await page.evaluate(() => sessionStorage.setItem('movdi-recarga-version', '1'))
  await page.route('**/*', (route) => {
    const req = route.request()
    if (req.method() === 'POST' && req.headers()['next-action']) return route.abort()
    return route.continue()
  })

  await page.getByRole('button', { name: 'lo que pedí' }).click()
  const card = page.getByTestId('card-peticion').filter({ hasText: 'tarea skew' })
  await card.getByRole('button', { name: '▶ en proceso' }).click()

  // el click NO muere en silencio: aviso claro pidiendo recargar
  await expect(page.getByRole('alert').filter({ hasText: 'recarga la página' })).toBeVisible()
})

// ------------------------------------------------------------
// Estatus 'cancelada' (2026-09-08): terminal, pero NO es una entrega. Este
// test cuida que no ensucie las métricas — si alguien vuelve a escribir
// `estatus !== 'entregado'` para contar pendientes, aquí truena.
test('cancelada: sale de pendientes SIN contar como entregada, y tiene su propio filtro', async ({ page, browser }) => {
  await login(page, 'dani@movdi.mx')
  await irAPeticiones(page)

  // esperar a que cargue (los KPIs arrancan en 0 mientras llega el fetch)
  await expect(page.getByRole('row').filter({ hasText: 'diseñar reel' })).toHaveCount(1)
  const leer = async (k: string) =>
    Number(await page.getByTestId(`kpi-${k}`).locator('div').last().innerText())
  const antesPendientes = await leer('todas')
  const antesEntregadas = await leer('entregadas')
  expect(antesPendientes).toBeGreaterThan(0)

  // dar de baja a Brenda CANCELANDO su pendiente (p-seed-3 "diseñar reel")
  page.on('dialog', (d) => d.accept())
  await page.goto('/equipo')
  await page.getByTestId('card-persona').filter({ hasText: 'Brenda' }).getByTestId('btn-desactivar').click()
  await page.getByTestId('modo-pet-cancelar').click()
  await page.getByTestId('btn-reasign-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await estado()).peticiones.find((x) => x.id === 'p-seed-3')!.estatus).toBe('cancelada')

  // KPIs: una pendiente menos, y entregadas SIN moverse
  await irAPeticiones(page)
  await expect(page.getByRole('row').filter({ hasText: 'diseñar reel' })).toHaveCount(1)
  expect(await leer('todas')).toBe(antesPendientes - 1)
  expect(await leer('entregadas')).toBe(antesEntregadas)

  // no sale en "entregadas"; su única entrada es el chip nuevo
  await page.getByTestId('kpi-entregadas').click()
  await expect(page.getByRole('row').filter({ hasText: 'diseñar reel' })).toHaveCount(0)
  await page.getByRole('button', { name: 'canceladas', exact: true }).click()
  const fila = page.getByRole('row').filter({ hasText: 'diseñar reel' })
  await expect(fila).toHaveCount(1)
  await expect(fila.getByTestId('estatus-peticion')).toHaveText('cancelada ✕')

  // escape hatch: quien la creó puede reabrirla si se canceló de más
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'antonio@movdi.mx') // creador de p-seed-3
  await irAPeticiones(p2)
  await p2.getByRole('button', { name: 'canceladas', exact: true }).click()
  await p2.getByRole('row').filter({ hasText: 'diseñar reel' }).getByTestId('btn-reabrir').click()
  await expect(p2.getByRole('row').filter({ hasText: 'diseñar reel' })).toHaveCount(0) // ya no está cancelada
  expect((await estado()).peticiones.find((x) => x.id === 'p-seed-3')!.estatus).toBe('pendiente')
  await ctx.close()
})

// ------------------------------------------------------------
// Aprobación de entrega (cutover 12, 2026-09-18). Antes, entregar no avisaba
// NADA a quien pidió la petición y el ciclo se cerraba de un solo lado.
async function token(email: string) {
  const r = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  })
  return ((await r.json()) as { access_token: string }).access_token
}

// Brenda entrega 'diseñar reel' (p-seed-3), que le pidió Antonio.
async function entregarDiseñarReel(page: Page, nota = 'ya quedó el corte final') {
  await login(page, 'brenda@movdi.mx')
  await irAPeticiones(page)
  await page.getByRole('button', { name: 'mis pendientes' }).click()
  const card = page.getByTestId('card-peticion').filter({ hasText: 'diseñar reel' })
  await card.getByTestId('btn-entregar').click()
  await page.locator('#ent-nota').fill(nota)
  await page.getByTestId('btn-entrega-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  return card
}

test('entregar avisa a quien la pidió; aprobar avisa de vuelta y cierra el ciclo', async ({ page, browser }) => {
  const cardBrenda = await entregarDiseñarReel(page)

  // (1) el creador recibe la notificación de entrega
  let st = await estado()
  const aviso = st.notificaciones.find((n) => n.tipo === 'entrega_por_aprobar')!
  expect(aviso).toBeTruthy()
  expect(aviso.para).toBe('Antonio')
  expect(aviso.titulo).toBe('Brenda entregó "diseñar reel"')
  expect(aviso.detalle).toContain('revísala y apruébala')
  expect(aviso.detalle).toContain('ya quedó el corte final')
  expect(aviso.peticion_id).toBe('p-seed-3')
  // entregada, pero NO aprobada todavía
  expect(st.peticiones.find((x) => x.id === 'p-seed-3')!.aprobada_en).toBeNull()

  // (2) el destinatario ve que está esperando el visto bueno (y no puede aprobar)
  await expect(cardBrenda.getByTestId('esperando-aprobacion')).toBeVisible()
  await expect(cardBrenda.getByTestId('btn-aprobar-entrega')).toHaveCount(0)
  await expect(cardBrenda.getByTestId('btn-pedir-cambios')).toHaveCount(0)

  // (3) el creador la ve en su cola "por aprobar" y la aprueba
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'antonio@movdi.mx')
  await irAPeticiones(p2)
  await expect(p2.getByTestId('kpi-por_aprobar')).toContainText('1')
  await p2.getByTestId('kpi-por_aprobar').click()
  const card = p2.getByTestId('card-peticion').filter({ hasText: 'diseñar reel' })
  await expect(card.getByTestId('badge-por-aprobar')).toBeVisible()
  await card.getByTestId('btn-aprobar-entrega').click()

  // la cola se vacía: sale del filtro "por aprobar" y el KPI desaparece
  await expect(card).toHaveCount(0)
  await expect(p2.getByTestId('kpi-por_aprobar')).toHaveCount(0)
  // y en la lista completa queda sellada, sin perder el label de labelFecha
  await p2.getByRole('button', { name: 'todas', exact: true }).click()
  await expect(card.getByTestId('sello-aprobada')).toBeVisible()
  await expect(card.getByText('entregada ✓')).toBeVisible()
  await expect(card.getByTestId('badge-por-aprobar')).toHaveCount(0)

  st = await estado()
  const t = st.peticiones.find((x) => x.id === 'p-seed-3')!
  expect(t.estatus).toBe('entregado') // aprobar NO cambia el estatus
  expect(t.aprobada_en).toBeTruthy()
  expect(t.aprobada_por).toBe('Antonio')
  const ok = st.notificaciones.find((n) => n.tipo === 'entrega_aprobada')!
  expect(ok.para).toBe('Brenda')
  expect(ok.titulo).toBe('Antonio aprobó tu entrega de "diseñar reel"')
  await ctx.close()
})

// ------------------------------------------------------------
test('pedir cambios: motivo obligatorio, vuelve a pendiente con la línea en la descripción y avisa', async ({ page, browser }) => {
  await entregarDiseñarReel(page)

  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'antonio@movdi.mx')
  await irAPeticiones(p2)
  await p2.getByRole('button', { name: 'lo que pedí' }).click()
  const card = p2.getByTestId('card-peticion').filter({ hasText: 'diseñar reel' })
  await card.getByTestId('btn-pedir-cambios').click()

  // motivo corto → error, no guarda
  await p2.locator('#pc-motivo').fill('no')
  await p2.getByTestId('btn-cambios-confirmar').click()
  await expect(p2.getByRole('dialog').locator('p[role="alert"]')).toContainText('mínimo 3 caracteres')

  await p2.locator('#pc-motivo').fill('falta el corte vertical para stories')
  await p2.getByTestId('btn-cambios-confirmar').click()
  await expect(p2.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const t = st.peticiones.find((x) => x.id === 'p-seed-3')!
  expect(t.estatus).toBe('pendiente')
  expect(t.aprobada_en).toBeNull()
  expect(t.descripcion).toContain('↩ cambios pedidos (')
  expect(t.descripcion).toContain('Antonio): falta el corte vertical para stories')
  expect(t.descripcion).toContain('reel de talento') // no pisa lo que ya había

  const notif = st.notificaciones.find((n) => n.tipo === 'cambios_pedidos')!
  expect(notif.para).toBe('Brenda')
  expect(notif.titulo).toBe('Antonio pidió cambios en "diseñar reel"')
  expect(notif.detalle).toContain('falta el corte vertical para stories')
  await ctx.close()
})

// ------------------------------------------------------------
test('solo quien la pidió aprueba: un tercero no ve los botones y el API lo rechaza', async ({ page, browser }) => {
  await entregarDiseñarReel(page)

  // Karla (head, jefa de Brenda) VE la petición por RLS de equipo… pero no es
  // quien la pidió: nada de aprobar ni pedir cambios.
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'karla@movdi.mx')
  await irAPeticiones(p2)
  const card = p2.getByTestId('card-peticion').filter({ hasText: 'diseñar reel' })
  await expect(card).toBeVisible()
  await expect(card.getByTestId('btn-aprobar-entrega')).toHaveCount(0)
  await expect(card.getByTestId('btn-pedir-cambios')).toHaveCount(0)
  await expect(p2.getByTestId('kpi-por_aprobar')).toHaveCount(0)
  await ctx.close()

  // …y saltarse la UI tampoco sirve. Karla ni siquiera pasa la RLS de UPDATE
  // (no es creadora ni destinataria: su PATCH no toca ninguna fila), y a
  // Brenda —que SÍ puede editar la fila para entregarla— la frena el guard de
  // BD (trigger peticiones_guard_aprobacion).
  const patch = async (email: string) => {
    const tk = await token(email)
    return fetch(`${MOCK}/rest/v1/peticiones?id=eq.p-seed-3`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ aprobada_en: new Date().toISOString(), aprobada_por: 'Brenda' }),
    })
  }
  expect((await patch('brenda@movdi.mx')).status).toBeGreaterThanOrEqual(400)
  await patch('karla@movdi.mx') // pasa sin error, pero sin filas afectadas
  expect((await estado()).peticiones.find((x) => x.id === 'p-seed-3')!.aprobada_en).toBeNull()
})

// ------------------------------------------------------------
// Nadie se aprueba a sí mismo y nadie revisa lo que generó el sistema: las
// instancias recurrentes y los compromisos propios nacen aprobados de facto.
test('recurrentes y compromisos propios: sin aviso de entrega ni botones de aprobación', async ({ page, browser }) => {
  await login(page, 'antonio@movdi.mx')
  await irAPeticiones(page)

  // instancia recurrente (p-seed-2, patrón de Dani)
  await page.getByRole('button', { name: 'instancias recurrentes' }).click()
  const recur = page.getByTestId('card-peticion').filter({ hasText: 'nómina quincenal' })
  await recur.getByTestId('btn-entregar').click()
  await page.getByTestId('btn-entrega-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(recur.getByTestId('esperando-aprobacion')).toHaveCount(0)

  // compromiso propio (creador = destinatario)
  await page.getByTestId('btn-nuevo-compromiso').click()
  await page.locator('#comp-nombre').fill('ordenar carpeta de talento')
  await page.locator('#comp-origen').selectOption('propio')
  await page.getByTestId('btn-compromiso-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'mis pendientes' }).click()
  const propio = page.getByTestId('card-peticion').filter({ hasText: 'ordenar carpeta de talento' })
  await propio.getByTestId('btn-entregar').click()
  await page.getByTestId('btn-entrega-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(propio.getByTestId('btn-aprobar-entrega')).toHaveCount(0)
  await expect(propio.getByTestId('btn-reabrir')).toBeVisible() // el reabrir de siempre

  const st = await estado()
  expect(st.notificaciones.filter((n) => n.tipo === 'entrega_por_aprobar')).toHaveLength(0)

  // y Dani, creadora del patrón recurrente, no tiene cola que atender
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'dani@movdi.mx')
  await irAPeticiones(p2)
  await expect(p2.getByTestId('kpi-por_aprobar')).toHaveCount(0)
  await ctx.close()
})

// ------------------------------------------------------------
// Hueco detectado antes de aplicar la migración 12: una entrega aprobada
// conserva su botón "reabrir", y reabrir no limpiaba el sello — la
// RE-ENTREGA nacía ya aprobada, sin botones y sin cola, aunque nadie la
// hubiera revisado. El sello se limpia en cada entrega nueva.
test('aprobar → reabrir → re-entregar: la entrega nueva vuelve a la cola por aprobar', async ({ page, browser }) => {
  await entregarDiseñarReel(page, 'primera versión')

  // el creador aprueba
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'antonio@movdi.mx')
  await irAPeticiones(p2)
  await p2.getByTestId('kpi-por_aprobar').click()
  await p2.getByTestId('card-peticion').filter({ hasText: 'diseñar reel' })
    .getByTestId('btn-aprobar-entrega').click()
  await expect(p2.getByTestId('kpi-por_aprobar')).toHaveCount(0)
  expect((await estado()).peticiones.find((x) => x.id === 'p-seed-3')!.aprobada_por).toBe('Antonio')

  // la destinataria reabre (su botón de siempre) y vuelve a entregar
  await irAPeticiones(page)
  await page.getByRole('button', { name: 'mis pendientes' }).click()
  const card = page.getByTestId('card-peticion').filter({ hasText: 'diseñar reel' })
  await card.getByTestId('btn-reabrir').click()
  await expect(card.getByTestId('btn-entregar')).toBeVisible()
  await card.getByTestId('btn-entregar').click()
  await page.locator('#ent-nota').fill('segunda versión con el corte vertical')
  await page.getByTestId('btn-entrega-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // el sello NO sobrevive: la entrega nueva pide aprobación nueva
  let st = await estado()
  const t = st.peticiones.find((x) => x.id === 'p-seed-3')!
  expect(t.estatus).toBe('entregado')
  expect(t.aprobada_en).toBeNull()
  expect(t.aprobada_por).toBeNull()
  expect(st.notificaciones.filter((n) => n.tipo === 'entrega_por_aprobar')).toHaveLength(2)
  await expect(card.getByTestId('esperando-aprobacion')).toBeVisible()

  // y el creador la tiene otra vez en su cola, con los dos botones
  await irAPeticiones(p2)
  await expect(p2.getByTestId('kpi-por_aprobar')).toContainText('1')
  const card2 = p2.getByTestId('card-peticion').filter({ hasText: 'diseñar reel' })
  await expect(card2.getByTestId('badge-por-aprobar')).toBeVisible()
  await expect(card2.getByTestId('btn-aprobar-entrega')).toBeVisible()
  await expect(card2.getByTestId('btn-pedir-cambios')).toBeVisible()
  await expect(card2.getByTestId('sello-aprobada')).toHaveCount(0)
  await ctx.close()

  // el guard sigue siendo asimétrico: la destinataria puede LIMPIAR el sello
  // (es lo que hace su re-entrega) pero no ponerlo.
  const tk = await token('brenda@movdi.mx')
  const patch = (cuerpo: Record<string, unknown>) =>
    fetch(`${MOCK}/rest/v1/peticiones?id=eq.p-seed-3`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
  expect((await patch({ aprobada_en: new Date().toISOString(), aprobada_por: 'Brenda' })).status).toBeGreaterThanOrEqual(400)
  expect((await patch({ aprobada_en: null, aprobada_por: null })).status).toBeLessThan(400)
  st = await estado()
  expect(st.peticiones.find((x) => x.id === 'p-seed-3')!.aprobada_en).toBeNull()
})
