import { useState, useCallback } from 'react'
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

const COL_NAME = 176  // px — sticky left column
const COL_PCT  = 72   // px — sticky right column
const COL_DAY  = 34   // px — each day cell

export default function HoyTab({ selectedId, setSelectedId, onEdit }) {
  const habitos          = useStore(s => s.habitos)
  const habitosRegistros = useStore(s => s.habitosRegistros)

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const [displayDate, setDisplayDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [completar, setCompletarState] = useState(null)

  const year        = displayDate.getFullYear()
  const month       = displayDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr    = toISODate(today)

  // Minimum width so sticky columns always have room
  const gridMinWidth = COL_NAME + daysInMonth * COL_DAY + COL_PCT

  const registrosMap = buildRegistrosMap(habitosRegistros)
  const activos      = habitos.filter(h => h.activo)

  function prevMonth() { setDisplayDate(new Date(year, month - 1, 1)) }
  function nextMonth() { setDisplayDate(new Date(year, month + 1, 1)) }
  function goToday()   { setDisplayDate(new Date(today.getFullYear(), today.getMonth(), 1)) }

  const handleCellClick = useCallback((e, habitoId, dateStr) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const existingReg = registrosMap[`${habitoId}-${dateStr}`] || null
    setCompletarState({ habitoId, fecha: dateStr, existingReg, anchorRect: rect })
  }, [registrosMap])

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Center — grilla */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4">
        <div className="panel-strong overflow-hidden">

          {/* Month navigation — never scrolls */}
          <div
            className="flex items-center justify-between px-5 py-3.5 border-b shrink-0"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-3">
              <button className="icon-btn" onClick={prevMonth}><ChevronLeft size={15} /></button>
              <div className="text-[15px] font-semibold serif italic min-w-[140px] text-center">
                {MONTH_NAMES[month]} {year}
              </div>
              <button className="icon-btn" onClick={nextMonth}><ChevronRight size={15} /></button>
            </div>
            <button className="btn" onClick={goToday}>Hoy</button>
          </div>

          {activos.length === 0 ? (
            <div className="py-12 text-center text-[13px]" style={{ color: 'var(--subtext)' }}>
              Creá tu primer hábito con el botón + del panel izquierdo
            </div>
          ) : (
            /* ── SINGLE scroll container for the whole grid ── */
            <div className="overflow-x-auto">
              <div style={{ minWidth: gridMinWidth }}>

                {/* Header row */}
                <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
                  <div
                    className="sticky left-0 z-10 shrink-0 px-4 py-2 text-[10px] uppercase tracking-widest"
                    style={{
                      width: COL_NAME,
                      background: 'var(--panel-bg)',
                      color: 'var(--subtext)',
                      borderRight: '1px solid var(--border)',
                    }}
                  >
                    Hábito
                  </div>

                  {/* Day headers — plain flex, no individual scroll */}
                  <div className="flex flex-1">
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                      const date    = new Date(year, month, d)
                      const dateStr = toISODate(date)
                      const isToday = dateStr === todayStr
                      const dow     = date.getDay()
                      const isWeekend = dow === 0 || dow === 6
                      return (
                        <div
                          key={d}
                          className="flex flex-col items-center py-2 gap-0.5 shrink-0"
                          style={{ width: COL_DAY }}
                        >
                          <span className="text-[9px] uppercase" style={{ color: 'var(--mute)' }}>
                            {DAY_INITIALS[dow]}
                          </span>
                          {isToday ? (
                            <div
                              className="w-6 h-6 rounded-full grid place-items-center text-white text-[11px] font-semibold tnum"
                              style={{ background: 'var(--accent)' }}
                            >
                              {d}
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
                    className="sticky right-0 z-10 shrink-0 px-3 py-2 text-[10px] uppercase tracking-widest text-right"
                    style={{
                      width: COL_PCT,
                      background: 'var(--panel-bg)',
                      color: 'var(--subtext)',
                      borderLeft: '1px solid var(--border)',
                    }}
                  >
                    Mes
                  </div>
                </div>

                {/* Habit rows */}
                {activos.map(h => {
                  const isSelected = h.id === selectedId
                  const pct        = calcMonthPct(h, registrosMap, year, month)
                  const pctColor   = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)'
                  const nameBg     = isSelected
                    ? `color-mix(in oklch, ${h.color} 6%, var(--panel-bg))`
                    : 'var(--panel-bg)'

                  return (
                    <div
                      key={h.id}
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
                        className="sticky left-0 z-10 shrink-0 flex items-center gap-2.5 px-4 py-2.5 cursor-pointer"
                        style={{
                          width: COL_NAME,
                          background: nameBg,
                          borderRight: '1px solid var(--border)',
                        }}
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

                      {/* Day cells — plain flex, no overflow */}
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

                          let cell
                          if (!scheduled) {
                            cell = <span className="w-3 h-px" style={{ background: 'var(--border)' }} />
                          } else if (isFuture) {
                            cell = (
                              <div
                                className="w-[18px] h-[18px] rounded-md border opacity-25"
                                style={{ borderColor: 'var(--border)' }}
                              />
                            )
                          } else if (isDone) {
                            cell = (
                              <div
                                className="w-[18px] h-[18px] rounded-md grid place-items-center"
                                style={{ background: h.color }}
                                title={reg.nota || ''}
                              >
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                            )
                          } else if (isPartial) {
                            cell = (
                              <div
                                className="w-[18px] h-[18px] rounded-md grid place-items-center"
                                style={{ background: 'var(--warning)', opacity: 0.85 }}
                                title={reg.nota || ''}
                              >
                                <div className="w-2 h-0.5 rounded-full bg-white" />
                              </div>
                            )
                          } else {
                            cell = (
                              <div
                                className="w-[18px] h-[18px] rounded-md border transition-colors duration-100"
                                style={{ borderColor: isToday ? 'var(--accent)' : 'var(--border)' }}
                              />
                            )
                          }

                          return (
                            <div
                              key={d}
                              className="shrink-0 grid place-items-center"
                              style={{
                                width: COL_DAY,
                                height: 40,
                                background: isToday
                                  ? 'color-mix(in oklch, var(--accent) 6%, transparent)'
                                  : undefined,
                                cursor: scheduled && !isFuture ? 'pointer' : 'default',
                              }}
                              onClick={scheduled && !isFuture
                                ? e => handleCellClick(e, h.id, dateStr)
                                : undefined
                              }
                            >
                              {cell}
                            </div>
                          )
                        })}
                      </div>

                      {/* Sticky % cell */}
                      <div
                        className="sticky right-0 z-10 shrink-0 flex items-center justify-end px-3 py-2.5"
                        style={{
                          width: COL_PCT,
                          background: nameBg,
                          borderLeft: '1px solid var(--border)',
                        }}
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
          onClose={() => setCompletarState(null)}
        />
      )}
    </div>
  )
}
