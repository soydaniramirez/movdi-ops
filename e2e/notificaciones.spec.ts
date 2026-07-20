import { test, expect, type Page } from '@playwright/test'
import { configurarCanalNotificaciones, iconoNotif, mapNotifRow, tiempoRelativo } from '../lib/notificaciones'

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
  return (await r.json()) as { notificaciones: Record<string, unknown>[] }
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__test/reset`, { method: 'POST' })
})

// ------------------------------------------------------------
test('campana: badge cuenta no vistas; panel lista ordenado con iconos', async ({ page }) => {
  await login(page, 'antonio@movdi.mx') // seeds: 2 sin ver + 1 vista
  await expect(page.getByTestId('badge-notif')).toHaveText('2')

  await page.getByTestId('btn-campana').click()
  const items = page.getByTestId('notif-item')
  await expect(items).toHaveCount(3)
  // orden: más reciente primero (n-seed-1, hace 1h)
  await expect(items.first()).toContainText('nueva petición de Dani')
  await expect(items.first()).toContainText('📥')
  await expect(page.getByTestId('notif-dot')).toHaveCount(2)
})

// ------------------------------------------------------------
test('marcar leída al click navega a la petición y la resalta; marcar todas; el badge se actualiza', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.getByTestId('btn-campana').click()

  // clic en una notif CON petición ligada (decisión 2026-07-20): marca vista
  // Y navega a /peticiones?pet=<id> con la fila resaltada
  await page.getByTestId('notif-item').first().click()
  await expect(page).toHaveURL(/\/peticiones\?pet=p-seed-1/)
  await expect(page.locator('#pet-row-p-seed-1')).toBeVisible()
  await expect(page.getByTestId('badge-notif')).toHaveText('1')
  let st = await estado()
  expect((st.notificaciones.find((n) => n.id === 'n-seed-1'))!.vista).toBe(true)

  // el panel se cerró al navegar — se reabre desde el header (persiste en toda la app)
  await page.getByTestId('btn-campana').click()
  await page.getByTestId('btn-marcar-todas').click()
  await expect(page.getByTestId('badge-notif')).toHaveCount(0) // sin no-vistas
  st = await estado()
  expect(st.notificaciones.filter((n) => n.para === 'Antonio').every((n) => n.vista)).toBe(true)
})

// ------------------------------------------------------------
test('borrar una y borrar todas (RLS: solo filas propias)', async ({ page }) => {
  await login(page, 'antonio@movdi.mx')
  await page.getByTestId('btn-campana').click()

  await page.getByTestId('notif-item').first().hover()
  await page.getByTestId('btn-borrar-notif').first().click()
  await expect(page.getByTestId('notif-item')).toHaveCount(2)
  let st = await estado()
  expect(st.notificaciones.find((n) => n.id === 'n-seed-1')).toBeUndefined()

  await page.getByTestId('btn-borrar-todas').click()
  await expect(page.getByText('sin notificaciones todavía')).toBeVisible()
  st = await estado()
  expect(st.notificaciones.filter((n) => n.para === 'Antonio')).toHaveLength(0)
})

// ------------------------------------------------------------
test('aislamiento RLS: otro usuario no ve notifs ajenas', async ({ page }) => {
  await login(page, 'brenda@movdi.mx')
  await expect(page.getByTestId('badge-notif')).toHaveCount(0)
  await page.getByTestId('btn-campana').click()
  await expect(page.getByText('sin notificaciones todavía')).toBeVisible()
})

// ------------------------------------------------------------
// REALTIME — el mock no cubre websockets. Esto prueba NUESTRO cableado:
// nombre de canal, filtro por usuario, evento y mapeo del payload — con un
// cliente falso que captura los argumentos (la entrega del websocket en sí
// queda para el QA de fase 5 contra el proyecto real; ver checklist).
test('realtime (unitario): canal notif-<nombre>, filtro para=eq.<nombre>, INSERT mapeado', () => {
  const capturado: {
    canal?: string
    tipo?: string
    filtro?: Record<string, string>
    handler?: (p: { new: unknown }) => void
    suscrito: boolean
  } = { suscrito: false }

  const clienteFalso = {
    channel: (nombre: string) => {
      capturado.canal = nombre
      return {
        on: (tipo: string, filtro: Record<string, string>, cb: (p: { new: unknown }) => void) => {
          capturado.tipo = tipo
          capturado.filtro = filtro
          capturado.handler = cb
          return { subscribe: () => { capturado.suscrito = true; return 'canal' } }
        },
      }
    },
  }

  const recibidas: unknown[] = []
  configurarCanalNotificaciones(clienteFalso, 'Antonio', (n) => recibidas.push(n))

  // cableado exacto (paridad _notifChannel del SPA)
  expect(capturado.canal).toBe('notif-Antonio')
  expect(capturado.tipo).toBe('postgres_changes')
  expect(capturado.filtro).toEqual({
    event: 'INSERT', schema: 'public', table: 'notificaciones', filter: 'para=eq.Antonio',
  })
  expect(capturado.suscrito).toBe(true)

  // llega un INSERT → el callback recibe la notif mapeada
  capturado.handler!({
    new: {
      id: 'n9', para: 'Antonio', tipo: 'recurrente_hoy', titulo: '↻ hoy toca "standup"',
      detalle: 'entrega recurrente de hoy · creada por Dani', peticion_id: null,
      vista: false, creada_en: '2026-07-03T13:00:00Z',
    },
  })
  expect(recibidas).toHaveLength(1)
  expect(recibidas[0]).toMatchObject({ id: 'n9', tipo: 'recurrente_hoy', vista: false, peticionId: null })
})

// ------------------------------------------------------------
test('iconos y tiempo relativo (paridad SPA + tipo nuevo recurrente_hoy)', () => {
  expect(iconoNotif('nueva_peticion')).toBe('📥')
  expect(iconoNotif('fecha_cambiada')).toBe('📅')
  expect(iconoNotif('reabierta')).toBe('🔄')
  expect(iconoNotif('estrella')).toBe('⭐')
  expect(iconoNotif('recurrente_hoy')).toBe('↻')
  expect(iconoNotif('otro_tipo')).toBe('🔔')

  const ahora = Date.parse('2026-07-03T12:00:00Z')
  const iso = (s: number) => new Date(ahora - s * 1000).toISOString()
  expect(tiempoRelativo(iso(30), ahora)).toBe('hace un momento')
  expect(tiempoRelativo(iso(300), ahora)).toBe('hace 5 min')
  expect(tiempoRelativo(iso(7200), ahora)).toBe('hace 2 h')
  expect(tiempoRelativo(iso(172800), ahora)).toBe('hace 2 d')

  // mapNotifRow completo
  const n = mapNotifRow({ id: 'x', para: 'A', tipo: 't', titulo: 'T', detalle: null, peticion_id: 'p1', vista: true, creada_en: 'z' })
  expect(n).toEqual({ id: 'x', para: 'A', tipo: 't', titulo: 'T', detalle: null, peticionId: 'p1', vista: true, creadaEn: 'z' })
})
