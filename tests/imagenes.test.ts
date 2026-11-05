import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_BYTES, NOMBRE_VALIDO, detectarExtension, nombreSeguro, tamanoBase64 } from '../supabase/functions/_shared/imagenes.ts'

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes))
const texto = (s: string) => btoa(s)

test('reconoce cada formato por su contenido', () => {
  assert.equal(detectarExtension(b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])), 'png')
  assert.equal(detectarExtension(b64([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46])), 'jpg')
  assert.equal(detectarExtension(texto('GIF89a123456')), 'gif')
  assert.equal(detectarExtension(texto('GIF87a123456')), 'gif')
  assert.equal(detectarExtension(texto('RIFF\x10\x00\x00\x00WEBPVP8 ')), 'webp')
})

test('rechaza lo que no es imagen, aunque se llame .png', () => {
  assert.equal(detectarExtension(texto('<svg xmlns="http://www.w3.org/2000/svg">')), null)
  assert.equal(detectarExtension(texto('<script>alert(1)</script>')), null)
  assert.equal(detectarExtension(texto('RIFF\x10\x00\x00\x00WAVEfmt ')), null)
  assert.equal(detectarExtension(''), null)
  assert.equal(detectarExtension('***no es base64***'), null)
})

test('genera nombres seguros para la URL', () => {
  assert.equal(nombreSeguro('Promoción Navidad (1).JPG', 'jpg'), 'promocion-navidad-1.jpg')
  assert.equal(nombreSeguro('foto.png', 'jpg'), 'foto.jpg')
  assert.equal(nombreSeguro('???.png', 'png'), 'imagen.png')
  assert.equal(nombreSeguro('', 'gif'), 'imagen.gif')
})

test('un nombre con ruta no puede salir de la carpeta', () => {
  const r = nombreSeguro('../../src/App.png', 'png')
  assert.equal(r, 'src-app.png')
  assert.ok(NOMBRE_VALIDO.test(r))
  assert.ok(!NOMBRE_VALIDO.test('../../src/App.tsx'))
  assert.ok(!NOMBRE_VALIDO.test('a/b.png'))
})

test('el nombre generado siempre es válido y limitado', () => {
  const r = nombreSeguro('x'.repeat(200) + ' -- .png', 'webp')
  assert.ok(NOMBRE_VALIDO.test(r))
  assert.ok(r.length <= 65)
})

test('calcula el tamaño real del base64', () => {
  assert.equal(tamanoBase64(btoa('a')), 1)
  assert.equal(tamanoBase64(btoa('ab')), 2)
  assert.equal(tamanoBase64(btoa('abc')), 3)
  assert.ok(tamanoBase64('A'.repeat(Math.ceil(MAX_BYTES * 4 / 3) + 8)) > MAX_BYTES)
})
