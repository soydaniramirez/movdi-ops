// Dominio de estrellas de colaboración — paridad con index.html.
// La "semana" es ISO 8601 (lunes-domingo; el jueves define el año), formato
// 'YYYY-Www' — la MISMA definición que valida la RLS estrellas_insert.

export type Estrella = {
  id: string
  de: string
  para: string
  motivo: string
  semana: string
  creadaEn: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapEstrellaRow(r: any): Estrella {
  return {
    id: r.id,
    de: r.de_persona,
    para: r.para_persona,
    motivo: r.motivo,
    semana: r.semana,
    creadaEn: r.creada_en,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Puerto exacto de semanaActual() del SPA (ISO 8601, jueves define el año).
export function semanaActual(fecha?: Date | string): string {
  const d = fecha ? new Date(fecha) : new Date()
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7 // lunes=0 ... domingo=6
  target.setDate(target.getDate() - dayNr + 3) // jueves de esta semana
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const firstDayNr = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3)
  const semana = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
  return `${target.getFullYear()}-W${String(semana).padStart(2, '0')}`
}

export const MAX_ESTRELLAS_SEMANA = 2
export const MAX_MOTIVO = 60

// Paridad puedoDarEstrella: razones en el mismo orden que la SPA.
export function puedoDarEstrella(opts: {
  yo: string
  para: string
  estrellas: Estrella[]
  semana?: string
}): { ok: true } | { ok: false; razon: string } {
  const sem = opts.semana ?? semanaActual()
  const mias = opts.estrellas.filter((e) => e.de === opts.yo && e.semana === sem)
  if (opts.para === opts.yo) return { ok: false, razon: 'no puedes darte una estrella a ti misma' }
  if (mias.length >= MAX_ESTRELLAS_SEMANA) return { ok: false, razon: 'ya diste tus 2 estrellas de esta semana' }
  if (mias.some((e) => e.para === opts.para)) {
    return { ok: false, razon: `ya le diste una estrella a ${opts.para} esta semana` }
  }
  return { ok: true }
}
