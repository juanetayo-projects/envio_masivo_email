import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { PageHeader, MetricCard, Card } from '../components/ui'

type Metricas = {
  campanias: number; enviados: number; entregados: number; abiertos: number; clics: number
  rebotes: number; fallidos: number; omitidos: number
  por_mes: { mes: string; enviados: number; entregados: number }[]
}

const tooltipOscuro = {
  contentStyle: { background: '#0D2D6B', border: 'none', borderRadius: 10, color: '#fff', fontSize: 12 },
  itemStyle: { color: '#fff' },
  labelStyle: { color: '#EAF0FA' },
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function nombreMes(mes: string) {
  const [anio, m] = mes.split('-')
  return `${MESES[Number(m) - 1]} ${anio.slice(2)}`
}

export default function Dashboard() {
  const [m, setM] = useState<Metricas | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('metricas_campanias').then(({ data, error }) => {
      if (error) setError('No se pudieron cargar las métricas: ' + error.message)
      else setM(data as Metricas)
    })
  }, [])

  const valor = (n?: number) => (m ? n ?? 0 : '…')
  const tasa = (n: number) => (m?.enviados ? `${Math.round((n / m.enviados) * 100)}% de lo enviado` : '')
  const datosMes = (m?.por_mes ?? []).map((d) => ({ ...d, mes: nombreMes(d.mes) }))

  return (
    <div>
      <PageHeader titulo="Dashboard" />
      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard titulo="Campañas enviadas" valor={valor(m?.campanias)} />
        <MetricCard titulo="Correos enviados" valor={valor(m?.enviados)} />
        <MetricCard titulo="Entregados" valor={valor(m?.entregados)} sub={m ? tasa(m.entregados) : ''} />
        <MetricCard titulo="Aperturas" valor={valor(m?.abiertos)} sub={m ? tasa(m.abiertos) : ''} />
        <MetricCard titulo="Clics" valor={valor(m?.clics)} sub={m ? tasa(m.clics) : ''} />
        <MetricCard titulo="Rebotes" valor={valor(m?.rebotes)} sub={m ? tasa(m.rebotes) : ''} />
      </div>

      <Card className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-slate-600">Envíos por mes (últimos 12 meses)</h3>
        {datosMes.length === 0 ? (
          <p className="text-sm text-slate-400">{m ? 'Sin envíos todavía.' : 'Cargando…'}</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={datosMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip {...tooltipOscuro} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="enviados" name="Enviados" fill="#16468E" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="entregados" name="Entregados" fill="#0D9488" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  )
}
