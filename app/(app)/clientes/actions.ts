'use server'

// Server Actions del catálogo de clientes (cutover 10). Todas las
// escrituras van con la SESIÓN del usuario → la RLS (área admi + dirección)
// es el candado real; aquí solo se valida forma y se dan errores claros.

import { createClient } from '@/lib/supabase/server'
import { mapPersonaRow } from '@/lib/peticiones'
import { CLIENTE_COLUMNAS_CSV, normalizarUsoCFDI } from '@/lib/clientes'

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

const RLS_DENEGADO = 'solo el área admi (o dirección) puede editar el catálogo de clientes'
const traducirError = (e: { code?: string; message: string }): string => {
  if (e.code === '42501') return RLS_DENEGADO
  if (e.code === '23505') return 'ya existe un cliente con ese nombre (el catálogo no admite duplicados)'
  if (e.code === '23503') return 'este cliente tiene peticiones ligadas — desactívalo en lugar de eliminarlo'
  return e.message
}

// Campos editables del catálogo (whitelist del payload del cliente)
type DatosCliente = Partial<Record<(typeof CLIENTE_COLUMNAS_CSV)[number], string | boolean | null>>

function limpiarDatos(datos: DatosCliente): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of CLIENTE_COLUMNAS_CSV) {
    if (!(col in datos)) continue
    const v = datos[col]
    if (col === 'persona_moral') {
      out[col] = typeof v === 'boolean' ? v : null
    } else if (typeof v === 'string') {
      // uso CFDI: siempre la CLAVE del catálogo SAT (capturas legadas caen a ella)
      const limpio = col === 'uso_cfdi' ? normalizarUsoCFDI(v) : v.trim()
      out[col] = limpio || null
    } else if (v === null) {
      out[col] = null
    }
  }
  return out
}

export async function crearCliente(input: DatosCliente): Promise<Resultado<{ id: string }>> {
  try {
    const { supabase, yo } = await getContexto()
    const datos = limpiarDatos(input)
    if (!datos.nombre) return { ok: false, error: 'el nombre comercial es obligatorio' }
    const { data, error } = await supabase
      .from('clientes').insert({ ...datos, creado_por: yo.nombre }).select('id')
    if (error) return { ok: false, error: traducirError(error) }
    return { ok: true, data: { id: data![0].id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

export async function editarCliente(input: { id: string } & DatosCliente): Promise<Resultado> {
  try {
    const { supabase } = await getContexto()
    const { id, ...resto } = input
    const datos = limpiarDatos(resto)
    if ('nombre' in datos && !datos.nombre) return { ok: false, error: 'el nombre comercial es obligatorio' }
    const { data, error } = await supabase.from('clientes').update(datos).eq('id', id).select('id')
    if (error) return { ok: false, error: traducirError(error) }
    if (!data?.length) return { ok: false, error: RLS_DENEGADO }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

// Baja LÓGICA (ajuste 3 de Daniela): la acción normal es activo=false — el
// FK de peticiones hace fallar el DELETE de clientes usados, a propósito.
export async function setActivoCliente(input: { id: string; activo: boolean }): Promise<Resultado> {
  try {
    const { supabase } = await getContexto()
    const { data, error } = await supabase
      .from('clientes').update({ activo: input.activo }).eq('id', input.id).select('id')
    if (error) return { ok: false, error: traducirError(error) }
    if (!data?.length) return { ok: false, error: RLS_DENEGADO }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

// Borrado real: SOLO dirección (RLS) y solo tiene sentido para altas
// erróneas sin peticiones ligadas; el FK protege el histórico.
export async function eliminarCliente(input: { id: string }): Promise<Resultado> {
  try {
    const { supabase } = await getContexto()
    const { data, error } = await supabase.from('clientes').delete().eq('id', input.id).select('id')
    if (error) return { ok: false, error: traducirError(error) }
    if (!data?.length) return { ok: false, error: 'solo dirección puede eliminar registros del catálogo' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}

// ---------- carga inicial por CSV (Admi exporta su lista una vez) ----------
// Parser mínimo con soporte de comillas (campos con comas/saltos). Template:
// header con los nombres de CLIENTE_COLUMNAS_CSV (solo `nombre` obligatorio;
// columnas extra se ignoran con aviso). Filas cuyo nombre ya existe se
// SALTAN (la carga inicial no pisa el catálogo); todo se reporta.
function parseCSV(texto: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let enComillas = false
  const s = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (enComillas) {
      if (c === '"' && s[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') enComillas = false
      else campo += c
    } else if (c === '"') enComillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = '' }
    else campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila) }
  return filas.filter((f) => f.some((x) => x.trim() !== ''))
}

export async function importarClientesCSV(input: { csv: string }): Promise<Resultado<{
  insertados: number
  saltados: string[]
  errores: string[]
  columnasIgnoradas: string[]
}>> {
  try {
    const { supabase, yo } = await getContexto()
    const filas = parseCSV(input.csv || '')
    if (filas.length < 2) return { ok: false, error: 'el CSV necesita un header y al menos una fila' }

    const header = filas[0].map((h) => h.trim().toLowerCase())
    if (!header.includes('nombre')) {
      return { ok: false, error: 'el CSV debe traer una columna "nombre" (nombre comercial del cliente)' }
    }
    const columnasIgnoradas = header.filter((h) => !(CLIENTE_COLUMNAS_CSV as readonly string[]).includes(h))

    // existentes para saltar duplicados (comparación case-insensitive)
    const { data: existentes, error: eSel } = await supabase.from('clientes').select('nombre')
    if (eSel) return { ok: false, error: eSel.message }
    const yaEstan = new Set((existentes ?? []).map((c) => String(c.nombre).trim().toLowerCase()))

    let insertados = 0
    const saltados: string[] = []
    const errores: string[] = []
    for (let i = 1; i < filas.length; i++) {
      const valores = filas[i]
      const datos: Record<string, unknown> = {}
      header.forEach((h, j) => {
        if (!(CLIENTE_COLUMNAS_CSV as readonly string[]).includes(h)) return
        const v = (valores[j] ?? '').trim()
        if (!v) return
        datos[h] = h === 'persona_moral'
          ? ['true', 'sí', 'si', '1', 'moral'].includes(v.toLowerCase())
          : h === 'uso_cfdi' ? normalizarUsoCFDI(v)
          : v
      })
      const nombre = String(datos.nombre ?? '').trim()
      if (!nombre) { errores.push(`fila ${i + 1}: sin nombre`); continue }
      if (yaEstan.has(nombre.toLowerCase())) { saltados.push(nombre); continue }

      const { error } = await supabase.from('clientes').insert({ ...datos, creado_por: yo.nombre })
      if (error) {
        if (error.code === '42501') return { ok: false, error: RLS_DENEGADO }
        errores.push(`fila ${i + 1} (${nombre}): ${traducirError(error)}`)
        continue
      }
      yaEstan.add(nombre.toLowerCase())
      insertados++
    }
    return { ok: true, data: { insertados, saltados, errores, columnasIgnoradas } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error inesperado' }
  }
}
