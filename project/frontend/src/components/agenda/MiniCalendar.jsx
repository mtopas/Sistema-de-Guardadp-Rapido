import { ChevronLeft, ChevronRight } from 'lucide-react'

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function buildCells(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  // Convert Sun=0 to Mon=0 offset
  const offset = (firstDay + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: offset }, () => null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export default function MiniCalendar({ year, month, onMonthChange, eventDays = {}, selectedDay, onDayClick }) {
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const cells = buildCells(year, month)

  const monthName = new Date(year, month, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="text-[13px] font-semibold serif italic capitalize">{monthName}</div>
        <div className="flex items-center gap-1">
          <button
            className="icon-btn"
            style={{ width: 22, height: 22 }}
            onClick={() => onMonthChange?.(-1)}
          >
            <ChevronLeft size={12} />
          </button>
          <button
            className="icon-btn"
            style={{ width: 22, height: 22 }}
            onClick={() => onMonthChange?.(1)}
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {DIAS.map((d, i) => (
          <div key={i} className="text-[10px] uppercase tracking-widest pb-1" style={{ color: 'var(--mute)' }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const isToday = isCurrentMonth && d === today.getDate()
          const isSelected = selectedDay === d
          const hasEvents = !!eventDays[d]
          const evColors = hasEvents ? (eventDays[d] || []).slice(0, 3) : []
          const isWeekend = i % 7 >= 5

          return (
            <div
              key={i}
              className="relative flex flex-col items-center pt-0.5 pb-1 cursor-pointer"
              onClick={() => onDayClick?.(d)}
            >
              {isToday ? (
                <div className="w-6 h-6 rounded-full grid place-items-center grad-bg text-white text-[10.5px] font-semibold tnum">
                  {d}
                </div>
              ) : (
                <div
                  className="w-6 h-6 rounded-full grid place-items-center text-[10.5px] tnum transition-colors"
                  style={{
                    color: isWeekend ? 'var(--mute)' : 'var(--text-2)',
                    background: isSelected ? 'var(--surface)' : 'transparent',
                    outline: isSelected ? '1px solid var(--accent)' : 'none',
                  }}
                >
                  {d}
                </div>
              )}
              {hasEvents && (
                <div className="flex gap-0.5 mt-0.5">
                  {evColors.map((c, j) => (
                    <span key={j} className="w-1 h-1 rounded-full" style={{ background: c, opacity: 0.9 }} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
