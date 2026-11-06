import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Logo } from './ui'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/campanias/nueva', label: 'Nueva campaña', icon: '✉️' },
  { to: '/campanias', label: 'Campañas', icon: '📨' },
  { to: '/bloqueados', label: 'Lista de bloqueo', icon: '🚫' },
]

const configItems = [
  { to: '/plantillas', label: 'Plantillas', icon: '🎨', soloAdmin: false },
  { to: '/imagenes', label: 'Imágenes', icon: '🖼️', soloAdmin: false },
  { to: '/remitentes', label: 'Remitentes', icon: '📤', soloAdmin: true },
  { to: '/usuarios', label: 'Usuarios', icon: '👤', soloAdmin: true },
]

export default function Layout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { perfil, esAdmin } = useAuth()
  const enConfig = configItems.some((it) => pathname.startsWith(it.to))
  const [configAbierta, setConfigAbierta] = useState(enConfig)

  async function salir() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
    }`

  // Si estás dentro de Configuración, el grupo permanece visible.
  const mostrarConfig = configAbierta || enConfig

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-60 flex-col bg-gradient-to-b from-[#0D2D6B] to-[#16468E] p-4">
        <div className="mb-6 px-1">
          <Logo blanco className="h-9 object-contain" />
          <p className="mt-2 text-sm font-semibold text-white">Envío Masivo Emails</p>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.to === '/campanias'} className={linkClass}>
              <span>{it.icon}</span>{it.label}
            </NavLink>
          ))}

          <button type="button" aria-expanded={mostrarConfig} onClick={() => setConfigAbierta(!mostrarConfig)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white">
            <span>⚙️</span>Configuración
            <span className={`ml-auto text-xs transition-transform ${mostrarConfig ? 'rotate-90' : ''}`}>▶</span>
          </button>
          {mostrarConfig && (
            <div className="ml-3 space-y-1 border-l border-white/15 pl-2">
              {configItems.filter((it) => esAdmin || !it.soloAdmin).map((it) => (
                <NavLink key={it.to} to={it.to} className={linkClass}>
                  <span>{it.icon}</span>{it.label}
                </NavLink>
              ))}
            </div>
          )}
        </nav>
        <div className="mt-4 border-t border-white/15 pt-4">
          <p className="px-1 text-xs text-white/60">{perfil?.nombre ?? perfil?.email}</p>
          <button onClick={salir}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-white/75 hover:bg-white/10 hover:text-white">
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
