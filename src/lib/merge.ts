// Utilidades para variables {{columna}} en plantillas

const VAR_RE = /\{\{\s*([\w.\- ]+?)\s*\}\}/g

// Escapa un valor para inyectarlo de forma segura en HTML
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Lista de variables presentes en un texto/plantilla (sin duplicados)
export function extraerVariables(texto: string): string[] {
  const set = new Set<string>()
  let m: RegExpExecArray | null
  VAR_RE.lastIndex = 0
  while ((m = VAR_RE.exec(texto)) !== null) set.add(m[1].trim())
  return [...set]
}

// Reemplaza {{var}} por datos[var] (escapado). Variable faltante -> ''.
export function fusionar(plantilla: string, datos: Record<string, unknown>): string {
  return plantilla.replace(VAR_RE, (_full, nombre) => {
    const clave = String(nombre).trim()
    return clave in datos ? escapeHtml(datos[clave]) : ''
  })
}

// Variables de la plantilla que NO están cubiertas por las columnas disponibles
export function variablesFaltantes(plantilla: string, columnas: string[]): string[] {
  const cols = new Set(columnas.map((c) => c.trim()))
  return extraerVariables(plantilla).filter((v) => !cols.has(v))
}
