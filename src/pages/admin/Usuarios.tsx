import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Perfil } from '../../lib/auth'
import { PageHeader, Card, Boton, Modal } from '../../components/ui'

type FormState = { email: string; nombre: string; rol: 'admin' | 'editor'; password: string }
const formVacio: FormState = { email: '', nombre: '', rol: 'editor', password: '' }

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<Perfil[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalCrear, setModalCrear] = useState(false)
  const [form, setForm] = useState<FormState>(formVacio)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [procesando, setProcesando] = useState(false)
  // Modal de cambio de contraseña
  const [resetUser, setResetUser] = useState<Perfil | null>(null)
  const [pass1, setPass1] = useState('')
  const [pass2, setPass2] = useState('')
  const [verPass, setVerPass] = useState(false)

  async function cargar() {
    setCargando(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setUsuarios((data as Perfil[]) ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  async function invocar(body: Record<string, unknown>) {
    setError(null); setMsg(null); setProcesando(true)
    const { data, error } = await supabase.functions.invoke('admin-usuarios', { body })
    setProcesando(false)
    if (error || data?.error) {
      setError(data?.error ?? error?.message ?? 'Error en la operación')
      return false
    }
    return true
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    const ok = await invocar({ accion: 'crear', ...form })
    if (ok) {
      setMsg(`Usuario ${form.email} creado.`)
      setModalCrear(false); setForm(formVacio); cargar()
    }
  }

  function abrirReset(u: Perfil) {
    setResetUser(u); setPass1(''); setPass2(''); setVerPass(false); setError(null)
  }

  async function confirmarReset(e: React.FormEvent) {
    e.preventDefault()
    if (!resetUser) return
    if (pass1.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    if (pass1 !== pass2) { setError('Las contraseñas no coinciden.'); return }
    if (await invocar({ accion: 'reset', id: resetUser.id, password: pass1 })) {
      setMsg(`Contraseña actualizada para ${resetUser.email}.`)
      setResetUser(null)
    }
  }

  async function toggleActivo(u: Perfil) {
    if (await invocar({ accion: 'activar', id: u.id, activo: !u.activo })) cargar()
  }

  async function eliminar(u: Perfil) {
    if (!confirm(`¿Eliminar definitivamente a ${u.email}?`)) return
    if (await invocar({ accion: 'eliminar', id: u.id })) { setMsg('Usuario eliminado.'); cargar() }
  }

  return (
    <div>
      <PageHeader titulo="Usuarios" acciones={
        <Boton onClick={() => { setModalCrear(true); setError(null) }}>+ Nuevo usuario</Boton>
      } />

      {msg && <p className="mb-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Correo</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Cargando…</td></tr>
            ) : usuarios.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Sin usuarios</td></tr>
            ) : usuarios.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="px-4 py-3">{u.nombre ?? '—'}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.rol === 'admin' ? 'bg-[#0D2D6B] text-white' : 'bg-slate-100 text-slate-700'}`}>
                    {u.rol}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={u.activo ? 'text-emerald-600' : 'text-slate-400'}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => abrirReset(u)} className="text-xs text-[#16468E] hover:underline">Cambiar contraseña</button>
                    <button onClick={() => toggleActivo(u)} className="text-xs text-amber-600 hover:underline">
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onClick={() => eliminar(u)} className="text-xs text-red-600 hover:underline">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modalCrear} onClose={() => setModalCrear(false)} titulo="Nuevo usuario">
        <form onSubmit={crear} className="space-y-4">
          <Campo label="Nombre" value={form.nombre}
            onChange={(v) => setForm({ ...form, nombre: v })} required />
          <Campo label="Correo" type="email" value={form.email}
            onChange={(v) => setForm({ ...form, email: v })} required />
          <Campo label="Contraseña temporal" type="text" value={form.password}
            onChange={(v) => setForm({ ...form, password: v })} required />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Rol</label>
            <select value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value as 'admin' | 'editor' })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="editor">Editor</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="secundario" onClick={() => setModalCrear(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={procesando}>{procesando ? 'Creando…' : 'Crear'}</Boton>
          </div>
        </form>
      </Modal>

      {/* Modal de cambio de contraseña */}
      <Modal open={!!resetUser} onClose={() => setResetUser(null)} titulo="Cambiar contraseña">
        <form onSubmit={confirmarReset} className="space-y-4">
          <p className="text-sm text-slate-500">
            Definir una nueva contraseña para <strong>{resetUser?.email}</strong>.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nueva contraseña</label>
            <input type={verPass ? 'text' : 'password'} value={pass1} autoFocus
              onChange={(e) => setPass1(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                         outline-none focus:border-[#16468E] focus:ring-1 focus:ring-[#16468E]"
              placeholder="Mínimo 6 caracteres" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Confirmar contraseña</label>
            <input type={verPass ? 'text' : 'password'} value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                         outline-none focus:border-[#16468E] focus:ring-1 focus:ring-[#16468E]"
              placeholder="Repite la contraseña" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={verPass} onChange={(e) => setVerPass(e.target.checked)} />
            Mostrar contraseña
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="secundario" onClick={() => setResetUser(null)}>Cancelar</Boton>
            <Boton type="submit" disabled={procesando}>{procesando ? 'Guardando…' : 'Guardar'}</Boton>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function Campo({ label, value, onChange, type = 'text', required }:
  { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input type={type} value={value} required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                   outline-none focus:border-[#16468E] focus:ring-1 focus:ring-[#16468E]" />
    </div>
  )
}
