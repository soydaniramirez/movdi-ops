'use server'

// Server Actions de gestión de personas — el módulo más sensible.
// TODAS re-validan nivel ceo|head con la SESIÓN (además de la policy
// personas_modify_admin). Datos derivados en servidor, nunca del cliente.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AREAS_VALIDAS, isAdmin, mapPersonaRow, matchNombre, personaDisponible } from '@/lib/peticiones'

type Resultado = { ok: true; aviso?: string } | { ok: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NIVELES = ['ejecutivo', 'head', 'ceo', 'rh'] as const

async function getAdminContexto() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('sin sesión')
  const { data: row } = await supabase
    .from('personas').select('*').eq('email', user.email).maybeSingle()
  if (!row) throw new Error('tu cuenta no está ligada a una persona del equipo')
  const yo = mapPersonaRow(row)
  if (!yo.activo) throw new Error('cuenta archivada')
  // gating server-side: solo ceo|head gestionan personas (paridad policy)
  if (!isAdmin(yo)) throw new Error('solo dirección o heads pueden gestionar personas')
  return { supabase, yo }
}

type DatosPersona = {
  nombre: string
  apellido: string
  rol: string
  email: string
  area: string
  nivel: (typeof NIVELES)[number]
  managerPrincipal: string | null
  managers: string[]
}

function validarDatos(input: DatosPersona): string | null {
  if (!input.nombre.trim() || !input.apellido.trim() || !input.rol.trim()) {
    return 'completa nombre, apellido y rol'
  }
  if (input.email && !EMAIL_RE.test(input.email)) {
    return 'revisa el formato del correo (ej: nombre@movdi.mx)'
  }
  if (!(AREAS_VALIDAS as readonly string[]).includes(input.area)) return 'área inválida'
  if (!NIVELES.includes(input.nivel)) return 'nivel inválido'
  return null
}

// Paridad guardarPersona: managers de apoyo excluyen al principal;
// nivel rh → needs_pass=true y área rh añadida.
function payloadPersona(input: DatosPersona, areasExistentes?: string[]) {
  const email = input.email.trim().toLowerCase() || null
  const managers = input.managers.filter((m) => m !== input.managerPrincipal)
  const esRH = input.nivel === 'rh'
  const areas = esRH
    ? [...new Set([...(areasExistentes ?? []), input.area, 'rh'])]
    : [input.area]
  return {
    nombre: input.nombre.trim(),
    apellido: input.apellido.trim(),
    rol: input.rol.trim(),
    email,
    areas,
    nivel: input.nivel,
    needs_pass: esRH,
    managers,
    manager_principal: input.managerPrincipal || null,
  }
}

export async function crearPersona(input: DatosPersona): Promise<Resultado> {
  try {
    const { supabase } = await getAdminContexto()
    const err = validarDatos(input)
    if (err) return { ok: false, error: err }

    const payload = payloadPersona(input)
    const { error } = await supabase.from('personas').insert(payload)
    if (error) {
      if (error.code === '23505') return { ok: false, error: 'ese correo ya está registrado en personas' }
      return { ok: false, error: error.message }
    }

    // ── INVITE AUTOMÁTICO ──────────────────────────────────────────────
    // ÚNICO uso de service_role en toda la aplicación. Justificación:
    // auth.admin.inviteUserByEmail requiere privilegios de administración
    // de Auth que la anon key no tiene ni debe tener. Corre SOLO en este
    // Server Action (lib/supabase/admin.ts lleva `import 'server-only'`:
    // el build falla si alguien lo importa en código cliente). Cierra de
    // raíz el hueco "persona sin cuenta" — ya no existe el flujo manual
    // de invitar desde el dashboard de Supabase.
    if (payload.email) {
      try {
        const admin = createAdminClient()
        const { error: eInvite } = await admin.auth.admin.inviteUserByEmail(payload.email)
        if (eInvite) {
          const yaExiste =
            eInvite.status === 422 || /already|registered|exists/i.test(eInvite.message ?? '')
          if (yaExiste) {
            // degradación con gracia: no duplicar; la persona quedará
            // vinculada por email en su primer login (flujo existente)
            return { ok: true, aviso: `${payload.email} ya tenía cuenta en Auth — no se envió invitación (se vinculará al iniciar sesión)` }
          }
          return { ok: true, aviso: `persona creada, pero la invitación no se pudo enviar: ${eInvite.message}. reintenta desde editar o avisa a dirección` }
        }
      } catch (e) {
        return { ok: true, aviso: 'persona creada, pero la invitación no se pudo enviar: ' + (e instanceof Error ? e.message : 'error') }
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export async function editarPersona(input: DatosPersona & { id: string }): Promise<Resultado> {
  try {
    const { supabase } = await getAdminContexto()
    const err = validarDatos(input)
    if (err) return { ok: false, error: err }

    const { data: rows } = await supabase.from('personas').select('*').eq('id', input.id)
    const actual = rows?.[0]
    if (!actual) return { ok: false, error: 'persona no encontrada' }

    const payload = payloadPersona(input, actual.areas ?? [])
    const { data, error } = await supabase.from('personas').update(payload).eq('id', input.id).select()
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'no se pudo actualizar (RLS)' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export async function pausarPersona(input: { id: string; hasta: string }): Promise<Resultado> {
  try {
    const { supabase } = await getAdminContexto()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.hasta)) return { ok: false, error: 'usa AAAA-MM-DD (ej: 2026-06-15)' }
    const { data, error } = await supabase
      .from('personas').update({ pausada_hasta: input.hasta }).eq('id', input.id).select()
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'no se pudo pausar (RLS)' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export async function reanudarPersona(input: { id: string }): Promise<Resultado> {
  try {
    const { supabase } = await getAdminContexto()
    const { data, error } = await supabase
      .from('personas').update({ pausada_hasta: null }).eq('id', input.id).select()
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'no se pudo reanudar (RLS)' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export async function reactivarPersona(input: { id: string }): Promise<Resultado> {
  try {
    const { supabase } = await getAdminContexto()
    const { data, error } = await supabase
      .from('personas').update({ activo: true }).eq('id', input.id).select()
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'no se pudo reactivar (RLS)' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

// Desactivar con reasignación — TODO O NADA.
// PostgREST no expone transacciones multi-tabla, así que la atomicidad se
// implementa con compensación: cada paso guarda el estado previo y, si un
// paso posterior falla (o actualiza menos filas de las esperadas, p. ej.
// por RLS), se REVIERTE todo lo aplicado y la persona NO queda desactivada.
// (Una función RPC transaccional puede sustituir esto en cutover si se quiere
// atomicidad a nivel de BD; queda anotado en docs/CUTOVER.md.)
export async function desactivarConReasignacion(input: {
  personaId: string
  reasignPeticionesA?: string
  reasignRecurrentesA?: string
}): Promise<Resultado> {
  try {
    const { supabase } = await getAdminContexto()

    const [{ data: persRows }, { data: petRows }, { data: recRows }] = await Promise.all([
      supabase.from('personas').select('*'),
      supabase.from('peticiones').select('*'),
      supabase.from('recurrentes').select('*'),
    ])
    const personas = (persRows ?? []).map(mapPersonaRow)
    const persona = personas.find((p) => p.id === input.personaId)
    if (!persona) return { ok: false, error: 'persona no encontrada' }

    // qué se reasigna (paridad eliminarPersona): peticiones activas y
    // recurrentes activas asignadas a la persona
    const peticiones = (petRows ?? []).filter(
      (t) => matchNombre(t.para, persona.nombre) && t.estatus !== 'entregado',
    )
    const recurrentes = (recRows ?? []).filter(
      (r) => matchNombre(r.para, persona.nombre) && r.activa !== false,
    )

    const validarDestino = (nombre?: string) => {
      if (!nombre) return null
      const d = personas.find((p) => p.nombre === nombre)
      if (!d || d.id === persona.id || !personaDisponible(d)) return `destino inválido: ${nombre}`
      return null
    }
    if (peticiones.length > 0 && !input.reasignPeticionesA) {
      return { ok: false, error: 'elige a quién reasignar las peticiones' }
    }
    if (recurrentes.length > 0 && !input.reasignRecurrentesA) {
      return { ok: false, error: 'elige a quién reasignar las recurrentes' }
    }
    const eDest = validarDestino(input.reasignPeticionesA) ?? validarDestino(input.reasignRecurrentesA)
    if (eDest) return { ok: false, error: eDest }

    // pasos aplicados (para compensar en caso de fallo)
    const revertir: (() => Promise<void>)[] = []
    const fallar = async (msg: string): Promise<Resultado> => {
      for (const paso of revertir.reverse()) {
        try { await paso() } catch { /* la compensación es best-effort; se reporta abajo */ }
      }
      return { ok: false, error: `no se pudo completar — nada quedó desactivado: ${msg}` }
    }

    // 1. reasignar peticiones (verificando que RLS dejó actualizar TODAS)
    if (peticiones.length > 0 && input.reasignPeticionesA) {
      const ids = peticiones.map((p) => p.id)
      const originales = new Map(peticiones.map((p) => [p.id, p.para]))
      const { data, error } = await supabase
        .from('peticiones').update({ para: input.reasignPeticionesA }).in('id', ids).select()
      if (error) return await fallar(error.message)
      if ((data?.length ?? 0) !== ids.length) {
        // RLS bloqueó filas (no eres creador/destinatario de alguna)
        const hechas = (data ?? []).map((d) => d.id)
        revertir.push(async () => {
          for (const id of hechas) {
            await supabase.from('peticiones').update({ para: originales.get(id) }).eq('id', id)
          }
        })
        return await fallar(`solo ${data?.length ?? 0}/${ids.length} peticiones se pudieron reasignar (RLS: peticiones creadas por otros)`)
      }
      revertir.push(async () => {
        for (const id of ids) {
          await supabase.from('peticiones').update({ para: originales.get(id) }).eq('id', id)
        }
      })
    }

    // 2. reasignar recurrentes
    if (recurrentes.length > 0 && input.reasignRecurrentesA) {
      const ids = recurrentes.map((r) => r.id)
      const originales = new Map(recurrentes.map((r) => [r.id, r.para]))
      const { data, error } = await supabase
        .from('recurrentes').update({ para: input.reasignRecurrentesA }).in('id', ids).select()
      if (error) return await fallar(error.message)
      if ((data?.length ?? 0) !== ids.length) {
        const hechas = (data ?? []).map((d) => d.id)
        revertir.push(async () => {
          for (const id of hechas) {
            await supabase.from('recurrentes').update({ para: originales.get(id) }).eq('id', id)
          }
        })
        return await fallar(`solo ${data?.length ?? 0}/${ids.length} recurrentes se pudieron reasignar`)
      }
      revertir.push(async () => {
        for (const id of ids) {
          await supabase.from('recurrentes').update({ para: originales.get(id) }).eq('id', id)
        }
      })
    }

    // 3. desactivar (último paso: si falla, se revierte todo lo anterior)
    const { data: desData, error: eDesact } = await supabase
      .from('personas').update({ activo: false }).eq('id', persona.id).select()
    if (eDesact) return await fallar(eDesact.message)
    if (!desData?.length) return await fallar('la desactivación no aplicó (RLS)')

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}
