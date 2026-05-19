import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { buildRegistrosMap, isScheduled, toISODate } from './habitosUtils'
import HabitosRightPanel from './HabitosRightPanel'

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAY_INITIALS = ['D','L','M','M','J','V','S']

export default function HistorialTab({ selectedId, setSelectedId, onEdit }) {
  const habitos          = useStore(s => s.habitos)
  const habitosRegistros = useStore(s => s.habitosRegistros)

  const today    = new Date(); today.setHours(0,0,0,0)
  const [displayDate, setDisplayDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [filterHabitoId, setFilterHabitoId] = useState(null)

  const year        = displayDate.getFullYear()
  const month       = displayDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow    = new Date(year, month, 1).getDay() // 0=Sun

  const registrosMap = buildRegistrosMap(habitosRegistros)
  const activos      = habitos.filter(h => h.activo)
  const filtered     = filterHabitoId ? activos.filter(h => h.id === filterHabitoId) : activos

  function prevMonth() { setDisplayDate(new Date(year, month - 1, 1)) }
  function nextMonth()  { setDisplayDate(new Date(year, month + 1, 1)) }

  // For each day: compute overall % and detect broken streaks
  const dayData = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    const date    = new Date(year, month, d)
    const dateStr = toISODate(date)
    const isPast  = date < today
    const isToday = dateStr === toISODate(today)
    const isFuture = date > today

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

    const pct = scheduledCount > 0 ? doneSum / scheduledCount : null
    return { d, dateStr, date, isPast, isToday, isFuture, pct, notes, scheduledCount }
  })

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left: period selector + filter */}
      <aside
        className="w-[220px] shrink-0 h-full overflow-y-auto p-4"
        style={{ borderRight: '1px solid var(--border)' }}
      >
        <div className="label mb-3">Período</div>
        <div className="flex items-center gap-2 mb-4">
          <button className="icon-btn" onClick={prevMonth}><ChevronLeft size={14} /></button>
          <span className="flex-1 text-center text-[13px] font-medium serif italic" style={{ color: 'var(--text)' }}>
            {MONTH_NAMES[month].slice(0,3)} {year}
          </span>
          <button className="icon-btn" onClick={nextMonth} disabled={month === today.getMonth() && year === today.getFullYear()}>
            <ChevronRight size={14} />
          </button>
        </div>

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
              className="text-left px-2.5 py-1.5 rounded-lg text-[12px] flex items-center gap-2 transition-colors"
              style={{ background: filterHabitoId === h.id ? 'var(--surface)' : 'transparent', color: 'var(--text)' }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: h.color }} />
              <span className="truncate">{h.nombre}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Center: calendar grid */}
      <div className="flex-1 min-w-0 overflow-y-auto p-5">
        <div className="panel-strong overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[15px] font-semibold serif italic" style={{ color: 'var(--text)' }}>
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
            {/* Empty cells before first day */}
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}

            {dayData.map(({ d, dateStr, isPast, isToday, isFuture, pct, notes, scheduledCount }) => {
              const bgColor = isFuture || scheduledCount === 0 ? 'transparent'
                : pct === null || pct === 0 ? 'color-mix(in oklch, var(--danger) 15%, transparent)'
                : pct < 0.5 ? 'color-mix(in oklch, var(--warning) 20%, transparent)'
                : pct < 1 ? 'color-mix(in oklch, var(--accent) 30%, transparent)'
                : 'color-mix(in oklch, var(--success) 25%, transparent)'

              return (
                <div
                  key={d}
                  className="aspect-square p-1 border-b border-r flex flex-col items-center justify-start gap-1 group relative"
                  style={{ borderColor: 'var(--border)', background: bgColor }}
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
                      className="text-[9px] tnum font-semibold"
                      style={{ color: pct === 0 ? 'var(--danger)' : pct < 0.5 ? 'var(--warning)' : 'var(--success)' }}
                    >
                      {Math.round(pct * 100)}%
                    </div>
                  )}

                  {/* Notes tooltip on hover */}
                  {notes.length > 0 && (
                    <div
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-[160px] rounded-xl p-2 text-[10.5px] z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'var(--panel-bg)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                    >
                      {notes.map((n, i) => (
                        <div key={i} className="mb-0.5">
                          <span className="font-medium">{n.habito}:</span> {n.nota}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend */}
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
        </div>
      </div>

      {/* Right panel */}
      <HabitosRightPanel selectedId={selectedId} onEdit={onEdit} />
    </div>
  )
}
