import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

const AZUL = 'FF0D2D6B'

export async function exportarEnviosExcel(
  nombreCampania: string,
  envios: Array<{ email: string; estado: string; enviado_at: string | null; error: string | null }>,
) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Envíos')

  ws.columns = [
    { header: 'Correo', key: 'email', width: 38 },
    { header: 'Estado', key: 'estado', width: 16 },
    { header: 'Enviado', key: 'enviado_at', width: 22 },
    { header: 'Error', key: 'error', width: 40 },
  ]

  // Encabezado con color institucional
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
    cell.alignment = { vertical: 'middle' }
  })

  envios.forEach((e) => {
    ws.addRow({
      email: e.email,
      estado: e.estado,
      enviado_at: e.enviado_at ? new Date(e.enviado_at).toLocaleString('es-CO') : '',
      error: e.error ?? '',
    })
  })

  const buf = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buf]), `informe_${nombreCampania.replace(/\s+/g, '_')}.xlsx`)
}
