import { createClient } from 'jsr:@supabase/supabase-js@2'
import { Webhook } from 'npm:svix@1.24.0'

// verify_jwt = false: Resend no envía JWT de Supabase; autenticamos por firma Svix.

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

// Prioridad de estados para no "retroceder" (delivered -> opened -> clicked)
const PRIORIDAD: Record<string, number> = {
  pendiente: 0, enviado: 1, entregado: 2, abierto: 3, clic: 4,
}
// Mapeo evento Resend -> { estado, campo timestamp }
const MAP: Record<string, { estado: string; campo?: string }> = {
  'email.sent': { estado: 'enviado', campo: 'enviado_at' },
  'email.delivered': { estado: 'entregado', campo: 'entregado_at' },
  'email.opened': { estado: 'abierto', campo: 'abierto_at' },
  'email.clicked': { estado: 'clic', campo: 'clic_at' },
  'email.bounced': { estado: 'rebote' },
  'email.delivery_delayed': { estado: 'enviado' },
  'email.complained': { estado: 'rebote' },
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  if (!secret) return json(500, { error: 'Falta RESEND_WEBHOOK_SECRET' })

  const payload = await req.text()
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  }

  let evt: any
  try {
    evt = new Webhook(secret).verify(payload, headers)
  } catch {
    return json(401, { error: 'Firma inválida' })
  }

  const tipo: string = evt.type
  const emailId: string | undefined = evt.data?.email_id
  const refId: string | undefined = evt.data?.headers?.['X-Entity-Ref-ID']
  const mapeo = MAP[tipo]
  if (!mapeo) return json(200, { ok: true, ignorado: tipo })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Localizar el envío por resend_id (email_id) o por X-Entity-Ref-ID
  let envio: any = null
  if (emailId) {
    const { data } = await admin.from('envios').select('id, estado').eq('resend_id', emailId).maybeSingle()
    envio = data
  }
  if (!envio && refId) {
    const { data } = await admin.from('envios').select('id, estado').eq('id', refId).maybeSingle()
    envio = data
  }

  if (envio) {
    const esRetroceso = PRIORIDAD[mapeo.estado] !== undefined && PRIORIDAD[envio.estado] !== undefined
      && PRIORIDAD[mapeo.estado] <= PRIORIDAD[envio.estado]
    const update: Record<string, unknown> = {}
    if (!esRetroceso) update.estado = mapeo.estado
    if (mapeo.campo) update[mapeo.campo] = new Date().toISOString()
    if (Object.keys(update).length) await admin.from('envios').update(update).eq('id', envio.id)

    await admin.from('eventos_email').insert({
      envio_id: envio.id, resend_id: emailId, tipo, payload: evt,
    })
  }

  return json(200, { ok: true })
})
