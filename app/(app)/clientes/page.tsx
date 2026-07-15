import { createClient } from '@/lib/supabase/server'
import { mapPersonaRow } from '@/lib/peticiones'
import ClientesClient from './clientes-client'

// Catálogo de clientes (cutover 10): todos pueden LEERLO (autocompletar al
// crear peticiones); la edición es de área admi + dirección — eso lo decide
// la RLS, aquí solo se pasa el flag para la UX.
export default async function ClientesPage() {
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

  const yo = mapPersonaRow(row)
  const puedeEditar = yo.areas.includes('admi') || yo.esDireccion || yo.nivel === 'ceo'
  const esDireccion = yo.esDireccion || yo.nivel === 'ceo'
  return <ClientesClient puedeEditar={puedeEditar} esDireccion={esDireccion} />
}
