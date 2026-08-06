'use server'

// Server Actions del módulo de feedback (Fase 4.10).
// - ANONIMATO: si es_anonimo, aquí NO se adjunta identidad (autor_id null);
//   el trigger feedback_anonimato lo fuerza además en BD (doble candado).
//   No se registra IP ni metadata.
// - Reconocimiento con destinatario y FIRMADO: intenta crear la estrella
//   (privada por la RLS 4.8) respetando los límites existentes — si el
//   límite semanal ya se alcanzó, el reconocimiento se publica SIN estrella.
//   Un reconocimiento anónimo nunca genera estrella (llevaría remitente).
// - Cero XP por enviar (anti-farmeo): enviar no suma nada.

import { createClient } from '@/lib/supabase/server'
import { selectTodo } from '@/lib/supabase/select-todo'
import { mapPersonaRow, matchNombre } from '@/lib/peticiones'
import { esDireccion } from '@/lib/equipo'
import { mapEstrellaRow, puedoDarEstrella, semanaActual, MAX_MOTIVO } from '@/lib/estrellas'
import { type FeedbackCategoria, type FeedbackEstado, MAX_MENSAJE } from '@/lib/feedback'

type Resultado<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

async function getYo() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('sin sesión')
  const { data: row } = await supabase
    .from('personas').select('*').eq('email', user.email).maybeSingle()
  if (!row) throw new Error('tu cuenta no está ligada a una persona del equipo')
  const yo = mapPersonaRow(row)
  if (!yo.activo) throw new Error('cuenta archivada')
  return { supabase, yo, yoId: row.id as string }
}

export async function enviarFeedback(input: {
  categoria: FeedbackCategoria
  mensaje: string
  esAnonimo: boolean
  destinatarioNombre?: string | null // solo reconocimiento; null = todo el equipo
}): Promise<Resultado<{ estrella: boolean }>> {
  try {
    const { supabase, yo, yoId } = await getYo()

    const mensaje = (input.mensaje || '').trim()
    if (!['reconocimiento', 'mejora', 'liderazgo'].includes(input.categoria)) {
      return { ok: false, error: 'categoría inválida' }
    }
    if (!mensaje) return { ok: false, error: 'escribe tu mensaje' }
    if (mensaje.length > MAX_MENSAJE) return { ok: false, error: `máximo ${MAX_MENSAJE} caracteres` }
    if (input.destinatarioNombre && input.categoria !== 'reconocimiento') {
      return { ok: false, error: 'solo los reconocimientos llevan destinatario' }
    }

    // destinatario (opcional, solo reconocimiento): existir, activo, no yo
    let destinatarioId: string | null = null
    let destinatarioNombre: string | null = null
    if (input.categoria === 'reconocimiento' && input.destinatarioNombre) {
      const { data: personasRows } = await supabase.from('personas').select('*')
      const destRow = (personasRows ?? []).find((r) => matchNombre(r.nombre, input.destinatarioNombre!))
      if (!destRow || destRow.activo === false) return { ok: false, error: 'destinatario inválido' }
      if (matchNombre(destRow.nombre, yo.nombre)) return { ok: false, error: 'el reconocimiento es para alguien más 😉' }
      destinatarioId = destRow.id
      destinatarioNombre = destRow.nombre
    }

    const { error } = await supabase.from('feedback').insert({
      categoria: input.categoria,
      mensaje,
      es_anonimo: input.esAnonimo,
      // ANONIMATO: sin identidad si es anónimo (el trigger lo respalda en BD)
      autor_id: input.esAnonimo ? null : yoId,
      destinatario_id: destinatarioId,
      // el muro es solo de reconocimientos
      es_publico: input.categoria === 'reconocimiento',
    })
    if (error) return { ok: false, error: 'no se pudo enviar: ' + error.message }

    // 🙌 → ⭐ estrella privada (solo firmado y con destinatario), respetando
    // los límites vigentes; si no procede, el reconocimiento ya quedó publicado.
    let estrella = false
    if (input.categoria === 'reconocimiento' && destinatarioNombre && !input.esAnonimo) {
      const sem = semanaActual()
      const { data: estRows } = await selectTodo(() => supabase
        .from('estrellas_colaboracion').select('*')
        .eq('de_persona', yo.nombre).eq('semana', sem))
      const check = puedoDarEstrella({
        yo: yo.nombre,
        para: destinatarioNombre,
        estrellas: (estRows ?? []).map(mapEstrellaRow),
        semana: sem,
      })
      if (check.ok) {
        const { error: eEst } = await supabase.from('estrellas_colaboracion').insert({
          de_persona: yo.nombre, // derivado de la sesión (la RLS lo exige)
          para_persona: destinatarioNombre,
          motivo: ('🙌 ' + mensaje).slice(0, MAX_MOTIVO),
          semana: sem,
        })
        estrella = !eEst // la RLS es el respaldo final (carreras)
      }
    }
    return { ok: true, data: { estrella } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

// Gestión de la bandeja — solo dirección/flag (la RLS + grant de columna
// lo respaldan: únicamente estado/respuesta/compartible_loop/es_publico).
export async function gestionarFeedback(input: {
  id: string
  estado?: FeedbackEstado
  respuesta?: string
  compartibleLoop?: boolean
}): Promise<Resultado> {
  try {
    const { supabase, yo } = await getYo()
    if (!esDireccion({ esDireccion: yo.esDireccion, nivel: yo.nivel }) && !yo.veGamificacionCompleta) {
      return { ok: false, error: 'solo dirección gestiona el feedback' }
    }
    const cambios: Record<string, unknown> = {}
    if (input.estado) {
      if (!['nuevo', 'en_revision', 'resuelto'].includes(input.estado)) return { ok: false, error: 'estado inválido' }
      cambios.estado = input.estado
    }
    if (input.respuesta !== undefined) cambios.respuesta = input.respuesta.trim() || null
    if (input.compartibleLoop !== undefined) cambios.compartible_loop = input.compartibleLoop
    if (!Object.keys(cambios).length) return { ok: false, error: 'nada que actualizar' }

    const { data, error } = await supabase.from('feedback')
      .update(cambios).eq('id', input.id).select('id')
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'no se encontró el feedback (o sin permiso)' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}
