import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PageHeader, Card, Boton } from '../components/ui'
import { leerExcel, descargarPlantillaEjemplo } from '../lib/excel'
import type { ResultadoImport } from '../lib/excel'
import { fusionar, variablesFaltantes } from '../lib/merge'
import type { Plantilla } from './Plantillas'

type Adjunto = { nombre: string; path: string; mime: string; size: number }
const PASOS = ['Datos', 'Destinatarios (Excel)', 'Adjuntos', 'Revisión', 'Envío']

export default function NuevaCampania() {
  const navigate = useNavigate()
  const { session } = useAuth()

  const [paso, setPaso] = useState(0)
  const [plantillasList, setPlantillasList] = useState<Plantilla[]>([])

  // Paso 1
  const [nombre, setNombre] = useState('')
  const [asunto, setAsunto] = useState('')
  const [plantillaId, setPlantillaId] = useState('')

  // Paso 2
  const [excel, setExcel] = useState<ResultadoImport | null>(null)
  const [excelNombre, setExcelNombre] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  // Paso 3
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const adjInput = useRef<HTMLInputElement>(null)
  const tempId = useMemo(() => crypto.randomUUID(), [])

  // Paso 5
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ enviados: number; fallidos: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('plantillas').select('*').order('updated_at', { ascending: false })
      .then(({ data }) => setPlantillasList((data as Plantilla[]) ?? []))
  }, [])

  const plantilla = plantillasList.find((p) => p.id === plantillaId)
  const faltantes = useMemo(() => {
    if (!plantilla || !excel) return []
    const texto = plantilla.html + ' ' + asunto
    return variablesFaltantes(texto, excel.columnas)
  }, [plantilla, asunto, excel])

  async function onExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setExcelNombre(f.name)
    try { setExcel(await leerExcel(f)) }
    catch { setError('No se pudo leer el archivo. ¿Es un .xlsx válido?') }
  }

  async function onAdjuntos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setSubiendo(true); setError(null)
    const nuevos: Adjunto[] = []
    for (const f of files) {
      const path = `${tempId}/${f.name}`
      const { error } = await supabase.storage.from('adjuntos-campanias').upload(path, f, { upsert: true })
      if (error) { setError('Error subiendo ' + f.name + ': ' + error.message); continue }
      nuevos.push({ nombre: f.name, path, mime: f.type, size: f.size })
    }
    setAdjuntos((a) => [...a, ...nuevos])
    setSubiendo(false)
    if (adjInput.current) adjInput.current.value = ''
  }

  async function quitarAdjunto(a: Adjunto) {
    await supabase.storage.from('adjuntos-campanias').remove([a.path])
    setAdjuntos((arr) => arr.filter((x) => x.path !== a.path))
  }

  async function enviar() {
    if (!plantilla || !excel) return
    setEnviando(true); setError(null)
    // 1) crear campaña
    const { data: camp, error: ce } = await supabase.from('campanias').insert({
      nombre, asunto, plantilla_id: plantillaId,
      adjuntos, total_destinatarios: excel.filas.length,
      estado: 'borrador', created_by: session?.user.id ?? null,
    }).select('id').single()
    if (ce || !camp) { setEnviando(false); setError('No se pudo crear la campaña: ' + ce?.message); return }

    // 2) crear envíos (lotes de 500 en insert)
    const rows = excel.filas.map((f) => ({ campania_id: camp.id, email: f.email, datos: f.datos }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error: ee } = await supabase.from('envios').insert(rows.slice(i, i + 500))
      if (ee) { setEnviando(false); setError('Error creando envíos: ' + ee.message); return }
    }

    // 3) invocar envío
    const { data, error: fe } = await supabase.functions.invoke('enviar-campania', {
      body: { campania_id: camp.id },
    })
    setEnviando(false)
    if (fe || data?.error) { setError(data?.error ?? fe?.message ?? 'Error al enviar'); return }
    setResultado({ enviados: data.enviados, fallidos: data.fallidos })
  }

  const puedeAvanzar = () => {
    if (paso === 0) return nombre.trim() && asunto.trim() && plantillaId
    if (paso === 1) return excel && excel.filas.length > 0
    return true
  }

  return (
    <div className="max-w-4xl">
      <PageHeader titulo="Nueva campaña" />

      {/* Stepper */}
      <div className="mb-6 flex items-center gap-2 text-sm">
        {PASOS.map((p, i) => (
          <div key={p} className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
              i === paso ? 'bg-[#0D2D6B] text-white' : i < paso ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {i < paso ? '✓' : i + 1}
            </span>
            <span className={i === paso ? 'font-medium text-[#0D2D6B]' : 'text-slate-400'}>{p}</span>
            {i < PASOS.length - 1 && <span className="text-slate-300">—</span>}
          </div>
        ))}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <Card>
        {/* PASO 1 — Datos */}
        {paso === 0 && (
          <div className="space-y-4">
            <Field label="Nombre de la campaña">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls}
                placeholder="Ej. Recordatorio citas julio" />
            </Field>
            <Field label="Asunto del correo (admite variables {{...}})">
              <input value={asunto} onChange={(e) => setAsunto(e.target.value)} className={inputCls}
                placeholder="Recordatorio de su cita, {{nombre}}" />
            </Field>
            <Field label="Plantilla">
              <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)} className={inputCls}>
                <option value="">— Selecciona una plantilla —</option>
                {plantillasList.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.tipo})</option>)}
              </select>
            </Field>
            {plantillasList.length === 0 && (
              <p className="text-sm text-amber-600">No hay plantillas. Crea una en la sección Plantillas.</p>
            )}
          </div>
        )}

        {/* PASO 2 — Excel */}
        {paso === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={onExcel} className="hidden" />
              <Boton onClick={() => fileInput.current?.click()}>📄 Seleccionar Excel</Boton>
              <button onClick={descargarPlantillaEjemplo} className="text-sm text-[#16468E] hover:underline">
                Descargar plantilla de ejemplo
              </button>
              {excelNombre && <span className="text-sm text-slate-500">{excelNombre}</span>}
            </div>
            <p className="text-xs text-slate-500">
              La <b>primera columna</b> debe ser el correo. Las demás columnas se vuelven variables{' '}
              <code className="rounded bg-slate-100 px-1">{'{{columna}}'}</code>.
            </p>

            {excel && (
              <>
                <div className="flex flex-wrap gap-4 text-sm">
                  <Badge color="emerald">{excel.filas.length} válidos</Badge>
                  {excel.invalidas > 0 && <Badge color="amber">{excel.invalidas} sin email válido (descartados)</Badge>}
                  <Badge color="slate">{excel.columnas.length} columnas</Badge>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-600">
                      <tr>{excel.columnas.map((c, i) => (
                        <th key={c} className="px-3 py-2 font-medium">{c}{i === 0 && ' (email)'}</th>))}</tr>
                    </thead>
                    <tbody>
                      {excel.filas.slice(0, 5).map((f, idx) => (
                        <tr key={idx} className="border-t border-slate-100">
                          {excel.columnas.map((c) => <td key={c} className="px-3 py-2">{String(f.datos[c] ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {excel.filas.length > 5 && <p className="text-xs text-slate-400">Mostrando 5 de {excel.filas.length}.</p>}
              </>
            )}
          </div>
        )}

        {/* PASO 3 — Adjuntos */}
        {paso === 2 && (
          <div className="space-y-4">
            <input ref={adjInput} type="file" multiple onChange={onAdjuntos} className="hidden" />
            <Boton onClick={() => adjInput.current?.click()} disabled={subiendo}>
              {subiendo ? 'Subiendo…' : '📎 Agregar adjuntos'}
            </Boton>
            <p className="text-xs text-slate-500">Opcional. Los mismos archivos se envían a todos los destinatarios.</p>
            {adjuntos.length > 0 && (
              <ul className="space-y-2">
                {adjuntos.map((a) => (
                  <li key={a.path} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <span>📄 {a.nombre} <span className="text-slate-400">({(a.size / 1024).toFixed(0)} KB)</span></span>
                    <button onClick={() => quitarAdjunto(a)} className="text-red-600 hover:underline">Quitar</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* PASO 4 — Revisión */}
        {paso === 3 && plantilla && excel && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Campaña" valor={nombre} />
              <Info label="Plantilla" valor={`${plantilla.nombre} (${plantilla.tipo})`} />
              <Info label="Destinatarios" valor={String(excel.filas.length)} />
              <Info label="Adjuntos" valor={adjuntos.length ? adjuntos.map((a) => a.nombre).join(', ') : 'Ninguno'} />
            </div>
            {faltantes.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
                ⚠️ Variables sin columna en el Excel (se enviarán vacías): {faltantes.map((v) => `{{${v}}}`).join(', ')}
              </p>
            )}
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                Vista previa con el primer destinatario ({excel.filas[0].email}):
              </p>
              <div className="rounded-lg border border-slate-200 bg-white p-1">
                <div className="border-b border-slate-100 px-3 py-2 text-sm">
                  <b>Asunto:</b> {fusionar(asunto, excel.filas[0].datos)}
                </div>
                <iframe title="preview" className="h-80 w-full"
                  srcDoc={fusionar(plantilla.html, excel.filas[0].datos)} />
              </div>
            </div>
          </div>
        )}

        {/* PASO 5 — Envío */}
        {paso === 4 && (
          <div className="space-y-4 text-center">
            {!resultado ? (
              <>
                <p className="text-slate-600">
                  Vas a enviar la campaña <b>{nombre}</b> a <b>{excel?.filas.length}</b> destinatarios
                  desde <b>notificaciones@cacsantabarbara.co</b>.
                </p>
                <Boton onClick={enviar} disabled={enviando}>
                  {enviando ? 'Enviando…' : '🚀 Enviar campaña ahora'}
                </Boton>
                {enviando && <p className="text-sm text-slate-400">Procesando lotes, no cierres la ventana…</p>}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-2xl">✅</p>
                <p className="text-lg font-medium text-slate-800">Campaña enviada</p>
                <p className="text-sm text-slate-600">
                  {resultado.enviados} enviados · {resultado.fallidos} fallidos
                </p>
                <Boton onClick={() => navigate('/campanias')}>Ver campañas</Boton>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Navegación */}
      {!resultado && (
        <div className="mt-4 flex justify-between">
          <Boton variante="secundario" onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}>
            ← Atrás
          </Boton>
          {paso < PASOS.length - 1 && (
            <Boton onClick={() => setPaso((p) => p + 1)} disabled={!puedeAvanzar()}>Siguiente →</Boton>
          )}
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#16468E] focus:ring-1 focus:ring-[#16468E]'
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>{children}</div>
}
function Info({ label, valor }: { label: string; valor: string }) {
  return <div><span className="text-slate-400">{label}:</span> <span className="font-medium text-slate-700">{valor}</span></div>
}
function Badge({ children, color }: { children: React.ReactNode; color: 'emerald' | 'amber' | 'slate' }) {
  const c = { emerald: 'bg-emerald-100 text-emerald-700', amber: 'bg-amber-100 text-amber-700', slate: 'bg-slate-100 text-slate-600' }[color]
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${c}`}>{children}</span>
}
