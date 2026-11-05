import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { mensajeDeError } from '../lib/envioCampania'
import { Boton, Modal } from './ui'

type Imagen = { nombre: string; url: string; tamano: number }

const MAX_BYTES = 5 * 1024 * 1024
const AVISO_BYTES = 1024 * 1024       // más que esto hace pesado el correo
const ESPERA_PUBLICACION_MS = 10_000

export const codigoImg = (url: string) =>
  `<img src="${url}" alt="" style="display:block;max-width:100%;height:auto;border:0" />`

function leerBase64(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '')
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'))
    lector.readAsDataURL(archivo)
  })
}

export default function GaleriaImagenes() {
  const { esAdmin } = useAuth()
  const [imagenes, setImagenes] = useState<Imagen[]>([])
  const [publicadas, setPublicadas] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [aEliminar, setAEliminar] = useState<Imagen | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const llamar = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('imagenes', { body })
    if (error) throw new Error(await mensajeDeError(error))
    return data
  }, [])

  useEffect(() => {
    llamar({ accion: 'listar' })
      .then((d) => setImagenes(d.imagenes))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }, [llamar])

  // GitHub Pages tarda en publicar: se revisa hasta que cada imagen responde.
  const pendientes = imagenes.filter((i) => !publicadas.has(i.nombre)).map((i) => i.url).join('|')
  useEffect(() => {
    if (!pendientes) return
    let activo = true
    const revisar = async () => {
      for (const url of pendientes.split('|')) {
        const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null)
        if (activo && r?.ok) {
          const nombre = url.slice(url.lastIndexOf('/') + 1)
          setPublicadas((s) => new Set(s).add(nombre))
        }
      }
    }
    revisar()
    const intervalo = setInterval(revisar, ESPERA_PUBLICACION_MS)
    return () => { activo = false; clearInterval(intervalo) }
  }, [pendientes])

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (archivos.length === 0) return
    setSubiendo(true); setError(null)
    const errores: string[] = []
    // Una por una: cada subida es un commit y GitHub rechaza commits simultáneos.
    for (const archivo of archivos) {
      if (archivo.size > MAX_BYTES) { errores.push(`${archivo.name}: supera el máximo de 5 MB.`); continue }
      try {
        const nueva: Imagen = await llamar({ accion: 'subir', nombre: archivo.name, base64: await leerBase64(archivo) })
        setImagenes((lista) => [nueva, ...lista.filter((i) => i.nombre !== nueva.nombre)])
      } catch (err) {
        errores.push(`${archivo.name}: ${err instanceof Error ? err.message : 'no se pudo subir'}`)
      }
    }
    setSubiendo(false)
    if (errores.length) setError(errores.join(' '))
  }

  async function eliminar() {
    if (!aEliminar) return
    const imagen = aEliminar
    setAEliminar(null); setError(null)
    try {
      await llamar({ accion: 'eliminar', nombre: imagen.nombre })
      setImagenes((lista) => lista.filter((i) => i.nombre !== imagen.nombre))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  async function copiar(texto: string, clave: string) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(clave)
      setTimeout(() => setCopiado((c) => (c === clave ? null : c)), 2000)
    } catch {
      setError(`No se pudo copiar automáticamente. Copia esto: ${texto}`)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" onChange={subir} className="hidden" />
        <Boton onClick={() => input.current?.click()} disabled={subiendo}>
          {subiendo ? 'Subiendo…' : '⬆ Subir imágenes'}
        </Boton>
        <span className="text-xs text-slate-500">PNG, JPG, GIF o WEBP, hasta 5 MB. Lo ideal es menos de 1 MB.</span>
      </div>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Las imágenes quedan <b>públicas y permanentes</b> en el repositorio de GitHub, incluso después de eliminarlas.
        No subas documentos ni fotos con datos personales.
      </p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {cargando && <p className="text-sm text-slate-400">Cargando…</p>}
      {!cargando && imagenes.length === 0 && !error && <p className="text-sm text-slate-400">Aún no hay imágenes.</p>}

      <ul className="space-y-2">
        {imagenes.map((i) => {
          const lista = publicadas.has(i.nombre)
          return (
            <li key={i.nombre} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-2">
              <div className="flex h-14 w-20 items-center justify-center overflow-hidden rounded bg-slate-100">
                {lista
                  ? <img src={i.url} alt={i.nombre} className="max-h-full max-w-full object-contain" />
                  : <span className="text-[10px] text-slate-400">Publicando</span>}
              </div>
              <div className="min-w-[160px] flex-1">
                <p className="break-all text-sm font-medium text-slate-800">{i.nombre}</p>
                <p className={`text-xs ${!lista ? 'text-amber-700' : i.tamano > AVISO_BYTES ? 'text-amber-700' : 'text-slate-400'}`}>
                  {(i.tamano / 1024).toFixed(0)} KB
                  {!lista ? ' · Publicando, tarda 1 o 2 minutos' : i.tamano > AVISO_BYTES ? ' · Pesada: puede tardar en cargar' : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Boton variante="secundario" onClick={() => copiar(i.url, `u:${i.nombre}`)}>
                  {copiado === `u:${i.nombre}` ? '✓ Copiada' : 'Copiar URL'}
                </Boton>
                <Boton variante="secundario" onClick={() => copiar(codigoImg(i.url), `c:${i.nombre}`)}>
                  {copiado === `c:${i.nombre}` ? '✓ Copiado' : 'Copiar código'}
                </Boton>
                {esAdmin && <Boton variante="secundario" onClick={() => setAEliminar(i)}>Eliminar</Boton>}
              </div>
            </li>
          )
        })}
      </ul>

      <Modal open={aEliminar !== null} onClose={() => setAEliminar(null)} titulo="Eliminar imagen">
        <p className="text-sm text-slate-600">
          ¿Eliminar <b>{aEliminar?.nombre}</b>? Dejará de verse en los correos ya enviados y en las plantillas que la usen.
          Seguirá existiendo en el historial del repositorio.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setAEliminar(null)}>Cancelar</Boton>
          <Boton onClick={eliminar}>Eliminar</Boton>
        </div>
      </Modal>
    </div>
  )
}
