import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { mapPeticionRow, mapPersonaRow } from '@/lib/peticiones'
import { esDireccion } from '@/lib/equipo'
import RhLista from './rh-lista'

// Panel RH — acceso por nivel, verificado EN EL SERVIDOR contra la sesión
// (decisión 2026-07-03: sin contraseña extra). Los datos ya están cubiertos
// por RLS; este gate evita además renderizar el panel a quien no corresponde.
export default async function PanelRHPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: row } = await supabase
    .from('personas').select('*').eq('email', user!.email!).maybeSingle()
  const yo = row ? mapPersonaRow(row) : null

  const tieneAcceso = !!yo && (yo.nivel === 'rh' || esDireccion({ esDireccion: yo.esDireccion, nivel: yo.nivel }))

  // 4.14: sin pantalla de "no acceso" — directo a home
  if (!tieneAcceso) redirect('/')

  // Peticiones del área RH (las privadas siguen filtradas por RLS:
  // solo creador/destinatario las reciben, ni siquiera aquí)
  const { data: petRows } = await supabase
    .from('peticiones').select('*').eq('area', 'rh').order('fecha')
  const peticiones = (petRows ?? []).map(mapPeticionRow)

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto max-w-3xl">
        <header className="border-b border-neutral-800 pb-4">
          <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">movdi · ops</div>
          <h1 className="text-xl font-semibold" data-testid="rh-titulo">🔐 panel RH</h1>
          <p className="mt-0.5 font-mono text-[11px] text-neutral-500">
            peticiones del área RH · acceso por nivel ({yo!.nivel}) verificado en servidor · las privadas solo las ven creador y destinatario
          </p>
        </header>
        <RhLista peticiones={peticiones} />
      </div>
    </main>
  )
}
