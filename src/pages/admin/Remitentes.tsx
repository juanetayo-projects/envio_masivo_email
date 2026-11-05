import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { emailValido } from '../../lib/excel'
import { PageHeader, Card, Boton, Modal, TableHead, filaZebra } from '../../components/ui'

type Remitente = { id: string; nombre: string; email: string; responder_a: string | null; activo: boolean }
type Formulario = { id: string | null; nombre: string; email: string; responder_a: string; activo: boolean }

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#16468E] focus:ring-1 focus:ring-[#16468E]'
const VACIO: Formulario = { id: null, nombre: '', email: '', responder_a: '', activo: true }

export default function Remitentes() {
  const [items, setItems] = useState<Remitente[]>([])
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const [aEliminar, setAEliminar] = useState<Remitente | null>(null)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    const { data, error } = await supabase.from('remitentes').select('*').order('nombre')
    if (error) setError('No se pudo cargar: ' + error.message)
    else setItems((data as Remitente[]) ?? [])
  }
  useEffect(() => { cargar() }, [])

  async function guardar() {
    if (!formulario) return
    const nombre = formulario.nombre.trim()
    const email = formulario.email.trim().toLowerCase()
    const responder_a = formulario.responder_a.trim() || null
    if (!nombre) { setErrorForm('Escribe el nombre visible.'); return }
    if (!emailValido(email)) { setErrorForm('Escribe un correo de envío válido.'); return }
    if (responder_a && !emailValido(responder_a)) { setErrorForm('El correo de "Responder a" no es válido.'); return }

    setGuardando(true); setErrorForm(null)
    const fila = { nombre, email, responder_a, activo: formulario.activo }
    const { error } = formulario.id
      ? await supabase.from('remitentes').update(fila).eq('id', formulario.id)
      : await supabase.from('remitentes').insert(fila)
    setGuardando(false)
    if (error) {
      setErrorForm(error.code === '23505' ? 'Ese correo ya está en el catálogo.' : 'No se pudo guardar: ' + error.message)
      return
    }
    setFormulario(null)
    cargar()
  }

  async function eliminar() {
    if (!aEliminar) return
    const { error } = await supabase.from('remitentes').delete().eq('id', aEliminar.id)
    setAEliminar(null)
    if (error) setError('No se pudo eliminar: ' + error.message)
    else cargar()
  }

  return (
    <div>
      <PageHeader titulo="Remitentes" acciones={
        <Boton onClick={() => { setErrorForm(null); setFormulario(VACIO) }}>+ Nuevo remitente</Boton>
      } />
      <p className="mb-4 text-sm text-slate-500">
        Direcciones desde las que se pueden enviar campañas. El dominio de cada una debe estar verificado en Resend;
        si no lo está, el envío se detiene y muestra el error.
      </p>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <TableHead>
            <th>Nombre visible</th><th>Correo de envío</th><th>Responder a</th><th>Estado</th>
            <th className="text-right">Acciones</th>
          </TableHead>
          <tbody>
            {items.map((r, i) => (
              <tr key={r.id} className={filaZebra(i)}>
                <td className="px-4 py-2 font-medium text-slate-800">{r.nombre}</td>
                <td className="px-4 py-2">{r.email}</td>
                <td className="px-4 py-2 text-slate-500">{r.responder_a ?? ''}</td>
                <td className="px-4 py-2">
                  <span className={r.activo ? 'text-emerald-600' : 'text-slate-400'}>{r.activo ? 'Activo' : 'Inactivo'}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <button onClick={() => {
                    setErrorForm(null)
                    setFormulario({ id: r.id, nombre: r.nombre, email: r.email, responder_a: r.responder_a ?? '', activo: r.activo })
                  }} className="text-[#16468E] hover:underline">Editar</button>
                  <button onClick={() => setAEliminar(r)} className="ml-3 text-red-600 hover:underline">Eliminar</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No hay remitentes.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal open={formulario !== null} onClose={() => setFormulario(null)}
        titulo={formulario?.id ? 'Editar remitente' : 'Nuevo remitente'}>
        {formulario && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nombre visible</label>
              <input value={formulario.nombre} className={inputCls}
                onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Correo de envío</label>
              <input value={formulario.email} className={inputCls} placeholder="ventas@midominio.com"
                onChange={(e) => setFormulario({ ...formulario, email: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Responder a (opcional)</label>
              <input value={formulario.responder_a} className={inputCls}
                onChange={(e) => setFormulario({ ...formulario, responder_a: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={formulario.activo}
                onChange={(e) => setFormulario({ ...formulario, activo: e.target.checked })} />
              Activo
            </label>
            {errorForm && <p className="text-sm text-red-600">{errorForm}</p>}
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setFormulario(null)}>Cancelar</Boton>
              <Boton onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={aEliminar !== null} onClose={() => setAEliminar(null)} titulo="Eliminar remitente">
        <p className="text-sm text-slate-600">
          ¿Eliminar <b>{aEliminar?.email}</b>? Las campañas en curso con esta dirección se detendrán.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setAEliminar(null)}>Cancelar</Boton>
          <Boton onClick={eliminar}>Eliminar</Boton>
        </div>
      </Modal>
    </div>
  )
}
