import { createClient } from '@/lib/supabase/server'
import { mapPersonaConManagers } from '@/lib/equipo'
import { mapPeticionRow } from '@/lib/peticiones'
import { mapEstrellaRow } from '@/lib/estrellas'
import { calcularGamePersona, mesActualStr } from '@/lib/gamificacion'
import ProgresoClient from './progreso-client'

export default async function ProgresoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: row } = await supabase
    .from('personas').select('*').eq('email', user!.email!).maybeSingle()

  if (!row) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950">
        <p className="text-sm text-neutral-400">
          tu cuenta no está ligada a una persona del equipo. avisa a dirección.
        </p>
      </main>
    )
  }

  // XP inicial calculado EN EL SERVIDOR con la MISMA fuente que el header
  // (calcularGamePersona sobre las mismas lecturas de la misma request) —
  // la card pinta este valor desde el primer frame: sin flash de "0 XP" y
  // sin desincronía con la barra del header ni un instante.
  const [pets, ests] = await Promise.all([
    supabase.from('peticiones').select('*'),
    supabase.from('estrellas_colaboracion').select('*'),
  ])
  const gameInicial = calcularGamePersona(
    row.nombre,
    mesActualStr(),
    (pets.data ?? []).map(mapPeticionRow),
    (ests.data ?? []).map(mapEstrellaRow),
  )

  return <ProgresoClient yo={mapPersonaConManagers(row)} gameInicial={gameInicial} />
}
