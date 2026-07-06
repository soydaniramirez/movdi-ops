'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()

  async function salir() {
    const supabase = createClient()
    await supabase.auth.signOut() // limpia cookies + revoca en el servidor
    router.replace('/login')
    router.refresh()
  }

  return (
    <button
      onClick={salir}
      className="border border-neutral-700 px-4 py-2 font-mono text-xs text-neutral-300 hover:border-movdi-naranja hover:text-movdi-naranja"
    >
      cerrar sesión
    </button>
  )
}
