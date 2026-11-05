import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { leerExcel } from '../src/lib/excel.ts'

function archivo(hoja: XLSX.WorkSheet): File {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, hoja, 'h')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([buf], 'prueba.xlsx')
}

test('convierte fechas, horas y porcentajes como se ven en Excel', async () => {
  const hoja = XLSX.utils.aoa_to_sheet([
    ['email', 'cita', 'dia', 'hora', 'avance', 'cedula'],
    ['a@b.co', 46208.5833333333, 46208, 0.75, 0.5, 1065123456],
  ])
  hoja['B2'].z = 'dd/mm/yyyy hh:mm'
  hoja['C2'].z = 'm/d/yy'
  hoja['D2'].z = 'h:mm'
  hoja['E2'].z = '0%'
  const r = await leerExcel(archivo(hoja))
  const d = r.filas[0].datos
  assert.equal(d.cita, '05/07/2026 14:00')
  assert.equal(d.dia, '05/07/2026')
  assert.equal(d.hora, '18:00')
  assert.equal(d.avance, '50%')
  assert.equal(d.cedula, 1065123456)
})

test('descarta repetidos sin distinguir mayúsculas y cuenta los inválidos', async () => {
  const r = await leerExcel(archivo(XLSX.utils.aoa_to_sheet([
    ['correo', 'nombre'],
    ['a@b.co', 'Ana'],
    [' A@B.co ', 'Ana 2'],
    ['no-es-correo', 'X'],
    [null, null],
    ['c@d.co', 'Cris'],
  ])))
  assert.deepEqual(r.filas.map((f) => f.email), ['a@b.co', 'c@d.co'])
  assert.equal(r.duplicados, 1)
  assert.equal(r.invalidas, 1)
  assert.equal(r.filas[0].datos.nombre, 'Ana')
  assert.equal(r.filas[0].datos.email, 'a@b.co')
})

test('hoja sin destinatarios devuelve resultado vacío', async () => {
  const r = await leerExcel(archivo(XLSX.utils.aoa_to_sheet([['email']])))
  assert.equal(r.filas.length, 0)
})
