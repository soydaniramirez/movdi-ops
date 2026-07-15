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

// ¿La constancia de situación fiscal sigue vigente? (≤ 3 meses). Devuelve
// null si no hay fecha. Es AVISO, nunca bloqueo (decisión 2026-07-15).
export function constanciaVigente(fechaISO: string | null, hoyISO?: string): boolean | null {
  if (!fechaISO) return null
  const hoy = hoyISO ? new Date(hoyISO + 'T00:00:00') : new Date()
  const limite = new Date(fechaISO + 'T00:00:00')
  limite.setMonth(limite.getMonth() + 3)
  return hoy.getTime() <= limite.getTime()
}
