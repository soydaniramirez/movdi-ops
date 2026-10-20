'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { CLAVE_TEMA, type PreferenciaTema } from '@/lib/tema'

// íconos SVG (no emoji/glifos: se ven igual en todas las fuentes)
const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const ICONOS: Record<PreferenciaTema, React.ReactNode> = {
  claro: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...trazo}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  oscuro: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...trazo}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  sistema: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...trazo}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
}
const OPCIONES: PreferenciaTema[] = ['claro', 'oscuro', 'sistema']

function leerPreferencia(): PreferenciaTema {
  try {
    const v = localStorage.getItem(CLAVE_TEMA)
    return v === 'claro' || v === 'oscuro' ? v : 'sistema'
  } catch {
    return 'sistema'
  }
}

function aplicar(pref: PreferenciaTema) {
  const sistemaClaro = window.matchMedia('(prefers-color-scheme: light)').matches
  const tema = pref === 'claro' ? 'light' : pref === 'oscuro' ? 'dark' : sistemaClaro ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', tema)
}

// La preferencia se lee como "store externo" (localStorage): en el server y
// en la hidratación vale null (ningún botón marcado) y luego toma el valor real.
const oyentes = new Set<() => void>()
function suscribir(cb: () => void) {
  oyentes.add(cb)
  const onStorage = (e: StorageEvent) => { if (e.key === CLAVE_TEMA) { aplicar(leerPreferencia()); cb() } }
  window.addEventListener('storage', onStorage) // otra pestaña cambió el tema
  return () => { oyentes.delete(cb); window.removeEventListener('storage', onStorage) }
}

// Selector de 3 posiciones (claro / oscuro / sistema). En "sistema" sigue en
// vivo al sistema operativo si cambia mientras la app está abierta.
export default function SelectorTema() {
  const pref = useSyncExternalStore<PreferenciaTema | null>(suscribir, leerPreferencia, () => null)

  useEffect(() => {
    if (pref !== 'sistema') return
    const m = window.matchMedia('(prefers-color-scheme: light)')
    const onCambio = () => aplicar('sistema')
    m.addEventListener('change', onCambio)
    return () => m.removeEventListener('change', onCambio)
  }, [pref])

  function elegir(v: PreferenciaTema) {
    try { localStorage.setItem(CLAVE_TEMA, v) } catch { /* modo privado: no se guarda */ }
    aplicar(v)
    oyentes.forEach(cb => cb())
  }

  return (
    <div role="radiogroup" aria-label="tema" data-testid="selector-tema"
      className="flex items-center rounded-full border border-neutral-800 p-0.5">
      {OPCIONES.map(valor => {
        const activo = pref === valor
        return (
          <button key={valor} type="button" role="radio" aria-checked={activo}
            title={`tema ${valor}`} aria-label={`tema ${valor}`}
            onClick={() => elegir(valor)}
            className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
              activo ? 'bg-movdi-naranja text-black' : 'text-neutral-500 hover:text-neutral-200'
            }`}>
            <span aria-hidden>{ICONOS[valor]}</span>
          </button>
        )
      })}
    </div>
  )
}
