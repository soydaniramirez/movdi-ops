'use server'

// Dar estrella: de_persona y semana derivados EN EL SERVIDOR; re-valida las
// reglas (no a uno mismo, máx 2/semana, no repetir persona en la semana)
// antes del insert — la RLS estrellas_insert las respalda en la BD.
// Notifica al receptor desde el servidor (paridad SPA, anti-spoof).

import { createClient } from '@/lib/supabase/server'
import { selectTodo } from '@/lib/supabase/select-todo'
import { notificarServidor } from '@/lib/supabase/notificar'
import { mapPersonaRow, matchNombre } from '@/lib/peticiones'
import { MAX_MOTIVO, mapEstrellaRow, puedoDarEstrella, semanaActual } from '@/lib/estrellas'

type Resultado = { ok: true } | { ok: false; error: string }

export async function darEstrella(input: { para: string; motivo: string }): Promise<Resultado> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: 'sin sesión' }
    const { data: row } = await supabase
      .from('personas').select('*').eq('email', user.email).maybeSingle()
    if (!row) return { ok: false, error: 'tu cuenta no está ligada a una persona del equipo' }
    const yo = mapPersonaRow(row)

    const motivo = (input.motivo || '').trim()
    if (!input.para) return { ok: false, error: 'elige a quién darle la estrella' }
    if (!motivo) return { ok: false, error: 'escribe un motivo breve para la estrella' }
    if (motivo.length > MAX_MOTIVO) return { ok: false, error: 'el motivo no puede pasar de 60 caracteres' }

    // destinatario debe existir y estar activo
    const { data: personasRows } = await supabase.from('personas').select('*')
    const destinatario = (personasRows ?? []).map(mapPersonaRow)
      .find((p) => matchNombre(p.nombre, input.para))
    if (!destinatario || !destinatario.activo) return { ok: false, error: 'destinatario inválido' }

    // reglas de la semana con datos frescos del servidor
    const sem = semanaActual()
    const { data: estRows } = await selectTodo(() => supabase
      .from('estrellas_colaboracion').select('*')
      .eq('de_persona', yo.nombre).eq('semana', sem))
    const check = puedoDarEstrella({
      yo: yo.nombre,
      para: destinatario.nombre,
      estrellas: (estRows ?? []).map(mapEstrellaRow),
      semana: sem,
    })
    if (!check.ok) return { ok: false, error: check.razon }

    const { error } = await supabase.from('estrellas_colaboracion').insert({
      de_persona: yo.nombre, // derivado de la sesión
      para_persona: destinatario.nombre,
      motivo,
      semana: sem, // derivada en el servidor (ISO 8601, misma definición que la RLS)
    })
    if (error) {
      // la RLS es el respaldo final (p.ej. carrera entre dos inserts)
      return { ok: false, error: 'no se pudo dar la estrella: ' + error.message }
    }

    // notificar al receptor (paridad SPA) — helper único server-side
    await notificarServidor({
      de: yo.nombre,
      rows: [{
        para: destinatario.nombre,
        tipo: 'estrella',
        titulo: `${yo.nombre} te dio una estrella ⭐`,
        detalle: `"${motivo}"`,
        peticion_id: null,
      }],
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}
