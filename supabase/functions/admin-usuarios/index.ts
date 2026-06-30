import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 1) identificar al invocador con su JWT
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json(401, { error: 'No autenticado' })

  // 2) verificar rol admin
  const { data: perfil } = await admin
    .from('profiles').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'admin') return json(403, { error: 'Solo admin' })

  // 3) ejecutar la acción
  let body: any = {}
  try { body = await req.json() } catch { /* noop */ }
  const { accion, email, password, nombre, rol, id } = body

  if (accion === 'crear') {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (error) return json(400, { error: error.message })
    const { error: pe } = await admin.from('profiles').insert({
      id: data.user.id, email, nombre, rol: rol ?? 'editor',
    })
    if (pe) return json(400, { error: pe.message })
    return json(200, { ok: true, id: data.user.id })
  }

  if (accion === 'eliminar') {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return json(400, { error: error.message })
    return json(200, { ok: true })
  }

  if (accion === 'reset') {
    const { error } = await admin.auth.admin.updateUserById(id, { password })
    if (error) return json(400, { error: error.message })
    return json(200, { ok: true })
  }

  if (accion === 'activar') {
    const { error } = await admin.from('profiles')
      .update({ activo: body.activo }).eq('id', id)
    if (error) return json(400, { error: error.message })
    return json(200, { ok: true })
  }

  return json(400, { error: 'Acción inválida' })
})
