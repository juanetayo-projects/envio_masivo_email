import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import type { ReactElement } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Reset from './pages/Reset'
import Dashboard from './pages/Dashboard'
import Plantillas from './pages/Plantillas'
import Campanias from './pages/Campanias'

// Rutas pesadas (TipTap / Unlayer / xlsx / recharts / exceljs) en chunks aparte
const EditorPlantilla = lazy(() => import('./pages/EditorPlantilla'))
const NuevaCampania = lazy(() => import('./pages/NuevaCampania'))
const Informe = lazy(() => import('./pages/Informe'))
const Usuarios = lazy(() => import('./pages/admin/Usuarios'))

const Cargando = () => <div className="p-8 text-slate-400">Cargando…</div>

function Guard({ roles, children }: { roles?: Array<'admin' | 'editor'>; children: ReactElement }) {
  const { session, perfil, loading } = useAuth()
  if (loading) return <div className="p-8 text-slate-500">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  if (roles && perfil && !roles.includes(perfil.rol)) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Suspense fallback={<Cargando />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset" element={<Reset />} />
            <Route element={<Guard><Layout /></Guard>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/plantillas" element={<Plantillas />} />
              <Route path="/plantillas/:id" element={<EditorPlantilla />} />
              <Route path="/campanias" element={<Campanias />} />
              <Route path="/campanias/nueva" element={<NuevaCampania />} />
              <Route path="/campanias/:id/informe" element={<Informe />} />
              <Route path="/usuarios" element={<Guard roles={['admin']}><Usuarios /></Guard>} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </AuthProvider>
  )
}
