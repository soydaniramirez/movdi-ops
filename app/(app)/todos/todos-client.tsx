'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type Persona } from '@/lib/peticiones'
import { crearTodo } from './actions'

type Todo = { id: string; texto: string; hecho: boolean; creadaEn: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapTodoRow = (r: any): Todo => ({ id: r.id, texto: r.texto, hecho: r.hecho === true, creadaEn: r.created_at })
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function TodosClient({ yo }: { yo: Persona }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [texto, setTexto] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [textoEdit, setTextoEdit] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  // RLS todos_select_own: solo llegan los propios
  const recargar = useCallback(async () => {
    const sb = createClient()
    const { data, error } = await sb.from('todos').select('*').order('created_at', { ascending: false })
    if (!error) setTodos((data ?? []).map(mapTodoRow))
    setCargando(false)
  }, [])

  // Carga inicial client-side (anon+RLS); setState tras await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void recargar() }, [recargar])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    const r = await crearTodo({ texto }) // user_nombre derivado en el servidor
    setAviso(r.ok ? null : ('error' in r ? r.error : 'error'))
    if (r.ok) setTexto('')
    await recargar()
  }

  // Toggle/editar/borrar: filas propias → client-side con RLS (todos_*_own)
  async function toggle(t: Todo) {
    await createClient().from('todos').update({ hecho: !t.hecho }).eq('id', t.id)
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, hecho: !t.hecho } : x)))
  }
  async function guardarEdicion(t: Todo) {
    const nuevo = textoEdit.trim()
    setEditando(null)
    if (!nuevo || nuevo === t.texto) return
    await createClient().from('todos').update({ texto: nuevo }).eq('id', t.id)
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, texto: nuevo } : x)))
  }
  async function borrar(id: string) {
    await createClient().from('todos').delete().eq('id', id)
    setTodos((prev) => prev.filter((x) => x.id !== id))
  }

  const pendientes = todos.filter((t) => !t.hecho).length

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto max-w-2xl">
        <header className="border-b border-neutral-800 pb-4">
          <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">movdi · ops</div>
          <h1 className="text-2xl font-bold tracking-tight">✓ mis to-dos</h1>
          <p className="mt-0.5 font-mono text-[11px] text-neutral-500" data-testid="contador-todos">
            {pendientes} pendiente(s) · solo tú puedes ver esta lista ({yo.nombre})
          </p>
        </header>

        {aviso && (
          <p role="alert" className="mt-4 border border-movdi-naranja/40 bg-movdi-naranja/10 px-3 py-2 font-mono text-xs text-movdi-naranja">
            {aviso}
          </p>
        )}

        <form onSubmit={agregar} className="mt-6 flex gap-2">
          <input
            id="todo-input"
            className="flex-1 border border-neutral-700 bg-neutral-900 px-3.5 py-3 text-sm text-neutral-100 outline-none focus:border-movdi-naranja"
            placeholder="agregar tarea personal…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="submit" data-testid="btn-agregar-todo"
            className="rounded-full bg-movdi-naranja px-4 py-2 text-sm font-medium hover:bg-movdi-naranja/85">
            agregar
          </button>
        </form>

        <section className="mt-6 space-y-2">
          {cargando && <p className="font-mono text-xs text-neutral-500">cargando…</p>}
          {!cargando && todos.length === 0 && (
            <div className="py-10 text-center">
              <h4 className="text-sm text-neutral-300">tu lista está vacía</h4>
              <p className="mt-1 font-mono text-xs text-neutral-500">agrega tareas personales que solo tú podrás ver</p>
            </div>
          )}
          {todos.map((t) => (
            <div key={t.id} data-testid="todo-item"
              className={`group flex items-center gap-3 border border-neutral-800 bg-neutral-900 px-3 py-2.5 ${t.hecho ? 'opacity-60' : ''}`}>
              <button onClick={() => toggle(t)} data-testid="todo-check" aria-label={t.hecho ? 'marcar pendiente' : 'marcar hecho'}
                className={`flex h-5 w-5 shrink-0 items-center justify-center border text-[11px] ${t.hecho ? 'border-movdi-verde bg-movdi-verde/20 text-movdi-verde' : 'border-neutral-600 text-transparent hover:border-movdi-naranja'}`}>
                ✓
              </button>
              {editando === t.id ? (
                <input
                  autoFocus
                  data-testid="todo-edit-input"
                  className="flex-1 border border-movdi-naranja bg-neutral-950 px-2 py-1 text-sm text-neutral-100 outline-none"
                  value={textoEdit}
                  onChange={(e) => setTextoEdit(e.target.value)}
                  onBlur={() => guardarEdicion(t)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void guardarEdicion(t); if (e.key === 'Escape') setEditando(null) }}
                />
              ) : (
                <span
                  data-testid="todo-texto"
                  onDoubleClick={() => { setEditando(t.id); setTextoEdit(t.texto) }}
                  className={`flex-1 text-sm ${t.hecho ? 'line-through' : ''}`}>
                  {t.texto}
                </span>
              )}
              {/* touch: siempre visibles en móvil (sin hover); en desktop se
                  revelan al pasar el mouse, como antes (auditoría 2026-07-20) */}
              <button onClick={() => { setEditando(t.id); setTextoEdit(t.texto) }} data-testid="btn-editar-todo"
                className="font-mono text-[10px] text-neutral-600 hover:text-neutral-300 sm:opacity-0 sm:group-hover:opacity-100">
                editar
              </button>
              <button onClick={() => borrar(t.id)} data-testid="btn-borrar-todo"
                className="text-neutral-600 hover:text-movdi-naranja sm:opacity-0 sm:group-hover:opacity-100">
                ✕
              </button>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
