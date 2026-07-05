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
}

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
