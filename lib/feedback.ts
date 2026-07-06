// Dominio del módulo de feedback interno (Fase 4.10).
// La tabla vive detrás de la migración cutover 7 (RLS + trigger de
// anonimato); estos tipos/mappers son compartidos entre cliente y servidor.

export type FeedbackCategoria = 'reconocimiento' | 'mejora' | 'liderazgo'
export type FeedbackEstado = 'nuevo' | 'en_revision' | 'resuelto'

export type Feedback = {
  id: string
  categoria: FeedbackCategoria
  mensaje: string
  esAnonimo: boolean
  autorId: string | null
  destinatarioId: string | null
  estado: FeedbackEstado
  respuesta: string | null
  esPublico: boolean
  compartibleLoop: boolean
  creadaEn: string | null
  actualizadaEn: string | null
}

export const CATEGORIAS: { v: FeedbackCategoria; icono: string; label: string; hint: string }[] = [
  { v: 'reconocimiento', icono: '🙌', label: 'reconocimiento', hint: 'celebra a una persona o al equipo — va al muro' },
  { v: 'mejora', icono: '🔧', label: 'mejora', hint: 'procesos, herramientas, formas de trabajar — solo lo lee dirección' },
  { v: 'liderazgo', icono: '🧭', label: 'liderazgo', hint: 'feedback hacia arriba — solo lo lee dirección' },
]

export const ESTADOS: { v: FeedbackEstado; label: string }[] = [
  { v: 'nuevo', label: 'nuevo' },
  { v: 'en_revision', label: 'en revisión' },
  { v: 'resuelto', label: 'resuelto' },
]

export const MAX_MENSAJE = 2000

// Regla de la casa (visible antes de enviar)
export const REGLA_DE_LA_CASA =
  'sobre el comportamiento, no la persona · constructivo · lo que propondrías'

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapFeedbackRow(r: any): Feedback {
  return {
    id: r.id,
    categoria: r.categoria,
    mensaje: r.mensaje,
    esAnonimo: r.es_anonimo === true,
    autorId: r.autor_id ?? null,
    destinatarioId: r.destinatario_id ?? null,
    estado: r.estado ?? 'nuevo',
    respuesta: r.respuesta ?? null,
    esPublico: r.es_publico === true,
    compartibleLoop: r.compartible_loop === true,
    creadaEn: r.created_at ?? null,
    actualizadaEn: r.updated_at ?? null,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
