import { useEffect, useMemo, useState } from 'react'

export type CeldaCalor = { dia: number; hora: number; n: number }   // dia: 1 = lunes

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const HORAS = Array.from({ length: 24 }, (_, h) => h)
// Un solo tono, de claro a oscuro: más oscuro significa más actividad.
const ESCALA = ['#EAF0FA', '#B5D4F4', '#85B7EB', '#378ADD', '#185FA5', '#0C447C', '#0D2D6B']
const ANCHO_RECUADRO = 160
const ALTO_RECUADRO = 56
const MARGEN = 6
const dosDigitos = (h: number) => String(h).padStart(2, '0')

export default function MapaCalor({ celdas, unidad }: { celdas: CeldaCalor[]; unidad: string }) {
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

  // Al desplazar la página el recuadro quedaría flotando lejos de su celda.
  const hayActiva = activa !== null
  useEffect(() => {
    if (!hayActiva) return
    const ocultar = () => setActiva(null)
    window.addEventListener('scroll', ocultar, true)
    return () => window.removeEventListener('scroll', ocultar, true)
  }, [hayActiva])

  // El recuadro es "fixed": no ocupa espacio en el contenedor con desplazamiento. Si
  // ocupara, en las últimas filas haría aparecer barras que mueven la celda bajo el
  // mouse, y el recuadro se abriría y cerraría sin parar.
  function mostrar(dia: number, hora: number, n: number, el: HTMLElement) {
    if (n === 0) return
    const celda = el.getBoundingClientRect()
    const abajo = celda.bottom + MARGEN
    const y = abajo + ALTO_RECUADRO > window.innerHeight ? celda.top - ALTO_RECUADRO - MARGEN : abajo
    const x = Math.max(MARGEN, Math.min(celda.left, window.innerWidth - ANCHO_RECUADRO - MARGEN))
    setActiva({ dia, hora, n, x, y })
  }

  if (max === 0) return <p className="py-8 text-center text-sm text-panel-suave">Sin {unidad} en este periodo.</p>

  const texto = (n: number) => `${n} ${n === 1 ? unidad.replace(/s$/, '') : unidad}`

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[620px] items-center gap-[3px]" style={{ gridTemplateColumns: '34px repeat(24, 1fr)' }}>
        <div />
        {HORAS.map((h) => <div key={h} className="text-center text-[10px] text-panel-suave">{h % 2 === 0 ? h : ''}</div>)}
        {DIAS.map((d, i) => (
          <div key={d} className="contents">
            <div className="pr-1 text-right text-[11px] text-panel-suave">{d}</div>
            {HORAS.map((h) => {
              const n = matriz[i][h]
              const nivel = n > 0 ? Math.max(1, Math.round((n / max) * (ESCALA.length - 1))) : 0
              return (
                <div key={h} tabIndex={n > 0 ? 0 : -1} aria-label={`${d} ${dosDigitos(h)}:00, ${texto(n)}`}
                  onMouseEnter={(e) => mostrar(i, h, n, e.currentTarget)} onMouseLeave={() => setActiva(null)}
                  onFocus={(e) => mostrar(i, h, n, e.currentTarget)} onBlur={() => setActiva(null)}
                  className="flex h-6 items-center justify-center rounded-[3px] text-[10px] font-medium"
                  style={{ background: n > 0 ? ESCALA[nivel] : 'rgba(255,255,255,0.65)', color: nivel >= 4 ? '#fff' : '#0C447C' }}>
                  {n > 0 && max <= 40 ? n : ''}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-panel-suave">
        <span>Menos</span>
        {ESCALA.map((c) => <span key={c} className="h-3 w-4 rounded-[2px]" style={{ background: c }} />)}
        <span>Más ({max})</span>
      </div>

      {activa && (
        <div className="pointer-events-none fixed z-50 rounded-lg bg-[#0D2D6B] px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: activa.x, top: activa.y, width: ANCHO_RECUADRO }}>
          <div className="text-white/70">{DIAS[activa.dia]} · {dosDigitos(activa.hora)}:00–{dosDigitos(activa.hora)}:59</div>
          <div className="font-semibold">{texto(activa.n)}</div>
        </div>
      )}
    </div>
  )
}
