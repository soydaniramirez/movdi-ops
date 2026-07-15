// Tipos y helpers del dominio compartidos entre cliente y servidor.
// Paridad con los helpers del index.html viejo (fechas, permisos, áreas).

export type Persona = {
  id: string
  nombre: string
  apellido: string
  rol: string
  nivel: 'ceo' | 'head' | 'ejecutivo' | 'rh'
  areas: string[]
  email: string | null
  activo: boolean
  pausadaHasta: string | null
  esDireccion: boolean
  // Fase 4.8: "ve todo" en gamificación (estrellas/recompensas/historial).
  // Pre-cutover la columna no existe en BD → cae a es_direccion (mismo
  // grupo: Dani y Emmanuel), así staging se comporta igual antes y después.
  veGamificacionCompleta: boolean
}

export type Peticion = {
  id: string
  zona: 'general' | 'heads'
  nombre: string
  descripcion: string | null
  creadoPor: string
  para: string
  area: string | null
  fecha: string
  prioridad: 'alta' | 'media' | 'baja'
  estatus: 'pendiente' | 'proceso' | 'entregado' | 'archivada'
  privada: boolean
  origenRecur: string | null
  grupoId: string | null
  fechaOriginal: string | null
  motivoCambioFecha: string | null
  cambioVistoPorCreador: boolean
  extensionJustificada: boolean | null
  linkEntrega: string | null
  notaEntrega: string | null
  fechaEntrega: string | null
  ocultaPara: string[]
  creadaEn: string | null
  // Fase compromisos (cutover 9): de dónde nace la tarea. NULL = histórico
  // sin clasificar (sin default a propósito — es el dato que se quiere medir).
  origen: OrigenPeticion | null
  // Último movimiento REAL (updated_at con trigger condicional: solo cambios
  // de estatus/descripcion/entrega). Pre-cutover ≈ creadaEn (columna viva
  // desde siempre pero sin escrituras).
  actualizadaEn: string | null
  // Formularios dinámicos (cutover 10): tipo por área + campos específicos
  // (jsonb whitelisteado por lib/tipos-peticion.ts) + liga al catálogo.
  tipoPeticion: string | null
  detalle: Record<string, string | boolean> | null
  clienteId: string | null
}

export const ORIGENES_VALIDOS = ['talento', 'cliente', 'interno', 'propio'] as const
export type OrigenPeticion = (typeof ORIGENES_VALIDOS)[number]

export const AREAS_VALIDAS = ['imkt', 'pm', 'legal', 'admi', 'ventas', 'digital', 'rh'] as const
export const AREAS_LABEL: Record<string, string> = {
  imkt: 'IMKT', pm: 'P.Mgrs', legal: 'Legal', admi: 'Admi',
  ventas: 'Ventas', digital: 'Digital', rh: 'RH', heads: 'Heads',
}

export const MODOS_ASIGNACION = ['una', 'varias', 'area', 'heads', 'ejecutivos', 'todos'] as const
export type ModoAsignacion = (typeof MODOS_ASIGNACION)[number]
export const MODOS_ADMIN: ModoAsignacion[] = ['heads', 'ejecutivos', 'todos']

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapPersonaRow(r: any): Persona {
  return {
    id: r.id,
    nombre: r.nombre,
    apellido: r.apellido ?? '',
    rol: r.rol ?? '',
    nivel: r.nivel,
    areas: r.areas ?? [],
    email: r.email ?? null,
    activo: r.activo !== false,
    pausadaHasta: r.pausada_hasta ?? null,
    esDireccion: r.es_direccion === true,
    veGamificacionCompleta: r.ve_gamificacion_completa ?? r.es_direccion === true,
  }
}

// ⚠ plazo ajustado — paridad EXACTA de margenPeticion del SPA (index.html
// L1500): días de margen con los que NACIÓ la petición (día de creación →
// fecha límite ORIGINAL si hubo cambios). El indicador se enciende con
// margen ≤ 2 ('plazo ajustado') y margen ≤ 1 ('plazo muy ajustado'), solo
// en no entregadas y nunca en instancias recurrentes.
export function margenPeticion(
  t: Pick<Peticion, 'creadaEn' | 'fecha' | 'fechaOriginal'>,
): number | null {
  if (!t.creadaEn || !t.fecha) return null
  const pedida = new Date((t.creadaEn || '').slice(0, 10))
  const limite = new Date(t.fechaOriginal || t.fecha)
  if (isNaN(pedida.getTime()) || isNaN(limite.getTime())) return null
  return Math.round((limite.getTime() - pedida.getTime()) / (24 * 3600 * 1000))
}

export function mapPeticionRow(r: any): Peticion {
  return {
    id: r.id,
    zona: r.zona,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    creadoPor: r.creado_por,
    para: r.para,
    area: r.area ?? null,
    fecha: r.fecha,
    prioridad: r.prioridad ?? 'media',
    estatus: r.estatus ?? 'pendiente',
    privada: r.privada === true,
    origenRecur: r.origen_recur ?? null,
    grupoId: r.grupo_id ?? null,
    fechaOriginal: r.fecha_original ?? null,
    motivoCambioFecha: r.motivo_cambio_fecha ?? null,
    cambioVistoPorCreador: r.cambio_visto_por_creador !== false,
    extensionJustificada: r.extension_justificada ?? null,
    linkEntrega: r.link_entrega ?? null,
    notaEntrega: r.nota_entrega ?? null,
    fechaEntrega: r.fecha_entrega ?? null,
    ocultaPara: r.oculta_para ?? [],
    creadaEn: r.created_at ?? null,
    origen: r.origen ?? null,
    actualizadaEn: r.updated_at ?? null,
    tipoPeticion: r.tipo_peticion ?? null,
    detalle: r.detalle ?? null,
    clienteId: r.cliente_id ?? null,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- fechas (paridad con la SPA) ----------
export const hoyISO = () => new Date().toISOString().slice(0, 10)
export const dx = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}
const fechaObj = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const diasHasta = (s: string) =>
  Math.floor((fechaObj(s).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000)

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const fechaCorta = (s: string) => {
  const d = fechaObj(s)
  return `${d.getDate()} ${MESES[d.getMonth()]}`
}

export function labelFecha(t: Peticion): string {
  if (t.estatus === 'entregado') {
    const limite = t.extensionJustificada === false ? (t.fechaOriginal ?? t.fecha) : t.fecha
    if (t.fechaEntrega && t.fechaEntrega > limite) {
      const dr = Math.round((fechaObj(t.fechaEntrega).getTime() - fechaObj(limite).getTime()) / 86400000)
      return `entregada · ${dr}d tarde`
    }
    return 'entregada ✓'
  }
  const d = diasHasta(t.fecha)
  if (d < 0) return `vencida ${Math.abs(d)}d`
  if (d === 0) return 'hoy'
  if (d === 1) return 'mañana'
  if (d <= 7) return `en ${d}d`
  return fechaCorta(t.fecha)
}

// ---------- compromisos auto-asignados y regla de los 3 días ----------

// Compromiso propio (Fase compromisos): nace del botón "+ nuevo compromiso"
// (origen='propio', solicitante = asignado) o cualquier fila donde creador y
// destinatario son la misma persona. Las instancias recurrentes nunca cuentan
// (su creado_por hereda del patrón). Los compromisos propios NO otorgan ni
// restan XP/gamificación — ver lib/gamificacion.ts (anti-farmeo).
export function esCompromisoPropio(
  t: Pick<Peticion, 'creadoPor' | 'para' | 'origen' | 'origenRecur'>,
): boolean {
  if (t.origenRecur) return false
  return t.origen === 'propio' || matchNombre(t.creadoPor, t.para)
}

// Días hábiles (L–V) transcurridos DESPUÉS de `desde`, hasta `hasta`
// inclusive. viernes → lunes = 1; mismo día = 0.
export function diasHabilesEntre(desdeISO: string, hastaISO: string): number {
  const d = fechaObj(desdeISO)
  const hasta = fechaObj(hastaISO)
  let n = 0
  d.setDate(d.getDate() + 1)
  while (d.getTime() <= hasta.getTime()) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}

// Suma n días hábiles (L–V) a una fecha — para las fechas de compromiso
// automáticas por SLA (cutover 10). Un viernes + 2 hábiles = martes.
export function sumaDiasHabiles(desdeISO: string, n: number): string {
  const d = fechaObj(desdeISO)
  let faltan = n
  while (faltan > 0) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) faltan--
  }
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// Días hábiles sin movimiento real: desde el último movimiento (updated_at
// mantenido por el trigger condicional de BD; cae a created_at) hasta hoy.
export function diasSinMovimiento(
  t: Pick<Peticion, 'actualizadaEn' | 'creadaEn'>,
  hoy?: string,
): number | null {
  const base = (t.actualizadaEn || t.creadaEn || '').slice(0, 10)
  if (!base) return null
  return diasHabilesEntre(base, hoy ?? hoyISO())
}

// Estados calculados (no hay campo en BD). Precedencia: atorada (3+ días
// hábiles sin movimiento → ROJO) > vencida > por vencer (fecha en ≤2 días) >
// al día. Entregadas/archivadas no tienen estado.
export type EstadoMovimiento = 'al_dia' | 'por_vencer' | 'vencida' | 'atorada'

export function estadoMovimiento(
  t: Pick<Peticion, 'estatus' | 'fecha' | 'actualizadaEn' | 'creadaEn'>,
  hoy?: string,
): EstadoMovimiento | null {
  if (t.estatus === 'entregado' || t.estatus === 'archivada') return null
  const h = hoy ?? hoyISO()
  const sinMov = diasSinMovimiento(t, h)
  if (sinMov !== null && sinMov >= 3) return 'atorada'
  const d = Math.round((fechaObj(t.fecha).getTime() - fechaObj(h).getTime()) / 86400000)
  if (d < 0) return 'vencida'
  if (d <= 2) return 'por_vencer'
  return 'al_dia'
}

// ---------- permisos (paridad con la SPA) ----------
export const isAdmin = (p: Pick<Persona, 'nivel'> | null) =>
  !!p && (p.nivel === 'ceo' || p.nivel === 'head')

export const estaPausada = (p: Persona) => !!p.pausadaHasta && hoyISO() <= p.pausadaHasta
export const personaDisponible = (p: Persona) => p.activo !== false && !estaPausada(p)

export const normalizarTexto = (s: string) =>
  (s || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
export const matchNombre = (a: string | null, b: string | null) =>
  !!a && !!b && normalizarTexto(a) === normalizarTexto(b)

export function puedoVerPeticion(t: Peticion, yo: Persona) {
  if (!t.privada) return true
  if (t.creadoPor === yo.nombre) return true
  if (matchNombre(t.para, yo.nombre)) return true
  return false
}

// Destinatarios elegibles según modo (paridad exacta con guardarPeticion de la SPA)
export function destinatariosPorModo(
  modo: ModoAsignacion,
  opts: { personas: Persona[]; yo: Persona; para?: string; seleccion?: string[]; area?: string }
): { destinatarios: string[]; area: string } {
  const { personas, yo } = opts
  const areaDefault = yo.areas?.find((a) => (AREAS_VALIDAS as readonly string[]).includes(a)) || 'imkt'
  const disponibles = personas.filter((p) => p.nombre !== yo.nombre && personaDisponible(p))

  switch (modo) {
    case 'una':
      return { destinatarios: opts.para ? [opts.para] : [], area: opts.area || areaDefault }
    case 'varias':
      return { destinatarios: opts.seleccion ?? [], area: areaDefault }
    case 'area': {
      const area = opts.area || areaDefault
      return { destinatarios: disponibles.filter((p) => p.areas.includes(area)).map((p) => p.nombre), area }
    }
    case 'heads':
      return { destinatarios: disponibles.filter((p) => p.nivel === 'head').map((p) => p.nombre), area: areaDefault }
    case 'ejecutivos':
      return { destinatarios: disponibles.filter((p) => p.nivel === 'ejecutivo').map((p) => p.nombre), area: areaDefault }
    case 'todos':
      return { destinatarios: disponibles.filter((p) => p.nivel !== 'ceo').map((p) => p.nombre), area: areaDefault }
  }
}
