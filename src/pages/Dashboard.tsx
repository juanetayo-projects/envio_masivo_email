import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { PageHeader, MetricCard, Panel, Segmentado, Boton, TableHead, filaZebra } from '../components/ui'
import MapaCalor from '../components/MapaCalor'
import { RANGOS, hoyEnColombia, rangoDesde } from '../lib/rangos'
import type { ClaveRango } from '../lib/rangos'

type PorCampania = { id: string; nombre: string; enviados: number; entregados: number; abiertos: number; clics: number; rebotes: number }
type Metricas = {
  campanias: number; destinatarios: number; enviados: number; entregados: number; abiertos: number; clics: number
  rebotes: number; fallidos: number; omitidos: number; pendientes: number; bajas: number
  por_dia: { dia: string; enviados: number; entregados: number }[]
  calor: { metrica: Metrica; dia: number; hora: number; n: number }[]
  por_campania: PorCampania[]
  por_dominio: { dominio: string; enviados: number; rebotes: number }[]
}
type Metrica = 'envios' | 'aperturas' | 'clics'
type Opcion = { id: string; nombre: string; remitente_email: string }

const METRICAS_CALOR: { clave: Metrica; etiqueta: string; unidad: string }[] = [
  { clave: 'envios', etiqueta: 'Envíos', unidad: 'envíos' },
  { clave: 'aperturas', etiqueta: 'Aperturas', unidad: 'aperturas' },
  { clave: 'clics', etiqueta: 'Clics', unidad: 'clics' },
]
// #16468E queda fuera del rango de luminosidad validado para series de gráficas.
const AZUL = '#2563B8'
const VERDE = '#0D9488'
const tooltipOscuro = {
  contentStyle: { background: '#0D2D6B', border: 'none', borderRadius: 10, color: '#fff', fontSize: 12 },
  itemStyle: { color: '#fff' },
  labelStyle: { color: '#EAF0FA' },
  cursor: { fill: 'rgba(13,45,107,0.06)' },
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS_PARA_AGRUPAR_POR_MES = 62
const campo = 'rounded-lg border border-panel-borde bg-white px-3 py-1.5 text-sm outline-none focus:border-[#16468E]'
const etiquetaCampo = 'text-xs font-medium text-panel-suave'
const ejeTick = { fontSize: 11, fill: '#475569' }
const ALTO_GRAFICA = 210

const pct = (n: number, base: number) => (base ? `${Math.round((n / base) * 100)}%` : '—')

// Con pocos días se ve por día; en periodos largos, por mes.
function agruparSerie(porDia: Metricas['por_dia']) {
  if (porDia.length === 0) return { datos: [], titulo: 'Envíos' }
  const inicio = new Date(porDia[0].dia + 'T00:00:00Z').getTime()
  const fin = new Date(porDia[porDia.length - 1].dia + 'T00:00:00Z').getTime()
  if ((fin - inicio) / 86_400_000 <= DIAS_PARA_AGRUPAR_POR_MES) {
    return {
      titulo: 'Envíos por día',
      datos: porDia.map((d) => {
        const [, m, dia] = d.dia.split('-')
        return { etiqueta: `${Number(dia)} ${MESES[Number(m) - 1]}`, enviados: d.enviados, entregados: d.entregados }
      }),
    }
  }
  const meses = new Map<string, { etiqueta: string; enviados: number; entregados: number }>()
  for (const d of porDia) {
    const [anio, m] = d.dia.split('-')
    const clave = `${anio}-${m}`
    const actual = meses.get(clave) ?? { etiqueta: `${MESES[Number(m) - 1]} ${anio.slice(2)}`, enviados: 0, entregados: 0 }
    actual.enviados += d.enviados
    actual.entregados += d.entregados
    meses.set(clave, actual)
  }
  return { titulo: 'Envíos por mes', datos: [...meses.values()] }
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-panel-suave">{children}</p>
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [campania, setCampania] = useState('')
  const [remitente, setRemitente] = useState('')
  const [opciones, setOpciones] = useState<Opcion[]>([])
  const [m, setM] = useState<Metricas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metricaCalor, setMetricaCalor] = useState<Metrica>('envios')

  useEffect(() => {
    supabase.from('campanias').select('id, nombre, remitente_email').order('created_at', { ascending: false })
      .then(({ data }) => setOpciones((data as Opcion[]) ?? []))
  }, [])

  useEffect(() => {
    let vigente = true
    setCargando(true)
    supabase.rpc('metricas_campanias', {
      p_desde: desde || null, p_hasta: hasta || null, p_campania: campania || null, p_remitente: remitente || null,
    }).then(({ data, error }) => {
      if (!vigente) return   // ya cambiaron los filtros: esta respuesta quedó vieja
      if (error) setError('No se pudieron cargar las métricas: ' + error.message)
      else { setError(null); setM(data as Metricas) }
      setCargando(false)
    })
    return () => { vigente = false }
  }, [desde, hasta, campania, remitente])

  const remitentes = useMemo(() => [...new Set(opciones.map((o) => o.remitente_email))].sort(), [opciones])
  const campaniasVisibles = useMemo(
    () => opciones.filter((o) => !remitente || o.remitente_email === remitente),
    [opciones, remitente],
  )
  const serie = useMemo(() => agruparSerie(m?.por_dia ?? []), [m])
  const unidadCalor = METRICAS_CALOR.find((x) => x.clave === metricaCalor)!.unidad
  const celdasCalor = useMemo(() => (m?.calor ?? []).filter((c) => c.metrica === metricaCalor), [m, metricaCalor])

  const hayFiltros = !!(desde || hasta || campania || remitente)
  const rangoInvalido = !!(desde && hasta && desde > hasta)
  const enviados = m?.enviados ?? 0

  const embudo = m ? [
    { etapa: 'Enviados', valor: m.enviados, nota: '100%' },
    { etapa: 'Entregados', valor: m.entregados, nota: pct(m.entregados, m.enviados) },
    { etapa: 'Abiertos', valor: m.abiertos, nota: pct(m.abiertos, m.enviados) },
    { etapa: 'Clics', valor: m.clics, nota: pct(m.clics, m.enviados) },
  ] : []

  const resultados = m ? [
    { estado: 'Entregados', valor: m.entregados, color: VERDE },
    { estado: 'Sin confirmar', valor: Math.max(0, m.enviados - m.entregados - m.rebotes), color: '#64748B' },
    { estado: 'Rebotes', valor: m.rebotes, color: '#B45309' },
    { estado: 'Fallidos', valor: m.fallidos, color: '#DC2626' },
    { estado: 'Omitidos', valor: m.omitidos, color: '#334155' },
    { estado: 'Pendientes', valor: m.pendientes, color: '#475569' },
  ].filter((r) => r.valor > 0) : []

  const valor = (n?: number) => (m ? n ?? 0 : '…')
  const tasa = (n: number) => (enviados ? Math.round((n / enviados) * 100) : 0)

  const hoy = hoyEnColombia()
  const rangoActivo = RANGOS.find((r) => {
    const x = rangoDesde(r.clave, hoy)
    return x.desde === desde && x.hasta === hasta
  })?.clave ?? null
  function elegirRango(clave: ClaveRango) {
    const x = rangoDesde(clave, hoy)
    setDesde(x.desde)
    setHasta(x.hasta)
  }

  return (
    <div>
      <PageHeader titulo="Dashboard" acciones={
        <Segmentado etiqueta="Rango de fechas" opciones={RANGOS} valor={rangoActivo} onChange={elegirRango} />
      } />

      <Panel className="mb-4" cuerpoClassName="!pt-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className={etiquetaCampo}>Desde
            <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className={`${campo} mt-1 block`} />
          </label>
          <label className={etiquetaCampo}>Hasta
            <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className={`${campo} mt-1 block`} />
          </label>
          <label className={etiquetaCampo}>Remitente
            <select value={remitente} className={`${campo} mt-1 block max-w-[240px]`} onChange={(e) => {
              setRemitente(e.target.value)
              setCampania('')   // la campaña elegida podría no ser de ese remitente
            }}>
              <option value="">Todos</option>
              {remitentes.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className={etiquetaCampo}>Campaña
            <select value={campania} onChange={(e) => setCampania(e.target.value)} className={`${campo} mt-1 block max-w-[260px]`}>
              <option value="">Todas</option>
              {campaniasVisibles.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </label>
          {hayFiltros && (
            <Boton variante="secundario" onClick={() => { setDesde(''); setHasta(''); setCampania(''); setRemitente('') }}>
              Limpiar filtros
            </Boton>
          )}
          {cargando && <span className="pb-2 text-xs text-panel-suave">Actualizando…</span>}
        </div>
      </Panel>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {rangoInvalido && <p className="mb-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">La fecha inicial es posterior a la final.</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard titulo="Campañas enviadas" valor={valor(m?.campanias)} />
        <MetricCard titulo="Correos enviados" valor={valor(m?.enviados)} sub={m ? `de ${m.destinatarios} destinatarios` : ''} />
        <MetricCard titulo="Tasa de entrega" valor={m ? pct(m.entregados, enviados) : '…'} sub={m ? `${m.entregados} entregados` : ''} porcentaje={m ? tasa(m.entregados) : undefined} />
        <MetricCard titulo="Tasa de apertura" valor={m ? pct(m.abiertos, enviados) : '…'} sub={m ? `${m.abiertos} aperturas` : ''} porcentaje={m ? tasa(m.abiertos) : undefined} />
        <MetricCard titulo="Tasa de clics" valor={m ? pct(m.clics, enviados) : '…'} sub={m ? `${m.clics} clics` : ''} porcentaje={m ? tasa(m.clics) : undefined} />
        <MetricCard titulo="Tasa de rebote" valor={m ? pct(m.rebotes, enviados) : '…'} sub={m ? `${m.rebotes} rebotes` : ''} porcentaje={m ? tasa(m.rebotes) : undefined} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
        {[
          { t: 'Fallidos', v: m?.fallidos },
          { t: 'Omitidos por bloqueo', v: m?.omitidos },
          { t: 'Pendientes', v: m?.pendientes },
          { t: campania || remitente ? 'Bajas (todas las campañas)' : 'Bajas', v: m?.bajas },
        ].map((x) => (
          <div key={x.t} className="flex items-center justify-between gap-3 rounded-xl border border-panel-borde bg-panel px-4 py-2.5 shadow-sm">
            <span className="text-panel-suave">{x.t}</span>
            <span className="text-lg font-semibold text-panel-texto">{valor(x.v)}</span>
          </div>
        ))}
      </div>

      {m && m.enviados > 0 && m.abiertos === 0 && m.clics === 0 && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
          No hay aperturas ni clics registrados. Si ya abriste alguno de estos correos, revisa en Resend que el seguimiento de aperturas y clics esté activo en el dominio.
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel titulo="Embudo" descripcion="Porcentaje sobre lo enviado">
          {enviados === 0 ? <Vacio>Sin envíos en este periodo.</Vacio> : (
            <ResponsiveContainer width="100%" height={ALTO_GRAFICA}>
              <BarChart data={embudo} layout="vertical" margin={{ top: 0, right: 66, bottom: 0, left: 0 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="etapa" width={68} tick={ejeTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipOscuro} formatter={(v) => [String(v), 'Correos']} />
                <Bar dataKey="valor" fill={AZUL} barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  <LabelList position="right"
                    content={(p) => {
                      const { x, y, width, height, index } = p as { x: number; y: number; width: number; height: number; index: number }
                      const f = embudo[index]
                      return <text x={x + width + 6} y={y + height / 2 + 4} fontSize={11} fill="#0F172A">{f.valor} · {f.nota}</text>
                    }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel titulo="Resultado de los envíos" descripcion="Estado actual de cada destinatario">
          {resultados.length === 0 ? <Vacio>Sin envíos en este periodo.</Vacio> : (
            <ResponsiveContainer width="100%" height={ALTO_GRAFICA}>
              <BarChart data={resultados} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="estado" width={104} tick={ejeTick} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipOscuro} formatter={(v) => [String(v), 'Correos']} />
                <Bar dataKey="valor" barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {resultados.map((r) => <Cell key={r.estado} fill={r.color} />)}
                  <LabelList dataKey="valor" position="right" fontSize={11} fill="#0F172A" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel titulo={serie.titulo} descripcion="Enviados y entregados">
          {serie.datos.length === 0 ? <Vacio>Sin envíos en este periodo.</Vacio> : (
            <ResponsiveContainer width="100%" height={ALTO_GRAFICA}>
              <BarChart data={serie.datos} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#C9D6E8" vertical={false} />
                <XAxis dataKey="etiqueta" tick={ejeTick} axisLine={false} tickLine={false} minTickGap={12} />
                <YAxis allowDecimals={false} tick={ejeTick} width={30} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipOscuro} />
                <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="enviados" name="Enviados" fill={AZUL} maxBarSize={22} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="entregados" name="Entregados" fill={VERDE} maxBarSize={22} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel className="mt-4" titulo="Actividad por día y hora" descripcion="Hora de Colombia"
        accion={<Segmentado etiqueta="Métrica del mapa de calor" opciones={METRICAS_CALOR} valor={metricaCalor} onChange={setMetricaCalor} />}>
        <MapaCalor celdas={celdasCalor} unidad={unidadCalor} />
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" titulo="Últimas campañas del periodo" descripcion="Abre una fila para ver su informe">
          <div className="overflow-x-auto rounded-lg border border-panel-borde bg-white">
            <table className="w-full text-sm">
              <TableHead>
                <th>Campaña</th><th className="text-right">Enviados</th><th className="text-right">Entrega</th>
                <th className="text-right">Apertura</th><th className="text-right">Clics</th><th className="text-right">Rebote</th>
              </TableHead>
              <tbody>
                {(m?.por_campania ?? []).map((c, i) => (
                  <tr key={c.id} className={`${filaZebra(i)} cursor-pointer`} onClick={() => navigate(`/campanias/${c.id}/informe`)}>
                    <td className="px-4 py-2 font-medium text-[#16468E]">{c.nombre}</td>
                    <td className="px-4 py-2 text-right">{c.enviados}</td>
                    <td className="px-4 py-2 text-right">{pct(c.entregados, c.enviados)}</td>
                    <td className="px-4 py-2 text-right">{pct(c.abiertos, c.enviados)}</td>
                    <td className="px-4 py-2 text-right">{pct(c.clics, c.enviados)}</td>
                    <td className="px-4 py-2 text-right">{pct(c.rebotes, c.enviados)}</td>
                  </tr>
                ))}
                {m && m.por_campania.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Sin campañas en este periodo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel titulo="Principales dominios" descripcion="Por correos enviados">
          <div className="overflow-x-auto rounded-lg border border-panel-borde bg-white">
            <table className="w-full text-sm">
              <TableHead><th>Dominio</th><th className="text-right">Enviados</th><th className="text-right">Rebote</th></TableHead>
              <tbody>
                {(m?.por_dominio ?? []).map((d, i) => (
                  <tr key={d.dominio} className={filaZebra(i)}>
                    <td className="break-all px-4 py-2">{d.dominio}</td>
                    <td className="px-4 py-2 text-right">{d.enviados}</td>
                    <td className="px-4 py-2 text-right">{pct(d.rebotes, d.enviados)}</td>
                  </tr>
                ))}
                {m && m.por_dominio.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">Sin datos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  )
}
