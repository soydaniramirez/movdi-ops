import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { mapPeticionRow, mapPersonaRow } from '@/lib/peticiones'
import { mapEstrellaRow } from '@/lib/estrellas'
import { calcularGamePersona, mesActualStr } from '@/lib/gamificacion'
import Campana from './campana'

// Barra superior compartida de las rutas protegidas: navegación + XP global
// (gamificación visible en toda la app, Fase 4.7) + chip de perfil + campana.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: row } = await supabase
    .from('personas').select('*').eq('email', user?.email ?? '').maybeSingle()
  const persona = row ? mapPersonaRow(row) : null

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
              ['/equipo', 'equipo'], ['/rh', 'rh'],
            ] as const).map(([href, lab]) => (
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
      {children}
    </div>
  )
}
