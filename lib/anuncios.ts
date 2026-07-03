// Dominio de anuncios — paridad con index.html (TIPOS_ANUNCIO, AUDIENCIAS_LABEL,
// anuncioAplicaA, anuncioExpirado, anunciosActivosParaMi).

import type { Persona } from './peticiones'

export type Anuncio = {
  id: string
  titulo: string
  contenido: string
  tipo: 'urgente' | 'importante' | 'informativo' | 'cultura'
  audiencia: string
  creadoPor: string
  creadoEn: string
  expiraEn: string | null
  activo: boolean
}

export type AnuncioVisto = {
  anuncioId: string
  personaNombre: string
  vistoEn: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapAnuncioRow(r: any): Anuncio {
  return {
    id: r.id,
    titulo: r.titulo,
    contenido: r.contenido,
    tipo: r.tipo,
    audiencia: r.audiencia,
    creadoPor: r.creado_por,
    creadoEn: r.creado_en,
    expiraEn: r.expira_en ?? null,
    activo: r.activo !== false,
  }
}

export function mapVistoRow(r: any): AnuncioVisto {
  return { anuncioId: r.anuncio_id, personaNombre: r.persona_nombre, vistoEn: r.visto_en }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const TIPOS_ANUNCIO: Record<Anuncio['tipo'], { label: string; clase: string }> = {
  urgente: { label: '🔴 urgente', clase: 'border-red-500/40 text-red-400 bg-red-500/10' },
  importante: { label: '🟡 importante', clase: 'border-amber-400/40 text-amber-400 bg-amber-400/10' },
  informativo: { label: '🔵 informativo', clase: 'border-sky-400/40 text-sky-400 bg-sky-400/10' },
  cultura: { label: '🎉 cultura', clase: 'border-purple-400/40 text-purple-400 bg-purple-400/10' },
}

export const AUDIENCIAS_LABEL: Record<string, string> = {
  todos: 'todo el equipo',
  heads: 'solo heads',
  ejecutivos: 'solo ejecutivos',
  area_imkt: 'área IMKT',
  area_pm: 'área P. Managers',
  area_legal: 'área Legal',
  area_admi: 'área Admi',
  area_ventas: 'área Ventas',
  area_digital: 'área Digital',
  area_rh: 'área RH',
}

export const AUDIENCIAS = Object.keys(AUDIENCIAS_LABEL)

// Quién puede crear anuncios (paridad con la policy anuncios_insert_admin_rh)
export const puedeCrearAnuncios = (p: Pick<Persona, 'nivel'> | null) =>
  !!p && ['ceo', 'head', 'rh'].includes(p.nivel)

// ¿Aplica el anuncio a esta persona? (paridad anuncioAplicaA)
export function anuncioAplicaA(a: Anuncio, persona: Pick<Persona, 'nivel' | 'areas'>): boolean {
  const aud = a.audiencia
  if (aud === 'todos') return true
  if (aud === 'heads') return persona.nivel === 'head' || persona.nivel === 'ceo'
  if (aud === 'ejecutivos') return persona.nivel === 'ejecutivo'
  if (aud.startsWith('area_')) return (persona.areas || []).includes(aud.substring(5))
  return false
}

export const anuncioExpirado = (a: Anuncio, ahora?: Date) =>
  !!a.expiraEn && new Date(a.expiraEn) < (ahora ?? new Date())

export const anunciosActivosPara = (anuncios: Anuncio[], persona: Pick<Persona, 'nivel' | 'areas'>) =>
  anuncios.filter((a) => a.activo && !anuncioExpirado(a) && anuncioAplicaA(a, persona))

export const anuncioVistoPor = (vistos: AnuncioVisto[], anuncioId: string, nombre: string) =>
  vistos.some((v) => v.anuncioId === anuncioId && v.personaNombre === nombre)
