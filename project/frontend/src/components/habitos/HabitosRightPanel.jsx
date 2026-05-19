import { Flame, Pencil, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { buildRegistrosMap, calcStreak, calcMonthPct, toISODate } from './habitosUtils'

export default function HabitosRightPanel({ selectedId, onEdit }) {
  const lang             = useStore(s => s.lang)
  const habitos          = useStore(s => s.habitos)
  const habitosRegistros = useStore(s => s.habitosRegistros)
  const deleteHabito     = useStore(s => s.deleteHabito)

  const habito = habitos.find(h => h.id === selectedId)

  if (!habito) {
    return (
      <aside
        className="hidden xl:flex w-[260px] shrink-0 h-full items-center justify-center"
        style={{ borderLeft: '1px solid var(--border)' }}
      >
        <p className="text-[12px] text-center px-6" style={{ color: 'var(--mute)' }}>
          Seleccioná un hábito para ver el detalle
        </p>
      </aside>
    )
  }

  const registrosMap = buildRegistrosMap(habitosRegistros)
  const today        = new Date()
  const year         = today.getFullYear()
  const month        = today.getMonth()

  const streak    = calcStreak(habito, registrosMap)
  const pctMes    = calcMonthPct(habito, registrosMap, year, month)
  const pctColor  = pctMes >= 80 ? 'var(--success)' : pctMes >= 50 ? 'var(--warning)' : 'var(--danger)'

  // Recent registros (last 10, with nota)
  const recentRegs = habitosRegistros
    .filter(r => r.habito_id === habito.id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 10)

  // Max streak
  let maxStreak = 0
  let cur = 0
  const allDates = habitosRegistros
    .filter(r => r.habito_id === habito.id && r.valor > 0)
    .map(r => r.fecha)
    .sort()
  for (let i = 0; i < allDates.length; i++) {
    if (i === 0) { cur = 1; maxStreak = 1; continue }
    const prev = new Date(allDates[i-1])
    const curr = new Date(allDates[i])
    const diff = (curr - prev) / 86400000
    cur = diff === 1 ? cur + 1 : 1
    if (cur > maxStreak) maxStreak = cur
  }

  return (
    <aside
      className="hidden xl:flex xl:flex-col w-[260px] shrink-0 h-full overflow-y-auto"
      style={{ borderLeft: '1px solid var(--border)' }}
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
        <div className="flex gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => onEdit(habito)}
            className="flex-1 btn flex items-center justify-center gap-1.5"
          >
            <Pencil size={13} />
            Editar
          </button>
          <button
            onClick={() => { if (window.confirm(`¿Eliminar "${habito.nombre}"?`)) deleteHabito(habito.id) }}
            className="icon-btn w-9 h-9"
            style={{ color: 'var(--danger)' }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}
