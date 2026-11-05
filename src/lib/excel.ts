import * as XLSX from 'xlsx'

export type FilaDestinatario = { email: string; datos: Record<string, unknown> }
export type ResultadoImport = {
  columnas: string[]          // encabezados (1ª = email)
  filas: FilaDestinatario[]   // filas con email válido, sin repetidos
  invalidas: number           // filas descartadas por email inválido/vacío
  duplicados: number          // filas descartadas por email ya presente en el archivo
  total: number               // total de filas leídas
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailValido(s: unknown): boolean {
  return typeof s === 'string' && EMAIL_RE.test(s.trim())
}

const dos = (n: number) => String(n).padStart(2, '0')

// Las fechas de Excel son números de serie: se convierten sin pasar por Date
// para que la zona horaria no altere el valor.
function fechaDesdeSerie(serie: number): string {
  const f = XLSX.SSF.parse_date_code(serie)
  const hora = `${dos(f.H)}:${dos(f.M)}`
  if (serie < 1) return hora
  const dia = `${dos(f.d)}/${dos(f.m)}/${f.y}`
  return f.H || f.M ? `${dia} ${hora}` : dia
}

function valorCelda(celda: XLSX.CellObject | undefined): unknown {
  if (!celda || celda.v === undefined || celda.v === null) return ''
  if (celda.t === 'n') {
    const numero = celda.v as number
    if (celda.z && XLSX.SSF.is_date(String(celda.z))) return fechaDesdeSerie(numero)
    if (!celda.z || celda.z === 'General') return numero
  }
  return celda.w ?? celda.v   // el texto tal como se ve en Excel: 50 %, $ 1.000, etc.
}

// Lee la primera hoja. La 1ª columna es el email; las demás, variables libres.
export async function leerExcel(file: File): Promise<ResultadoImport> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellNF: true })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  const vacio: ResultadoImport = { columnas: [], filas: [], invalidas: 0, duplicados: 0, total: 0 }
  if (!hoja?.['!ref']) return vacio

  const rango = XLSX.utils.decode_range(hoja['!ref'])
  const matriz: unknown[][] = []
  for (let r = rango.s.r; r <= rango.e.r; r++) {
    const fila: unknown[] = []
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      fila.push(valorCelda(hoja[XLSX.utils.encode_cell({ r, c })]))
    }
    if (fila.some((v) => v !== '')) matriz.push(fila)
  }
  if (matriz.length < 2) return vacio

  const encabezados = matriz[0].map((c, i) => String(c ?? '').trim() || `columna_${i + 1}`)
  const cuerpo = matriz.slice(1)

  const filas: FilaDestinatario[] = []
  const vistos = new Set<string>()
  let invalidas = 0
  let duplicados = 0
  for (const fila of cuerpo) {
    const email = String(fila[0] ?? '').trim()
    if (!emailValido(email)) { invalidas++; continue }
    const clave = email.toLowerCase()
    if (vistos.has(clave)) { duplicados++; continue }
    vistos.add(clave)
    const datos: Record<string, unknown> = {}
    encabezados.forEach((h, i) => { datos[h] = fila[i] ?? '' })
    datos['email'] = email     // alias siempre disponible
    filas.push({ email, datos })
  }

  return { columnas: encabezados, filas, invalidas, duplicados, total: cuerpo.length }
}

// Plantilla de Excel de ejemplo para que el usuario sepa el formato
export function descargarPlantillaEjemplo() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['email', 'nombre', 'fecha', 'sede'],
    ['persona1@correo.com', 'Ana Pérez', '05/07/2026', 'Norte'],
    ['persona2@correo.com', 'Luis Díaz', '06/07/2026', 'Sur'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'destinatarios')
  XLSX.writeFile(wb, 'plantilla_destinatarios.xlsx')
}
