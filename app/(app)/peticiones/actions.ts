'use server'

// Server Actions del módulo de peticiones (enfoque híbrido):
// - Usan el cliente server con la SESIÓN del usuario (cookies) → RLS aplica
//   a todas las escrituras de peticiones. NO se usa service_role.
// - El INSERT de notificaciones también sale de aquí: el servidor deriva
//   remitente y payload (título/detalle), cerrando el spoofing del cliente.
//   (La policy interim `mi_nombre() is not null` se endurece en el cutover,
//   cuando la SPA vieja deje de insertar notificaciones directo.)
// - creado_por NUNCA viene del cliente: se deriva de la sesión.

import { createClient } from '@/lib/supabase/server'
import { notificarServidor } from '@/lib/supabase/notificar'
import {
  AREAS_VALIDAS, MODOS_ADMIN, ORIGENES_VALIDOS, type ModoAsignacion,
  destinatariosPorModo, fechaCorta, hoyISO, isAdmin,
  mapPersonaRow, matchNombre, personaDisponible, type Persona,
} from '@/lib/peticiones'

type Resultado<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

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

// Notificaciones: delega SIEMPRE en el helper único server-side
// (lib/supabase/notificar.ts, admin client). El payload se construye aquí,
// nunca en el cliente. Los args supabase/personas quedan para no tocar los
// call sites; la validación (no a uno mismo, no inactivos) vive en el helper.
async function notificar(
  _supabase: Awaited<ReturnType<typeof createClient>>,
  yo: Persona,
  _personas: Persona[],
  rows: { para: string; tipo: string; titulo: string; detalle: string | null; peticion_id: string | null }[]
) {
  await notificarServidor({ de: yo.nombre, rows })
}

export async function crearPeticion(input: {
  nombre: string
  descripcion: string
  fecha: string
  prioridad: 'alta' | 'media' | 'baja'
  privada: boolean
  modo: ModoAsignacion
  para?: string
  seleccion?: string[]
  area?: string
}): Promise<Resultado<{ creadas: number }>> {
  try {
    const { supabase, yo } = await getContexto()

    const nombre = (input.nombre || '').trim()
    if (!nombre) return { ok: false, error: 'el nombre de la petición es obligatorio' }
    if (!['alta', 'media', 'baja'].includes(input.prioridad)) return { ok: false, error: 'prioridad inválida' }
    if (input.area && !(AREAS_VALIDAS as readonly string[]).includes(input.area)) {
      return { ok: false, error: 'área inválida' }
    }
    // Gating de modos admin-only EN SERVIDOR (paridad: isAdmin = ceo|head)
    if (MODOS_ADMIN.includes(input.modo) && !isAdmin(yo)) {
      return { ok: false, error: 'ese modo de asignación es solo para dirección/heads' }
    }

    // Personas (lectura autenticada) para derivar/validar destinatarios
    const { data: personasRows, error: ePersonas } = await supabase.from('personas').select('*')
    if (ePersonas) return { ok: false, error: ePersonas.message }
    const personas = (personasRows ?? []).map(mapPersonaRow)

    const { destinatarios, area } = destinatariosPorModo(input.modo, {
      personas, yo, para: input.para, seleccion: input.seleccion, area: input.area,
    })
    if (!destinatarios.length) return { ok: false, error: 'falta destinatario' }

    // Validación server-side: existen, disponibles y no soy yo
    for (const d of destinatarios) {
      const p = personas.find((x) => x.nombre === d)
      if (!p || !personaDisponible(p) || p.nombre === yo.nombre) {
        return { ok: false, error: `destinatario inválido: ${d}` }
      }
    }

    const esGrupo = destinatarios.length > 1
    const grupoId = esGrupo ? crypto.randomUUID() : null
    const filas = destinatarios.map((para) => ({
      zona: 'general',
      nombre,
      descripcion: (input.descripcion || '').trim() || null,
      creado_por: yo.nombre, // derivado de la sesión, no del cliente
      para,
      area,
      fecha: input.fecha || hoyISO(),
      prioridad: input.prioridad,
      estatus: 'pendiente',
      privada: input.privada === true,
      grupo_id: grupoId,
    }))

    const { data, error } = await supabase.from('peticiones').insert(filas).select()
    if (error) return { ok: false, error: error.message }

    await notificar(supabase, yo, personas,
      (data ?? []).map((d) => ({
        para: d.para,
        tipo: 'nueva_peticion',
        titulo: `nueva petición de ${yo.nombre}`,
        detalle: nombre,
        peticion_id: d.id,
      }))
    )

    return { ok: true, data: { creadas: data?.length ?? 0 } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

// Fase compromisos: auto-asignación de primera clase ("+ nuevo compromiso").
// Solicitante = asignado = yo (la RLS de INSERT ya lo permite). SIEMPRE
// privada = false, forzado en servidor: un compromiso privado sería
// invisible para el líder (RLS de privadas: solo creador/para, que aquí son
// la misma persona) y rompería el propósito. origen es OBLIGATORIO y sin
// default — es el dato que se quiere medir. Sin notificación (es para uno
// mismo) y sin XP (ver anti-farmeo en lib/gamificacion.ts).
export async function crearCompromiso(input: {
  nombre: string
  descripcion: string
  fecha: string
  prioridad: 'alta' | 'media' | 'baja'
  origen: string
}): Promise<Resultado> {
  try {
    const { supabase, yo } = await getContexto()

    const nombre = (input.nombre || '').trim()
    if (!nombre) return { ok: false, error: 'el nombre del compromiso es obligatorio' }
    if (!['alta', 'media', 'baja'].includes(input.prioridad)) return { ok: false, error: 'prioridad inválida' }
    if (!(ORIGENES_VALIDOS as readonly string[]).includes(input.origen)) {
      return { ok: false, error: 'indica de dónde nace el compromiso (talento, cliente, interno o propio)' }
    }
    if (!input.fecha) return { ok: false, error: 'elige la fecha de compromiso' }
    if (input.fecha < hoyISO()) return { ok: false, error: 'la fecha de compromiso no puede ser en el pasado' }

    const area = yo.areas?.find((a) => (AREAS_VALIDAS as readonly string[]).includes(a)) || 'imkt'
    const { error } = await supabase.from('peticiones').insert({
      zona: 'general',
      nombre,
      descripcion: (input.descripcion || '').trim() || null,
      creado_por: yo.nombre, // derivado de la sesión
      para: yo.nombre,       // auto-asignación: solicitante = asignado
      area,
      fecha: input.fecha,
      prioridad: input.prioridad,
      estatus: 'pendiente',
      privada: false,
      origen: input.origen,
    })
    if (error) {
      // pre-cutover 9: la columna origen aún no existe en BD
      if (/origen/i.test(error.message) && (error.code === 'PGRST204' || error.code === '42703')) {
        return { ok: false, error: 'los compromisos aún no están habilitados — falta aplicar la migración de BD (cutover 9)' }
      }
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export async function entregarPeticion(input: {
  id: string
  link?: string
  nota?: string
}): Promise<Resultado> {
  try {
    const { supabase } = await getContexto()
    // RLS: solo creador o destinatario pueden actualizar
    const { data, error } = await supabase
      .from('peticiones')
      .update({
        estatus: 'entregado',
        link_entrega: (input.link || '').trim() || null,
        nota_entrega: (input.nota || '').trim() || null,
        fecha_entrega: hoyISO(),
      })
      .eq('id', input.id)
      .select()
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'no puedes cambiar el estatus de esta petición' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export async function cambiarEstatus(input: {
  id: string
  estatus: 'pendiente' | 'proceso'
}): Promise<Resultado> {
  try {
    const { supabase, yo } = await getContexto()
    const { data: actualRows, error: e0 } = await supabase
      .from('peticiones').select('*').eq('id', input.id)
    const actual = actualRows?.[0]
    if (e0 || !actual) return { ok: false, error: 'petición no encontrada' }

    const { data, error } = await supabase
      .from('peticiones').update({ estatus: input.estatus }).eq('id', input.id).select()
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'no puedes cambiar el estatus de esta petición' }

    // Reabrir una entregada notifica al destinatario (paridad con la SPA)
    if (actual.estatus === 'entregado' && input.estatus === 'pendiente' && actual.para !== yo.nombre) {
      const { data: personasRows } = await supabase.from('personas').select('*')
      await notificar(supabase, yo, (personasRows ?? []).map(mapPersonaRow), [{
        para: actual.para,
        tipo: 'reabierta',
        titulo: `${yo.nombre} reabrió "${actual.nombre}"`,
        detalle: 'vuelve a estar pendiente · revisa los detalles',
        peticion_id: actual.id,
      }])
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export async function cambiarFecha(input: {
  id: string
  nuevaFecha: string
  motivo: string
  extensionJustificada?: boolean
}): Promise<Resultado> {
  try {
    const { supabase, yo } = await getContexto()
    const motivo = (input.motivo || '').trim()
    if (!input.nuevaFecha) return { ok: false, error: 'elige una nueva fecha' }
    if (motivo.length < 10) return { ok: false, error: 'escribe al menos 10 caracteres explicando el motivo' }

    const { data: rows, error: e0 } = await supabase.from('peticiones').select('*').eq('id', input.id)
    const t = rows?.[0]
    if (e0 || !t) return { ok: false, error: 'petición no encontrada' }

    const soyCreador = t.creado_por === yo.nombre
    const soyDestinatario = matchNombre(t.para, yo.nombre)
    if (!soyCreador && !soyDestinatario) {
      return { ok: false, error: 'solo el creador o el destinatario pueden cambiar la fecha' }
    }

    const payload: Record<string, unknown> = {
      fecha: input.nuevaFecha,
      fecha_original: t.fecha_original || t.fecha,
      motivo_cambio_fecha: motivo,
      cambio_visto_por_creador: soyCreador, // si cambió el destinatario, alerta para el creador
    }
    if (soyCreador) payload.extension_justificada = input.extensionJustificada !== false

    const { data, error } = await supabase.from('peticiones').update(payload).eq('id', input.id).select()
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'no se pudo actualizar' }

    const { data: personasRows } = await supabase.from('personas').select('*')
    const personas = (personasRows ?? []).map(mapPersonaRow)
    if (soyCreador) {
      const notaJustif = input.extensionJustificada === false ? ' · cuenta contra la fecha original' : ''
      await notificar(supabase, yo, personas, [{
        para: t.para,
        tipo: 'fecha_cambiada',
        titulo: `${yo.nombre} extendió el plazo de "${t.nombre}"`,
        detalle: `nueva fecha: ${fechaCorta(input.nuevaFecha)} · motivo: ${motivo}${notaJustif}`,
        peticion_id: t.id,
      }])
    } else {
      await notificar(supabase, yo, personas, [{
        para: t.creado_por,
        tipo: 'fecha_cambiada',
        titulo: `${yo.nombre} cambió la fecha de "${t.nombre}"`,
        detalle: `nueva fecha: ${fechaCorta(input.nuevaFecha)} · motivo: ${motivo}`,
        peticion_id: t.id,
      }])
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

// Mover una instancia de recurrente (solo creador o admin; el patrón sigue normal).
// Instancia real → UPDATE. Instancia virtual (aún sin fila) → INSERT con origen_recur.
export async function moverInstancia(input: {
  peticionId?: string
  recurId?: string
  fechaInstancia?: string
  nuevaFecha: string
  motivo: string
  justificada: boolean
}): Promise<Resultado> {
  try {
    const { supabase, yo } = await getContexto()
    const motivo = (input.motivo || '').trim()
    if (!input.nuevaFecha) return { ok: false, error: 'selecciona una nueva fecha' }
    if (motivo.length < 10) return { ok: false, error: 'el motivo debe tener al menos 10 caracteres' }
    if (input.nuevaFecha < hoyISO()) return { ok: false, error: 'no puedes mover la entrega a una fecha que ya pasó' }

    if (input.peticionId) {
      // Instancia real
      const { data: rows } = await supabase.from('peticiones').select('*').eq('id', input.peticionId)
      const t = rows?.[0]
      if (!t) return { ok: false, error: 'no se encontró esa instancia' }
      if (!t.origen_recur) return { ok: false, error: 'esta no es una instancia recurrente' }
      if (t.creado_por !== yo.nombre && !isAdmin(yo)) {
        return { ok: false, error: 'solo el creador o dirección puede mover una instancia' }
      }
      if (input.nuevaFecha === t.fecha) return { ok: false, error: 'la nueva fecha es igual a la actual' }

      const { data, error } = await supabase.from('peticiones').update({
        fecha: input.nuevaFecha,
        fecha_original: t.fecha_original || t.fecha,
        motivo_cambio_fecha: motivo,
        extension_justificada: input.justificada,
        cambio_visto_por_creador: true,
      }).eq('id', t.id).select()
      if (error) return { ok: false, error: error.message }
      if (!data?.length) return { ok: false, error: 'no se pudo mover (RLS)' }

      const { data: personasRows } = await supabase.from('personas').select('*')
      const notaJustif = input.justificada ? '' : ' · cuenta contra la fecha original'
      await notificar(supabase, yo, (personasRows ?? []).map(mapPersonaRow), [{
        para: t.para,
        tipo: 'fecha_cambiada',
        titulo: `${yo.nombre} movió tu entrega de "${t.nombre}"`,
        detalle: `del ${fechaCorta(t.fecha)} al ${fechaCorta(input.nuevaFecha)} · motivo: ${motivo}${notaJustif}`,
        peticion_id: null,
      }])
      return { ok: true }
    }

    // Instancia virtual: crear la fila movida desde la recurrente origen
    if (!input.recurId || !input.fechaInstancia) return { ok: false, error: 'falta la recurrente origen' }
    const { data: recurRows } = await supabase.from('recurrentes').select('*').eq('id', input.recurId)
    const recur = recurRows?.[0]
    if (!recur) return { ok: false, error: 'no se encontró la recurrente origen' }
    if (recur.creado_por !== yo.nombre && !isAdmin(yo)) {
      return { ok: false, error: 'solo el creador o dirección puede mover una instancia' }
    }

    const { error } = await supabase.from('peticiones').insert({
      zona: 'general',
      nombre: recur.nombre,
      descripcion: recur.descripcion || null,
      creado_por: recur.creado_por,
      para: recur.para,
      area: recur.area,
      fecha: input.nuevaFecha,
      fecha_original: input.fechaInstancia,
      motivo_cambio_fecha: motivo,
      extension_justificada: input.justificada,
      prioridad: 'media',
      estatus: 'pendiente',
      privada: false,
      origen_recur: recur.id,
      cambio_visto_por_creador: true,
    })
    if (error) return { ok: false, error: error.message }

    const { data: personasRows } = await supabase.from('personas').select('*')
    const notaJustif = input.justificada ? '' : ' · cuenta contra la fecha original'
    await notificar(supabase, yo, (personasRows ?? []).map(mapPersonaRow), [{
      para: recur.para,
      tipo: 'fecha_cambiada',
      titulo: `${yo.nombre} movió tu entrega de "${recur.nombre}"`,
      detalle: `del ${fechaCorta(input.fechaInstancia)} al ${fechaCorta(input.nuevaFecha)} · motivo: ${motivo}${notaJustif}`,
      peticion_id: null,
    }])
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export async function eliminarPeticion(input: { id: string }): Promise<Resultado> {
  try {
    const { supabase } = await getContexto()
    // RLS: solo el creador puede borrar
    const { data, error } = await supabase.from('peticiones').delete().eq('id', input.id).select()
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'solo el creador puede eliminar esta petición' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

// ---------- ocultar/mostrar entregadas (paridad limpiarEntregadas del SPA) ----------
// Soft-hide personal: agrega/quita MI nombre (derivado de la sesión) en
// oculta_para. Nunca borra filas — el progreso/stats no se tocan. La RLS
// (creador OR destinatario) decide qué filas puedo marcar; las demás fallan
// en silencio, exactamente como en el SPA ("parcialmente exitoso").

export async function ocultarEntregadas(input: {
  scope: 'general' | 'mis' | 'pedi'
}): Promise<Resultado<{ ocultadas: number }>> {
  try {
    const { supabase, yo } = await getContexto()
    const { data: rows, error } = await supabase
      .from('peticiones').select('*').eq('estatus', 'entregado')
    if (error) return { ok: false, error: error.message }

    let candidatas = (rows ?? []).filter((r) => !(r.oculta_para ?? []).includes(yo.nombre))
    if (input.scope === 'pedi') candidatas = candidatas.filter((r) => r.creado_por === yo.nombre)
    else if (input.scope === 'general') candidatas = candidatas.filter((r) => r.zona === 'general' && !r.privada)
    else candidatas = candidatas.filter((r) => matchNombre(r.para, yo.nombre))

    if (!candidatas.length) return { ok: true, data: { ocultadas: 0 } }

    let ocultadas = 0
    for (const r of candidatas) {
      const { data: upd } = await supabase
        .from('peticiones')
        .update({ oculta_para: [...(r.oculta_para ?? []), yo.nombre] })
        .eq('id', r.id)
        .select('id')
      if (upd?.length) ocultadas++
    }
    return { ok: true, data: { ocultadas } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export async function ocultarPeticion(input: { id: string }): Promise<Resultado> {
  try {
    const { supabase, yo } = await getContexto()
    const { data: r } = await supabase.from('peticiones').select('*').eq('id', input.id).maybeSingle()
    if (!r) return { ok: false, error: 'petición no encontrada' }
    if ((r.oculta_para ?? []).includes(yo.nombre)) return { ok: true }
    const { data: upd, error } = await supabase
      .from('peticiones')
      .update({ oculta_para: [...(r.oculta_para ?? []), yo.nombre] })
      .eq('id', input.id)
      .select('id')
    if (error) return { ok: false, error: error.message }
    if (!upd?.length) return { ok: false, error: 'no tienes permiso para ocultar esta petición' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export async function desocultarPeticion(input: { id: string }): Promise<Resultado> {
  try {
    const { supabase, yo } = await getContexto()
    const { data: r } = await supabase.from('peticiones').select('*').eq('id', input.id).maybeSingle()
    if (!r) return { ok: false, error: 'petición no encontrada' }
    const { data: upd, error } = await supabase
      .from('peticiones')
      .update({ oculta_para: (r.oculta_para ?? []).filter((n: string) => n !== yo.nombre) })
      .eq('id', input.id)
      .select('id')
    if (error) return { ok: false, error: error.message }
    if (!upd?.length) return { ok: false, error: 'no tienes permiso para modificar esta petición' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}
