import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PageHeader, Card, Boton } from '../components/ui'
import { fecha } from '../lib/fecha'
import { PLANTILLAS_PREDISENADAS } from '../lib/plantillasPredisenadas'
import type { PlantillaPredisenada } from '../lib/plantillasPredisenadas'

export type Plantilla = {
  id: string
  nombre: string
  tipo: 'visual' | 'texto' | 'html'
  design_json: unknown
  html: string
  created_at: string
  updated_at: string
}

const tipoBadge: Record<string, string> = {
  visual: 'bg-indigo-100 text-indigo-700',
  texto: 'bg-emerald-100 text-emerald-700',
  html: 'bg-amber-100 text-amber-700',
}

export default function Plantillas() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [items, setItems] = useState<Plantilla[]>([])
  const [cargando, setCargando] = useState(true)
  const [galeria, setGaleria] = useState(false)
  const [creando, setCreando] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from('plantillas').select('*').order('updated_at', { ascending: false })
    setItems((data as Plantilla[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  async function eliminar(p: Plantilla) {
    if (!confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) return
    await supabase.from('plantillas').delete().eq('id', p.id)
    cargar()
  }

  // Clona una plantilla prediseñada como nueva plantilla editable (tipo texto)
  async function usarPredisenada(pp: PlantillaPredisenada) {
    setCreando(pp.id)
    const { data, error } = await supabase.from('plantillas').insert({
      nombre: pp.nombre, tipo: 'visual', html: pp.html, design_json: pp.design,
      created_by: session?.user.id ?? null,
    }).select('id').single()
    setCreando(null)
    if (!error && data) navigate(`/plantillas/${data.id}`)
  }

  return (
    <div>
      <PageHeader titulo="Plantillas" acciones={
        <>
          <Boton variante="secundario" onClick={() => setGaleria(true)}>✨ Prediseñadas</Boton>
          <Boton onClick={() => navigate('/plantillas/nueva')}>+ Nueva plantilla</Boton>
        </>
      } />

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : items.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">
            Aún no hay plantillas. Crea una desde cero o usa una{' '}
            <button onClick={() => setGaleria(true)} className="font-medium text-[#16468E] hover:underline">
              plantilla prediseñada
            </button>.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">{p.nombre}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tipoBadge[p.tipo]}`}>
                  {p.tipo === 'visual' ? 'Visual' : p.tipo === 'html' ? 'HTML' : 'Texto'}
                </span>
              </div>
              <iframe title={p.nombre} srcDoc={p.html}
                className="mb-3 h-36 w-full rounded border border-slate-100 bg-white" />
              <p className="mb-3 text-xs text-slate-400">Actualizada {fecha(p.updated_at)}</p>
              <div className="mt-auto flex gap-2">
                <Boton variante="secundario" onClick={() => navigate(`/plantillas/${p.id}`)}>Editar</Boton>
                <button onClick={() => eliminar(p)} className="text-sm text-red-600 hover:underline">Eliminar</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Galería de plantillas prediseñadas */}
      {galeria && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4"
             onClick={() => setGaleria(false)}>
          <div className="my-8 w-full max-w-5xl rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between rounded-t-2xl bg-[#0D2D6B] px-6 py-4 text-white">
              <h2 className="font-medium">Plantillas prediseñadas</h2>
              <button onClick={() => setGaleria(false)} className="text-white/80 hover:text-white">✕</button>
            </div>
            <div className="p-6">
              <p className="mb-4 text-sm text-slate-500">
                Elige una plantilla para empezar. Se creará una copia editable en tus plantillas;
                podrás cambiar textos, colores y variables.
              </p>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {PLANTILLAS_PREDISENADAS.map((pp) => (
                  <div key={pp.id} className="flex flex-col overflow-hidden rounded-xl border border-slate-200">
                    <iframe title={pp.nombre} srcDoc={pp.html}
                      className="h-48 w-full border-b border-slate-100 bg-white" />
                    <div className="flex flex-1 flex-col p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="font-semibold text-slate-800">{pp.nombre}</h3>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{pp.categoria}</span>
                      </div>
                      <p className="mb-3 flex-1 text-xs text-slate-500">{pp.descripcion}</p>
                      <Boton onClick={() => usarPredisenada(pp)} disabled={creando === pp.id}>
                        {creando === pp.id ? 'Creando…' : 'Usar esta plantilla'}
                      </Boton>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
