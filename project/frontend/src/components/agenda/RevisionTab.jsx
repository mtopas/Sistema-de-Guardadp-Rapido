import { useState } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Clock, Download } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { toLocalISODate } from './agendaUtils'

function getWeekBounds(offset) {
  const today = new Date()
  const dow   = (today.getDay() + 6) % 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - dow + offset * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { monday, sunday }
}

function Sparkline({ data, width = 120, height = 32 }) {
  const max = Math.max(...data, 1)
  const points = data.map((v, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * width : width / 2
    const y = height - (v / max) * height
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={data.length > 1 ? (i / (data.length - 1)) * width : width / 2}
          cy={height - (v / max) * height}
          r="2.5"
          fill="var(--accent)"
          opacity={v > 0 ? 1 : 0.25}
        />
      ))}
    </svg>
  )
}

function exportMarkdown(weekLabel, completadas, incompletas, vencidas, porCalendario) {
  const lines = [
    `# Revisión semanal — ${weekLabel}`,
    ``,
    `## Tareas`,
    `- ✅ Completadas: ${completadas.length}`,
    `- ⏳ Sin completar: ${incompletas.length}`,
    vencidas.length ? `- 🔴 Vencidas: ${vencidas.length}` : '',
    ``,
    `## Tiempo por calendario`,
    ...Object.values(porCalendario).map(c => `- **${c.nombre}:** ${(c.minutes / 60).toFixed(1)}h`),
  ].filter(l => l !== undefined)
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `revision-${weekLabel.replace(/\s/g, '-')}.md`; a.click()
  URL.revokeObjectURL(url)
}

export default function RevisionTab() {
  const lang          = useStore(s => s.lang)
  const agendaTareas  = useStore(s => s.agendaTareas)
  const agendaEventos = useStore(s => s.agendaEventos)
  const agendaCalendarios = useStore(s => s.agendaCalendarios)
  const agendaHorarioFacultad = useStore(s => s.agendaHorarioFacultad)

  const [weekOff, setWeekOff] = useState(-1)

  const { monday, sunday } = getWeekBounds(weekOff)
  const mondayISO = toLocalISODate(monday)
  const sundayISO = toLocalISODate(sunday)

  const weekLabel = `${monday.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} – ${sunday.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}`

  const tareasSemana  = agendaTareas.filter(t => t.fecha_opcional && t.fecha_opcional >= mondayISO && t.fecha_opcional <= sundayISO)
  const completadas   = tareasSemana.filter(t => t.completada)
  const incompletas   = tareasSemana.filter(t => !t.completada)

  const today = new Date()
  const sevenAgo = new Date(today)
  sevenAgo.setDate(today.getDate() - 7)
  const vencidas = agendaTareas.filter(t =>
    !t.completada && t.fecha_opcional && t.fecha_opcional < toLocalISODate(sevenAgo)
  )

  const eventosWeek = agendaEventos.filter(e => {
    const d = e.fecha_inicio?.slice(0, 10)
    return d && d >= mondayISO && d <= sundayISO
  })

  // Bloques de tareas en la semana
  const bloquesWeek = agendaTareas.filter(t =>
    t.hora_bloque && t.fecha_opcional && t.fecha_opcional >= mondayISO && t.fecha_opcional <= sundayISO
  )

  // % tiempo planificado — denominador: 16h despierto × 7 días = 6720 min
  const AWAKE_MINUTES_WEEK = 16 * 60 * 7

  const plannedMinutosEventos = eventosWeek.reduce((acc, e) => {
    if (e.todo_el_dia) return acc + 60
    const start = e.fecha_inicio ? (parseInt(e.fecha_inicio.slice(11, 13)) * 60 + parseInt(e.fecha_inicio.slice(14, 16) || 0)) : 0
    const end   = e.fecha_fin   ? (parseInt(e.fecha_fin.slice(11, 13))   * 60 + parseInt(e.fecha_fin.slice(14, 16)   || 0)) : start + 60
    return acc + Math.max(0, end - start)
  }, 0)

  const plannedMinutosBloques = bloquesWeek.reduce((acc, t) => {
    return acc + (t.duracion_estimada || 30)
  }, 0)

  const plannedMinutes = plannedMinutosEventos + plannedMinutosBloques
  const pctPlanned     = Math.min(100, Math.round((plannedMinutes / AWAKE_MINUTES_WEEK) * 100))

  // Tiempo por calendario
  const calStats = {}
  eventosWeek.forEach(e => {
    const cal    = agendaCalendarios.find(c => c.id === e.calendario_id)
    const nombre = cal?.nombre || 'Sin calendario'
    const color  = cal?.color  || 'var(--accent)'
    if (!calStats[nombre]) calStats[nombre] = { nombre, color, minutes: 0 }
    const start = e.fecha_inicio ? (parseInt(e.fecha_inicio.slice(11, 13)) * 60 + parseInt(e.fecha_inicio.slice(14, 16) || 0)) : 0
    const end   = e.fecha_fin   ? (parseInt(e.fecha_fin.slice(11, 13))   * 60 + parseInt(e.fecha_fin.slice(14, 16)   || 0)) : start + 60
    calStats[nombre].minutes += Math.max(0, end - start)
  })

  const facultadMinutes = agendaHorarioFacultad.reduce((acc, h) => {
    const [sh, sm] = h.hora_inicio.split(':').map(Number)
    const [eh, em] = h.hora_fin.split(':').map(Number)
    return acc + Math.max(0, (eh * 60 + em) - (sh * 60 + sm))
  }, 0)
  if (facultadMinutes > 0) {
    calStats['Facultad'] = { nombre: 'Facultad', color: '#059669', minutes: facultadMinutes }
  }

  const totalTracked = Object.values(calStats).reduce((s, c) => s + c.minutes, 0)

  // Sparkline: completadas por día (lun–dom)
  const sparkData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const iso = toLocalISODate(d)
    return completadas.filter(t => t.fecha_opcional === iso).length
  })

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
        <div className="flex items-center justify-between mb-4">
          <div className="label capitalize">{weekLabel}</div>
          <button
            className="flex items-center gap-1.5 text-[11.5px] px-2.5 py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--subtext)' }}
            onClick={() => exportMarkdown(weekLabel, completadas, incompletas, vencidas, calStats)}
          >
            <Download size={12} />
            Exportar
          </button>
        </div>

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
                {completadas.slice(0, 4).map(tt => (
                  <div key={tt.id} className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tt.lista_color }} />
                    <span className="truncate line-through opacity-60">{tt.titulo}</span>
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
                {incompletas.slice(0, 4).map(tt => (
                  <div key={tt.id} className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tt.lista_color }} />
                    <span className="truncate">{tt.titulo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sparkline */}
        <div className="panel-strong p-4 rounded-xl mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="label">Tareas completadas por día</div>
            <Sparkline data={sparkData} width={140} height={28} />
          </div>
          <div className="flex justify-between">
            {['L','M','X','J','V','S','D'].map((d, i) => (
              <div key={d} className="flex flex-col items-center gap-1">
                <span className="text-[10px] tnum font-semibold" style={{ color: sparkData[i] > 0 ? 'var(--accent)' : 'var(--mute)' }}>
                  {sparkData[i]}
                </span>
                <span className="text-[9.5px]" style={{ color: 'var(--mute)' }}>{d}</span>
              </div>
            ))}
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
          <div className="label mb-1">{t(lang, 'agendaTiempoPlan')}</div>
          <div className="text-[11px] mb-3" style={{ color: 'var(--mute)' }}>
            {Math.round(plannedMinutes / 60)}h planificadas de {AWAKE_MINUTES_WEEK / 60}h despierto
          </div>
          <div className="flex items-end gap-3 mb-2">
            <div className="text-[32px] font-bold tnum" style={{ color: 'var(--accent)' }}>{pctPlanned}%</div>
            {plannedMinutosBloques > 0 && (
              <div className="text-[11px] mb-2" style={{ color: 'var(--subtext)' }}>
                ({Math.round(plannedMinutosEventos/60)}h eventos + {Math.round(plannedMinutosBloques/60)}h bloques)
              </div>
            )}
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pctPlanned}%`, background: 'var(--accent)' }} />
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
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cal.color }} />
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
