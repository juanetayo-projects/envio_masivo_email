// Variables {{columna}}. Lo usan la vista previa (src/lib/merge.ts) y el envío
// real (enviar-campania), para que lo que se revisa sea lo que se envía.

// Admite tildes y espacios; excluye etiquetas HTML dentro de las llaves.
const VAR_RE = /\{\{\s*([^{}<>]+?)\s*\}\}/g

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
  const disponibles = new Set([...columnas, 'email'].map(normalizarClave))
  return extraerVariables(plantilla).filter((v) => !disponibles.has(normalizarClave(v)))
}
