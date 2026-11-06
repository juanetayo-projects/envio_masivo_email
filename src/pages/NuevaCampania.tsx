import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PageHeader, Card, Boton, BarraProgreso, Modal } from '../components/ui'
import { revisarHtml } from '../lib/revisarHtml'
import { leerExcel, descargarPlantillaEjemplo } from '../lib/excel'
import type { ResultadoImport } from '../lib/excel'
import { fusionarAsunto, prepararCuerpo, variablesFaltantes } from '../lib/merge'
import { ejecutarEnvio, mensajeDeError } from '../lib/envioCampania'
import type { Progreso } from '../lib/envioCampania'
import { aplicarFiltro, camposFormulario, dominioDe, eliminarFila, guardarFila, valoresDeColumna, verificarDominios } from '../lib/destinatarios'
import TablaDestinatarios from '../components/TablaDestinatarios'
import type { Plantilla } from './Plantillas'

type Adjunto = { nombre: string; path: string; mime: string; size: number }
type Remitente = { id: string; nombre: string; email: string; responder_a: string | null }
const PASOS = ['Datos', 'Destinatarios (Excel)', 'Adjuntos', 'Revisión', 'Envío']

export default function NuevaCampania() {
  const navigate = useNavigate()

  const [paso, setPaso] = useState(0)
  const [plantillasList, setPlantillasList] = useState<Plantilla[]>([])

  // Paso 1
  const [nombre, setNombre] = useState('')
  const [asunto, setAsunto] = useState('')
  const [plantillaId, setPlantillaId] = useState('')
  const [remitentes, setRemitentes] = useState<Remitente[]>([])
  const [remitenteId, setRemitenteId] = useState('')
  const [remitenteNombre, setRemitenteNombre] = useState('')
  const [responderA, setResponderA] = useState('')
  const [incluirBaja, setIncluirBaja] = useState(true)

  // Paso 2
  const [excel, setExcel] = useState<ResultadoImport | null>(null)
  const [excelNombre, setExcelNombre] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const importacion = useRef(0)
  const [revisando, setRevisando] = useState(false)
  const [dominiosInexistentes, setDominiosInexistentes] = useState<Set<string>>(new Set())
  const [dominiosSinVerificar, setDominiosSinVerificar] = useState(0)
  const [bloqueados, setBloqueados] = useState<Map<string, string>>(new Map())
  const [columnaFiltro, setColumnaFiltro] = useState('')
  const [valoresFiltro, setValoresFiltro] = useState<Set<string>>(new Set())

  // Paso 3
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const adjInput = useRef<HTMLInputElement>(null)
  const tempId = useMemo(() => crypto.randomUUID(), [])

  // Paso 5
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Progreso | null>(null)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [campaniaCreada, setCampaniaCreada] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Paso 4
  const [enviandoPrueba, setEnviandoPrueba] = useState(false)
  const [avisoPrueba, setAvisoPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null)

  useEffect(() => {
    supabase.from('plantillas').select('*').order('updated_at', { ascending: false })
      .then(({ data }) => setPlantillasList((data as Plantilla[]) ?? []))
    supabase.from('remitentes').select('*').eq('activo', true).order('nombre')
      .then(({ data }) => {
        const lista = (data as Remitente[]) ?? []
        setRemitentes(lista)
        if (lista[0]) elegirRemitente(lista[0])
      })
  }, [])

  function elegirRemitente(r: Remitente) {
    setRemitenteId(r.id); setRemitenteNombre(r.nombre); setResponderA(r.responder_a ?? '')
  }

  const plantilla = plantillasList.find((p) => p.id === plantillaId)
  const remitente = remitentes.find((r) => r.id === remitenteId)
  const avisosHtml = useMemo(() => revisarHtml(plantilla?.html ?? ''), [plantilla])

  const excluidos = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const f of excel?.filas ?? []) {
      const clave = f.email.toLowerCase()
      const motivo = bloqueados.get(clave)
      if (motivo) mapa.set(clave, `lista de bloqueo (${motivo})`)
      else if (dominiosInexistentes.has(dominioDe(f.email))) mapa.set(clave, 'el dominio no existe o no recibe correo')
    }
    return mapa
  }, [excel, bloqueados, dominiosInexistentes])

  const valoresColumna = useMemo(
    () => (excel && columnaFiltro ? valoresDeColumna(excel.filas, columnaFiltro) : []),
    [excel, columnaFiltro],
  )

  // Los destinatarios reales de la campaña: se usan en la revisión y en el envío.
  const filasFiltradas = useMemo(
    () => aplicarFiltro(excel?.filas ?? [], columnaFiltro, valoresFiltro),
    [excel, columnaFiltro, valoresFiltro],
  )
  const destinatarios = useMemo(
    () => filasFiltradas.filter((f) => !excluidos.has(f.email.toLowerCase())),
    [filasFiltradas, excluidos],
  )

  // Lo que usa la plantilla, sin mirar el Excel: define el formulario de destinatarios.
  const textoPlantilla = (plantilla?.html ?? '') + ' ' + asunto
  const variablesSinColumna = useMemo(
    () => (excel ? variablesFaltantes(textoPlantilla, excel.columnas) : []),
    [textoPlantilla, excel],
  )
  const campos = useMemo(
    () => (excel ? camposFormulario(textoPlantilla, excel.columnas) : []),
    [textoPlantilla, excel],
  )
  // Una variable sin columna deja de avisar cuando todos sus destinatarios ya tienen valor.
  const faltantes = useMemo(
    () => variablesSinColumna.filter((v) => destinatarios.some((f) => !String(f.datos[v] ?? '').trim())),
    [variablesSinColumna, destinatarios],
  )

  async function onExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    e.target.value = ''   // permite volver a elegir el mismo archivo corregido
    const turno = ++importacion.current
    setRevisando(false)
    setExcelNombre(f.name)
    setError(null)
    setColumnaFiltro(''); setValoresFiltro(new Set())
    setBloqueados(new Map()); setDominiosInexistentes(new Set()); setDominiosSinVerificar(0)

    let leido: ResultadoImport
    try { leido = await leerExcel(f) }
    catch { setExcel(null); setError('No se pudo leer el archivo. ¿Es un .xlsx válido?'); return }
    setExcel(leido)
    if (leido.filas.length === 0) return

    setRevisando(true)
    const [lista, dominios] = await Promise.all([
      supabase.rpc('buscar_bloqueados', { p_emails: leido.filas.map((x) => x.email) }),
      verificarDominios(leido.filas.map((x) => dominioDe(x.email))),
    ])
    if (turno !== importacion.current) return   // ya eligieron otro archivo

    // Si esta consulta falla, el servidor igual omite los bloqueados al enviar.
    if (lista.error) setError('No se pudo revisar la lista de bloqueo; se aplicará al enviar.')
    setBloqueados(new Map(((lista.data ?? []) as { email: string; motivo: string }[]).map((b) => [b.email, b.motivo])))
    const estados = Object.entries(dominios)
    setDominiosInexistentes(new Set(estados.filter(([, v]) => v === 'inexistente').map(([d]) => d)))
    setDominiosSinVerificar(estados.filter(([, v]) => v === 'desconocido').length)
    setRevisando(false)
  }

  // Un correo agregado o editado pasa por la misma revisión que los del archivo.
  async function revisarCorreo(email: string) {
    const dominio = dominioDe(email)
    const [lista, dominios] = await Promise.all([
      supabase.rpc('buscar_bloqueados', { p_emails: [email] }),
      verificarDominios([dominio]),
    ])
    const hallado = ((lista.data ?? []) as { email: string; motivo: string }[])[0]
    if (hallado) setBloqueados((m) => new Map(m).set(hallado.email, hallado.motivo))
    if (dominios[dominio] === 'inexistente') setDominiosInexistentes((s) => new Set(s).add(dominio))
  }

  async function guardarDestinatario(
    original: string | null,
    valores: Record<string, string>,
    indiceDescartada: number | null,
  ): Promise<string | null> {
    if (!excel) return 'No hay archivo cargado.'
    const datosBase = indiceDescartada === null ? {} : excel.descartadas[indiceDescartada]?.datos
    const r = guardarFila(excel.filas, excel.columnas, original, valores, datosBase)
    if ('error' in r) return r.error
    await revisarCorreo(r.fila.email)
    setExcel({
      ...excel,
      filas: r.filas,
      descartadas: excel.descartadas.filter((_, i) => i !== indiceDescartada),
    })
    // Si hay un filtro activo, el registro guardado debe seguir visible.
    if (columnaFiltro && valoresFiltro.size > 0) {
      cambiarValorFiltro(String(r.fila.datos[columnaFiltro] ?? '').trim(), true)
    }
    return null
  }

  function cambiarValorFiltro(valor: string, activo: boolean) {
    setValoresFiltro((actual) => {
      const nuevo = new Set(actual)
      if (activo) nuevo.add(valor)
      else nuevo.delete(valor)
      return nuevo
    })
  }

  async function enviarPrueba() {
    setEnviandoPrueba(true)
    const { data, error: ep } = await supabase.functions.invoke('enviar-prueba', {
      body: {
        plantilla_id: plantillaId, asunto, datos: destinatarios[0]?.datos ?? {}, adjuntos,
        remitente_id: remitenteId, remitente_nombre: remitenteNombre, responder_a: responderA, incluir_baja: incluirBaja,
      },
    })
    setEnviandoPrueba(false)
    if (ep) setAvisoPrueba({ ok: false, mensaje: await mensajeDeError(ep) })
    else setAvisoPrueba({ ok: true, mensaje: `Enviamos la prueba a ${data.para}. Revisa también la carpeta de spam.` })
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
    const total = destinatarios.length
    setProgreso({ total, enviados: 0, fallidos: 0, pendientes: total })
    // tempId identifica la campaña: reintentar continúa la misma, nunca crea otra.
    const { error: ce } = await supabase.rpc('crear_campania', {
      p_campania: {
        id: tempId, nombre, asunto, plantilla_id: plantillaId, adjuntos,
        remitente_id: remitenteId, remitente_nombre: remitenteNombre, responder_a: responderA, incluir_baja: incluirBaja,
      },
      p_envios: destinatarios.map((f) => ({ email: f.email, datos: f.datos })),
    })
    if (ce) { setEnviando(false); setError('No se pudo crear la campaña: ' + ce.message); return }
    setCampaniaCreada(true)

    try {
      setResultado(await ejecutarEnvio(tempId, setProgreso))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar')
    } finally {
      setEnviando(false)
    }
  }

  const puedeAvanzar = () => {
    if (paso === 0) return nombre.trim() && asunto.trim() && plantillaId && remitenteId && remitenteNombre.trim()
    if (paso === 1) return !revisando && destinatarios.length > 0
    return true
  }

  return (
    <div className="max-w-4xl">
      <PageHeader titulo="Nueva campaña" />

      <Modal open={avisoPrueba !== null} onClose={() => setAvisoPrueba(null)}
        titulo={avisoPrueba?.ok ? 'Prueba enviada' : 'No se pudo enviar la prueba'}>
        <p className="text-sm text-slate-600">{avisoPrueba?.mensaje}</p>
        <div className="mt-4 flex justify-end">
          <Boton onClick={() => setAvisoPrueba(null)}>Cerrar</Boton>
        </div>
      </Modal>

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
                placeholder="Ej. Promoción de noviembre" />
            </Field>
            <Field label="Asunto del correo (admite variables {{...}})">
              <input value={asunto} onChange={(e) => setAsunto(e.target.value)} className={inputCls}
                placeholder="Hola {{nombre}}, tenemos novedades" />
            </Field>
            <Field label="Plantilla">
              <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)} className={inputCls}>
                <option value="">— Selecciona una plantilla —</option>
                {plantillasList.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.tipo})</option>)}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Enviar desde">
                <select value={remitenteId} className={inputCls} onChange={(e) => {
                  const r = remitentes.find((x) => x.id === e.target.value)
                  if (r) elegirRemitente(r)
                }}>
                  {remitentes.map((r) => <option key={r.id} value={r.id}>{r.email}</option>)}
                </select>
              </Field>
              <Field label="Nombre visible del remitente">
                <input value={remitenteNombre} onChange={(e) => setRemitenteNombre(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Responder a (opcional)">
                <input value={responderA} onChange={(e) => setResponderA(e.target.value)} className={inputCls}
                  placeholder="correo@ejemplo.com" />
              </Field>
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5" checked={incluirBaja} onChange={(e) => setIncluirBaja(e.target.checked)} />
              <span>
                Incluir enlace para darse de baja
                <span className="block text-xs text-slate-500">
                  Recomendado en correos comerciales y masivos. Desmárcalo solo en avisos operativos, como un recordatorio de cita.
                </span>
              </span>
            </label>
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
                  <Badge color="emerald">{destinatarios.length} destinatarios</Badge>
                  {revisando && <Badge color="slate">Verificando dominios y lista de bloqueo…</Badge>}
                  {excluidos.size > 0 && <Badge color="amber">{excluidos.size === 1 ? '1 excluido' : `${excluidos.size} excluidos`}</Badge>}
                  {dominiosSinVerificar > 0 && <Badge color="slate">{dominiosSinVerificar} dominios sin verificar</Badge>}
                  {excel.descartadas.length > 0 && <Badge color="amber">{excel.descartadas.length} sin email válido</Badge>}
                  {excel.duplicados > 0 && <Badge color="amber">{excel.duplicados === 1 ? '1 correo repetido (descartado)' : `${excel.duplicados} correos repetidos (descartados)`}</Badge>}
                  <Badge color="slate">{excel.columnas.length} columnas</Badge>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <Field label="Enviar solo a quienes cumplan (opcional)">
                    <select value={columnaFiltro} className={inputCls}
                      onChange={(e) => { setColumnaFiltro(e.target.value); setValoresFiltro(new Set()) }}>
                      <option value="">— Todos los destinatarios —</option>
                      {excel.columnas.slice(1).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  {columnaFiltro && (
                    <div className="mt-3 grid max-h-44 gap-1 overflow-auto text-sm sm:grid-cols-2">
                      {valoresColumna.map((v) => (
                        <label key={v} className="flex items-center gap-2 text-slate-700">
                          <input type="checkbox" checked={valoresFiltro.has(v)}
                            onChange={(e) => cambiarValorFiltro(v, e.target.checked)} />
                          {v || '(vacío)'}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <TablaDestinatarios
                  filas={filasFiltradas}
                  columnas={[...excel.columnas, ...variablesSinColumna]}
                  campos={campos}
                  excluidos={excluidos}
                  descartadas={excel.descartadas}
                  onGuardar={guardarDestinatario}
                  onEliminar={(email) => setExcel({ ...excel, filas: eliminarFila(excel.filas, email) })}
                  onEliminarDescartada={(indice) => setExcel({
                    ...excel, descartadas: excel.descartadas.filter((_, i) => i !== indice),
                  })}
                />
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
        {paso === 3 && plantilla && destinatarios.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Campaña" valor={nombre} />
              <Info label="Plantilla" valor={`${plantilla.nombre} (${plantilla.tipo})`} />
              <Info label="Remitente" valor={`${remitenteNombre} <${remitente?.email ?? ''}>`} />
              {responderA.trim() && <Info label="Responder a" valor={responderA.trim()} />}
              <Info label="Destinatarios" valor={String(destinatarios.length)} />
              <Info label="Adjuntos" valor={adjuntos.length ? adjuntos.map((a) => a.nombre).join(', ') : 'Ninguno'} />
            </div>
            {avisosHtml.length > 0 && (
              <ul className="list-disc space-y-1 rounded-lg bg-amber-50 py-2 pl-8 pr-4 text-sm text-amber-700">
                {avisosHtml.map((a) => <li key={a}>{a}</li>)}
              </ul>
            )}
            {faltantes.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
                ⚠️ Variables sin columna en el Excel (se enviarán vacías): {faltantes.map((v) => `{{${v}}}`).join(', ')}
              </p>
            )}
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">
                  Vista previa con el primer destinatario ({destinatarios[0].email}):
                </p>
                <Boton variante="secundario" onClick={enviarPrueba} disabled={enviandoPrueba}>
                  {enviandoPrueba ? 'Enviando prueba…' : '📨 Enviarme una prueba'}
                </Boton>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-1">
                <div className="border-b border-slate-100 px-3 py-2 text-sm">
                  <b>Asunto:</b> {fusionarAsunto(asunto, destinatarios[0].datos)}
                </div>
                <iframe sandbox="" title="preview" className="h-80 w-full"
                  srcDoc={prepararCuerpo(plantilla.html, destinatarios[0].datos, { token: 'prueba', remitente: remitenteNombre, incluir: incluirBaja })} />
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
                  Vas a enviar la campaña <b>{nombre}</b> a <b>{destinatarios.length}</b> destinatarios
                  desde <b>{remitente?.email}</b>.
                </p>
                <Boton onClick={enviar} disabled={enviando}>
                  {enviando ? 'Enviando…' : campaniaCreada ? '↻ Continuar envío' : '🚀 Enviar campaña ahora'}
                </Boton>
                {progreso && <div className="text-left"><BarraProgreso {...progreso} /></div>}
                {enviando && (
                  <p className="text-sm text-slate-400">
                    Si cierras esta ventana, el envío continúa en el servidor. Puedes seguirlo en el informe de la campaña.
                  </p>
                )}
                {campaniaCreada && !enviando && (
                  <button onClick={() => navigate(`/campanias/${tempId}/informe`)}
                    className="block w-full text-sm text-[#16468E] hover:underline">
                    Ver informe de la campaña
                  </button>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-2xl">✅</p>
                <p className="text-lg font-medium text-slate-800">Campaña enviada</p>
                <div className="text-left"><BarraProgreso {...resultado} /></div>
                <p className="text-sm text-slate-600">
                  {resultado.enviados} enviados · {resultado.fallidos} fallidos
                  {!!resultado.omitidos && ` · ${resultado.omitidos} omitidos por lista de bloqueo`}
                </p>
                <Boton onClick={() => navigate(`/campanias/${tempId}/informe`)}>Ver informe</Boton>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Navegación */}
      {!resultado && !campaniaCreada && (
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
