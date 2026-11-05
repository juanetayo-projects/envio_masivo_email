import { supabase } from './supabase'

export type Progreso = { total: number; enviados: number; fallidos: number; pendientes: number; omitidos?: number }

// Mensaje del servidor cuando una función responde con error.
export async function mensajeDeError(error: { message: string; context?: Response }): Promise<string> {
  const cuerpo = await error.context?.json?.().catch(() => null)
  return cuerpo?.error ?? error.message
}

type Tanda = Progreso & {
  terminado: boolean
  ocupada?: boolean
  detenida?: string
  espera_ms?: number
}

const ESPERA_OCUPADA_MS = 15_000
const ESPERA_ERROR_MS = 5_000
const MAX_ERRORES_SEGUIDOS = 3
const MAX_ESPERAS_OCUPADA = 16   // más que los 180 s del bloqueo de la campaña
const SONDEO_PROGRESO_MS = 2_000

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Llama tandas hasta terminar. Repetir es seguro: el servidor no reenvía lo ya enviado.
// Si falla la conexión o se cierra la ventana, el servidor continúa la campaña solo.
export async function ejecutarEnvio(
  campaniaId: string,
  onProgreso: (p: Progreso) => void,
  opciones: { reintentarFallidos?: boolean } = {},
): Promise<Progreso> {
  let reintentar = opciones.reintentarFallidos ?? false
  let errores = 0
  let esperasOcupada = 0

  // Una tanda puede durar 90 s: entre tanto, la barra se actualiza desde la base.
  let activo = true
  const sondeo = setInterval(async () => {
    const { data } = await supabase.rpc('progreso_campania', { p_campania: campaniaId })
    if (activo && data) onProgreso(data as Progreso)
  }, SONDEO_PROGRESO_MS)

  try {
    return await llamarTandas()
  } finally {
    activo = false
    clearInterval(sondeo)
  }

  async function llamarTandas(): Promise<Progreso> {
    for (;;) {
      const { data, error } = await supabase.functions.invoke<Tanda>('enviar-campania', {
        body: { campania_id: campaniaId, reintentar_fallidos: reintentar },
      })

      if (error) {
        const estado = (error as { context?: Response }).context?.status
        if (estado !== undefined && estado < 500) throw new Error(await mensajeDeError(error))
        // Corte de red o del servidor: lo enviado ya quedó registrado.
        if (++errores >= MAX_ERRORES_SEGUIDOS) {
          throw new Error('Se perdió la conexión con el servidor. El envío continúa en segundo plano: revisa el informe de la campaña.')
        }
        await esperar(ESPERA_ERROR_MS)
        continue
      }
      if (!data) throw new Error('Respuesta vacía del servidor')
      errores = 0

      onProgreso(data)
      if (data.ocupada) {
        if (++esperasOcupada > MAX_ESPERAS_OCUPADA) {
          throw new Error('Otra sesión está enviando esta campaña. Intenta de nuevo en unos minutos.')
        }
        await esperar(ESPERA_OCUPADA_MS)
        continue
      }
      esperasOcupada = 0
      reintentar = false

      if (data.detenida) throw new Error(`Envío detenido: ${data.detenida}`)
      if (data.terminado) return data
      if (data.espera_ms) await esperar(data.espera_ms)
    }
  }
}
