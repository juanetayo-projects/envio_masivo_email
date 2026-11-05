import { test } from 'node:test'
import assert from 'node:assert/strict'
import { revisarHtml } from '../src/lib/revisarHtml.ts'
import { formatearRemitente } from '../supabase/functions/_shared/merge.ts'

const hay = (html: string, texto: RegExp) => revisarHtml(html).some((a) => texto.test(a))

test('HTML normal no genera avisos', () => {
  const html = '<p>Hola {{nombre}}</p><img src="https://midominio.com/a.png"><img src="cid:logo">'
  assert.deepEqual(revisarHtml(html), [])
})

test('avisa cuando Gmail recortaría el mensaje', () => {
  assert.ok(hay('x'.repeat(103 * 1024), /Gmail recorta/))
  assert.ok(!hay('x'.repeat(100 * 1024), /Gmail recorta/))
})

test('detecta imágenes incrustadas, locales y temporales', () => {
  assert.ok(hay('<img src="data:image/png;base64,AAA">', /incrustadas/))
  assert.ok(hay('<img src="imagenes/a.png">', /rutas locales/))
  assert.ok(hay('<img alt="x" src="http://localhost/a.png">', /rutas locales/))
  assert.ok(hay('<img src="https://nxg-unlayer-temp.s3.us-west-2.amazonaws.com/a.png">', /temporal/))
})

test('detecta script, form e iframe sin repetirlos', () => {
  const avisos = revisarHtml('<script></script><script></script><form></form>')
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /<script>, <form>/)
})

test('el nombre del remitente no puede inyectar otro destinatario', () => {
  assert.equal(formatearRemitente('Tienda, S.A.', 'a@b.co'), '"Tienda, S.A." <a@b.co>')
  assert.equal(formatearRemitente('X"\r\nBcc: o@x.co <m>', 'a@b.co'), '"XBcc: o@x.co m" <a@b.co>')
  assert.equal(formatearRemitente('  ', 'a@b.co'), 'a@b.co')
})
