import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import MiniCalendar from './MiniCalendar'
import EventoModal from './EventoModal'
import TareaModal from './TareaModal'

const WEEKDAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const HOURS_SEMANA = Array.from({ length: 16 }, (_, i) => i + 7) // 7–22

function buildMonthCells(year, month) {
  const firstDay  = new Date(year, month, 1).getDay()
  const offset    = (firstDay + 6) % 7
  const daysCount = new Date(year, month + 1, 0).getDate()
  const prevCount = new Date(year, month, 0).getDate()
  const cells = []
  for (let i = offset - 1; i >= 0; i--) cells.push({ d: prevCount - i, prev: true })
  for (let d = 1; d <= daysCount; d++) cells.push({ d, cur: true })
  let nx = 1
  while (cells.length % 7 !== 0 || cells.length < 42) cells.push({ d: nx++, next: true })
  return cells
}

function buildWeekDays(year, month, weekOffset) {
  // Find first Monday of month
  const firstDay = new Date(year, month, 1)
  const dow = (firstDay.getDay() + 6) % 7
  const mondayOfFirst = new Date(year, month, 1 - dow)
  const monday = new Date(mondayOfFirst)
  monday.setDate(monday.getDate() + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

export default function MesTab() {
  const lang              = useStore(s => s.lang)
  const agendaEventos     = useStore(s => s.agendaEventos)
  const agendaTareas      = useStore(s => s.agendaTareas)
  const agendaCalendarios = useStore(s => s.agendaCalendarios)
  const updateAgendaCalendario = useStore(s => s.updateAgendaCalendario)

  const today = new Date()
  const [year, setYear]       = useState(today.getFullYear())
  const [month, setMonth]     = useState(today.getMonth())
  const [vista, setVista]     = useState('mes') // 'mes' | 'semana'
  const [weekOff, setWeekOff] = useState(0)

  const [newEvento, setNewEvento] = useState(null) // { fecha } | null
  const [newTarea, setNewTarea]   = useState(null)
  const [selected, setSelected]   = useState(null) // { type, item }

  const goMonth = (dir) => {
    let m = month + dir
    let y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0)  { m = 11; y-- }
    setMonth(m); setYear(y)
  }

  const goToday = () => {
    setYear(today.getFullYear()); setMonth(today.getMonth()); setWeekOff(0)
  }

  const monthName = new Date(year, month, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  // Build event/task map by ISO date
  const byDate = {}
  const activeCalIds = new Set(agendaCalendarios.filter(c => c.activo).map(c => c.id))
  agendaEventos.forEach(e => {
    if (!activeCalIds.has(e.calendario_id) && e.calendario_id) return
    const d = e.fecha_inicio?.slice(0, 10)
    if (!d) return
    if (!byDate[d]) byDate[d] = []
    byDate[d].push({ type: 'evento', color: e.calendario_color, item: e })
  })
  agendaTareas.forEach(t => {
    const d = t.fecha_opcional
    if (!d) return
    if (!byDate[d]) byDate[d] = []
    byDate[d].push({ type: 'tarea', color: t.lista_color, item: t })
  })

  // MiniCalendar event dots map
  const miniEventDays = {}
  Object.entries(byDate).forEach(([iso, entries]) => {
    const [y, m, day] = iso.split('-').map(Number)
    if (y === year && m - 1 === month) {
      miniEventDays[day] = entries.slice(0, 3).map(e => e.color)
    }
  })

  const cells = buildMonthCells(year, month)
  const weekDays = vista === 'semana' ? buildWeekDays(year, month, weekOff) : []

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left panel */}
      <aside className="w-[260px] shrink-0 flex flex-col h-full overflow-y-auto panel-scroll border-r p-4" style={{ borderColor: 'var(--border)' }}>
        <div className="panel-strong p-3 mb-4">
          <MiniCalendar
            year={year} month={month}
            onMonthChange={goMonth}
            eventDays={miniEventDays}
            onDayClick={d => {
              const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
              setNewEvento({ fecha: iso })
            }}
          />
        </div>

        <div className="flex items-center justify-between mb-2 px-1">
          <div className="label">{t(lang, 'agendaCalendarios')}</div>
          <button
            className="text-[10.5px] flex items-center gap-1 hover:text-[var(--text)]"
            style={{ color: 'var(--subtext)' }}
            onClick={() => setNewEvento({ tipo: 'calendario' })}
          >
            {t(lang, 'agendaNuevoCal')}
          </button>
        </div>

        <div className="flex flex-col gap-0.5">
          {agendaCalendarios.map(cal => (
            <div
              key={cal.id}
              className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--surface)]"
              onClick={() => updateAgendaCalendario(cal.id, { activo: !cal.activo })}
            >
              <div
                className="w-4 h-4 rounded grid place-items-center shrink-0"
                style={{
                  background: cal.activo ? cal.color : 'transparent',
                  border: `1.5px solid ${cal.activo ? cal.color : 'var(--border-2)'}`,
                }}
              >
                {cal.activo && <span style={{ color: 'white', fontSize: 9, fontWeight: 700 }}>✓</span>}
              </div>
              <span className="text-[12.5px] flex-1" style={{ color: cal.activo ? 'var(--text)' : 'var(--subtext)' }}>
                {cal.nombre}
              </span>
            </div>
          ))}
        </div>
      </aside>

      {/* Center: calendar */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <button className="icon-btn" onClick={() => vista === 'mes' ? goMonth(-1) : setWeekOff(w => w - 1)}>
              <ChevronLeft size={15} />
            </button>
            <div className="text-[16px] font-semibold serif italic min-w-[160px] text-center capitalize">{monthName}</div>
            <button className="icon-btn" onClick={() => vista === 'mes' ? goMonth(1) : setWeekOff(w => w + 1)}>
              <ChevronRight size={15} />
            </button>
            <button className="btn ml-1" onClick={goToday}>{t(lang, 'agendaHoy2')}</button>
          </div>
          <div
            className="flex items-center gap-1 p-1 rounded-xl border"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            {[['mes', t(lang, 'agendaMes')], ['semana', t(lang, 'agendaVerSemana')]].map(([v, label]) => (
              <button
                key={v}
                className="px-3 py-1.5 rounded-lg text-[12px] transition-all"
                style={{
                  background: vista === v ? 'var(--bg)' : 'transparent',
                  color: vista === v ? 'var(--text)' : 'var(--subtext)',
                  fontWeight: vista === v ? 600 : 500,
                  boxShadow: vista === v ? '0 1px 0 var(--border)' : 'none',
                }}
                onClick={() => setVista(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {vista === 'mes' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              {WEEKDAYS_ES.map((d, i) => (
                <div key={d} className="px-3 py-2 text-[10.5px] uppercase tracking-widest"
                  style={{ color: i >= 5 ? 'var(--mute)' : 'var(--subtext)', borderLeft: i ? '1px solid var(--border)' : 'none' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Month cells */}
            <div className="flex-1 overflow-y-auto panel-scroll grid grid-cols-7 grid-rows-6">
              {cells.map((cell, i) => {
                const row = Math.floor(i / 7), col = i % 7
                const dim = cell.prev || cell.next
                const isToday = cell.cur && year === today.getFullYear() && month === today.getMonth() && cell.d === today.getDate()
                const iso = cell.cur
                  ? `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.d).padStart(2, '0')}`
                  : null
                const entries = iso ? (byDate[iso] || []) : []
                return (
                  <div
                    key={i}
                    className="min-h-0 p-1.5 cursor-pointer overflow-hidden relative hover:bg-[var(--surface)]"
                    style={{
                      borderLeft: col ? '1px solid var(--border)' : 'none',
                      borderTop: row ? '1px solid var(--border)' : 'none',
                      background: isToday ? 'color-mix(in oklch, var(--accent) 5%, transparent)' : undefined,
                      opacity: dim ? 0.35 : 1,
                    }}
                    onClick={() => iso && setNewEvento({ fecha: iso })}
                  >
                    <div className="flex justify-end mb-0.5">
                      {isToday ? (
                        <div className="w-6 h-6 rounded-full grid place-items-center grad-bg text-white text-[11px] font-semibold tnum">
                          {cell.d}
                        </div>
                      ) : (
                        <span className="text-[11px] tnum px-1"
                          style={{ color: col >= 5 ? 'var(--mute)' : 'var(--text-2)' }}>
                          {cell.d}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {entries.slice(0, 3).map((entry, j) => (
                        <div
                          key={j}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] truncate"
                          style={{
                            background: `color-mix(in oklch, ${entry.color} 18%, transparent)`,
                            borderLeft: entry.type === 'evento'
                              ? `2px solid ${entry.color}`
                              : `2px dashed ${entry.color}`,
                          }}
                          onClick={e => { e.stopPropagation(); setSelected(entry) }}
                        >
                          {entry.type === 'tarea' && (
                            <span style={{ fontSize: 9, color: entry.color, flexShrink: 0 }}>☐</span>
                          )}
                          <span className="truncate font-medium" style={{ color: 'var(--text)' }}>
                            {entry.item.titulo}
                          </span>
                        </div>
                      ))}
                      {entries.length > 3 && (
                        <div className="text-[10px] px-1.5" style={{ color: 'var(--subtext)' }}>
                          +{entries.length - 3} más
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* Semana view */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="grid grid-cols-8 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div />
              {weekDays.map((d, i) => {
                const isTodayCol = d.toDateString() === today.toDateString()
                return (
                  <div key={i} className="px-2 py-2 text-center border-l" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-[10.5px] uppercase" style={{ color: i >= 5 ? 'var(--mute)' : 'var(--subtext)' }}>
                      {WEEKDAYS_ES[i].slice(0, 3)}
                    </div>
                    <div
                      className={`text-[14px] font-semibold tnum mx-auto w-7 h-7 rounded-full grid place-items-center mt-0.5 ${isTodayCol ? 'grad-bg text-white' : ''}`}
                      style={{ color: isTodayCol ? undefined : 'var(--text)' }}
                    >
                      {d.getDate()}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex-1 overflow-y-auto panel-scroll">
              <div className="relative" style={{ height: HOURS_SEMANA.length * 48 }}>
                <div className="grid grid-cols-8 absolute inset-0">
                  {/* Hour labels */}
                  <div>
                    {HOURS_SEMANA.map(h => (
                      <div key={h} style={{ height: 48 }} className="flex items-start justify-end pr-2 pt-1">
                        <span className="mono text-[10px]" style={{ color: 'var(--mute)' }}>
                          {String(h).padStart(2, '0')}:00
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Day columns */}
                  {weekDays.map((d, ci) => {
                    const iso = d.toISOString().slice(0, 10)
                    const dayEntries = byDate[iso] || []
                    return (
                      <div key={ci} className="relative border-l" style={{ borderColor: 'var(--border)' }}>
                        {HOURS_SEMANA.map(h => (
                          <div key={h} style={{ height: 48 }} className="border-t" style2={{ borderColor: 'var(--border)' }} />
                        ))}
                        {dayEntries.filter(e => e.type === 'evento' && !e.item.todo_el_dia).map((entry, j) => {
                          const startMin = parseInt(entry.item.fecha_inicio?.slice(11, 13) || 0, 10) * 60 +
                            parseInt(entry.item.fecha_inicio?.slice(14, 16) || 0, 10)
                          const endMin   = entry.item.fecha_fin
                            ? parseInt(entry.item.fecha_fin.slice(11, 13)) * 60 + parseInt(entry.item.fecha_fin.slice(14, 16))
                            : startMin + 60
                          const top    = ((startMin - 7 * 60) / 60) * 48
                          const height = Math.max(((endMin - startMin) / 60) * 48, 16)
                          return (
                            <div key={j} className="absolute left-0.5 right-0.5 rounded px-1 overflow-hidden"
                              style={{ top, height, background: `color-mix(in oklch, ${entry.color} 25%, transparent)`, borderLeft: `2px solid ${entry.color}` }}>
                              <span className="text-[10px] font-medium truncate block" style={{ color: 'var(--text)' }}>
                                {entry.item.titulo}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right panel */}
      <aside className="hidden xl:flex flex-col w-[260px] shrink-0 h-full overflow-y-auto panel-scroll border-l p-4" style={{ borderColor: 'var(--border)' }}>
        {selected ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="label">{selected.type === 'evento' ? 'Evento' : 'Tarea'}</div>
              <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
            <div className="panel-strong p-3 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: selected.color }} />
                <span className="text-[13px] font-semibold">{selected.item.titulo}</span>
              </div>
              {selected.item.descripcion && (
                <p className="text-[12px] mb-2" style={{ color: 'var(--subtext)' }}>{selected.item.descripcion}</p>
              )}
              {selected.type === 'evento' && selected.item.fecha_inicio && (
                <div className="mono text-[11px]" style={{ color: 'var(--subtext)' }}>
                  {selected.item.fecha_inicio.slice(0, 16).replace('T', ' · ')}
                  {selected.item.fecha_fin && ` → ${selected.item.fecha_fin.slice(11, 16)}`}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="label mb-3">Próximos eventos</div>
            {agendaEventos.slice(0, 5).map(e => (
              <div key={e.id} className="flex gap-2.5 px-2 py-2 rounded-lg hover:bg-[var(--surface)] cursor-pointer mb-1"
                onClick={() => setSelected({ type: 'evento', color: e.calendario_color, item: e })}>
                <span className="w-1 rounded-full shrink-0 self-stretch" style={{ background: e.calendario_color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate">{e.titulo}</div>
                  <div className="text-[10.5px] mt-0.5 mono" style={{ color: 'var(--subtext)' }}>
                    {e.fecha_inicio?.slice(0, 10)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {newEvento && newEvento.tipo !== 'calendario' && (
        <EventoModal
          defaultFecha={newEvento.fecha}
          onClose={() => setNewEvento(null)}
        />
      )}
    </div>
  )
}
