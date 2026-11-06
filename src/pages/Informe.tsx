import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList } from 'recharts'
import { supabase } from '../lib/supabase'
import { PageHeader, Card, MetricCard, Boton, Modal, BarraProgreso } from '../components/ui'
import { exportarEnviosExcel } from '../lib/exportar'
import { fechaHora } from '../lib/fecha'
import { ejecutarEnvio } from '../lib/envioCampania'
import type { Progreso } from '../lib/envioCampania'
import { ETAPAS, alcanzoEtapa, contarEtapas } from '../lib/etapas'

type Envio = {
  id: string; email: string; estado: string
  enviado_at: string | null; error: string | null
}
type Campania = {
  id: string; nombre: string; asunto: string; estado: string; total_destinatarios: number
  en_cola: boolean; error_detalle: string | null
}

const REFRESCO_MS = 10_000
const TAMANO_PAGINA = 1000

export default function Informe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [campania, setCampania] = useState<Campania | null>(null)
  const [envios, setEnvios] = useState<Envio[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<'continuar' | 'reintentar' | null>(null)

  async function reanudar(reintentarFallidos: boolean) {
    if (!id) return
    setConfirmar(null); setEnviando(true); setErrorEnvio(null); setProgreso(null)
    try {
      await ejecutarEnvio(id, setProgreso, { reintentarFallidos })
    } catch (e) {
      setErrorEnvio(e instanceof Error ? e.message : 'Error al enviar')
    } finally {
      setEnviando(false)
      await cargar()
    }
  }

  async function cargar() {
    const { data: c } = await supabase.from('campanias').select('*').eq('id', id).single()
    setCampania(c as Campania)
    // Supabase devuelve 1.000 filas por consulta: se piden por páginas hasta traerlas todas.
    const todos: Envio[] = []
    for (let desde = 0; ; desde += TAMANO_PAGINA) {
      const { data: e } = await supabase.from('envios').select('id,email,estado,enviado_at,error')
        .eq('campania_id', id).order('id').range(desde, desde + TAMANO_PAGINA - 1)
      todos.push(...((e as Envio[]) ?? []))
      if (!e || e.length < TAMANO_PAGINA) break
    }
    setEnvios(todos)
    setCargando(false)
  }
  useEffect(() => { cargar() }, [id])

  // Mientras el servidor envía, el informe se actualiza solo.
  const enSegundoPlano = !!campania?.en_cola && !enviando
  useEffect(() => {
    if (!enSegundoPlano) return
    const intervalo = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(intervalo)
  }, [enSegundoPlano, id])

  const conteos = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of envios) m[e.estado] = (m[e.estado] ?? 0) + 1
    return m
  }, [envios])

  const total = envios.length
  const sinTerminar = (conteos.pendiente ?? 0) + (conteos.enviando ?? 0)
  const fallidos = conteos.fallido ?? 0
  // Entregados/abiertos/clics son acumulativos en el embudo
  const entregadosOMas = (conteos.entregado ?? 0) + (conteos.abierto ?? 0) + (conteos.clic ?? 0)
  const abiertosOMas = (conteos.abierto ?? 0) + (conteos.clic ?? 0)
  // Las tasas se calculan sobre lo que realmente salió, sin omitidos, fallidos ni pendientes.
  const salieron = total - sinTerminar - fallidos - (conteos.omitido ?? 0)
  const pct = (n: number) => salieron ? `${Math.round((n / salieron) * 100)}% de lo enviado` : '—'

  const dataChart = useMemo(() => contarEtapas(envios.map((e) => e.estado)), [envios])

  const filtrados = envios.filter((e) =>
    (!estadoFiltro || alcanzoEtapa(e.estado, estadoFiltro)) &&
    (!filtro || e.email.toLowerCase().includes(filtro.toLowerCase())))

  if (cargando) return <p className="text-slate-400">Cargando…</p>
  if (!campania) return <p className="text-slate-400">Campaña no encontrada.</p>

  return (
    <div>
      <PageHeader titulo={`Informe — ${campania.nombre}`} acciones={
        <>
          <Boton variante="secundario" onClick={() => navigate('/campanias')}>Volver</Boton>
          <Boton variante="secundario" onClick={cargar}>↻ Actualizar</Boton>
          {sinTerminar > 0 && (
            <Boton onClick={() => setConfirmar('continuar')} disabled={enviando}>▶ Continuar envío ({sinTerminar})</Boton>
          )}
          {fallidos > 0 && (
            <Boton onClick={() => setConfirmar('reintentar')} disabled={enviando}>↻ Reintentar fallidos ({fallidos})</Boton>
          )}
          <Boton onClick={() => exportarEnviosExcel(campania.nombre, filtrados)}>Exportar Excel</Boton>
        </>
      } />

      <Modal open={confirmar !== null} onClose={() => setConfirmar(null)}
        titulo={confirmar === 'reintentar' ? 'Reintentar fallidos' : 'Continuar envío'}>
        <p className="text-sm text-slate-600">
          {confirmar === 'reintentar'
            ? `Destinatarios que se reintentarán: ${fallidos + sinTerminar}.`
            : `Destinatarios pendientes por enviar: ${sinTerminar}.`}
          {' '}Quienes ya recibieron el correo no lo recibirán de nuevo.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setConfirmar(null)}>Cancelar</Boton>
          <Boton onClick={() => reanudar(confirmar === 'reintentar')}>Confirmar envío</Boton>
        </div>
      </Modal>

      {campania.error_detalle && !enviando && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          Envío detenido: {campania.error_detalle}
        </p>
      )}
      {enSegundoPlano && (
        <p className="mb-4 rounded-lg bg-blue-50 px-4 py-2 text-sm text-[#16468E]">
          Enviando en el servidor. Puedes cerrar esta ventana; este informe se actualiza solo.
        </p>
      )}

      {enSegundoPlano && (
        <Card className="mb-6">
          <BarraProgreso total={total} pendientes={sinTerminar} fallidos={fallidos} omitidos={conteos.omitido ?? 0}
            enviados={total - sinTerminar - fallidos - (conteos.omitido ?? 0)} />
        </Card>
      )}

      {(enviando || errorEnvio) && (
        <Card className="mb-6">
          {errorEnvio && <p className="mb-2 text-sm text-red-700">{errorEnvio}</p>}
          {progreso && <BarraProgreso {...progreso} />}
          {enviando && <p className="mt-1 text-xs text-slate-400">Si cierras esta ventana, el envío continúa en el servidor.</p>}
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard titulo="Destinatarios" valor={total} />
        <MetricCard titulo="Entregados" valor={entregadosOMas} sub={pct(entregadosOMas)} />
        <MetricCard titulo="Aperturas" valor={abiertosOMas} sub={pct(abiertosOMas)} />
        <MetricCard titulo="Clics" valor={conteos.clic ?? 0} sub={pct(conteos.clic ?? 0)} />
        <MetricCard titulo="Rebotes" valor={conteos.rebote ?? 0} sub={pct(conteos.rebote ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_3fr]">
        <Card className="min-w-0">
          <h3 className="text-sm font-medium text-slate-600">Recorrido de los correos</h3>
          <p className="mb-3 text-xs text-slate-400">
            Cada correo cuenta en todas las etapas que alcanzó: el que recibió un clic también se entregó y se abrió.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={dataChart} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }}>
              <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
              <YAxis type="category" dataKey="label" width={84} interval={0} axisLine={false} tickLine={false}
                tick={{ fontSize: 12, fill: '#475569' }} />
              {/* minPointSize: Recharts no rotula las barras de ancho 0, y aquí debe verse el "0". */}
              <Bar dataKey="valor" barSize={16} radius={[0, 4, 4, 0]} minPointSize={0.01} isAnimationActive={false}>
                {dataChart.map((d) => <Cell key={d.key} fill={d.color} />)}
                <LabelList dataKey="valor" position="right" style={{ fontSize: 12, fill: '#334155' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="min-w-0 p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar correo…"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#16468E]" />
            <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Todos los estados</option>
              {ETAPAS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <span className="text-sm text-slate-400">{filtrados.length} de {total}</span>
          </div>
          <div className="max-h-[340px] overflow-auto">
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
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                      {fechaHora(e.enviado_at)}
                    </td>
                    <td className="px-4 py-2 text-red-600">{e.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
