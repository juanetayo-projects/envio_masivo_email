import { supabase } from './supabase'

export type Progreso = { total: number; enviados: number; fallidos: number; pendientes: number }

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

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Llama tandas hasta terminar. Repetir es seguro: el servidor no reenvía lo ya enviado.
// Si falla o se cierra la ventana, la campaña se puede continuar desde su informe.
export async function ejecutarEnvio(
  campaniaId: string,
  onProgreso: (p: Progreso) => void,
  opciones: { reintentarFallidos?: boolean } = {},
): Promise<Progreso> {
  let reintentar = opciones.reintentarFallidos ?? false
  let errores = 0
  let esperasOcupada = 0

  for (;;) {
    const { data, error } = await supabase.functions.invoke<Tanda>('enviar-campania', {
      body: { campania_id: campaniaId, reintentar_fallidos: reintentar },
    })

    if (error) {
      const respuesta: Response | undefined = (error as { context?: Response }).context
      const estado = respuesta?.status
      if (estado !== undefined && estado < 500) {
        const cuerpo = await respuesta?.json().catch(() => null)
        throw new Error(cuerpo?.error ?? error.message)
      }
      // Corte de red o del servidor: lo enviado ya quedó registrado.
      if (++errores >= MAX_ERRORES_SEGUIDOS) {
        throw new Error('Se perdió la conexión con el servidor. Lo enviado quedó registrado: puedes continuar más tarde.')
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
