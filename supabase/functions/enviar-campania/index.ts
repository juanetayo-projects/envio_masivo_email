import { createClient } from 'jsr:@supabase/supabase-js@2'
import { procesarTanda } from './tanda.ts'
import type { Db, Envio, Progreso } from './tanda.ts'

// Procesa una tanda (~90 s) y responde. El cliente vuelve a llamar hasta que
// `terminado` sea true; si deja de llamar, la campaña se puede continuar luego.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const BLOQUEO_SEGUNDOS = 180   // mayor que lo que puede durar una tanda
const URL_ADJUNTO_SEGUNDOS = 3600

function fallar(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) return json(500, { error: 'Falta configurar RESEND_API_KEY en los secrets de Supabase.' })

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Autorización: usuario autenticado y activo
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json(401, { error: 'No autenticado' })
  const { data: perfil } = await admin.from('profiles').select('activo').eq('id', user.id).maybeSingle()
  if (!perfil?.activo) return json(403, { error: 'Tu usuario está desactivado.' })

  const { campania_id, reintentar_fallidos } = await req.json().catch(() => ({}))
  if (!campania_id) return json(400, { error: 'Falta campania_id' })

  const { data: camp } = await admin.from('campanias').select('*').eq('id', campania_id).maybeSingle()
  if (!camp) return json(404, { error: 'Campaña no encontrada' })
  const { data: plantilla } = await admin.from('plantillas').select('html').eq('id', camp.plantilla_id).maybeSingle()
  if (!plantilla) return json(400, { error: 'La campaña no tiene plantilla' })

  const progreso = async (): Promise<Progreso> => {
    const { data, error } = await admin.rpc('progreso_campania', { p_campania: campania_id })
    fallar(error)
    return data as Progreso
  }

  const { data: tomado, error: errBloqueo } = await admin.rpc('tomar_bloqueo_campania', {
    p_campania: campania_id, p_segundos: BLOQUEO_SEGUNDOS,
  })
  if (errBloqueo) return json(500, { error: errBloqueo.message })
  if (!tomado) return json(200, { ...(await progreso()), terminado: false, ocupada: true })

  try {
    if (reintentar_fallidos) {
      // Rechazados por Resend: nunca salieron, llevan clave nueva.
      fallar((await admin.from('envios').update({ estado: 'pendiente', intentos: 0, error: null })
        .eq('campania_id', campania_id).eq('estado', 'fallido').is('lote_id', null)).error)
      // Sin respuesta de Resend: pudieron salir, conservan su clave.
      fallar((await admin.from('envios').update({ estado: 'enviando', intentos: 0, error: null })
        .eq('campania_id', campania_id).eq('estado', 'fallido').not('lote_id', 'is', null)).error)
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
        const { data, error } = await admin.rpc('reclamar_lote', { p_campania: campania_id, p_limite: limite })
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
        .update(cambios).eq('id', campania_id)).error),
    }

    const resultado = await procesarTanda({
      db,
      apiKey: RESEND_API_KEY,
      from: `${camp.remitente_nombre} <notificaciones@cacsantabarbara.co>`,
      asunto: camp.asunto,
      html: plantilla.html,
      adjuntos,
    })
    return json(200, resultado)
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : String(err) })
  } finally {
    await admin.from('campanias').update({ bloqueo_hasta: null }).eq('id', campania_id)
  }
})
