import { useState, useEffect } from 'react'
import { Clock, CheckCircle2, Circle, Plus, X, GraduationCap } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import TareaModal from './TareaModal'
import { buildRegistrosMap, isScheduled, toISODate, todayStatus } from '../habitos/habitosUtils'

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // 6:00 – 23:00
const HOUR_HEIGHT = 56 // px per hour

function timeToMinutes(timeStr) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + (m || 0)
}

function minutesToTop(minutes) {
  const startMinutes = 6 * 60
  return ((minutes - startMinutes) / 60) * HOUR_HEIGHT
}

export default function HoyTab() {
  const lang                  = useStore(s => s.lang)
  const agendaTareas          = useStore(s => s.agendaTareas)
  const agendaEventos         = useStore(s => s.agendaEventos)
  const agendaHorarioFacultad = useStore(s => s.agendaHorarioFacultad)
  const updateAgendaTarea     = useStore(s => s.updateAgendaTarea)
  const habitos               = useStore(s => s.habitos)
  const habitosRegistros      = useStore(s => s.habitosRegistros)
  const upsertHabitoRegistro  = useStore(s => s.upsertHabitoRegistro)

  const [schedulingId, setSchedulingId] = useState(null) // tarea_id being scheduled
  const [horaInput, setHoraInput]       = useState('')
  const [newTareaOpen, setNewTareaOpen] = useState(false)
  const [nowLine, setNowLine]           = useState(0)

  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)
  const todayDow = (today.getDay() + 6) % 7 // Mon=0

  // Live "now" indicator
  useEffect(() => {
    const update = () => {
      const now = today.getHours() * 60 + today.getMinutes()
      setNowLine(minutesToTop(now))
    }
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  }, [])

  // Tareas próximas 15 días, pendientes
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + 15)
  const cutoffISO = cutoff.toISOString().slice(0, 10)
  const pending = agendaTareas.filter(t =>
    !t.completada && (!t.fecha_opcional || t.fecha_opcional <= cutoffISO)
  ).sort((a, b) => {
    if (!a.fecha_opcional && !b.fecha_opcional) return 0
    if (!a.fecha_opcional) return 1
    if (!b.fecha_opcional) return -1
    return a.fecha_opcional.localeCompare(b.fecha_opcional)
  })

  // Eventos de hoy
  const todayEventos = agendaEventos.filter(e => e.fecha_inicio?.slice(0, 10) === todayISO)

  // Tareas con bloque asignado hoy
  const bloqueadas = agendaTareas.filter(t => t.fecha_opcional === todayISO && t.hora_bloque)

  // Facultad hoy
  const facultadHoy = agendaHorarioFacultad.filter(h => h.dia_semana === todayDow)

  // Hábitos de hoy
  const registrosMap     = buildRegistrosMap(habitosRegistros)
  const habitosHoy       = habitos.filter(h => h.activo && isScheduled(h, today) && !h.hora)
  const habitosConHora   = habitos.filter(h => h.activo && isScheduled(h, today) && !!h.hora)

  const handleHabitoCheck = (habito) => {
    const reg = registrosMap[`${habito.id}-${todayISO}`]
    if (reg && reg.valor > 0) {
      // toggle off
      upsertHabitoRegistro(habito.id, todayISO, 0, null)
    } else {
      upsertHabitoRegistro(habito.id, todayISO, 1.0, null)
    }
  }

  const handleToggle = (tarea) => {
    updateAgendaTarea(tarea.id, { completada: !tarea.completada })
  }

  const handleAgendar = async (id) => {
    if (!horaInput) return
    await updateAgendaTarea(id, {
      hora_bloque: horaInput,
      fecha_opcional: todayISO,
    })
    setSchedulingId(null)
    setHoraInput('')
  }

  // Clean expired blocks
  useEffect(() => {
    const now = today.getHours() * 60 + today.getMinutes()
    bloqueadas.forEach(t => {
      const blockMin = timeToMinutes(t.hora_bloque)
      if (blockMin !== null && blockMin < now && !t.completada) {
        updateAgendaTarea(t.id, { hora_bloque: null })
      }
    })
  }, [])

  const dayLabel = today.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left panel: pending tasks */}
      <aside
        className="w-[260px] shrink-0 flex flex-col h-full overflow-y-auto panel-scroll border-r"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="label">{t(lang, 'agendaTareasPendientes')}</div>
            <button
              className="icon-btn"
              style={{ width: 24, height: 24 }}
              onClick={() => setNewTareaOpen(true)}
              title={t(lang, 'agendaTareaNueva')}
            >
              <Plus size={13} />
            </button>
          </div>

          {pending.length === 0 ? (
            <div className="text-[12px] italic px-1" style={{ color: 'var(--subtext)' }}>
              {t(lang, 'agendaSinTareas')}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {pending.map(tarea => (
                <div key={tarea.id} className="group panel-strong rounded-lg px-2.5 py-2">
                  <div className="flex items-start gap-2">
                    <button
                      className="mt-0.5 shrink-0 transition-colors"
                      style={{ color: tarea.completada ? 'var(--accent)' : 'var(--mute)' }}
                      onClick={() => handleToggle(tarea)}
                    >
                      {tarea.completada
                        ? <CheckCircle2 size={14} />
                        : <Circle size={14} />
                      }
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: tarea.lista_color }}
                        />
                        <span className="text-[12px] font-medium truncate" style={{ color: 'var(--text)' }}>
                          {tarea.titulo}
                        </span>
                      </div>
                      {tarea.fecha_opcional && (
                        <div className="text-[10.5px] mono" style={{ color: 'var(--subtext)' }}>
                          {new Date(tarea.fecha_opcional + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                          {tarea.hora_opcional && ` · ${tarea.hora_opcional}`}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Schedule button */}
                  {schedulingId === tarea.id ? (
                    <div className="flex items-center gap-1.5 mt-2">
                      <input
                        type="time"
                        value={horaInput}
                        onChange={e => setHoraInput(e.target.value)}
                        className="flex-1 px-2 py-1 rounded-lg border text-[11px] outline-none"
                        style={{
                          background: 'var(--bg)', borderColor: 'var(--accent)',
                          color: 'var(--text)', fontFamily: 'var(--font-mono)',
                        }}
                        autoFocus
                      />
                      <button
                        className="px-2 py-1 rounded-lg text-[11px] font-medium"
                        style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                        onClick={() => handleAgendar(tarea.id)}
                      >
                        OK
                      </button>
                      <button
                        className="icon-btn"
                        style={{ width: 22, height: 22 }}
                        onClick={() => setSchedulingId(null)}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="mt-1.5 flex items-center gap-1 text-[10.5px] opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--accent)' }}
                      onClick={() => { setSchedulingId(tarea.id); setHoraInput('') }}
                    >
                      <Clock size={10} />
                      {t(lang, 'agendaAgendar')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hábitos de hoy (sin hora) */}
        {habitosHoy.length > 0 && (
          <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="label mt-3 mb-2">{t(lang, 'habitosDeHoy')}</div>
            <div className="flex flex-col gap-1">
              {habitosHoy.map(h => {
                const reg   = registrosMap[`${h.id}-${todayISO}`]
                const done  = reg && reg.valor > 0
                const partial = reg && reg.valor > 0 && reg.valor < 1
                return (
                  <div key={h.id} className="flex items-center gap-2.5 px-1 py-1">
                    <button
                      onClick={() => handleHabitoCheck(h)}
                      className="shrink-0 transition-colors w-4 h-4 rounded-md border grid place-items-center"
                      style={{
                        background: done ? h.color : 'transparent',
                        borderColor: done ? h.color : 'var(--border)',
                      }}
                    >
                      {done && !partial && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                      {partial && <div className="w-1.5 h-0.5 rounded-full bg-white" />}
                    </button>
                    <span
                      className="text-[12px] flex-1 truncate"
                      style={{ color: done ? 'var(--subtext)' : 'var(--text)', textDecoration: done && !partial ? 'line-through' : 'none' }}
                    >
                      {h.nombre}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: h.color }} />
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </aside>

      {/* Center: hour grid */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="label capitalize">{t(lang, 'agendaTuDia')}</div>
          <div className="text-[18px] serif italic mt-0.5 capitalize">{dayLabel}</div>
        </div>

        {/* Scrollable hour grid */}
        <div className="flex-1 overflow-y-auto panel-scroll px-5 pt-3 pb-8 relative">
          {/* Grid */}
          <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute left-0 right-0 flex items-start gap-3"
                style={{ top: (h - 6) * HOUR_HEIGHT }}
              >
                <span
                  className="mono text-[10.5px] w-10 shrink-0 text-right pt-0.5"
                  style={{ color: 'var(--mute)' }}
                >
                  {String(h).padStart(2, '0')}:00
                </span>
                <div
                  className="flex-1 border-t"
                  style={{ borderColor: 'var(--border)', marginTop: 8 }}
                />
              </div>
            ))}

            {/* Facultad layer (background) */}
            {facultadHoy.map(hf => {
              const startMin = timeToMinutes(hf.hora_inicio)
              const endMin   = timeToMinutes(hf.hora_fin)
              if (startMin === null || endMin === null) return null
              const top    = minutesToTop(startMin)
              const height = ((endMin - startMin) / 60) * HOUR_HEIGHT
              return (
                <div
                  key={hf.id}
                  className="absolute left-14 right-0 rounded-md flex items-start px-2 py-1 overflow-hidden"
                  style={{
                    top, height,
                    background: 'color-mix(in oklch, #059669 10%, transparent)',
                    borderLeft: '2px solid #059669',
                    opacity: 0.55,
                  }}
                >
                  <div className="flex items-center gap-1">
                    <GraduationCap size={10} style={{ color: '#059669' }} />
                    <span className="text-[10px] truncate font-medium" style={{ color: '#059669' }}>
                      {hf.materia}
                    </span>
                  </div>
                </div>
              )
            })}

            {/* Event blocks */}
            {todayEventos.filter(e => !e.todo_el_dia && e.fecha_inicio).map(evento => {
              const startMin = timeToMinutes(evento.fecha_inicio.slice(11, 16))
              const endMin   = evento.fecha_fin
                ? timeToMinutes(evento.fecha_fin.slice(11, 16))
                : startMin + 60
              if (startMin === null) return null
              const top    = minutesToTop(startMin)
              const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 20)
              return (
                <div
                  key={evento.id}
                  className="absolute left-14 right-0 rounded-md px-2 py-1 overflow-hidden"
                  style={{
                    top, height,
                    background: `color-mix(in oklch, ${evento.calendario_color} 22%, transparent)`,
                    borderLeft: `2.5px solid ${evento.calendario_color}`,
                  }}
                >
                  <div className="mono text-[9.5px] opacity-80" style={{ color: evento.calendario_color }}>
                    {evento.fecha_inicio.slice(11, 16)}
                  </div>
                  <div className="text-[11.5px] font-medium truncate" style={{ color: 'var(--text)' }}>
                    {evento.titulo}
                  </div>
                </div>
              )
            })}

            {/* Task blocks */}
            {bloqueadas.map(tarea => {
              const startMin = timeToMinutes(tarea.hora_bloque)
              if (startMin === null) return null
              const dur    = tarea.duracion_estimada || 30
              const top    = minutesToTop(startMin)
              const height = Math.max((dur / 60) * HOUR_HEIGHT, 24)
              return (
                <div
                  key={tarea.id}
                  className="absolute left-14 right-8 rounded-md px-2 py-1 overflow-hidden flex items-center gap-1.5"
                  style={{
                    top, height,
                    background: `color-mix(in oklch, ${tarea.lista_color} 15%, var(--surface))`,
                    border: `1.5px dashed ${tarea.lista_color}`,
                  }}
                >
                  <button
                    onClick={() => updateAgendaTarea(tarea.id, { completada: true, hora_bloque: null })}
                    style={{ color: tarea.lista_color, flexShrink: 0 }}
                  >
                    <Circle size={12} />
                  </button>
                  <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text)' }}>
                    {tarea.titulo}
                  </span>
                  <button
                    className="ml-auto shrink-0"
                    style={{ color: 'var(--mute)' }}
                    onClick={() => updateAgendaTarea(tarea.id, { hora_bloque: null })}
                  >
                    <X size={10} />
                  </button>
                </div>
              )
            })}

            {/* Hábitos con hora */}
            {habitosConHora.map(h => {
              const startMin = timeToMinutes(h.hora)
              if (startMin === null) return null
              const top    = minutesToTop(startMin)
              const height = Math.max(HOUR_HEIGHT * 0.75, 28)
              const reg    = registrosMap[`${h.id}-${todayISO}`]
              const done   = reg && reg.valor > 0
              return (
                <div
                  key={h.id}
                  className="absolute left-14 right-0 rounded-md px-2 py-1 flex items-center gap-1.5 cursor-pointer"
                  style={{
                    top, height,
                    background: `color-mix(in oklch, ${h.color} ${done ? 25 : 15}%, var(--surface))`,
                    border: `1.5px solid color-mix(in oklch, ${h.color} 50%, transparent)`,
                    opacity: done ? 0.7 : 1,
                  }}
                  onClick={() => handleHabitoCheck(h)}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: h.color }} />
                  <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text)' }}>{h.nombre}</span>
                  {done && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none" className="ml-auto shrink-0">
                      <path d="M1 3.5L3.5 6L8 1" stroke={h.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              )
            })}

            {/* Now indicator */}
            {nowLine > 0 && nowLine < HOURS.length * HOUR_HEIGHT && (
              <div
                className="absolute left-12 right-0 flex items-center gap-1 pointer-events-none"
                style={{ top: nowLine }}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                <div className="flex-1 border-t-2" style={{ borderColor: 'var(--accent)' }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right panel: today's cards */}
      <aside
        className="hidden xl:flex flex-col w-[260px] shrink-0 h-full overflow-y-auto panel-scroll border-l"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="p-4">
          <div className="label mb-3">{t(lang, 'agendaHoy2')}</div>
          {todayEventos.length === 0 && bloqueadas.length === 0 ? (
            <div className="text-[12px] italic" style={{ color: 'var(--subtext)' }}>
              {t(lang, 'agendaSinEventos')}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {todayEventos.map(e => (
                <div
                  key={e.id}
                  className="rounded-xl border px-3 py-2.5"
                  style={{
                    borderColor: 'var(--border)',
                    background: `linear-gradient(140deg, color-mix(in oklch, ${e.calendario_color} 10%, transparent), transparent 80%)`,
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.calendario_color }} />
                    <span className="mono text-[10.5px]" style={{ color: 'var(--subtext)' }}>
                      {e.todo_el_dia ? 'todo el día' : e.fecha_inicio?.slice(11, 16)}
                    </span>
                  </div>
                  <div className="text-[12.5px] font-medium truncate">{e.titulo}</div>
                </div>
              ))}
              {bloqueadas.map(t => (
                <div
                  key={t.id}
                  className="rounded-xl border px-3 py-2.5"
                  style={{
                    borderColor: `color-mix(in oklch, ${t.lista_color} 40%, var(--border))`,
                    background: `color-mix(in oklch, ${t.lista_color} 6%, var(--surface))`,
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Circle size={10} style={{ color: t.lista_color }} />
                    <span className="mono text-[10.5px]" style={{ color: 'var(--subtext)' }}>{t.hora_bloque}</span>
                  </div>
                  <div className="text-[12.5px] font-medium truncate">{t.titulo}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {newTareaOpen && <TareaModal onClose={() => setNewTareaOpen(false)} defaultFecha={todayISO} />}
    </div>
  )
}
