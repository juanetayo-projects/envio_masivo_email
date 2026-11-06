import { test } from 'node:test'
import assert from 'node:assert/strict'
import { camposFormulario, guardarFila } from '../src/lib/destinatarios.ts'

const columnas = ['email', 'nombre', 'fecha', 'hora', 'Médico', 'sede', 'enlace']
const claves = (texto: string, cols = columnas) => camposFormulario(texto, cols).map((c) => c.clave)

test('pide solo el correo y las variables que usa la plantilla', () => {
  assert.deepEqual(claves('<p>Hola {{nombre}}, tu sede es {{sede}}</p>'), ['email', 'nombre', 'sede'])
})

test('una plantilla sin variables solo pide el correo', () => {
  assert.deepEqual(claves('<p>Hola a todos</p>'), ['email'])
})

test('usa el nombre de la columna aunque cambien tildes o mayúsculas', () => {
  assert.deepEqual(claves('{{medico}} {{MÉDICO}} {{ Nombre }}'), ['email', 'Médico', 'nombre'])
})

test('pide también las variables que no están en el Excel', () => {
  assert.deepEqual(claves('{{nombre}} {{cargo}}'), ['email', 'nombre', 'cargo'])
})

test('no pide las variables que llena la app', () => {
  assert.deepEqual(claves('{{email}} {{enlace_baja}} {{correo}}', ['correo', 'nombre']), ['correo'])
})

test('la primera opción siempre es el correo, con su etiqueta', () => {
  assert.deepEqual(camposFormulario('', ['correo'])[0], { clave: 'correo', etiqueta: 'correo (correo)' })
})

const filas = [{
  email: 'a@x.co',
  datos: { email: 'a@x.co', nombre: 'Ana', sede: 'Norte', fecha: '05/07/2026' },
}]

test('editar conserva las columnas que no están en el formulario', () => {
  const r = guardarFila(filas, ['email', 'nombre', 'sede', 'fecha'], 'a@x.co', { email: 'a@x.co', nombre: 'Ana M' })
  assert.ok('filas' in r)
  assert.deepEqual(r.filas[0].datos, { email: 'a@x.co', nombre: 'Ana M', sede: 'Norte', fecha: '05/07/2026' })
})

test('guarda el valor de una variable que no tiene columna', () => {
  const r = guardarFila(filas, ['email', 'nombre'], 'a@x.co', { email: 'a@x.co', cargo: 'Jefa' })
  assert.ok('filas' in r)
  assert.equal(r.filas[0].datos.cargo, 'Jefa')
})

test('corregir una fila descartada conserva sus demás datos', () => {
  const base = { email: 'malo', nombre: 'Pepe', sede: 'Sur' }
  const r = guardarFila(filas, ['email', 'nombre', 'sede'], null, { email: 'pepe@x.co', nombre: 'Pepe' }, base)
  assert.ok('filas' in r)
  assert.deepEqual(r.filas[1].datos, { email: 'pepe@x.co', nombre: 'Pepe', sede: 'Sur' })
})
