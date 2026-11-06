import { useMemo, useState } from 'react'
import { Boton, Modal, TableHead, filaZebra } from './ui'
import type { FilaDestinatario } from '../lib/excel'
import type { CampoFormulario } from '../lib/destinatarios'

const POR_PAGINA = 10
const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#16468E] focus:ring-1 focus:ring-[#16468E]'

type Formulario = { titulo: string; original: string | null; indiceDescartada: number | null; valores: Record<string, string> }

type Props = {
  filas: FilaDestinatario[]                // ya filtradas por columna
  columnas: string[]
  campos: CampoFormulario[]                // lo que pide el formulario, según la plantilla
  excluidos: Map<string, string>           // correo en minúsculas -> razón
  descartadas: FilaDestinatario[]          // correo inválido en el archivo
  // Devuelve un mensaje si no se pudo guardar.
  onGuardar: (original: string | null, valores: Record<string, string>, indiceDescartada: number | null) => Promise<string | null>
  onEliminar: (email: string) => void
  onEliminarDescartada: (indice: number) => void
}

export default function TablaDestinatarios({
  filas, columnas, campos, excluidos, descartadas, onGuardar, onEliminar, onEliminarDescartada,
}: Props) {
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(0)
  const [form, setForm] = useState<Formulario | null>(null)
  const [aEliminar, setAEliminar] = useState<string | null>(null)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return filas
    return filas.filter((f) => columnas.some((c) => String(f.datos[c] ?? '').toLowerCase().includes(q)))
  }, [filas, columnas, busqueda])

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas - 1)
  const pagino = visibles.slice(paginaActual * POR_PAGINA, (paginaActual + 1) * POR_PAGINA)

  function abrir(titulo: string, fila: FilaDestinatario | null, original: string | null, indiceDescartada: number | null = null) {
    const valores: Record<string, string> = {}
    for (const c of campos) valores[c.clave] = String(fila?.datos[c.clave] ?? '')
    setErrorForm(null)
    setForm({ titulo, original, indiceDescartada, valores })
  }

  async function guardar() {
    if (!form) return
    setGuardando(true); setErrorForm(null)
    const mensaje = await onGuardar(form.original, form.valores, form.indiceDescartada)
    setGuardando(false)
    if (mensaje) setErrorForm(mensaje)
    else setForm(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(0) }} placeholder="Buscar…"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#16468E]" />
        <Boton onClick={() => abrir('Agregar destinatario', null, null)}>+ Agregar destinatario</Boton>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <TableHead>
            {columnas.map((c, i) => <th key={c}>{c}{i === 0 && ' (correo)'}</th>)}
            <th className="text-right">Acciones</th>
          </TableHead>
          <tbody>
            {pagino.map((f, i) => {
              const razon = excluidos.get(f.email.toLowerCase())
              return (
                <tr key={f.email} className={razon ? 'border-t border-amber-200 bg-amber-50' : filaZebra(i)}>
                  {columnas.map((c, j) => (
                    <td key={c} className="px-4 py-2">
                      {String(f.datos[c] ?? '')}
                      {j === 0 && razon && <span className="block text-xs text-amber-700">Excluido: {razon}</span>}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button onClick={() => abrir('Editar destinatario', f, f.email)} className="text-[#16468E] hover:underline">Editar</button>
                    <button onClick={() => setAEliminar(f.email)} className="ml-3 text-red-600 hover:underline">Eliminar</button>
                  </td>
                </tr>
              )
            })}
            {pagino.length === 0 && (
              <tr><td colSpan={columnas.length + 1} className="px-4 py-6 text-center text-slate-400">
                {filas.length === 0 ? 'No hay destinatarios. Agrega uno o selecciona otro archivo.' : 'Ninguno coincide con la búsqueda.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{visibles.length} registros. Los cambios aplican solo a esta campaña; tu archivo no se modifica.</span>
        {totalPaginas > 1 && (
          <div className="flex items-center gap-2">
            <Boton variante="secundario" disabled={paginaActual === 0} onClick={() => setPagina(paginaActual - 1)}>Anterior</Boton>
            <span>Página {paginaActual + 1} de {totalPaginas}</span>
            <Boton variante="secundario" disabled={paginaActual >= totalPaginas - 1} onClick={() => setPagina(paginaActual + 1)}>Siguiente</Boton>
          </div>
        )}
      </div>

      {descartadas.length > 0 && (
        <details className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <summary className="cursor-pointer font-medium">Filas sin correo válido ({descartadas.length}): no se enviarán</summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
            {descartadas.map((f, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                <span><b>{f.email || '(vacío)'}</b> · {columnas.slice(1, 3).map((c) => String(f.datos[c] ?? '')).join(' · ')}</span>
                <span className="whitespace-nowrap">
                  <button onClick={() => abrir('Corregir destinatario', f, null, i)} className="text-[#16468E] hover:underline">Corregir</button>
                  <button onClick={() => onEliminarDescartada(i)} className="ml-3 text-red-600 hover:underline">Quitar</button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Modal open={form !== null} onClose={() => setForm(null)} titulo={form?.titulo}>
        {form && (
          <div className="space-y-3">
            <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
              {campos.map((c) => (
                <div key={c.clave}>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{c.etiqueta}</label>
                  <input value={form.valores[c.clave] ?? ''} className={inputCls}
                    onChange={(e) => setForm({ ...form, valores: { ...form.valores, [c.clave]: e.target.value } })} />
                </div>
              ))}
            </div>
            {errorForm && <p className="text-sm text-red-600">{errorForm}</p>}
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setForm(null)}>Cancelar</Boton>
              <Boton onClick={guardar} disabled={guardando}>{guardando ? 'Verificando…' : 'Guardar'}</Boton>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={aEliminar !== null} onClose={() => setAEliminar(null)} titulo="Eliminar destinatario">
        <p className="text-sm text-slate-600">¿Quitar a <b>{aEliminar}</b> de esta campaña?</p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setAEliminar(null)}>Cancelar</Boton>
          <Boton onClick={() => { if (aEliminar) onEliminar(aEliminar); setAEliminar(null) }}>Eliminar</Boton>
        </div>
      </Modal>
    </div>
  )
}
