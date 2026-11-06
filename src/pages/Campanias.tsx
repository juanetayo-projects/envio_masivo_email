import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { mensajeDeError } from '../lib/envioCampania'
import { PageHeader, Card, Boton, Modal, TableHead, filaZebra } from '../components/ui'
import { fecha } from '../lib/fecha'

type Campania = {
  id: string
  nombre: string
  asunto: string
  estado: 'borrador' | 'enviando' | 'enviada' | 'error'
  total_destinatarios: number
  created_at: string
  enviada_at: string | null
  en_cola: boolean
}

const estadoColor: Record<string, string> = {
  borrador: 'bg-slate-100 text-slate-600',
  enviando: 'bg-amber-100 text-amber-700',
  enviada: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
}

export default function Campanias() {
  const navigate = useNavigate()
  const { esAdmin } = useAuth()
  const [items, setItems] = useState<Campania[]>([])
  const [cargando, setCargando] = useState(true)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [aEliminar, setAEliminar] = useState<Campania[] | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  async function cargar() {
    const { data } = await supabase.from('campanias').select('*').order('created_at', { ascending: false })
    setItems((data as Campania[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const enProceso = (c: Campania) => c.en_cola || c.estado === 'enviando'
  const seleccionables = items.filter((c) => !enProceso(c))
  const todas = seleccionables.length > 0 && seleccionables.every((c) => seleccion.has(c.id))

  function alternar(id: string, activa: boolean) {
    setSeleccion((s) => {
      const nueva = new Set(s)
      if (activa) nueva.add(id)
      else nueva.delete(id)
      return nueva
    })
  }

  async function confirmarEliminar() {
    if (!aEliminar) return
    setEliminando(true); setAviso(null)
    const { data, error } = await supabase.functions.invoke('eliminar-campanias', {
      body: { ids: aEliminar.map((c) => c.id) },
    })
    setEliminando(false)
    setAEliminar(null)
    if (error) { setAviso({ ok: false, texto: await mensajeDeError(error) }); return }

    const eliminadas: string[] = data.eliminadas
    const rechazadas: { nombre: string; motivo: string }[] = data.rechazadas
    setSeleccion((s) => new Set([...s].filter((id) => !eliminadas.includes(id))))
    setAviso(rechazadas.length > 0
      ? { ok: false, texto: `Eliminadas: ${eliminadas.length}. No se eliminaron: ${rechazadas.map((r) => `${r.nombre} (${r.motivo})`).join('; ')}.` }
      : { ok: true, texto: eliminadas.length === 1 ? 'Campaña eliminada.' : `${eliminadas.length} campañas eliminadas.` })
    cargar()
  }

  return (
    <div>
      <PageHeader titulo="Campañas" acciones={
        <>
          {esAdmin && seleccion.size > 0 && (
            <Boton variante="secundario" onClick={() => setAEliminar(items.filter((c) => seleccion.has(c.id)))}>
              🗑 Eliminar seleccionadas ({seleccion.size})
            </Boton>
          )}
          <Boton onClick={() => navigate('/campanias/nueva')}>+ Nueva campaña</Boton>
        </>
      } />

      {aviso && (
        <p className={`mb-3 rounded-lg px-4 py-2 text-sm ${aviso.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {aviso.texto}
        </p>
      )}

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : items.length === 0 ? (
        <Card><p className="text-sm text-slate-500">Aún no hay campañas. Crea la primera.</p></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <TableHead>
              {esAdmin && (
                <th className="w-10">
                  <input type="checkbox" aria-label="Seleccionar todas" checked={todas}
                    onChange={(e) => setSeleccion(new Set(e.target.checked ? seleccionables.map((c) => c.id) : []))} />
                </th>
              )}
              <th>Campaña</th><th>Destinatarios</th><th>Estado</th><th>Fecha</th>
              <th className="text-right">Acciones</th>
            </TableHead>
            <tbody>
              {items.map((c, i) => (
                <tr key={c.id} className={filaZebra(i)}>
                  {esAdmin && (
                    <td className="px-4 py-3">
                      <input type="checkbox" aria-label={`Seleccionar ${c.nombre}`} disabled={enProceso(c)}
                        checked={seleccion.has(c.id)} onChange={(e) => alternar(c.id, e.target.checked)} />
                    </td>
                  )}
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
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button onClick={() => navigate(`/campanias/${c.id}/informe`)}
                      className="text-[#16468E] hover:underline">Ver informe →</button>
                    {esAdmin && (
                      <button onClick={() => setAEliminar([c])} disabled={enProceso(c)}
                        title={enProceso(c) ? 'Se está enviando; espera a que termine' : undefined}
                        className="ml-3 text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline">
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={aEliminar !== null} onClose={() => { if (!eliminando) setAEliminar(null) }}
        titulo={aEliminar?.length === 1 ? 'Eliminar campaña' : `Eliminar ${aEliminar?.length ?? 0} campañas`}>
        <ul className="mb-3 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-sm font-medium text-slate-800">
          {aEliminar?.map((c) => <li key={c.id}>{c.nombre}</li>)}
        </ul>
        <p className="text-sm text-slate-600">
          Se borrarán para siempre su informe, sus destinatarios y sus adjuntos, y dejarán de contar en el Dashboard.
          Las plantillas y la lista de bloqueo no cambian.
        </p>
        <p className="mt-2 text-sm text-amber-700">
          Si estos correos llegaron a personas reales, sus enlaces de baja dejarán de funcionar.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setAEliminar(null)} disabled={eliminando}>Cancelar</Boton>
          <Boton onClick={confirmarEliminar} disabled={eliminando}>{eliminando ? 'Eliminando…' : 'Eliminar definitivamente'}</Boton>
        </div>
      </Modal>
    </div>
  )
}
