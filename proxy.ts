import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Next 16 renombró la convención "middleware" a "proxy" (mismo rol:
// corre en cada request). Protege rutas y refresca la sesión de Supabase.
export default async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Todas las rutas excepto estáticos de Next y assets con extensión.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)',
  ],
}
