import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { emailValido } from '../lib/excel'
import { fechaHora } from '../lib/fecha'
import { PageHeader, Card, Boton, Modal, TableHead, filaZebra } from '../components/ui'

type Bloqueado = {
  email: string
  motivo: 'rebote' | 'queja' | 'manual'
  nota: string | null
  created_at: string
}

const MOTIVOS: Record<Bloqueado['motivo'], { etiqueta: string; color: string }> = {
  rebote: { etiqueta: 'Rebote', color: 'bg-amber-100 text-amber-700' },
  queja: { etiqueta: 'Queja', color: 'bg-red-100 text-red-700' },
  manual: { etiqueta: 'Manual', color: 'bg-slate-100 text-slate-600' },
}
const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#16468E] focus:ring-1 focus:ring-[#16468E]'

export default function Bloqueados() {
  const { session, esAdmin } = useAuth()
  const [items, setItems] = useState<Bloqueado[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [formulario, setFormulario] = useState<{ original: Bloqueado | null; email: string; nota: string } | null>(null)
  const [aEliminar, setAEliminar] = useState<Bloqueado | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    const { data, error } = await supabase.from('correos_bloqueados').select('*')
      .order('created_at', { ascending: false })
    if (error) setError('No se pudo cargar la lista: ' + error.message)
    else setItems((data as Bloqueado[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return q ? items.filter((b) => b.email.includes(q)) : items
  }, [items, busqueda])

  async function guardar() {
    if (!formulario) return
    const nota = formulario.nota.trim() || null
    setErrorForm(null)
    let fallo: { code?: string; message: string } | null
    setGuardando(true)
    if (formulario.original) {
      fallo = (await supabase.from('correos_bloqueados').update({ nota })
        .eq('email', formulario.original.email)).error
    } else {
      const email = formulario.email.trim().toLowerCase()
      if (!emailValido(email)) { setGuardando(false); setErrorForm('Escribe un correo válido.'); return }
      fallo = (await supabase.from('correos_bloqueados').insert({
        email, motivo: 'manual', nota, created_by: session?.user.id ?? null,
      })).error
    }
    setGuardando(false)
    if (fallo) {
      setErrorForm(fallo.code === '23505' ? 'Ese correo ya está en la lista.' : 'No se pudo guardar: ' + fallo.message)
      return
    }
    setFormulario(null)
    cargar()
  }

  async function eliminar() {
    if (!aEliminar) return
    setGuardando(true)
    const { error } = await supabase.from('correos_bloqueados').delete().eq('email', aEliminar.email)
    setGuardando(false)
    setAEliminar(null)
    if (error) setError('No se pudo quitar: ' + error.message)
    else cargar()
  }

  return (
    <div>
      <PageHeader titulo="Lista de bloqueo" acciones={
        <Boton onClick={() => { setErrorForm(null); setFormulario({ original: null, email: '', nota: '' }) }}>
          + Agregar correo
        </Boton>
      } />
      <p className="mb-4 text-sm text-slate-500">
        Estos correos no reciben campañas. Los rebotes permanentes y las quejas se agregan solos.
      </p>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar correo…"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#16468E]" />
          <span className="text-sm text-slate-400">{filtrados.length} de {items.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <TableHead>
              <th>Correo</th><th>Motivo</th><th>Nota</th><th>Fecha</th><th className="text-right">Acciones</th>
            </TableHead>
            <tbody>
              {filtrados.map((b, i) => (
                <tr key={b.email} className={filaZebra(i)}>
                  <td className="px-4 py-2 font-medium text-slate-800">{b.email}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MOTIVOS[b.motivo].color}`}>
                      {MOTIVOS[b.motivo].etiqueta}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{b.nota ?? ''}</td>
                  <td className="px-4 py-2 text-slate-500">{fechaHora(b.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button onClick={() => { setErrorForm(null); setFormulario({ original: b, email: b.email, nota: b.nota ?? '' }) }}
                      className="text-[#16468E] hover:underline">Editar nota</button>
                    {esAdmin && (
                      <button onClick={() => setAEliminar(b)} className="ml-3 text-red-600 hover:underline">Quitar</button>
                    )}
                  </td>
                </tr>
              ))}
              {!cargando && filtrados.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {items.length === 0 ? 'La lista está vacía.' : 'Ningún correo coincide con la búsqueda.'}
                </td></tr>
              )}
              {cargando && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Cargando…</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={formulario !== null} onClose={() => setFormulario(null)}
        titulo={formulario?.original ? 'Editar nota' : 'Agregar correo'}>
        {formulario && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Correo</label>
              <input value={formulario.email} disabled={!!formulario.original}
                onChange={(e) => setFormulario({ ...formulario, email: e.target.value })}
                className={`${inputCls} disabled:bg-slate-100 disabled:text-slate-500`} placeholder="persona@correo.com" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nota (opcional)</label>
              <input value={formulario.nota} onChange={(e) => setFormulario({ ...formulario, nota: e.target.value })}
                className={inputCls} placeholder="Ej. Pidió no recibir más correos" />
            </div>
            {errorForm && <p className="text-sm text-red-600">{errorForm}</p>}
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setFormulario(null)}>Cancelar</Boton>
              <Boton onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={aEliminar !== null} onClose={() => setAEliminar(null)} titulo="Quitar de la lista">
        <p className="text-sm text-slate-600">
          <b>{aEliminar?.email}</b> podrá volver a recibir campañas.
          {aEliminar?.motivo !== 'manual' && ' Esta dirección rebotó o presentó una queja: enviarle de nuevo puede afectar la reputación del dominio.'}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setAEliminar(null)}>Cancelar</Boton>
          <Boton onClick={eliminar} disabled={guardando}>Quitar</Boton>
        </div>
      </Modal>
    </div>
  )
}
