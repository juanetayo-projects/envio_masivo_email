import * as XLSX from 'xlsx'

export type FilaDestinatario = { email: string; datos: Record<string, unknown> }
export type ResultadoImport = {
  columnas: string[]          // encabezados (1ª = email)
  filas: FilaDestinatario[]   // filas con email válido
  invalidas: number           // filas descartadas por email inválido/vacío
  total: number               // total de filas leídas
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailValido(s: unknown): boolean {
  return typeof s === 'string' && EMAIL_RE.test(s.trim())
}

// Lee la primera hoja. La 1ª columna es el email; las demás, variables libres.
export async function leerExcel(file: File): Promise<ResultadoImport> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: false, defval: '' })

  if (matriz.length < 2) {
    return { columnas: [], filas: [], invalidas: 0, total: 0 }
  }

  const encabezados = (matriz[0] as unknown[]).map((c, i) =>
    String(c ?? '').trim() || `columna_${i + 1}`)
  const cuerpo = matriz.slice(1)

  const filas: FilaDestinatario[] = []
  let invalidas = 0
  for (const row of cuerpo) {
    const arr = row as unknown[]
    const email = String(arr[0] ?? '').trim()
    if (!emailValido(email)) { invalidas++; continue }
    const datos: Record<string, unknown> = {}
    encabezados.forEach((h, i) => { datos[h] = arr[i] ?? '' })
    datos['email'] = email     // alias siempre disponible
    filas.push({ email, datos })
  }

  return { columnas: encabezados, filas, invalidas, total: cuerpo.length }
}

// Plantilla de Excel de ejemplo para que el usuario sepa el formato
export function descargarPlantillaEjemplo() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['email', 'nombre', 'cita', 'medico'],
    ['paciente1@correo.com', 'Ana Pérez', '2026-07-05 09:00', 'Dr. Gómez'],
    ['paciente2@correo.com', 'Luis Díaz', '2026-07-05 10:30', 'Dra. Ruiz'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'destinatarios')
  XLSX.writeFile(wb, 'plantilla_destinatarios.xlsx')
}
