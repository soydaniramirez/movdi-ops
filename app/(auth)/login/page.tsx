import LoginForm from './login-form'

// El login NO lista personas: email + contraseña escritos (regla de seguridad).
// El middleware redirige aquí a cualquier visitante sin sesión.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="bg-blueprint flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">
            / acceso interno
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-100">
            MOVDI <span className="text-movdi-naranja">·</span> ops
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            ingresa con tu correo y contraseña.
          </p>
        </div>
        {error === 'link_invalido' && (
          <p className="mb-4 border border-movdi-naranja/40 bg-movdi-naranja/10 px-3 py-2 font-mono text-xs text-movdi-naranja">
            el link expiró o no es válido. solicita uno nuevo con “¿olvidaste tu contraseña?”.
          </p>
        )}
        <LoginForm />
      </div>
    </main>
  )
}
