import type { ReactNode } from 'react'

// --- Card de métrica con degradado institucional ---
export function MetricCard({
  titulo, valor, icono, sub,
}: { titulo: string; valor: ReactNode; icono?: ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl p-5 text-white shadow-md
                    bg-gradient-to-br from-[#0D2D6B] to-[#16468E]">
      <div className="flex items-center justify-between">
        <span className="text-sm/5 opacity-80">{titulo}</span>
        {icono}
      </div>
      <div className="mt-2 text-3xl font-bold">{valor}</div>
      {sub && <div className="mt-1 text-xs opacity-75">{sub}</div>}
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

// --- Logo institucional (respeta base de Vite) ---
export function Logo({ blanco = false, className = '' }:
  { blanco?: boolean; className?: string }) {
  const file = blanco ? 'logo_cacsb_blanc.png' : 'logo_cacsb2.png'
  return (
    <img src={`${import.meta.env.BASE_URL}images/${file}`} alt="CAC Santa Bárbara"
         className={className} />
  )
}
