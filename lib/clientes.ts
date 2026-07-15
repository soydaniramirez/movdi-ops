// Catálogo interno de clientes (cutover 10) — fiscales para Admi, legales
// para Legal. Todos leen (autocompletar al crear peticiones); solo área
// admi + dirección escriben (RLS respalda).

export type Cliente = {
  id: string
  nombre: string
  // fiscales
  razonSocial: string | null
  rfc: string | null
  regimenFiscal: string | null
  cpFiscal: string | null
  usoCfdi: string | null
  // legales
  personaMoral: boolean | null
  constanciaFiscalFecha: string | null
  constanciaFiscalUrl: string | null
  domicilioFiscal: string | null
  domicilioComercial: string | null
  firmanteNombre: string | null
  firmanteCargo: string | null
  facultadesDocUrl: string | null
  identificacionFirmanteUrl: string | null
  correoNotificaciones: string | null
  // contacto
  contactoCorreo: string | null
  activo: boolean
  creadoPor: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapClienteRow(r: any): Cliente {
  return {
    id: r.id,
    nombre: r.nombre,
    razonSocial: r.razon_social ?? null,
    rfc: r.rfc ?? null,
    regimenFiscal: r.regimen_fiscal ?? null,
    cpFiscal: r.cp_fiscal ?? null,
    usoCfdi: r.uso_cfdi ?? null,
    personaMoral: r.persona_moral ?? null,
    constanciaFiscalFecha: r.constancia_fiscal_fecha ?? null,
    constanciaFiscalUrl: r.constancia_fiscal_url ?? null,
    domicilioFiscal: r.domicilio_fiscal ?? null,
    domicilioComercial: r.domicilio_comercial ?? null,
    firmanteNombre: r.firmante_nombre ?? null,
    firmanteCargo: r.firmante_cargo ?? null,
    facultadesDocUrl: r.facultades_doc_url ?? null,
    identificacionFirmanteUrl: r.identificacion_firmante_url ?? null,
    correoNotificaciones: r.correo_notificaciones ?? null,
    contactoCorreo: r.contacto_correo ?? null,
    activo: r.activo !== false,
    creadoPor: r.creado_por,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Columnas snake_case del catálogo — orden del template CSV y whitelist de
// la importación (nombre primero, obligatorio).
export const CLIENTE_COLUMNAS_CSV = [
  'nombre', 'razon_social', 'rfc', 'regimen_fiscal', 'cp_fiscal', 'uso_cfdi',
  'persona_moral', 'constancia_fiscal_fecha', 'constancia_fiscal_url',
  'domicilio_fiscal', 'domicilio_comercial', 'firmante_nombre',
  'firmante_cargo', 'facultades_doc_url', 'identificacion_firmante_url',
  'correo_notificaciones', 'contacto_correo',
] as const

// Catálogo oficial SAT c_UsoCFDI (verificado contra satcfdi 4.6.0, ajuste
// 2026-07-15). Se guarda la CLAVE; la UI muestra "clave · descripción".
// Los frecuentes van primero en el dropdown.
export const USO_CFDI: readonly { v: string; label: string; frecuente?: boolean }[] = [
  { v: 'G03', label: 'Gastos en general', frecuente: true },
  { v: 'G01', label: 'Adquisición de mercancías', frecuente: true },
  { v: 'S01', label: 'Sin efectos fiscales', frecuente: true },
  { v: 'CP01', label: 'Pagos', frecuente: true },
  { v: 'G02', label: 'Devoluciones, descuentos o bonificaciones' },
  { v: 'I01', label: 'Construcciones' },
  { v: 'I02', label: 'Mobiliario y equipo de oficina por inversiones' },
  { v: 'I03', label: 'Equipo de transporte' },
  { v: 'I04', label: 'Equipo de cómputo y accesorios' },
  { v: 'I05', label: 'Dados, troqueles, moldes, matrices y herramental' },
  { v: 'I06', label: 'Comunicaciones telefónicas' },
  { v: 'I07', label: 'Comunicaciones satelitales' },
  { v: 'I08', label: 'Otra maquinaria y equipo' },
  { v: 'D01', label: 'Honorarios médicos, dentales y gastos hospitalarios' },
  { v: 'D02', label: 'Gastos médicos por incapacidad o discapacidad' },
  { v: 'D03', label: 'Gastos funerales' },
  { v: 'D04', label: 'Donativos' },
  { v: 'D05', label: 'Intereses reales por créditos hipotecarios (casa habitación)' },
  { v: 'D06', label: 'Aportaciones voluntarias al SAR' },
  { v: 'D07', label: 'Primas por seguros de gastos médicos' },
  { v: 'D08', label: 'Gastos de transportación escolar obligatoria' },
  { v: 'D09', label: 'Depósitos en cuentas para el ahorro / planes de pensiones' },
  { v: 'D10', label: 'Pagos por servicios educativos (colegiaturas)' },
  { v: 'CN01', label: 'Nómina' },
]

export const usoCfdiLabel = (clave: string): string => {
  const it = USO_CFDI.find((u) => u.v === (clave || '').toUpperCase())
  return it ? `${it.v} · ${it.label}` : clave
}

// Normaliza capturas legadas ("G03 — Gastos en general", "g03") a la clave.
// Si no matchea el catálogo, regresa el valor tal cual (no inventa datos).
export function normalizarUsoCFDI(valor: string): string {
  const token = (valor || '').trim().split(/[\s·—–]/)[0].toUpperCase()
  return USO_CFDI.some((u) => u.v === token) ? token : (valor || '').trim()
}

// ¿La constancia de situación fiscal sigue vigente? (≤ 3 meses). Devuelve
// null si no hay fecha. Es AVISO, nunca bloqueo (decisión 2026-07-15).
export function constanciaVigente(fechaISO: string | null, hoyISO?: string): boolean | null {
  if (!fechaISO) return null
  const hoy = hoyISO ? new Date(hoyISO + 'T00:00:00') : new Date()
  const limite = new Date(fechaISO + 'T00:00:00')
  limite.setMonth(limite.getMonth() + 3)
  return hoy.getTime() <= limite.getTime()
}
