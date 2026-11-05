import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ejecutarCampania } from '../_shared/ejecutarCampania.ts'

// Procesa una tanda (~90 s) y responde. Con la ventana abierta, el cliente vuelve a
// llamar hasta que `terminado` sea true; si se cierra, procesar-cola la continúa.

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

  // Si el usuario cierra la ventana a mitad de camino, el servidor la continúa.
  await admin.from('campanias').update({ en_cola: true, error_detalle: null }).eq('id', campania_id)

  const r = await ejecutarCampania(admin, campania_id, RESEND_API_KEY, {
    reintentarFallidos: reintentar_fallidos,
  })
  return json(r.status, r.cuerpo)
})
