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
  await page.getByTestId('btn-crear-confirmar').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const st = await estado()
  const filas = st.peticiones.filter((p) => p.nombre === 'actualizar firma de correo')
  // disponibles menos ceo (Dani, Emmanuel): Antonio, Arylene, Brenda, Karla, Sarai
  expect(filas.map((f) => f.para).sort()).toEqual(['Antonio', 'Arylene', 'Brenda', 'Karla', 'Sarai'])
  const grupos = new Set(filas.map((f) => f.grupo_id))
  expect(grupos.size).toBe(1)
  expect([...grupos][0]).not.toBeNull()
  expect(filas.every((f) => f.creado_por === 'Dani')).toBe(true)

  const notifs = st.notificaciones.filter((n) => n.tipo === 'nueva_peticion' && !String(n.id).startsWith('n-seed-'))
  expect(notifs).toHaveLength(5)
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
