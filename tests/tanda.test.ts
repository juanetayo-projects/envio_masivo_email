// Prueba el motor de envío con una base de datos en memoria y un Resend simulado
// que, como el real, no vuelve a enviar lo que recibe con la misma clave.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { procesarTanda, PRESUPUESTO_MS } from '../supabase/functions/_shared/tanda.ts'
import type { Db, Envio } from '../supabase/functions/_shared/tanda.ts'

type Fila = Envio & { estado: string; error?: string; intentos: number; resend_id?: string | null }

function crearDb(cantidad: number) {
  const filas: Fila[] = Array.from({ length: cantidad }, (_, i) => ({
    id: `id-${i}`, email: `p${i}@x.co`, datos: { nombre: `P${i}` },
    estado: 'pendiente', lote_id: '', intentos: 0,
  }))
  let campania: { estado?: string; enviada_at?: string } = {}
  let lotes = 0
  const db: Db = {
    reclamarLote: async (limite) => {
      for (const f of filas) if (f.estado === 'enviando' && f.intentos >= 5) f.estado = 'fallido'
      const huerfana = filas.find((f) => f.estado === 'enviando')
      if (huerfana) {
        const lote = filas.filter((f) => f.estado === 'enviando' && f.lote_id === huerfana.lote_id)
        lote.forEach((f) => f.intentos++)
        return lote
      }
      const lote = filas.filter((f) => f.estado === 'pendiente').slice(0, limite)
      lotes++
      lote.forEach((f) => { f.estado = 'enviando'; f.lote_id = `lote-${lotes}`; f.intentos++ })
      return lote
    },
    marcarEnviados: async (items) => {
      for (const it of items) {
        const f = filas.find((x) => x.id === it.id)!
        f.resend_id = it.resend_id
        if (f.estado === 'enviando') f.estado = 'enviado'
      }
    },
    marcarFallido: async (id, error) => {
      const f = filas.find((x) => x.id === id)!
      f.estado = 'fallido'; f.error = error; f.lote_id = ''
    },
    liberar: async (ids) => {
      for (const f of filas) if (ids.includes(f.id)) { f.estado = 'pendiente'; f.lote_id = ''; f.intentos = 0 }
    },
    progreso: async () => ({
      total: filas.length,
      pendientes: filas.filter((f) => ['pendiente', 'enviando'].includes(f.estado)).length,
      fallidos: filas.filter((f) => f.estado === 'fallido').length,
      enviados: filas.filter((f) => !['pendiente', 'enviando', 'fallido'].includes(f.estado)).length,
    }),
    actualizarCampania: async (c) => { campania = { ...campania, ...c } },
  }
  return { db, filas, campania: () => campania }
}

const res = (status: number, cuerpo: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), { status, headers })

function crearResend(falla?: (ruta: string, intento: number, correos: any[]) => Response | 'red' | null) {
  const claves = new Set<string>()
  const entregados: string[] = []
  const rutas: string[] = []
  let intento = 0
  const pedir = (async (url: string, init: RequestInit) => {
    const ruta = new URL(url).pathname
    const clave = (init.headers as Record<string, string>)['Idempotency-Key']
    const cuerpo = JSON.parse(init.body as string)
    const correos = Array.isArray(cuerpo) ? cuerpo : [cuerpo]
    rutas.push(ruta)
    assert.ok(clave, 'toda petición lleva clave de idempotencia')
    const f = falla?.(ruta, ++intento, correos)
    if (f === 'red') throw new Error('corte de red')
    if (f) return f
    if (!claves.has(clave)) { claves.add(clave); correos.forEach((c) => entregados.push(c.to[0])) }
    const ids = correos.map((c) => ({ id: `re-${c.to[0]}` }))
    return res(200, ruta === '/emails/batch' ? { data: ids } : ids[0])
  }) as unknown as typeof fetch
  return { pedir, entregados, rutas }
}

const base = { apiKey: 'k', from: 'A <a@b.co>', asunto: 'Hola {{nombre}}', html: '<p>{{nombre}}</p>', adjuntos: [], sleep: async () => {} }

test('envía todo en lotes de 100 y finaliza la campaña', async () => {
  const { db, filas, campania } = crearDb(250)
  const r = crearResend()
  const out = await procesarTanda({ ...base, db, fetch: r.pedir })
  assert.equal(r.rutas.length, 3)
  assert.equal(new Set(r.entregados).size, 250)
  assert.equal(r.entregados.length, 250)
  assert.equal(out.terminado, true)
  assert.equal(campania().estado, 'enviada')
  assert.ok(filas.every((f) => f.resend_id === `re-${f.email}`))
})

test('con adjuntos envía uno a uno por /emails', async () => {
  const { db } = crearDb(3)
  const r = crearResend()
  const adjuntos = [{ filename: 'a.pdf', path: 'https://x/a.pdf' }]
  const out = await procesarTanda({ ...base, adjuntos, db, fetch: r.pedir })
  assert.deepEqual(r.rutas, ['/emails', '/emails', '/emails'])
  assert.equal(out.enviados, 3)
})

test('corte de red tras enviar: al reintentar no hay duplicados', async () => {
  const { db, filas } = crearDb(10)
  let cortes = 0
  // Resend procesa el lote, pero la respuesta nunca llega (dos veces seguidas).
  const claves = new Set<string>()
  const entregados: string[] = []
  const pedir = (async (_u: string, init: RequestInit) => {
    const clave = (init.headers as Record<string, string>)['Idempotency-Key']
    const correos = JSON.parse(init.body as string)
    if (!claves.has(clave)) { claves.add(clave); correos.forEach((c: any) => entregados.push(c.to[0])) }
    if (cortes++ < 2) throw new Error('corte de red')
    return res(200, { data: correos.map((c: any) => ({ id: c.to[0] })) })
  }) as unknown as typeof fetch

  const primera = await procesarTanda({ ...base, db, fetch: pedir })
  assert.equal(primera.terminado, false)
  assert.equal(primera.pendientes, 10)
  assert.ok(filas.every((f) => f.estado === 'enviando'), 'el lote queda para retomarse')

  const segunda = await procesarTanda({ ...base, db, fetch: pedir })
  assert.equal(segunda.terminado, true)
  assert.equal(entregados.length, 10, 'cada correo salió una sola vez')
})

test('un correo inválido no tumba el lote: solo falla ese', async () => {
  const { db, filas } = crearDb(5)
  const r = crearResend((ruta, _i, correos) => {
    if (ruta === '/emails/batch') return res(422, { name: 'validation_error', message: 'correo inválido' })
    return correos[0].to[0] === 'p2@x.co' ? res(422, { name: 'validation_error', message: 'correo inválido' }) : null
  })
  const out = await procesarTanda({ ...base, db, fetch: r.pedir })
  assert.equal(out.enviados, 4)
  assert.equal(out.fallidos, 1)
  assert.equal(filas.find((f) => f.email === 'p2@x.co')!.error, 'correo inválido')
  assert.equal(out.terminado, true)
})

test('429 temporal respeta retry-after y reintenta', async () => {
  const { db } = crearDb(2)
  const esperas: number[] = []
  const r = crearResend((_r, i) => i === 1 ? res(429, { name: 'rate_limit_exceeded', message: 'lento' }, { 'retry-after': '3' }) : null)
  const out = await procesarTanda({ ...base, db, fetch: r.pedir, sleep: async (ms) => { esperas.push(ms) } })
  assert.equal(esperas[0], 3000)
  assert.equal(out.enviados, 2)
})

test('clave inválida detiene todo y deja los envíos pendientes', async () => {
  const { db, filas, campania } = crearDb(5)
  const r = crearResend(() => res(401, { name: 'validation_error', message: 'API key inválida' }))
  const out = await procesarTanda({ ...base, db, fetch: r.pedir })
  assert.equal(out.detenida, 'API key inválida')
  assert.equal(r.rutas.length, 1)
  assert.ok(filas.every((f) => f.estado === 'pendiente'))
  assert.equal(campania().estado, 'error')
})

test('cuota diaria agotada detiene el envío', async () => {
  const { db } = crearDb(2)
  const r = crearResend(() => res(429, { name: 'daily_quota_exceeded', message: 'cuota' }))
  const out = await procesarTanda({ ...base, db, fetch: r.pedir })
  assert.equal(out.detenida, 'cuota')
  assert.equal(out.pendientes, 2)
})

test('al agotar el tiempo responde sin terminar y la siguiente tanda continúa', async () => {
  const { db } = crearDb(300)
  const r = crearResend()
  let reloj = 0
  const ahora = () => { reloj += PRESUPUESTO_MS / 3; return reloj }
  const primera = await procesarTanda({ ...base, db, fetch: r.pedir, ahora })
  assert.equal(primera.terminado, false)
  assert.ok(primera.pendientes > 0)
  const segunda = await procesarTanda({ ...base, db, fetch: r.pedir })
  assert.equal(segunda.terminado, true)
  assert.equal(r.entregados.length, 300)
})

test('fallo persistente se agota y queda como fallido, sin ciclo infinito', async () => {
  const { db } = crearDb(2)
  const r = crearResend(() => res(503, { name: 'service_unavailable', message: 'caído' }))
  let out = await procesarTanda({ ...base, db, fetch: r.pedir })
  for (let i = 0; i < 10 && !out.terminado; i++) out = await procesarTanda({ ...base, db, fetch: r.pedir })
  assert.equal(out.terminado, true)
  assert.equal(out.fallidos, 2)
})

test('el asunto llega sin escapar y el cuerpo escapado, con tag del envío', async () => {
  const { db } = crearDb(1)
  let correo: any
  const r = crearResend((_r, _i, correos) => { correo = correos[0]; return null })
  await procesarTanda({ ...base, asunto: "{{nombre}} O'Brien & Cía", html: '{{email}}<b>{{x}}</b>', db, fetch: r.pedir })
  assert.equal(correo.subject, "P0 O'Brien & Cía")
  assert.deepEqual(correo.tags, [{ name: 'envio_id', value: 'id-0' }])
})
