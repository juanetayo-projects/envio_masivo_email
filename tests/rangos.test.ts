import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hoyEnColombia, rangoDesde } from '../src/lib/rangos.ts'

test('hoy usa la fecha de Colombia, no la UTC', () => {
  // 02:00 UTC del 6 de noviembre todavía es 5 de noviembre en Colombia.
  assert.equal(hoyEnColombia(new Date('2026-11-06T02:00:00Z')), '2026-11-05')
  assert.equal(hoyEnColombia(new Date('2026-11-06T05:00:00Z')), '2026-11-06')
})

test('los rangos incluyen el día de hoy', () => {
  assert.deepEqual(rangoDesde('7d', '2026-11-05'), { desde: '2026-10-30', hasta: '2026-11-05' })
  assert.deepEqual(rangoDesde('30d', '2026-11-05'), { desde: '2026-10-07', hasta: '2026-11-05' })
  assert.deepEqual(rangoDesde('mes', '2026-11-05'), { desde: '2026-11-01', hasta: '2026-11-05' })
  assert.deepEqual(rangoDesde('anio', '2026-11-05'), { desde: '2026-01-01', hasta: '2026-11-05' })
})

test('cruza el cambio de año y febrero bisiesto', () => {
  assert.equal(rangoDesde('7d', '2027-01-03').desde, '2026-12-28')
  assert.equal(rangoDesde('7d', '2028-03-02').desde, '2028-02-25')
})
