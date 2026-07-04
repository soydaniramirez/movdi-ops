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
