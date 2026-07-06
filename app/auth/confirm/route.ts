import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Punto de entrada de los links de email (recovery / invite).
// Soporta ambos formatos de link de Supabase:
//  - PKCE:      ?code=...            → exchangeCodeForSession
//  - token hash: ?token_hash=...&type=recovery|invite → verifyOtp
// Si el link es válido, deja la sesión en cookies y redirige a `next`
// (por defecto /update-password para definir la contraseña).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/update-password'

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=link_invalido`)
}
