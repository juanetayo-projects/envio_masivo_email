import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarFiltro, dominioDe, valoresDeColumna, verificarDominio, verificarDominios,
} from '../src/lib/destinatarios.ts'

type Respuestas = Record<string, unknown>

// Simula el DNS: la clave es "dominio:TIPO".
function dns(respuestas: Respuestas) {
  const consultas: string[] = []
  const pedir = (async (url: string) => {
    const u = new URL(url)
    const clave = `${u.searchParams.get('name')}:${u.searchParams.get('type')}`
    consultas.push(`${u.host}/${clave}`)
    const r = respuestas[clave]
    if (r === 'caido') throw new Error('sin red')
    return new Response(JSON.stringify(r ?? { Status: 0 }), { status: 200 })
  }) as unknown as typeof fetch
  return { pedir, consultas }
}

const MX = (data: string) => ({ Status: 0, Answer: [{ type: 15, data }] })

test('dominio con MX es válido', async () => {
  assert.equal(await verificarDominio('x.co', dns({ 'x.co:MX': MX('10 mail.x.co.') }).pedir), 'valido')
})

test('dominio que no existe se descarta', async () => {
  assert.equal(await verificarDominio('gmial.con', dns({ 'gmial.con:MX': { Status: 3 } }).pedir), 'inexistente')
})

test('MX nulo declara que el dominio no recibe correo', async () => {
  assert.equal(await verificarDominio('x.co', dns({ 'x.co:MX': MX('0 .') }).pedir), 'inexistente')
})

test('sin MX pero con registro A puede recibir correo', async () => {
  const { pedir } = dns({ 'x.co:MX': { Status: 0 }, 'x.co:A': { Status: 0, Answer: [{ type: 1, data: '1.2.3.4' }] } })
  assert.equal(await verificarDominio('x.co', pedir), 'valido')
})

test('sin MX, A ni AAAA no recibe correo', async () => {
  assert.equal(await verificarDominio('x.co', dns({}).pedir), 'inexistente')
})

test('una falla del DNS nunca descarta a nadie', async () => {
  assert.equal(await verificarDominio('x.co', dns({ 'x.co:MX': { Status: 2 } }).pedir), 'desconocido')
  assert.equal(await verificarDominio('x.co', dns({ 'x.co:MX': 'caido' }).pedir), 'desconocido')
  const { pedir } = dns({ 'x.co:MX': { Status: 0 }, 'x.co:A': 'caido' })
  assert.equal(await verificarDominio('x.co', pedir), 'desconocido')
})

test('si el primer servidor falla se intenta con el segundo', async () => {
  let llamadas = 0
  const pedir = (async () => {
    if (++llamadas === 1) throw new Error('bloqueado')
    return new Response(JSON.stringify(MX('10 m.x.co.')))
  }) as unknown as typeof fetch
  assert.equal(await verificarDominio('x.co', pedir), 'valido')
  assert.equal(llamadas, 2)
})

test('consulta cada dominio una sola vez y nunca la dirección completa', async () => {
  const { pedir, consultas } = dns({ 'a.co:MX': MX('1 m.a.co.'), 'b.co:MX': { Status: 3 } })
  const emails = ['ana@A.co', 'luis@a.co', 'eva@b.co']
  const r = await verificarDominios(emails.map(dominioDe), pedir)
  assert.deepEqual(r, { 'a.co': 'valido', 'b.co': 'inexistente' })
  assert.equal(consultas.length, 2)
  assert.ok(consultas.every((c) => !c.includes('@')))
})

const fila = (email: string, datos: Record<string, unknown>) => ({ email, datos })
const filas = [
  fila('a@x.co', { sede: 'Norte', piso: 2 }),
  fila('b@x.co', { sede: ' Sur ', piso: 10 }),
  fila('c@x.co', { sede: 'Norte', piso: '' }),
]

test('valores de columna sin repetidos y en orden natural', () => {
  assert.deepEqual(valoresDeColumna(filas, 'sede'), ['Norte', 'Sur'])
  assert.deepEqual(valoresDeColumna(filas, 'piso'), ['', '2', '10'])
})

test('filtra por varios valores y compara como texto', () => {
  assert.deepEqual(aplicarFiltro(filas, 'sede', new Set(['Sur'])).map((f) => f.email), ['b@x.co'])
  assert.deepEqual(aplicarFiltro(filas, 'piso', new Set(['2', '10'])).map((f) => f.email), ['a@x.co', 'b@x.co'])
})

test('sin selección no filtra', () => {
  assert.equal(aplicarFiltro(filas, 'sede', new Set()).length, 3)
  assert.equal(aplicarFiltro(filas, '', new Set(['Sur'])).length, 3)
})
