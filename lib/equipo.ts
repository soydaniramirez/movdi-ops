// Dominio del equipo — semáforo y agrupación por managers (paridad renderSide).

import { type Peticion, type Persona, diasHasta, matchNombre, normalizarTexto, tengoSupervisadas } from './peticiones'
import { type Instancia } from './recurrentes'

export type PersonaConManagers = Persona & { managers: string[]; managerPrincipal: string | null }

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapPersonaConManagers(r: any): PersonaConManagers {
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
    authUserId: r.auth_user_id ?? null,
    managers: r.managers ?? [],
    managerPrincipal: r.manager_principal ?? null,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const esDireccion = (u: Pick<PersonaConManagers, 'esDireccion' | 'nivel'> | null) =>
  !!u && (u.esDireccion === true || u.nivel === 'ceo')

export type EstadoSemaforo = 'r' | 'y' | 'g' | 'x'
export type ItemSemaforo = { p: PersonaConManagers; total: number; estado: EstadoSemaforo }

// Paridad calcularSem: peticiones activas visibles + instancias recurrentes pendientes.
export function calcularSemaforo(
  p: PersonaConManagers,
  peticiones: Peticion[],
  instancias: Instancia[],
): ItemSemaforo {
  const normales = peticiones.filter(
    (t) => matchNombre(t.para, p.nombre) && t.estatus !== 'entregado' && !t.origenRecur,
  )
  const recurInst = instancias.filter((t) => t.estatus !== 'entregado')
  const tareas = [...normales, ...recurInst]
  const venc = tareas.filter((t) => diasHasta(t.fecha) < 0).length
  const sem7 = tareas.filter((t) => { const d = diasHasta(t.fecha); return d >= 0 && d <= 7 }).length
  let estado: EstadoSemaforo = 'x'
  if (venc > 0) estado = 'r'
  else if (sem7 > 0) estado = 'y'
  else if (tareas.length > 0) estado = 'g'
  return { p, total: tareas.length, estado }
}

export const ordenSemaforo = (a: ItemSemaforo, b: ItemSemaforo) => {
  const ord: Record<EstadoSemaforo, number> = { r: 0, y: 1, g: 2, x: 3 }
  return ord[a.estado] - ord[b.estado] || b.total - a.total
}

// Paridad renderSide: bloques según el rol del usuario.
// dirección → "mi equipo directo" + "resto del equipo" (todos los activos)
// head / jefa directa → "mi equipo directo" (principal=yo) + "🤝 soy apoyo"
//   (en managers, no principal) — misma relación de supervisión para ambos.
// otros → ninguno
export function bloquesEquipo(
  yo: PersonaConManagers,
  personas: PersonaConManagers[],
): { titulo: string; personas: PersonaConManagers[] }[] {
  const elegibles = personas.filter(
    (p) =>
      (p.nivel === 'ejecutivo' || p.nivel === 'rh' || p.nivel === 'head') &&
      p.nombre !== yo.nombre &&
      p.activo !== false,
  )
  if (esDireccion(yo)) {
    const directos = elegibles.filter((p) => p.managerPrincipal === yo.nombre)
    const resto = elegibles.filter((p) => p.managerPrincipal !== yo.nombre)
    const out = []
    if (directos.length) out.push({ titulo: 'mi equipo directo', personas: directos })
    if (resto.length) out.push({ titulo: 'resto del equipo', personas: resto })
    return out
  }
  // head o jefa directa (ejecutiva/rh con gente a cargo): misma lógica, ambos
  // ven SOLO a quienes supervisan (principal o apoyo).
  if (yo.nivel === 'head' || tengoSupervisadas(yo, personas)) {
    const visibles = elegibles.filter(
      (p) => p.managerPrincipal === yo.nombre || (p.managers || []).includes(yo.nombre),
    )
    const directos = visibles.filter((p) => p.managerPrincipal === yo.nombre)
    const apoyo = visibles.filter(
      (p) => p.managerPrincipal !== yo.nombre && (p.managers || []).includes(yo.nombre),
    )
    const out = []
    if (directos.length) out.push({ titulo: 'mi equipo directo', personas: directos })
    if (apoyo.length) out.push({ titulo: '🤝 soy apoyo', personas: apoyo })
    return out
  }
  return []
}

// ---------- Organigrama (solo lectura, 2026-07-20) ----------

// Quién ve la página /organigrama: dirección, RH o área admi. Mismo criterio
// para el gate del nav (layout) y el redirect de la página.
export const veOrganigrama = (
  u: Pick<PersonaConManagers, 'esDireccion' | 'nivel' | 'areas'> | null,
) => !!u && (esDireccion(u) || u.nivel === 'rh' || (u.areas ?? []).includes('admi'))

// Nodo del árbol: la persona, sus hijos (por manager_principal = línea sólida)
// y sus apoyos (managers distintos del principal = líneas punteadas).
export type NodoOrg = { persona: PersonaConManagers; hijos: NodoOrg[]; apoyos: string[] }

// Construye el árbol EN VIVO desde personas (fuente: manager_principal/managers,
// matcheo por nombre normalizado como es_de_mi_equipo). Sin profundidad fija.
// - raices: personas con es_direccion (cada una es su propio árbol).
// - cada no-dirección cuelga de su manager_principal.
// - sinAsignar: no-dirección cuyo manager_principal es nulo o no existe entre
//   las personas activas (detector de datos incompletos).
export function construirOrganigrama(personas: PersonaConManagers[]): {
  raices: NodoOrg[]
  sinAsignar: NodoOrg[]
} {
  const activos = personas.filter((p) => p.activo !== false)
  const norm = (s: string | null | undefined) => normalizarTexto(s ?? '')

  const nodos = new Map<string, NodoOrg>()
  for (const p of activos) {
    nodos.set(norm(p.nombre), {
      persona: p,
      hijos: [],
      // apoyos = managers menos el principal (evita duplicar la línea sólida)
      apoyos: (p.managers ?? []).filter((m) => norm(m) !== norm(p.managerPrincipal) && norm(m) !== ''),
    })
  }

  const raices: NodoOrg[] = []
  const sinAsignar: NodoOrg[] = []
  for (const p of activos) {
    const self = nodos.get(norm(p.nombre))!
    if (p.esDireccion) { raices.push(self); continue }
    const padre = p.managerPrincipal ? nodos.get(norm(p.managerPrincipal)) : undefined
    if (padre && padre !== self) padre.hijos.push(self)
    else sinAsignar.push(self)
  }

  // orden estable por nombre en cada nivel
  const ordenar = (ns: NodoOrg[]) => {
    ns.sort((a, b) => a.persona.nombre.localeCompare(b.persona.nombre))
    ns.forEach((n) => ordenar(n.hijos))
  }
  ordenar(raices)
  ordenar(sinAsignar)
  return { raices, sinAsignar }
}
