import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import type { ReactElement } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { Boton, Card } from './components/ui'
import Layout from './components/Layout'
import Login from './pages/Login'
import Reset from './pages/Reset'
import Plantillas from './pages/Plantillas'
import Campanias from './pages/Campanias'

// Rutas pesadas (TipTap / Unlayer / xlsx / recharts / exceljs) en chunks aparte
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Baja = lazy(() => import('./pages/Baja'))
const EditorPlantilla = lazy(() => import('./pages/EditorPlantilla'))
const NuevaCampania = lazy(() => import('./pages/NuevaCampania'))
const Informe = lazy(() => import('./pages/Informe'))
const Usuarios = lazy(() => import('./pages/admin/Usuarios'))
const Bloqueados = lazy(() => import('./pages/Bloqueados'))
const Remitentes = lazy(() => import('./pages/admin/Remitentes'))

const Cargando = () => <div className="p-8 text-slate-400">Cargando…</div>

function CuentaInactiva() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="max-w-md text-center">
        <p className="font-medium text-slate-800">Tu usuario está desactivado</p>
        <p className="mt-1 mb-4 text-sm text-slate-500">Contacta a un administrador para recuperar el acceso.</p>
        <Boton variante="secundario" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Boton>
      </Card>
    </div>
  )
}

function Guard({ roles, children }: { roles?: Array<'admin' | 'editor'>; children: ReactElement }) {
  const { session, perfil, loading } = useAuth()
  if (loading) return <div className="p-8 text-slate-500">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  if (perfil && !perfil.activo) return <CuentaInactiva />
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
            <Route path="/baja" element={<Baja />} />
            <Route element={<Guard><Layout /></Guard>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/plantillas" element={<Plantillas />} />
              <Route path="/plantillas/:id" element={<EditorPlantilla />} />
              <Route path="/campanias" element={<Campanias />} />
              <Route path="/campanias/nueva" element={<NuevaCampania />} />
              <Route path="/campanias/:id/informe" element={<Informe />} />
              <Route path="/bloqueados" element={<Bloqueados />} />
              <Route path="/remitentes" element={<Guard roles={['admin']}><Remitentes /></Guard>} />
              <Route path="/usuarios" element={<Guard roles={['admin']}><Usuarios /></Guard>} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </AuthProvider>
  )
}
