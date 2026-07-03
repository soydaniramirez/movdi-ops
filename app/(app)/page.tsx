import { createClient } from '@/lib/supabase/server'
import LogoutButton from './logout-button'

// Dashboard placeholder de la fase 2: demuestra sesión por cookies en un
// Server Component. Los módulos reales (peticiones, etc.) llegan en fase 4.
export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">
              centro de operaciones
            </div>
            <h1 className="text-xl font-semibold text-neutral-100">
              MOVDI <span className="text-orange-600">·</span> ops
            </h1>
          </div>
          <LogoutButton />
        </header>
        <section className="mt-8 border border-neutral-800 bg-neutral-900 p-6">
          <p className="text-sm text-neutral-300">
            sesión activa: <strong data-testid="user-email">{user?.email}</strong>
          </p>
          <p className="mt-2 font-mono text-xs text-neutral-500">
            fase 2 (auth con cookies) — los módulos de la app se migran en la fase 4.
          </p>
        </section>
      </div>
    </main>
  )
}
