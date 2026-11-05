import { createClient } from 'jsr:@supabase/supabase-js@2'

// La invoca pg_cron una vez al día (migración 0014). verify_jwt = false: se autentica con
// el token guardado en Vault. Anonimiza lo vencido y borra los adjuntos de esas campañas.

const MESES = 12

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const token = req.headers.get('x-cola-token')
  if (!token) return json(401, { error: 'No autorizado' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: valido, error: errToken } = await admin.rpc('validar_token_cola', { p_token: token })
  if (errToken) return json(500, { error: 'No se pudo validar el token' })
  if (!valido) return json(401, { error: 'No autorizado' })

  const { data: anonimizados, error: errAnon } = await admin.rpc('anonimizar_campanias_vencidas', { p_meses: MESES })
  if (errAnon) return json(500, { error: errAnon.message })

  const limite = new Date()
  limite.setMonth(limite.getMonth() - MESES)
  const { data: campanias, error: errCamp } = await admin.from('campanias').select('id, adjuntos, enviada_at, created_at')
    .eq('en_cola', false).neq('adjuntos', '[]').lt('created_at', limite.toISOString())
  if (errCamp) return json(500, { error: errCamp.message })

  let adjuntos = 0
  for (const c of campanias ?? []) {
    if (new Date(c.enviada_at ?? c.created_at) >= limite) continue
    const rutas = (c.adjuntos ?? []).map((a: { path: string }) => a.path)
    const { error } = await admin.storage.from('adjuntos-campanias').remove(rutas)
    if (error) return json(500, { error: error.message })   // se reintenta mañana
    const { error: errUpd } = await admin.from('campanias').update({ adjuntos: [] }).eq('id', c.id)
    if (errUpd) return json(500, { error: errUpd.message })
    adjuntos += rutas.length
  }

  return json(200, { ...anonimizados, adjuntos })
})
