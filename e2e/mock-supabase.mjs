// Mock del API de Supabase (auth GoTrue + REST PostgREST con RLS simulada)
// para pruebas e2e locales — el sandbox de CI no tiene red a *.supabase.co.
//
// Usuarios de prueba (password universal: correcta123):
//   antonio@movdi.mx  ejecutivo (pm)     arylene@movdi.mx ejecutivo (pm)
//   brenda@movdi.mx   ejecutivo (imkt)   karla@movdi.mx   head (digital)
//   sarai@movdi.mx    rh (rh)            dani@movdi.mx    ceo/dirección
//   emmanuel@movdi.mx ceo
//
// RLS simulada (paridad con las policies reales del proyecto):
//   personas:      SELECT solo autenticados (anon → 42501)
//   peticiones:    SELECT privada→(creador|para) · no privada→(creador|para|ceo|head)
//                  INSERT creado_por=yo OR (origen_recur AND para=yo)
//                  UPDATE/DELETE creador|para (DELETE solo creador)
//   notificaciones INSERT autenticado (policy interim) · SELECT para=yo
//
// Endpoints de test: GET /__test/state · POST /__test/reset
import http from 'node:http'

const PORT = 54321
const PASS = 'correcta123'

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = () => Math.floor(Date.now() / 1000)
const uuid = () => 'mock-' + Math.random().toString(36).slice(2, 10)
const dx = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

const PERSONAS_BASE = [
  { nombre: 'Antonio', apellido: 'López', nivel: 'ejecutivo', areas: ['pm'], es_direccion: false },
  { nombre: 'Arylene', apellido: 'Ruiz', nivel: 'ejecutivo', areas: ['pm'], es_direccion: false },
  { nombre: 'Brenda', apellido: 'Mora', nivel: 'ejecutivo', areas: ['imkt'], es_direccion: false },
  { nombre: 'Karla', apellido: 'Vega', nivel: 'head', areas: ['digital'], es_direccion: false },
  { nombre: 'Sarai', apellido: 'Luna', nivel: 'rh', areas: ['rh'], es_direccion: false },
  { nombre: 'Dani', apellido: 'Ramírez', nivel: 'ceo', areas: ['pm'], es_direccion: true },
  { nombre: 'Emmanuel', apellido: 'Soto', nivel: 'ceo', areas: [], es_direccion: true },
].map((p, i) => ({
  id: `per-${i + 1}`,
  ...p,
  rol: p.nivel,
  email: `${p.nombre.toLowerCase()}@movdi.mx`,
  activo: true,
  pausada_hasta: null,
  needs_pass: false,
  managers: [],
  manager_principal: null,
  auth_user_id: `uid-${i + 1}`,
  created_at: new Date().toISOString(),
}))

let db
function reset() {
  db = {
    personas: structuredClone(PERSONAS_BASE),
    recurrentes: [
      {
        id: 'rec-1', nombre: 'nómina quincenal', descripcion: 'corrida de nómina',
        para: 'Antonio', area: 'pm', frecuencia: 'mensual', dia_semana: null, dia_mes: 15,
        activa: true, creado_por: 'Dani', created_at: new Date().toISOString(),
      },
      {
        // dia_semana = hoy → la próxima instancia virtual cae HOY (determinista)
        id: 'rec-2', nombre: 'standup semanal', descripcion: 'minuta del standup',
        para: 'Antonio', area: 'pm', frecuencia: 'semanal', dia_semana: new Date().getDay(), dia_mes: null,
        activa: true, creado_por: 'Dani', created_at: new Date().toISOString(),
      },
      {
        id: 'rec-3', nombre: 'reporte rh', descripcion: 'reporte mensual de rh',
        para: 'Antonio', area: 'rh', frecuencia: 'mensual', dia_semana: null, dia_mes: 28,
        activa: true, creado_por: 'Sarai', created_at: new Date().toISOString(),
      },
      {
        // quincenal REAL: ancla hace 14 días → HOY toca (determinista)
        id: 'rec-4', nombre: 'objetivos digital', descripcion: 'entrega de objetivos',
        para: 'Antonio', area: 'pm', frecuencia: 'quincenal',
        dia_semana: new Date().getDay(), dia_mes: null, fecha_inicio: dx(-14),
        activa: true, creado_por: 'Karla', created_at: new Date().toISOString(),
      },
    ],
    peticiones: [
      {
        id: 'p-seed-1', zona: 'general', nombre: 'reporte semanal', descripcion: 'kpis de la semana',
        creado_por: 'Dani', para: 'Antonio', area: 'pm', fecha: dx(5), prioridad: 'media',
        estatus: 'pendiente', privada: false, origen_recur: null, grupo_id: null,
        fecha_original: null, motivo_cambio_fecha: null, cambio_visto_por_creador: true,
        extension_justificada: null, link_entrega: null, nota_entrega: null, fecha_entrega: null,
        oculta_para: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
      {
        id: 'p-seed-2', zona: 'general', nombre: 'nómina quincenal', descripcion: 'corrida de nómina',
        creado_por: 'Dani', para: 'Antonio', area: 'pm', fecha: dx(3), prioridad: 'media',
        estatus: 'pendiente', privada: false, origen_recur: 'rec-1', grupo_id: null,
        fecha_original: null, motivo_cambio_fecha: null, cambio_visto_por_creador: true,
        extension_justificada: null, link_entrega: null, nota_entrega: null, fecha_entrega: null,
        oculta_para: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
      {
        id: 'p-seed-3', zona: 'general', nombre: 'diseñar reel', descripcion: 'reel de talento',
        creado_por: 'Antonio', para: 'Brenda', area: 'imkt', fecha: dx(4), prioridad: 'alta',
        estatus: 'pendiente', privada: false, origen_recur: null, grupo_id: null,
        fecha_original: null, motivo_cambio_fecha: null, cambio_visto_por_creador: true,
        extension_justificada: null, link_entrega: null, nota_entrega: null, fecha_entrega: null,
        oculta_para: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
    ],
    notificaciones: [],
  }
}
reset()

const tokens = new Map() // access_token -> email

function personaDe(email) {
  return db.personas.find((p) => p.email === email) ?? null
}
function requester(req) {
  const auth = req.headers.authorization || ''
  const tok = auth.replace(/^Bearer\s+/i, '')
  const email = tokens.get(tok)
  return email ? personaDe(email) : null
}
const esAdmin = (p) => p && (p.nivel === 'ceo' || p.nivel === 'head')

// ---- RLS simulada ----
function puedeVerPeticion(row, yo) {
  if (row.privada) return row.creado_por === yo.nombre || row.para === yo.nombre
  return row.creado_por === yo.nombre || row.para === yo.nombre || esAdmin(yo)
}
const puedeInsertarPeticion = (row, yo) =>
  row.creado_por === yo.nombre || (row.origen_recur && row.para === yo.nombre)
const puedeEditarPeticion = (row, yo) => row.creado_por === yo.nombre || row.para === yo.nombre
const puedeBorrarPeticion = (row, yo) => row.creado_por === yo.nombre

// ---- filtros PostgREST (col=eq.valor) ----
function aplicarFiltros(rows, sp) {
  let out = rows
  for (const [k, v] of sp.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue
    if (v.startsWith('eq.')) {
      const val = v.slice(3)
      out = out.filter((r) => String(r[k]) === val)
    }
  }
  return out
}

function makeJwt(email, sub) {
  return [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ sub, email, role: 'authenticated', aud: 'authenticated', iat: now(), exp: now() + 3600, session_id: uuid() }),
    'firma-mock',
  ].join('.')
}
const userJson = (p) => ({
  id: p.auth_user_id, aud: 'authenticated', role: 'authenticated', email: p.email,
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {}, identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
})

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Allow-Headers': '*',
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }

  let body = ''
  for await (const c of req) body += c
  const json = (code, obj) => {
    res.writeHead(code, { ...cors, 'Content-Type': 'application/json' })
    res.end(JSON.stringify(obj))
  }
  const denied = () => json(401, { code: '42501', message: 'permission denied', details: null, hint: null })

  console.log(`[mock] ${req.method} ${url.pathname}${url.search}`)

  // ---------- test helpers ----------
  if (url.pathname === '/__test/reset') { reset(); return json(200, { ok: true }) }
  if (url.pathname === '/__test/state') {
    return json(200, { peticiones: db.peticiones, notificaciones: db.notificaciones, recurrentes: db.recurrentes })
  }

  // ---------- auth ----------
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
    const { email, password } = JSON.parse(body || '{}')
    const p = personaDe((email || '').toLowerCase())
    if (p && password === PASS) {
      const access_token = makeJwt(p.email, p.auth_user_id)
      tokens.set(access_token, p.email)
      return json(200, {
        access_token, token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600,
        refresh_token: 'rt-' + uuid(), user: userJson(p),
      })
    }
    return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials', error_description: 'Invalid login credentials' })
  }
  if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
    const p = requester(req)
    if (p) return json(200, userJson(p))
    return json(401, { code: 401, error_code: 'no_session', msg: 'invalid JWT' })
  }
  if (url.pathname === '/auth/v1/logout') {
    const auth = req.headers.authorization || ''
    tokens.delete(auth.replace(/^Bearer\s+/i, ''))
    res.writeHead(204, cors); return res.end()
  }
  if (url.pathname === '/auth/v1/recover') return json(200, {})

  // ---------- REST ----------
  if (url.pathname.startsWith('/rest/v1/')) {
    const tabla = url.pathname.slice('/rest/v1/'.length)
    const yo = requester(req)
    const prefer = req.headers.prefer || ''
    const wantsObject = (req.headers.accept || '').includes('vnd.pgrst.object')
    const representar = (rows) => {
      if (wantsObject) {
        if (rows.length === 1) return json(200, rows[0])
        return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `${rows.length} rows`, hint: null })
      }
      return json(200, rows)
    }

    if (!yo) return denied() // todas nuestras tablas requieren sesión

    if (tabla === 'personas' && req.method === 'GET') {
      return representar(aplicarFiltros(db.personas, url.searchParams))
    }

    if (tabla === 'recurrentes') {
      // RLS: SELECT true · INSERT creado_por=yo · UPDATE/DELETE creador o ceo|head
      const puedeAdministrarRec = (r) => r.creado_por === yo.nombre || esAdmin(yo)
      if (req.method === 'GET') {
        return representar(aplicarFiltros(db.recurrentes, url.searchParams))
      }
      if (req.method === 'POST') {
        const input = JSON.parse(body || '[]')
        const filas = Array.isArray(input) ? input : [input]
        for (const f of filas) {
          if (f.creado_por !== yo.nombre) {
            return json(403, { code: '42501', message: 'new row violates row-level security policy for table "recurrentes"' })
          }
        }
        const creadas = filas.map((f) => ({
          id: uuid(), dia_semana: null, dia_mes: null, fecha_inicio: null, descripcion: null,
          activa: true, created_at: new Date().toISOString(), ...f,
        }))
        db.recurrentes.push(...creadas)
        if (prefer.includes('return=representation')) return representar(creadas)
        return json(201, [])
      }
      if (req.method === 'PATCH') {
        const cambios = JSON.parse(body || '{}')
        const objetivo = aplicarFiltros(db.recurrentes, url.searchParams).filter(puedeAdministrarRec)
        objetivo.forEach((r) => Object.assign(r, cambios))
        if (prefer.includes('return=representation')) return representar(objetivo)
        return json(204, [])
      }
      if (req.method === 'DELETE') {
        const objetivo = aplicarFiltros(db.recurrentes, url.searchParams).filter(puedeAdministrarRec)
        db.recurrentes = db.recurrentes.filter((r) => !objetivo.includes(r))
        if (prefer.includes('return=representation')) return representar(objetivo)
        return json(204, [])
      }
    }

    if (tabla === 'peticiones') {
      if (req.method === 'GET') {
        const visibles = db.peticiones.filter((r) => puedeVerPeticion(r, yo))
        return representar(aplicarFiltros(visibles, url.searchParams))
      }
      if (req.method === 'POST') {
        const input = JSON.parse(body || '[]')
        const filas = Array.isArray(input) ? input : [input]
        for (const f of filas) {
          if (!puedeInsertarPeticion(f, yo)) {
            return json(403, { code: '42501', message: 'new row violates row-level security policy for table "peticiones"' })
          }
        }
        const creadas = filas.map((f) => ({
          id: uuid(), oculta_para: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          fecha_original: null, motivo_cambio_fecha: null, cambio_visto_por_creador: true,
          extension_justificada: null, link_entrega: null, nota_entrega: null, fecha_entrega: null,
          origen_recur: null, grupo_id: null, descripcion: null, ...f,
        }))
        db.peticiones.push(...creadas)
        if (prefer.includes('return=representation')) return representar(creadas)
        return json(201, [])
      }
      if (req.method === 'PATCH') {
        const cambios = JSON.parse(body || '{}')
        const objetivo = aplicarFiltros(db.peticiones, url.searchParams).filter((r) => puedeEditarPeticion(r, yo))
        objetivo.forEach((r) => Object.assign(r, cambios, { updated_at: new Date().toISOString() }))
        if (prefer.includes('return=representation')) return representar(objetivo)
        return json(204, [])
      }
      if (req.method === 'DELETE') {
        const objetivo = aplicarFiltros(db.peticiones, url.searchParams).filter((r) => puedeBorrarPeticion(r, yo))
        db.peticiones = db.peticiones.filter((r) => !objetivo.includes(r))
        if (prefer.includes('return=representation')) return representar(objetivo)
        return json(204, [])
      }
    }

    if (tabla === 'notificaciones') {
      if (req.method === 'GET') {
        const mias = db.notificaciones.filter((n) => n.para === yo.nombre)
        return representar(aplicarFiltros(mias, url.searchParams))
      }
      if (req.method === 'POST') {
        const input = JSON.parse(body || '[]')
        const filas = (Array.isArray(input) ? input : [input]).map((f) => ({
          id: uuid(), vista: false, creada_en: new Date().toISOString(), detalle: null, peticion_id: null, ...f,
        }))
        db.notificaciones.push(...filas)
        if (prefer.includes('return=representation')) return representar(filas)
        return json(201, [])
      }
    }

    return json(404, { message: `tabla no soportada por el mock: ${tabla}` })
  }

  json(404, { msg: 'not found in mock' })
})

server.listen(PORT, () => console.log(`[mock] Supabase mock (auth+REST+RLS) en http://127.0.0.1:${PORT}`))
