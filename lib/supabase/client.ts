import { createBrowserClient } from '@supabase/ssr'

// Cliente para componentes cliente ('use client').
// Usa la anon/publishable key: es pública por diseño; la autorización real
// la hacen las políticas RLS con la sesión del usuario (cookies via @supabase/ssr).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
