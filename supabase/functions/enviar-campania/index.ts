import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const VAR_RE = /\{\{\s*([\w.\- ]+?)\s*\}\}/g
const escapeHtml = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const fusionar = (tpl: string, datos: Record<string, unknown>) =>
  tpl.replace(VAR_RE, (_f, n) => {
    const k = String(n).trim()
    return k in datos ? escapeHtml(datos[k]) : ''
  })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) return json(500, { error: 'Falta configurar RESEND_API_KEY en los secrets de Supabase.' })

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Autorización: invocador autenticado
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json(401, { error: 'No autenticado' })

  const { campania_id } = await req.json().catch(() => ({}))
  if (!campania_id) return json(400, { error: 'Falta campania_id' })

  // Cargar campaña + plantilla
  const { data: camp } = await admin.from('campanias').select('*').eq('id', campania_id).single()
  if (!camp) return json(404, { error: 'Campaña no encontrada' })
  const { data: plantilla } = await admin.from('plantillas').select('html').eq('id', camp.plantilla_id).single()
  if (!plantilla) return json(400, { error: 'La campaña no tiene plantilla' })

  await admin.from('campanias').update({ estado: 'enviando' }).eq('id', campania_id)

  // Adjuntos (mismos para toda la campaña) -> base64
  const attachments: { filename: string; content: string }[] = []
  for (const a of (camp.adjuntos ?? [])) {
    const { data: blob } = await admin.storage.from('adjuntos-campanias').download(a.path)
    if (blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
      attachments.push({ filename: a.nombre, content: btoa(bin) })
    }
  }
  const conAdjuntos = attachments.length > 0

  // Envíos pendientes (idempotente)
  const { data: envios } = await admin.from('envios').select('*')
    .eq('campania_id', campania_id).eq('estado', 'pendiente')
  if (!envios || envios.length === 0) {
    await admin.from('campanias').update({ estado: 'enviada', enviada_at: new Date().toISOString() }).eq('id', campania_id)
    return json(200, { ok: true, enviados: 0, fallidos: 0, nota: 'Sin envíos pendientes' })
  }

  const from = `${camp.remitente_nombre} <notificaciones@cacsantabarbara.co>`
  let enviados = 0, fallidos = 0

  const construir = (e: any) => ({
    from,
    to: [e.email],
    subject: fusionar(camp.asunto, e.datos),
    html: fusionar(plantilla.html, e.datos),
    headers: { 'X-Entity-Ref-ID': e.id },
    ...(conAdjuntos ? { attachments } : {}),
  })

  const marcar = async (id: string, ok: boolean, resendId?: string, err?: string) => {
    if (ok) { enviados++; await admin.from('envios').update({ estado: 'enviado', resend_id: resendId, enviado_at: new Date().toISOString(), error: null }).eq('id', id) }
    else { fallidos++; await admin.from('envios').update({ estado: 'fallido', error: err ?? 'error' }).eq('id', id) }
  }

  if (conAdjuntos) {
    // Resend Batch API no soporta adjuntos -> envío individual con pausa (rate-limit)
    for (const e of envios) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(construir(e)),
        })
        const j = await r.json()
        if (r.ok) await marcar(e.id, true, j.id)
        else await marcar(e.id, false, undefined, j.message ?? `HTTP ${r.status}`)
      } catch (err) { await marcar(e.id, false, undefined, String(err)) }
      await sleep(600) // ~1.6 req/s, bajo el límite de 2/s
    }
  } else {
    // Lotes de 100 vía Batch API
    for (let i = 0; i < envios.length; i += 100) {
      const lote = envios.slice(i, i + 100)
      try {
        const r = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(lote.map(construir)),
        })
        const j = await r.json()
        if (r.ok && Array.isArray(j.data)) {
          for (let k = 0; k < lote.length; k++) await marcar(lote[k].id, true, j.data[k]?.id)
        } else {
          for (const e of lote) await marcar(e.id, false, undefined, j.message ?? `HTTP ${r.status}`)
        }
      } catch (err) {
        for (const e of lote) await marcar(e.id, false, undefined, String(err))
      }
      await sleep(600)
    }
  }

  await admin.from('campanias').update({
    estado: fallidos > 0 && enviados === 0 ? 'error' : 'enviada',
    enviada_at: new Date().toISOString(),
  }).eq('id', campania_id)

  return json(200, { ok: true, enviados, fallidos })
})
