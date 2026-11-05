// Variables {{columna}}. Lo usan la vista previa (src/lib/merge.ts) y el envío
// real (enviar-campania), para que lo que se revisa sea lo que se envía.

// Admite tildes y espacios; excluye etiquetas HTML dentro de las llaves.
const VAR_RE = /\{\{\s*([^{}<>]+?)\s*\}\}/g
const VAR_BAJA = /\{\{\s*enlace_baja\s*\}\}/i

export const APP_URL = 'https://juanetayo-projects.github.io/envio_masivo_email/'
export const enlaceBaja = (token: string) => `${APP_URL}#/baja?t=${encodeURIComponent(token)}`

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// {{Teléfono}}, {{telefono}} y {{ TELÉFONO }} apuntan a la misma columna.
export function normalizarClave(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function reemplazar(
  plantilla: string,
  datos: Record<string, unknown>,
  formatear: (valor: unknown) => string,
): string {
  const indice = new Map<string, unknown>()
  for (const [clave, valor] of Object.entries(datos)) {
    const k = normalizarClave(clave)
    if (!indice.has(k)) indice.set(k, valor)
  }
  return plantilla.replace(VAR_RE, (_completo, nombre: string) => {
    const k = normalizarClave(nombre)
    return indice.has(k) ? formatear(indice.get(k)) : ''
  })
}

// Para el cuerpo HTML: los valores se escapan.
export function fusionar(plantilla: string, datos: Record<string, unknown>): string {
  return reemplazar(plantilla, datos, escapeHtml)
}

// Cuerpo final del correo. {{enlace_baja}} siempre funciona; si la plantilla no lo usa y
// la campaña lleva baja, se agrega un pie neutro con el nombre del remitente.
export function prepararCuerpo(
  html: string,
  datos: Record<string, unknown>,
  baja: { token: string; remitente: string; incluir: boolean },
): string {
  const enlace = enlaceBaja(baja.token)
  const cuerpo = fusionar(html, { ...datos, enlace_baja: enlace })
  if (!baja.incluir || VAR_BAJA.test(html)) return cuerpo

  const pie = '<div style="padding:16px;text-align:center;font-family:Arial,sans-serif;font-size:12px;color:#64748b">'
    + `Recibió este correo de ${escapeHtml(baja.remitente)}. `
    + `<a href="${escapeHtml(enlace)}" style="color:#64748b">Darse de baja</a></div>`
  return /<\/body>/i.test(cuerpo) ? cuerpo.replace(/<\/body>/i, () => `${pie}</body>`) : cuerpo + pie
}

// Para el asunto, que es texto plano: sin escapar y siempre en una sola línea.
export function fusionarAsunto(asunto: string, datos: Record<string, unknown>): string {
  return reemplazar(asunto, datos, (v) => String(v ?? '')).replace(/[\r\n]+/g, ' ').trim()
}

// Nombre visible seguro para el campo From: comillas para que admita comas y tildes.
export function formatearRemitente(nombre: string, email: string): string {
  const limpio = nombre.replace(/["<>\\\r\n]/g, '').trim()
  return limpio ? `"${limpio}" <${email}>` : email
}

export function extraerVariables(texto: string): string[] {
  const vistas = new Set<string>()
  for (const m of texto.matchAll(VAR_RE)) vistas.add(m[1].trim())
  return [...vistas]
}

// Variables sin columna en el Excel. {{email}} siempre existe como alias.
export function variablesFaltantes(plantilla: string, columnas: string[]): string[] {
  const disponibles = new Set([...columnas, 'email', 'enlace_baja'].map(normalizarClave))
  return extraerVariables(plantilla).filter((v) => !disponibles.has(normalizarClave(v)))
}
