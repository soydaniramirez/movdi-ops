'use client'

// "descargar pdf" del organigrama (2026-10-19): sin librería — abre el diálogo
// de impresión del navegador (guardar como PDF) con las reglas @media print de
// globals.css (hoja horizontal, fondo blanco). Antes de imprimir mide el árbol
// y fija --org-escala para que quepa a lo ancho de la hoja, y estampa la fecha
// de generación en el encabezado impreso.

// ancho útil de una hoja carta/A4 horizontal con 10mm de margen, en px CSS
const ANCHO_HOJA_PX = 1000

export default function BotonPdf() {
  return (
    <button
      type="button"
      data-testid="btn-descargar-pdf"
      onClick={() => {
        const arbol = document.querySelector<HTMLElement>('.org-print .org-arbol')
        const ancho = arbol?.scrollWidth ?? 0
        const escala = ancho > ANCHO_HOJA_PX ? ANCHO_HOJA_PX / ancho : 1
        const raiz = document.querySelector<HTMLElement>('.org-print')
        raiz?.style.setProperty('--org-escala', escala.toFixed(3))
        const fecha = document.querySelector<HTMLElement>('[data-testid="org-fecha-pdf"]')
        if (fecha) {
          fecha.textContent = 'generado el ' + new Date().toLocaleString('es-MX', {
            dateStyle: 'long', timeStyle: 'short',
          })
        }
        document.body.classList.add('imprimiendo-org')
        const limpiar = () => {
          document.body.classList.remove('imprimiendo-org')
          window.removeEventListener('afterprint', limpiar)
        }
        window.addEventListener('afterprint', limpiar)
        window.print()
      }}
      className="shrink-0 rounded-full border border-neutral-700 px-3 py-1.5 font-mono text-[11px] text-neutral-300 transition-colors hover:border-movdi-naranja/60 hover:text-movdi-naranja print:hidden"
    >
      ⤓ descargar pdf
    </button>
  )
}
