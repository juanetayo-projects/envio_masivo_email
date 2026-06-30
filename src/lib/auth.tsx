import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'

export type Perfil = {
  id: string
  email: string | null
  nombre: string | null
  rol: 'admin' | 'editor'
  activo: boolean
}

type AuthCtx = {
  session: Session | null
  perfil: Perfil | null
  loading: boolean
  esAdmin: boolean
}

const Ctx = createContext<AuthCtx>({
  session: null, perfil: null, loading: true, esAdmin: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Resolver loading con .finally() y cargar el perfil en 2º plano
    // (evita quedar colgado en "Cargando" si falla la consulta del perfil).
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session)
        if (data.session) cargarPerfil(data.session.user.id)
      })
      .finally(() => setLoading(false))

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) cargarPerfil(s.user.id)
      else setPerfil(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function cargarPerfil(uid: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    if (data) setPerfil(data as Perfil)
  }

  return (
    <Ctx.Provider value={{ session, perfil, loading, esAdmin: perfil?.rol === 'admin' }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
