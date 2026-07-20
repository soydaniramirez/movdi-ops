import Link from 'next/link'
import { AREAS_LABEL, AREAS_VALIDAS, AREA_COLOR, estaPausada } from '@/lib/peticiones'
import { type NodoOrg, type PersonaConManagers, construirOrganigrama } from '@/lib/equipo'

// Vista pura (server component): construye el árbol en vivo y lo pinta con el
// árbol CSS de globals.css (.orgchart). Solo lectura — la edición vive en la
// pestaña equipo. Móvil: el árbol scrollea horizontal dentro de su contenedor.

function Tarjeta({ n }: { n: NodoOrg }) {
  const p = n.persona
  const areaPrincipal = (p.areas ?? [])[0]
  const color = AREA_COLOR[areaPrincipal] ?? 'border-neutral-700 text-neutral-300'
  const pausa = estaPausada(p)
  const areasLabel = (p.areas ?? []).map((a) => AREAS_LABEL[a] ?? a).join(' · ') || 'sin área'
  return (
    <div
      data-testid="org-card"
      className={`card-hover mx-auto inline-block w-[10.5rem] rounded-xl border bg-neutral-900/70 px-3 py-2 text-left ${color}`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="text-[13px] font-medium leading-tight text-neutral-100">{p.nombre} {p.apellido}</span>
        {p.esDireccion && (
          <span className="shrink-0 rounded-full border border-movdi-naranja/50 px-1.5 font-mono text-[8px] uppercase tracking-wider text-movdi-naranja">dir</span>
        )}
      </div>
      <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wide">{areasLabel}</div>
      {p.rol && <div className="mt-0.5 truncate text-[11px] text-neutral-400" title={p.rol}>{p.rol}</div>}
      {pausa && (
        <div className="mt-1 inline-block rounded-full border border-movdi-amarillo/50 px-1.5 font-mono text-[9px] text-movdi-amarillo">
          ⏸ en pausa{p.pausadaHasta ? ` · ${p.pausadaHasta}` : ''}
        </div>
      )}
      {n.apoyos.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {n.apoyos.map((a) => (
            <span key={a} className="rounded-full border border-dashed border-neutral-500 px-1.5 font-mono text-[9px] text-neutral-400" title={`apoyo: ${a}`}>
              ⋯ {a}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Nodo({ n }: { n: NodoOrg }) {
  return (
    <li>
      <Tarjeta n={n} />
      {n.hijos.length > 0 && (
        <ul>
          {n.hijos.map((h) => <Nodo key={h.persona.id} n={h} />)}
        </ul>
      )}
    </li>
  )
}

export default function OrganigramaView({
  personas,
  puedeEditarEquipo,
}: {
  personas: PersonaConManagers[]
  puedeEditarEquipo: boolean
}) {
  const { raices, sinAsignar } = construirOrganigrama(personas)

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-neutral-100">organigrama</h1>
          <p className="mt-1 max-w-xl text-[13px] text-neutral-400">
            vista de solo lectura, generada en vivo desde el equipo. la jerarquía sale de
            {' '}<span className="text-neutral-300">manager principal</span> (línea sólida) y
            {' '}<span className="text-neutral-300">apoyo</span> (punteado). se edita en la pestaña equipo.
          </p>
        </div>
        {puedeEditarEquipo && (
          <Link
            href="/equipo"
            data-testid="link-editar-equipo"
            className="shrink-0 rounded-full border border-neutral-700 px-3 py-1.5 font-mono text-[11px] text-neutral-300 transition-colors hover:border-movdi-naranja/60 hover:text-movdi-naranja"
          >
            editar en equipo →
          </Link>
        )}
      </div>

      {/* Leyenda */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-neutral-800 py-2 text-[11px] text-neutral-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-6 bg-neutral-500" /> manager principal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 border-t border-dashed border-neutral-500" /> apoyo (managers)
        </span>
        <span className="mx-1 h-3 w-px bg-neutral-800" />
        {AREAS_VALIDAS.map((a) => (
          <span key={a} className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase ${AREA_COLOR[a]}`}>
            {AREAS_LABEL[a]}
          </span>
        ))}
      </div>

      {/* Árbol — scroll horizontal en pantallas chicas */}
      <div className="mt-6 overflow-x-auto pb-4">
        <div className="flex min-w-max items-start justify-center gap-12">
          {raices.map((r) => (
            <div key={r.persona.id} className="orgchart">
              <ul><Nodo n={r} /></ul>
            </div>
          ))}
        </div>
      </div>

      {/* Sin asignar — detector de datos incompletos */}
      <section className="mt-8 border-t border-neutral-800 pt-4">
        <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-400">sin asignar</h2>
        {sinAsignar.length === 0 ? (
          <p className="mt-2 text-[12px] text-movdi-verde">✓ todas las personas activas tienen manager principal.</p>
        ) : (
          <>
            <p className="mt-1 text-[12px] text-movdi-amarillo">
              estas personas activas no tienen manager principal válido — revisa su ficha en equipo.
            </p>
            <div className="mt-3 overflow-x-auto pb-2">
              <div className="flex min-w-max items-start gap-10">
                {sinAsignar.map((n) => (
                  <div key={n.persona.id} className="orgchart">
                    <ul><Nodo n={n} /></ul>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
