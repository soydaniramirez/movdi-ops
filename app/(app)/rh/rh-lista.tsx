'use client'

import { useState } from 'react'
import { type Peticion } from '@/lib/peticiones'

// Lista del panel RH con toggle "ocultar entregadas" (como en peticiones).
// Solo presentación: los datos llegan del Server Component (RLS aplicada);
// el toggle es un filtro de vista, no escribe nada.
export default function RhLista({ peticiones }: { peticiones: Peticion[] }) {
  const [ocultarEntregadas, setOcultarEntregadas] = useState(false)
  const entregadas = peticiones.filter((t) => t.estatus === 'entregado').length
  const lista = ocultarEntregadas ? peticiones.filter((t) => t.estatus !== 'entregado') : peticiones

  return (
    <section className="mt-6">
      {entregadas > 0 && (
        <button
          onClick={() => setOcultarEntregadas((v) => !v)}
          data-testid="btn-rh-toggle-entregadas"
          className="mb-3 rounded-full border border-neutral-700 px-2.5 py-1 font-mono text-[11px] text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200"
        >
          {ocultarEntregadas ? `👁 mostrar entregadas (${entregadas})` : `🙈 ocultar entregadas (${entregadas})`}
        </button>
      )}
      <div className="space-y-2">
        {lista.length === 0 && (
          <p className="font-mono text-xs text-neutral-500">
            {ocultarEntregadas ? 'sin pendientes — todo entregado 🎉' : 'no hay peticiones del área RH visibles para ti'}
          </p>
        )}
        {lista.map((t) => (
          <article key={t.id} data-testid="rh-peticion"
            className="card-hover rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
            <p className="text-sm font-semibold">{t.privada && '🔒 '}{t.nombre}</p>
            <p className="mt-0.5 font-mono text-[11px] text-neutral-500">
              de {t.creadoPor} para {t.para} · {t.fecha} ·{' '}
              <span className={t.estatus === 'entregado' ? 'text-movdi-verde' : t.estatus === 'proceso' ? 'text-movdi-amarillo' : ''}>
                {t.estatus === 'entregado' ? 'entregado ✓' : t.estatus === 'proceso' ? 'en proceso' : t.estatus}
              </span>
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}
