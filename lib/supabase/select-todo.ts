// Lectura COMPLETA vía PostgREST, paginada en bloques de 1000 — el tope
// max-rows por respuesta del API de Supabase. Sin esto, cualquier
// select('*') de una tabla con >1000 filas se trunca EN SILENCIO (bug
// 2026-08-06: peticiones cruzó las 1000 filas y "lo que pedí", el XP del
// header y el cierre de julio leyeron datos incompletos).
//
// `base` construye un builder NUEVO por página (select + filtros); el helper
// le agrega orden y rango. El orden SIEMPRE desempata con `id` (único) para
// que las páginas no salten ni dupliquen filas en los bordes cuando la
// columna de orden repite valores (p.ej. muchas peticiones con la misma
// fecha).

export type OrdenPagina = { col: string; asc?: boolean }

type RespuestaFilas = {
  data: Record<string, unknown>[] | null
  error: { message: string } | null
}

interface BuilderPaginable extends PromiseLike<RespuestaFilas> {
  order(col: string, opts: { ascending: boolean }): BuilderPaginable
  range(desde: number, hasta: number): BuilderPaginable
}

export const PAGINA_MAX = 1000

export async function selectTodo(
  base: () => BuilderPaginable,
  orden: OrdenPagina[] = [],
): Promise<RespuestaFilas> {
  const filas: Record<string, unknown>[] = []
  for (;;) {
    let q = base()
    for (const o of [...orden, { col: 'id', asc: true }]) {
      q = q.order(o.col, { ascending: o.asc !== false })
    }
    const { data, error } = await q.range(filas.length, filas.length + PAGINA_MAX - 1)
    if (error) return { data: null, error }
    filas.push(...(data ?? []))
    if ((data ?? []).length < PAGINA_MAX) return { data: filas, error: null }
  }
}
