import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ejecutarCampania } from '../_shared/ejecutarCampania.ts'

// La invoca pg_cron cada minuto mientras haya campañas en cola (migración 0009).
// verify_jwt = false: se autentica con el token guardado en Vault.

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const token = req.headers.get('x-cola-token')
  if (!token) return json(401, { error: 'No autorizado' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: valido, error: errToken } = await admin.rpc('validar_token_cola', { p_token: token })
  if (errToken) return json(500, { error: 'No se pudo validar el token' })
  if (!valido) return json(401, { error: 'No autorizado' })

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) return json(500, { error: 'Falta configurar RESEND_API_KEY en los secrets de Supabase.' })

  // La más antigua sin una tanda activa; si la primera sigue ocupada, avanza otra.
  const { data: camp, error } = await admin.from('campanias').select('id')
    .eq('en_cola', true)
    .or(`bloqueo_hasta.is.null,bloqueo_hasta.lt.${new Date().toISOString()}`)
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (error) return json(500, { error: error.message })
  if (!camp) return json(200, { ok: true, sin_trabajo: true })

  const r = await ejecutarCampania(admin, camp.id, RESEND_API_KEY)
  return json(r.status, { campania_id: camp.id, ...r.cuerpo })
})
