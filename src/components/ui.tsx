import type { ReactNode } from 'react'

// --- Card de métrica con degradado institucional ---
export function MetricCard({
  titulo, valor, icono, sub, porcentaje,
}: { titulo: string; valor: ReactNode; icono?: ReactNode; sub?: string; porcentaje?: number }) {
  return (
    <div className="rounded-2xl p-5 text-white shadow-md
                    bg-gradient-to-br from-[#0D2D6B] to-[#16468E]">
      <div className="flex items-center justify-between">
        <span className="text-sm/5 opacity-80">{titulo}</span>
        {icono}
      </div>
      <div className="mt-2 text-3xl font-bold">{valor}</div>
      {sub && <div className="mt-1 text-xs opacity-75">{sub}</div>}
      {porcentaje !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, porcentaje)}%` }} />
        </div>
      )}
    </div>
  )
}

// --- Encabezado de página ---
export function PageHeader({ titulo, acciones }:
  { titulo: string; acciones?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-[#0D2D6B]">{titulo}</h1>
      <div className="flex gap-2">{acciones}</div>
    </div>
  )
}

// --- Barra de filtros reutilizable ---
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl
                    border border-slate-200 bg-white p-4 shadow-sm">
      {children}
    </div>
  )
}

// --- Modal reutilizable ---
export function Modal({ open, onClose, titulo, children }:
  { open: boolean; onClose: () => void; titulo?: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
           onClick={(e) => e.stopPropagation()}>
        {titulo && (
          <div className="rounded-t-2xl bg-[#0D2D6B] px-5 py-3 text-white font-medium">
            {titulo}
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// --- Botón primario institucional ---
export function Boton({ children, variante = 'primario', ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' }) {
  const base = 'rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors'
  const estilo = variante === 'primario'
    ? 'bg-[#0D2D6B] text-white hover:bg-[#16468E]'
    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
  return (
    <button {...props} className={`${base} ${estilo}`}>
      {children}
    </button>
  )
}

// --- Card contenedor blanco ---
export function Card({ children, className = '' }:
  { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

// --- Panel: tarjeta con encabezado, título, descripción y acción ---
export function Panel({ titulo, descripcion, accion, className = '', cuerpoClassName = '', children }: {
  titulo?: ReactNode
  descripcion?: ReactNode
  accion?: ReactNode
  className?: string
  cuerpoClassName?: string
  children: ReactNode
}) {
  return (
    <section className={`flex min-w-0 flex-col rounded-2xl border border-panel-borde bg-panel text-panel-texto shadow-sm ${className}`}>
      {(titulo || accion) && (
        <header className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight">{titulo}</h3>
            {descripcion && <p className="mt-0.5 text-xs text-panel-suave">{descripcion}</p>}
          </div>
          {accion}
        </header>
      )}
      <div className={`min-w-0 flex-1 px-5 pb-4 pt-3 ${cuerpoClassName}`}>{children}</div>
    </section>
  )
}

// --- Selector segmentado: rangos, métricas ---
export function Segmentado<T extends string>({ opciones, valor, onChange, etiqueta }: {
  opciones: { clave: T; etiqueta: string }[]
  valor: T | null
  onChange: (clave: T) => void
  etiqueta: string
}) {
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex rounded-lg border border-panel-borde bg-white/70 p-0.5">
      {opciones.map((o) => (
        <button key={o.clave} type="button" aria-pressed={valor === o.clave} onClick={() => onChange(o.clave)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            valor === o.clave ? 'bg-[#0D2D6B] text-white shadow-sm' : 'text-panel-suave hover:bg-white'}`}>
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}

// --- Tablas: encabezado oscuro y filas en cebra ---
export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-[#0D2D6B] text-left text-xs uppercase tracking-wide text-white">
      <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-semibold">{children}</tr>
    </thead>
  )
}
export function filaZebra(indice: number) {
  return `border-t border-slate-200 transition-colors hover:bg-blue-50 ${indice % 2 === 1 ? 'bg-slate-50' : 'bg-white'}`
}

// --- Progreso de un envío en curso ---
export function BarraProgreso({ total, enviados, fallidos, pendientes, omitidos = 0 }:
  { total: number; enviados: number; fallidos: number; pendientes: number; omitidos?: number }) {
  const procesados = enviados + fallidos + omitidos
  const pct = total ? Math.round((procesados / total) * 100) : 0
  return (
    <div>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
        className="h-3 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-[#16468E] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {pct}% · {enviados} enviados · {fallidos} fallidos
        {omitidos > 0 && ` · ${omitidos} omitidos`} · {pendientes} pendientes
      </p>
    </div>
  )
}

// --- Logo institucional (respeta base de Vite) ---
export function Logo({ blanco = false, className = '' }:
  { blanco?: boolean; className?: string }) {
  const file = blanco ? 'logo_cacsb_blanc.png' : 'logo_cacsb2.png'
  return (
    <img src={`${import.meta.env.BASE_URL}images/${file}`} alt="CAC Santa Bárbara"
         className={className} />
  )
}
