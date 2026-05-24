import { useMemo, useState } from 'react'
import { Flame, Plus, Target, Filter } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import {
  buildRegistrosMap, calcStreak, todayStatus, toISODate, isScheduled
} from './habitosUtils'

export default function HabitosLeftPanel({ selectedId, setSelectedId, onNew }) {
  const lang             = useStore(s => s.lang)
  const habitos          = useStore(s => s.habitos)
  const habitosRegistros = useStore(s => s.habitosRegistros)
  const upsertHabitoRegistro = useStore(s => s.upsertHabitoRegistro)

  const [soloHoy, setSoloHoy] = useState(false)

  const registrosMap = useMemo(() => buildRegistrosMap(habitosRegistros), [habitosRegistros])
  const activos      = useMemo(() => habitos.filter(h => h.activo), [habitos])
  const today        = new Date()
  const todayStr     = toISODate(today)

  const doneCount = useMemo(() =>
    activos.filter(h => {
      const reg = registrosMap[`${h.id}-${todayStr}`]
      return reg && reg.valor > 0
    }).length,
    [activos, registrosMap, todayStr]
  )

  const scheduledToday = useMemo(() =>
    activos.filter(h => isScheduled(h, today)).length,
    [activos]
  )

  const pct = scheduledToday > 0 ? Math.round((doneCount / scheduledToday) * 100) : 0

  // Filtered list
  const displayList = useMemo(() => {
    if (!soloHoy) return activos
    return activos.filter(h => {
      const status = todayStatus(h, registrosMap)
      return status === 'pending'  // only unfinished scheduled habits
    })
  }, [activos, soloHoy, registrosMap])

  async function handleQuickCheck(e, h) {
    e.stopPropagation()
    const existing = registrosMap[`${h.id}-${todayStr}`]
    if (existing && existing.valor > 0) return // already done, let CompletarModal handle
    await upsertHabitoRegistro(h.id, todayStr, 1.0, null)
  }

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
          <button onClick={onNew} className="btn btn-primary glow-sm">
            <Plus size={13} strokeWidth={2} />
            Nuevo
          </button>
        </div>

        {/* Progress today */}
        {scheduledToday > 0 && (
          <div className="rounded-xl p-3 mb-2" style={{ background: 'var(--surface)' }}>
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

        {/* Filtro solo pendientes */}
        {scheduledToday > 0 && (
          <button
            onClick={() => setSoloHoy(v => !v)}
            className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg transition-colors w-full"
            style={{
              background: soloHoy ? 'color-mix(in oklch, var(--accent) 12%, transparent)' : 'transparent',
              color: soloHoy ? 'var(--accent)' : 'var(--subtext)',
              border: `1px solid ${soloHoy ? 'color-mix(in oklch, var(--accent) 30%, transparent)' : 'transparent'}`,
            }}
          >
            <Filter size={11} />
            Solo pendientes hoy
          </button>
        )}
      </div>

      {/* Habit list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {activos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <div
              className="w-12 h-12 rounded-2xl grid place-items-center"
              style={{ background: 'color-mix(in oklch, var(--accent) 12%, transparent)' }}
            >
              <Target size={22} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <div className="text-[13px] font-medium mb-1" style={{ color: 'var(--text)' }}>
                Sin hábitos activos
              </div>
              <div className="text-[11.5px] leading-relaxed" style={{ color: 'var(--subtext)' }}>
                Creá tu primer hábito para empezar a construir tu rutina
              </div>
            </div>
            <button onClick={onNew} className="btn btn-primary text-[12px]">
              <Plus size={12} />
              Crear hábito
            </button>
          </div>
        ) : displayList.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="text-[13px] font-medium mb-1" style={{ color: 'var(--success)' }}>
              ¡Todo listo por hoy!
            </div>
            <div className="text-[11.5px]" style={{ color: 'var(--subtext)' }}>
              No quedan hábitos pendientes
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {displayList.map(h => {
              const status    = todayStatus(h, registrosMap)
              const streak    = calcStreak(h, registrosMap)
              const isSelected = h.id === selectedId
              const scheduledNow = isScheduled(h, today)
              const isPending = status === 'pending' && scheduledNow

              const statusDot = status === 'done'    ? 'var(--success)'
                : status === 'partial'  ? 'var(--warning)'
                : status === 'pending'  ? 'var(--warning)'
                : 'var(--mute)'
              const statusLabel = status === 'done'   ? t(lang, 'habitosHecho')
                : status === 'partial' ? `${t(lang, 'habitosParcial')} hoy`
                : status === 'pending' ? t(lang, 'habitosPendiente')
                : t(lang, 'habitosNoToca')

              return (
                <div
                  key={h.id}
                  onClick={() => setSelectedId(isSelected ? null : h.id)}
                  className="flex items-center gap-2 pl-2 pr-2 py-2 rounded-xl cursor-pointer transition-colors duration-150"
                  style={{
                    background: isSelected ? 'var(--surface)' : 'transparent',
                    borderLeft: isSelected ? `3px solid ${h.color}` : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'color-mix(in oklch, var(--surface) 60%, transparent)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Quick-check button: only for pending habits today */}
                  {isPending ? (
                    <button
                      title="Marcar como hecho"
                      onClick={e => handleQuickCheck(e, h)}
                      className="shrink-0 w-4 h-4 rounded border-2 transition-all duration-150 hover:scale-110"
                      style={{ borderColor: h.color, background: 'transparent' }}
                    />
                  ) : (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 ml-0.5"
                      style={{ background: h.color, boxShadow: `0 0 0 3px color-mix(in oklch, ${h.color} 15%, transparent)` }}
                    />
                  )}

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
