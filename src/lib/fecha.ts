// Formateo de fechas en zona horaria de Colombia (GMT-5), independiente
// de la configuración local del navegador o del servidor.

const TZ = 'America/Bogota'

// Fecha + hora: 30/06/2026, 12:45 p. m.
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', {
    timeZone: TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Solo fecha: 30/06/2026
export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}
