import { useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { FINANZAS, fmtARS, isTransferencia } from '../../data/finanzas'
import { BRANCH_COLORS as B } from '../../utils/themes'

// Palette fallback for dynamic categories
const PALETTE = [B[0], B[1], B[2], B[3], B[5], B[6], B[7], B[8], B[9] ?? '#888']

function buildCategories(movimientos, type) {
  const filtered = movimientos.filter(m => {
    const t = m.type ?? m.tipo
    return t === type && !isTransferencia(m)
  })

  if (filtered.length === 0) {
    // use mock data
    const mockData = type === 'income' ? (FINANZAS.ingresosCategorias ?? []) : FINANZAS.categorias
    const total = mockData.reduce((a, c) => a + c.amount, 0)
    return { cats: mockData, total }
  }

  const map = {}
  filtered.forEach(m => {
    const cat = m.cat ?? m.categoria_nombre ?? 'Otros'
    const amt = Math.abs(m.amount ?? m.monto ?? 0)
    if (!map[cat]) map[cat] = { name: cat, amount: 0 }
    map[cat].amount += amt
  })

  const entries = Object.values(map).sort((a, b) => b.amount - a.amount)
  const total = entries.reduce((a, c) => a + c.amount, 0)
  const cats = entries.map((c, i) => ({
    ...c,
    color: c.color ?? PALETTE[i % PALETTE.length],
    pct: total > 0 ? Math.round((c.amount / total) * 100) : 0,
  }))

  return { cats, total }
}

function mesLabel(selectedMes, lang) {
  const [year, month] = selectedMes.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-AR', { month: 'long', year: 'numeric' })
}

export default function DonutCard({ type = 'expense' }) {
  const lang         = useStore(s => s.lang)
  const selectedMes  = useStore(s => s.selectedMes)
  const finMovimientos = useStore(s => s.finMovimientos)

  const { cats, total } = useMemo(
    () => buildCategories(finMovimientos, type),
    [finMovimientos, type]
  )

  const title = type === 'income' ? t(lang, 'incomesByCategory') : t(lang, 'expensesByCategory')
  const accentColor = type === 'income' ? 'var(--income)' : 'var(--expense)'

  const R = 46
  const SW = 10
  const C = 2 * Math.PI * R
  let acc = 0

  return (
    <div className="panel-strong p-5 h-full flex gap-5 items-center">
      {/* Left: donut */}
      <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
        <svg viewBox="0 0 100 100" width="160" height="160" className="-rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface)" strokeWidth={SW} />
          {cats.map((c, i) => {
            const dash   = (c.pct / 100) * C
            const offset = -((acc / 100) * C)
            acc += c.pct
            return (
              <circle
                key={i}
                cx="50" cy="50" r={R}
                fill="none"
                stroke={c.color}
                strokeWidth={SW}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            )
          })}
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--subtext)' }}>Total</div>
          <div
            className="serif italic font-semibold tnum leading-tight"
            style={{ fontSize: 15, color: accentColor }}
          >
            {fmtARS(total)}
          </div>
        </div>
      </div>

      {/* Right: title + legend */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div>
          <div className="label mb-0.5">{mesLabel(selectedMes, lang)}</div>
          <div
            className="serif italic font-semibold leading-tight"
            style={{ fontSize: 15, color: 'var(--text)' }}
          >
            {title}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 mt-1">
          {cats.map((c, i) => (
            <div key={c.name} className="flex items-center gap-2">
              <span
                className="shrink-0 rounded-sm"
                style={{ width: 8, height: 8, background: c.color }}
              />
              <span className="flex-1 truncate text-[12px]" style={{ color: 'var(--text)' }}>
                {c.name}
              </span>
              <span className="mono tnum text-[11px] shrink-0" style={{ color: 'var(--subtext)', minWidth: 28, textAlign: 'right' }}>
                {c.pct}%
              </span>
              <span className="tnum text-[11px] shrink-0" style={{ color: 'var(--text)', minWidth: 72, textAlign: 'right' }}>
                {fmtARS(c.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
