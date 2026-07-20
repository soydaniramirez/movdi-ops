import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { mapPeticionRow, mapPersonaRow, tengoSupervisadas } from '@/lib/peticiones'
import { mapEstrellaRow } from '@/lib/estrellas'
import { calcularGamePersona, mesActualStr } from '@/lib/gamificacion'
import { asegurarVinculoAuth } from '@/lib/supabase/vinculo'
import Campana from './campana'

// Barra superior compartida de las rutas protegidas: navegación + XP global
// (gamificación visible en toda la app, Fase 4.7) + chip de perfil + campana.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: row } = await supabase
    .from('personas').select('*').eq('email', user?.email ?? '').maybeSingle()
  const persona = row ? mapPersonaRow(row) : null

  // Autocuración del vínculo auth ↔ persona (bug Valeria 2026-07-15): una
  // persona recién dada de alta puede entrar con auth_user_id vacío →
  // mi_nombre() = null y toda la RLS de escritura la rechaza con el error
  // crudo. Se liga sola en su primera página (policy personas_self_link).
  let vinculoOk = true
  if (user && persona && !persona.authUserId) {
    vinculoOk = await asegurarVinculoAuth(supabase, persona.id, user.id)
  }
  const cuentaIncompleta = !!user && (!persona || !vinculoOk)

  // XP del mes con las MISMAS fórmulas del módulo progreso (lecturas con la
  // sesión del usuario → RLS aplica; sin service_role)
  let game: ReturnType<typeof calcularGamePersona> | null = null
  if (persona) {
    const [pets, ests] = await Promise.all([
      supabase.from('peticiones').select('*'),
      supabase.from('estrellas_colaboracion').select('*'),
    ])
    game = calcularGamePersona(
      persona.nombre,
      mesActualStr(),
      (pets.data ?? []).map(mapPeticionRow),
      (ests.data ?? []).map(mapEstrellaRow),
    )
  }

  // pestañas por rol (4.14): rh → nivel rh o dirección · equipo → heads,
  // dirección o jefas directas (2026-07-20) — los datos ya están protegidos
  // por RLS; esto es UX. Para saber si soy jefa necesito ver quién me reporta.
  const esDir = !!persona && (persona.esDireccion || persona.nivel === 'ceo')
  const veRH = !!persona && (persona.nivel === 'rh' || esDir)
  let tengoGente = false
  if (persona) {
    const { data: todosRows } = await supabase.from('personas').select('*')
    tengoGente = tengoSupervisadas(persona, (todosRows ?? []).map(mapPersonaRow))
  }
  const veEquipo = !!persona && (persona.nivel === 'head' || esDir || tengoGente)
  // catálogo de clientes: lo edita área admi + dirección (RLS); el resto
  // puede leerlo pero no necesita la pestaña — la usa desde el form
  const veClientes = !!persona && (persona.areas.includes('admi') || esDir)

  const iniciales = persona
    ? `${persona.nombre.charAt(0)}${(persona.apellido || '').charAt(0)}`.toUpperCase()
    : ''

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* header pegajoso con glassmorphism (Paso B) */}
      <div className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/80 px-6 py-2 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          {/* nav accesible: 14px, alto contraste y área de toque generosa */}
          <nav className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            <Link href="/" className="rounded-full px-3 py-1.5 font-mono font-bold tracking-tight text-neutral-100 transition-colors hover:bg-movdi-naranja hover:text-black">
              MOVDI·ops<span aria-hidden className="ml-1">→</span>
            </Link>
            {([
              ['/peticiones', 'peticiones'], ['/recurrentes', 'recurrentes'], ['/anuncios', 'anuncios'],
              ['/todos', 'to-dos'], ['/estrellas', 'estrellas'], ['/feedback', 'feedback'], ['/progreso', 'progreso'],
              ...(veEquipo ? [['/equipo', 'equipo']] : []),
              ...(veClientes ? [['/clientes', 'clientes']] : []),
              ...(veRH ? [['/rh', 'rh']] : []),
            ] as [string, string][]).map(([href, lab]) => (
              <Link key={href} href={href}
                className="rounded-full px-3 py-1.5 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-movdi-naranja">
                {lab}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {game && (
              <Link href="/progreso" data-testid="xp-header" title={`${game.nivelNombre} · ${game.progresoNivel}% al siguiente nivel`}
                className="group flex items-center gap-2 border border-neutral-800 px-2.5 py-1 hover:border-movdi-naranja/60">
                <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 group-hover:text-neutral-300">
                  nv{game.nivel}
                </span>
                <span className="h-1.5 w-14 overflow-hidden rounded-full bg-neutral-800">
                  <span className="block h-full bg-movdi-naranja" style={{ width: `${game.progresoNivel}%` }} />
                </span>
                <span className="font-mono text-[10px] text-movdi-naranja">⚡ {game.xp} xp</span>
              </Link>
            )}
            {persona && (
              <span className="flex items-center gap-2" data-testid="chip-perfil">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-movdi-naranja/20 font-mono text-[10px] text-movdi-naranja">
                  {iniciales}
                </span>
                <span className="hidden sm:block">
                  <span className="block text-[11px] leading-tight text-neutral-200">{persona.nombre} {persona.apellido}</span>
                  <span className="block font-mono text-[9px] uppercase leading-tight tracking-wider text-neutral-500">{persona.rol || persona.nivel}</span>
                </span>
              </span>
            )}
            {persona && <Campana nombre={persona.nombre} />}
          </div>
        </div>
      </div>
      {/* Cuenta a medio configurar: avisar ANTES de que intente crear algo
          y se estrelle con el error crudo de RLS (UX del bug Valeria). */}
      {cuentaIncompleta && (
        <div
          data-testid="aviso-cuenta-incompleta"
          role="alert"
          className="border-b border-movdi-naranja/40 bg-movdi-naranja/10 px-6 py-2 text-center font-mono text-xs text-movdi-naranja"
        >
          {persona
            ? 'tu cuenta no está terminada de configurar — puedes ver la app, pero crear o editar va a fallar. avisa a dirección.'
            : 'tu cuenta existe pero no está ligada a una persona del equipo. avisa a dirección.'}
        </div>
      )}
      {children}
    </div>
  )
}
