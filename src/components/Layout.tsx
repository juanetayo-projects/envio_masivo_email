import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Logo } from './ui'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/plantillas', label: 'Plantillas', icon: '🎨' },
  { to: '/campanias/nueva', label: 'Nueva campaña', icon: '✉️' },
  { to: '/campanias', label: 'Campañas', icon: '📨' },
]

export default function Layout() {
  const navigate = useNavigate()
  const { perfil, esAdmin } = useAuth()

  async function salir() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
    }`

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-60 flex-col bg-gradient-to-b from-[#0D2D6B] to-[#16468E] p-4">
        <div className="mb-6 flex items-center gap-2 px-1">
          <Logo blanco className="h-9 object-contain" />
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.to === '/campanias'} className={linkClass}>
              <span>{it.icon}</span>{it.label}
            </NavLink>
          ))}
          {esAdmin && (
            <NavLink to="/usuarios" className={linkClass}>
              <span>👤</span>Usuarios
            </NavLink>
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
