import { forwardRef, useEffect, useImperativeHandle, useRef, useId } from 'react'

// Integración directa de Unlayer (embed.js), compatible con React 19.
// react-email-editor usa findDOMNode (removido en React 19), por eso usamos
// el SDK embebido y exponemos una API equivalente (exportHtml / loadDesign).

declare global {
  interface Window { unlayer?: any }
}

export type UnlayerRef = {
  exportHtml: (cb: (data: { html: string; design: unknown }) => void) => void
  loadDesign: (design: unknown) => void
}

let scriptPromise: Promise<void> | null = null
function cargarScript(): Promise<void> {
  if (window.unlayer) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://editor.unlayer.com/embed.js'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('No se pudo cargar el editor Unlayer'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

type Props = {
  minHeight?: number
  onReady?: (editor: UnlayerRef) => void
}

const UnlayerEditor = forwardRef<UnlayerRef, Props>(function UnlayerEditor(
  { minHeight = 520, onReady }, ref,
) {
  const containerId = 'unlayer-' + useId().replace(/[:]/g, '')
  const editorRef = useRef<any>(null)

  useImperativeHandle(ref, () => ({
    exportHtml: (cb) => editorRef.current?.exportHtml((d: any) => cb({ html: d.html, design: d.design })),
    loadDesign: (design) => editorRef.current?.loadDesign(design),
  }), [])

  useEffect(() => {
    let cancelado = false
    cargarScript().then(() => {
      if (cancelado) return
      const editor = window.unlayer.createEditor({
        id: containerId,
        displayMode: 'email',
        locale: 'es-ES',
        appearance: { theme: 'modern_light' },
      })
      editorRef.current = editor
      const api: UnlayerRef = {
        exportHtml: (cb) => editor.exportHtml((d: any) => cb({ html: d.html, design: d.design })),
        loadDesign: (design) => editor.loadDesign(design),
      }
      onReady?.(api)
    })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div id={containerId} style={{ height: '100%', minHeight, width: '100%' }} />
})

export default UnlayerEditor
