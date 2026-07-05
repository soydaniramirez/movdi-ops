'use server'

// Cierre de mes → historial_mensual. Solo DIRECCIÓN (paridad: el botón del
// SPA solo lo ve esDireccion; la RLS hist_insert = mi_es_direccion() lo
// respalda en BD). El reporte se calcula EN EL SERVIDOR con datos frescos —
// el cliente no manda cifras.

import { createClient } from '@/lib/supabase/server'
import { mapPersonaRow, mapPeticionRow } from '@/lib/peticiones'
import { mapEstrellaRow } from '@/lib/estrellas'
import { esDireccion } from '@/lib/equipo'
import {
  calcularReporteCierre, mapHistorialRow, mapRecompensaRow, mesAnteriorStr, mesCerrado,
} from '@/lib/gamificacion'

type Resultado<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

export async function cerrarMes(): Promise<Resultado<{ mes: string; filas: number }>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: 'sin sesión' }
    const { data: row } = await supabase
      .from('personas').select('*').eq('email', user.email).maybeSingle()
    if (!row) return { ok: false, error: 'tu cuenta no está ligada a una persona del equipo' }
    const yo = mapPersonaRow(row)
    if (!esDireccion({ esDireccion: yo.esDireccion, nivel: yo.nivel })) {
      return { ok: false, error: 'solo dirección puede cerrar el mes' }
    }

    const mesAnt = mesAnteriorStr()

    const [pers, pets, est, rec, hist] = await Promise.all([
      supabase.from('personas').select('*'),
      supabase.from('peticiones').select('*'),
      supabase.from('estrellas_colaboracion').select('*'),
      supabase.from('recompensas').select('*'),
      supabase.from('historial_mensual').select('*'),
    ])

    const historial = (hist.data ?? []).map(mapHistorialRow)
    if (mesCerrado(historial, mesAnt)) {
      return { ok: false, error: `el mes ${mesAnt} ya fue cerrado anteriormente` }
    }

    const reporte = calcularReporteCierre({
      mes: mesAnt,
      personas: (pers.data ?? []).map(mapPersonaRow),
      peticiones: (pets.data ?? []).map(mapPeticionRow),
      estrellas: (est.data ?? []).map(mapEstrellaRow),
      recompensas: (rec.data ?? []).map(mapRecompensaRow),
    })
    if (reporte.length === 0) {
      return { ok: false, error: `no hay entregas registradas en ${mesAnt} para cerrar` }
    }

    // paridad ejecutarCierreMes: una fila por persona con actividad
    const filas = reporte.map((r) => ({
      persona: r.persona,
      mes: mesAnt,
      xp_total: r.xp,
      nivel_alcanzado: r.nivel,
      entregadas: r.entregadas,
      cumplimiento: r.cumplimiento,
      mejor_racha: r.mejorRacha,
      recompensa: r.recompensa,
    }))
    const { data, error } = await supabase.from('historial_mensual').insert(filas).select()
    if (error) return { ok: false, error: 'no se pudo cerrar el mes: ' + error.message }
    return { ok: true, data: { mes: mesAnt, filas: data?.length ?? 0 } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

// ---------- Fase 4.8: gestión de recompensas ----------

async function getYo() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('sin sesión')
  const { data: row } = await supabase
    .from('personas').select('*').eq('email', user.email).maybeSingle()
  if (!row) throw new Error('tu cuenta no está ligada a una persona del equipo')
  return { supabase, yo: mapPersonaRow(row) }
}

// Editar el catálogo (qué recompensa da cada nivel). El editor de UI lo ve
// solo Dani (decisión 4.8); en servidor y RLS el respaldo es dirección
// (recomp_write = mi_es_direccion()).
export async function guardarRecompensa(input: {
  nivel: number
  descripcion: string
  activa: boolean
}): Promise<Resultado> {
  try {
    const { supabase, yo } = await getYo()
    if (!esDireccion({ esDireccion: yo.esDireccion, nivel: yo.nivel })) {
      return { ok: false, error: 'solo dirección puede editar el catálogo de recompensas' }
    }
    const descripcion = (input.descripcion || '').trim()
    if (!Number.isInteger(input.nivel) || input.nivel < 1 || input.nivel > 5) {
      return { ok: false, error: 'nivel inválido' }
    }
    if (!descripcion) return { ok: false, error: 'escribe la recompensa' }

    const { data: existentes } = await supabase.from('recompensas').select('*').eq('nivel', input.nivel)
    if (existentes?.length) {
      const { error } = await supabase.from('recompensas')
        .update({ descripcion, activa: input.activa }).eq('id', existentes[0].id)
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('recompensas')
        .insert({ nivel: input.nivel, descripcion, activa: input.activa })
      if (error) return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

// RH marca una recompensa ganada como entregada. Post-cutover el UPDATE por
// API queda limitado por grant a la COLUMNA recompensa_entregada, con policy
// para rh/dirección — aquí solo re-validamos el nivel.
export async function marcarRecompensaEntregada(input: { id: string }): Promise<Resultado> {
  try {
    const { supabase, yo } = await getYo()
    const esRH = yo.nivel === 'rh'
    if (!esRH && !esDireccion({ esDireccion: yo.esDireccion, nivel: yo.nivel })) {
      return { ok: false, error: 'solo rh o dirección pueden marcar entregas' }
    }
    const { data, error } = await supabase.from('historial_mensual')
      .update({ recompensa_entregada: true }).eq('id', input.id).select('id')
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'no se encontró la fila (o sin permiso)' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}
