import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// ⚠️ SOLO SERVIDOR. Este cliente usa la SERVICE_ROLE key, que SALTA RLS.
// - JAMÁS importar desde un componente cliente ('use client') ni exponer al navegador.
// - La variable NUNCA lleva el prefijo NEXT_PUBLIC_.
// - El `import 'server-only'` de arriba hace que el build FALLE si alguien
//   intenta importar este módulo desde código cliente.
// Uso previsto (fases de módulos): Server Actions sensibles — invitar usuarios
// a Auth (auth.admin.inviteUserByEmail), notificaciones, historial_mensual,
// estrellas (límite 2/semana validado aquí), recompensas y admin de personas.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor'
    )
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
