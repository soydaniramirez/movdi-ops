import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tengoSupervisadas } from '@/lib/peticiones'
import { esDireccion, mapPersonaConManagers, veOrganigrama } from '@/lib/equipo'
import OrganigramaView from './organigrama-view'

// /organigrama (2026-07-20) — vista de SOLO LECTURA del equipo, renderizada en
// vivo desde personas. Acceso: dirección, RH o área admi (mismo patrón que la
// pestaña equipo: gate en el nav + redirect aquí; RLS de personas ya es abierta
// a autenticados, así que esto es UX, no la barrera real).
export default async function OrganigramaPage() {
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

  const yo = mapPersonaConManagers(row)
  if (!veOrganigrama(yo)) redirect('/')

  const { data: rows } = await supabase.from('personas').select('*')
  const personas = (rows ?? []).map(mapPersonaConManagers)

  // "editar en equipo": solo si además tiene acceso a la pestaña equipo
  // (dirección, head o jefa directa). RH/admi sin gente a cargo no lo ven.
  const puedeEditarEquipo =
    esDireccion(yo) || yo.nivel === 'head' || tengoSupervisadas(yo, personas)

  return <OrganigramaView personas={personas} puedeEditarEquipo={puedeEditarEquipo} />
}
