import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { buildRegistrosMap, isScheduled, toISODate, calcStreak } from './habitosUtils'
import HabitosRightPanel from './HabitosRightPanel'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAY_INITIALS = ['D','L','M','M','J','V','S']

// Detect where streak breaks: returns Set of dateStr where a scheduled day has no completion
function calcBrokenDates(habito, registrosMap, year, month) {
  const broken = new Set()
  const today = new Date(); today.setHours(0,0,0,0)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date    = new Date(year, month, d)
    const dateStr = toISODate(date)
    if (date >= today) continue
    if (isScheduled(habito, date)) {
      const reg = registrosMap[`${habito.id}-${dateStr}`]
      if (!reg || reg.valor === 0) broken.add(dateStr)
    }
  }
  return broken
}

// Modal showing all habit states for a given day
function DetalleDiaModal({ dateStr, habitos, registrosMap, onClose }) {
  const [d, m, y] = [
    parseInt(dateStr.slice(8)),
    parseInt(dateStr.slice(5,7)) - 1,
    parseInt(dateStr.slice(0,4)),
  ]
  const date = new Date(y, m, d)
  const label = `${d} de ${MONTH_NAMES[m]} ${y}`

  const items = habitos
    .filter(h => h.activo)
    .map(h => {
      if (!isScheduled(h, date)) return null
      const reg = registrosMap[`${h.id}-${dateStr}`]
      return { h, reg, valor: reg?.valor ?? 0 }
    })
    .filter(Boolean)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl border flex flex-col max-h-[80vh]"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <div className="label">Detalle del día</div>
            <div className="text-[15px] font-semibold serif italic" style={{ color: 'var(--text)' }}>{label}</div>
          </div>
          <button onClick={onClose} className="icon-btn"><X size={15} /></button>
        </div>
        <div className="overflow-y-auto p-4 flex flex-col gap-2">
          {items.length === 0 ? (
            <p className="text-[13px] text-center py-4" style={{ color: 'var(--mute)' }}>Sin hábitos programados este día</p>
          ) : items.map(({ h, reg, valor }) => (
            <div key={h.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'var(--surface)' }}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: h.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{h.nombre}</div>
                {reg?.nota && <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--subtext)' }}>{reg.nota}</div>}
              </div>
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-lg shrink-0"
                style={{
                  background: valor >= 1 ? 'color-mix(in oklch, var(--success) 18%, transparent)'
                    : valor > 0 ? 'color-mix(in oklch, var(--warning) 18%, transparent)'
                    : 'color-mix(in oklch, var(--danger) 15%, transparent)',
                  color: valor >= 1 ? 'var(--success)' : valor > 0 ? 'var(--warning)' : 'var(--danger)',
                }}
              >
                {valor >= 1 ? 'Total' : valor > 0 ? 'Parcial' : 'Sin completar'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const PERIODS = [
  { id: 'mes',       label: 'Mes' },
  { id: 'trimestre', label: 'Trimestre' },
  { id: 'año',       label: 'Año' },
]

export default function HistorialTab({ selectedId, setSelectedId, onEdit, onHabitoContextMenu }) {
  const habitos          = useStore(s => s.habitos)
  const habitosRegistros = useStore(s => s.habitosRegistros)

  const today    = new Date(); today.setHours(0,0,0,0)
  const [displayDate, setDisplayDate]   = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [filterHabitoId, setFilterHabitoId] = useState(null)
  const [period, setPeriod]             = useState('mes')
  const [detalleDay, setDetalleDay]     = useState(null) // dateStr for DetalleDiaModal

  const registrosMap = useMemo(() => buildRegistrosMap(habitosRegistros), [habitosRegistros])
  const activos      = useMemo(() => habitos.filter(h => h.activo), [habitos])
  const filtered     = useMemo(() =>
    filterHabitoId ? activos.filter(h => h.id === filterHabitoId) : activos,
    [activos, filterHabitoId]
  )

  // Determine which months to show based on period
  const months = useMemo(() => {
    const y = displayDate.getFullYear()
    const m = displayDate.getMonth()
    if (period === 'mes') {
      return [{ year: y, month: m }]
    }
    if (period === 'trimestre') {
      const qStart = Math.floor(m / 3) * 3
      return [0,1,2].map(i => {
        const mm = qStart + i
        return mm <= 11 ? { year: y, month: mm } : { year: y + 1, month: mm - 12 }
      })
    }
    // año
    return Array.from({ length: 12 }, (_, i) => ({ year: y, month: i }))
  }, [displayDate, period])

  function prevPeriod() {
    const y = displayDate.getFullYear()
    const m = displayDate.getMonth()
    if (period === 'mes')       setDisplayDate(new Date(y, m - 1, 1))
    if (period === 'trimestre') setDisplayDate(new Date(y, m - 3, 1))
    if (period === 'año')       setDisplayDate(new Date(y - 1, 0, 1))
  }
  function nextPeriod() {
    const y = displayDate.getFullYear()
    const m = displayDate.getMonth()
    const isAtPresent = period === 'mes'
      ? (y === today.getFullYear() && m === today.getMonth())
      : period === 'trimestre'
      ? (y === today.getFullYear() && Math.floor(m/3) >= Math.floor(today.getMonth()/3))
      : (y >= today.getFullYear())
    if (isAtPresent) return
    if (period === 'mes')       setDisplayDate(new Date(y, m + 1, 1))
    if (period === 'trimestre') setDisplayDate(new Date(y, m + 3, 1))
    if (period === 'año')       setDisplayDate(new Date(y + 1, 0, 1))
  }

  // Period label for header
  const periodLabel = useMemo(() => {
    const y = displayDate.getFullYear()
    const m = displayDate.getMonth()
    if (period === 'mes')       return `${MONTH_NAMES[m]} ${y}`
    if (period === 'trimestre') return `Q${Math.floor(m/3)+1} ${y}`
    return `${y}`
  }, [displayDate, period])

  // For each month: broken dates from the single filtered habit (only shown if 1 habit selected)
  const singleHabitoFilter = filterHabitoId ? activos.find(h => h.id === filterHabitoId) : null

  function buildMonthData(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const firstDow    = new Date(year, month, 1).getDay()
    const brokenDates = singleHabitoFilter
      ? calcBrokenDates(singleHabitoFilter, registrosMap, year, month)
      : new Set()

    const dayData = Array.from({ length: daysInMonth }, (_, i) => {
      const d       = i + 1
      const date    = new Date(year, month, d)
      const dateStr = toISODate(date)
      const isFuture = date > today
      const isToday  = dateStr === toISODate(today)

      let scheduledCount = 0, doneSum = 0
      const notes = []
      for (const h of filtered) {
        if (!isScheduled(h, date)) continue
        scheduledCount++
        const reg = registrosMap[`${h.id}-${dateStr}`]
        if (reg) {
          doneSum += reg.valor
          if (reg.nota) notes.push({ habito: h.nombre, nota: reg.nota, valor: reg.valor })
        }
      }
      const pct     = scheduledCount > 0 ? doneSum / scheduledCount : null
      const isBroken = brokenDates.has(dateStr)
      return { d, dateStr, date, isFuture, isToday, pct, notes, scheduledCount, isBroken }
    })
    return { daysInMonth, firstDow, dayData, year, month }
  }

  const monthsData = useMemo(() =>
    months.map(({ year, month }) => buildMonthData(year, month)),
    [months, filtered, registrosMap]
  )

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left: period selector + filter */}
      <aside
        className="w-[220px] shrink-0 h-full overflow-y-auto p-4"
        style={{ borderRight: '1px solid var(--border)' }}
      >
        {/* Period selector */}
        <div className="label mb-2">Período</div>
        <div
          className="flex gap-0.5 p-0.5 rounded-lg border mb-3"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className="flex-1 text-[11px] py-1 rounded-md transition-all"
              style={{
                background: period === p.id ? 'var(--bg)' : 'transparent',
                color:      period === p.id ? 'var(--text)' : 'var(--subtext)',
                fontWeight: period === p.id ? 600 : 400,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-4">
          <button className="icon-btn" onClick={prevPeriod} aria-label="Período anterior">
            <ChevronLeft size={14} />
          </button>
          <span className="flex-1 text-center text-[13px] font-medium serif italic" style={{ color: 'var(--text)' }}>
            {periodLabel}
          </span>
          <button
            className="icon-btn"
            onClick={nextPeriod}
            aria-label="Período siguiente"
            disabled={period === 'año'
              ? displayDate.getFullYear() >= today.getFullYear()
              : period === 'trimestre'
              ? (displayDate.getFullYear() === today.getFullYear() && Math.floor(displayDate.getMonth()/3) >= Math.floor(today.getMonth()/3))
              : (displayDate.getFullYear() === today.getFullYear() && displayDate.getMonth() === today.getMonth())
            }
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Habit filter */}
        <div className="label mb-2">Hábito</div>
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => setFilterHabitoId(null)}
            className="text-left px-2.5 py-1.5 rounded-lg text-[12px] transition-colors"
            style={{ background: !filterHabitoId ? 'var(--surface)' : 'transparent', color: 'var(--text)' }}
          >
            Todos
          </button>
          {activos.map(h => (
            <button
              key={h.id}
              onClick={() => setFilterHabitoId(filterHabitoId === h.id ? null : h.id)}
              onContextMenu={onHabitoContextMenu ? e => onHabitoContextMenu(e, h) : undefined}
              className="text-left px-2.5 py-1.5 rounded-lg text-[12px] flex items-center gap-2 transition-colors"
              style={{ background: filterHabitoId === h.id ? 'var(--surface)' : 'transparent', color: 'var(--text)' }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: h.color }} />
              <span className="truncate">{h.nombre}</span>
            </button>
          ))}
        </div>

        {/* Racha rota legend — only if single habit selected */}
        {singleHabitoFilter && (
          <div className="mt-4 pt-3 border-t text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <span>⚡</span> Racha rota
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'color-mix(in oklch, var(--success) 25%, transparent)' }} />
              100%
            </div>
          </div>
        )}
      </aside>

      {/* Center: calendar grid(s) */}
      <div className="flex-1 min-w-0 overflow-y-auto p-5">
        <div className={`grid gap-5 ${months.length > 1 ? 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3' : ''}`}>
          {monthsData.map(({ daysInMonth, firstDow, dayData, year, month }) => (
            <div key={`${year}-${month}`} className="panel-strong overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="text-[14px] font-semibold serif italic" style={{ color: 'var(--text)' }}>
                  {MONTH_NAMES[month]} {year}
                </div>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--border)' }}>
                {DAY_INITIALS.map(d => (
                  <div key={d} className="py-2 text-center text-[10px] uppercase tracking-widest" style={{ color: 'var(--subtext)' }}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar cells */}
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDow }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}

                {dayData.map(({ d, dateStr, isFuture, isToday, pct, notes, scheduledCount, isBroken }) => {
                  const bgColor = isFuture || scheduledCount === 0 ? 'transparent'
                    : pct === null || pct === 0 ? 'color-mix(in oklch, var(--danger) 15%, transparent)'
                    : pct < 0.5 ? 'color-mix(in oklch, var(--warning) 20%, transparent)'
                    : pct < 1 ? 'color-mix(in oklch, var(--accent) 30%, transparent)'
                    : 'color-mix(in oklch, var(--success) 25%, transparent)'

                  return (
                    <div
                      key={d}
                      role="button"
                      tabIndex={scheduledCount > 0 && !isFuture ? 0 : undefined}
                      aria-label={`${d} de ${MONTH_NAMES[month]}: ${pct !== null && scheduledCount > 0 ? Math.round(pct*100) + '%' : 'sin datos'}`}
                      className="aspect-square p-1 border-b border-r flex flex-col items-center justify-start gap-0.5 group relative"
                      style={{
                        borderColor: 'var(--border)',
                        background: bgColor,
                        cursor: scheduledCount > 0 && !isFuture ? 'pointer' : 'default',
                      }}
                      onClick={() => scheduledCount > 0 && !isFuture && setDetalleDay(dateStr)}
                      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && scheduledCount > 0 && !isFuture) setDetalleDay(dateStr) }}
                    >
                      {/* Day number */}
                      <div
                        className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-medium tnum"
                        style={{
                          background: isToday ? 'var(--accent)' : 'transparent',
                          color: isToday ? 'white' : isFuture ? 'var(--mute)' : 'var(--text-2)',
                        }}
                      >
                        {d}
                      </div>

                      {/* % badge */}
                      {!isFuture && scheduledCount > 0 && pct !== null && (
                        <div
                          className="text-[9px] tnum font-semibold leading-none"
                          style={{ color: pct === 0 ? 'var(--danger)' : pct < 0.5 ? 'var(--warning)' : 'var(--success)' }}
                        >
                          {Math.round(pct * 100)}%
                        </div>
                      )}

                      {/* Racha rota indicator */}
                      {isBroken && (
                        <span className="text-[10px] leading-none" title="Racha rota aquí">⚡</span>
                      )}

                      {/* Notes tooltip */}
                      {notes.length > 0 && (
                        <div
                          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-[180px] rounded-xl p-2 text-[10.5px] z-20 opacity-0 group-hover:opacity-100 transition-opacity select-text"
                          style={{
                            background: 'var(--panel-bg)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-2)',
                            pointerEvents: 'auto',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                          }}
                        >
                          {notes.map((n, i) => (
                            <div key={i} className={i > 0 ? 'mt-1 pt-1 border-t' : ''} style={{ borderColor: 'var(--border)' }}>
                              <span className="font-medium" style={{ color: 'var(--text)' }}>{n.habito}</span>
                              <span style={{ color: n.valor >= 1 ? 'var(--success)' : 'var(--warning)' }}>
                                {n.valor >= 1 ? ' ✓' : ' ◑'}
                              </span>
                              <div className="mt-0.5">{n.nota}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Legend (only first month in multi-month view) */}
              {month === monthsData[0].month && year === monthsData[0].year && (
                <div className="flex items-center gap-4 px-5 py-3 border-t text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}>
                  {[
                    { bg: 'color-mix(in oklch, var(--success) 25%, transparent)', label: '100%' },
                    { bg: 'color-mix(in oklch, var(--accent) 30%, transparent)',   label: '50-99%' },
                    { bg: 'color-mix(in oklch, var(--warning) 20%, transparent)',  label: '1-49%' },
                    { bg: 'color-mix(in oklch, var(--danger) 15%, transparent)',   label: '0%' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm" style={{ background: item.bg }} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <HabitosRightPanel selectedId={selectedId} onEdit={onEdit} />

      {/* Detalle día modal */}
      {detalleDay && (
        <DetalleDiaModal
          dateStr={detalleDay}
          habitos={activos}
          registrosMap={registrosMap}
          onClose={() => setDetalleDay(null)}
        />
      )}
    </div>
  )
}
