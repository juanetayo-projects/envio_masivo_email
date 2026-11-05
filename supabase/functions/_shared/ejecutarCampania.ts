// Ejecuta una tanda de una campaña. Lo usan enviar-campania (usuario con la
// ventana abierta) y procesar-cola (servidor); el bloqueo impide que se pisen.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { formatearRemitente } from './merge.ts'
import { procesarTanda } from './tanda.ts'
import type { Db, Envio, Progreso } from './tanda.ts'

const BLOQUEO_SEGUNDOS = 180   // mayor que lo que puede durar una tanda
const URL_ADJUNTO_SEGUNDOS = 3600

function fallar(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export type Resultado = { status: number; cuerpo: Record<string, unknown> }

export async function ejecutarCampania(
  admin: SupabaseClient,
  campaniaId: string,
  apiKey: string,
  opciones: { reintentarFallidos?: boolean } = {},
): Promise<Resultado> {
  // Un error que un reintento no arregla saca la campaña de la cola y queda visible.
  const detener = async (error_detalle: string) => {
    await admin.from('campanias').update({ estado: 'error', en_cola: false, error_detalle }).eq('id', campaniaId)
  }

  const { data: camp } = await admin.from('campanias').select('*').eq('id', campaniaId).maybeSingle()
  if (!camp) return { status: 404, cuerpo: { error: 'Campaña no encontrada' } }
  const { data: plantilla } = await admin.from('plantillas').select('html').eq('id', camp.plantilla_id).maybeSingle()
  if (!plantilla) {
    const error = 'La campaña no tiene plantilla'
    await detener(error)
    return { status: 400, cuerpo: { error } }
  }

  // Revisa en cada tanda que la dirección siga autorizada en el catálogo.
  const { data: remitente } = await admin.from('remitentes').select('id')
    .eq('email', camp.remitente_email).eq('activo', true).maybeSingle()
  if (!remitente) {
    const error = `El remitente ${camp.remitente_email} no está autorizado o está inactivo`
    await detener(error)
    return { status: 400, cuerpo: { error } }
  }

  const progreso = async (): Promise<Progreso> => {
    const { data, error } = await admin.rpc('progreso_campania', { p_campania: campaniaId })
    fallar(error)
    return data as Progreso
  }

  const { data: tomado, error: errBloqueo } = await admin.rpc('tomar_bloqueo_campania', {
    p_campania: campaniaId, p_segundos: BLOQUEO_SEGUNDOS,
  })
  if (errBloqueo) return { status: 500, cuerpo: { error: errBloqueo.message } }
  if (!tomado) return { status: 200, cuerpo: { ...(await progreso()), terminado: false, ocupada: true } }

  try {
    if (opciones.reintentarFallidos) {
      // Rechazados por Resend: nunca salieron, llevan clave nueva.
      fallar((await admin.from('envios').update({ estado: 'pendiente', intentos: 0, error: null })
        .eq('campania_id', campaniaId).eq('estado', 'fallido').is('lote_id', null)).error)
      // Sin respuesta de Resend: pudieron salir, conservan su clave.
      fallar((await admin.from('envios').update({ estado: 'enviando', intentos: 0, error: null })
        .eq('campania_id', campaniaId).eq('estado', 'fallido').not('lote_id', 'is', null)).error)
    }

    // Si un adjunto no está disponible se detiene: no se envía el correo sin él.
    const adjuntos: { filename: string; path: string }[] = []
    for (const a of (camp.adjuntos ?? [])) {
      const { data, error } = await admin.storage.from('adjuntos-campanias')
        .createSignedUrl(a.path, URL_ADJUNTO_SEGUNDOS)
      if (error || !data) throw new Error(`No se pudo leer el adjunto ${a.nombre}: ${error?.message ?? ''}`)
      adjuntos.push({ filename: a.nombre, path: data.signedUrl })
    }

    const db: Db = {
      reclamarLote: async (limite) => {
        const { data, error } = await admin.rpc('reclamar_lote', { p_campania: campaniaId, p_limite: limite })
        fallar(error)
        return (data ?? []) as Envio[]
      },
      marcarEnviados: async (items) => fallar((await admin.rpc('marcar_enviados', { p_items: items })).error),
      marcarFallido: async (id, error) => fallar((await admin.from('envios')
        .update({ estado: 'fallido', error, lote_id: null }).eq('id', id).eq('estado', 'enviando')).error),
      liberar: async (ids) => fallar((await admin.from('envios')
        .update({ estado: 'pendiente', lote_id: null, intentos: 0 }).in('id', ids).eq('estado', 'enviando')).error),
      progreso,
      actualizarCampania: async (cambios) => fallar((await admin.from('campanias')
        .update({ ...cambios, en_cola: false }).eq('id', campaniaId)).error),
    }

    const resultado = await procesarTanda({
      db,
      apiKey,
      from: formatearRemitente(camp.remitente_nombre, camp.remitente_email),
      replyTo: camp.responder_a,
      remitente: camp.remitente_nombre,
      incluirBaja: camp.incluir_baja,
      urlFuncionBaja: `${Deno.env.get('SUPABASE_URL')}/functions/v1/baja`,
      asunto: camp.asunto,
      html: plantilla.html,
      adjuntos,
    })
    return { status: 200, cuerpo: resultado }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await detener(error)
    return { status: 500, cuerpo: { error } }
  } finally {
    await admin.from('campanias').update({ bloqueo_hasta: null }).eq('id', campaniaId)
  }
}
