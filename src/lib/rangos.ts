// Rangos rápidos de fechas, calculados sobre la fecha de Colombia.

export type ClaveRango = '7d' | '30d' | 'mes' | 'anio'

export const RANGOS: { clave: ClaveRango; etiqueta: string }[] = [
  { clave: '7d', etiqueta: '7D' },
  { clave: '30d', etiqueta: '30D' },
  { clave: 'mes', etiqueta: 'Mes' },
  { clave: 'anio', etiqueta: 'Año' },
]

export function hoyEnColombia(ahora = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

// Los rangos incluyen hoy: "7D" son 7 días contando el de hoy.
export function rangoDesde(clave: ClaveRango, hoy: string): { desde: string; hasta: string } {
  if (clave === '7d') return { desde: restarDias(hoy, 6), hasta: hoy }
  if (clave === '30d') return { desde: restarDias(hoy, 29), hasta: hoy }
  if (clave === 'mes') return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy }
  return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy }
}
