import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Boton, Card } from '../components/ui'

// Página pública: sin marca, porque las campañas pueden ser de distintos remitentes.
// Pide confirmar con un clic para que abrir el enlace no dé de baja a nadie.
export default function Baja() {
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const [estado, setEstado] = useState<'inicial' | 'enviando' | 'listo' | 'error'>('inicial')

  async function confirmar() {
    setEstado('enviando')
    const { error } = await supabase.functions.invoke('baja', { body: { t: token } })
    setEstado(error ? 'error' : 'listo')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md text-center">
        {token === 'prueba' ? (
          <>
            <p className="font-medium text-slate-800">Este es un correo de prueba</p>
            <p className="mt-1 text-sm text-slate-500">En una campaña real, este enlace da de baja al destinatario.</p>
          </>
        ) : estado === 'listo' ? (
          <>
            <p className="font-medium text-slate-800">Listo, te dimos de baja</p>
            <p className="mt-1 text-sm text-slate-500">No recibirás más campañas en este correo.</p>
          </>
        ) : estado === 'error' ? (
          <>
            <p className="font-medium text-slate-800">No pudimos procesar tu solicitud</p>
            <p className="mt-1 mb-4 text-sm text-slate-500">El enlace no es válido o hubo un error. Intenta de nuevo o responde al correo.</p>
            <Boton variante="secundario" onClick={confirmar}>Intentar de nuevo</Boton>
          </>
        ) : (
          <>
            <p className="font-medium text-slate-800">¿Dejar de recibir estos correos?</p>
            <p className="mt-1 mb-4 text-sm text-slate-500">Confirma para que no te enviemos más campañas.</p>
            <Boton onClick={confirmar} disabled={estado === 'enviando' || !token}>
              {estado === 'enviando' ? 'Procesando…' : 'Confirmar baja'}
            </Boton>
          </>
        )}
      </Card>
    </div>
  )
}
