// Formularios dinámicos por área (cutover 10) — ÚNICA fuente de verdad de
// qué pide cada tipo de petición. Esta config alimenta el formulario (botón
// deshabilitado) Y la Server Action (candado real): nunca divergen.
//
// Clases de campo (decisión 2026-07-15, pendiente validación por área):
//   · bloqueante:  sin él la petición NO se crea (cliente y servidor)
//   · recomendado: se pide y se marca si falta, pero no bloquea
// Cambiar la clase de un campo es editar una palabra aquí. El marcado de
// recomendados faltantes se calcula EN VIVO desde esta config (no se
// almacena): al ajustar clases tras validar con las áreas, el histórico se
// corrige solo.

import { type Cliente, USO_CFDI, constanciaVigente, normalizarUsoCFDI } from './clientes'
import { hoyISO, sumaDiasHabiles } from './peticiones'

export type ValorDetalle = string | boolean
export type Detalle = Record<string, ValorDetalle>
export type ClaseCampo = 'bloqueante' | 'recomendado'
export type InputCampo =
  | 'text' | 'textarea' | 'url' | 'correo' | 'monto' | 'fecha' | 'select' | 'si_no'

export type OpcionCatalogo = { readonly v: string; readonly label: string; readonly frecuente?: boolean }

export type CampoTipo = {
  key: string
  label: string
  input: InputCampo
  clase: ClaseCampo
  opciones?: readonly string[]
  // select con claves estables (se guarda `v`, se muestra el label);
  // frecuente=true agrupa arriba. catalogoMuestraClave: label = "clave · desc"
  catalogo?: readonly OpcionCatalogo[]
  catalogoMuestraClave?: boolean
  // normalización al guardar/autocompletar (p. ej. "G03 — Gastos…" → "G03",
  // o el boolean persona_moral del catálogo → 'moral'/'fisica')
  normaliza?: (v: ValorDetalle) => ValorDetalle
  placeholder?: string
  // condicional: el campo solo aplica (se muestra y se valida) si esto es true
  visible?: (d: Detalle) => boolean
  // autocompletado: campo del catálogo de clientes que lo llena
  autocompleta?: keyof Cliente
  // aviso no-bloqueante (p. ej. constancia fiscal con más de 3 meses)
  aviso?: (valor: ValorDetalle | undefined, d: Detalle, hoy?: string) => string | null
}

export type TipoPeticion = {
  key: string
  label: string
  grupo?: string                // agrupa el select (con brief / sin brief / ruta)
  requiereDescripcion?: boolean // la descripción general se vuelve bloqueante
  usaCliente?: boolean          // muestra el selector del catálogo de clientes
  slaDiasHabiles?: number       // fecha_compromiso automática (techo del rango)
  slaLabel?: string
  campos: CampoTipo[]
}

// ---------- campos reutilizables ----------
const campana = (clase: ClaseCampo = 'bloqueante'): CampoTipo[] => [
  { key: 'nombre_campana', label: 'nombre de la campaña', input: 'text', clase },
  { key: 'id_campana', label: 'ID de campaña', input: 'text', clase: 'bloqueante' },
]

// info general del cliente (Legal) — autocompletable del catálogo
const INFO_CLIENTE_LEGAL: CampoTipo[] = [
  { key: 'cliente_nombre', label: 'cliente (nombre comercial)', input: 'text', clase: 'bloqueante', autocompleta: 'nombre' },
  {
    key: 'constancia_fiscal_fecha', label: 'fecha de la constancia fiscal', input: 'fecha',
    clase: 'recomendado', autocompleta: 'constanciaFiscalFecha',
    aviso: (v, _d, hoy) =>
      typeof v === 'string' && v && constanciaVigente(v, hoy) === false
        ? '⚠ la constancia fiscal tiene más de 3 meses — pide una actualizada'
        : null,
  },
  { key: 'constancia_fiscal_url', label: 'constancia de situación fiscal (link)', input: 'url', clase: 'recomendado', autocompleta: 'constanciaFiscalUrl' },
  {
    // ajuste 2026-07-15: selector en vez de toggle — condiciona los campos
    // del firmante (física: solo nombre + identificación). En el catálogo la
    // columna sigue siendo persona_moral (boolean); normaliza convierte.
    key: 'tipo_persona', label: 'tipo de persona', input: 'select', clase: 'recomendado',
    autocompleta: 'personaMoral',
    catalogo: [{ v: 'fisica', label: 'persona física' }, { v: 'moral', label: 'persona moral' }],
    normaliza: (v) =>
      v === true || v === 'true' || v === 'moral' ? 'moral'
      : v === false || v === 'false' || v === 'fisica' ? 'fisica'
      : typeof v === 'string' ? v : '',
  },
  {
    key: 'facultades_doc_url', label: 'documento de facultades (link)', input: 'url',
    clase: 'recomendado', autocompleta: 'facultadesDocUrl',
    // solo persona moral (d.persona_moral: compat con detalles pre-ajuste)
    visible: (d) => d.tipo_persona === 'moral' || d.persona_moral === true,
  },
  { key: 'domicilio_difiere', label: '¿el domicilio comercial difiere del fiscal?', input: 'si_no', clase: 'recomendado' },
  {
    key: 'domicilio_comercial', label: 'domicilio comercial', input: 'text',
    clase: 'recomendado', autocompleta: 'domicilioComercial',
    visible: (d) => d.domicilio_difiere === true, // condicional: solo si difiere
  },
  { key: 'firmante_nombre', label: 'nombre del firmante', input: 'text', clase: 'bloqueante', autocompleta: 'firmanteNombre' },
  {
    key: 'firmante_cargo', label: 'cargo del firmante', input: 'text',
    clase: 'recomendado', autocompleta: 'firmanteCargo',
    // el cargo solo aplica a persona moral (una física firma por sí misma)
    visible: (d) => d.tipo_persona === 'moral' || d.persona_moral === true,
  },
  { key: 'identificacion_firmante_url', label: 'identificación del firmante (link)', input: 'url', clase: 'recomendado', autocompleta: 'identificacionFirmanteUrl' },
  { key: 'correo_notificaciones', label: 'correo para oír y recibir notificaciones', input: 'correo', clase: 'recomendado', autocompleta: 'correoNotificaciones' },
]

const LEGAL_COMUNES: CampoTipo[] = [
  { key: 'nombre_campana', label: 'nombre de la campaña', input: 'text', clase: 'bloqueante' },
  { key: 'talento_firmar', label: 'talento a firmar', input: 'text', clase: 'bloqueante' },
  { key: 'correo_contacto_cliente', label: 'correo de contacto del cliente', input: 'correo', clase: 'bloqueante' },
  { key: 'checklist_contractual', label: 'checklist contractual', input: 'textarea', clase: 'recomendado', placeholder: 'entregables, exclusividad, vigencia, territorios…' },
  { key: 'caracteristicas_negociacion', label: 'características especiales de la negociación', input: 'textarea', clase: 'recomendado' },
  ...INFO_CLIENTE_LEGAL,
]

const digitalConBrief = (key: string, label: string): TipoPeticion => ({
  key, label, grupo: 'con brief',
  campos: [{
    key: 'link_brief', label: 'link del brief (Notion)', input: 'url',
    clase: 'bloqueante', placeholder: 'https://www.notion.so/…',
  }],
})
const digitalSinBrief = (key: string, label: string): TipoPeticion => ({
  key, label, grupo: 'sin brief', requiereDescripcion: true, campos: [],
})

// ---------- catálogo de tipos por área ----------
export const TIPOS_POR_AREA: Partial<Record<string, TipoPeticion[]>> = {
  digital: [
    digitalConBrief('pitch_deck', 'pitch deck'),
    digitalConBrief('pieza_rrss_talento', 'pieza RRSS de talento'),
    digitalConBrief('pieza_rrss_movdi', 'pieza RRSS de MOVDI'),
    digitalConBrief('ideacion', 'ideación'),
    digitalConBrief('ajuste_pieza', 'ajuste a pieza existente'),
    digitalConBrief('email_talento', 'email de talento'),
    digitalConBrief('roster_web', 'actualización roster web'),
    digitalSinBrief('asesoria_notion', 'asesoría Notion'),
    digitalSinBrief('asesoria_everest', 'asesoría Everest'),
    digitalSinBrief('revision_talento', 'revisión de talento'),
  ],
  admi: [
    {
      key: 'factura', label: 'factura', usaCliente: true,
      slaDiasHabiles: 2, slaLabel: 'SLA 24-48h',
      campos: [
        { key: 'cliente_nombre', label: 'cliente (nombre comercial)', input: 'text', clase: 'bloqueante', autocompleta: 'nombre' },
        ...campana(),
        { key: 'razon_social', label: 'razón social', input: 'text', clase: 'bloqueante', autocompleta: 'razonSocial' },
        { key: 'rfc', label: 'RFC', input: 'text', clase: 'bloqueante', autocompleta: 'rfc' },
        { key: 'regimen_fiscal', label: 'régimen fiscal', input: 'text', clase: 'bloqueante', autocompleta: 'regimenFiscal', placeholder: 'ej: 601 — General de Ley' },
        { key: 'cp_fiscal', label: 'CP fiscal', input: 'text', clase: 'bloqueante', autocompleta: 'cpFiscal' },
        {
          // ajuste 2026-07-15: dropdown con el catálogo SAT c_UsoCFDI — se
          // guarda la CLAVE; capturas legadas se normalizan ("G03 — …" → G03)
          key: 'uso_cfdi', label: 'uso CFDI', input: 'select', clase: 'bloqueante',
          autocompleta: 'usoCfdi', catalogo: USO_CFDI, catalogoMuestraClave: true,
          normaliza: (v) => (typeof v === 'string' ? normalizarUsoCFDI(v) : v),
        },
        { key: 'metodo_pago', label: 'método de pago', input: 'select', clase: 'bloqueante', opciones: ['PUE — pago en una sola exhibición', 'PPD — pago en parcialidades o diferido'] },
        { key: 'forma_pago', label: 'forma de pago', input: 'text', clase: 'bloqueante', placeholder: 'ej: 03 — transferencia electrónica' },
        { key: 'concepto', label: 'concepto a facturar', input: 'textarea', clase: 'bloqueante' },
        { key: 'importe_sin_iva', label: 'importe sin IVA', input: 'monto', clase: 'bloqueante' },
        { key: 'correo_envio', label: 'correo de envío', input: 'correo', clase: 'bloqueante' },
      ],
    },
    {
      key: 'cobranza', label: 'cobranza', usaCliente: true,
      campos: [
        { key: 'cliente_nombre', label: 'cliente (nombre comercial)', input: 'text', clase: 'recomendado', autocompleta: 'nombre' },
        ...campana(),
        { key: 'correo_contacto', label: 'correo / contacto del cliente', input: 'correo', clase: 'bloqueante', autocompleta: 'contactoCorreo' },
        { key: 'observaciones', label: 'observaciones', input: 'textarea', clase: 'recomendado' },
      ],
    },
    {
      key: 'alta_portales', label: 'alta en portales',
      slaDiasHabiles: 3, slaLabel: 'SLA 24-72h',
      campos: [
        ...campana(),
        { key: 'link_portal', label: 'link del portal', input: 'url', clase: 'bloqueante' },
        { key: 'correo_alta', label: 'correo para el alta', input: 'correo', clase: 'bloqueante' },
      ],
    },
    {
      key: 'consulta_admin', label: 'consulta administrativa', requiereDescripcion: true,
      campos: [
        { key: 'id_campana', label: 'ID de campaña', input: 'text', clase: 'bloqueante' },
        { key: 'nombre_campana', label: 'nombre de la campaña (opcional)', input: 'text', clase: 'recomendado' },
      ],
    },
  ],
  legal: [
    {
      key: 'contrato_movdi', label: 'ruta A — contrato MOVDI (nosotros elaboramos)',
      grupo: 'ruta', usaCliente: true, campos: LEGAL_COMUNES,
    },
    {
      key: 'contrato_cliente', label: 'ruta B — contrato del cliente (legal revisa)',
      grupo: 'ruta', usaCliente: true,
      campos: [
        { key: 'contrato_cliente_url', label: 'contrato del cliente (archivo o link)', input: 'url', clase: 'bloqueante' },
        ...LEGAL_COMUNES,
      ],
    },
  ],
}

// ---------- helpers ----------
export const areaTieneTipos = (area: string | null | undefined) =>
  !!area && !!TIPOS_POR_AREA[area]?.length

export const tiposDeArea = (area: string): TipoPeticion[] => TIPOS_POR_AREA[area] ?? []

export const tipoDe = (area: string | null, key: string | null): TipoPeticion | null =>
  (area && key && tiposDeArea(area).find((t) => t.key === key)) || null

export const etiquetaTipo = (area: string | null, key: string | null): string =>
  tipoDe(area, key)?.label ?? key ?? ''

const lleno = (v: ValorDetalle | undefined): boolean =>
  typeof v === 'boolean' ? true : typeof v === 'string' && v.trim().length > 0

export const camposVisibles = (tipo: TipoPeticion, d: Detalle): CampoTipo[] =>
  tipo.campos.filter((c) => !c.visible || c.visible(d))

// Whitelist del jsonb: solo claves de la config, solo campos actualmente
// visibles (si un condicional se ocultó, su valor viejo se descarta),
// strings recortados y vacíos fuera.
export function sanitizarDetalle(tipo: TipoPeticion, d: Detalle): Detalle {
  const out: Detalle = {}
  for (const c of camposVisibles(tipo, d)) {
    let v = d[c.key]
    if (v !== undefined && c.normaliza) v = c.normaliza(v)
    if (typeof v === 'boolean') out[c.key] = v
    else if (typeof v === 'string' && v.trim()) out[c.key] = v.trim()
  }
  return out
}

// Validación de completitud — la MISMA en cliente (botón) y servidor (candado).
export function validarDetalle(
  tipo: TipoPeticion,
  d: Detalle,
  opts: { descripcion?: string | null; hoy?: string } = {},
): {
  ok: boolean
  bloqueantesFaltantes: string[]
  recomendadosFaltantes: string[]
  avisos: string[]
} {
  const bloqueantesFaltantes: string[] = []
  const recomendadosFaltantes: string[] = []
  const avisos: string[] = []
  for (const c of camposVisibles(tipo, d)) {
    if (!lleno(d[c.key])) {
      if (c.clase === 'bloqueante') bloqueantesFaltantes.push(c.label)
      else recomendadosFaltantes.push(c.label)
    }
    const aviso = c.aviso?.(d[c.key], d, opts.hoy)
    if (aviso) avisos.push(aviso)
  }
  if (tipo.requiereDescripcion && !(opts.descripcion || '').trim()) {
    bloqueantesFaltantes.unshift('descripción de la solicitud')
  }
  return { ok: bloqueantesFaltantes.length === 0, bloqueantesFaltantes, recomendadosFaltantes, avisos }
}

// SLA → fecha_compromiso automática en días hábiles (techo del rango).
export const fechaPorSLA = (tipo: TipoPeticion, hoy?: string): string | null =>
  tipo.slaDiasHabiles ? sumaDiasHabiles(hoy ?? hoyISO(), tipo.slaDiasHabiles) : null

// Autocompletado: al elegir cliente, llena los campos ligados al catálogo
// como SNAPSHOT editable (la petición conserva los datos con los que se
// pidió aunque el catálogo cambie después).
export function aplicarCliente(tipo: TipoPeticion, d: Detalle, cliente: Cliente): Detalle {
  const out: Detalle = { ...d }
  for (const c of tipo.campos) {
    if (!c.autocompleta) continue
    const v = cliente[c.autocompleta]
    if (v === null || v === undefined || v === '') continue
    let val: ValorDetalle = typeof v === 'boolean' ? v : String(v)
    if (c.normaliza) val = c.normaliza(val)
    out[c.key] = val
  }
  // si el catálogo trae domicilio comercial, la pregunta condicional
  // "¿difiere del fiscal?" se responde sola (si no, queda como esté)
  if (cliente.domicilioComercial && tipo.campos.some((c) => c.key === 'domicilio_difiere')) {
    out.domicilio_difiere = true
  }
  return out
}
