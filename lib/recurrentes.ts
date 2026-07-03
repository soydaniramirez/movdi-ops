// Motor de recurrentes — puerto exacto del index.html viejo (líneas 3158-3229).
// Las instancias son VIRTUALES (calculadas al vuelo); solo se materializan en
// una fila de peticiones al entregar o al mover.

import { type Peticion, type Persona, estaPausada, matchNombre } from './peticiones'

export type Recurrente = {
  id: string
  nombre: string
  descripcion: string | null
  para: string
  area: string | null
  frecuencia: 'semanal' | 'quincenal' | 'mensual'
  diaSemana: number | null
  diaMes: number | null
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
    activa: r.activa !== false,
    creadoPor: r.creado_por,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Quién puede crear/administrar recurrentes (paridad puedeCrearRecurrentes):
// ceo + heads + rh, más los ejecutivos especiales Salvador y Arylene.
export function puedeCrearRecurrentes(u: Pick<Persona, 'nivel' | 'nombre'> | null) {
  if (!u) return false
  if (u.nivel === 'ceo' || u.nivel === 'head' || u.nivel === 'rh') return true
  if (u.nombre === 'Salvador' || u.nombre === 'Arylene') return true
  return false
}

// Próxima fecha del patrón (paridad exacta, incluido el quirk: quincenal se
// comporta como semanal en la generación).
export function proximaFecha(r: Recurrente): string {
  const hoy = new Date(new Date().toDateString())
  if (r.frecuencia === 'mensual') {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), r.diaMes ?? 1)
    if (d < hoy) d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  }
  const d = new Date(hoy)
  const diff = ((r.diaSemana ?? 1) - hoy.getDay() + 7) % 7
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

// Avance de una ocurrencia cuando la actual ya está entregada
// (paridad exacta: mensual +1 mes, todo lo demás +7 días).
export function siguienteOcurrencia(fecha: string, frecuencia: Recurrente['frecuencia']): string {
  const d = new Date(fecha + 'T00:00:00')
  if (frecuencia === 'mensual') d.setMonth(d.getMonth() + 1)
  else d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
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
      fechaR = siguienteOcurrencia(fechaR, r.frecuencia)
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
        recurOrigen: r.id,
        esVirtual: true,
      })
    }
  }
  return out
}

export const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
export const etiquetaFrecuencia = (r: Recurrente) =>
  r.frecuencia === 'mensual'
    ? `mensual · día ${r.diaMes}`
    : `${r.frecuencia} · ${DIAS_SEMANA[r.diaSemana ?? 1]}`
