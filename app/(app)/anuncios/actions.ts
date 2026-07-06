'use server'

// Server Actions de anuncios: nivel y persona SIEMPRE derivados de la sesión
// (el cliente no manda creado_por ni persona_nombre). RLS respalda:
// anuncios_insert_admin_rh, anuncios_update_creador, anuncios_vistos_insert_self.

import { createClient } from '@/lib/supabase/server'
import { mapPersonaRow } from '@/lib/peticiones'
import { AUDIENCIAS, puedeCrearAnuncios } from '@/lib/anuncios'

type Resultado = { ok: true } | { ok: false; error: string }

async function getContexto() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('sin sesión')
  const { data: row, error } = await supabase
    .from('personas').select('*').eq('email', user.email).maybeSingle()
  if (error || !row) throw new Error('tu cuenta no está ligada a una persona del equipo')
  const yo = mapPersonaRow(row)
  if (!yo.activo) throw new Error('cuenta archivada')
  return { supabase, yo }
}

export async function crearAnuncio(input: {
  titulo: string
  contenido: string
  tipo: 'urgente' | 'importante' | 'informativo' | 'cultura'
  audiencia: string
  expira?: string // YYYY-MM-DD, vacío = permanente
}): Promise<Resultado> {
  try {
    const { supabase, yo } = await getContexto()

    // Gating SERVER-SIDE (además de la policy): solo ceo|head|rh
    if (!puedeCrearAnuncios(yo)) {
      return { ok: false, error: 'solo dirección, heads o RH pueden publicar anuncios' }
    }
    const titulo = (input.titulo || '').trim()
    const contenido = (input.contenido || '').trim()
    if (!titulo || !contenido) return { ok: false, error: 'completa título y contenido del anuncio' }
    if (!['urgente', 'importante', 'informativo', 'cultura'].includes(input.tipo)) {
      return { ok: false, error: 'tipo inválido' }
    }
    if (!AUDIENCIAS.includes(input.audiencia)) return { ok: false, error: 'audiencia inválida' }
    if (input.expira && !/^\d{4}-\d{2}-\d{2}$/.test(input.expira)) {
      return { ok: false, error: 'fecha de expiración inválida' }
    }

    const { error } = await supabase.from('anuncios').insert({
      titulo,
      contenido,
      tipo: input.tipo,
      audiencia: input.audiencia,
      creado_por: yo.nombre, // derivado de la sesión
      // paridad SPA: expira al final del día elegido
      expira_en: input.expira ? new Date(input.expira + 'T23:59:59').toISOString() : null,
      activo: true,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export async function archivarAnuncio(input: { id: string }): Promise<Resultado> {
  try {
    const { supabase } = await getContexto()
    // RLS anuncios_update_creador: solo el creador
    const { data, error } = await supabase
      .from('anuncios').update({ activo: false }).eq('id', input.id).select()
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'solo el creador puede archivar este anuncio' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export async function marcarAnuncioVisto(input: { anuncioId: string }): Promise<Resultado> {
  try {
    const { supabase, yo } = await getContexto()
    // idempotente: si ya está marcado, no duplicar (PK anuncio_id+persona_nombre)
    const { data: ya } = await supabase
      .from('anuncios_vistos').select('anuncio_id')
      .eq('anuncio_id', input.anuncioId).eq('persona_nombre', yo.nombre)
    if (ya?.length) return { ok: true }

    const { error } = await supabase.from('anuncios_vistos').insert({
      anuncio_id: input.anuncioId,
      persona_nombre: yo.nombre, // derivado de la sesión
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}
