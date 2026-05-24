import { useMemo, useRef } from 'react'
import { HOURS, HOUR_HEIGHT, timeToMinutes, minutesToTop } from './agendaUtils'

/**
 * Reusable hour grid (6–23 h by default).
 *
 * Props:
 *   hours          number[]   — array of integers, e.g. [6..23]
 *   hourHeight     number     — px per hour, default HOUR_HEIGHT (56)
 *   nowMinutes     number|null— current time as minutes since midnight, draws "now" line
 *   blocks         array      — [{ id, titulo, hora_bloque, duracion_estimada, completada, color?, onClick }]
 *   events         array      — [{ id, titulo, fecha_inicio, fecha_fin, todo_el_dia, color, onClick }]
 *   onCellClick    fn(hour)   — called when an empty cell is clicked; receives integer hour
 */
export default function HourGrid({
  hours       = HOURS,
  hourHeight  = HOUR_HEIGHT,
  nowMinutes  = null,
  blocks      = [],
  events      = [],
  onCellClick,
}) {
  const gridRef = useRef(null)

  const totalHeight = hours.length * hourHeight
  const minHour = hours[0]

  // Now-line position
  const nowTop = nowMinutes !== null
    ? ((nowMinutes - minHour * 60) / 60) * hourHeight
    : null

  // Layout timed events (simple single-column for reusability)
  const timedEvents = useMemo(() =>
    events.filter(e => !e.todo_el_dia && e.fecha_inicio), [events])

  return (
    <div
      ref={gridRef}
      className="relative select-none"
      style={{ height: totalHeight }}
    >
      {/* Hour rows */}
      {hours.map(h => (
        <div
          key={h}
          className="absolute w-full border-t"
          style={{
            top: (h - minHour) * hourHeight,
            height: hourHeight,
            borderColor: 'var(--border)',
          }}
          onClick={() => onCellClick?.(h)}
        >
          <span
            className="absolute left-1 top-1 mono text-[9.5px]"
            style={{ color: 'var(--mute)' }}
          >
            {String(h).padStart(2, '0')}:00
          </span>
        </div>
      ))}

      {/* Task blocks */}
      {blocks.map(b => {
        if (!b.hora_bloque) return null
        const [bh, bm] = b.hora_bloque.split(':').map(Number)
        const topMin  = (bh * 60 + bm) - minHour * 60
        const top     = (topMin / 60) * hourHeight
        const height  = Math.max(24, ((b.duracion_estimada || 30) / 60) * hourHeight)
        return (
          <div
            key={`blk-${b.id}`}
            className="absolute left-14 right-1 rounded-lg px-2 py-1 cursor-pointer"
            style={{
              top, height,
              background: `color-mix(in oklch, ${b.color || 'var(--accent)'} 18%, transparent)`,
              borderLeft: `2.5px solid ${b.color || 'var(--accent)'}`,
              opacity: b.completada ? 0.45 : 1,
            }}
            onClick={() => b.onClick?.()}
          >
            <span className="text-[11px] font-medium truncate block" style={{ color: 'var(--text)' }}>
              {b.titulo}
            </span>
          </div>
        )
      })}

      {/* Timed events */}
      {timedEvents.map(e => {
        const start = timeToMinutes(e.fecha_inicio?.slice(11, 16) || '00:00')
        const end   = e.fecha_fin ? timeToMinutes(e.fecha_fin.slice(11, 16)) : start + 60
        const top    = minutesToTop(start, minHour, hourHeight)
        const height = Math.max(20, ((end - start) / 60) * hourHeight)
        return (
          <div
            key={`evt-${e.id}`}
            className="absolute left-14 right-1 rounded-lg px-2 py-1 cursor-pointer"
            style={{
              top, height,
              background: `color-mix(in oklch, ${e.color || 'var(--accent)'} 22%, transparent)`,
              borderLeft: `2.5px solid ${e.color || 'var(--accent)'}`,
            }}
            onClick={() => e.onClick?.()}
          >
            <span className="text-[11px] font-medium truncate block" style={{ color: 'var(--text)' }}>
              {e.titulo}
            </span>
          </div>
        )
      })}

      {/* Now line */}
      {nowTop !== null && nowTop >= 0 && nowTop <= totalHeight && (
        <div
          className="absolute left-0 right-0 pointer-events-none flex items-center"
          style={{ top: nowTop, zIndex: 10 }}
        >
          <div className="w-2 h-2 rounded-full now-dot" style={{ background: 'var(--accent)', marginLeft: 48 }} />
          <div className="flex-1 h-px" style={{ background: 'var(--accent)', opacity: 0.6 }} />
        </div>
      )}
    </div>
  )
}
