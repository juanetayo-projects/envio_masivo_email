// Motor de envío por tandas. No depende de Deno ni de Supabase para poder probarlo.
//
// Garantía contra duplicados: cada lote usa su lote_id como Idempotency-Key en
// Resend (24 h). Si una tanda se interrumpe, el lote se reintenta con la misma
// clave y Resend responde lo mismo sin volver a enviar.
import { fusionarAsunto, prepararCuerpo } from './merge.ts'

export type Envio = {
  id: string
  email: string
  datos: Record<string, unknown>
  lote_id: string
}

export type Progreso = { total: number; enviados: number; fallidos: number; pendientes: number; omitidos?: number }

export type Db = {
  reclamarLote: (limite: number) => Promise<Envio[]>
  marcarEnviados: (items: { id: string; resend_id: string | null }[]) => Promise<void>
  marcarFallido: (id: string, error: string) => Promise<void>
  liberar: (ids: string[]) => Promise<void>
  progreso: () => Promise<Progreso>
  actualizarCampania: (cambios: { estado: 'enviada' | 'error'; enviada_at?: string; error_detalle: string | null }) => Promise<void>
}

export type Tanda = {
  db: Db
  apiKey: string
  from: string
  replyTo?: string | null
  remitente?: string
  incluirBaja?: boolean
  urlFuncionBaja?: string   // destino de List-Unsubscribe
  asunto: string
  html: string
  adjuntos: { filename: string; path: string }[]
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  ahora?: () => number
}

export type ResultadoTanda = Progreso & {
  terminado: boolean
  detenida?: string     // error que un reintento no arregla (clave, dominio, cuota)
  espera_ms?: number    // error temporal: el cliente vuelve a llamar después de esperar
}

export const PRESUPUESTO_MS = 90_000   // responder antes del límite de 150 s de Supabase
const TIEMPO_PETICION_MS = 15_000
const PAUSA_MS = 250                   // ~4 peticiones/s; el límite de Resend es 10/s
const ESPERA_TEMPORAL_MS = 5_000
const ESPERA_MAX_MS = 10_000
const INTENTOS_POR_PETICION = 2

type Respuesta =
  | { tipo: 'ok'; cuerpo: any }
  | { tipo: 'definitivo'; mensaje: string }   // este envío no se puede enviar
  | { tipo: 'detener'; mensaje: string }      // ningún envío va a salir
  | { tipo: 'temporal'; mensaje: string; esperaMs: number }

function clasificar(status: number, cuerpo: any, retryAfter: string | null): Respuesta {
  if (status >= 200 && status < 300) return { tipo: 'ok', cuerpo }
  const nombre: string = cuerpo?.name ?? ''
  const mensaje: string = cuerpo?.message ?? `HTTP ${status}`
  if (status === 429 && nombre.includes('quota')) return { tipo: 'detener', mensaje }
  if (status === 401 || status === 403) return { tipo: 'detener', mensaje }
  if (status === 429 || status >= 500 || nombre === 'concurrent_idempotent_requests' || nombre === 'resource_locked') {
    const segundos = Number(retryAfter)
    const esperaMs = segundos > 0 ? segundos * 1000 : ESPERA_TEMPORAL_MS
    return { tipo: 'temporal', mensaje, esperaMs }
  }
  return { tipo: 'definitivo', mensaje }
}

export async function procesarTanda(t: Tanda): Promise<ResultadoTanda> {
  const pedir = t.fetch ?? fetch
  const dormir = t.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const ahora = t.ahora ?? Date.now
  const inicio = ahora()
  const queda = () => ahora() - inicio < PRESUPUESTO_MS

  const construir = (e: Envio) => ({
    from: t.from,
    ...(t.replyTo ? { reply_to: t.replyTo } : {}),
    to: [e.email],
    subject: fusionarAsunto(t.asunto, e.datos),
    html: prepararCuerpo(t.html, e.datos, { token: e.id, remitente: t.remitente ?? '', incluir: !!t.incluirBaja }),
    headers: {
      'X-Entity-Ref-ID': e.id,
      ...(t.incluirBaja && t.urlFuncionBaja ? {
        'List-Unsubscribe': `<${t.urlFuncionBaja}?t=${e.id}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      } : {}),
    },
    tags: [{ name: 'envio_id', value: e.id }],   // el webhook localiza el envío con esto
    ...(t.adjuntos.length ? { attachments: t.adjuntos } : {}),
  })

  async function llamar(ruta: string, cuerpo: unknown, clave: string): Promise<Respuesta> {
    let ultima: Respuesta = { tipo: 'temporal', mensaje: 'Sin respuesta', esperaMs: ESPERA_TEMPORAL_MS }
    for (let intento = 1; intento <= INTENTOS_POR_PETICION; intento++) {
      try {
        const r = await pedir(`https://api.resend.com${ruta}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${t.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': clave,
          },
          body: JSON.stringify(cuerpo),
          signal: AbortSignal.timeout(TIEMPO_PETICION_MS),
        })
        const json = await r.json().catch(() => null)
        ultima = clasificar(r.status, json, r.headers.get('retry-after'))
      } catch (err) {
        ultima = { tipo: 'temporal', mensaje: String(err), esperaMs: ESPERA_TEMPORAL_MS }
      }
      if (ultima.tipo !== 'temporal') return ultima
      if (intento < INTENTOS_POR_PETICION) await dormir(Math.min(ultima.esperaMs, ESPERA_MAX_MS))
    }
    return ultima
  }

  // Devuelve un corte si la tanda debe parar; las filas temporales quedan en
  // 'enviando' y la siguiente tanda las retoma con la misma clave.
  type Corte = { detenida?: string; espera_ms?: number } | null

  async function enviarUno(e: Envio, clave: string): Promise<Corte> {
    const r = await llamar('/emails', construir(e), clave)
    if (r.tipo === 'ok') { await t.db.marcarEnviados([{ id: e.id, resend_id: r.cuerpo?.id ?? null }]); return null }
    if (r.tipo === 'definitivo') { await t.db.marcarFallido(e.id, r.mensaje); return null }
    if (r.tipo === 'detener') { await t.db.liberar([e.id]); return { detenida: r.mensaje } }
    return { espera_ms: r.esperaMs }
  }

  async function enviarLote(lote: Envio[]): Promise<Corte> {
    const r = await llamar('/emails/batch', lote.map(construir), lote[0].lote_id)
    if (r.tipo === 'ok') {
      const ids: { id?: string }[] = Array.isArray(r.cuerpo?.data) ? r.cuerpo.data : []
      await t.db.marcarEnviados(lote.map((e, i) => ({ id: e.id, resend_id: ids[i]?.id ?? null })))
      return null
    }
    if (r.tipo === 'detener') { await t.db.liberar(lote.map((e) => e.id)); return { detenida: r.mensaje } }
    if (r.tipo === 'temporal') return { espera_ms: r.esperaMs }

    // Un correo inválido rechaza el lote completo: se aísla enviándolos uno a uno.
    for (const e of lote) {
      if (!queda()) return { espera_ms: 0 }
      const corte = await enviarUno(e, `${e.lote_id}:${e.id}`)
      if (corte) return corte
      await dormir(PAUSA_MS)
    }
    return null
  }

  const conAdjuntos = t.adjuntos.length > 0   // la API de lotes no admite adjuntos
  let corte: Corte = null
  while (queda()) {
    const lote = await t.db.reclamarLote(conAdjuntos ? 1 : 100)
    if (lote.length === 0) break
    corte = conAdjuntos ? await enviarUno(lote[0], lote[0].lote_id) : await enviarLote(lote)
    if (corte) break
    await dormir(PAUSA_MS)
  }

  const progreso = await t.db.progreso()
  if (corte?.detenida) {
    await t.db.actualizarCampania({ estado: 'error', error_detalle: corte.detenida })
    return { ...progreso, terminado: false, detenida: corte.detenida }
  }
  if (progreso.pendientes === 0) {
    await t.db.actualizarCampania({
      estado: progreso.enviados === 0 && progreso.fallidos > 0 ? 'error' : 'enviada',
      enviada_at: new Date().toISOString(),
      error_detalle: null,
    })
    return { ...progreso, terminado: true }
  }
  return { ...progreso, terminado: false, espera_ms: corte?.espera_ms ?? 0 }
}
