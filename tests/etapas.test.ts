import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alcanzoEtapa, contarEtapas } from '../src/lib/etapas.ts'

const valores = (estados: string[]) =>
  Object.fromEntries(contarEtapas(estados).map((e) => [e.key, e.valor]))

test('un clic también cuenta como enviado, entregado y abierto', () => {
  assert.deepEqual(valores(['clic']), {
    enviado: 1, entregado: 1, abierto: 1, clic: 1, rebote: 0,
    fallido: 0, pendiente: 0, enviando: 0, omitido: 0,
  })
})

test('un rebote salió, pero no se entregó', () => {
  const v = valores(['rebote'])
  assert.equal(v.enviado, 1)
  assert.equal(v.entregado, 0)
  assert.equal(v.rebote, 1)
})

test('fallidos, pendientes y omitidos no cuentan como enviados', () => {
  const v = valores(['fallido', 'pendiente', 'enviando', 'omitido'])
  assert.equal(v.enviado, 0)
  assert.equal(v.fallido, 1)
  assert.equal(v.pendiente, 1)
  assert.equal(v.enviando, 1)
  assert.equal(v.omitido, 1)
})

test('sin envíos, todas las etapas aparecen en cero', () => {
  const etapas = contarEtapas([])
  assert.equal(etapas.length, 9)
  assert.ok(etapas.every((e) => e.valor === 0))
})

test('el filtro coincide con lo que cuenta cada barra', () => {
  assert.equal(alcanzoEtapa('clic', 'entregado'), true)
  assert.equal(alcanzoEtapa('entregado', 'clic'), false)
  assert.equal(alcanzoEtapa('rebote', 'entregado'), false)
  assert.equal(alcanzoEtapa('clic', 'desconocida'), false)
})
