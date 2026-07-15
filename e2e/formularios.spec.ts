import { test, expect, type Page } from '@playwright/test'
import { sumaDiasHabiles, hoyISO } from '../lib/peticiones'

// Formularios dinámicos por área (cutover 10): candado de bloqueantes,
// SLA → fecha automática, autocompletado del catálogo, condicionales de
// legal, y permisos del catálogo de clientes.

const MOCK = 'http://127.0.0.1:54321'
const PASS = 'correcta123'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(PASS)
  await page.getByRole('button', { name: 'entrar →' }).click()
  await expect(page.getByTestId('user-email')).toHaveText(email)
}

async function abrirModalCrear(page: Page) {
  await page.goto('/peticiones')
  await expect(page.getByRole('heading', { name: 'peticiones' })).toBeVisible()
  await page.getByTestId('btn-nueva-peticion').click()
}

async function estado() {
  const r = await fetch(`${MOCK}/__test/state`)
  return (await r.json()) as {
    peticiones: Record<string, unknown>[]
    clientes: Record<string, unknown>[]
  }
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('digital: sin tipo no hay crear; con brief el link es bloqueante', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await abrirModalCrear(page)

  await page.locator('#pet-nombre').fill('deck para cliente nuevo')
  await page.locator('#pet-area').selectOption('digital')
  await page.locator('#pet-para').selectOption('Karla')

  // sin tipo: candado
  await expect(page.getByTestId('form-dinamico')).toBeVisible()
  await expect(page.getByTestId('btn-crear-confirmar')).toBeDisabled()
  await expect(page.getByTestId('hint-bloqueantes')).toContainText('elige el tipo')

  // tipo con brief: el link es bloqueante
  await page.getByTestId('pet-tipo').selectOption('pitch_deck')
  await expect(page.getByTestId('btn-crear-confirmar')).toBeDisabled()
  await expect(page.getByTestId('hint-bloqueantes')).toContainText('link del brief')

  await page.locator('#det-link_brief').fill('https://www.notion.so/movdi/brief-deck')
  await expect(page.getByTestId('btn-crear-confirmar')).toBeEnabled()
  await page.getByTestId('btn-crear-confirmar').click()

  await expect(page.getByTestId('card-peticion').filter({ hasText: 'deck para cliente nuevo' })).toBeVisible()
  const st = await estado()
  const creada = st.peticiones.find((p) => p.nombre === 'deck para cliente nuevo')!
  expect(creada.tipo_peticion).toBe('pitch_deck')
  expect((creada.detalle as Record<string, unknown>).link_brief).toBe('https://www.notion.so/movdi/brief-deck')
})

// ------------------------------------------------------------
test('digital sin brief: la descripción es el bloqueante', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await abrirModalCrear(page)

  await page.locator('#pet-nombre').fill('ayuda con notion')
  await page.locator('#pet-area').selectOption('digital')
  await page.locator('#pet-para').selectOption('Karla')
  await page.getByTestId('pet-tipo').selectOption('asesoria_notion')

  await expect(page.getByTestId('btn-crear-confirmar')).toBeDisabled()
  await expect(page.getByTestId('hint-bloqueantes')).toContainText('descripción')

  await page.locator('#pet-desc').fill('necesito reordenar la base de talentos')
  await expect(page.getByTestId('btn-crear-confirmar')).toBeEnabled()
})

// ------------------------------------------------------------
test('factura: SLA fija la fecha (+2 hábiles) y el catálogo autocompleta los fiscales', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await abrirModalCrear(page)

  await page.locator('#pet-nombre').fill('factura campaña UD')
  await page.locator('#pet-area').selectOption('admi')
  await page.locator('#pet-para').selectOption('Lucia')
  await page.getByTestId('pet-tipo').selectOption('factura')

  // SLA: fecha automática, campo deshabilitado
  await expect(page.locator('#pet-fecha')).toBeDisabled()
  await expect(page.locator('#pet-fecha')).toHaveValue(sumaDiasHabiles(hoyISO(), 2))

  // autocompletado del catálogo
  await page.getByTestId('pet-cliente').selectOption('cli-1')
  await expect(page.locator('#det-rfc')).toHaveValue('UDM910101ABC')
  await expect(page.locator('#det-razon_social')).toHaveValue('Urban Decay México S.A. de C.V.')
  await expect(page.locator('#det-cliente_nombre')).toHaveValue('URBAN DECAY')

  // faltan los no-fiscales → sigue bloqueado
  await expect(page.getByTestId('btn-crear-confirmar')).toBeDisabled()
  await page.locator('#det-nombre_campana').fill('UD Verano')
  await page.locator('#det-id_campana').fill('C-2026-77')
  await page.locator('#det-metodo_pago').selectOption('PUE — pago en una sola exhibición')
  await page.locator('#det-forma_pago').fill('03 — transferencia electrónica')
  await page.locator('#det-concepto').fill('campaña de influencers julio')
  await page.locator('#det-importe_sin_iva').fill('150000')
  await page.locator('#det-correo_envio').fill('cuentas@urbandecay.mx')

  await expect(page.getByTestId('btn-crear-confirmar')).toBeEnabled()
  await page.getByTestId('btn-crear-confirmar').click()
  await expect(page.getByTestId('card-peticion').filter({ hasText: 'factura campaña UD' })).toBeVisible()

  const st = await estado()
  const creada = st.peticiones.find((p) => p.nombre === 'factura campaña UD')!
  expect(creada.tipo_peticion).toBe('factura')
  expect(creada.fecha).toBe(sumaDiasHabiles(hoyISO(), 2)) // el SERVIDOR calculó el SLA
  expect(creada.cliente_id).toBe('cli-1')
  const det = creada.detalle as Record<string, unknown>
  expect(det.rfc).toBe('UDM910101ABC')
  expect(det.importe_sin_iva).toBe('150000')
})

// ------------------------------------------------------------
test('legal ruta B: contrato bloqueante, condicionales y aviso de constancia vencida', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await abrirModalCrear(page)

  await page.locator('#pet-nombre').fill('contrato campaña lizz')
  await page.locator('#pet-area').selectOption('legal')
  await page.locator('#pet-para').selectOption('Lucia')
  await page.getByTestId('pet-tipo').selectOption('contrato_cliente')

  // LIZZ APP: constancia de hace ~5 meses → AVISO (no bloqueo) + condicionales
  await page.getByTestId('pet-cliente').selectOption('cli-2')
  await expect(page.getByTestId('aviso-detalle')).toContainText('más de 3 meses')
  // persona moral (del catálogo) → aparece el doc de facultades
  await expect(page.locator('#det-facultades_doc_url')).toBeVisible()
  // domicilio comercial del catálogo → la pregunta se respondió sola
  await expect(page.locator('#det-domicilio_comercial')).toHaveValue('Polanco 22, CDMX')

  // bloqueantes restantes: comunes + contrato del cliente (ruta B)
  await page.locator('#det-nombre_campana').fill('Lizz Q3')
  await page.locator('#det-talento_firmar').fill('Crystal Molly')
  await page.locator('#det-correo_contacto_cliente').fill('alejandra@lizzapp.com')
  await expect(page.getByTestId('btn-crear-confirmar')).toBeDisabled()
  await expect(page.getByTestId('hint-bloqueantes')).toContainText('contrato del cliente')
  await page.locator('#det-contrato_cliente_url').fill('https://drive.google.com/lizz-contrato')

  // se puede crear aunque falten recomendados — y lo dice
  await expect(page.getByTestId('nota-recomendados')).toContainText('identificación del firmante')
  await expect(page.getByTestId('btn-crear-confirmar')).toBeEnabled()
  await page.getByTestId('btn-crear-confirmar').click()

  // la tarjeta marca los recomendados faltantes (calculado en vivo)
  const fila = page.getByTestId('card-peticion').filter({ hasText: 'contrato campaña lizz' })
  await expect(fila).toBeVisible()
  await expect(fila.getByTestId('chip-faltantes')).toContainText('identificación del firmante')

  const st = await estado()
  const creada = st.peticiones.find((p) => p.nombre === 'contrato campaña lizz')!
  expect(creada.tipo_peticion).toBe('contrato_cliente')
  const det = creada.detalle as Record<string, unknown>
  expect(det.domicilio_difiere).toBe(true)
  expect(det.contrato_cliente_url).toBe('https://drive.google.com/lizz-contrato')
})

// ------------------------------------------------------------
test('catálogo: Lucia (admi) edita; Antonio solo lee; la RLS del mock rechaza su escritura', async ({ page, browser }) => {
  // Lucia: pestaña visible, alta manual
  await login(page, 'lucia@movdi.mx')
  await page.getByRole('link', { name: 'clientes' }).click()
  await expect(page.getByRole('heading', { name: '🗂 catálogo de clientes' })).toBeVisible()
  await page.getByTestId('btn-agregar-cliente').click()
  await page.locator('#cli-nombre').fill('SEPHORA MX')
  await page.locator('#cli-rfc').fill('SEP120101MX1')
  await page.getByTestId('btn-guardar-cliente').click()
  await expect(page.getByTestId('nota-clientes')).toContainText('agregado al catálogo')
  await expect(page.getByTestId('fila-cliente').filter({ hasText: 'SEPHORA MX' })).toBeVisible()

  // Antonio: sin pestaña, página solo lectura, escritura rechazada por RLS
  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await login(p2, 'antonio@movdi.mx')
  await expect(p2.getByRole('link', { name: 'clientes' })).toHaveCount(0)
  await p2.goto('/clientes')
  await expect(p2.getByText('solo lectura')).toBeVisible()
  await expect(p2.getByTestId('btn-agregar-cliente')).toHaveCount(0)

  const tokenR = await fetch(`${MOCK}/auth/v1/token?grant_type=password`, {
    method: 'POST', body: JSON.stringify({ email: 'antonio@movdi.mx', password: PASS }),
  })
  const tok = ((await tokenR.json()) as { access_token: string }).access_token
  const intento = await fetch(`${MOCK}/rest/v1/clientes`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
    body: JSON.stringify({ nombre: 'HACKED SA', creado_por: 'Antonio' }),
  })
  expect(intento.status).toBe(403)
  await ctx.close()
})

// ------------------------------------------------------------
test('catálogo: importación CSV inserta nuevos, salta existentes y reporta', async ({ page }) => {
  await login(page, 'lucia@movdi.mx')
  await page.goto('/clientes')
  await page.getByTestId('btn-importar-csv').click()
  await page.locator('#csv-texto').fill(
    'nombre,rfc,razon_social,columna_rara\n' +
    '"LOREAL MX","LOR010101MX1","L\'Oréal México S.A. de C.V.",x\n' +
    'URBAN DECAY,YA-EXISTE,,y\n',
  )
  await page.getByTestId('btn-csv-confirmar').click()

  await expect(page.getByTestId('nota-clientes')).toContainText('importados: 1')
  await expect(page.getByTestId('nota-clientes')).toContainText('saltados (ya existían): 1')
  await expect(page.getByTestId('nota-clientes')).toContainText('columnas ignoradas: columna_rara')

  const st = await estado()
  const loreal = st.clientes.find((c) => c.nombre === 'LOREAL MX')!
  expect(loreal.rfc).toBe('LOR010101MX1')
  // URBAN DECAY no se pisó
  expect(st.clientes.find((c) => c.id === 'cli-1')!.rfc).toBe('UDM910101ABC')
})

// ------------------------------------------------------------
test('catálogo: la baja normal es desactivar (y el cliente sale del selector del form)', async ({ page }) => {
  await login(page, 'lucia@movdi.mx')
  await page.goto('/clientes')
  const fila = page.getByTestId('fila-cliente').filter({ hasText: 'LIZZ APP' })
  // eliminar no está para admi (solo dirección, y solo inactivos)
  await expect(fila.getByTestId('btn-eliminar-cliente')).toHaveCount(0)
  await fila.getByTestId('btn-activo-cliente').click()
  await expect(page.getByTestId('nota-clientes')).toContainText('desactivado')

  const st = await estado()
  expect(st.clientes.find((c) => c.id === 'cli-2')!.activo).toBe(false)

  // en el form de peticiones ya no aparece
  await abrirModalCrear(page)
  await page.locator('#pet-area').selectOption('admi')
  await page.getByTestId('pet-tipo').selectOption('factura')
  await expect(page.getByTestId('pet-cliente').locator('option', { hasText: 'LIZZ APP' })).toHaveCount(0)
  await expect(page.getByTestId('pet-cliente').locator('option', { hasText: 'URBAN DECAY' })).toHaveCount(1)
})
