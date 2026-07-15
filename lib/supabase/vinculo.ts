// Vínculo sesión ↔ persona (personas.auth_user_id). Ese campo alimenta a
// mi_nombre() y por lo tanto a TODA la RLS de escritura: si está NULL, la
// persona puede leer la app (las lecturas van por email) pero cualquier
// INSERT/UPDATE muere con "new row violates row-level security policy".
//
// El index.html legado llenaba el vínculo en el primer login; la app Next
// no lo hacía en ningún lado (bug Valeria/Alfredo, 2026-07-15). Ahora se
// llena en tres capas:
//   1. el alta de personas (equipo/actions.ts) justo después del invite
//   2. autocuración en el layout protegido, al cargar cualquier página
//   3. pre-check en getContexto de peticiones, antes de intentar escribir
//
// La policy `personas_self_link` solo permite llenar la fila PROPIA (email
// del JWT) y solo si sigue vacía — nadie puede robar la fila de otra persona.

import { createClient } from '@/lib/supabase/server'

type ClienteServidor = Awaited<ReturnType<typeof createClient>>

export const MSG_CUENTA_SIN_VINCULO =
  'tu cuenta no está terminada de configurar (falta ligarla a tu usuario). ' +
  'avisa a dirección para que la revisen — no pierdas lo que escribiste.'

// Devuelve true si el vínculo quedó hecho (o ya estaba). El .is('auth_user_id',
// null) evita pisar un vínculo existente incluso si la RLS cambiara.
export async function asegurarVinculoAuth(
  supabase: ClienteServidor,
  personaId: string,
  authUserId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('personas')
    .update({ auth_user_id: authUserId })
    .eq('id', personaId)
    .is('auth_user_id', null)
    .select('auth_user_id')
  if (error) return false
  return data?.[0]?.auth_user_id === authUserId
}
