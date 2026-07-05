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
          <nav className="flex items-center gap-4 font-mono text-[11px]">
            <Link href="/" className="text-neutral-300 hover:text-orange-500">MOVDI·ops</Link>
            <Link href="/peticiones" className="text-neutral-500 hover:text-orange-500">peticiones</Link>
            <Link href="/recurrentes" className="text-neutral-500 hover:text-orange-500">recurrentes</Link>
            <Link href="/anuncios" className="text-neutral-500 hover:text-orange-500">anuncios</Link>
            <Link href="/todos" className="text-neutral-500 hover:text-orange-500">to-dos</Link>
            <Link href="/estrellas" className="text-neutral-500 hover:text-orange-500">estrellas</Link>
            <Link href="/progreso" className="text-neutral-500 hover:text-orange-500">progreso</Link>
            <Link href="/equipo" className="text-neutral-500 hover:text-orange-500">equipo</Link>
            <Link href="/rh" className="text-neutral-500 hover:text-orange-500">rh</Link>
          </nav>
          <div className="flex items-center gap-3">
            {game && (
              <Link href="/progreso" data-testid="xp-header" title={`${game.nivelNombre} · ${game.progresoNivel}% al siguiente nivel`}
                className="group flex items-center gap-2 border border-neutral-800 px-2.5 py-1 hover:border-orange-600/60">
                <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500 group-hover:text-neutral-300">
                  nv{game.nivel}
                </span>
                <span className="h-1.5 w-14 overflow-hidden rounded-full bg-neutral-800">
                  <span className="block h-full bg-orange-600" style={{ width: `${game.progresoNivel}%` }} />
                </span>
                <span className="font-mono text-[10px] text-orange-500">⚡ {game.xp} xp</span>
              </Link>
            )}
            {persona && (
              <span className="flex items-center gap-2" data-testid="chip-perfil">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-600/20 font-mono text-[10px] text-orange-500">
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
