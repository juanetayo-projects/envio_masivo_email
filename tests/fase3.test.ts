import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { prepararCuerpo, variablesFaltantes } from '../supabase/functions/_shared/merge.ts'
import { eliminarFila, guardarFila } from '../src/lib/destinatarios.ts'
import { leerExcel } from '../src/lib/excel.ts'
import { revisarHtml } from '../src/lib/revisarHtml.ts'
import { procesarTanda } from '../supabase/functions/_shared/tanda.ts'
import type { Db } from '../supabase/functions/_shared/tanda.ts'

const baja = { token: 'abc', remitente: 'Mi & Tienda', incluir: true }

test('agrega el pie de baja antes de </body> y escapa el remitente', () => {
  const r = prepararCuerpo('<html><body><p>Hola</p></BODY></html>', {}, baja)
  assert.match(r, /Recibió este correo de Mi &amp; Tienda/)
  assert.ok(r.indexOf('Darse de baja') < r.indexOf('</body>'))
  assert.match(r, /#\/baja\?t=abc/)
})

test('sin </body> agrega el pie al final', () => {
  assert.match(prepararCuerpo('<p>Hola</p>', {}, baja), /<p>Hola<\/p><div/)
})

test('si la plantilla usa {{enlace_baja}} no duplica el enlace', () => {
  const r = prepararCuerpo('<a href="{{enlace_baja}}">Salir</a>', {}, baja)
  assert.ok(r.includes('#/baja?t=abc'))
  assert.ok(!r.includes('Darse de baja'))
})

test('una campaña sin baja no lleva pie, pero la variable sigue funcionando', () => {
  assert.equal(prepararCuerpo('<p>Hola</p>', {}, { ...baja, incluir: false }), '<p>Hola</p>')
  assert.ok(prepararCuerpo('{{enlace_baja}}', {}, { ...baja, incluir: false }).includes('t=abc'))
})

test('{{enlace_baja}} no se reporta como variable faltante', () => {
  assert.deepEqual(variablesFaltantes('{{enlace_baja}}', ['correo']), [])
})

test('avisa de un enlace de baja que no funcionará', () => {
  assert.ok(revisarHtml('<a href="#">Unsubscribe</a>').some((a) => a.includes('{{enlace_baja}}')))
  assert.deepEqual(revisarHtml('<a href="{{enlace_baja}}">Darse de baja</a>'), [])
})

function db(): Db {
  const filas = [{ id: 'id-1', email: 'a@x.co', datos: {}, lote_id: 'l1' }]
  let hecho = false
  return {
    reclamarLote: async () => { if (hecho) return []; hecho = true; return filas },
    marcarEnviados: async () => {},
    marcarFallido: async () => {},
    liberar: async () => {},
    progreso: async () => ({ total: 1, enviados: 1, fallidos: 0, pendientes: 0 }),
    actualizarCampania: async () => {},
  }
}

async function correoEnviado(extra: Record<string, unknown>) {
  let correo: any
  const pedir = (async (_u: string, init: RequestInit) => {
    correo = JSON.parse(init.body as string)[0]
    return new Response(JSON.stringify({ data: [{ id: 'r' }] }))
  }) as unknown as typeof fetch
  await procesarTanda({
    db: db(), apiKey: 'k', from: 'a@b.co', asunto: 'A', html: '<p>x</p>', adjuntos: [],
    sleep: async () => {}, fetch: pedir, ...extra,
  })
  return correo
}

test('el correo lleva List-Unsubscribe de un clic y el pie', async () => {
  const c = await correoEnviado({ incluirBaja: true, urlFuncionBaja: 'https://f/baja', remitente: 'R' })
  assert.equal(c.headers['List-Unsubscribe'], '<https://f/baja?t=id-1>')
  assert.equal(c.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
  assert.match(c.html, /t=id-1/)
})

test('sin baja no lleva encabezados ni pie', async () => {
  const c = await correoEnviado({ incluirBaja: false, urlFuncionBaja: 'https://f/baja' })
  assert.equal(c.headers['List-Unsubscribe'], undefined)
  assert.equal(c.html, '<p>x</p>')
})

const columnas = ['correo', 'nombre']
const filas = [
  { email: 'a@x.co', datos: { correo: 'a@x.co', nombre: 'Ana', email: 'a@x.co' } },
  { email: 'b@x.co', datos: { correo: 'b@x.co', nombre: 'Beto', email: 'b@x.co' } },
]

test('agrega un destinatario y mantiene el alias email', () => {
  const r = guardarFila(filas, columnas, null, { correo: ' C@x.co ', nombre: ' Cris ' })
  assert.ok('filas' in r)
  assert.equal(r.filas.length, 3)
  assert.deepEqual(r.filas[2].datos, { correo: 'C@x.co', nombre: 'Cris', email: 'C@x.co' })
})

test('rechaza correo inválido o repetido', () => {
  assert.deepEqual(guardarFila(filas, columnas, null, { correo: 'malo', nombre: '' }), { error: 'Escribe un correo válido.' })
  assert.deepEqual(guardarFila(filas, columnas, null, { correo: 'A@X.CO', nombre: '' }), { error: 'Ese correo ya está en la lista.' })
  assert.deepEqual(guardarFila(filas, columnas, 'a@x.co', { correo: 'b@x.co', nombre: '' }), { error: 'Ese correo ya está en la lista.' })
})

test('edita en su lugar, también cambiando el correo o solo sus mayúsculas', () => {
  const r = guardarFila(filas, columnas, 'a@x.co', { correo: 'nuevo@x.co', nombre: 'Ana M' })
  assert.ok('filas' in r)
  assert.deepEqual(r.filas.map((f) => f.email), ['nuevo@x.co', 'b@x.co'])
  assert.equal(r.filas[0].datos.email, 'nuevo@x.co')
  const m = guardarFila(filas, columnas, 'a@x.co', { correo: 'A@x.co', nombre: 'Ana' })
  assert.ok('filas' in m)
  assert.equal(m.filas.length, 2)
})

test('elimina sin distinguir mayúsculas', () => {
  assert.deepEqual(eliminarFila(filas, 'A@X.co').map((f) => f.email), ['b@x.co'])
})

function archivo(aoa: unknown[][]) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'h')
  return new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer], 'p.xlsx')
}

test('conserva las filas sin correo válido para poder corregirlas', async () => {
  const r = await leerExcel(archivo([['correo', 'nombre'], ['malo', 'Pepe'], ['a@x.co', 'Ana']]))
  assert.equal(r.invalidas, 1)
  assert.deepEqual(r.descartadas, [{ email: 'malo', datos: { correo: 'malo', nombre: 'Pepe' } }])
})

test('un archivo solo con encabezados permite agregar a mano', async () => {
  const r = await leerExcel(archivo([['correo', 'nombre']]))
  assert.deepEqual(r.columnas, ['correo', 'nombre'])
  assert.equal(r.filas.length, 0)
})
