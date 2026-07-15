# Campos por tipo de petición — para validar con cada área

Estado: **borrador 2026-07-15, pendiente validación por área.**
Cada campo tiene clase `bloqueante` (🔒 sin él NO se crea la petición) o
`recomendado` (⚠ se pide y se marca si falta, pero no bloquea). Cambiar la
clase de un campo es editar **una palabra** en `lib/tipos-peticion.ts`; el
marcado de faltantes se calcula en vivo, así que el histórico se corrige solo
al ajustar.

Los campos "(catálogo)" se autocompletan al elegir cliente y quedan como
snapshot editable en la petición.

## DIGITAL

**Con brief** — pitch deck · pieza RRSS talento · pieza RRSS MOVDI · ideación · ajuste a pieza existente · email de talento · actualización roster web

| campo | clase |
|---|---|
| link del brief (Notion) | 🔒 bloqueante |

**Sin brief** — asesoría Notion · asesoría Everest · revisión de talento

| campo | clase |
|---|---|
| descripción de la solicitud (el campo general) | 🔒 bloqueante |

## ADMI

**Factura** — SLA 24-48h → fecha compromiso automática **+2 días hábiles** (read-only)

| campo | clase | catálogo |
|---|---|---|
| cliente (nombre comercial) | 🔒 bloqueante | ✓ |
| nombre de la campaña | 🔒 bloqueante | |
| ID de campaña | 🔒 bloqueante | |
| razón social | 🔒 bloqueante | ✓ |
| RFC | 🔒 bloqueante | ✓ |
| régimen fiscal | 🔒 bloqueante | ✓ |
| CP fiscal | 🔒 bloqueante | ✓ |
| uso CFDI | 🔒 bloqueante | ✓ |
| método de pago (PUE/PPD) | 🔒 bloqueante | |
| forma de pago | 🔒 bloqueante | |
| concepto a facturar | 🔒 bloqueante | |
| importe sin IVA | 🔒 bloqueante | |
| correo de envío | 🔒 bloqueante | |

**Cobranza** — sin SLA

| campo | clase | catálogo |
|---|---|---|
| cliente (nombre comercial) | ⚠ recomendado | ✓ |
| nombre de la campaña | 🔒 bloqueante | |
| ID de campaña | 🔒 bloqueante | |
| correo / contacto del cliente | 🔒 bloqueante | ✓ |
| observaciones | ⚠ recomendado | |

**Alta en portales** — SLA 24-72h → fecha automática **+3 días hábiles**

| campo | clase |
|---|---|
| nombre de la campaña | 🔒 bloqueante |
| ID de campaña | 🔒 bloqueante |
| link del portal | 🔒 bloqueante |
| correo para el alta | 🔒 bloqueante |

**Consulta administrativa** — sin SLA

| campo | clase |
|---|---|
| ID de campaña | 🔒 bloqueante |
| nombre de la campaña | ⚠ recomendado (el spec dice "opcional") |
| descripción (campo general) | 🔒 bloqueante |

## LEGAL

Primero se elige la **ruta** (es el tipo): Ruta A — contrato MOVDI · Ruta B — contrato del cliente.

**Solo Ruta B**

| campo | clase |
|---|---|
| contrato del cliente (archivo o link) | 🔒 bloqueante |

**Comunes a ambas rutas**

| campo | clase | catálogo | condicional |
|---|---|---|---|
| nombre de la campaña | 🔒 bloqueante | | |
| talento a firmar | 🔒 bloqueante | | |
| correo de contacto del cliente | 🔒 bloqueante | | |
| checklist contractual | ⚠ recomendado | | |
| características especiales de la negociación | ⚠ recomendado | | |
| cliente (nombre comercial) | 🔒 bloqueante | ✓ | |
| fecha de la constancia fiscal | ⚠ recomendado | ✓ | aviso amarillo si > 3 meses (no bloquea) |
| constancia de situación fiscal (link) | ⚠ recomendado | ✓ | |
| ¿es persona moral? | ⚠ recomendado | ✓ | |
| documento de facultades (link) | ⚠ recomendado | ✓ | solo si persona moral = sí |
| ¿el domicilio comercial difiere del fiscal? | ⚠ recomendado | | |
| domicilio comercial | ⚠ recomendado | ✓ | solo si difiere = sí |
| nombre del firmante | 🔒 bloqueante | ✓ | |
| cargo del firmante | ⚠ recomendado | ✓ | |
| identificación del firmante (link) | ⚠ recomendado | ✓ | |
| correo para oír y recibir notificaciones | ⚠ recomendado | ✓ | |

## Criterio usado para los defaults

- Lo que el spec marcó explícito como bloqueante, es bloqueante (brief de
  Digital, contrato en Ruta B).
- Factura: todo bloqueante — sin cualquiera de esos datos la factura no se
  puede emitir y el hueco regresa por WhatsApp.
- Legal: bloqueante solo lo estructural (campaña, talento, contacto, cliente,
  firmante); la documentación del cliente es recomendada porque suele llegar
  después de arrancar la revisión — se marca en la tarjeta para no perderla.
- Cualquier ajuste que salga de la validación con las áreas: editar la
  palabra `clase` del campo en `lib/tipos-peticion.ts` y listo.
