'use server'

// To-dos personales: el user_nombre SIEMPRE se deriva de la sesión (el cliente
// no lo manda). Toggle/editar/borrar van client-side con RLS (filas propias,
// misma decisión que la campana); solo el alta pasa por aquí.

import { createClient } from '@/lib/supabase/server'
import { mapPersonaRow } from '@/lib/peticiones'

type Resultado = { ok: true } | { ok: false; error: string }

export async function crearTodo(input: { texto: string }): Promise<Resultado> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: 'sin sesión' }
    const { data: row } = await supabase
      .from('personas').select('*').eq('email', user.email).maybeSingle()
    if (!row) return { ok: false, error: 'tu cuenta no está ligada a una persona del equipo' }
    const yo = mapPersonaRow(row)

    const texto = (input.texto || '').trim()
    if (!texto) return { ok: false, error: 'escribe la tarea' }

    const { error } = await supabase.from('todos').insert({
      user_nombre: yo.nombre, // derivado de la sesión
      texto,
      hecho: false,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}
