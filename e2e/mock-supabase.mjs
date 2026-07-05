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
// mes anterior al de la ejecución (para seeds de gamificación deterministas)
const MES_PREV = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 7) })()

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
  rol: p.rol ?? p.nivel,
  email: `${p.nombre.toLowerCase()}@movdi.mx`,
  activo: true,
  pausada_hasta: null,
  needs_pass: false,
  // Fase 4.8: flag "ve todo" en gamificación — true solo dirección (Dani/Emmanuel)
  ve_gamificacion_completa: p.es_direccion === true,
  // managers para el semáforo: Antonio→Dani (apoyo Karla), Brenda→Karla, Arylene→Dani
  managers: p.nombre === 'Antonio' ? ['Karla'] : [],
  manager_principal:
    p.nombre === 'Antonio' || p.nombre === 'Arylene' ? 'Dani'
    : p.nombre === 'Brenda' ? 'Karla' : null,
  auth_user_id: `uid-${i + 1}`,
  created_at: new Date().toISOString(),
}))

// Emails que existen en Auth pero NO en personas (para probar el invite 422)
const AUTH_SOLO_EMAILS = ['exempleado@movdi.mx']
const SERVICE_KEY = 'sb_secret_test'

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
      // ↓ entregas del MES ANTERIOR para el cierre de mes (Antonio, 7 entregas:
      // 70 base + 3 anticipación (p-jun-1) + 15 estrella = 88 XP → nivel 2)
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `p-prev-${i + 1}`, zona: 'general', nombre: `entrega prev ${i + 1}`, descripcion: null,
        creado_por: 'Dani', para: 'Antonio', area: 'pm', fecha: `${MES_PREV}-${String(5 + i).padStart(2, '0')}`,
        prioridad: 'media', estatus: 'entregado', privada: false, origen_recur: null, grupo_id: null,
        fecha_original: null, motivo_cambio_fecha: null, cambio_visto_por_creador: true,
        extension_justificada: null, link_entrega: null, nota_entrega: null,
        // solo la primera con anticipación 3+ días (bonus +3); el resto sin dato
        fecha_entrega: i === 0 ? `${MES_PREV}-02` : null,
        oculta_para: [], created_at: `${MES_PREV}-01T12:00:00Z`, updated_at: `${MES_PREV}-01T12:00:00Z`,
      })),
      {
        id: 'p-seed-3', zona: 'general', nombre: 'diseñar reel', descripcion: 'reel de talento',
        creado_por: 'Antonio', para: 'Brenda', area: 'imkt', fecha: dx(4), prioridad: 'alta',
        estatus: 'pendiente', privada: false, origen_recur: null, grupo_id: null,
        fecha_original: null, motivo_cambio_fecha: null, cambio_visto_por_creador: true,
        extension_justificada: null, link_entrega: null, nota_entrega: null, fecha_entrega: null,
        oculta_para: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
    ],
    notificaciones: [
      { id: 'n-seed-1', para: 'Antonio', tipo: 'nueva_peticion', titulo: 'nueva petición de Dani', detalle: 'reporte semanal', peticion_id: 'p-seed-1', vista: false, creada_en: new Date(Date.now() - 3600e3).toISOString() },
      { id: 'n-seed-2', para: 'Antonio', tipo: 'fecha_cambiada', titulo: 'Dani extendió el plazo de "reporte semanal"', detalle: 'nueva fecha: 10 jul', peticion_id: 'p-seed-1', vista: false, creada_en: new Date(Date.now() - 7200e3).toISOString() },
      { id: 'n-seed-3', para: 'Antonio', tipo: 'estrella', titulo: 'Brenda te dio una estrella ⭐', detalle: '"gran apoyo"', peticion_id: null, vista: true, creada_en: new Date(Date.now() - 86400e3).toISOString() },
    ],
    anuncios: [
      { id: 'a-seed-1', titulo: 'junta general viernes', contenido: 'junta de todo el equipo el viernes 10am', tipo: 'importante', audiencia: 'todos', creado_por: 'Dani', creado_en: new Date(Date.now() - 86400e3).toISOString(), expira_en: null, activo: true },
      { id: 'a-seed-2', titulo: 'revisión de presupuestos', contenido: 'heads: revisar presupuestos q3', tipo: 'urgente', audiencia: 'heads', creado_por: 'Dani', creado_en: new Date(Date.now() - 3600e3).toISOString(), expira_en: null, activo: true },
      { id: 'a-seed-3', titulo: 'nuevo brandbook imkt', contenido: 'ya está el brandbook actualizado', tipo: 'informativo', audiencia: 'area_imkt', creado_por: 'Sarai', creado_en: new Date(Date.now() - 3600e3).toISOString(), expira_en: null, activo: true },
      { id: 'a-seed-4', titulo: 'anuncio expirado', contenido: 'esto ya venció', tipo: 'informativo', audiencia: 'todos', creado_por: 'Dani', creado_en: new Date(Date.now() - 172800e3).toISOString(), expira_en: new Date(Date.now() - 86400e3).toISOString(), activo: true },
    ],
    anuncios_vistos: [
      { anuncio_id: 'a-seed-1', persona_nombre: 'Brenda', visto_en: new Date().toISOString() },
    ],
    todos: [
      { id: 't-seed-1', user_nombre: 'Antonio', texto: 'preparar junta con talento', hecho: false, created_at: new Date(Date.now() - 7200e3).toISOString() },
      { id: 't-seed-2', user_nombre: 'Antonio', texto: 'mandar factura de mayo', hecho: true, created_at: new Date(Date.now() - 86400e3).toISOString() },
      { id: 't-seed-3', user_nombre: 'Brenda', texto: 'secreto de brenda', hecho: false, created_at: new Date().toISOString() },
    ],
    estrellas: [
      // mes/semana pasados (no cuenta para el límite de esta semana; suma +15 XP al MES_PREV)
      { id: 'e-seed-1', de_persona: 'Brenda', para_persona: 'Antonio', motivo: 'me ayudó con el pitch', semana: '2020-W01', creada_en: `${MES_PREV}-22T12:00:00Z` },
    ],
    historial_mensual: [],
    feedback: [],
    recompensas: [
      { id: 'rw-2', nivel: 2, descripcion: 'tarde libre', activa: true },
      { id: 'rw-3', nivel: 3, descripcion: 'comida con dirección', activa: true },
      { id: 'rw-4', nivel: 4, descripcion: 'día libre', activa: true },
      { id: 'rw-5', nivel: 5, descripcion: 'bono élite', activa: true },
    ],
    invites: [],           // emails invitados via /auth/v1/invite (service key)
    fallarUnaVez: null,    // { tabla, metodo } → el siguiente request a esa combinación devuelve 500
    // usuarios que EXISTEN en Auth (≠ personas: una persona recién insertada aún no tiene cuenta)
    authUsers: [...PERSONAS_BASE.map((p) => `${p.nombre.toLowerCase()}@movdi.mx`), ...AUTH_SOLO_EMAILS],
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
    } else if (v.startsWith('in.(')) {
      const vals = v.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, ''))
      out = out.filter((r) => vals.includes(String(r[k])))
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
  if (url.pathname === '/__test/fallar') {
    db.fallarUnaVez = JSON.parse(body || 'null') // { tabla, metodo }
    return json(200, { ok: true })
  }
  if (url.pathname === '/__test/state') {
    return json(200, {
      peticiones: db.peticiones, notificaciones: db.notificaciones, recurrentes: db.recurrentes,
      anuncios: db.anuncios, anuncios_vistos: db.anuncios_vistos,
      todos: db.todos, estrellas: db.estrellas,
      personas: db.personas, invites: db.invites,
      historial_mensual: db.historial_mensual, recompensas: db.recompensas,
      feedback: db.feedback,
    })
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

  // Invite (solo admin/service_role): usado por el alta de personas.
  if (url.pathname === '/auth/v1/invite' && req.method === 'POST') {
    const auth = req.headers.authorization || ''
    if (!auth.includes(SERVICE_KEY)) {
      return json(401, { code: 401, error_code: 'no_authorization', msg: 'invite requires service role key' })
    }
    const { email } = JSON.parse(body || '{}')
    if (db.authUsers.includes(email)) {
      return json(422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' })
    }
    db.invites.push(email)
    db.authUsers.push(email)
    return json(200, { id: uuid(), email, invited_at: new Date().toISOString() })
  }

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

    // service_role (helper de notificaciones del servidor): sin RLS, pero el
    // mock solo admite los DOS accesos que hace lib/supabase/notificar.ts —
    // leer personas y hacer insert en notificaciones. Cualquier otra cosa con
    // la service key es un uso no auditado y debe fallar en las pruebas.
    const esService = !yo && (req.headers.authorization || '').includes(SERVICE_KEY)
    if (!yo && !esService) return denied() // todas nuestras tablas requieren sesión
    if (esService && !(
      (tabla === 'personas' && req.method === 'GET') ||
      (tabla === 'notificaciones' && req.method === 'POST')
    )) return denied()

    // fallo inyectable (pruebas de atomicidad)
    if (db.fallarUnaVez && db.fallarUnaVez.tabla === tabla && db.fallarUnaVez.metodo === req.method) {
      db.fallarUnaVez = null
      return json(500, { code: '57014', message: 'simulated failure (test)' })
    }

    // RPC desactivar_persona_con_reasignacion — espejo de la función SQL
    // SECURITY DEFINER (migración cutover 20260704120000): check de rol
    // DENTRO, sin RLS en los updates (toca filas de terceros), transaccional
    // (en el mock: valida todo ANTES de mutar; un fallo inyectado ocurre
    // antes de cualquier mutación, como el raise de Postgres).
    // RPC podio_mes_cerrado — espejo de la función SQL (security definer):
    // top 3 del mes cerrado indicado (o el último anterior al actual), solo
    // persona/cumplimiento/mes. Disponible para cualquier autenticado.
    if (tabla === 'rpc/podio_mes_cerrado' && req.method === 'POST') {
      const { p_mes } = JSON.parse(body || '{}')
      const mesActual = new Date().toISOString().slice(0, 7)
      const meses = db.historial_mensual.map((h) => h.mes).filter((m) => m < mesActual)
      const mes = p_mes ?? (meses.length ? meses.sort().at(-1) : null)
      const top3 = db.historial_mensual
        .filter((h) => h.mes === mes)
        .sort((a, b) => (b.xp_total ?? 0) - (a.xp_total ?? 0))
        .slice(0, 3)
        .map((h) => ({ persona: h.persona, cumplimiento: h.cumplimiento ?? 0, mes: h.mes }))
      return json(200, top3)
    }

    if (tabla === 'rpc/desactivar_persona_con_reasignacion' && req.method === 'POST') {
      const { p_persona_id, p_reasignar_peticiones_a, p_reasignar_recurrentes_a } = JSON.parse(body || '{}')
      if (!esAdmin(yo)) return json(400, { code: 'P0001', message: 'solo dirección o heads pueden desactivar personas' })
      const persona = db.personas.find((p) => p.id === p_persona_id)
      if (!persona) return json(400, { code: 'P0001', message: 'persona no encontrada' })
      const destinoValido = (nombre) => {
        if (!nombre) return true
        const d = db.personas.find((p) => p.nombre === nombre)
        return !!d && d.id !== persona.id && d.activo !== false && !d.pausada_hasta
      }
      if (!destinoValido(p_reasignar_peticiones_a) || !destinoValido(p_reasignar_recurrentes_a)) {
        return json(400, { code: 'P0001', message: 'destino inválido' })
      }
      const pets = db.peticiones.filter((t) => t.para.toLowerCase() === persona.nombre.toLowerCase() && t.estatus !== 'entregado')
      const recs = db.recurrentes.filter((r) => r.para.toLowerCase() === persona.nombre.toLowerCase() && r.activa)
      if (pets.length > 0 && !p_reasignar_peticiones_a) return json(400, { code: 'P0001', message: 'elige a quién reasignar las peticiones' })
      if (recs.length > 0 && !p_reasignar_recurrentes_a) return json(400, { code: 'P0001', message: 'elige a quién reasignar las recurrentes' })
      // mutación (sin RLS: definer)
      pets.forEach((t) => { t.para = p_reasignar_peticiones_a })
      recs.forEach((r) => { r.para = p_reasignar_recurrentes_a })
      persona.activo = false
      return json(200, { peticiones_reasignadas: pets.length, recurrentes_reasignadas: recs.length })
    }

    if (tabla === 'personas') {
      // RLS: SELECT autenticados · INSERT/UPDATE/DELETE solo ceo|head (personas_modify_admin)
      if (req.method === 'GET') {
        return representar(aplicarFiltros(db.personas, url.searchParams))
      }
      if (req.method === 'POST') {
        if (!esAdmin(yo)) {
          return json(403, { code: '42501', message: 'new row violates row-level security policy for table "personas"' })
        }
        const input = JSON.parse(body || '[]')
        const filas = Array.isArray(input) ? input : [input]
        for (const f of filas) {
          if (f.email && db.personas.some((p) => p.email === f.email)) {
            return json(409, { code: '23505', message: 'duplicate key value violates unique constraint "personas_email_key"' })
          }
        }
        const creadas = filas.map((f) => ({
          id: uuid(), activo: true, pausada_hasta: null, needs_pass: false, managers: [],
          manager_principal: null, es_direccion: false, auth_user_id: null,
          created_at: new Date().toISOString(), ...f,
        }))
        db.personas.push(...creadas)
        if (prefer.includes('return=representation')) return representar(creadas)
        return json(201, [])
      }
      if (req.method === 'PATCH') {
        const cambios = JSON.parse(body || '{}')
        const objetivo = esAdmin(yo) ? aplicarFiltros(db.personas, url.searchParams) : []
        objetivo.forEach((r) => Object.assign(r, cambios))
        if (prefer.includes('return=representation')) return representar(objetivo)
        return json(204, [])
      }
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
      // RLS: SELECT/UPDATE/DELETE para = mi_nombre() · INSERT autenticado (interim)
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
      if (req.method === 'PATCH') {
        const cambios = JSON.parse(body || '{}')
        const objetivo = aplicarFiltros(db.notificaciones, url.searchParams).filter((n) => n.para === yo.nombre)
        objetivo.forEach((n) => Object.assign(n, cambios))
        if (prefer.includes('return=representation')) return representar(objetivo)
        return json(204, [])
      }
      if (req.method === 'DELETE') {
        const objetivo = aplicarFiltros(db.notificaciones, url.searchParams).filter((n) => n.para === yo.nombre)
        db.notificaciones = db.notificaciones.filter((n) => !objetivo.includes(n))
        if (prefer.includes('return=representation')) return representar(objetivo)
        return json(204, [])
      }
    }

    if (tabla === 'anuncios') {
      // RLS: SELECT true · INSERT creador+nivel(ceo|head|rh) · UPDATE/DELETE creador
      if (req.method === 'GET') {
        return representar(aplicarFiltros(db.anuncios, url.searchParams))
      }
      if (req.method === 'POST') {
        const input = JSON.parse(body || '[]')
        const filas = Array.isArray(input) ? input : [input]
        for (const f of filas) {
          const nivelOk = ['ceo', 'head', 'rh'].includes(yo.nivel)
          if (f.creado_por !== yo.nombre || !nivelOk) {
            return json(403, { code: '42501', message: 'new row violates row-level security policy for table "anuncios"' })
          }
        }
        const creadas = filas.map((f) => ({
          id: uuid(), creado_en: new Date().toISOString(), expira_en: null, activo: true, ...f,
        }))
        db.anuncios.push(...creadas)
        if (prefer.includes('return=representation')) return representar(creadas)
        return json(201, [])
      }
      if (req.method === 'PATCH') {
        const cambios = JSON.parse(body || '{}')
        const objetivo = aplicarFiltros(db.anuncios, url.searchParams).filter((a) => a.creado_por === yo.nombre)
        objetivo.forEach((a) => Object.assign(a, cambios))
        if (prefer.includes('return=representation')) return representar(objetivo)
        return json(204, [])
      }
    }

    if (tabla === 'todos') {
      // RLS todos_*_own: TODO restringido a user_nombre = mi_nombre()
      if (req.method === 'GET') {
        return representar(aplicarFiltros(db.todos.filter((t) => t.user_nombre === yo.nombre), url.searchParams))
      }
      if (req.method === 'POST') {
        const input = JSON.parse(body || '[]')
        const filas = Array.isArray(input) ? input : [input]
        for (const f of filas) {
          if (f.user_nombre !== yo.nombre) {
            return json(403, { code: '42501', message: 'new row violates row-level security policy for table "todos"' })
          }
        }
        const creadas = filas.map((f) => ({ id: uuid(), hecho: false, created_at: new Date().toISOString(), ...f }))
        db.todos.push(...creadas)
        if (prefer.includes('return=representation')) return representar(creadas)
        return json(201, [])
      }
      if (req.method === 'PATCH') {
        const cambios = JSON.parse(body || '{}')
        const objetivo = aplicarFiltros(db.todos, url.searchParams).filter((t) => t.user_nombre === yo.nombre)
        objetivo.forEach((t) => Object.assign(t, cambios))
        if (prefer.includes('return=representation')) return representar(objetivo)
        return json(204, [])
      }
      if (req.method === 'DELETE') {
        const objetivo = aplicarFiltros(db.todos, url.searchParams).filter((t) => t.user_nombre === yo.nombre)
        db.todos = db.todos.filter((t) => !objetivo.includes(t))
        if (prefer.includes('return=representation')) return representar(objetivo)
        return json(204, [])
      }
    }

    if (tabla === 'estrellas_colaboracion') {
      // RLS 4.8 (cutover): SELECT solo donde participo (di o recibí) o flag
      // ve_gamificacion_completa · INSERT con las reglas endurecidas
      if (req.method === 'GET') {
        const visibles = db.estrellas.filter((e) =>
          e.de_persona === yo.nombre || e.para_persona === yo.nombre || yo.ve_gamificacion_completa === true)
        return representar(aplicarFiltros(visibles, url.searchParams))
      }
      if (req.method === 'POST') {
        const input = JSON.parse(body || '[]')
        const filas = Array.isArray(input) ? input : [input]
        for (const f of filas) {
          const mias = db.estrellas.filter((e) => e.de_persona === yo.nombre && e.semana === f.semana)
          const violacion =
            f.de_persona !== yo.nombre ||                       // spoof de remitente
            f.para_persona === f.de_persona ||                  // a sí mismo
            mias.length >= 2 ||                                 // límite 2/semana
            mias.some((e) => e.para_persona === f.para_persona) // repetir persona en la semana
          if (violacion) {
            return json(403, { code: '42501', message: 'new row violates row-level security policy for table "estrellas_colaboracion"' })
          }
        }
        const creadas = filas.map((f) => ({ id: uuid(), creada_en: new Date().toISOString(), ...f }))
        db.estrellas.push(...creadas)
        if (prefer.includes('return=representation')) return representar(creadas)
        return json(201, [])
      }
    }

    if (tabla === 'historial_mensual') {
      // RLS 4.8 (cutover): SELECT propio | rh | flag · INSERT dirección ·
      // UPDATE limitado por grant de columna a recompensa_entregada (rh/dirección)
      const esDir = yo.es_direccion === true || yo.nivel === 'ceo'
      if (req.method === 'GET') {
        const visibles = db.historial_mensual.filter((h) =>
          h.persona === yo.nombre || yo.nivel === 'rh' || yo.ve_gamificacion_completa === true)
        return representar(aplicarFiltros(visibles, url.searchParams))
      }
      if (req.method === 'POST') {
        if (!esDir) return json(403, { code: '42501', message: 'new row violates row-level security policy for table "historial_mensual"' })
        const input = JSON.parse(body || '[]')
        const filas = (Array.isArray(input) ? input : [input]).map((f) => ({
          id: uuid(), xp_total: 0, nivel_alcanzado: 1, entregadas: 0, cumplimiento: 0,
          mejor_racha: 0, recompensa: null, recompensa_entregada: false,
          cerrado_en: new Date().toISOString(), ...f,
        }))
        db.historial_mensual.push(...filas)
        if (prefer.includes('return=representation')) return representar(filas)
        return json(201, [])
      }
      if (req.method === 'PATCH') {
        const cambios = JSON.parse(body || '{}')
        // grant de COLUMNA: cualquier otra columna en el SET → permission denied
        const cols = Object.keys(cambios)
        if (cols.some((c) => c !== 'recompensa_entregada')) {
          return json(403, { code: '42501', message: 'permission denied for table historial_mensual' })
        }
        if (yo.nivel !== 'rh' && !esDir) {
          return json(403, { code: '42501', message: 'permission denied for table historial_mensual' })
        }
        const objetivo = aplicarFiltros(db.historial_mensual, url.searchParams)
        objetivo.forEach((h) => Object.assign(h, cambios))
        if (prefer.includes('return=representation')) return representar(objetivo)
        return json(204, [])
      }
    }

    if (tabla === 'recompensas') {
      // RLS 4.8 (cutover): SELECT solo flag ve_gamificacion_completa ·
      // escritura solo dirección (recomp_write, sin cambios)
      const esDir = yo.es_direccion === true || yo.nivel === 'ceo'
      if (req.method === 'GET') {
        const visibles = yo.ve_gamificacion_completa === true ? db.recompensas : []
        return representar(aplicarFiltros(visibles, url.searchParams))
      }
      if (req.method === 'POST') {
        if (!esDir) return json(403, { code: '42501', message: 'new row violates row-level security policy for table "recompensas"' })
        const input = JSON.parse(body || '[]')
        const filas = (Array.isArray(input) ? input : [input]).map((f) => ({ id: uuid(), activa: true, ...f }))
        db.recompensas.push(...filas)
        if (prefer.includes('return=representation')) return representar(filas)
        return json(201, [])
      }
      if (req.method === 'PATCH') {
        if (!esDir) return json(403, { code: '42501', message: 'permission denied for table recompensas' })
        const cambios = JSON.parse(body || '{}')
        const objetivo = aplicarFiltros(db.recompensas, url.searchParams)
        objetivo.forEach((r) => Object.assign(r, cambios))
        if (prefer.includes('return=representation')) return representar(objetivo)
        return json(204, [])
      }
    }

    if (tabla === 'feedback') {
      // RLS cutover 7: muro público (reconocimiento+es_publico) · autor
      // firmado ve lo suyo · destinatario su reconocimiento · dirección/flag
      // TODO. INSERT sin suplantar autor + trigger de anonimato. UPDATE solo
      // dirección/flag y limitado por grant a estado/respuesta/
      // compartible_loop/es_publico (autor_id y es_anonimo congelados).
      const esDir = yo.es_direccion === true || yo.nivel === 'ceo'
      const flag = yo.ve_gamificacion_completa === true
      if (req.method === 'GET') {
        const visibles = db.feedback.filter((f) =>
          (f.categoria === 'reconocimiento' && f.es_publico)
          || (f.autor_id && f.autor_id === yo.id)
          || (f.categoria === 'reconocimiento' && f.destinatario_id === yo.id)
          || esDir || flag)
        return representar(aplicarFiltros(visibles, url.searchParams))
      }
      if (req.method === 'POST') {
        const input = JSON.parse(body || '[]')
        const filas = Array.isArray(input) ? input : [input]
        for (const f of filas) {
          // with_check: autor null (anónimo) o yo — nunca otro
          if (f.autor_id && f.autor_id !== yo.id) {
            return json(403, { code: '42501', message: 'new row violates row-level security policy for table "feedback"' })
          }
          // check feedback_firmado_con_autor: un firmado nunca sin autor
          if (!f.es_anonimo && !f.autor_id) {
            return json(400, { code: '23514', message: 'new row for relation "feedback" violates check constraint "feedback_firmado_con_autor"' })
          }
        }
        const creadas = filas.map((f) => ({
          id: uuid(), estado: 'nuevo', respuesta: null, es_publico: false,
          compartible_loop: false, destinatario_id: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          ...f,
          // trigger feedback_anonimato: fuerza autor_id null en BD
          autor_id: f.es_anonimo ? null : (f.autor_id ?? null),
        }))
        db.feedback.push(...creadas)
        if (prefer.includes('return=representation')) return representar(creadas)
        return json(201, [])
      }
      if (req.method === 'PATCH') {
        const cambios = JSON.parse(body || '{}')
        const permitidas = ['estado', 'respuesta', 'compartible_loop', 'es_publico']
        if (Object.keys(cambios).some((c) => !permitidas.includes(c))) {
          return json(403, { code: '42501', message: 'permission denied for table feedback' })
        }
        if (!esDir && !flag) {
          return json(403, { code: '42501', message: 'permission denied for table feedback' })
        }
        const objetivo = aplicarFiltros(db.feedback, url.searchParams)
        objetivo.forEach((f) => Object.assign(f, cambios, { updated_at: new Date().toISOString() }))
        if (prefer.includes('return=representation')) return representar(objetivo)
        return json(204, [])
      }
    }

    if (tabla === 'anuncios_vistos') {
      // RLS: SELECT true · INSERT persona_nombre = mi_nombre()
      if (req.method === 'GET') {
        return representar(aplicarFiltros(db.anuncios_vistos, url.searchParams))
      }
      if (req.method === 'POST') {
        const input = JSON.parse(body || '[]')
        const filas = Array.isArray(input) ? input : [input]
        for (const f of filas) {
          if (f.persona_nombre !== yo.nombre) {
            return json(403, { code: '42501', message: 'new row violates row-level security policy for table "anuncios_vistos"' })
          }
        }
        const creadas = filas.map((f) => ({ visto_en: new Date().toISOString(), ...f }))
        db.anuncios_vistos.push(...creadas)
        if (prefer.includes('return=representation')) return representar(creadas)
        return json(201, [])
      }
    }

    return json(404, { message: `tabla no soportada por el mock: ${tabla}` })
  }

  json(404, { msg: 'not found in mock' })
})

server.listen(PORT, () => console.log(`[mock] Supabase mock (auth+REST+RLS) en http://127.0.0.1:${PORT}`))
