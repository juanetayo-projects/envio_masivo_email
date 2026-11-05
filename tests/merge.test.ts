import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fusionar, fusionarAsunto, extraerVariables, variablesFaltantes } from '../supabase/functions/_shared/merge.ts'

test('reemplaza variables con tilde y las detecta', () => {
  const t = 'Tel {{teléfono}}, dir {{Dirección}}'
  assert.equal(fusionar(t, { 'teléfono': '300', 'Dirección': 'Calle 1' }), 'Tel 300, dir Calle 1')
  assert.deepEqual(extraerVariables(t), ['teléfono', 'Dirección'])
})

test('ignora mayúsculas, tildes y espacios al buscar la columna', () => {
  assert.equal(fusionar('{{Nombre}} {{ TELEFONO }}', { nombre: 'Ana', 'Teléfono': 300 }), 'Ana 300')
})

test('el cuerpo se escapa y el asunto no', () => {
  const datos = { n: "O'Brien & Cía" }
  assert.equal(fusionar('{{n}}', datos), 'O&#39;Brien &amp; Cía')
  assert.equal(fusionarAsunto('Cita de {{n}}', datos), "Cita de O'Brien & Cía")
})

test('el asunto queda en una sola línea', () => {
  assert.equal(fusionarAsunto('Hola {{n}}', { n: 'Ana\r\nBcc: otro@x.co' }), 'Hola Ana Bcc: otro@x.co')
})

test('variable sin columna queda vacía y se avisa', () => {
  assert.equal(fusionar('Hola {{apellido}}!', { nombre: 'Ana' }), 'Hola !')
  assert.deepEqual(variablesFaltantes('{{apellido}} {{nombre}}', ['nombre']), ['apellido'])
})

test('{{email}} nunca se reporta como faltante', () => {
  assert.deepEqual(variablesFaltantes('{{email}} {{Nombre}}', ['correo', 'nombre']), [])
})

test('no toma etiquetas HTML como variables', () => {
  assert.equal(fusionar('{{<b>x</b>}}', { x: 1 }), '{{<b>x</b>}}')
})
