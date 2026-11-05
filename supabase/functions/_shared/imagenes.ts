// Validación de imágenes para correos. Sin dependencias, para poder probarla.

export const MAX_BYTES = 5 * 1024 * 1024
export const NOMBRE_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*\.(png|jpg|gif|webp)$/

export function tamanoBase64(base64: string): number {
  const relleno = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor(base64.length * 3 / 4) - relleno
}

// El tipo se decide por el contenido, no por la extensión: un archivo renombrado no pasa.
// SVG no se admite porque puede llevar scripts y los correos no lo muestran.
export function detectarExtension(base64: string): 'png' | 'jpg' | 'gif' | 'webp' | null {
  let b: string
  try { b = atob(base64.slice(0, 24)) } catch { return null }
  const inicia = (firma: string, desde = 0) => b.startsWith(firma, desde)
  if (inicia('\x89PNG\r\n\x1a\n')) return 'png'
  if (inicia('\xff\xd8\xff')) return 'jpg'
  if (inicia('GIF87a') || inicia('GIF89a')) return 'gif'
  if (inicia('RIFF') && inicia('WEBP', 8)) return 'webp'
  return null
}

// "Promoción Navidad (1).JPG" -> "promocion-navidad-1.jpg"
export function nombreSeguro(original: string, extension: string): string {
  const base = original.replace(/\.[^.]*$/, '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return `${base || 'imagen'}.${extension}`
}
