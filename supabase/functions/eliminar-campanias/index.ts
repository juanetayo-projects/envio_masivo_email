import { createClient } from 'jsr:@supabase/supabase-js@2'

// Elimina campañas con sus envíos, eventos y adjuntos. Solo para administradores.
// Se hace en el servidor porque el navegador no debe borrar archivos ajenos de Storage
// y porque hay que rechazar las campañas que se están enviando.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const MAX_POR_LLAMADA = 200

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json(401, { error: 'No autenticado' })
  const { data: perfil } = await admin.from('profiles').select('activo, rol').eq('id', user.id).maybeSingle()
  if (!perfil?.activo || perfil.rol !== 'admin') return json(403, { error: 'Solo un administrador puede eliminar campañas.' })

  const { ids } = await req.json().catch(() => ({}))
  if (!Array.isArray(ids) || ids.length === 0) return json(400, { error: 'No se indicaron campañas.' })
  if (ids.length > MAX_POR_LLAMADA) return json(400, { error: `Elimina como máximo ${MAX_POR_LLAMADA} a la vez.` })

  const { data: campanias, error } = await admin.from('campanias')
    .select('id, nombre, adjuntos, en_cola, bloqueo_hasta').in('id', ids)
  if (error) return json(400, { error: 'Campañas inválidas.' })

  const eliminadas: string[] = []
  const rechazadas: { nombre: string; motivo: string }[] = []

  for (const c of campanias ?? []) {
    const bloqueada = c.bloqueo_hasta && new Date(c.bloqueo_hasta) > new Date()
    if (c.en_cola || bloqueada) {
      rechazadas.push({ nombre: c.nombre, motivo: 'se está enviando; espera a que termine' })
      continue
    }
    // Primero los archivos: si esto falla, la campaña sigue y se puede reintentar.
    const rutas = (c.adjuntos ?? []).map((a: { path: string }) => a.path)
    if (rutas.length > 0) {
      const { error: errArchivos } = await admin.storage.from('adjuntos-campanias').remove(rutas)
      if (errArchivos) {
        rechazadas.push({ nombre: c.nombre, motivo: 'no se pudieron borrar sus adjuntos' })
        continue
      }
    }
    const { error: errBorrar } = await admin.from('campanias').delete().eq('id', c.id)
    if (errBorrar) rechazadas.push({ nombre: c.nombre, motivo: 'no se pudo eliminar' })
    else eliminadas.push(c.id)
  }

  return json(200, { eliminadas, rechazadas })
})
