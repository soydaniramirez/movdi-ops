import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tengoSupervisadas } from '@/lib/peticiones'
import { mapPersonaConManagers } from '@/lib/equipo'
import EquipoClient from './equipo-client'

export default async function EquipoPage() {
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

  // 4.14 + jefa directa (2026-07-20): la pestaña equipo es de heads, dirección
  // y jefas directas (ejecutivas con gente a cargo); el resto va a home.
  const yo = mapPersonaConManagers(row)
  const esDir = yo.esDireccion || yo.nivel === 'ceo'
  const { data: allRows } = await supabase.from('personas').select('*')
  const tengoGente = tengoSupervisadas(yo, (allRows ?? []).map(mapPersonaConManagers))
  if (yo.nivel !== 'head' && !esDir && !tengoGente) redirect('/')

  return <EquipoClient yo={yo} />
}
