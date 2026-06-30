import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PageHeader, Card, Boton } from '../components/ui'
import { fecha } from '../lib/fecha'

export type Plantilla = {
  id: string
  nombre: string
  tipo: 'visual' | 'texto'
  design_json: unknown
  html: string
  created_at: string
  updated_at: string
}

export default function Plantillas() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Plantilla[]>([])
  const [cargando, setCargando] = useState(true)

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

  return (
    <div>
      <PageHeader titulo="Plantillas" acciones={
        <Boton onClick={() => navigate('/plantillas/nueva')}>+ Nueva plantilla</Boton>
      } />

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : items.length === 0 ? (
        <Card><p className="text-sm text-slate-500">Aún no hay plantillas. Crea la primera.</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">{p.nombre}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  p.tipo === 'visual' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {p.tipo === 'visual' ? 'Visual' : 'Texto'}
                </span>
              </div>
              <div className="mb-3 h-28 overflow-hidden rounded border border-slate-100 bg-slate-50 p-2 text-[10px] text-slate-400"
                   dangerouslySetInnerHTML={{ __html: p.html }} />
              <p className="mb-3 text-xs text-slate-400">
                Actualizada {fecha(p.updated_at)}
              </p>
              <div className="mt-auto flex gap-2">
                <Boton variante="secundario" onClick={() => navigate(`/plantillas/${p.id}`)}>Editar</Boton>
                <button onClick={() => eliminar(p)} className="text-sm text-red-600 hover:underline">Eliminar</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
