import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Boton, Logo } from '../components/ui'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [modoRecuperar, setModoRecuperar] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setAviso(null); setCargando(true)
    if (modoRecuperar) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}#/reset`,
      })
      setCargando(false)
      if (error) setError('No se pudo enviar el correo de recuperación.')
      else setAviso('Te enviamos un correo con el enlace de recuperación.')
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setCargando(false)
    if (error) setError('Credenciales inválidas.')
    else navigate('/dashboard', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="bg-gradient-to-br from-[#0D2D6B] to-[#16468E] px-8 py-8 text-center">
          <Logo blanco className="mx-auto h-14 object-contain" />
          <h1 className="mt-4 text-lg font-semibold text-white">Envío Masivo de Correos</h1>
          <p className="mt-1 text-sm text-white/70">CAC Santa Bárbara</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-8">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Correo</label>
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                         outline-none focus:border-[#16468E] focus:ring-1 focus:ring-[#16468E]"
              placeholder="usuario@cacsantabarbara.co" />
          </div>
          {!modoRecuperar && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Contraseña</label>
              <input
                type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                           outline-none focus:border-[#16468E] focus:ring-1 focus:ring-[#16468E]"
                placeholder="••••••••" />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {aviso && <p className="text-sm text-emerald-600">{aviso}</p>}
          <Boton type="submit" disabled={cargando} className="w-full">
            {cargando ? 'Procesando…' : modoRecuperar ? 'Enviar enlace' : 'Ingresar'}
          </Boton>
          <button type="button"
            onClick={() => { setModoRecuperar(!modoRecuperar); setError(null); setAviso(null) }}
            className="block w-full text-center text-sm text-[#16468E] hover:underline">
            {modoRecuperar ? '← Volver a ingresar' : '¿Olvidaste tu contraseña?'}
          </button>
        </form>
      </div>
    </div>
  )
}
