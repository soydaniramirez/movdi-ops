import { test, expect } from '@playwright/test'
import {
  type Detalle,
  aplicarCliente, areaTieneTipos, camposVisibles, etiquetaTipo, fechaPorSLA,
  sanitizarDetalle, tipoDe, tipoPermitidoPara, tiposParaDestinatarios,
  tiposVigentesDeArea, validarDetalle,
} from '../lib/tipos-peticion'
import { type Cliente, USO_CFDI, constanciaVigente, normalizarUsoCFDI, usoCfdiLabel } from '../lib/clientes'
import { sumaDiasHabiles } from '../lib/peticiones'

// Unit tests de los formularios dinámicos (cutover 10): validación
// bloqueante/recomendado, condicionales, SLA en días hábiles, vigencia de
// constancia y autocompletado desde el catálogo.

const cliente = (o: Partial<Cliente> = {}): Cliente => ({
  id: 'cli-x', nombre: 'ACME', razonSocial: 'ACME S.A. de C.V.', rfc: 'ACM010101AAA',
  regimenFiscal: '601', cpFiscal: '11560', usoCfdi: 'G03', personaMoral: true,
  constanciaFiscalFecha: '2026-07-01', constanciaFiscalUrl: 'https://x/c.pdf',
  domicilioFiscal: 'Reforma 100', domicilioComercial: null, firmanteNombre: 'Laura',
  firmanteCargo: 'DG', facultadesDocUrl: 'https://x/f.pdf', identificacionFirmanteUrl: null,
  correoNotificaciones: 'legal@acme.mx', contactoCorreo: 'hola@acme.mx',
  activo: true, creadoPor: 'Lucia', ...o,
})

// ---------- días hábiles / SLA ----------
test('sumaDiasHabiles: viernes + 2 hábiles = martes (el finde no corre)', () => {
  expect(sumaDiasHabiles('2026-07-10', 2)).toBe('2026-07-14') // vie → mar
  expect(sumaDiasHabiles('2026-07-06', 3)).toBe('2026-07-09') // lun → jue
  expect(sumaDiasHabiles('2026-07-11', 1)).toBe('2026-07-13') // sáb → lun
})

test('fechaPorSLA: factura +2 hábiles, alta_portales +3, sin SLA → null', () => {
  const factura = tipoDe('admi', 'factura')!
  const portales = tipoDe('admi', 'alta_portales')!
  const cobranza = tipoDe('admi', 'cobranza')!
  expect(fechaPorSLA(factura, '2026-07-10')).toBe('2026-07-14')  // vie → mar
  expect(fechaPorSLA(portales, '2026-07-10')).toBe('2026-07-15') // vie → mié
  expect(fechaPorSLA(cobranza, '2026-07-10')).toBeNull()
})

// ---------- catálogo SAT c_UsoCFDI ----------
test('USO_CFDI: 24 claves, frecuentes primero (G03, G01, S01, CP01)', () => {
  expect(USO_CFDI).toHaveLength(24)
  expect(USO_CFDI.filter((u) => u.frecuente).map((u) => u.v)).toEqual(['G03', 'G01', 'S01', 'CP01'])
  expect(usoCfdiLabel('G03')).toBe('G03 · Gastos en general')
  expect(usoCfdiLabel('CN01')).toBe('CN01 · Nómina')
})

test('normalizarUsoCFDI: capturas legadas caen a la clave; lo desconocido no se inventa', () => {
  expect(normalizarUsoCFDI('G03 — Gastos en general')).toBe('G03')
  expect(normalizarUsoCFDI('g03')).toBe('G03')
  expect(normalizarUsoCFDI('CP01 · Pagos')).toBe('CP01')
  expect(normalizarUsoCFDI('X99 lo que sea')).toBe('X99 lo que sea')
  expect(normalizarUsoCFDI('')).toBe('')
})

// ---------- vigencia de constancia ----------
test('constanciaVigente: exactamente 3 meses aún vige; un día después ya no', () => {
  expect(constanciaVigente('2026-04-15', '2026-07-15')).toBe(true)
  expect(constanciaVigente('2026-04-14', '2026-07-15')).toBe(false)
  expect(constanciaVigente(null)).toBeNull()
})

// ---------- validación bloqueante/recomendado ----------
test('digital con brief: link_brief es bloqueante; sin brief pide descripción', () => {
  expect(areaTieneTipos('digital')).toBe(true)
  expect(areaTieneTipos('pm')).toBe(false)

  const pitch = tipoDe('digital', 'pitch_deck')!
  expect(validarDetalle(pitch, {}).ok).toBe(false)
  expect(validarDetalle(pitch, {}).bloqueantesFaltantes).toEqual(['link del brief (Notion)'])
  expect(validarDetalle(pitch, { link_brief: 'https://notion.so/x' }).ok).toBe(true)

  const asesoria = tipoDe('digital', 'asesoria_notion')!
  expect(validarDetalle(asesoria, {}, { descripcion: '' }).ok).toBe(false)
  expect(validarDetalle(asesoria, {}, { descripcion: 'necesito ayuda con la base' }).ok).toBe(true)
})

test('factura: los 13 bloqueantes; recomendados no bloquean en cobranza', () => {
  const factura = tipoDe('admi', 'factura')!
  const v = validarDetalle(factura, {})
  expect(v.ok).toBe(false)
  expect(v.bloqueantesFaltantes.length).toBe(13) // cliente + campaña(2) + 8 fiscales/pago + concepto + importe + correo

  const cobranza = tipoDe('admi', 'cobranza')!
  const v2 = validarDetalle(cobranza, {
    nombre_campana: 'Campaña X', id_campana: 'C-01', correo_contacto: 'pagos@cliente.mx',
  })
  expect(v2.ok).toBe(true) // observaciones y cliente_nombre son recomendados
  expect(v2.recomendadosFaltantes).toEqual(['cliente (nombre comercial)', 'observaciones'])
})

// ---------- condicionales de legal ----------
test('legal: tipo de persona condiciona al firmante; domicilio solo si difiere; ruta B exige contrato', () => {
  const rutaA = tipoDe('legal', 'contrato_movdi')!
  const rutaB = tipoDe('legal', 'contrato_cliente')!

  // física → solo nombre + identificación (cargo y facultades NO aplican)
  const fisica = camposVisibles(rutaA, { tipo_persona: 'fisica' }).map((c) => c.key)
  expect(fisica).not.toContain('facultades_doc_url')
  expect(fisica).not.toContain('firmante_cargo')
  expect(fisica).toContain('firmante_nombre')
  expect(fisica).toContain('identificacion_firmante_url')
  // moral → nombre + cargo + facultades + identificación
  const moral = camposVisibles(rutaA, { tipo_persona: 'moral' }).map((c) => c.key)
  expect(moral).toContain('facultades_doc_url')
  expect(moral).toContain('firmante_cargo')
  // compat: detalles pre-ajuste con persona_moral boolean siguen mostrando todo
  const legacy = camposVisibles(rutaA, { persona_moral: true }).map((c) => c.key)
  expect(legacy).toContain('facultades_doc_url')
  expect(legacy).toContain('firmante_cargo')

  // condicional domicilio
  expect(camposVisibles(rutaA, {}).map((c) => c.key)).not.toContain('domicilio_comercial')
  expect(camposVisibles(rutaA, { domicilio_difiere: true }).map((c) => c.key)).toContain('domicilio_comercial')

  // ruta B: contrato del cliente bloqueante (ruta A no lo pide)
  const base: Detalle = {
    nombre_campana: 'X', talento_firmar: 'Crystal', correo_contacto_cliente: 'a@b.mx',
    cliente_nombre: 'ACME', firmante_nombre: 'Laura',
  }
  expect(validarDetalle(rutaA, base).ok).toBe(true)
  const vB = validarDetalle(rutaB, base)
  expect(vB.ok).toBe(false)
  expect(vB.bloqueantesFaltantes).toEqual(['contrato del cliente (archivo o link)'])
  expect(validarDetalle(rutaB, { ...base, contrato_cliente_url: 'https://drive/x' }).ok).toBe(true)
})

test('legal: constancia con más de 3 meses genera AVISO, no bloqueo', () => {
  const rutaA = tipoDe('legal', 'contrato_movdi')!
  const d: Detalle = {
    nombre_campana: 'X', talento_firmar: 'Crystal', correo_contacto_cliente: 'a@b.mx',
    cliente_nombre: 'ACME', firmante_nombre: 'Laura', constancia_fiscal_fecha: '2026-01-01',
  }
  const v = validarDetalle(rutaA, d, { hoy: '2026-07-15' })
  expect(v.ok).toBe(true) // avisa, no bloquea
  expect(v.avisos[0]).toContain('más de 3 meses')
})

// ---------- sanitización del jsonb ----------
test('sanitizarDetalle: descarta claves desconocidas, vacíos y condicionales ocultos; normaliza claves SAT', () => {
  const rutaA = tipoDe('legal', 'contrato_movdi')!
  const sucio: Detalle = {
    nombre_campana: '  Campaña X  ',
    hackeo: 'esto no es un campo',            // clave desconocida → fuera
    talento_firmar: '',                        // vacío → fuera
    tipo_persona: 'fisica',
    facultades_doc_url: 'https://x/f.pdf',     // condicional OCULTO (es física) → fuera
    firmante_cargo: 'Gerente',                 // ídem: el cargo no aplica a física
  }
  expect(sanitizarDetalle(rutaA, sucio)).toEqual({
    nombre_campana: 'Campaña X',
    tipo_persona: 'fisica',
  })

  // uso CFDI legado se guarda como CLAVE
  const factura = tipoDe('admi', 'factura')!
  expect(sanitizarDetalle(factura, { uso_cfdi: 'G03 — Gastos en general' })).toEqual({ uso_cfdi: 'G03' })
})

// ---------- autocompletado desde el catálogo ----------
test('aplicarCliente: llena los campos ligados como snapshot y resuelve el condicional de domicilio', () => {
  const factura = tipoDe('admi', 'factura')!
  const d1 = aplicarCliente(factura, { nombre_campana: 'ya escrito' }, cliente())
  expect(d1.rfc).toBe('ACM010101AAA')
  expect(d1.razon_social).toBe('ACME S.A. de C.V.')
  expect(d1.cliente_nombre).toBe('ACME')
  expect(d1.nombre_campana).toBe('ya escrito') // lo capturado no se pierde

  const rutaA = tipoDe('legal', 'contrato_movdi')!
  const d2 = aplicarCliente(rutaA, {}, cliente({ domicilioComercial: 'Polanco 22' }))
  expect(d2.domicilio_difiere).toBe(true) // la pregunta se responde sola
  expect(d2.domicilio_comercial).toBe('Polanco 22')
  const d3 = aplicarCliente(rutaA, {}, cliente())
  expect(d3.domicilio_difiere).toBeUndefined() // sin dato, la pregunta queda abierta
})

test('aplicarCliente: normaliza — uso CFDI legado a clave y persona_moral boolean a tipo de persona', () => {
  const factura = tipoDe('admi', 'factura')!
  const d1 = aplicarCliente(factura, {}, cliente({ usoCfdi: 'G03 — Gastos en general' }))
  expect(d1.uso_cfdi).toBe('G03')

  const rutaA = tipoDe('legal', 'contrato_movdi')!
  expect(aplicarCliente(rutaA, {}, cliente({ personaMoral: true })).tipo_persona).toBe('moral')
  expect(aplicarCliente(rutaA, {}, cliente({ personaMoral: false })).tipo_persona).toBe('fisica')
  expect(aplicarCliente(rutaA, {}, cliente({ personaMoral: null })).tipo_persona).toBeUndefined()
})

// ------------------------------------------------------------
// Menú de Digital por PERSONA (2026-09-18). El catálogo se define una vez;
// aquí se prueba quién ve qué, el fallback de los no mapeados, la
// intersección de un grupo y que los legacy salieron del menú sin perder su
// etiqueta.
const labels = (tipos: { label: string }[]) => tipos.map((t) => t.label)

test('digital por persona: Valeria 5, Diana 5, Brenda 2', () => {
  expect(labels(tiposParaDestinatarios('digital', ['Valeria']))).toEqual([
    'correo de incorporación o específico',
    'media kit',
    'pieza RRSS',
    'pitch / desarrollo de contenido',
    'estrategia de identidad-marca',
  ])
  expect(labels(tiposParaDestinatarios('digital', ['Diana']))).toEqual([
    'correo de incorporación o específico',
    'media kit',
    'pieza RRSS',
    'actualización roster / web',
    'desarrollo de identidad-marca',
  ])
  expect(labels(tiposParaDestinatarios('digital', ['Brenda']))).toEqual([
    'correo de incorporación o específico',
    'pieza RRSS',
  ])
  // el nombre se compara normalizado (como el resto del proyecto)
  expect(tiposParaDestinatarios('digital', ['valeria'])).toHaveLength(5)
  expect(tiposParaDestinatarios('digital', ['VALERIA'])).toHaveLength(5)
})

test('digital: quien NO está en el mapa ve el catálogo vigente completo', () => {
  // alguien nuevo (o Karla, que no está mapeada): nada se rompe, ve los 7
  expect(tiposParaDestinatarios('digital', ['Karla'])).toHaveLength(7)
  expect(tiposParaDestinatarios('digital', ['Persona Nueva'])).toHaveLength(7)
  // sin destinatario todavía, el select ofrece todo lo vigente
  expect(tiposParaDestinatarios('digital', [])).toHaveLength(7)
  expect(tiposVigentesDeArea('digital')).toHaveLength(7)
})

test('digital en grupo: intersección de los destinatarios', () => {
  expect(labels(tiposParaDestinatarios('digital', ['Valeria', 'Brenda']))).toEqual([
    'correo de incorporación o específico',
    'pieza RRSS',
  ])
  expect(labels(tiposParaDestinatarios('digital', ['Valeria', 'Diana']))).toEqual([
    'correo de incorporación o específico',
    'media kit',
    'pieza RRSS',
  ])
  // un no mapeado no recorta a los demás (ve todo, así que no resta)
  expect(tiposParaDestinatarios('digital', ['Valeria', 'Karla'])).toHaveLength(5)
})

test('tipoPermitidoPara: candado del servidor por destinatario', () => {
  expect(tipoPermitidoPara('digital', 'pieza_rrss', ['Brenda'])).toBe(true)
  expect(tipoPermitidoPara('digital', 'media_kit', ['Brenda'])).toBe(false)
  expect(tipoPermitidoPara('digital', 'media_kit', ['Valeria'])).toBe(true)
  expect(tipoPermitidoPara('digital', 'roster_web_actualizacion', ['Valeria'])).toBe(false)
  expect(tipoPermitidoPara('digital', 'roster_web_actualizacion', ['Diana'])).toBe(true)
  // grupo: tiene que valer para TODAS
  expect(tipoPermitidoPara('digital', 'media_kit', ['Valeria', 'Brenda'])).toBe(false)
  expect(tipoPermitidoPara('digital', 'correo_incorporacion', ['Valeria', 'Brenda'])).toBe(true)
  // legacy: ya no se puede crear con él, ni para los no mapeados
  expect(tipoPermitidoPara('digital', 'pitch_deck', ['Karla'])).toBe(false)
  expect(tipoPermitidoPara('digital', 'asesoria_notion', ['Valeria'])).toBe(false)
  // áreas sin mapa por persona: se comportan igual que antes
  expect(tipoPermitidoPara('admi', 'factura', ['Lucia'])).toBe(true)
  expect(tipoPermitidoPara('legal', 'contrato_movdi', ['Quien Sea'])).toBe(true)
})

test('legacy: fuera del menú, pero el histórico conserva etiqueta y campos', () => {
  // no aparecen en ningún menú…
  const vigentes = tiposVigentesDeArea('digital').map((t) => t.key)
  for (const k of ['pitch_deck', 'ideacion', 'asesoria_notion', 'roster_web', 'pieza_rrss_talento']) {
    expect(vigentes).not.toContain(k)
    // …pero siguen definidos: una petición vieja no pierde su etiqueta
    expect(tipoDe('digital', k)).toBeTruthy()
  }
  expect(etiquetaTipo('digital', 'pitch_deck')).toBe('pitch deck')
  expect(etiquetaTipo('digital', 'asesoria_notion')).toBe('asesoría Notion')
  expect(etiquetaTipo('digital', 'roster_web')).toBe('actualización roster web')
  // y su detalle se sigue leyendo con la misma config
  expect(tipoDe('digital', 'pitch_deck')!.campos.map((c) => c.key)).toEqual(['link_brief'])
  expect(tipoDe('digital', 'asesoria_notion')!.requiereDescripcion).toBe(true)
})

test('los tipos nuevos de digital piden brief y nada más', () => {
  for (const k of [
    'correo_incorporacion', 'media_kit', 'pieza_rrss', 'pitch_desarrollo_contenido',
    'estrategia_identidad_marca', 'roster_web_actualizacion', 'desarrollo_identidad_marca',
  ]) {
    const t = tipoDe('digital', k)!
    expect(t).toBeTruthy()
    expect(t.campos.map((c) => c.key)).toEqual(['link_brief'])
    expect(t.campos[0].clase).toBe('bloqueante')
    expect(t.requiereDescripcion).toBeFalsy()
    expect(t.usaCliente).toBeFalsy()
    expect(t.slaDiasHabiles).toBeUndefined()
  }
})
