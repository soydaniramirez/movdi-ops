// Motor de recurrentes — puerto exacto del index.html viejo (líneas 3158-3229).
// Las instancias son VIRTUALES (calculadas al vuelo); solo se materializan en
// una fila de peticiones al entregar o al mover.

import { type Peticion, type Persona, estaPausada, matchNombre, tengoSupervisadas } from './peticiones'

export type Recurrente = {
  id: string
  nombre: string
  descripcion: string | null
  para: string
  area: string | null
  frecuencia: 'semanal' | 'quincenal' | 'mensual'
  diaSemana: number | null
  diaMes: number | null
  // Ancla de las quincenales REALES (cada 14 días desde esta fecha).
  // null = patrón legacy pre-cutover: se comporta como semanal (paridad SPA).
  fechaInicio: string | null
  activa: boolean
  creadoPor: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapRecurRow(r: any): Recurrente {
  return {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    para: r.para,
    area: r.area ?? null,
    frecuencia: r.frecuencia,
    diaSemana: r.dia_semana ?? null,
    diaMes: r.dia_mes ?? null,
    fechaInicio: r.fecha_inicio ?? null,
    activa: r.activa !== false,
    creadoPor: r.creado_por,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Creadores PRIVILEGIADOS de recurrentes (paridad histórica exacta del antiguo
// puedeCrearRecurrentes): ceo + heads + rh, más los ejecutivos especiales
// Salvador y Arylene. Pueden asignar por área/grupo (según el gating de modos)
// y a cualquiera. Los hardcodes se conservan por ahora (no se limpian aquí).
export function esCreadorRecurrentePrivilegiado(u: Pick<Persona, 'nivel' | 'nombre'> | null) {
  if (!u) return false
  if (u.nivel === 'ceo' || u.nivel === 'head' || u.nivel === 'rh') return true
  if (u.nombre === 'Salvador' || u.nombre === 'Arylene') return true
  return false
}

// Quién puede crear/administrar recurrentes: los privilegiados de siempre, o
// una "jefa directa" (ejecutiva con gente a cargo vía managers). La jefa SOLO
// puede crear en modo 'una' y para sus supervisadas — eso se valida en el
// servidor (recurrentes/actions.ts). `personas` es necesaria para resolver la
// supervisión; sin ella solo se reconoce a los privilegiados.
export function puedeCrearRecurrentes(
  u: Pick<Persona, 'nivel' | 'nombre'> | null,
  personas?: Pick<Persona, 'nombre' | 'managers' | 'managerPrincipal' | 'activo'>[],
) {
  if (esCreadorRecurrentePrivilegiado(u)) return true
  if (u && personas) return tengoSupervisadas(u, personas)
  return false
}

// ---------- aritmética de fechas (strings YYYY-MM-DD, sin sorpresas de TZ) ----------
const aDias = (s: string) =>
  Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 86400000
export const sumarDias = (s: string, n: number) =>
  new Date((aDias(s) + n) * 86400000).toISOString().slice(0, 10)
export const diffDias = (desde: string, hasta: string) => aDias(hasta) - aDias(desde)
export const dowDe = (s: string) => new Date(s + 'T00:00:00Z').getUTCDay()

const hoyEngine = () => new Date(new Date().toDateString()).toISOString().slice(0, 10)

// Próxima ocurrencia de una serie quincenal anclada (fecha_inicio + 14k).
export function proximaOcurrenciaQuincenal(ancla: string, desde: string): string {
  const d = diffDias(ancla, desde)
  const k = d <= 0 ? 0 : Math.ceil(d / 14)
  return sumarDias(ancla, k * 14)
}

// Próxima fecha del patrón.
// - mensual: dia_mes del mes en curso (si ya pasó, el siguiente) — paridad SPA.
// - quincenal CON fecha_inicio: serie real cada 14 días desde el ancla.
// - semanal (y quincenal legacy sin ancla): próximo dia_semana, hoy cuenta — paridad SPA.
export function proximaFecha(r: Recurrente): string {
  const hoy = new Date(new Date().toDateString())
  if (r.frecuencia === 'mensual') {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), r.diaMes ?? 1)
    if (d < hoy) d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  }
  if (r.frecuencia === 'quincenal' && r.fechaInicio) {
    return proximaOcurrenciaQuincenal(r.fechaInicio, hoyEngine())
  }
  const d = new Date(hoy)
  const diff = ((r.diaSemana ?? 1) - hoy.getDay() + 7) % 7
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

// Avance de una ocurrencia cuando la actual ya está entregada.
// mensual +1 mes · quincenal real +14d · semanal (y quincenal legacy) +7d.
export function siguienteOcurrencia(fecha: string, r: Pick<Recurrente, 'frecuencia' | 'fechaInicio'>): string {
  if (r.frecuencia === 'mensual') {
    const d = new Date(fecha + 'T00:00:00')
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  }
  if (r.frecuencia === 'quincenal' && r.fechaInicio) return sumarDias(fecha, 14)
  return sumarDias(fecha, 7)
}

// ¿La fecha dada es ocurrencia del patrón? (misma semántica que la generación
// y que la función SQL del cron de recordatorios — fuente única de verdad).
export function esOcurrenciaEnFecha(r: Recurrente, fecha: string): boolean {
  if (!r.activa) return false
  if (r.frecuencia === 'mensual') return Number(fecha.slice(8, 10)) === r.diaMes
  if (r.frecuencia === 'quincenal' && r.fechaInicio) {
    const d = diffDias(r.fechaInicio, fecha)
    return d >= 0 && d % 14 === 0
  }
  return dowDe(fecha) === (r.diaSemana ?? -1)
}

// Fechas que el patrón debió producir en la ventana [hoy - semanasAtras*7, hoy]
// (cumplimiento). Alineado por construcción con esOcurrenciaEnFecha:
// quincenal real usa la MISMA serie anclada (hoy en la SPA el ancla implícita
// es "hoy", lo que desfasa qué semanas tocan — ese bug muere aquí).
export function calcularFechasEsperadas(r: Recurrente, hoy?: string, semanasAtras = 12): string[] {
  const h = hoy ?? hoyEngine()
  const limite = sumarDias(h, -semanasAtras * 7)
  const fechas: string[] = []

  if (r.frecuencia === 'mensual') {
    const hd = new Date(h + 'T00:00:00Z')
    const cursor = new Date(Date.UTC(hd.getUTCFullYear(), hd.getUTCMonth(), r.diaMes ?? 1))
    while (true) {
      const s = cursor.toISOString().slice(0, 10)
      if (s < limite) break
      if (s <= h) fechas.push(s)
      cursor.setUTCMonth(cursor.getUTCMonth() - 1)
    }
    return fechas.reverse()
  }

  if (r.frecuencia === 'quincenal' && r.fechaInicio) {
    for (let f = r.fechaInicio; f <= h; f = sumarDias(f, 14)) {
      if (f >= limite) fechas.push(f)
    }
    return fechas
  }

  // semanal (y quincenal legacy: paso 14 con ancla implícita en hoy — paridad SPA)
  const paso = r.frecuencia === 'quincenal' ? 14 : 7
  let ult = sumarDias(h, -((dowDe(h) - (r.diaSemana ?? 1) + 7) % 7))
  while (ult >= limite) {
    fechas.push(ult)
    ult = sumarDias(ult, -paso)
  }
  return fechas.reverse()
}

export type Instancia = Peticion & { recurOrigen: string; esVirtual: boolean }

export const idVirtual = (recurId: string, fecha: string) => `rec__${recurId}__${fecha}`

// Instancias visibles de una persona (puerto exacto de obtenerInstanciasRecur).
export function obtenerInstanciasRecur(opts: {
  recurrentes: Recurrente[]
  peticiones: Peticion[]
  personas: Persona[]
  nombre: string
}): Instancia[] {
  const { recurrentes, peticiones, personas, nombre } = opts
  const out: Instancia[] = []

  const persona = personas.find((p) => matchNombre(p.nombre, nombre))
  if (!persona || persona.activo === false) return out
  if (estaPausada(persona)) return out

  // Instancia "efectiva" para una fecha esperada: misma fecha exacta, o fila
  // MOVIDA desde esa fecha (fecha_original) — evita virtuales fantasma.
  const instanciaEfectivaPara = (r: Recurrente, fechaR: string) =>
    peticiones.find((x) => x.origenRecur === r.id && (x.fecha === fechaR || x.fechaOriginal === fechaR))

  for (const r of recurrentes) {
    if (!r.activa) continue
    if (!matchNombre(r.para, nombre)) continue

    let fechaR = proximaFecha(r)
    let inst = instanciaEfectivaPara(r, fechaR)

    // Si la instancia (movida o normal) ya está entregada/archivada,
    // calcular la SIGUIENTE fecha y volver a buscar.
    if (inst && (inst.estatus === 'entregado' || inst.estatus === 'archivada')) {
      fechaR = siguienteOcurrencia(fechaR, r)
      inst = instanciaEfectivaPara(r, fechaR)
    }

    if (inst) {
      if (inst.estatus === 'entregado' || inst.estatus === 'archivada') continue
      out.push({ ...inst, recurOrigen: r.id, esVirtual: false })
    } else {
      out.push({
        id: idVirtual(r.id, fechaR),
        zona: 'general',
        nombre: r.nombre,
        descripcion: r.descripcion,
        creadoPor: r.creadoPor,
        para: r.para,
        area: r.area,
        fecha: fechaR,
        prioridad: 'media',
        estatus: 'pendiente',
        privada: false,
        origenRecur: r.id,
        grupoId: null,
        fechaOriginal: null,
        motivoCambioFecha: null,
        cambioVistoPorCreador: true,
        extensionJustificada: null,
        linkEntrega: null,
        notaEntrega: null,
        fechaEntrega: null,
        ocultaPara: [],
        creadaEn: null,
        origen: null,
        actualizadaEn: null,
        tipoPeticion: null,
        detalle: null,
        clienteId: null,
        recurOrigen: r.id,
        esVirtual: true,
      })
    }
  }
  return out
}

export const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
export const etiquetaFrecuencia = (r: Recurrente) => {
  if (r.frecuencia === 'mensual') return `mensual · día ${r.diaMes}`
  if (r.frecuencia === 'quincenal' && r.fechaInicio) {
    return `quincenal · ${DIAS_SEMANA[dowDe(r.fechaInicio)]} (desde ${r.fechaInicio})`
  }
  return `${r.frecuencia} · ${DIAS_SEMANA[r.diaSemana ?? 1]}`
}
