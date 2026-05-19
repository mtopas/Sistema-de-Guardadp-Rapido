import { useState } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'

function getWeekBounds(offset) {
  const today = new Date()
  const dow = (today.getDay() + 6) % 7 // Mon=0
  const monday = new Date(today)
  monday.setDate(today.getDate() - dow + offset * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { monday, sunday }
}

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

export default function RevisionTab() {
  const lang          = useStore(s => s.lang)
  const agendaTareas  = useStore(s => s.agendaTareas)
  const agendaEventos = useStore(s => s.agendaEventos)
  const agendaCalendarios = useStore(s => s.agendaCalendarios)
  const agendaHorarioFacultad = useStore(s => s.agendaHorarioFacultad)

  const [weekOff, setWeekOff] = useState(-1) // -1 = last week

  const { monday, sunday } = getWeekBounds(weekOff)
  const mondayISO = isoDate(monday)
  const sundayISO = isoDate(sunday)

  const weekLabel = `${monday.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} – ${sunday.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}`

  // Tasks in the week
  const tareasSemana = agendaTareas.filter(t => t.fecha_opcional && t.fecha_opcional >= mondayISO && t.fecha_opcional <= sundayISO)
  const completadas  = tareasSemana.filter(t => t.completada)
  const incompletas  = tareasSemana.filter(t => !t.completada)

  // Overdue: pendientes con fecha < hoy y fecha < monday (older than 7 days ago)
  const today = new Date()
  const sevenAgo = new Date(today)
  sevenAgo.setDate(today.getDate() - 7)
  const vencidas = agendaTareas.filter(t =>
    !t.completada && t.fecha_opcional && t.fecha_opcional < isoDate(sevenAgo)
  )

  // Time planned: events + task blocks in the week
  const eventosWeek = agendaEventos.filter(e => {
    const d = e.fecha_inicio?.slice(0, 10)
    return d && d >= mondayISO && d <= sundayISO
  })

  const totalMinutesInWeek = 7 * 24 * 60
  const plannedMinutes = eventosWeek.reduce((acc, e) => {
    if (e.todo_el_dia) return acc + 60
    const start = e.fecha_inicio ? (parseInt(e.fecha_inicio.slice(11, 13)) * 60 + parseInt(e.fecha_inicio.slice(14, 16) || 0)) : 0
    const end   = e.fecha_fin   ? (parseInt(e.fecha_fin.slice(11, 13))   * 60 + parseInt(e.fecha_fin.slice(14, 16)   || 0)) : start + 60
    return acc + Math.max(0, end - start)
  }, 0)

  const pctPlanned = Math.min(100, Math.round((plannedMinutes / totalMinutesInWeek) * 100))

  // Time by calendar
  const calStats = {}
  eventosWeek.forEach(e => {
    const cal = agendaCalendarios.find(c => c.id === e.calendario_id)
    const nombre = cal?.nombre || 'Sin calendario'
    const color  = cal?.color  || 'var(--accent)'
    if (!calStats[nombre]) calStats[nombre] = { nombre, color, minutes: 0 }
    const start = e.fecha_inicio ? (parseInt(e.fecha_inicio.slice(11, 13)) * 60 + parseInt(e.fecha_inicio.slice(14, 16) || 0)) : 0
    const end   = e.fecha_fin   ? (parseInt(e.fecha_fin.slice(11, 13))   * 60 + parseInt(e.fecha_fin.slice(14, 16)   || 0)) : start + 60
    calStats[nombre].minutes += Math.max(0, end - start)
  })

  // Facultad contribution (estimated: count slots × duration)
  const facultadMinutes = agendaHorarioFacultad.reduce((acc, h) => {
    const [sh, sm] = h.hora_inicio.split(':').map(Number)
    const [eh, em] = h.hora_fin.split(':').map(Number)
    return acc + Math.max(0, (eh * 60 + em) - (sh * 60 + sm))
  }, 0)
  if (facultadMinutes > 0) {
    calStats['Facultad'] = { nombre: 'Facultad', color: '#059669', minutes: facultadMinutes }
  }

  const totalTracked = Object.values(calStats).reduce((s, c) => s + c.minutes, 0)

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left: week selector */}
      <aside className="w-[200px] shrink-0 flex flex-col h-full border-r p-4" style={{ borderColor: 'var(--border)' }}>
        <div className="label mb-3">{t(lang, 'agendaRevisionTitle')}</div>
        <div className="flex items-center gap-2 mb-4">
          <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => setWeekOff(w => w - 1)}>
            <ChevronLeft size={13} />
          </button>
          <div className="flex-1 text-[11px] text-center mono" style={{ color: 'var(--subtext)' }}>
            {weekOff === -1 ? 'Semana pasada' : weekOff === 0 ? 'Esta semana' : `${weekOff > 0 ? '+' : ''}${weekOff} sem`}
          </div>
          <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => setWeekOff(w => w + 1)}>
            <ChevronRight size={13} />
          </button>
        </div>
        <div className="text-[11px] text-center" style={{ color: 'var(--mute)' }}>{weekLabel}</div>
      </aside>

      {/* Center */}
      <div className="flex-1 min-w-0 overflow-y-auto panel-scroll px-6 py-5">
        <div className="label mb-4 capitalize">{weekLabel}</div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Completadas */}
          <div className="panel-strong p-4 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={16} style={{ color: 'var(--accent)' }} />
              <div className="label">{t(lang, 'agendaCompletadasLabel')}</div>
            </div>
            <div className="text-[28px] font-bold tnum" style={{ color: 'var(--text)' }}>{completadas.length}</div>
            <div className="text-[11.5px] mt-1" style={{ color: 'var(--subtext)' }}>
              de {tareasSemana.length} tareas en la semana
            </div>
            {completadas.length > 0 && (
              <div className="mt-3 flex flex-col gap-1">
                {completadas.slice(0, 4).map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.lista_color }} />
                    <span className="truncate line-through opacity-60">{t.titulo}</span>
                  </div>
                ))}
                {completadas.length > 4 && (
                  <div className="text-[10.5px]" style={{ color: 'var(--mute)' }}>+{completadas.length - 4} más</div>
                )}
              </div>
            )}
          </div>

          {/* Sin completar */}
          <div className="panel-strong p-4 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle size={16} style={{ color: incompletas.length > 0 ? '#d97706' : 'var(--mute)' }} />
              <div className="label">{t(lang, 'agendaIgnoradas')}</div>
            </div>
            <div className="text-[28px] font-bold tnum" style={{ color: incompletas.length > 0 ? '#d97706' : 'var(--text)' }}>
              {incompletas.length}
            </div>
            <div className="text-[11.5px] mt-1" style={{ color: 'var(--subtext)' }}>tareas sin completar</div>
            {incompletas.length > 0 && (
              <div className="mt-3 flex flex-col gap-1">
                {incompletas.slice(0, 4).map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.lista_color }} />
                    <span className="truncate">{t.titulo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Vencidas */}
        {vencidas.length > 0 && (
          <div className="panel-strong p-4 rounded-xl mb-6 border" style={{ borderColor: 'color-mix(in oklch, #ef4444 30%, var(--border))' }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} style={{ color: '#ef4444' }} />
              <div className="label" style={{ color: '#ef4444' }}>{t(lang, 'agendaVencidas')} ({vencidas.length})</div>
            </div>
            <div className="flex flex-col gap-1.5">
              {vencidas.map(task => (
                <div key={task.id} className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text)' }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: task.lista_color }} />
                  <span className="flex-1 truncate">{task.titulo}</span>
                  <span className="mono text-[10.5px]" style={{ color: 'var(--mute)' }}>{task.fecha_opcional}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* % tiempo */}
        <div className="panel-strong p-4 rounded-xl mb-6">
          <div className="label mb-3">{t(lang, 'agendaTiempoPlan')}</div>
          <div className="flex items-end gap-3 mb-2">
            <div className="text-[32px] font-bold tnum" style={{ color: 'var(--accent)' }}>{pctPlanned}%</div>
            <div className="text-[12px] mb-2" style={{ color: 'var(--subtext)' }}>
              {Math.round(plannedMinutes / 60)}h planificadas
            </div>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pctPlanned}%`, background: 'var(--accent)' }}
            />
          </div>
          <div className="text-[11px] mt-1.5" style={{ color: 'var(--mute)' }}>
            {100 - pctPlanned}% {t(lang, 'agendaTiempoNoPlan').replace('% ', '')}
          </div>
        </div>
      </div>

      {/* Right: by calendar */}
      <aside className="hidden xl:flex flex-col w-[260px] shrink-0 h-full overflow-y-auto panel-scroll border-l p-4" style={{ borderColor: 'var(--border)' }}>
        <div className="label mb-4">{t(lang, 'agendaDistribucion')}</div>
        {Object.values(calStats).length === 0 ? (
          <div className="text-[12px] italic" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaSinDatos')}</div>
        ) : (
          <div className="flex flex-col gap-3">
            {Object.values(calStats).sort((a, b) => b.minutes - a.minutes).map(cal => {
              const pct = totalTracked > 0 ? Math.round((cal.minutes / totalTracked) * 100) : 0
              const hrs = (cal.minutes / 60).toFixed(1)
              return (
                <div key={cal.nombre}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: cal.color }} />
                      <span className="text-[12px] font-medium">{cal.nombre}</span>
                    </div>
                    <span className="mono text-[11px]" style={{ color: 'var(--subtext)' }}>{hrs}h</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: cal.color }}
                    />
                  </div>
                  <div className="text-[10.5px] mt-0.5 text-right" style={{ color: 'var(--mute)' }}>{pct}%</div>
                </div>
              )
            })}
          </div>
        )}
      </aside>
    </div>
  )
}
