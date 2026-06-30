import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase } from '../lib/supabase'
import { PageHeader, Card, MetricCard, Boton } from '../components/ui'
import { exportarEnviosExcel } from '../lib/exportar'

type Envio = {
  id: string; email: string; estado: string
  enviado_at: string | null; error: string | null
}
type Campania = { id: string; nombre: string; asunto: string; estado: string; total_destinatarios: number }

const ESTADOS = [
  { key: 'enviado', label: 'Enviados', color: '#16468E' },
  { key: 'entregado', label: 'Entregados', color: '#0D9488' },
  { key: 'abierto', label: 'Abiertos', color: '#7C3AED' },
  { key: 'clic', label: 'Clics', color: '#DB2777' },
  { key: 'rebote', label: 'Rebotes', color: '#F59E0B' },
  { key: 'fallido', label: 'Fallidos', color: '#DC2626' },
  { key: 'pendiente', label: 'Pendientes', color: '#94A3B8' },
]

export default function Informe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [campania, setCampania] = useState<Campania | null>(null)
  const [envios, setEnvios] = useState<Envio[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')

  async function cargar() {
    const { data: c } = await supabase.from('campanias').select('*').eq('id', id).single()
    setCampania(c as Campania)
    const { data: e } = await supabase.from('envios').select('id,email,estado,enviado_at,error').eq('campania_id', id)
    setEnvios((e as Envio[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [id])

  const conteos = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of envios) m[e.estado] = (m[e.estado] ?? 0) + 1
    return m
  }, [envios])

  const total = envios.length
  // Entregados/abiertos/clics son acumulativos en el embudo
  const entregadosOMas = (conteos.entregado ?? 0) + (conteos.abierto ?? 0) + (conteos.clic ?? 0)
  const abiertosOMas = (conteos.abierto ?? 0) + (conteos.clic ?? 0)
  const pct = (n: number) => total ? `${Math.round((n / total) * 100)}%` : '—'

  const dataChart = ESTADOS.map((s) => ({ ...s, valor: conteos[s.key] ?? 0 })).filter((d) => d.valor > 0)

  const filtrados = envios.filter((e) =>
    (!estadoFiltro || e.estado === estadoFiltro) &&
    (!filtro || e.email.toLowerCase().includes(filtro.toLowerCase())))

  if (cargando) return <p className="text-slate-400">Cargando…</p>
  if (!campania) return <p className="text-slate-400">Campaña no encontrada.</p>

  return (
    <div>
      <PageHeader titulo={`Informe — ${campania.nombre}`} acciones={
        <>
          <Boton variante="secundario" onClick={() => navigate('/campanias')}>Volver</Boton>
          <Boton variante="secundario" onClick={cargar}>↻ Actualizar</Boton>
          <Boton onClick={() => exportarEnviosExcel(campania.nombre, filtrados)}>Exportar Excel</Boton>
        </>
      } />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard titulo="Destinatarios" valor={total} />
        <MetricCard titulo="Entregados" valor={entregadosOMas} sub={pct(entregadosOMas)} />
        <MetricCard titulo="Aperturas" valor={abiertosOMas} sub={pct(abiertosOMas)} />
        <MetricCard titulo="Clics" valor={conteos.clic ?? 0} sub={pct(conteos.clic ?? 0)} />
      </div>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-slate-600">Distribución por estado</h3>
        {dataChart.length === 0 ? (
          <p className="text-sm text-slate-400">Sin datos aún.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dataChart}>
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {dataChart.map((d) => <Cell key={d.key} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar correo…"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#16468E]" />
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Todos los estados</option>
            {ESTADOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <span className="text-sm text-slate-400">{filtrados.length} de {total}</span>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Correo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Enviado</th>
                <th className="px-4 py-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{e.email}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{e.estado}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {e.enviado_at ? new Date(e.enviado_at).toLocaleString('es-CO') : '—'}
                  </td>
                  <td className="px-4 py-2 text-red-600">{e.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
