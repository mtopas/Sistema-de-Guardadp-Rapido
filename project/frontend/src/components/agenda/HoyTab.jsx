import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, CheckCircle2, Circle, Plus, X, GraduationCap, ChevronLeft, ChevronRight, Edit2, DollarSign } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'

const FIN_KEYWORDS = /pagar|cuota|vencimiento|cobro|débito|debito|transferir|tarjeta|impuesto|factura|alquiler|servicio|préstamo|prestamo/i
import TareaModal from './TareaModal'
import EventoModal from './EventoModal'
import { buildRegistrosMap, isScheduled } from '../habitos/habitosUtils'
import { toLocalISODate, HOURS, HOUR_HEIGHT, timeToMinutes, minutesToTop } from './agendaUtils'

// Greedy column layout for timed events to avoid visual overlap
function layoutTimedEvents(events) {
  if (!events.length) return []
  const evts = events.map(e => {
    const startMin = timeToMinutes(e.fecha_inicio.slice(11, 16))
    const endMin   = e.fecha_fin ? timeToMinutes(e.fecha_fin.slice(11, 16)) : startMin + 60
    return { ...e, _startMin: startMin, _endMin: Math.max(endMin, startMin + 20) }
  }).sort((a, b) => a._startMin - b._startMin)

  const colEnds = []
  evts.forEach(evt => {
    let c = colEnds.findIndex(end => end <= evt._startMin)
    if (c === -1) c = colEnds.length
    colEnds[c] = evt._endMin
    evt._col = c
  })
  evts.forEach(evt => {
    let maxCol = evt._col
    evts.forEach(other => {
      if (other !== evt && other._startMin < evt._endMin && other._endMin > evt._startMin) {
        maxCol = Math.max(maxCol, other._col)
      }
    })
    evt._totalCols = maxCol + 1
  })
  return evts
}

function tareaUrgencia(tarea, todayISO) {
  if (!tarea.fecha_opcional) return 'normal'
  if (tarea.fecha_opcional < todayISO) return 'overdue'
  if (tarea.fecha_opcional === todayISO) return 'today'
  return 'normal'
}

const URGENCIA_COLOR = { overdue: '#ef4444', today: '#d97706', normal: 'var(--subtext)' }

export default function HoyTab() {
  const navigate              = useNavigate()
  const lang                  = useStore(s => s.lang)
  const agendaTareas          = useStore(s => s.agendaTareas)
  const agendaEventos         = useStore(s => s.agendaEventos)
  const agendaHorarioFacultad = useStore(s => s.agendaHorarioFacultad)
  const addAgendaTarea        = useStore(s => s.addAgendaTarea)
  const updateAgendaTarea     = useStore(s => s.updateAgendaTarea)
  const fetchAgendaEventos    = useStore(s => s.fetchAgendaEventos)
  const habitos               = useStore(s => s.habitos)
  const habitosRegistros      = useStore(s => s.habitosRegistros)
  const upsertHabitoRegistro  = useStore(s => s.upsertHabitoRegistro)
  const deleteHabitoRegistro  = useStore(s => s.deleteHabitoRegistro)
  const showToast             = useStore(s => s.showToast)

  const [viewDate, setViewDate]               = useState(new Date())
  const [schedulingId, setSchedulingId]       = useState(null)
  const [horaInput, setHoraInput]             = useState('')
  const [newTareaOpen, setNewTareaOpen]       = useState(false)
  const [newEventoHora, setNewEventoHora]     = useState(null)
  const [quickEvento, setQuickEvento]         = useState(null) // { hora, titulo, top }
  const [nowLine, setNowLine]                 = useState(0)
  const [selectedItem, setSelectedItem]       = useState(null) // { type, item }
  const [editEvento, setEditEvento]           = useState(null)
  const [editTarea, setEditTarea]             = useState(null)
  const [quickTareaTitulo, setQuickTareaTitulo] = useState('')
  const [drawerOpen, setDrawerOpen]           = useState(false)
  const [completingIds, setCompletingIds]     = useState(new Set())
  const gridRef                               = useRef(null)
  const lastFetchedMonth                      = useRef(null)

  const todayActual = new Date()
  const viewISO     = toLocalISODate(viewDate)
  const todayISO    = toLocalISODate(todayActual)
  const isToday     = viewISO === todayISO
  const todayDow    = (viewDate.getDay() + 6) % 7

  // Task 2: refetch when navigating outside the initially-loaded month range
  useEffect(() => {
    const viewMonth = viewISO.slice(0, 7)
    if (lastFetchedMonth.current !== viewMonth) {
      lastFetchedMonth.current = viewMonth
      const desde = toLocalISODate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
      const hasta  = toLocalISODate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 2, 0))
      fetchAgendaEventos(desde, hasta)
    }
  }, [viewISO])

  // Live "now" indicator
  useEffect(() => {
    const update = () => {
      const now = new Date()
      setNowLine(minutesToTop(now.getHours() * 60 + now.getMinutes()))
    }
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  }, [])

  // Scroll to current hour on mount
  useEffect(() => {
    if (!gridRef.current || !isToday) return
    const now = new Date()
    const top = minutesToTop(now.getHours() * 60 + now.getMinutes())
    gridRef.current.scrollTop = Math.max(0, top - gridRef.current.clientHeight / 3)
  }, [isToday])

  // Close QuickEventPopover on Escape
  useEffect(() => {
    if (!quickEvento) return
    const h = (e) => { if (e.key === 'Escape') setQuickEvento(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [quickEvento])

  const prevDay = () => setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n })
  const nextDay = () => setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n })
  const goToday = () => setViewDate(new Date())

  const cutoff = useMemo(() => {
    const c = new Date(todayActual); c.setDate(c.getDate() + 15)
    return toLocalISODate(c)
  }, [todayISO])

  const pending = useMemo(() =>
    agendaTareas.filter(t =>
      !t.completada && (!t.fecha_opcional || t.fecha_opcional <= cutoff)
    ).sort((a, b) => {
      if (!a.fecha_opcional && !b.fecha_opcional) return 0
      if (!a.fecha_opcional) return 1
      if (!b.fecha_opcional) return -1
      return a.fecha_opcional.localeCompare(b.fecha_opcional)
    }),
    [agendaTareas, cutoff]
  )

  const todayEventos = useMemo(() =>
    agendaEventos.filter(e => e.fecha_inicio?.slice(0, 10) === viewISO),
    [agendaEventos, viewISO]
  )

  const bloqueadas = useMemo(() =>
    agendaTareas.filter(t => t.fecha_opcional === viewISO && t.hora_bloque),
    [agendaTareas, viewISO]
  )

  const facultadHoy = useMemo(() =>
    agendaHorarioFacultad.filter(h => h.dia_semana === todayDow),
    [agendaHorarioFacultad, todayDow]
  )

  const registrosMap = useMemo(() => buildRegistrosMap(habitosRegistros), [habitosRegistros])

  const habitosHoy = useMemo(() =>
    habitos.filter(h => h.activo && isScheduled(h, viewDate) && !h.hora),
    [habitos, viewDate]
  )

  const habitosConHora = useMemo(() =>
    habitos.filter(h => h.activo && isScheduled(h, viewDate) && !!h.hora),
    [habitos, viewDate]
  )

  const todayEventosAllDay = useMemo(() =>
    todayEventos.filter(e => e.todo_el_dia),
    [todayEventos]
  )

  // Task 1: layout with columns
  const timedEventos = useMemo(() =>
    layoutTimedEvents(todayEventos.filter(e => !e.todo_el_dia && e.fecha_inicio)),
    [todayEventos]
  )

  const handleHabitoCheck = useCallback((habito) => {
    const reg = registrosMap[`${habito.id}-${viewISO}`]
    if (reg && reg.valor > 0) {
      deleteHabitoRegistro(reg.id, habito.id, viewISO)
    } else {
      upsertHabitoRegistro(habito.id, viewISO, 1.0, null)
    }
  }, [registrosMap, viewISO, deleteHabitoRegistro, upsertHabitoRegistro])

  const handleToggle = useCallback((tarea) => {
    updateAgendaTarea(tarea.id, { completada: !tarea.completada })
  }, [updateAgendaTarea])

  // Task #24 + #33: toggle block task with CSS animation
  const handleBlockToggle = useCallback((tarea) => {
    if (tarea.completada) {
      updateAgendaTarea(tarea.id, { completada: false })
      setCompletingIds(prev => { const s = new Set(prev); s.delete(tarea.id); return s })
    } else {
      setCompletingIds(prev => new Set(prev).add(tarea.id))
      setTimeout(() => {
        updateAgendaTarea(tarea.id, { completada: true })
      }, 220)
    }
  }, [updateAgendaTarea])

  const handleAgendar = useCallback(async (id) => {
    if (!horaInput) return
    await updateAgendaTarea(id, { hora_bloque: horaInput, fecha_opcional: viewISO })
    setSchedulingId(null); setHoraInput('')
  }, [horaInput, viewISO, updateAgendaTarea])

  // Task 6: quick-add inline
  const handleQuickTarea = useCallback(async () => {
    const titulo = quickTareaTitulo.trim()
    if (!titulo) return
    await addAgendaTarea({ titulo, fecha_opcional: viewISO })
    setQuickTareaTitulo('')
    showToast('Tarea creada')
  }, [quickTareaTitulo, viewISO, addAgendaTarea, showToast])

  // Task 7: quick event from popover
  const handleQuickEvento = useCallback(async () => {
    if (!quickEvento) return
    const titulo = quickEvento.titulo.trim()
    if (!titulo) return
    const addFn = useStore.getState().addAgendaEvento
    await addFn({ titulo, fecha_inicio: `${viewISO}T${quickEvento.hora}:00`, todo_el_dia: false })
    setQuickEvento(null)
    showToast('Evento creado')
  }, [quickEvento, viewISO, showToast])

  // Task 3: select item → right panel / drawer
  const handleSelectItem = (type, item) => {
    setSelectedItem({ type, item })
    setDrawerOpen(true)
  }

  const handleOpenEdit = () => {
    if (!selectedItem) return
    if (selectedItem.type === 'evento') setEditEvento(selectedItem.item)
    else setEditTarea(selectedItem.item)
  }

  // Clean expired blocks
  useEffect(() => {
    if (!bloqueadas.length || !isToday) return
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    bloqueadas.forEach(t => {
      const blockMin = timeToMinutes(t.hora_bloque)
      if (blockMin !== null && blockMin < nowMin && !t.completada) {
        updateAgendaTarea(t.id, { hora_bloque: null })
      }
    })
  }, [bloqueadas, isToday]) // eslint-disable-line react-hooks/exhaustive-deps

  const dayLabel = viewDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  // Task 3: detail panel content (reused in right panel + drawer)
  const SelectedDetail = selectedItem && (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="label">{selectedItem.type === 'evento' ? 'Evento' : 'Tarea'}</div>
        <div className="flex items-center gap-1">
          <button
            className="icon-btn" style={{ width: 26, height: 26 }}
            onClick={handleOpenEdit}
            title={t(lang, 'agendaEditar')}
          >
            <Edit2 size={12} />
          </button>
          <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => { setSelectedItem(null); setDrawerOpen(false) }}>
            <X size={12} />
          </button>
        </div>
      </div>
      <div className="panel-strong p-3 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full" style={{ background: selectedItem.type === 'evento' ? selectedItem.item.calendario_color : selectedItem.item.lista_color }} />
          <span className="text-[13px] font-semibold">{selectedItem.item.titulo}</span>
        </div>
        {selectedItem.item.descripcion && (
          <p className="text-[12px] mb-2" style={{ color: 'var(--subtext)' }}>{selectedItem.item.descripcion}</p>
        )}
        {selectedItem.type === 'evento' && selectedItem.item.fecha_inicio && (
          <div className="mono text-[11px]" style={{ color: 'var(--subtext)' }}>
            {selectedItem.item.todo_el_dia ? t(lang, 'agendaTodoElDia') : selectedItem.item.fecha_inicio.slice(11, 16)}
            {selectedItem.item.fecha_fin && ` → ${selectedItem.item.fecha_fin.slice(11, 16)}`}
          </div>
        )}
        {selectedItem.type === 'tarea' && (
          <div className="mono text-[11px]" style={{ color: 'var(--subtext)' }}>
            {selectedItem.item.hora_bloque && `⏰ ${selectedItem.item.hora_bloque}`}
            {selectedItem.item.duracion_estimada && ` · ${selectedItem.item.duracion_estimada} min`}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left panel */}
      <aside
        className="w-[260px] shrink-0 flex flex-col h-full overflow-y-auto panel-scroll border-r"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="label">{t(lang, 'agendaTareasPendientes')}</div>
            <button
              className="icon-btn" style={{ width: 24, height: 24 }}
              onClick={() => setNewTareaOpen(true)}
              title={t(lang, 'agendaTareaNueva')}
            >
              <Plus size={13} />
            </button>
          </div>

          {/* Task 6: quick-add inline input */}
          <div
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border mb-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <Plus size={10} style={{ color: 'var(--mute)', flexShrink: 0 }} />
            <input
              placeholder={t(lang, 'agendaTareaRapida')}
              value={quickTareaTitulo}
              onChange={e => setQuickTareaTitulo(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleQuickTarea()
                if (e.key === 'Escape') setQuickTareaTitulo('')
              }}
              className="flex-1 bg-transparent outline-none text-[12px]"
              style={{ color: 'var(--text)' }}
              aria-label={t(lang, 'agendaTareaRapida')}
            />
          </div>

          {pending.length === 0 ? (
            <div className="text-[12px] italic px-1" style={{ color: 'var(--subtext)' }}>
              {t(lang, 'agendaSinTareas')}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {pending.map(tarea => {
                const urg = tareaUrgencia(tarea, todayISO)
                return (
                  <div key={tarea.id} className="group panel-strong rounded-lg px-2.5 py-2">
                    <div className="flex items-start gap-2">
                      <button
                        className="mt-0.5 shrink-0 transition-colors"
                        style={{ color: tarea.completada ? 'var(--accent)' : 'var(--mute)' }}
                        onClick={() => handleToggle(tarea)}
                        aria-label={tarea.completada ? 'Descompletar' : 'Completar'}
                      >
                        {tarea.completada ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tarea.lista_color }} />
                          <span className="text-[12px] font-medium truncate flex-1" style={{ color: 'var(--text)' }}>
                            {tarea.titulo}
                          </span>
                          {FIN_KEYWORDS.test(tarea.titulo) && (
                            <button
                              onClick={e => { e.stopPropagation(); navigate('/finanzas') }}
                              title="Ver en Finanzas"
                              className="shrink-0 transition-opacity opacity-50 hover:opacity-100"
                              style={{ color: '#d97706' }}
                            >
                              <DollarSign size={10} />
                            </button>
                          )}
                        </div>
                        {tarea.fecha_opcional && (
                          <div className="text-[10.5px] mono" style={{ color: URGENCIA_COLOR[urg] }}>
                            {urg === 'overdue' && '⚠ '}
                            {new Date(tarea.fecha_opcional + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                            {tarea.hora_opcional && ` · ${tarea.hora_opcional}`}
                          </div>
                        )}
                      </div>
                    </div>
                    {schedulingId === tarea.id ? (
                      <div className="flex items-center gap-1.5 mt-2">
                        <input
                          type="time"
                          value={horaInput}
                          onChange={e => setHoraInput(e.target.value)}
                          className="flex-1 px-2 py-1 rounded-lg border text-[11px] outline-none"
                          style={{ background: 'var(--bg)', borderColor: 'var(--accent)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
                          autoFocus
                        />
                        <button
                          className="px-2 py-1 rounded-lg text-[11px] font-medium"
                          style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                          onClick={() => handleAgendar(tarea.id)}
                        >OK</button>
                        <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => setSchedulingId(null)}>
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
                )
              })}
            </div>
          )}
        </div>

        {/* Hábitos de hoy (sin hora) */}
        {habitosHoy.length > 0 && (
          <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="label mt-3 mb-2">{t(lang, 'habitosDeHoy')}</div>
            <div className="flex flex-col gap-1">
              {habitosHoy.map(h => {
                const reg     = registrosMap[`${h.id}-${viewISO}`]
                const done    = reg && reg.valor > 0
                const partial = reg && reg.valor > 0 && reg.valor < 1
                return (
                  <div key={h.id} className="flex items-center gap-2.5 px-1 py-1">
                    <button
                      onClick={() => handleHabitoCheck(h)}
                      className="shrink-0 w-4 h-4 rounded-md border grid place-items-center"
                      style={{ background: done ? h.color : 'transparent', borderColor: done ? h.color : 'var(--border)' }}
                      aria-checked={done}
                      role="checkbox"
                      aria-label={h.nombre}
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
        <div className="px-5 py-3 border-b shrink-0 flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <div>
            <div className="label capitalize">{t(lang, 'agendaTuDia')}</div>
            <div className="text-[18px] serif italic mt-0.5 capitalize">{dayLabel}</div>
          </div>
          <div className="flex items-center gap-1">
            <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={prevDay} aria-label="Día anterior">
              <ChevronLeft size={15} />
            </button>
            {!isToday && (
              <button className="btn text-[11px] px-2.5 py-1" onClick={goToday}>
                {t(lang, 'agendaHoy2')}
              </button>
            )}
            <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={nextDay} aria-label="Día siguiente">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* All-day chips */}
        {todayEventosAllDay.length > 0 && (
          <div className="px-5 py-1.5 border-b flex flex-wrap gap-1.5 shrink-0" style={{ borderColor: 'var(--border)' }}>
            {todayEventosAllDay.map(e => (
              <div
                key={e.id}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-medium cursor-pointer"
                style={{ background: `color-mix(in oklch, ${e.calendario_color} 20%, transparent)`, color: e.calendario_color }}
                onClick={() => handleSelectItem('evento', e)}
                role="button"
                aria-label={e.titulo}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: e.calendario_color }} />
                {e.titulo}
              </div>
            ))}
          </div>
        )}

        {/* Scrollable hour grid */}
        <div ref={gridRef} className="flex-1 overflow-y-auto panel-scroll px-5 pt-3 pb-8 relative">
          {/* Task 7: QuickEventPopover */}
          {quickEvento !== null && (
            <div
              className="absolute z-30 left-14 right-0"
              style={{ top: quickEvento.top }}
            >
              <div
                className="panel-strong rounded-xl p-3 shadow-xl border max-w-[280px]"
                style={{ borderColor: 'var(--accent)' }}
              >
                <input
                  autoFocus
                  placeholder={t(lang, 'agendaEventoRapido')}
                  value={quickEvento.titulo}
                  onChange={e => setQuickEvento(q => ({ ...q, titulo: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleQuickEvento()
                    if (e.key === 'Escape') setQuickEvento(null)
                  }}
                  className="w-full bg-transparent outline-none text-[12.5px] border-b pb-1.5 mb-2"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                />
                <div className="flex items-center gap-2">
                  <span className="mono text-[11px]" style={{ color: 'var(--subtext)' }}>{quickEvento.hora}</span>
                  <button
                    className="ml-auto btn text-[11px] px-2.5 py-1"
                    onClick={handleQuickEvento}
                    disabled={!quickEvento.titulo.trim()}
                  >{t(lang, 'agendaGuardar')}</button>
                  <button
                    className="text-[11px] px-1"
                    style={{ color: 'var(--subtext)' }}
                    onClick={() => {
                      const hora = quickEvento.hora
                      setQuickEvento(null)
                      setNewEventoHora(hora)
                    }}
                  >{t(lang, 'agendaMasDetalles')}</button>
                </div>
              </div>
            </div>
          )}

          <div
            className="relative"
            style={{ height: HOURS.length * HOUR_HEIGHT }}
            role="grid"
            aria-label={t(lang, 'agendaTuDia')}
          >
            {/* Hour lines + click targets */}
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute left-0 right-0 flex items-start gap-3"
                style={{ top: (h - 6) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                role="row"
              >
                <span
                  className="mono text-[10.5px] w-10 shrink-0 text-right pt-0.5"
                  style={{ color: 'var(--mute)' }}
                  aria-hidden="true"
                >
                  {String(h).padStart(2, '0')}:00
                </span>
                <div
                  role="gridcell"
                  aria-label={`${String(h).padStart(2, '0')}:00`}
                  className="flex-1 border-t cursor-pointer hover:bg-[var(--surface)] rounded-sm transition-colors"
                  style={{ borderColor: 'var(--border)', marginTop: 8, height: HOUR_HEIGHT - 8 }}
                  onClick={() => setQuickEvento({ hora: `${String(h).padStart(2, '0')}:00`, titulo: '', top: (h - 6) * HOUR_HEIGHT })}
                />
              </div>
            ))}

            {/* Facultad layer */}
            {facultadHoy.map(hf => {
              const startMin = timeToMinutes(hf.hora_inicio)
              const endMin   = timeToMinutes(hf.hora_fin)
              if (startMin === null || endMin === null) return null
              const top    = minutesToTop(startMin)
              const height = ((endMin - startMin) / 60) * HOUR_HEIGHT
              return (
                <div
                  key={hf.id}
                  className="absolute left-14 right-0 rounded-md flex items-start px-2 py-1 overflow-hidden pointer-events-none"
                  style={{ top, height, background: 'color-mix(in oklch, #059669 10%, transparent)', borderLeft: '2px solid #059669', opacity: 0.55 }}
                >
                  <div className="flex items-center gap-1">
                    <GraduationCap size={10} style={{ color: '#059669' }} />
                    <span className="text-[10px] truncate font-medium" style={{ color: '#059669' }}>{hf.materia}</span>
                  </div>
                </div>
              )
            })}

            {/* Task 1: Event blocks with column layout */}
            {timedEventos.map(evento => {
              const top      = minutesToTop(evento._startMin)
              const height   = Math.max(((evento._endMin - evento._startMin) / 60) * HOUR_HEIGHT, 20)
              const colFrac  = 1 / evento._totalCols
              const colLeft  = evento._col / evento._totalCols
              const isSelected = selectedItem?.type === 'evento' && selectedItem?.item?.id === evento.id
              // left = 56px + col * (100% - 56px) / totalCols
              const leftVal  = `calc(${colLeft * 100}% + ${56 * (1 - colLeft)}px)`
              const widthVal = `calc(${colFrac * 100}% - ${56 * colFrac + 3}px)`
              return (
                <div
                  key={evento.id}
                  className="absolute rounded-md px-2 py-1 overflow-hidden cursor-pointer"
                  style={{
                    top, height,
                    left: leftVal,
                    width: widthVal,
                    background: `color-mix(in oklch, ${evento.calendario_color} ${isSelected ? 35 : 22}%, transparent)`,
                    borderLeft: `2.5px solid ${evento.calendario_color}`,
                    outline: isSelected ? `2px solid ${evento.calendario_color}` : 'none',
                    outlineOffset: 1,
                  }}
                  onClick={() => handleSelectItem('evento', evento)}
                  role="button"
                  aria-label={evento.titulo}
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
              const dur        = tarea.duracion_estimada || 30
              const top        = minutesToTop(startMin)
              const height     = Math.max((dur / 60) * HOUR_HEIGHT, 24)
              const isSelected = selectedItem?.type === 'tarea' && selectedItem?.item?.id === tarea.id
              const isAnimating = completingIds.has(tarea.id)
              return (
                <div
                  key={tarea.id}
                  className="absolute left-14 right-8 rounded-md px-2 py-1 overflow-hidden flex items-center gap-1.5 block-new cursor-pointer"
                  style={{
                    top, height,
                    background: `color-mix(in oklch, ${tarea.lista_color} 15%, var(--surface))`,
                    border: `1.5px ${isSelected ? 'solid' : 'dashed'} ${tarea.lista_color}`,
                    transformOrigin: 'top',
                    outline: isSelected ? `2px solid ${tarea.lista_color}` : 'none',
                    outlineOffset: 1,
                    opacity: (tarea.completada || isAnimating) ? 0.45 : 1,
                    transition: 'opacity 200ms ease',
                  }}
                  onClick={() => handleSelectItem('tarea', tarea)}
                  role="button"
                  aria-label={tarea.titulo}
                >
                  <button
                    onClick={e => { e.stopPropagation(); handleBlockToggle(tarea) }}
                    style={{ color: tarea.lista_color, flexShrink: 0 }}
                    aria-label={tarea.completada ? 'Descompletar' : 'Completar'}
                    aria-checked={tarea.completada}
                  >
                    {tarea.completada ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                  </button>
                  <span
                    className="text-[11px] font-medium truncate"
                    style={{
                      color: 'var(--text)',
                      textDecoration: (tarea.completada || isAnimating) ? 'line-through' : 'none',
                      transition: 'text-decoration 200ms ease',
                    }}
                  >{tarea.titulo}</span>
                  <button
                    className="ml-auto shrink-0"
                    style={{ color: 'var(--mute)' }}
                    onClick={e => { e.stopPropagation(); updateAgendaTarea(tarea.id, { hora_bloque: null }) }}
                    aria-label="Quitar bloque"
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
              const reg    = registrosMap[`${h.id}-${viewISO}`]
              const done   = reg && reg.valor > 0
              return (
                <div
                  key={h.id}
                  className="absolute left-14 right-0 rounded-md px-2 py-1 flex items-center gap-1.5 cursor-pointer"
                  style={{ top, height, background: `color-mix(in oklch, ${h.color} ${done ? 25 : 15}%, var(--surface))`, border: `1.5px solid color-mix(in oklch, ${h.color} 50%, transparent)`, opacity: done ? 0.7 : 1 }}
                  onClick={() => handleHabitoCheck(h)}
                  role="button"
                  aria-label={h.nombre}
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
            {isToday && nowLine > 0 && nowLine < HOURS.length * HOUR_HEIGHT && (
              <div
                className="absolute left-12 right-0 flex items-center gap-1 pointer-events-none"
                style={{ top: nowLine }}
                aria-hidden="true"
              >
                <div className="w-2 h-2 rounded-full shrink-0 now-dot" style={{ background: 'var(--accent)' }} />
                <div className="flex-1 border-t-2" style={{ borderColor: 'var(--accent)' }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Task 3: Right panel xl — selected item or cards list */}
      <aside
        className="hidden xl:flex flex-col w-[260px] shrink-0 h-full overflow-y-auto panel-scroll border-l"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="p-4">
          {selectedItem ? SelectedDetail : (
            <>
              <div className="label mb-3">{t(lang, 'agendaHoy2')}</div>
              {todayEventos.length === 0 && bloqueadas.length === 0 ? (
                <div className="text-[12px] italic" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaSinEventos')}</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {todayEventos.map(e => (
                    <div
                      key={e.id}
                      className="rounded-xl border px-3 py-2.5 cursor-pointer hover:bg-[var(--surface)] transition-colors"
                      style={{ borderColor: 'var(--border)', background: `linear-gradient(140deg, color-mix(in oklch, ${e.calendario_color} 10%, transparent), transparent 80%)` }}
                      onClick={() => handleSelectItem('evento', e)}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.calendario_color }} />
                        <span className="mono text-[10.5px]" style={{ color: 'var(--subtext)' }}>
                          {e.todo_el_dia ? t(lang, 'agendaTodoElDia') : e.fecha_inicio?.slice(11, 16)}
                        </span>
                      </div>
                      <div className="text-[12.5px] font-medium truncate">{e.titulo}</div>
                    </div>
                  ))}
                  {bloqueadas.map(tarea => (
                    <div
                      key={tarea.id}
                      className="rounded-xl border px-3 py-2.5 cursor-pointer hover:bg-[var(--surface)] transition-colors"
                      style={{ borderColor: `color-mix(in oklch, ${tarea.lista_color} 40%, var(--border))`, background: `color-mix(in oklch, ${tarea.lista_color} 6%, var(--surface))` }}
                      onClick={() => handleSelectItem('tarea', tarea)}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Circle size={10} style={{ color: tarea.lista_color }} />
                        <span className="mono text-[10.5px]" style={{ color: 'var(--subtext)' }}>{tarea.hora_bloque}</span>
                      </div>
                      <div className="text-[12.5px] font-medium truncate">{tarea.titulo}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Task 10: Drawer for < xl screens */}
      {drawerOpen && selectedItem && (
        <div
          className="xl:hidden fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="absolute right-0 top-0 bottom-0 w-[300px] overflow-y-auto panel-scroll p-4 shadow-2xl"
            style={{ background: 'var(--panel-bg)', borderLeft: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            {SelectedDetail}
          </div>
        </div>
      )}

      {newTareaOpen && <TareaModal onClose={() => setNewTareaOpen(false)} defaultFecha={viewISO} />}
      {newEventoHora !== null && (
        <EventoModal defaultFecha={viewISO} defaultHora={newEventoHora} onClose={() => setNewEventoHora(null)} />
      )}
      {editEvento && (
        <EventoModal evento={editEvento} onClose={() => { setEditEvento(null); setSelectedItem(null); setDrawerOpen(false) }} />
      )}
      {editTarea && (
        <TareaModal tarea={editTarea} onClose={() => { setEditTarea(null); setSelectedItem(null); setDrawerOpen(false) }} />
      )}
    </div>
  )
}
