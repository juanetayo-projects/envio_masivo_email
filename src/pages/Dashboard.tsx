import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PageHeader, MetricCard, Card } from '../components/ui'

export default function Dashboard() {
  const [m, setM] = useState({ campanias: 0, enviados: 0, aperturas: 0, clics: 0 })
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    (async () => {
      const { count: campanias } = await supabase.from('campanias')
        .select('*', { count: 'exact', head: true }).eq('estado', 'enviada')
      const { data: envios } = await supabase.from('envios').select('estado')
      const enviados = envios?.filter((e) => e.estado !== 'pendiente' && e.estado !== 'fallido').length ?? 0
      const aperturas = envios?.filter((e) => e.estado === 'abierto' || e.estado === 'clic').length ?? 0
      const clics = envios?.filter((e) => e.estado === 'clic').length ?? 0
      setM({ campanias: campanias ?? 0, enviados, aperturas, clics })
      setCargando(false)
    })()
  }, [])

  const pct = (n: number) => m.enviados ? `${Math.round((n / m.enviados) * 100)}%` : '—'

  return (
    <div>
      <PageHeader titulo="Dashboard" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard titulo="Campañas enviadas" valor={cargando ? '…' : m.campanias} />
        <MetricCard titulo="Correos enviados" valor={cargando ? '…' : m.enviados} />
        <MetricCard titulo="Aperturas" valor={cargando ? '…' : m.aperturas} sub={cargando ? '' : pct(m.aperturas)} />
        <MetricCard titulo="Clics" valor={cargando ? '…' : m.clics} sub={cargando ? '' : pct(m.clics)} />
      </div>
      <Card className="mt-6">
        <p className="text-sm text-slate-500">
          Bienvenido al sistema de envío masivo de correos de CAC Santa Bárbara.
          Crea una plantilla, importa tu Excel de destinatarios y lanza tu campaña.
        </p>
      </Card>
    </div>
  )
}
