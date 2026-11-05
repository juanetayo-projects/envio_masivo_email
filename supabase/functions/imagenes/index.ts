import { createClient } from 'jsr:@supabase/supabase-js@2'
import { APP_URL } from '../_shared/merge.ts'
import { MAX_BYTES, NOMBRE_VALIDO, detectarExtension, nombreSeguro, tamanoBase64 } from '../_shared/imagenes.ts'

// Sube imágenes de correos al repositorio; GitHub Pages las publica tras el despliegue.
// El token de GitHub vive solo aquí, como secret, y nunca llega al navegador.

const REPO = 'juanetayo-projects/envio_masivo_email'
const RAMA = 'main'
const RUTA = 'public/images/correos'
const urlPublica = (nombre: string) => `${APP_URL}images/correos/${nombre}`

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

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
  if (!perfil?.activo) return json(403, { error: 'Tu usuario está desactivado.' })

  const token = Deno.env.get('GITHUB_IMAGENES_TOKEN')
  if (!token) return json(503, { error: 'Falta configurar GITHUB_IMAGENES_TOKEN en los secrets de Supabase.' })

  const github = (ruta: string, init: RequestInit = {}) => fetch(`https://api.github.com/repos/${REPO}/contents/${ruta}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'envio-masivo-email',
      'Content-Type': 'application/json',
    },
  })
  const fallaGithub = (status: number) => (status === 401 || status === 403)
    ? json(502, { error: 'GitHub rechazó el token: revisa que esté vigente y tenga permiso de escritura en el repositorio.' })
    : json(502, { error: `GitHub respondió HTTP ${status}. Intenta de nuevo.` })

  const cuerpo = await req.json().catch(() => ({}))

  if (cuerpo.accion === 'listar') {
    const r = await github(`${RUTA}?ref=${RAMA}`)
    if (r.status === 404) return json(200, { imagenes: [] })
    if (!r.ok) return fallaGithub(r.status)
    const archivos: { type: string; name: string; size: number }[] = await r.json()
    const imagenes = archivos
      .filter((a) => a.type === 'file' && /\.(png|jpe?g|gif|webp)$/i.test(a.name))
      .map((a) => ({ nombre: a.name, url: urlPublica(a.name), tamano: a.size }))
    return json(200, { imagenes })
  }

  if (cuerpo.accion === 'subir') {
    const contenido = String(cuerpo.base64 ?? '')
    const extension = detectarExtension(contenido)
    if (!extension) return json(400, { error: 'El archivo no es una imagen PNG, JPG, GIF o WEBP.' })
    if (tamanoBase64(contenido) > MAX_BYTES) return json(413, { error: 'La imagen supera el máximo de 5 MB.' })

    const nombre = nombreSeguro(String(cuerpo.nombre ?? ''), extension)
    const subir = (destino: string) => github(`${RUTA}/${destino}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `Imagen de correo: ${destino}`, content: contenido, branch: RAMA }),
    })
    // Sin "sha", GitHub nunca sobrescribe: un nombre repetido devuelve 422 y se usa otro,
    // para no cambiar la imagen de correos que ya se enviaron.
    let final = nombre
    let r = await subir(final)
    if (r.status === 422) {
      final = nombre.replace(/\.(\w+)$/, `-${crypto.randomUUID().slice(0, 6)}.$1`)
      r = await subir(final)
    }
    if (!r.ok) return fallaGithub(r.status)
    return json(200, { nombre: final, url: urlPublica(final), tamano: tamanoBase64(contenido) })
  }

  if (cuerpo.accion === 'eliminar') {
    if (perfil.rol !== 'admin') return json(403, { error: 'Solo un administrador puede eliminar imágenes.' })
    const nombre = String(cuerpo.nombre ?? '')
    // Evita salir de la carpeta de imágenes con rutas como ../../src/App.tsx
    if (!NOMBRE_VALIDO.test(nombre) && !/^[a-z0-9-]+\.jpeg$/.test(nombre)) return json(400, { error: 'Nombre inválido' })
    const actual = await github(`${RUTA}/${nombre}?ref=${RAMA}`)
    if (actual.status === 404) return json(200, { ok: true })
    if (!actual.ok) return fallaGithub(actual.status)
    const { sha } = await actual.json()
    const r = await github(`${RUTA}/${nombre}`, {
      method: 'DELETE',
      body: JSON.stringify({ message: `Elimina imagen de correo: ${nombre}`, sha, branch: RAMA }),
    })
    if (!r.ok) return fallaGithub(r.status)
    return json(200, { ok: true })
  }

  return json(400, { error: 'Acción inválida' })
})
