import { Flame, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import {
  buildRegistrosMap, calcStreak, todayStatus, toISODate
} from './habitosUtils'

export default function HabitosLeftPanel({ selectedId, setSelectedId, onNew }) {
  const lang             = useStore(s => s.lang)
  const habitos          = useStore(s => s.habitos)
  const habitosRegistros = useStore(s => s.habitosRegistros)

  const registrosMap = buildRegistrosMap(habitosRegistros)
  const activos      = habitos.filter(h => h.activo)
  const today        = new Date()
  const todayStr     = toISODate(today)

  const doneCount = activos.filter(h => {
    const reg = registrosMap[`${h.id}-${todayStr}`]
    return reg && reg.valor > 0
  }).length
  const scheduledToday = activos.filter(h => {
    const d = new Date(); d.setHours(0,0,0,0)
    if (h.frecuencia_tipo === 'diario') return true
    try { return JSON.parse(h.dias_semana || '[]').includes(d.getDay()) } catch { return false }
  }).length

  const pct = scheduledToday > 0 ? Math.round((doneCount / scheduledToday) * 100) : 0

  return (
    <aside
      className="w-[260px] shrink-0 h-full flex flex-col overflow-hidden"
      style={{ borderRight: '1px solid var(--border)' }}
    >
      {/* Header + CTA */}
      <div className="p-4 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="label">{t(lang, 'habitosMisHabitos')}</div>
            <div className="text-[18px] serif italic mt-0.5">
              {activos.length} {activos.length === 1 ? 'hábito' : 'hábitos'}
            </div>
          </div>
          <button
            onClick={onNew}
            className="btn btn-primary glow-sm"
          >
            <Plus size={13} strokeWidth={2} />
            Nuevo
          </button>
        </div>

        {/* Progress today */}
        {scheduledToday > 0 && (
          <div
            className="rounded-xl p-3 mb-1"
            style={{ background: 'var(--surface)' }}
          >
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[12px] font-medium" style={{ color: 'var(--text)' }}>
                {doneCount} <span style={{ color: 'var(--subtext)' }}>{t(lang, 'habitosDeXY')} {scheduledToday}</span>
              </span>
              <span className="text-[12px] font-semibold tnum" style={{ color: 'var(--accent)' }}>{pct}%</span>
            </div>
            <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: 'var(--accent)' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Habit list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {activos.length === 0 ? (
          <p className="text-[12px] text-center px-4 py-8" style={{ color: 'var(--subtext)' }}>
            {t(lang, 'habitosSinHabitos')}
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {activos.map(h => {
              const status = todayStatus(h, registrosMap)
              const streak = calcStreak(h, registrosMap)
              const isSelected = h.id === selectedId

              const statusDot = status === 'done' ? 'var(--success)'
                : status === 'partial' ? 'var(--warning)'
                : status === 'pending' ? 'var(--warning)'
                : 'var(--mute)'
              const statusLabel = status === 'done' ? t(lang, 'habitosHecho')
                : status === 'partial' ? `${t(lang, 'habitosParcial')} hoy`
                : status === 'pending' ? t(lang, 'habitosPendiente')
                : t(lang, 'habitosNoToca')

              return (
                <div
                  key={h.id}
                  onClick={() => setSelectedId(isSelected ? null : h.id)}
                  className="flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-150"
                  style={{
                    background: isSelected ? 'var(--surface)' : 'transparent',
                    borderLeft: isSelected ? `3px solid ${h.color}` : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'color-mix(in oklch, var(--surface) 60%, transparent)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: h.color, boxShadow: `0 0 0 3px color-mix(in oklch, ${h.color} 15%, transparent)` }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text)' }} title={h.descripcion || ''}>
                      {h.nombre}
                    </div>
                    <div className="text-[10.5px] mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--subtext)' }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusDot }} />
                      {statusLabel}
                    </div>
                  </div>
                  {streak >= 3 && (
                    <div className="flex items-center gap-0.5 text-[11px] font-semibold tnum shrink-0" style={{ color: 'var(--warning)' }}>
                      <Flame size={12} />
                      {streak}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
