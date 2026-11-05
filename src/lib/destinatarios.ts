// Depuración de destinatarios al importar: dominios inexistentes y filtro por columna.
import type { FilaDestinatario } from './excel'

export type EstadoDominio = 'valido' | 'inexistente' | 'desconocido'

const SERVIDORES_DNS = [
  (nombre: string, tipo: string) => `https://dns.google/resolve?name=${encodeURIComponent(nombre)}&type=${tipo}`,
  (nombre: string, tipo: string) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(nombre)}&type=${tipo}`,
]
const TIEMPO_DNS_MS = 5_000
const CONSULTAS_SIMULTANEAS = 8

export function dominioDe(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase()
}

type RespuestaDns = { Status?: number; Answer?: { type: number; data: string }[] }

async function consultar(nombre: string, tipo: string, pedir: typeof fetch): Promise<RespuestaDns | null> {
  for (const url of SERVIDORES_DNS) {
    try {
      const r = await pedir(url(nombre, tipo), {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(TIEMPO_DNS_MS),
      })
      if (r.ok) return await r.json() as RespuestaDns
    } catch { /* se intenta con el siguiente servidor */ }
  }
  return null
}

// Solo se consulta el dominio, nunca la dirección completa.
export async function verificarDominio(dominio: string, pedir: typeof fetch = fetch): Promise<EstadoDominio> {
  const mx = await consultar(dominio, 'MX', pedir)
  if (!mx || mx.Status === undefined) return 'desconocido'
  if (mx.Status === 3) return 'inexistente'          // NXDOMAIN: el dominio no existe
  if (mx.Status !== 0) return 'desconocido'          // falla del DNS: no se descarta a nadie

  const registros = (mx.Answer ?? []).filter((a) => a.type === 15)
  if (registros.length > 0) {
    // "0 ." declara expresamente que el dominio no recibe correo (RFC 7505).
    const noRecibe = registros.length === 1 && /^0\s+\.?$/.test(registros[0].data.trim())
    return noRecibe ? 'inexistente' : 'valido'
  }

  // Sin MX, el correo puede entregarse al registro A/AAAA del dominio (RFC 5321).
  for (const tipo of ['A', 'AAAA']) {
    const r = await consultar(dominio, tipo, pedir)
    if (!r || r.Status === undefined) return 'desconocido'
    if ((r.Answer ?? []).length > 0) return 'valido'
  }
  return 'inexistente'
}

export async function verificarDominios(
  dominios: string[],
  pedir: typeof fetch = fetch,
): Promise<Record<string, EstadoDominio>> {
  const pendientes = [...new Set(dominios)]
  const resultado: Record<string, EstadoDominio> = {}
  const trabajador = async () => {
    for (let d = pendientes.pop(); d !== undefined; d = pendientes.pop()) {
      resultado[d] = await verificarDominio(d, pedir)
    }
  }
  await Promise.all(Array.from({ length: CONSULTAS_SIMULTANEAS }, trabajador))
  return resultado
}

const texto = (v: unknown) => String(v ?? '').trim()

export function valoresDeColumna(filas: FilaDestinatario[], columna: string): string[] {
  const valores = new Set(filas.map((f) => texto(f.datos[columna])))
  return [...valores].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
}

// Sin valores seleccionados no se filtra.
export function aplicarFiltro(
  filas: FilaDestinatario[],
  columna: string,
  valores: Set<string>,
): FilaDestinatario[] {
  if (!columna || valores.size === 0) return filas
  return filas.filter((f) => valores.has(texto(f.datos[columna])))
}
