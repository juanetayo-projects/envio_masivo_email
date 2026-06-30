import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import UnlayerEditor from '../components/UnlayerEditor'
import type { UnlayerRef } from '../components/UnlayerEditor'
import { saveAs } from 'file-saver'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PageHeader, Boton, Card } from '../components/ui'
import RichText from '../components/RichText'

type Tipo = 'visual' | 'texto' | 'html'

// Variables sugeridas (las columnas reales del Excel se aplican en la campaña).
const VARIABLES_SUGERIDAS = ['email', 'nombre']

export default function EditorPlantilla() {
  const { id } = useParams()
  const esNuevo = !id || id === 'nueva'
  const navigate = useNavigate()
  const { session } = useAuth()

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<Tipo>('visual')
  const [htmlTexto, setHtmlTexto] = useState('<p>Hola {{nombre}},</p><p>Escribe aquí tu mensaje.</p>')
  const [cargando, setCargando] = useState(!esNuevo)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const unlayerRef = useRef<UnlayerRef | null>(null)
  const designPendiente = useRef<unknown>(null)

  useEffect(() => {
    if (esNuevo) return
    ;(async () => {
      const { data } = await supabase.from('plantillas').select('*').eq('id', id).single()
      if (data) {
        setNombre(data.nombre)
        setTipo(data.tipo)
        if (data.tipo === 'visual') designPendiente.current = data.design_json
        else setHtmlTexto(data.html)   // 'texto' y 'html' guardan el HTML directo
      }
      setCargando(false)
    })()
  }, [id, esNuevo])

  function onReadyUnlayer(api: UnlayerRef) {
    unlayerRef.current = api
    if (designPendiente.current) {
      api.loadDesign(designPendiente.current)
      designPendiente.current = null
    }
  }

  // Exporta el HTML+design del editor visual (promesa)
  function exportarVisual(): Promise<{ html: string; design: unknown }> {
    return new Promise((resolve) => {
      if (!unlayerRef.current) return resolve({ html: htmlTexto, design: null })
      unlayerRef.current.exportHtml((data) => resolve({ html: data.html, design: data.design }))
    })
  }

  // Devuelve el HTML final según el modo activo (para exportar/copiar)
  async function obtenerHtml(): Promise<string> {
    if (tipo === 'visual') return (await exportarVisual()).html
    return htmlTexto
  }

  async function guardar() {
    if (!nombre.trim()) { setMsg('Ponle un nombre a la plantilla.'); return }
    setGuardando(true); setMsg(null)

    let html = htmlTexto
    let design_json: unknown = null
    if (tipo === 'visual') {
      const r = await exportarVisual()
      html = r.html; design_json = r.design
    }

    const payload = {
      nombre: nombre.trim(), tipo, html, design_json,
      created_by: session?.user.id ?? null,
    }
    const res = esNuevo
      ? await supabase.from('plantillas').insert(payload).select('id').single()
      : await supabase.from('plantillas').update(payload).eq('id', id).select('id').single()

    setGuardando(false)
    if (res.error) { setMsg('Error al guardar: ' + res.error.message); return }
    setMsg('Plantilla guardada.')
    if (esNuevo && res.data) navigate(`/plantillas/${res.data.id}`, { replace: true })
  }

  async function exportarHtml() {
    const html = await obtenerHtml()
    // Si ya es un documento completo, no lo envolvemos de nuevo
    const doc = /<html[\s>]/i.test(html)
      ? html
      : `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`
    saveAs(new Blob([doc], { type: 'text/html;charset=utf-8' }),
      `${nombre.trim() || 'plantilla'}.html`)
  }

  async function copiarHtml() {
    const html = await obtenerHtml()
    await navigator.clipboard.writeText(html)
    setMsg('HTML copiado al portapapeles (pégalo en Gmail).')
  }

  if (cargando) return <p className="text-slate-400">Cargando…</p>

  return (
    <div>
      <PageHeader titulo={esNuevo ? 'Nueva plantilla' : 'Editar plantilla'} acciones={
        <>
          <Boton variante="secundario" onClick={() => navigate('/plantillas')}>Volver</Boton>
          <Boton variante="secundario" onClick={copiarHtml}>Copiar HTML</Boton>
          <Boton variante="secundario" onClick={exportarHtml}>Exportar .html</Boton>
          <Boton onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
        </>
      } />

      {msg && <p className="mb-3 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">{msg}</p>}

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[240px]">
          <label className="mb-1 block text-sm font-medium text-slate-700">Nombre de la plantilla</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                       outline-none focus:border-[#16468E] focus:ring-1 focus:ring-[#16468E]"
            placeholder="Ej. Recordatorio de cita" />
        </div>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
          {(['visual', 'texto', 'html'] as Tipo[]).map((t) => (
            <button key={t} onClick={() => setTipo(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tipo === t ? 'bg-[#0D2D6B] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {t === 'visual' ? '🎨 Visual' : t === 'texto' ? '✍️ Texto' : '</> HTML'}
            </button>
          ))}
        </div>
      </div>

      <Card className="mb-3 bg-amber-50 p-3 text-xs text-amber-800">
        💡 Usa variables como <code className="rounded bg-white px-1">{'{{nombre}}'}</code>,{' '}
        <code className="rounded bg-white px-1">{'{{email}}'}</code> o cualquier{' '}
        <code className="rounded bg-white px-1">{'{{columna}}'}</code> de tu Excel. Se reemplazan por destinatario al enviar.
      </Card>

      {/* Mantener ambos montados; ocultar el inactivo para no perder estado del editor visual */}
      <div style={{ display: tipo === 'visual' ? 'block' : 'none' }}>
        <div className="h-[calc(100vh-210px)] min-h-[420px] w-full overflow-hidden rounded-lg border border-slate-300">
          <UnlayerEditor ref={unlayerRef} onReady={onReadyUnlayer} minHeight={420} />
        </div>
      </div>
      <div style={{ display: tipo === 'texto' ? 'block' : 'none' }}>
        <RichText value={htmlTexto} onChange={setHtmlTexto} variables={VARIABLES_SUGERIDAS} />
      </div>
      {tipo === 'html' && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Código HTML</p>
            <textarea value={htmlTexto} onChange={(e) => setHtmlTexto(e.target.value)} spellCheck={false}
              className="h-[calc(100vh-260px)] min-h-[360px] w-full rounded-lg border border-slate-300 p-3
                         font-mono text-xs outline-none focus:border-[#16468E]"
              placeholder="Pega o escribe tu HTML aquí…" />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Vista previa</p>
            <iframe title="preview-html" srcDoc={htmlTexto}
              className="h-[calc(100vh-260px)] min-h-[360px] w-full rounded-lg border border-slate-300 bg-white" />
          </div>
        </div>
      )}
    </div>
  )
}
