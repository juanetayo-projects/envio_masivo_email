import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Boton, Logo } from '../components/ui'

export default function Reset() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setCargando(true)
    const { error } = await supabase.auth.updateUser({ password })
    setCargando(false)
    if (error) setError('No se pudo actualizar la contraseña. Reabre el enlace del correo.')
    else navigate('/dashboard', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#061026] to-[#0a1f4d] p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="bg-gradient-to-br from-[#0D2D6B] to-[#16468E] px-8 py-8 text-center">
          <Logo blanco className="mx-auto h-14 object-contain" />
          <h1 className="mt-4 text-lg font-semibold text-white">Nueva contraseña</h1>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-8">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nueva contraseña</label>
            <input
              type="password" required minLength={6} value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                         outline-none focus:border-[#16468E] focus:ring-1 focus:ring-[#16468E]"
              placeholder="••••••••" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Boton type="submit" disabled={cargando} className="w-full">
            {cargando ? 'Guardando…' : 'Guardar contraseña'}
          </Boton>
        </form>
      </div>
    </div>
  )
}
