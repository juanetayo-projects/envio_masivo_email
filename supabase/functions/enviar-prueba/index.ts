import { createClient } from 'jsr:@supabase/supabase-js@2'
import { formatearRemitente, fusionar, fusionarAsunto } from '../_shared/merge.ts'

// Envía un correo de prueba SOLO al correo de quien inició sesión: el destino no se
// recibe del cliente, así que no sirve para escribir a terceros desde el dominio.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) return json(500, { error: 'Falta configurar RESEND_API_KEY en los secrets de Supabase.' })

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await caller.auth.getUser()
  if (!user?.email) return json(401, { error: 'No autenticado' })
  const { data: perfil } = await admin.from('profiles').select('activo').eq('id', user.id).maybeSingle()
  if (!perfil?.activo) return json(403, { error: 'Tu usuario está desactivado.' })

  const { plantilla_id, asunto, datos, adjuntos, remitente_id, remitente_nombre, responder_a } = await req.json().catch(() => ({}))
  if (!plantilla_id || !asunto) return json(400, { error: 'Faltan la plantilla o el asunto' })

  const { data: plantilla } = await admin.from('plantillas').select('html').eq('id', plantilla_id).maybeSingle()
  if (!plantilla) return json(404, { error: 'Plantilla no encontrada' })

  const { data: remitente } = await admin.from('remitentes').select('*')
    .eq('id', remitente_id).eq('activo', true).maybeSingle()
  if (!remitente) return json(400, { error: 'El remitente no existe o está inactivo' })

  const replyTo = String(responder_a ?? '').trim() || remitente.responder_a
  const attachments: { filename: string; path: string }[] = []
  for (const a of (adjuntos ?? [])) {
    const { data, error } = await admin.storage.from('adjuntos-campanias').createSignedUrl(a.path, 3600)
    if (error || !data) return json(400, { error: `No se pudo leer el adjunto ${a.nombre}` })
    attachments.push({ filename: a.nombre, path: data.signedUrl })
  }

  const valores = datos ?? {}
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: formatearRemitente(String(remitente_nombre ?? '').trim() || remitente.nombre, remitente.email),
      ...(replyTo ? { reply_to: replyTo } : {}),
      to: [user.email],
      subject: `[PRUEBA] ${fusionarAsunto(asunto, valores)}`,
      html: fusionar(plantilla.html, valores),
      ...(attachments.length ? { attachments } : {}),
    }),
  })
  if (!r.ok) {
    const cuerpo = await r.json().catch(() => null)
    return json(502, { error: cuerpo?.message ?? `Resend respondió HTTP ${r.status}` })
  }
  return json(200, { ok: true, para: user.email })
})
