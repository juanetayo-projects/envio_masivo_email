import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PageHeader, Card, Boton } from '../components/ui'
import { fecha } from '../lib/fecha'

type Campania = {
  id: string
  nombre: string
  asunto: string
  estado: 'borrador' | 'enviando' | 'enviada' | 'error'
  total_destinatarios: number
  created_at: string
  enviada_at: string | null
}

const estadoColor: Record<string, string> = {
  borrador: 'bg-slate-100 text-slate-600',
  enviando: 'bg-amber-100 text-amber-700',
  enviada: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
}

export default function Campanias() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Campania[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.from('campanias').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setItems((data as Campania[]) ?? []); setCargando(false) })
  }, [])

  return (
    <div>
      <PageHeader titulo="Campañas" acciones={
        <Boton onClick={() => navigate('/campanias/nueva')}>+ Nueva campaña</Boton>
      } />

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : items.length === 0 ? (
        <Card><p className="text-sm text-slate-500">Aún no hay campañas. Crea la primera.</p></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                <th className="px-4 py-3 font-medium">Campaña</th>
                <th className="px-4 py-3 font-medium">Destinatarios</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium text-right">Informe</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{c.nombre}</div>
                    <div className="text-xs text-slate-400">{c.asunto}</div>
                  </td>
                  <td className="px-4 py-3">{c.total_destinatarios}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estadoColor[c.estado]}`}>
                      {c.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {fecha(c.enviada_at ?? c.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => navigate(`/campanias/${c.id}/informe`)}
                      className="text-[#16468E] hover:underline">Ver informe →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
