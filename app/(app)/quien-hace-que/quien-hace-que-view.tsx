'use client'

import { Fragment, useRef, useState, useSyncExternalStore } from 'react'
import {
  ACUERDOS, AREAS, CLAVE_AREA_QHQ, FLOWS, GROUPS, LEYENDA, POR_AFINAR, ROLE,
  esAreaQhq, pasoEsDeArea, resumenDeArea, type AreaQhq, type EstiloPapel,
} from '@/lib/quien-hace-que'

// Elección del filtro como "store externo" (localStorage, mismo patrón que el
// selector de tema). null = nunca eligió → manda el área de su perfil;
// '' = eligió "sin filtro" a propósito.
const oyentes = new Set<() => void>()
function suscribir(cb: () => void) {
  oyentes.add(cb)
  return () => { oyentes.delete(cb) }
}
function leerGuardada(): string | null {
  try { return localStorage.getItem(CLAVE_AREA_QHQ) } catch { return null }
}
function guardar(v: AreaQhq | null) {
  try { localStorage.setItem(CLAVE_AREA_QHQ, v ?? '') } catch { /* modo privado: no se guarda */ }
  oyentes.forEach((cb) => cb())
}

function Chip({ estilo, children }: { estilo: EstiloPapel; children: React.ReactNode }) {
  return <span className={`qhq-chip qhq-chip-${estilo}`}>{children}</span>
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-400">{children}</span>
}

function Encabezado({ eyebrow, titulo, children }: { eyebrow: string; titulo: string; children?: React.ReactNode }) {
  return (
    <div className="grid max-w-[70ch] gap-2">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-2xl font-extrabold tracking-tight text-neutral-100">{titulo}</h2>
      {children && <p className="text-neutral-400">{children}</p>}
    </div>
  )
}

const tarjeta = 'rounded-2xl border border-neutral-800 bg-neutral-900'

export default function QuienHaceQueView({ areaDefault }: { areaDefault: AreaQhq | null }) {
  // en el server y en la hidratación no hay localStorage → el default del perfil
  const guardada = useSyncExternalStore<string | null>(suscribir, leerGuardada, () => null)
  const area: AreaQhq | null = guardada === null ? areaDefault : esAreaQhq(guardada) ? guardada : null
  const dim = (activa: boolean) => (area && !activa ? 'qhq-dim' : '')

  return (
    <main className="mx-auto grid max-w-6xl gap-12 px-4 py-8 text-neutral-100 sm:px-6" data-testid="quien-hace-que">
      {/* Header + regla del dueño */}
      <header className="grid gap-5">
        <div className="grid gap-2.5">
          <Eyebrow>Cómo trabajamos · octubre 2026</Eyebrow>
          <h1 className="text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">Quién hace qué</h1>
        </div>
        <div className={`${tarjeta} grid max-w-3xl gap-3 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-4`}>
          <span className="self-start justify-self-start whitespace-nowrap rounded-full bg-movdi-naranja px-3 py-1.5 text-[13px] font-bold text-black">
            Regla del dueño
          </span>
          <p className="text-base">
            Cada tarea tiene <b>una persona dueña</b> que la acompaña de principio a fin. No tiene que hacerla sola: se
            apoya en otras áreas y cuida que llegue a buen puerto. <b>Quien pide algo es su dueño</b> hasta que se cierra.
          </p>
        </div>
      </header>

      {/* Filtro */}
      <div role="region" aria-label="Filtro por área" className="border-b border-neutral-800 pb-3">
        <div className="flex flex-wrap items-center gap-2" data-testid="qhq-filtro">
          <span className="mr-1.5 font-bold">¿Qué me toca a mí?</span>
          {AREAS.map((a) => {
            const activa = area === a.id
            return (
              <button key={a.id} type="button" aria-pressed={activa} data-area={a.id}
                onClick={() => guardar(activa ? null : a.id)}
                className={`qhq-${a.id} inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-movdi-naranja ${
                  activa
                    ? 'border-[var(--ac)] bg-[var(--ac)] text-[var(--ac-ink)]'
                    : 'border-neutral-800 bg-neutral-900 text-neutral-100 hover:border-neutral-500'
                }`}>
                <span className={`h-2.5 w-2.5 rounded-full ${activa ? 'bg-[var(--ac-ink)]' : 'bg-[var(--ac-line)]'}`} />
                {a.short || a.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Mi resumen */}
      {area && <MiResumen area={area} />}

      {/* Leyenda */}
      <section className="grid gap-5">
        <Encabezado eyebrow="Cómo leerlo" titulo="Cuatro formas de participar" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {LEYENDA.map(([estilo, label, texto]) => (
            <div key={estilo} className={`${tarjeta} qhq-pm grid content-start justify-items-start gap-2.5 p-4`}>
              <Chip estilo={estilo}>{label}</Chip>
              <p className="text-[13.5px] text-neutral-400">{texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Áreas */}
      <section className="grid gap-5">
        <Encabezado eyebrow="Las áreas" titulo="Qué aporta cada área" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {AREAS.map((a) => (
            <div key={a.id} data-area={a.id}
              className={`qhq-${a.id} qhq-fade ${tarjeta} grid min-w-0 content-start gap-2 border-t-4 border-t-[var(--ac-line)] p-4 ${dim(area === a.id)}`}>
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-neutral-400">{a.side}</span>
              <h3 className="text-[17px] font-extrabold">{a.name}</h3>
              <p className="text-sm">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Matriz */}
      <section className="grid gap-5">
        <Encabezado eyebrow="La matriz" titulo="Qué le toca a cada área">
          El copy de un talento lo escribe su PM, porque es quien mejor lo conoce. Digital le da forma visual y una
          revisada de estilo.
        </Encabezado>
        <div className="overflow-x-auto rounded-2xl border border-neutral-800" data-testid="qhq-matriz">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className="border-b border-neutral-800 bg-neutral-900 px-3.5 py-3 text-left text-[13px] font-bold">Actividad</th>
                {AREAS.map((a) => (
                  <th key={a.id} data-area={a.id}
                    className={`qhq-${a.id} qhq-fade whitespace-nowrap border-b border-neutral-800 bg-neutral-900 px-3.5 py-3 text-center text-[13px] font-bold ${dim(area === a.id)}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-[var(--ac-line)]" />
                      {a.short || a.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <Fragment key={g.name}>
                  <tr>
                    <td colSpan={AREAS.length + 1}
                      className="border-b border-neutral-800 bg-neutral-800/40 px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-400">
                      {g.name}
                    </td>
                  </tr>
                  {g.rows.map(([tarea, papeles]) => {
                    const tiene = !!area && !!papeles[area]
                    return (
                      <tr key={tarea} data-testid="qhq-fila"
                        className={`${area ? `qhq-${area}` : ''} ${tiene ? 'bg-[color-mix(in_srgb,var(--ac)_7%,transparent)]' : ''}`}>
                        <td className={`qhq-fade min-w-[260px] border-b border-neutral-800 px-3.5 py-3 text-[14.5px] ${dim(tiene)}`}>{tarea}</td>
                        {AREAS.map((a) => {
                          const v = papeles[a.id]
                          return (
                            <td key={a.id} data-area={a.id}
                              className={`qhq-${a.id} qhq-fade border-b border-neutral-800 px-3.5 py-3 text-center ${dim(area === a.id)}`}>
                              {v
                                ? <Chip estilo={ROLE[v][0]}>{ROLE[v][1]}</Chip>
                                : <span className="text-neutral-600" aria-label="sin papel">·</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="max-w-[75ch] text-[13.5px] text-neutral-400">
          En las filas de PM, cada PM acompaña a sus propios talentos. Cuando una press junta talentos de varios PMs, Head
          de PM la coordina.
        </p>
      </section>

      {/* Flujos */}
      <section className="grid gap-5">
        <Encabezado eyebrow="Flujos clave" titulo="Cómo nos pasamos la pelota">
          Los plazos marcados como propuesta los vamos a afinar con cada área antes de arrancar.
        </Encabezado>
        <div className="grid gap-7">
          {FLOWS.map((f) => (
            <div key={f.title} className="grid gap-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-lg font-extrabold">{f.title}</h3>
                <span className="text-[13px] text-neutral-400">{f.who}</span>
              </div>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-stretch">
                {f.steps.map(([areaPaso, actor, texto, etiqueta], i) => {
                  const partido = areaPaso === 'pmimk'
                  return (
                    <Fragment key={i}>
                      {i > 0 && (
                        <span aria-hidden className="ml-[18px] rotate-90 self-start text-lg text-neutral-600 sm:ml-0 sm:rotate-0 sm:self-center">→</span>
                      )}
                      <div data-testid="qhq-paso" data-area={areaPaso}
                        className={`${partido ? '' : `qhq-${areaPaso}`} qhq-fade ${tarjeta} grid min-w-0 content-start gap-2 rounded-xl px-3.5 pb-3.5 pt-3 sm:max-w-[230px] sm:flex-[1_1_150px] ${dim(!!area && pasoEsDeArea(areaPaso, area))}`}>
                        <div className={`-mt-0.5 mb-0.5 h-1 rounded ${partido ? 'qhq-split' : 'bg-[var(--ac-line)]'}`} />
                        <span className="font-mono text-[11px] text-neutral-400">Paso {i + 1}</span>
                        <span className="text-[13px] font-extrabold">{actor}</span>
                        <p className="text-[13.5px]">{texto}</p>
                        {etiqueta && (
                          <span className="justify-self-start rounded-md border border-neutral-800 px-1.5 py-0.5 font-mono text-[10.5px] tracking-wide text-neutral-400">
                            {etiqueta}
                          </span>
                        )}
                      </div>
                    </Fragment>
                  )
                })}
              </div>
              {f.template && <Plantilla texto={f.template} />}
            </div>
          ))}
        </div>
      </section>

      {/* Acuerdos */}
      <section className="grid gap-5">
        <Encabezado eyebrow="Reglas entre áreas" titulo="Acuerdos para trabajar mejor juntos" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {ACUERDOS.map(([titulo, texto]) => (
            <div key={titulo} className={`${tarjeta} grid content-start gap-1.5 p-[18px]`}>
              <h3 className="font-extrabold">{titulo}</h3>
              <p className="text-sm text-neutral-400">{texto}</p>
            </div>
          ))}
        </div>
        <p className="max-w-[75ch] border-l-[3px] border-movdi-amarillo py-1 pl-3.5 text-[13.5px] text-neutral-400">
          <b className="text-neutral-200">Por afinar:</b> {POR_AFINAR}
        </p>
      </section>
    </main>
  )
}

function MiResumen({ area }: { area: AreaQhq }) {
  const r = resumenDeArea(area)
  const a = AREAS.find((x) => x.id === area)!
  const cols: ['dueno' | 'hace' | 'apoya', string][] = [['dueno', 'Eres dueño'], ['hace', 'Haces tu parte'], ['apoya', 'Apoyas']]
  return (
    <section aria-live="polite" className={`qhq-${area} grid gap-5`} data-testid="qhq-resumen">
      <Encabezado eyebrow="Tu resumen" titulo={`Lo que le toca a ${a.name}`} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {cols.map(([k, label]) => (
          <div key={k} className={`${tarjeta} grid min-w-0 content-start gap-2.5 px-[18px] py-4`}>
            <h3><Chip estilo={k}>{label}</Chip></h3>
            {r[k].length ? (
              <ul className="grid gap-2">
                {r[k].map((t) => (
                  <li key={t} className="relative pl-3.5 text-sm [overflow-wrap:anywhere]">
                    <span aria-hidden className="absolute left-0 top-[0.6em] h-1.5 w-1.5 rounded-full bg-[var(--ac-line)]" />
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">Nada por aquí.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function Plantilla({ texto }: { texto: string }) {
  const preRef = useRef<HTMLPreElement>(null)
  const [estado, setEstado] = useState<'idle' | 'copiada' | 'seleccionada'>('idle')

  function seleccionar() {
    const pre = preRef.current
    const sel = window.getSelection()
    if (!pre || !sel) return
    const r = document.createRange()
    r.selectNodeContents(pre)
    sel.removeAllRanges()
    sel.addRange(r)
    setEstado('seleccionada')
  }

  function copiar() {
    // writeText dentro del click (gesto del usuario); si el navegador no deja,
    // se selecciona el texto para copiarlo a mano
    try {
      navigator.clipboard.writeText(texto).then(() => {
        setEstado('copiada')
        setTimeout(() => setEstado('idle'), 2000)
      }, seleccionar)
    } catch {
      seleccionar()
    }
  }

  return (
    <div className={`qhq-imk ${tarjeta} grid gap-3 rounded-xl border-l-4 border-l-[var(--ac-line)] px-[18px] py-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <Eyebrow>Plantilla del correo · paso 2</Eyebrow>
          <h4 className="font-extrabold">Correo de campaña confirmada</h4>
        </div>
        <button type="button" onClick={copiar} data-testid="qhq-copiar"
          className="rounded-full bg-[var(--ac)] px-4 py-2 text-[13px] font-bold text-[var(--ac-ink)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-movdi-naranja">
          {estado === 'copiada' ? 'Copiada' : estado === 'seleccionada' ? 'Seleccionada: usa Ctrl/Cmd + C' : 'Copiar plantilla'}
        </button>
      </div>
      <pre ref={preRef} data-testid="qhq-plantilla"
        className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-neutral-800/50 px-4 py-3.5 font-mono text-[13px] leading-relaxed [overflow-wrap:anywhere]">
        {texto}
      </pre>
    </div>
  )
}
