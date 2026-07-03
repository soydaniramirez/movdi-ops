'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Definir/restablecer contraseña. Se llega aquí desde el link de email
// (recovery o invite) vía /auth/confirm, ya con sesión en cookies —
// el middleware bloquea a quien entre sin sesión.
// Réplica del flujo guardarNuevaPassword de la SPA: mínimo 8, confirmación.
export default function UpdatePasswordPage() {
  const router = useRouter()
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (pass1.length < 8) {
      setErr('la contraseña debe tener al menos 8 caracteres')
      return
    }
    if (pass1 !== pass2) {
      setErr('las contraseñas no coinciden')
      return
    }
    setCargando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: pass1 })
    if (error) {
      setCargando(false)
      setErr('error: ' + error.message)
      return
    }
    router.replace('/')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <form onSubmit={guardar} className="w-full max-w-sm space-y-4">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-neutral-100">define tu contraseña</h1>
          <p className="mt-1 text-sm text-neutral-400">
            esta contraseña la usarás para entrar siempre.
          </p>
        </div>
        <div>
          <label htmlFor="pass1" className="mb-1 block font-mono text-xs uppercase tracking-wider text-neutral-400">
            nueva contraseña
          </label>
          <input
            id="pass1"
            type="password"
            autoComplete="new-password"
            value={pass1}
            onChange={(e) => setPass1(e.target.value)}
            className="w-full border border-neutral-800 bg-neutral-900 px-3.5 py-3 text-sm text-neutral-100 outline-none focus:border-orange-600"
          />
        </div>
        <div>
          <label htmlFor="pass2" className="mb-1 block font-mono text-xs uppercase tracking-wider text-neutral-400">
            confirmar contraseña
          </label>
          <input
            id="pass2"
            type="password"
            autoComplete="new-password"
            value={pass2}
            onChange={(e) => setPass2(e.target.value)}
            className="w-full border border-neutral-800 bg-neutral-900 px-3.5 py-3 text-sm text-neutral-100 outline-none focus:border-orange-600"
          />
        </div>
        {err && <p role="alert" className="font-mono text-xs text-orange-500">{err}</p>}
        <button
          type="submit"
          disabled={cargando}
          className="w-full bg-orange-600 px-5 py-3 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
        >
          {cargando ? 'guardando…' : 'guardar contraseña'}
        </button>
      </form>
    </main>
  )
}
