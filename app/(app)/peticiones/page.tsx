import { createClient } from '@/lib/supabase/server'
import { mapPersonaRow } from '@/lib/peticiones'
import PeticionesClient from './peticiones-client'

// Shell del módulo: resuelve la persona de la sesión en el servidor.
// Las lecturas de datos (personas/peticiones) son client-side con anon+RLS
// (enfoque híbrido); las escrituras van por Server Actions.
export default async function PeticionesPage() {
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

  return <PeticionesClient yo={mapPersonaRow(row)} />
}
