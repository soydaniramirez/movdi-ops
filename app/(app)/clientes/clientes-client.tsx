'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type Cliente, constanciaVigente, mapClienteRow, CLIENTE_COLUMNAS_CSV } from '@/lib/clientes'
import {
  crearCliente, editarCliente, eliminarCliente, importarClientesCSV, setActivoCliente,
} from './actions'

const inputCls = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-movdi-naranja'
const labelCls = 'mb-1 block font-mono text-[11px] uppercase tracking-wider text-neutral-400'

type DatosForm = {
  nombre: string; razon_social: string; rfc: string; regimen_fiscal: string
  cp_fiscal: string; uso_cfdi: string; persona_moral: boolean | null
  constancia_fiscal_fecha: string; constancia_fiscal_url: string
  domicilio_fiscal: string; domicilio_comercial: string
  firmante_nombre: string; firmante_cargo: string; facultades_doc_url: string
  identificacion_firmante_url: string; correo_notificaciones: string; contacto_correo: string
}
const FORM_VACIO: DatosForm = {
  nombre: '', razon_social: '', rfc: '', regimen_fiscal: '', cp_fiscal: '',
  uso_cfdi: '', persona_moral: null, constancia_fiscal_fecha: '',
  constancia_fiscal_url: '', domicilio_fiscal: '', domicilio_comercial: '',
  firmante_nombre: '', firmante_cargo: '', facultades_doc_url: '',
  identificacion_firmante_url: '', correo_notificaciones: '', contacto_correo: '',
}

export default function ClientesClient({ puedeEditar, esDireccion }: {
  puedeEditar: boolean
  esDireccion: boolean
}) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const [modal, setModal] = useState<{ editar: Cliente | null } | null>(null)
  const [modalCSV, setModalCSV] = useState(false)

  const recargar = useCallback(async () => {
    const sb = createClient()
    const { data, error } = await sb.from('clientes').select('*').order('nombre')
    if (!error) setClientes((data ?? []).map(mapClienteRow))
    setCargando(false)
  }, [])
  // Carga inicial client-side (anon+RLS); setState tras await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void recargar() }, [recargar])

  const lista = useMemo(() => {
    const f = filtro.trim().toLowerCase()
    return clientes
      .filter((c) => (verInactivos ? true : c.activo))
      .filter((c) => !f || c.nombre.toLowerCase().includes(f) || (c.rfc ?? '').toLowerCase().includes(f) || (c.razonSocial ?? '').toLowerCase().includes(f))
  }, [clientes, filtro, verInactivos])

  async function accion(fn: () => Promise<{ ok: boolean; error?: string }>, exito?: string) {
    const r = await fn()
    setAviso(r.ok ? null : r.error ?? 'error')
    setNota(r.ok ? exito ?? null : null)
    await recargar()
    return r.ok
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-neutral-500">movdi · ops</div>
            <h1 className="text-2xl font-bold tracking-tight">🗂 catálogo de clientes</h1>
            <p className="mt-0.5 font-mono text-[11px] text-neutral-500">
              memoria fiscal/legal de OPS — autocompleta facturas y contratos
              {!puedeEditar && ' · solo lectura (edición: área admi y dirección)'}
            </p>
          </div>
          {puedeEditar && (
            <div className="flex gap-2">
              <button onClick={() => setModalCSV(true)} data-testid="btn-importar-csv"
                className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500">
                ⬆ importar CSV
              </button>
              <button onClick={() => setModal({ editar: null })} data-testid="btn-agregar-cliente"
                className="rounded-full bg-movdi-naranja px-4 py-2 text-sm font-medium hover:bg-movdi-naranja/85">
                + agregar cliente
              </button>
            </div>
          )}
        </header>

        {aviso && <p role="alert" className="mt-4 border border-movdi-naranja/40 bg-movdi-naranja/10 px-3 py-2 font-mono text-xs text-movdi-naranja">{aviso}</p>}
        {nota && <p role="status" data-testid="nota-clientes" className="mt-4 border border-movdi-verde/40 bg-movdi-verde/10 px-3 py-2 font-mono text-xs text-movdi-verde">{nota}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <input
            aria-label="buscar cliente"
            placeholder="buscar por nombre, RFC o razón social…"
            className={`${inputCls} max-w-xs`}
            value={filtro} onChange={(e) => setFiltro(e.target.value)}
          />
          <label className="flex cursor-pointer items-center gap-2 font-mono text-[11px] text-neutral-400">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
            ver inactivos
          </label>
          <span className="font-mono text-[11px] text-neutral-600">{lista.length} cliente(s)</span>
        </div>

        <section className="mt-5">
          {cargando && <p className="font-mono text-xs text-neutral-500">cargando…</p>}
          {!cargando && lista.length === 0 && (
            <p className="font-mono text-xs text-neutral-500">
              {clientes.length === 0 ? 'catálogo vacío — la carga inicial se hace con "⬆ importar CSV"' : 'sin resultados con ese filtro'}
            </p>
          )}
          {lista.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-neutral-800">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-900">
                    {['cliente', 'RFC · razón social', 'constancia fiscal', 'firmante', ''].map((h, i) => (
                      <th key={i} className="px-3 py-2 font-mono text-[10px] font-normal uppercase tracking-wider text-neutral-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) => {
                    const vig = constanciaVigente(c.constanciaFiscalFecha)
                    return (
                      <tr key={c.id} data-testid="fila-cliente" className={`border-b border-neutral-800/70 align-top hover:bg-neutral-900/60 ${c.activo ? '' : 'opacity-50'}`}>
                        <td className="px-3 py-2.5">
                          <div className="text-sm font-semibold">{c.nombre} {!c.activo && <span className="font-mono text-[10px] text-neutral-500">· inactivo</span>}</div>
                          {c.personaMoral !== null && (
                            <div className="font-mono text-[10px] text-neutral-500">{c.personaMoral ? 'persona moral' : 'persona física'}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-mono text-[12px] text-neutral-300">{c.rfc ?? '—'}</div>
                          <div className="text-xs text-neutral-500">{c.razonSocial ?? '—'}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {c.constanciaFiscalFecha ? (
                            <span className={`font-mono text-[11px] ${vig === false ? 'text-movdi-naranja' : 'text-neutral-300'}`} data-testid="chip-constancia">
                              {c.constanciaFiscalFecha} {vig === false ? '· ⚠ vencida (>3 meses)' : '· vigente'}
                            </span>
                          ) : <span className="font-mono text-[11px] text-neutral-600">sin dato</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-neutral-400">
                          {c.firmanteNombre ? <>{c.firmanteNombre}{c.firmanteCargo && <span className="text-neutral-600"> · {c.firmanteCargo}</span>}</> : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {puedeEditar && (
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <button data-testid="btn-editar-cliente" onClick={() => setModal({ editar: c })}
                                className="rounded-md border border-neutral-700 px-2 py-0.5 font-mono text-[10px] text-neutral-300 hover:border-neutral-500">
                                editar
                              </button>
                              {/* baja LÓGICA como acción principal (el FK protege el histórico) */}
                              <button data-testid="btn-activo-cliente"
                                onClick={() => accion(() => setActivoCliente({ id: c.id, activo: !c.activo }), c.activo ? `${c.nombre} desactivado` : `${c.nombre} reactivado`)}
                                className="rounded-md border border-neutral-700 px-2 py-0.5 font-mono text-[10px] text-neutral-400 hover:border-neutral-500">
                                {c.activo ? '⏸ desactivar' : '▶ reactivar'}
                              </button>
                              {/* borrado real: solo dirección, solo altas erróneas sin uso */}
                              {esDireccion && !c.activo && (
                                <button data-testid="btn-eliminar-cliente"
                                  onClick={async () => {
                                    if (!confirm(`¿eliminar DEFINITIVAMENTE a ${c.nombre} del catálogo?\n\nsolo funciona si ninguna petición lo usa; para clientes con historial usa "desactivar".`)) return
                                    await accion(() => eliminarCliente({ id: c.id }), 'registro eliminado')
                                  }}
                                  className="rounded-md border border-movdi-naranja/40 px-2 py-0.5 font-mono text-[10px] text-movdi-naranja hover:bg-movdi-naranja/10">
                                  eliminar
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {modal && (
        <ModalCliente
          editar={modal.editar}
          onCerrar={() => setModal(null)}
          onGuardar={async (datos) => {
            const ok = await accion(
              () => (modal.editar ? editarCliente({ id: modal.editar.id, ...datos }) : crearCliente(datos)),
              modal.editar ? 'cliente actualizado' : 'cliente agregado al catálogo',
            )
            if (ok) setModal(null)
            return ok
          }}
        />
      )}
      {modalCSV && (
        <ModalImportCSV
          onCerrar={() => setModalCSV(false)}
          onImportar={async (csv) => {
            const r = await importarClientesCSV({ csv })
            if (!r.ok) { setAviso(r.error); setNota(null); return }
            const d = r.data!
            setAviso(d.errores.length ? `errores: ${d.errores.join(' · ')}` : null)
            setNota(`importados: ${d.insertados}` +
              (d.saltados.length ? ` · saltados (ya existían): ${d.saltados.length}` : '') +
              (d.columnasIgnoradas.length ? ` · columnas ignoradas: ${d.columnasIgnoradas.join(', ')}` : ''))
            await recargar()
            setModalCSV(false)
          }}
        />
      )}
    </main>
  )
}

// ============================================================
function ModalCliente({ editar, onCerrar, onGuardar }: {
  editar: Cliente | null
  onCerrar: () => void
  onGuardar: (d: DatosForm) => Promise<boolean>
}) {
  const [f, setF] = useState<DatosForm>(editar ? {
    nombre: editar.nombre, razon_social: editar.razonSocial ?? '', rfc: editar.rfc ?? '',
    regimen_fiscal: editar.regimenFiscal ?? '', cp_fiscal: editar.cpFiscal ?? '',
    uso_cfdi: editar.usoCfdi ?? '', persona_moral: editar.personaMoral,
    constancia_fiscal_fecha: editar.constanciaFiscalFecha ?? '', constancia_fiscal_url: editar.constanciaFiscalUrl ?? '',
    domicilio_fiscal: editar.domicilioFiscal ?? '', domicilio_comercial: editar.domicilioComercial ?? '',
    firmante_nombre: editar.firmanteNombre ?? '', firmante_cargo: editar.firmanteCargo ?? '',
    facultades_doc_url: editar.facultadesDocUrl ?? '', identificacion_firmante_url: editar.identificacionFirmanteUrl ?? '',
    correo_notificaciones: editar.correoNotificaciones ?? '', contacto_correo: editar.contactoCorreo ?? '',
  } : FORM_VACIO)
  const [err, setErr] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const set = (k: keyof DatosForm) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  const campo = (k: keyof DatosForm, label: string, tipo = 'text', placeholder = '') => (
    <div>
      <label className={labelCls} htmlFor={`cli-${k}`}>{label}</label>
      <input id={`cli-${k}`} type={tipo} className={inputCls} placeholder={placeholder}
        value={(f[k] as string) ?? ''} onChange={set(k)} />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCerrar}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900/90 p-5 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={editar ? 'editar cliente' : 'agregar cliente'}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{editar ? `editar · ${editar.nombre}` : 'agregar cliente'}</h2>
          <button onClick={onCerrar} className="text-neutral-500 hover:text-neutral-200">✕</button>
        </div>
        <div className="space-y-4">
          {campo('nombre', 'nombre comercial / marca (obligatorio)')}
          <div className="border-t border-neutral-800 pt-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500">fiscales (factura)</div>
          <div className="grid grid-cols-2 gap-3">
            {campo('razon_social', 'razón social')}
            {campo('rfc', 'RFC')}
            {campo('regimen_fiscal', 'régimen fiscal', 'text', 'ej: 601 — General de Ley')}
            {campo('cp_fiscal', 'CP fiscal')}
            {campo('uso_cfdi', 'uso CFDI', 'text', 'ej: G03 — Gastos en general')}
            {campo('contacto_correo', 'correo de contacto', 'email')}
          </div>
          <div className="border-t border-neutral-800 pt-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500">legales (contratos)</div>
          <div>
            <span className={labelCls}>¿persona moral?</span>
            <div className="flex gap-3 text-xs">
              {[['sí', true], ['no', false], ['sin dato', null]].map(([lab, val]) => (
                <label key={String(lab)} className="flex cursor-pointer items-center gap-1.5">
                  <input type="radio" name="cli-persona-moral" checked={f.persona_moral === val}
                    onChange={() => setF((s) => ({ ...s, persona_moral: val as boolean | null }))} />
                  {lab}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {campo('constancia_fiscal_fecha', 'fecha de constancia fiscal', 'date')}
            {campo('constancia_fiscal_url', 'constancia (link)', 'url')}
            {campo('domicilio_fiscal', 'domicilio fiscal')}
            {campo('domicilio_comercial', 'domicilio comercial (si difiere)')}
            {campo('firmante_nombre', 'nombre del firmante')}
            {campo('firmante_cargo', 'cargo del firmante')}
            {campo('facultades_doc_url', 'documento de facultades (link)', 'url')}
            {campo('identificacion_firmante_url', 'identificación del firmante (link)', 'url')}
            {campo('correo_notificaciones', 'correo para notificaciones', 'email')}
          </div>
          {err && <p role="alert" className="font-mono text-xs text-movdi-naranja">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
            <button data-testid="btn-guardar-cliente" disabled={guardando}
              onClick={async () => {
                setErr(null)
                if (!f.nombre.trim()) { setErr('el nombre comercial es obligatorio'); return }
                setGuardando(true)
                const ok = await onGuardar(f)
                setGuardando(false)
                if (!ok) setErr('no se pudo guardar — revisa el aviso')
              }}
              className="rounded-full bg-movdi-naranja px-4 py-2 text-xs font-medium hover:bg-movdi-naranja/85 disabled:opacity-50">
              {guardando ? 'guardando…' : editar ? 'guardar cambios' : 'agregar cliente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
function ModalImportCSV({ onCerrar, onImportar }: {
  onCerrar: () => void
  onImportar: (csv: string) => Promise<void>
}) {
  const [csv, setCsv] = useState('')
  const [importando, setImportando] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCerrar}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900/90 p-5 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="importar clientes por CSV">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">⬆ importar clientes (CSV)</h2>
          <button onClick={onCerrar} className="text-neutral-500 hover:text-neutral-200">✕</button>
        </div>
        <p className="mb-2 font-mono text-[11px] text-neutral-500">
          header esperado (solo <strong>nombre</strong> es obligatorio; el orden no importa, columnas extra se ignoran):
        </p>
        <pre className="mb-3 overflow-x-auto border border-neutral-800 bg-neutral-950 p-2 font-mono text-[10px] text-neutral-400">
          {CLIENTE_COLUMNAS_CSV.join(',')}
        </pre>
        <div className="mb-3">
          <label className={labelCls} htmlFor="csv-file">archivo CSV</label>
          <input id="csv-file" type="file" accept=".csv,text/csv" className="text-xs text-neutral-400"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) setCsv(await file.text())
            }} />
        </div>
        <div>
          <label className={labelCls} htmlFor="csv-texto">o pega el contenido</label>
          <textarea id="csv-texto" rows={8} className={`${inputCls} font-mono text-xs`}
            placeholder={'nombre,razon_social,rfc\nURBAN DECAY,Urban Decay México SA de CV,UDM910101ABC'}
            value={csv} onChange={(e) => setCsv(e.target.value)} />
        </div>
        <p className="mt-2 font-mono text-[10px] text-neutral-500">
          las filas cuyo nombre ya existe se saltan — la importación nunca pisa el catálogo.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-300">cancelar</button>
          <button data-testid="btn-csv-confirmar" disabled={importando || !csv.trim()}
            onClick={async () => { setImportando(true); await onImportar(csv); setImportando(false) }}
            className="rounded-full bg-movdi-naranja px-4 py-2 text-xs font-medium hover:bg-movdi-naranja/85 disabled:opacity-50">
            {importando ? 'importando…' : 'importar'}
          </button>
        </div>
      </div>
    </div>
  )
}
