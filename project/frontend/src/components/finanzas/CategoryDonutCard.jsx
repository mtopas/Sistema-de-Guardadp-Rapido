import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtARS } from '../../data/finanzas'
import { buildCategories } from '../../data/finCategoriaColors'

export { buildCategories } from '../../data/finCategoriaColors'

function mesLabel(selectedMes, lang) {
  const [year, month] = selectedMes.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-AR', { month: 'long', year: 'numeric' })
}

export default function DonutCard({ type = 'expense', activeCat = null, onFilterCat }) {
  const lang         = useStore(s => s.lang)
  const selectedMes  = useStore(s => s.selectedMes)
  const finMovimientos = useStore(s => s.finMovimientos)
  const finCategorias  = useStore(s => s.finCategorias)

  const { cats, total } = useMemo(
    () => buildCategories(finMovimientos, type, finCategorias),
    [finMovimientos, type, finCategorias]
  )

  const title = type === 'income' ? t(lang, 'incomesByCategory') : t(lang, 'expensesByCategory')
  const accentColor = type === 'income' ? 'var(--income)' : 'var(--expense)'

  const [hoveredCat, setHoveredCat] = useState(null)
  const hoveredData = hoveredCat != null ? cats[hoveredCat] : null

  const handleSegmentClick = (catName) => {
    if (onFilterCat) onFilterCat(activeCat === catName ? null : catName)
  }

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
            const dash      = (c.pct / 100) * C
            const offset    = -((acc / 100) * C)
            acc += c.pct
            const isHovered = hoveredCat === i
            const isActive  = activeCat === c.name
            return (
              <circle
                key={i}
                cx="50" cy="50" r={R}
                fill="none"
                stroke={c.color}
                strokeWidth={isHovered || isActive ? SW + 3 : SW}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                style={{
                  cursor: 'pointer',
                  transition: 'stroke-width 0.15s ease, opacity 0.15s ease',
                  opacity: (hoveredCat != null && !isHovered) || (activeCat && !isActive) ? 0.35 : 1,
                }}
                onMouseEnter={() => setHoveredCat(i)}
                onMouseLeave={() => setHoveredCat(null)}
                onClick={() => handleSegmentClick(c.name)}
                role="button"
                aria-label={`Filtrar por ${c.name}`}
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && handleSegmentClick(c.name)}
              />
            )
          })}
        </svg>
        {/* Center label — shows hovered category or total */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {hoveredData ? (
            <>
              <div className="text-[9px] uppercase tracking-wider truncate max-w-[80px] text-center"
                style={{ color: hoveredData.color }}>
                {hoveredData.name}
              </div>
              <div className="serif italic font-semibold tnum leading-tight"
                style={{ fontSize: 14, color: hoveredData.color }}>
                {fmtARS(hoveredData.amount)}
              </div>
              <div className="text-[10px] tnum" style={{ color: 'var(--subtext)' }}>
                {hoveredData.pct}%
              </div>
            </>
          ) : (
            <>
              <div className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--subtext)' }}>Total</div>
              <div className="serif italic font-semibold tnum leading-tight"
                style={{ fontSize: 15, color: accentColor }}>
                {fmtARS(total)}
              </div>
            </>
          )}
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

        {activeCat && (
          <button
            type="button"
            onClick={() => onFilterCat?.(null)}
            className="text-[10.5px] px-2 py-0.5 rounded-md mb-1"
            style={{ background: 'color-mix(in oklch, var(--accent) 12%, transparent)', color: 'var(--accent)', border: 'none', cursor: 'pointer' }}
          >
            ✕ {activeCat}
          </button>
        )}
        <div className="flex flex-col gap-1.5 mt-1">
          {cats.map((c, i) => {
            const isActive = activeCat === c.name
            return (
              <div
                key={c.name}
                role="button"
                tabIndex={0}
                className="flex items-center gap-2 rounded-lg px-1 transition-all"
                style={{
                  cursor: 'pointer',
                  opacity: (hoveredCat != null && hoveredCat !== i) || (activeCat && !isActive) ? 0.45 : 1,
                  background: hoveredCat === i || isActive ? `color-mix(in oklch, ${c.color} 10%, transparent)` : 'transparent',
                  outline: isActive ? `1.5px solid ${c.color}` : 'none',
                }}
                onMouseEnter={() => setHoveredCat(i)}
                onMouseLeave={() => setHoveredCat(null)}
                onClick={() => handleSegmentClick(c.name)}
                onKeyDown={e => e.key === 'Enter' && handleSegmentClick(c.name)}
              >
                <span className="shrink-0 rounded-sm" style={{ width: 8, height: 8, background: c.color }} />
                <span className="flex-1 truncate text-[12px]" style={{ color: 'var(--text)' }}>{c.name}</span>
                <span className="mono tnum text-[11px] shrink-0" style={{ color: 'var(--subtext)', minWidth: 28, textAlign: 'right' }}>
                  {c.pct}%
                </span>
                <span className="tnum text-[11px] shrink-0" style={{ color: 'var(--text)', minWidth: 72, textAlign: 'right' }}>
                  {fmtARS(c.amount)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
