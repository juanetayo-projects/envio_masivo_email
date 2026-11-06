import { useMemo, useRef, useState } from 'react'

export type CeldaCalor = { dia: number; hora: number; n: number }   // dia: 1 = lunes

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const HORAS = Array.from({ length: 24 }, (_, h) => h)
// Un solo tono, de claro a oscuro: más oscuro significa más actividad.
const ESCALA = ['#EAF0FA', '#B5D4F4', '#85B7EB', '#378ADD', '#185FA5', '#0C447C', '#0D2D6B']
const dosDigitos = (h: number) => String(h).padStart(2, '0')

export default function MapaCalor({ celdas, unidad }: { celdas: CeldaCalor[]; unidad: string }) {
  const contenedor = useRef<HTMLDivElement>(null)
  const [activa, setActiva] = useState<{ dia: number; hora: number; n: number; x: number; y: number } | null>(null)

  const { matriz, max } = useMemo(() => {
    const m = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
    let mayor = 0
    for (const c of celdas) {
      m[c.dia - 1][c.hora] = c.n
      if (c.n > mayor) mayor = c.n
    }
    return { matriz: m, max: mayor }
  }, [celdas])

  function mostrar(dia: number, hora: number, n: number, el: HTMLElement) {
    if (!contenedor.current) return
    const caja = contenedor.current.getBoundingClientRect()
    const celda = el.getBoundingClientRect()
    setActiva({ dia, hora, n, x: Math.min(celda.left - caja.left, caja.width - 170), y: celda.bottom - caja.top + 6 })
  }

  if (max === 0) return <p className="py-8 text-center text-sm text-slate-400">Sin {unidad} en este periodo.</p>

  return (
    <div ref={contenedor} className="relative overflow-x-auto">
      <div className="grid min-w-[620px] items-center gap-[3px]" style={{ gridTemplateColumns: '34px repeat(24, 1fr)' }}>
        <div />
        {HORAS.map((h) => <div key={h} className="text-center text-[10px] text-slate-400">{h % 2 === 0 ? h : ''}</div>)}
        {DIAS.map((d, i) => (
          <div key={d} className="contents">
            <div className="pr-1 text-right text-[11px] text-slate-500">{d}</div>
            {HORAS.map((h) => {
              const n = matriz[i][h]
              const nivel = n > 0 ? Math.max(1, Math.round((n / max) * (ESCALA.length - 1))) : 0
              return (
                <div key={h} tabIndex={n > 0 ? 0 : -1} aria-label={`${d} ${dosDigitos(h)}:00, ${n} ${unidad}`}
                  onMouseEnter={(e) => mostrar(i, h, n, e.currentTarget)} onMouseLeave={() => setActiva(null)}
                  onFocus={(e) => mostrar(i, h, n, e.currentTarget)} onBlur={() => setActiva(null)}
                  className="flex h-6 items-center justify-center rounded-[3px] text-[10px] font-medium"
                  style={{ background: n > 0 ? ESCALA[nivel] : '#F1F5F9', color: nivel >= 4 ? '#fff' : '#0C447C' }}>
                  {n > 0 && max <= 40 ? n : ''}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-slate-500">
        <span>Menos</span>
        {ESCALA.map((c) => <span key={c} className="h-3 w-4 rounded-[2px]" style={{ background: c }} />)}
        <span>Más ({max})</span>
      </div>

      {activa && (
        <div className="pointer-events-none absolute z-10 w-40 rounded-lg bg-[#0D2D6B] px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: Math.max(0, activa.x), top: activa.y }}>
          <div className="text-white/70">{DIAS[activa.dia]} · {dosDigitos(activa.hora)}:00–{dosDigitos(activa.hora)}:59</div>
          <div className="font-semibold">{activa.n} {unidad}</div>
        </div>
      )}
    </div>
  )
}
