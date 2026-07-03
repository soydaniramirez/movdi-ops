// Mock mínimo del API de auth de Supabase (GoTrue) para pruebas e2e locales.
// El sandbox de CI no tiene red hacia *.supabase.co, así que el dev server y el
// navegador de Playwright apuntan aquí (NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321).
// Usuario de prueba: antonio@movdi.mx / correcta123
import http from 'node:http'

const PORT = 54321
const USER_EMAIL = 'antonio@movdi.mx'
const USER_PASS = 'correcta123'
const USER_ID = '8377e1ab-bfd9-4509-92df-6b1c2a670b9a'

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const now = () => Math.floor(Date.now() / 1000)

function makeJwt() {
  // El cliente decodifica el payload (exp); la firma no se verifica en el cliente
  // y la "verificación" de servidor es el GET /auth/v1/user de este mismo mock.
  return [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({
      sub: USER_ID,
      email: USER_EMAIL,
      role: 'authenticated',
      aud: 'authenticated',
      iat: now(),
      exp: now() + 3600,
      session_id: 'mock-session',
    }),
    'firma-mock',
  ].join('.')
}

const userJson = () => ({
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: USER_EMAIL,
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

let sesionActiva = null // access_token vigente (se invalida en logout)

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Allow-Headers': '*',
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    return res.end()
  }

  let body = ''
  for await (const chunk of req) body += chunk
  const json = (code, obj) => {
    res.writeHead(code, { ...cors, 'Content-Type': 'application/json' })
    res.end(JSON.stringify(obj))
  }

  // Log de TODO lo que pega al mock — la prueba de "cero lecturas pre-auth"
  // se apoya también en el capture de red de Playwright.
  console.log(`[mock] ${req.method} ${url.pathname}${url.search}`)

  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
    const { email, password } = JSON.parse(body || '{}')
    if (email === USER_EMAIL && password === USER_PASS) {
      const access_token = makeJwt()
      sesionActiva = access_token
      return json(200, {
        access_token,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: now() + 3600,
        refresh_token: 'mock-refresh-token',
        user: userJson(),
      })
    }
    return json(400, {
      code: 400,
      error_code: 'invalid_credentials',
      msg: 'Invalid login credentials',
      error_description: 'Invalid login credentials',
    })
  }

  if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
    const auth = req.headers.authorization || ''
    if (sesionActiva && auth === `Bearer ${sesionActiva}`) return json(200, userJson())
    return json(401, { code: 401, error_code: 'no_session', msg: 'invalid JWT' })
  }

  if (url.pathname === '/auth/v1/logout') {
    sesionActiva = null
    res.writeHead(204, cors)
    return res.end()
  }

  if (url.pathname === '/auth/v1/recover') {
    return json(200, {})
  }

  // Cualquier intento contra la base de datos queda registrado; en las
  // pruebas pre-auth NO debe ocurrir ninguno.
  if (url.pathname.startsWith('/rest/v1/')) {
    return json(200, [])
  }

  json(404, { msg: 'not found in mock' })
})

server.listen(PORT, () => console.log(`[mock] Supabase auth mock en http://127.0.0.1:${PORT}`))
