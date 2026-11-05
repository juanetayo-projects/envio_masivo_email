import { createClient } from 'jsr:@supabase/supabase-js@2'
import { enlaceBaja } from '../_shared/merge.ts'

// Baja voluntaria de un destinatario. Es pública (verify_jwt = false): el token es el
// id aleatorio de su envío, que solo conoce quien recibió el correo.
//   POST: da de baja. Lo usa la página de confirmación y el "un clic" de Gmail (RFC 8058).
//   GET:  solo redirige a la página. Los antivirus abren los enlaces de los correos,
//         así que abrirlo nunca debe dar de baja a nadie.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const enUrl = new URL(req.url).searchParams.get('t')
  if (req.method === 'GET') {
    return new Response(null, { status: 302, headers: { Location: enlaceBaja(enUrl ?? '') } })
  }
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })

  // El "un clic" envía el token en la URL; la página lo envía en el cuerpo.
  const token: string = enUrl ?? (await req.json().catch(() => ({}))).t ?? ''
  if (!UUID.test(token)) return json(400, { error: 'Enlace inválido' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: envio } = await admin.from('envios').select('email').eq('id', token).maybeSingle()
  if (!envio) return json(404, { error: 'Enlace inválido' })
  // Pasados 12 meses el correo ya no se conserva: el enlace antiguo no tiene a quién dar de baja.
  if (String(envio.email).endsWith('@eliminado.invalid')) return json(410, { error: 'Enlace vencido' })

  const { error } = await admin.from('correos_bloqueados').upsert(
    { email: String(envio.email).trim().toLowerCase(), motivo: 'baja', nota: 'Solicitada por el destinatario' },
    { onConflict: 'email', ignoreDuplicates: true },
  )
  if (error) return json(500, { error: 'No se pudo registrar la baja' })
  return json(200, { ok: true })
})
