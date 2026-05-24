import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../../store/useStore'
import {
  buildRegistrosMap, isScheduled, calcMonthPct, toISODate
} from './habitosUtils'
import CompletarModal from './CompletarModal'
import HabitosRightPanel from './HabitosRightPanel'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAY_INITIALS = ['D','L','M','M','J','V','S']

const COL_NAME = 176
const COL_PCT  = 72
const COL_DAY  = 34

// SVG ring for today's header
function RingProgress({ value, size = 24, color }) {
  const r  = (size - 4) / 2
  const cx = size / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(1, value))
  return (
    <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" />
      <circle
        cx={cx} cy={cx} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="2.5"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
    </svg>
  )
}

export default function HoyTab({ selectedId, setSelectedId, onEdit, initialDate }) {
  const habitos               = useStore(s => s.habitos)
  const habitosRegistros      = useStore(s => s.habitosRegistros)
  const upsertHabitoRegistro  = useStore(s => s.upsertHabitoRegistro)
  const showToast             = useStore(s => s.showToast)

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [displayDate, setDisplayDate] = useState(
    initialDate
      ? new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
      : new Date(today.getFullYear(), today.getMonth(), 1)
  )
  const [completar, setCompletarState] = useState(null)
  const [justCompleted, setJustCompleted] = useState(null)
  // { hi: habitoIndex, di: dayIndex (1-based) }
  const [focusedCell, setFocusedCell] = useState(null)
  const [announcement, setAnnouncement] = useState('')

  const scrollRef  = useRef(null)
  const cellRefs   = useRef({})  // keyed by "hi-di"

  const year        = displayDate.getFullYear()
  const month       = displayDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr    = toISODate(today)
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()
  const todayDay    = today.getDate()

  const gridMinWidth = COL_NAME + daysInMonth * COL_DAY + COL_PCT

  const registrosMap = useMemo(() => buildRegistrosMap(habitosRegistros), [habitosRegistros])
  const activos      = useMemo(() => habitos.filter(h => h.activo), [habitos])

  // % today for ring
  const todayPct = useMemo(() => {
    const s = activos.filter(h => isScheduled(h, today)).length
    if (!s) return 0
    const d = activos.filter(h => {
      const reg = registrosMap[`${h.id}-${todayStr}`]
      return reg && reg.valor > 0
    }).length
    return d / s
  }, [activos, registrosMap, todayStr])

  // Scroll to today on mount / month change
  useEffect(() => {
    if (!scrollRef.current || !isCurrentMonth) return
    const offset = COL_NAME + (todayDay - 1) * COL_DAY - 80
    scrollRef.current.scrollLeft = Math.max(0, offset)
  }, [year, month, isCurrentMonth, todayDay])

  // Keyboard navigation
  useEffect(() => {
    if (!focusedCell) return
    const { hi, di } = focusedCell
    const h = activos[hi]
    if (!h) return

    const handler = async (e) => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','1','2','Enter','Escape'].includes(e.key)) {
        e.preventDefault()
      }
      if (e.key === 'ArrowLeft')  { const next = Math.max(1, di - 1); setFocusedCell({ hi, di: next }) }
      if (e.key === 'ArrowRight') { const next = Math.min(daysInMonth, di + 1); setFocusedCell({ hi, di: next }) }
      if (e.key === 'ArrowUp')    { const next = Math.max(0, hi - 1); setFocusedCell({ hi: next, di }) }
      if (e.key === 'ArrowDown')  { const next = Math.min(activos.length - 1, hi + 1); setFocusedCell({ hi: next, di }) }
      if (e.key === 'Escape') { setFocusedCell(null) }

      if (e.key === '1' || e.key === '2') {
        const valor = e.key === '1' ? 1.0 : 0.5
        const dateStr = toISODate(new Date(year, month, di))
        const date = new Date(year, month, di)
        if (!isScheduled(h, date) || date > today) return
        await upsertHabitoRegistro(h.id, dateStr, valor, null)
        setJustCompleted(`${h.id}-${dateStr}`)
        setTimeout(() => setJustCompleted(null), 500)
        setAnnouncement(`${h.nombre} marcado como ${valor >= 1 ? 'total' : 'parcial'} el ${di} de ${MONTH_NAMES[month]}`)
        setTimeout(() => setAnnouncement(''), 2000)
      }

      if (e.key === 'Enter') {
        const dateStr = toISODate(new Date(year, month, di))
        const date = new Date(year, month, di)
        if (!isScheduled(h, date) || date > today) return
        const el = cellRefs.current[`${hi}-${di}`]
        const rect = el?.getBoundingClientRect()
        const existingReg = registrosMap[`${h.id}-${dateStr}`] || null
        setCompletarState({ habitoId: h.id, fecha: dateStr, existingReg, anchorRect: rect })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [focusedCell, activos, daysInMonth, registrosMap, year, month, today])

  // Focus cell element when focusedCell changes
  useEffect(() => {
    if (!focusedCell) return
    const el = cellRefs.current[`${focusedCell.hi}-${focusedCell.di}`]
    el?.focus()
  }, [focusedCell])

  function prevMonth() { setDisplayDate(new Date(year, month - 1, 1)); setFocusedCell(null) }
  function nextMonth() { setDisplayDate(new Date(year, month + 1, 1)); setFocusedCell(null) }
  function goToday()   { setDisplayDate(new Date(today.getFullYear(), today.getMonth(), 1)); setFocusedCell(null) }

  const handleCellClick = useCallback((e, habitoId, dateStr, hi, di) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const existingReg = registrosMap[`${habitoId}-${dateStr}`] || null
    setCompletarState({ habitoId, fecha: dateStr, existingReg, anchorRect: rect })
    setFocusedCell({ hi, di })
  }, [registrosMap])

  function handleCompletarClose() {
    if (completar) {
      setJustCompleted(`${completar.habitoId}-${completar.fecha}`)
      setTimeout(() => setJustCompleted(null), 500)
    }
    setCompletarState(null)
  }

  return (
    <div
      className="flex flex-1 min-h-0 overflow-hidden"
      role="region"
      aria-label="Grilla de hábitos"
    >
      {/* aria-live region for keyboard completions */}
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

      {/* Center — grilla */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4">
        <div className="panel-strong overflow-hidden">

          {/* Month navigation */}
          <div
            className="flex items-center justify-between px-5 py-3.5 border-b shrink-0"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-3">
              <button
                className="icon-btn"
                onClick={prevMonth}
                aria-label={`Mes anterior: ${MONTH_NAMES[month === 0 ? 11 : month - 1]}`}
              >
                <ChevronLeft size={15} />
              </button>
              <div
                className="text-[15px] font-semibold serif italic min-w-[140px] text-center"
                aria-live="polite"
                aria-atomic="true"
              >
                {MONTH_NAMES[month]} {year}
              </div>
              <button
                className="icon-btn"
                onClick={nextMonth}
                aria-label={`Mes siguiente: ${MONTH_NAMES[month === 11 ? 0 : month + 1]}`}
              >
                <ChevronRight size={15} />
              </button>
            </div>
            {!isCurrentMonth && (
              <button className="btn" onClick={goToday} aria-label="Ir al mes actual">Hoy</button>
            )}
          </div>

          {activos.length === 0 ? (
            <div className="py-12 text-center text-[13px]" style={{ color: 'var(--subtext)' }}>
              Creá tu primer hábito con el botón + del panel izquierdo
            </div>
          ) : (
            <div className="overflow-x-auto" ref={scrollRef}>
              <div style={{ minWidth: gridMinWidth }}>

                {/* Header row */}
                <div role="row" className="flex border-b" style={{ borderColor: 'var(--border)' }}>
                  <div
                    role="columnheader"
                    className="sticky left-0 z-10 shrink-0 px-4 py-2 text-[10px] uppercase tracking-widest"
                    style={{ width: COL_NAME, background: 'var(--panel-bg)', color: 'var(--subtext)', borderRight: '1px solid var(--border)' }}
                  >
                    Hábito
                  </div>

                  <div className="flex flex-1">
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                      const date      = new Date(year, month, d)
                      const dateStr   = toISODate(date)
                      const isToday   = dateStr === todayStr
                      const dow       = date.getDay()
                      const isWeekend = dow === 0 || dow === 6
                      return (
                        <div
                          key={d}
                          role="columnheader"
                          aria-label={`${d} de ${MONTH_NAMES[month]}${isToday ? ', hoy' : ''}`}
                          className="flex flex-col items-center py-2 gap-0.5 shrink-0"
                          style={{
                            width: COL_DAY,
                            background: isToday ? 'color-mix(in oklch, var(--accent) 8%, transparent)' : undefined,
                            borderLeft:  isToday ? '1px solid color-mix(in oklch, var(--accent) 25%, transparent)' : undefined,
                            borderRight: isToday ? '1px solid color-mix(in oklch, var(--accent) 25%, transparent)' : undefined,
                          }}
                        >
                          <span className="text-[9px] uppercase" style={{ color: 'var(--mute)' }}>
                            {DAY_INITIALS[dow]}
                          </span>
                          {isToday ? (
                            <div
                              className="relative grid place-items-center text-white text-[11px] font-semibold tnum"
                              style={{ width: 24, height: 24 }}
                            >
                              <div
                                className="absolute inset-0 rounded-full"
                                style={{ background: 'var(--accent)' }}
                              />
                              <RingProgress value={todayPct} size={24} />
                              <span className="relative z-10">{d}</span>
                            </div>
                          ) : (
                            <span
                              className="text-[11px] tnum"
                              style={{ color: isWeekend ? 'var(--mute)' : 'var(--text-2)' }}
                            >
                              {d}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div
                    role="columnheader"
                    className="sticky right-0 z-10 shrink-0 px-3 py-2 text-[10px] uppercase tracking-widest text-right"
                    style={{ width: COL_PCT, background: 'var(--panel-bg)', color: 'var(--subtext)', borderLeft: '1px solid var(--border)' }}
                  >
                    Mes
                  </div>
                </div>

                {/* Habit rows */}
                <div role="grid" aria-label="Completaciones por hábito y día">
                  {activos.map((h, hi) => {
                    const isSelected = h.id === selectedId
                    const pct        = calcMonthPct(h, registrosMap, year, month)
                    const pctColor   = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)'
                    const nameBg     = isSelected
                      ? `color-mix(in oklch, ${h.color} 6%, var(--panel-bg))`
                      : 'var(--panel-bg)'

                    return (
                      <div
                        key={h.id}
                        role="row"
                        aria-label={h.nombre}
                        className="flex border-b last:border-b-0"
                        style={{
                          borderColor: 'var(--border)',
                          background: isSelected
                            ? `color-mix(in oklch, ${h.color} 4%, transparent)`
                            : 'transparent',
                        }}
                      >
                        {/* Sticky name cell */}
                        <div
                          role="rowheader"
                          className="sticky left-0 z-10 shrink-0 flex items-center gap-2.5 px-4 py-2.5 cursor-pointer"
                          style={{ width: COL_NAME, background: nameBg, borderRight: '1px solid var(--border)' }}
                          onClick={() => setSelectedId(isSelected ? null : h.id)}
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: h.color }} />
                          <span
                            className="text-[12.5px] font-medium truncate flex-1"
                            style={{ color: 'var(--text)' }}
                            title={h.descripcion || ''}
                          >
                            {h.nombre}
                          </span>
                        </div>

                        {/* Day cells */}
                        <div className="flex flex-1">
                          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                            const date      = new Date(year, month, d)
                            const dateStr   = toISODate(date)
                            const isFuture  = date > today
                            const isToday   = dateStr === todayStr
                            const scheduled = isScheduled(h, date)
                            const reg       = registrosMap[`${h.id}-${dateStr}`]
                            const isDone    = reg && reg.valor >= 1
                            const isPartial = reg && reg.valor > 0 && reg.valor < 1
                            const cellKey   = `${h.id}-${dateStr}`
                            const isAnimating = justCompleted === cellKey
                            const isFocused = focusedCell?.hi === hi && focusedCell?.di === d
                            const isClickable = scheduled && !isFuture

                            const tooltipParts = [`${d} ${MONTH_NAMES[month].slice(0,3)}`]
                            if (isDone)    tooltipParts.push('✓ Total')
                            else if (isPartial) tooltipParts.push('◑ Parcial')
                            if (reg?.nota) tooltipParts.push(reg.nota)

                            let cellContent
                            if (!scheduled) {
                              cellContent = <span className="w-3 h-px" style={{ background: 'var(--border)' }} />
                            } else if (isFuture) {
                              cellContent = <div className="w-[18px] h-[18px] rounded-md border opacity-25" style={{ borderColor: 'var(--border)' }} />
                            } else if (isDone) {
                              cellContent = (
                                <div
                                  className={`w-[18px] h-[18px] rounded-md grid place-items-center${isAnimating ? ' habito-cell-pulse' : ''}`}
                                  style={{ background: h.color }}
                                >
                                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                    <path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </div>
                              )
                            } else if (isPartial) {
                              cellContent = (
                                <div
                                  className={`w-[18px] h-[18px] rounded-md grid place-items-center${isAnimating ? ' habito-cell-pulse' : ''}`}
                                  style={{ background: 'var(--warning)', opacity: 0.85 }}
                                >
                                  <div className="w-2 h-0.5 rounded-full bg-white" />
                                </div>
                              )
                            } else {
                              cellContent = (
                                <div
                                  className="w-[18px] h-[18px] rounded-md border transition-colors duration-100"
                                  style={{ borderColor: isToday ? 'var(--accent)' : 'var(--border)' }}
                                />
                              )
                            }

                            return (
                              <div
                                key={d}
                                ref={el => { cellRefs.current[`${hi}-${d}`] = el }}
                                role="gridcell"
                                aria-label={tooltipParts.join(' · ')}
                                aria-selected={isFocused}
                                tabIndex={isClickable ? (isFocused ? 0 : -1) : undefined}
                                title={tooltipParts.join(' · ')}
                                className="shrink-0 grid place-items-center focus-visible:outline-none"
                                style={{
                                  width: COL_DAY,
                                  height: 40,
                                  background: isToday ? 'color-mix(in oklch, var(--accent) 6%, transparent)' : undefined,
                                  cursor: isClickable ? 'pointer' : 'default',
                                  boxShadow: isFocused ? 'inset 0 0 0 2px var(--accent)' : undefined,
                                }}
                                onClick={isClickable
                                  ? e => handleCellClick(e, h.id, dateStr, hi, d)
                                  : undefined
                                }
                                onFocus={() => isClickable && setFocusedCell({ hi, di: d })}
                              >
                                {cellContent}
                              </div>
                            )
                          })}
                        </div>

                        {/* Sticky % cell */}
                        <div
                          role="gridcell"
                          className="sticky right-0 z-10 shrink-0 flex items-center justify-end px-3 py-2.5"
                          style={{ width: COL_PCT, background: nameBg, borderLeft: '1px solid var(--border)' }}
                        >
                          <span
                            className="chip tnum text-[11px]"
                            style={{
                              color: pctColor,
                              background: `color-mix(in oklch, ${pctColor} 14%, transparent)`,
                              borderColor: `color-mix(in oklch, ${pctColor} 30%, transparent)`,
                            }}
                          >
                            {pct}%
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

              </div>
            </div>
          )}

          {/* Leyenda */}
          {activos.length > 0 && (
            <div
              className="flex items-center gap-4 px-5 py-2.5 border-t text-[10.5px]"
              style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-px block" style={{ background: 'var(--border)' }} />
                <span>No programado</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm border" style={{ borderColor: 'var(--border)' }} />
                <span>Pendiente</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--warning)', opacity: 0.85 }} />
                <span>Parcial</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--accent)' }} />
                <span>Total</span>
              </div>
              <div className="ml-auto text-[10px] hidden sm:block" style={{ color: 'var(--mute)' }}>
                ← → ↑ ↓ navegar · 1 total · 2 parcial · Enter abrir
              </div>
            </div>
          )}
        </div>
      </div>

      <HabitosRightPanel selectedId={selectedId} onEdit={onEdit} />

      {completar && (
        <CompletarModal
          habitoId={completar.habitoId}
          fecha={completar.fecha}
          existingReg={completar.existingReg}
          anchorRect={completar.anchorRect}
          onClose={handleCompletarClose}
        />
      )}
    </div>
  )
}
