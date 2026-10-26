import { createClient } from '@/lib/supabase/server'
import { mapPersonaRow } from '@/lib/peticiones'
import { areaDefaultDe } from '@/lib/quien-hace-que'
import QuienHaceQueView from './quien-hace-que-view'

// /quien-hace-que (2026-10-26) — referencia informativa de SOLO LECTURA,
// visible para todos los roles (sin gate). El contenido vive en
// lib/quien-hace-que.ts; aquí solo se resuelve el área de la persona para
// preseleccionar el filtro "¿qué me toca a mí?".
export default async function QuienHaceQuePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: row } = await supabase
    .from('personas').select('*').eq('email', user?.email ?? '').maybeSingle()

  return <QuienHaceQueView areaDefault={areaDefaultDe(row ? mapPersonaRow(row) : null)} />
}
