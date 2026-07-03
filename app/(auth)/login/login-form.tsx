'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setInfo(null)
    const mail = email.trim().toLowerCase()
    if (!mail || !password) {
      setErr('ingresa tu correo y contraseña')
      return
    }
    setCargando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: mail, password })
    if (error) {
      setCargando(false)
      // Error genérico: no distinguimos correo inexistente de contraseña mala
      setErr('correo o contraseña incorrectos')
      return
    }
    router.replace('/')
    router.refresh()
  }

  async function olvidasteContrasena() {
    setErr(null)
    setInfo(null)
    const mail = email.trim().toLowerCase()
    if (!mail) {
      setInfo('escribe tu correo en el campo de arriba y vuelve a dar clic en "¿olvidaste tu contraseña?".')
      return
    }
    setCargando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(mail, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/update-password`,
    })
    setCargando(false)
    if (error) {
      setErr('no se pudo enviar el email: ' + error.message)
      return
    }
    // Mensaje neutro anti-enumeración (mismo criterio que la SPA)
    setInfo(`si ${mail} está registrado, recibirás un link para restablecer tu contraseña. revisa también spam.`)
  }

  return (
    <form onSubmit={entrar} className="space-y-4">
      <div>
        <label htmlFor="login-email" className="mb-1 block font-mono text-xs uppercase tracking-wider text-neutral-400">
          correo
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          placeholder="tucorreo@movdi.mx"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-neutral-800 bg-neutral-900 px-3.5 py-3 text-sm text-neutral-100 outline-none focus:border-orange-600"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="mb-1 block font-mono text-xs uppercase tracking-wider text-neutral-400">
          contraseña
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-neutral-800 bg-neutral-900 px-3.5 py-3 text-sm text-neutral-100 outline-none focus:border-orange-600"
        />
      </div>

      {err && (
        <p role="alert" className="font-mono text-xs text-orange-500">{err}</p>
      )}
      {info && (
        <p role="status" className="font-mono text-xs text-neutral-400">{info}</p>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={olvidasteContrasena}
          disabled={cargando}
          className="font-mono text-xs text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline disabled:opacity-50"
        >
          ¿olvidaste tu contraseña?
        </button>
        <button
          type="submit"
          disabled={cargando}
          className="bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
        >
          {cargando ? 'autenticando…' : 'entrar →'}
        </button>
      </div>
    </form>
  )
}
