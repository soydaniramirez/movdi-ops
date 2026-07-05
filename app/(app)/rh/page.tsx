import { createClient } from '@/lib/supabase/server'
import { mapPeticionRow, mapPersonaRow } from '@/lib/peticiones'
import { esDireccion } from '@/lib/equipo'

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

  if (!tieneAcceso) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="text-center" data-testid="rh-denegado">
          <p className="font-mono text-xs uppercase tracking-widest text-movdi-naranja">acceso restringido</p>
          <p className="mt-2 text-sm text-neutral-400">
            el panel de recursos humanos es solo para RH y dirección.
          </p>
        </div>
      </main>
    )
  }

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
        <section className="mt-6 space-y-2">
          {peticiones.length === 0 && (
            <p className="font-mono text-xs text-neutral-500">no hay peticiones del área RH visibles para ti</p>
          )}
          {peticiones.map((t) => (
            <article key={t.id} data-testid="rh-peticion" className="border border-neutral-800 bg-neutral-900 px-4 py-3">
              <p className="text-sm font-semibold">{t.privada && '🔒 '}{t.nombre}</p>
              <p className="mt-0.5 font-mono text-[11px] text-neutral-500">
                de {t.creadoPor} para {t.para} · {t.fecha} · {t.estatus}
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}
