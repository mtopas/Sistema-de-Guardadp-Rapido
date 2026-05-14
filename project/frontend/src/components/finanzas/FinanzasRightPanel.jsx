import { useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtARS, isTransferencia } from '../../data/finanzas'

// ── helpers ──────────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color = 'var(--accent)', bg = 'var(--surface)' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="relative h-2 rounded-full overflow-hidden" style={{ background: bg }}>
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

function KpiBox({ label, value, sub, valueColor }) {
  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-0.5"
      style={{ borderColor: 'var(--border)', background: 'color-mix(in oklch, var(--bg) 60%, transparent)' }}
    >
      <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--subtext)' }}>
        {label}
      </div>
      <div
        className="serif italic font-semibold tnum leading-tight"
        style={{ fontSize: 17, color: valueColor ?? 'var(--text)' }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10.5px] mono" style={{ color: 'var(--subtext)' }}>{sub}</div>
      )}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function FinanzasRightPanel() {
  const lang               = useStore(s => s.lang)
  const finMovimientos     = useStore(s => s.finMovimientos)
  const finConfig          = useStore(s => s.finConfig)
  const finEmergenciaSaldo = useStore(s => s.finEmergenciaSaldo)
  const selectedMes        = useStore(s => s.selectedMes)

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const expenses = finMovimientos.filter(m => (m.type ?? m.tipo) === 'expense' && !isTransferencia(m))
    const incomes  = finMovimientos.filter(m => (m.type ?? m.tipo) === 'income'  && !isTransferencia(m))

    const totalGastos   = expenses.reduce((a, m) => a + Math.abs(m.amount ?? m.monto ?? 0), 0)
    const totalIngresos = incomes.reduce((a, m)  => a + Math.abs(m.amount ?? m.monto ?? 0), 0)

    // Days elapsed in selected month
    const [year, month] = selectedMes.split('-').map(Number)
    const daysInMonth   = new Date(year, month, 0).getDate()
    const now           = new Date()
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
    const daysElapsed   = isCurrentMonth ? now.getDate() : daysInMonth

    const avgDaily = daysElapsed > 0 ? totalGastos / daysElapsed : 0

    // Top category
    const catMap = {}
    expenses.forEach(m => {
      const cat = m.cat ?? m.categoria_nombre ?? 'Otros'
      catMap[cat] = (catMap[cat] ?? 0) + Math.abs(m.amount ?? m.monto ?? 0)
    })
    const topEntry  = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0]
    const topCat    = topEntry ? topEntry[0] : '—'
    const topCatPct = topEntry && totalGastos > 0
      ? Math.round((topEntry[1] / totalGastos) * 100)
      : 0

    // Savings rate
    const tasaAhorro = totalIngresos > 0
      ? Math.round(((totalIngresos - totalGastos) / totalIngresos) * 100)
      : 0

    // No-spend days
    const spendDays     = new Set(expenses.map(m => (m.fecha ?? '').slice(0, 10)).filter(Boolean))
    const diasSinGastar = Math.max(0, daysElapsed - spendDays.size)

    return { avgDaily, topCat, topCatPct, tasaAhorro, diasSinGastar, totalGastos, totalIngresos }
  }, [finMovimientos, selectedMes])

  // ── Goals ─────────────────────────────────────────────────────────────────
  const tasaObjetivo      = Number(finConfig?.tasa_ahorro_objetivo ?? 40)
  const fondoMeta         = Number(finConfig?.fondo_emergencia_meta ?? 500000)
  const fireOk            = kpis.tasaAhorro >= tasaObjetivo

  const savingsColor = fireOk ? 'var(--income)' : 'var(--expense)'

  return (
    <aside
      className="w-[260px] shrink-0 h-full overflow-y-auto panel-scroll"
      style={{ borderLeft: '1px solid var(--border)', background: 'var(--sidebar)' }}
    >
      <div className="p-4 flex flex-col gap-5">

        {/* ── KPIs ── */}
        <div>
          <div className="label mb-3">{t(lang, 'kpisTitle')}</div>
          <div className="grid grid-cols-2 gap-2">
            <KpiBox
              label={t(lang, 'avgDaily')}
              value={fmtARS(kpis.avgDaily)}
              sub="/ día"
              valueColor="var(--expense)"
            />
            <KpiBox
              label={t(lang, 'topCategory')}
              value={kpis.topCat}
              sub={kpis.topCatPct > 0 ? `${kpis.topCatPct}% ${t(lang, 'ofTotal')}` : undefined}
            />
            <KpiBox
              label={t(lang, 'savingsRate')}
              value={`${kpis.tasaAhorro}%`}
              sub={`obj. ${tasaObjetivo}%`}
              valueColor={savingsColor}
            />
            <KpiBox
              label={t(lang, 'daysWithoutSpending')}
              value={String(kpis.diasSinGastar)}
              sub={t(lang, 'thisMonth')}
            />
          </div>
        </div>

        <hr className="divider" />

        {/* ── Metas ── */}
        <div>
          <div className="label mb-3">{t(lang, 'goalsTitle')}</div>

          {/* Goal 1: Ahorro FIRE */}
          <div className="flex flex-col gap-2 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium" style={{ color: 'var(--text)' }}>
                {t(lang, 'goalFire')}
              </span>
              {fireOk && (
                <span className="text-[10px] chip" style={{ color: 'var(--income)', borderColor: 'color-mix(in oklch, var(--income) 30%, transparent)', background: 'color-mix(in oklch, var(--income) 10%, transparent)' }}>
                  ✓ OK
                </span>
              )}
            </div>
            <ProgressBar
              value={kpis.tasaAhorro}
              max={tasaObjetivo}
              color={savingsColor}
            />
            <div className="flex justify-between text-[10.5px] mono tnum" style={{ color: 'var(--subtext)' }}>
              <span style={{ color: savingsColor }}>{kpis.tasaAhorro}%</span>
              <span>{t(lang, 'goalOf')} {tasaObjetivo}% {t(lang, 'objective')}</span>
            </div>
            <div className="text-[10px]" style={{ color: 'var(--subtext)' }}>
              {t(lang, 'goalFireDesc')}
            </div>
          </div>

          {/* Goal 2: Fondo de emergencia */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium" style={{ color: 'var(--text)' }}>
                {t(lang, 'goalEmergency')}
              </span>
              {finEmergenciaSaldo >= fondoMeta && (
                <span className="text-[10px] chip" style={{ color: 'var(--income)', borderColor: 'color-mix(in oklch, var(--income) 30%, transparent)', background: 'color-mix(in oklch, var(--income) 10%, transparent)' }}>
                  ✓ OK
                </span>
              )}
            </div>
            <ProgressBar
              value={finEmergenciaSaldo}
              max={fondoMeta}
              color="var(--accent)"
            />
            <div className="flex justify-between text-[10.5px] mono tnum" style={{ color: 'var(--subtext)' }}>
              <span className="gradient-text font-semibold">{fmtARS(finEmergenciaSaldo)}</span>
              <span>{t(lang, 'goalOf')} {fmtARS(fondoMeta)}</span>
            </div>
            <div className="text-[10px]" style={{ color: 'var(--subtext)' }}>
              {t(lang, 'goalEmergencyDesc')}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
