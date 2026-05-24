import { useMemo, useState, useEffect } from 'react'
import { Flame, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { buildRegistrosMap, calcStreak, calcMaxStreak, calcMonthPct, toISODate, isScheduled } from './habitosUtils'

export default function HabitosRightPanel({ selectedId, onEdit, forceVisible = false }) {
  const lang             = useStore(s => s.lang)
  const habitos          = useStore(s => s.habitos)
  const habitosRegistros = useStore(s => s.habitosRegistros)
  const deleteHabito     = useStore(s => s.deleteHabito)
  const showToast        = useStore(s => s.showToast)

  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => { setConfirmDelete(false) }, [selectedId])

  const habito = habitos.find(h => h.id === selectedId)

  if (!habito) {
    return (
      <aside
        className={`${forceVisible ? 'flex' : 'hidden xl:flex'} w-[260px] shrink-0 h-full items-center justify-center`}
        style={{ borderLeft: forceVisible ? 'none' : '1px solid var(--border)' }}
      >
        <p className="text-[12px] text-center px-6" style={{ color: 'var(--mute)' }}>
          Seleccioná un hábito para ver el detalle
        </p>
      </aside>
    )
  }

  const registrosMap = useMemo(() => buildRegistrosMap(habitosRegistros), [habitosRegistros])
  const today        = new Date()
  const year         = today.getFullYear()
  const month        = today.getMonth()

  const streak    = calcStreak(habito, registrosMap)
  const maxStreak = calcMaxStreak(habito, registrosMap)
  const pctMes    = calcMonthPct(habito, registrosMap, year, month)
  const pctColor  = pctMes >= 80 ? 'var(--success)' : pctMes >= 50 ? 'var(--warning)' : 'var(--danger)'

  // Recent registros (last 10)
  const recentRegs = habitosRegistros
    .filter(r => r.habito_id === habito.id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 10)

  // Sparkline: last 30 days (scheduled days only)
  const sparkDays = useMemo(() => {
    const days = []
    const t0 = new Date(today); t0.setHours(0,0,0,0)
    for (let i = 29; i >= 0; i--) {
      const d = new Date(t0); d.setDate(t0.getDate() - i)
      if (!isScheduled(habito, d)) continue
      const dateStr = toISODate(d)
      const reg = registrosMap[`${habito.id}-${dateStr}`]
      days.push({ dateStr, valor: reg ? reg.valor : 0, isFuture: false })
    }
    return days
  }, [habito, registrosMap])

  return (
    <aside
      className={`${forceVisible ? 'flex' : 'hidden xl:flex'} flex-col w-[260px] shrink-0 h-full overflow-y-auto`}
      style={{ borderLeft: forceVisible ? 'none' : '1px solid var(--border)' }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-2 mb-3">
          <span
            className="w-3 h-3 rounded-full shrink-0 mt-1"
            style={{ background: habito.color }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold serif italic" style={{ color: 'var(--text)' }}>
              {habito.nombre}
            </div>
            {habito.categoria && (
              <div className="chip mt-1" style={{ fontSize: 10 }}>{habito.categoria}</div>
            )}
          </div>
        </div>

        {habito.descripcion && (
          <p className="text-[12px] mb-4 leading-relaxed" style={{ color: 'var(--subtext)' }}>
            {habito.descripcion}
          </p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-xl border p-2.5 text-center" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-center gap-0.5 text-[18px] font-semibold tnum" style={{ color: 'var(--warning)' }}>
              <Flame size={14} />
              {streak}
            </div>
            <div className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: 'var(--subtext)' }}>
              Racha
            </div>
          </div>
          <div className="rounded-xl border p-2.5 text-center" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[18px] font-semibold tnum" style={{ color: pctColor }}>
              {pctMes}%
            </div>
            <div className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: 'var(--subtext)' }}>
              Este mes
            </div>
          </div>
          <div className="rounded-xl border p-2.5 text-center" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[18px] font-semibold tnum" style={{ color: 'var(--text)' }}>
              {maxStreak}
            </div>
            <div className="text-[9px] uppercase tracking-wide mt-0.5" style={{ color: 'var(--subtext)' }}>
              Máxima
            </div>
          </div>
        </div>

        {/* Frecuencia */}
        <div className="mb-4">
          <div className="label mb-1">Frecuencia</div>
          <div className="text-[12px]" style={{ color: 'var(--text)' }}>
            {habito.frecuencia_tipo === 'diario' ? 'Todos los días' : (() => {
              const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
              try {
                const dias = JSON.parse(habito.dias_semana || '[]')
                return dias.map(d => DIAS[d]).join(', ') || 'Sin días'
              } catch { return 'Sin días' }
            })()}
            {habito.hora && <span className="ml-1.5 mono text-[11px]" style={{ color: 'var(--subtext)' }}>· {habito.hora}</span>}
          </div>
        </div>

        {/* Sparkline últimos 30 días programados */}
        {sparkDays.length > 0 && (
          <div className="mb-4">
            <div className="label mb-2">Últimos 30 días</div>
            <div className="flex items-end gap-0.5 h-6">
              {sparkDays.map(({ dateStr, valor }) => (
                <div
                  key={dateStr}
                  title={`${dateStr.slice(5).replace('-','/')}: ${valor >= 1 ? 'Total' : valor > 0 ? 'Parcial' : 'Sin completar'}`}
                  className="flex-1 rounded-sm min-w-[3px] transition-all"
                  style={{
                    height: valor >= 1 ? '100%' : valor > 0 ? '55%' : '18%',
                    background: valor >= 1
                      ? habito.color
                      : valor > 0
                      ? 'var(--warning)'
                      : 'var(--border)',
                    opacity: valor > 0 ? 1 : 0.5,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Recent logs */}
        <div className="mb-4">
          <div className="label mb-2">{t(lang, 'habitosRegistros')}</div>
          {recentRegs.length === 0 ? (
            <p className="text-[12px]" style={{ color: 'var(--mute)' }}>{t(lang, 'habitosSinRegistros')}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recentRegs.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: r.valor >= 1 ? 'var(--success)' : 'var(--warning)' }}
                  />
                  <span className="text-[11px] mono" style={{ color: 'var(--subtext)' }}>
                    {r.fecha.slice(5).replace('-', '/')}
                  </span>
                  {r.nota && (
                    <span className="text-[11px] truncate flex-1" style={{ color: 'var(--text-2)' }}>
                      {r.nota}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {confirmDelete ? (
          <div
            className="rounded-xl p-3 flex flex-col gap-2 border"
            style={{ borderColor: 'color-mix(in oklch, var(--danger) 40%, transparent)', background: 'color-mix(in oklch, var(--danger) 8%, transparent)' }}
          >
            <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: 'var(--danger)' }}>
              <AlertTriangle size={13} />
              ¿Eliminar "{habito.nombre}"?
            </div>
            <div className="text-[11px]" style={{ color: 'var(--subtext)' }}>
              Se borrarán todos sus registros. Esta acción no se puede deshacer.
            </div>
            <div className="flex gap-2 mt-1">
              <button
                className="flex-1 btn"
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </button>
              <button
                className="flex-1 py-1.5 px-3 rounded-lg text-[12px] font-semibold text-white transition-opacity"
                style={{ background: 'var(--danger)' }}
                onClick={() => { deleteHabito(habito.id); showToast(`"${habito.nombre}" eliminado`); setConfirmDelete(false) }}
              >
                Eliminar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => onEdit(habito)}
              className="flex-1 btn flex items-center justify-center gap-1.5"
            >
              <Pencil size={13} />
              Editar
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="icon-btn w-9 h-9"
              style={{ color: 'var(--danger)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
