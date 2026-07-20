'use server'

// Server Actions del módulo recurrentes (mismo patrón que peticiones):
// cliente server con sesión → RLS aplica; sin service_role; creado_por
// derivado de la sesión. Paridad SPA: crear NO notifica (las instancias
// virtuales no tocan la BD; la única notif del ciclo es fecha_cambiada al
// mover, que vive en la action moverInstancia de peticiones).

import { createClient } from '@/lib/supabase/server'
import {
  AREAS_VALIDAS, type ModoAsignacion, destinatariosPorModo, hoyISO, isAdmin,
  mapPersonaRow, personaDisponible, supervisadasDe,
} from '@/lib/peticiones'
import { esCreadorRecurrentePrivilegiado, mapRecurRow, puedeCrearRecurrentes } from '@/lib/recurrentes'

type Resultado<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

// Modos admin-only en recurrentes (paridad: NO existe modo 'heads' aquí)
const MODOS_RECUR: ModoAsignacion[] = ['una', 'varias', 'area', 'ejecutivos', 'todos']
const MODOS_RECUR_ADMIN: ModoAsignacion[] = ['ejecutivos', 'todos']

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

export async function crearRecurrente(input: {
  nombre: string
  descripcion: string
  frecuencia: 'semanal' | 'quincenal' | 'mensual'
  dia?: number
  fechaInicio?: string // quincenal: fecha de la PRIMERA entrega (ancla de la serie de 14 días)
  modo: ModoAsignacion
  para?: string
  seleccion?: string[]
  area?: string
}): Promise<Resultado<{ creadas: number }>> {
  try {
    const { supabase, yo } = await getContexto()

    // Personas (lectura autenticada) — necesarias para resolver la relación de
    // supervisión (jefa directa) y para validar destinatarios más abajo.
    const { data: personasRows, error: eP } = await supabase.from('personas').select('*')
    if (eP) return { ok: false, error: eP.message }
    const personas = (personasRows ?? []).map(mapPersonaRow)

    if (!puedeCrearRecurrentes(yo, personas)) {
      return { ok: false, error: 'no tienes permiso para crear recurrentes' }
    }
    const nombre = (input.nombre || '').trim()
    if (!nombre) return { ok: false, error: 'el nombre es obligatorio' }
    if (!['semanal', 'quincenal', 'mensual'].includes(input.frecuencia)) {
      return { ok: false, error: 'frecuencia inválida' }
    }
    let dia = Number(input.dia ?? 0)
    if (input.frecuencia === 'quincenal') {
      // dia_semana se deriva del ancla; la fecha define qué semanas "tocan"
      if (!input.fechaInicio || !/^\d{4}-\d{2}-\d{2}$/.test(input.fechaInicio)) {
        return { ok: false, error: 'elige la fecha de la primera entrega' }
      }
      if (input.fechaInicio < hoyISO()) {
        return { ok: false, error: 'la primera entrega no puede ser una fecha pasada' }
      }
      dia = new Date(input.fechaInicio + 'T00:00:00Z').getUTCDay()
    } else if (input.frecuencia === 'mensual' ? dia < 1 || dia > 28 : dia < 1 || dia > 5) {
      return { ok: false, error: 'día inválido' }
    }
    if (!MODOS_RECUR.includes(input.modo)) return { ok: false, error: 'modo inválido' }
    if (MODOS_RECUR_ADMIN.includes(input.modo) && !isAdmin(yo)) {
      return { ok: false, error: 'ese modo de asignación es solo para dirección/heads' }
    }
    if (input.area && !(AREAS_VALIDAS as readonly string[]).includes(input.area)) {
      return { ok: false, error: 'área inválida' }
    }

    // "Jefa directa": quien NO es creadora privilegiada (ceo|head|rh|hardcode)
    // solo puede crear en modo 'una' y hacia una de sus supervisadas (relación
    // de managers). Cierra que use área/grupo o asigne fuera de su gente.
    if (!esCreadorRecurrentePrivilegiado(yo)) {
      if (input.modo !== 'una') {
        return { ok: false, error: 'como jefa directa solo puedes crear recurrentes de una en una, para tu equipo' }
      }
      const mias = supervisadasDe(yo, personas).map((p) => p.nombre)
      if (!input.para || !mias.includes(input.para)) {
        return { ok: false, error: 'solo puedes crear recurrentes para las personas a tu cargo' }
      }
    }

    const { destinatarios, area } = destinatariosPorModo(input.modo, {
      personas, yo, para: input.para, seleccion: input.seleccion, area: input.area,
    })
    if (!destinatarios.length) return { ok: false, error: 'falta destinatario' }
    for (const d of destinatarios) {
      const p = personas.find((x) => x.nombre === d)
      if (!p || !personaDisponible(p) || p.nombre === yo.nombre) {
        return { ok: false, error: `destinatario inválido: ${d}` }
      }
    }

    // 1 recurrente por persona, todas independientes (paridad: sin grupo_id)
    const filas = destinatarios.map((para) => ({
      nombre,
      descripcion: (input.descripcion || '').trim() || null,
      para,
      area,
      frecuencia: input.frecuencia,
      activa: true,
      creado_por: yo.nombre, // derivado de la sesión
      ...(input.frecuencia === 'mensual' ? { dia_mes: dia } : { dia_semana: dia }),
      // Solo quincenal: requiere la migración de cutover (columna fecha_inicio)
      ...(input.frecuencia === 'quincenal' ? { fecha_inicio: input.fechaInicio } : {}),
    }))

    const { data, error } = await supabase.from('recurrentes').insert(filas).select()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: { creadas: data?.length ?? 0 } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

// Pausar/activar — RLS recurrentes_update (2026-07-20): creador, dirección
// o jefa/head directa de la persona asignada (es_de_mi_equipo).
export async function toggleRecurrente(input: { id: string; activa: boolean }): Promise<Resultado> {
  try {
    const { supabase } = await getContexto()
    const { data, error } = await supabase
      .from('recurrentes').update({ activa: input.activa }).eq('id', input.id).select()
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'solo el creador, dirección o la jefa directa pueden pausar/activar' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

// Eliminar — RLS recurrentes_delete (2026-07-20): creador, dirección
// o jefa/head directa de la persona asignada (es_de_mi_equipo).
export async function eliminarRecurrente(input: { id: string }): Promise<Resultado> {
  try {
    const { supabase } = await getContexto()
    const { data, error } = await supabase
      .from('recurrentes').delete().eq('id', input.id).select()
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'solo el creador, dirección o la jefa directa pueden eliminar' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

// Entregar una instancia VIRTUAL: la materializa como fila entregada
// (paridad con confirmarEntrega esRecur de la SPA; sin notificación, como hoy).
// RLS peticiones_insert: origen_recur no nulo AND para = mi_nombre(),
// o creado_por = mi_nombre() si el creador entrega su propia recurrente.
export async function entregarInstanciaVirtual(input: {
  recurId: string
  fecha: string
  link?: string
  nota?: string
}): Promise<Resultado> {
  try {
    const { supabase } = await getContexto()
    const { data: recurRows } = await supabase.from('recurrentes').select('*').eq('id', input.recurId)
    const recur = recurRows?.[0] ? mapRecurRow(recurRows[0]) : null
    if (!recur) return { ok: false, error: 'no se encontró la recurrente origen' }

    const { error } = await supabase.from('peticiones').insert({
      zona: 'general',
      nombre: recur.nombre,
      descripcion: recur.descripcion,
      creado_por: recur.creadoPor,
      para: recur.para,
      area: recur.area,
      fecha: input.fecha,
      prioridad: 'media',
      estatus: 'entregado',
      privada: false,
      origen_recur: recur.id,
      link_entrega: (input.link || '').trim() || null,
      nota_entrega: (input.nota || '').trim() || null,
      fecha_entrega: hoyISO(),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}
