// "Quién hace qué" (2026-10-26) — referencia de SOLO LECTURA de cómo se
// reparte el trabajo entre áreas. Contenido aprobado por dirección (fuente:
// quien-hace-que.html, octubre 2026). Vive en código, no en Supabase: editar
// un texto o un papel es cambiar una línea aquí, sin tocar JSX.

export type AreaQhq = 'dir' | 'ven' | 'pm' | 'imk' | 'dig'

export type AreaInfo = {
  id: AreaQhq
  name: string
  short?: string
  side: string
  desc: string
}

export const AREAS: AreaInfo[] = [
  { id: 'dir', name: 'Dirección', side: 'De MOVDI', desc: 'Marca el rumbo y las prioridades, aprueba y ayuda a destrabar cuando algo se atora.' },
  { id: 'ven', name: 'Ventas', side: 'De la marca', desc: 'Abre puertas con marcas, agencias y plataformas, y lleva presses y propuestas a quien las necesita.' },
  { id: 'pm', name: 'Personal Management', short: 'PM', side: 'Del talento', desc: 'Acompaña la carrera de sus creadores. Es quien mejor los conoce, cuenta su historia y los mueve con marcas.' },
  { id: 'imk', name: 'Influencer Marketing', short: 'IMKT', side: 'De la marca', desc: 'Arma propuestas, cotizaciones y estrategias creativas; ejecuta campañas y reporta resultados.' },
  { id: 'dig', name: 'Digital', side: 'De MOVDI', desc: 'Lleva las redes de MOVDI, el diseño y las asesorías de marca personal. Convierte el contenido de cada área en algo visual.' },
]

export const esAreaQhq = (v: unknown): v is AreaQhq =>
  typeof v === 'string' && AREAS.some((a) => a.id === v)

// D dueño · H hace · DH dueño y hace · A apoya · E se entera · '' nada
export type Papel = 'D' | 'H' | 'DH' | 'A' | 'E' | ''
export type Fila = [tarea: string, papeles: Record<AreaQhq, Papel>]
export type Grupo = { name: string; rows: Fila[] }

export const GROUPS: Grupo[] = [
  { name: 'Venta y movimiento de talentos', rows: [
    ['Estrategia de venta de cada talento en el Tracker del Hub', { dir: 'E', ven: 'A', pm: 'DH', imk: 'A', dig: '' }],
    ['Movimiento de perfiles con marcas (prospectar marcas con fit)', { dir: 'E', ven: 'H', pm: 'DH', imk: 'A', dig: '' }],
    ['Press de talentos para una vertical (ej. cine y streaming): copy y datos', { dir: 'E', ven: 'A', pm: 'DH', imk: '', dig: 'A' }],
    ['Press de talentos: diseño y maquetación', { dir: '', ven: '', pm: 'D', imk: '', dig: 'H' }],
    ['Mover la press con marcas y agencias', { dir: 'E', ven: 'DH', pm: 'A', imk: 'E', dig: '' }],
    ['Propuestas y cotizaciones a marcas', { dir: 'E', ven: 'A', pm: 'A', imk: 'DH', dig: '' }],
  ]},
  { name: 'Campañas de IMKT con talentos del roster', rows: [
    ['Captura de la campaña en el sheet de campañas', { dir: 'E', ven: '', pm: 'E', imk: 'DH', dig: '' }],
    ['Correo al PM del talento con todos los datos de la campaña', { dir: 'E', ven: '', pm: 'E', imk: 'DH', dig: '' }],
    ['Registro de la campaña en el dashboard del talento (Hub)', { dir: '', ven: '', pm: 'DH', imk: 'A', dig: '' }],
  ]},
  { name: 'Copys y contenido', rows: [
    ['Copy de un talento (bio, press, pitch, mensajes a marcas)', { dir: '', ven: '', pm: 'DH', imk: '', dig: 'A' }],
    ['Copy de propuestas y estrategias de campaña', { dir: '', ven: '', pm: 'A', imk: 'DH', dig: 'A' }],
    ['Redes de MOVDI (IG y LinkedIn): parrilla, copys y piezas', { dir: 'A', ven: '', pm: 'A', imk: 'A', dig: 'DH' }],
    ['Datos e insumos que pide Digital (métricas, fotos, wins, resultados)', { dir: '', ven: '', pm: 'H', imk: 'H', dig: 'D' }],
  ]},
  { name: 'Asesorías y desarrollo', rows: [
    ['Asesoría de marca personal a un creador', { dir: 'E', ven: '', pm: 'H', imk: '', dig: 'DH' }],
    ['Agenda del descubrimiento y de la presentación al creador', { dir: '', ven: '', pm: 'DH', imk: '', dig: 'A' }],
  ]},
  { name: 'Industria', rows: [
    ['Búsqueda de eventos, premios y convocatorias para talentos', { dir: 'E', ven: 'A', pm: 'DH', imk: 'A', dig: 'A' }],
    ['Contacto y relación con plataformas (programas de creadores, partnerships)', { dir: 'D', ven: 'H', pm: 'A', imk: 'A', dig: '' }],
  ]},
]

// Estilo del chip + etiqueta de cada papel
export type EstiloPapel = 'dueno' | 'hace' | 'apoya' | 'entera'
export const ROLE: Record<Exclude<Papel, ''>, [EstiloPapel, string]> = {
  D: ['dueno', 'Dueño'],
  H: ['hace', 'Hace'],
  DH: ['dueno', 'Dueño · hace'],
  A: ['apoya', 'Apoya'],
  E: ['entera', 'Se entera'],
}

// Resumen "¿qué me toca?": dueño (D o DH) / hace / apoya. "Se entera" no
// aparece en el resumen (igual que en la referencia).
export function resumenDeArea(id: AreaQhq) {
  const r: Record<'dueno' | 'hace' | 'apoya', string[]> = { dueno: [], hace: [], apoya: [] }
  for (const g of GROUPS) {
    for (const [tarea, papeles] of g.rows) {
      const v = papeles[id]
      if (v === 'D' || v === 'DH') r.dueno.push(tarea)
      else if (v === 'H') r.hace.push(tarea)
      else if (v === 'A') r.apoya.push(tarea)
    }
  }
  return r
}

export const TPL_ROSTER = `Para: [PM del talento]
CC: Dirección; Head de PM
Asunto: [ID de campaña] Campaña confirmada · [Marca] · [Talento]

¡Hola! Te comparto los datos de la campaña que cerramos con [Talento] para que la registres en su dashboard del Hub.

CAMPAÑA
• ID de campaña (del sheet):
• Nombre de la campaña (producto + temática):
• Marca / cliente:
• Contacto del cliente (nombre y correo):
• Fecha de cierre (dd/mm/aaaa):
• Fecha de activación (dd/mm/aaaa):

ENTREGABLES
• Formato, cantidad y plataforma (ej. 1 reel IG + 2 stories):
• Fechas de entrega y publicación:
• Brief y materiales (link):

MONTO Y CONDICIONES
• Monto del talento y moneda (MXN / USD):
• Condiciones de pago:
• Contrato: ☐ firmado  ☐ en revisión con Legal
• Exclusividad, derechos de uso o pauta:

NOTAS
•

¿Me confirmas de recibido cuando la tengas en el dashboard? Si falta algún dato, aquí mismo en el hilo lo vemos. ¡Gracias!`

// 'pmimk' = paso compartido PM o IMKT (barra partida, cuenta para ambas)
export type AreaPaso = AreaQhq | 'pmimk'
export type Paso = [area: AreaPaso, actor: string, texto: string, etiqueta?: string]
export type Flujo = { title: string; who: string; steps: Paso[]; template?: string }

export const FLOWS: Flujo[] = [
  { title: 'Press de talentos de varios PMs', who: 'Dueño: Head de PM', steps: [
    ['dir', 'Dirección', 'Define la vertical, los talentos y para cuándo la necesita Ventas.'],
    ['pm', 'Head de PM', 'Reparte los talentos entre PMs y sube a OPS la fecha de entrega de copys.'],
    ['pm', 'Cada PM', 'Comparte copy y datos de sus talentos: bio, fit, métricas, casos y fotos.', '3 días hábiles · propuesta'],
    ['pm', 'Head de PM', 'Revisa que todos los talentos luzcan parejo en nivel y tono, y le pasa el paquete a Digital por OPS.'],
    ['dig', 'Digital', 'Diseña y maqueta la press en formato vertical.', '3 días hábiles · propuesta'],
    ['pm', 'Head de PM', 'Da el visto bueno y se la pasa a Ventas.'],
    ['ven', 'Ventas', 'Mueve la press, registra cada envío en el Tracker y le pasa las respuestas al PM de cada talento.'],
  ]},
  { title: 'Campaña de IMKT con un talento del roster', who: 'Dueño: IMKT', steps: [
    ['imk', 'IMKT', 'Cierra la campaña con la marca y la captura en el sheet de campañas.'],
    ['imk', 'IMKT', 'Le manda un correo al PM del talento con todos los datos: marca, ID de campaña, entregables, fechas y monto del talento. Copia a Dirección y a Head de PM.'],
    ['pm', 'PM', 'Confirma de recibido y registra la campaña en el dashboard del talento en el Hub.'],
    ['pm', 'PM', 'Si falta algún dato, se lo pide a IMKT en el mismo hilo de correo.'],
  ], template: TPL_ROSTER },
  { title: 'Asesoría de Digital a un creador', who: 'Dueño: Digital', steps: [
    ['pm', 'PM', 'Agenda el descubrimiento con su creador y con Digital, y lo sube a OPS.'],
    ['dig', 'Digital', 'Hace el descubrimiento. El PM acompaña o le comparte contexto antes.'],
    ['dig', 'Digital', 'Comparte la fecha de entrega ese mismo día.', '5 días hábiles · propuesta'],
    ['pm', 'PM', 'Agenda la presentación con el creador en cuanto tiene la fecha de entrega.', 'máx. 3 días después · propuesta'],
    ['dig', 'Digital + PM', 'Digital presenta y el PM acompaña al creador en la implementación.'],
  ]},
  { title: 'Cuando Digital necesita algo de PM o IMKT', who: 'Dueño: Digital', steps: [
    ['dig', 'Digital', 'Pide en OPS lo que necesita (datos, fotos, resultados) y para cuándo.'],
    ['pmimk', 'PM o IMKT', 'Confirma de recibido el mismo día y entrega en la fecha pedida. Si no llega, avisa antes.'],
    ['dir', 'Head del área', 'Si el pedido lleva 3 días sin movimiento, el Head ayuda a destrabarlo.'],
  ]},
]

export const pasoEsDeArea = (area: AreaPaso, id: AreaQhq) =>
  area === 'pmimk' ? id === 'pm' || id === 'imk' : area === id

export const LEYENDA: [EstiloPapel, string, string][] = [
  ['dueno', 'Dueño', 'Acompaña la tarea de principio a fin y cuida que se cierre. Hay una por tarea.'],
  ['hace', 'Hace', 'Se encarga de su parte y la entrega en el tiempo acordado.'],
  ['apoya', 'Apoya', 'Comparte datos, insumos o su punto de vista cuando se lo piden.'],
  ['entera', 'Se entera', 'Queda al tanto del resultado para estar en la misma página.'],
]

export const ACUERDOS: [titulo: string, texto: string][] = [
  ['Quien pide, acompaña', 'Si una tarea pasa por varias áreas, quien la pidió le da seguimiento hasta que se cierra.'],
  ['Cada quien escribe de lo que mejor conoce', 'El PM escribe sobre sus talentos y le comparte a Digital el copy listo, para que Digital se luzca en el diseño.'],
  ['Los pedidos viven en OPS', 'Con fecha, para que nada se pierda. Si algo se platicó por WhatsApp, súbelo a OPS para que quede registrado.'],
  ['Un “recibido” ayuda mucho', 'Confirmar el mismo día que viste un pedido le da tranquilidad a quien lo pidió. Si algo no va a llegar a tiempo, avisa antes y lo reacomodamos.'],
  ['Si algo se atora, lo levantamos', 'Cuando un pedido lleva 3 días sin movimiento, se le comparte al Head del área para destrabarlo juntos.'],
  ['Los miércoles nos organizamos', 'En la junta de movimiento de perfiles repartimos presses y pendientes, cada uno con dueño y fecha.'],
]

export const POR_AFINAR =
  'plazos de diseño y asesorías con Digital, y quién busca eventos y premios cuando un talento todavía no tiene PM asignado.'

// Área de OPS (personas.areas) → área de esta página. Dirección no es un
// valor de personas.areas: sale de es_direccion / nivel ceo.
const DESDE_AREA_OPS: Record<string, AreaQhq> = { ventas: 'ven', pm: 'pm', imkt: 'imk', digital: 'dig' }

export function areaDefaultDe(p: { esDireccion?: boolean; nivel?: string; areas?: string[] } | null): AreaQhq | null {
  if (!p) return null
  if (p.esDireccion || p.nivel === 'ceo') return 'dir'
  for (const a of p.areas ?? []) if (DESDE_AREA_OPS[a]) return DESDE_AREA_OPS[a]
  return null
}

export const CLAVE_AREA_QHQ = 'movdi-qhq-area'
