import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Campana from './campana'

// Barra superior compartida de las rutas protegidas: navegación + campana.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: persona } = await supabase
    .from('personas').select('nombre').eq('email', user?.email ?? '').maybeSingle()

  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="border-b border-neutral-800 bg-neutral-950 px-6 py-2">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <nav className="flex items-center gap-4 font-mono text-[11px]">
            <Link href="/" className="text-neutral-300 hover:text-orange-500">MOVDI·ops</Link>
            <Link href="/peticiones" className="text-neutral-500 hover:text-orange-500">peticiones</Link>
            <Link href="/recurrentes" className="text-neutral-500 hover:text-orange-500">recurrentes</Link>
            <Link href="/anuncios" className="text-neutral-500 hover:text-orange-500">anuncios</Link>
            <Link href="/todos" className="text-neutral-500 hover:text-orange-500">to-dos</Link>
            <Link href="/estrellas" className="text-neutral-500 hover:text-orange-500">estrellas</Link>
            <Link href="/equipo" className="text-neutral-500 hover:text-orange-500">equipo</Link>
            <Link href="/rh" className="text-neutral-500 hover:text-orange-500">rh</Link>
          </nav>
          {persona && <Campana nombre={persona.nombre} />}
        </div>
      </div>
      {children}
    </div>
  )
}
