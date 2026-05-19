import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { fmtARS, isTransferencia } from '../../data/finanzas'
import { buildMonthly, computeInflAcum } from './AnualTab'

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_ES  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const SHORT_EN  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Editable inflation cell ───────────────────────────────────────────────────

function InflCell({ mes, value, lang }) {
  const upsert   = useStore(s => s.upsertFinInflacion)
  const [editing, setEditing] = useState(false)
  const [val,     setVal    ] = useState('')

  const commit = () => {
    const trimmed = val.trim()
    const parsed  = trimmed === '' ? null : parseFloat(trimmed.replace(',', '.'))
    upsert(mes, isNaN(parsed) ? null : parsed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        type="number" autoFocus step="0.1" value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        style={{
          background: 'transparent', border: 'none', outline: 'none',
          color: 'var(--accent)', fontFamily: 'var(--font-mono)',
          fontSize: 11, textAlign: 'right', width: 52,
        }}
      />
    )
  }

  return (
    <span
      onClick={() => { setVal(value !== null ? String(value) : ''); setEditing(true) }}
      title={lang === 'en' ? 'Click to edit' : 'Clic para editar'}
      style={{
        cursor: 'text', fontSize: 11, fontFamily: 'var(--font-mono)',
        color: value !== null ? 'var(--text)' : 'var(--mute)',
        borderBottom: '1px dotted var(--subtext)',
        paddingBottom: 1,
      }}
    >
      {value !== null ? `${value.toFixed(1)}%` : '—'}
    </span>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--subtext)', marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AnualRightPanel() {
  const lang              = useStore(s => s.lang)
  const selectedMes       = useStore(s => s.selectedMes)
  const finMovimientosAll = useStore(s => s.finMovimientosAll)
  const finInflacion      = useStore(s => s.finInflacion)

  const year     = selectedMes.split('-')[0]
  const prevYear = String(parseInt(year) - 1)

  const monthlyData     = useMemo(() => buildMonthly(finMovimientosAll, year),     [finMovimientosAll, year])
  const prevMonthlyData = useMemo(() => buildMonthly(finMovimientosAll, prevYear), [finMovimientosAll, prevYear])

  const now           = new Date()
  const isCurrentYear = String(now.getFullYear()) === year
  const currentMonthIdx = now.getMonth()

  // Highlights
  const withData    = monthlyData.filter(d => d.hasData)
  const bestMonth   = withData.length > 0 ? withData.reduce((a, b) => b.ahorro > a.ahorro ? b : a) : null
  const worstMonth  = withData.length > 0 ? withData.reduce((a, b) => b.ahorro < a.ahorro ? b : a) : null
  const posMonths   = withData.filter(d => d.ahorro >= 0).length
  const negMonths   = withData.filter(d => d.ahorro <  0).length

  // Year-over-year
  const yearTotals = useMemo(() => {
    const ingresos = monthlyData.reduce((a, m) => a + m.ingresos, 0)
    const gastos   = monthlyData.reduce((a, m) => a + m.gastos,   0)
    return { ingresos, gastos, ahorro: ingresos - gastos }
  }, [monthlyData])

  const prevTotals = useMemo(() => {
    const ingresos = prevMonthlyData.reduce((a, m) => a + m.ingresos, 0)
    const gastos   = prevMonthlyData.reduce((a, m) => a + m.gastos,   0)
    return { ingresos, gastos, ahorro: ingresos - gastos }
  }, [prevMonthlyData])

  const hasPrevData = prevTotals.ingresos > 0 || prevTotals.gastos > 0

  const yoyPct = (curr, prev) => prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : null

  // Year-end projection
  const ytdData        = isCurrentYear
    ? monthlyData.slice(0, currentMonthIdx + 1).filter(d => d.hasData)
    : []
  const ytdSavings     = ytdData.reduce((a, m) => a + m.ahorro, 0)
  const monthsWithData = ytdData.length
  const projectedYear  = monthsWithData > 0 ? (ytdSavings / monthsWithData) * 12 : null

  // Inflation
  const shortNames    = lang === 'en' ? SHORT_EN : SHORT_ES
  const fullNames     = lang === 'en' ? MONTHS_EN : MONTHS_ES
  const inflAcum      = computeInflAcum(finInflacion, year)
  const hasInflacion  = Object.keys(finInflacion).some(k => k.startsWith(year))

  const divider = <hr style={{ borderColor: 'var(--border)', margin: 0 }} />

  return (
    <aside
      className="w-[272px] shrink-0 h-full overflow-y-auto panel-scroll"
      style={{ borderLeft: '1px solid var(--border)', background: 'var(--panel-bg)' }}
    >
      <div className="p-4 flex flex-col gap-5">

        {/* Highlights */}
        <div>
          <SectionLabel>{lang === 'en' ? 'Year highlights' : 'Highlights del año'}</SectionLabel>

          {withData.length === 0 ? (
            <p style={{ fontSize: 11, color: 'var(--subtext)' }}>
              {lang === 'en' ? 'No data for this year.' : 'Sin datos para este año.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Best month */}
              {bestMonth && (
                <div
                  className="rounded-lg border p-2.5"
                  style={{
                    borderColor: 'color-mix(in oklch, var(--income) 30%, var(--border))',
                    background: 'color-mix(in oklch, var(--income) 6%, transparent)',
                  }}
                >
                  <div style={{ fontSize: 9, color: 'var(--income)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    ↑ {lang === 'en' ? 'Best month' : 'Mejor mes'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                    {fullNames[bestMonth.idx]}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--income)', marginTop: 1 }}>
                    {fmtARS(bestMonth.ahorro)}
                  </div>
                </div>
              )}

              {/* Worst month */}
              {worstMonth && (
                <div
                  className="rounded-lg border p-2.5"
                  style={{
                    borderColor: worstMonth.ahorro < 0
                      ? 'color-mix(in oklch, var(--expense) 30%, var(--border))'
                      : 'var(--border)',
                    background: worstMonth.ahorro < 0
                      ? 'color-mix(in oklch, var(--expense) 6%, transparent)'
                      : 'transparent',
                  }}
                >
                  <div style={{ fontSize: 9, color: 'var(--subtext)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    ↓ {lang === 'en' ? 'Worst month' : 'Peor mes'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                    {fullNames[worstMonth.idx]}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: worstMonth.ahorro < 0 ? 'var(--expense)' : 'var(--subtext)', marginTop: 1 }}>
                    {fmtARS(worstMonth.ahorro)}
                  </div>
                </div>
              )}

              {/* Surplus / Deficit counters */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: lang === 'en' ? 'Surplus' : 'Superávit', count: posMonths, color: 'var(--income)'  },
                  { key: lang === 'en' ? 'Deficit' : 'Déficit',   count: negMonths, color: negMonths > 0 ? 'var(--expense)' : 'var(--text)' },
                ].map(({ key, count, color }) => (
                  <div key={key} className="rounded-lg border p-2 text-center" style={{ borderColor: 'var(--border)' }}>
                    <div style={{ fontSize: 8, color: 'var(--subtext)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{key}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.1 }}>{count}</div>
                    <div style={{ fontSize: 9, color: 'var(--subtext)' }}>{lang === 'en' ? 'months' : 'meses'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {divider}

        {/* Year over year */}
        {hasPrevData && (
          <>
            <div>
              <SectionLabel>vs {prevYear}</SectionLabel>
              <div className="flex flex-col gap-2">
                {[
                  { label: lang === 'en' ? 'Income'   : 'Ingresos', curr: yearTotals.ingresos, prev: prevTotals.ingresos, positiveIsGood: true  },
                  { label: lang === 'en' ? 'Expenses' : 'Gastos',   curr: yearTotals.gastos,   prev: prevTotals.gastos,   positiveIsGood: false },
                  { label: lang === 'en' ? 'Savings'  : 'Ahorrado', curr: yearTotals.ahorro,   prev: prevTotals.ahorro,   positiveIsGood: true  },
                ].map(({ label, curr, prev, positiveIsGood }) => {
                  const pct    = yoyPct(curr, prev)
                  const isGood = pct !== null && (positiveIsGood ? pct >= 0 : pct <= 0)
                  const color  = pct === null ? 'var(--subtext)' : isGood ? '#22c55e' : '#ef4444'
                  return (
                    <div key={label} className="flex items-center justify-between">
                      <span style={{ fontSize: 11, color: 'var(--text)' }}>{label}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>
                        {pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            {divider}
          </>
        )}

        {/* Year-end projection */}
        {isCurrentYear && projectedYear !== null && monthsWithData > 0 && (
          <>
            <div>
              <SectionLabel>{lang === 'en' ? 'Year-end projection' : 'Proyección de cierre'}</SectionLabel>
              <div style={{ fontSize: 10, color: 'var(--subtext)', marginBottom: 6 }}>
                {lang === 'en' ? 'At current pace' : 'A este ritmo'}
              </div>
              <div
                className="serif italic font-semibold tnum"
                style={{
                  fontSize: 22,
                  color: projectedYear >= 0 ? 'var(--text)' : '#ef4444',
                  lineHeight: 1,
                }}
              >
                {fmtARS(projectedYear)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--subtext)', marginTop: 4 }}>
                {lang === 'en'
                  ? `projected savings this year (${monthsWithData} mo. of data)`
                  : `ahorrados este año (${monthsWithData} ${monthsWithData === 1 ? 'mes' : 'meses'} con datos)`}
              </div>
            </div>
            {divider}
          </>
        )}

        {/* Inflation input table */}
        <div>
          <SectionLabel>{lang === 'en' ? 'Monthly inflation' : 'Inflación mensual'}</SectionLabel>
          <div style={{ fontSize: 10, color: 'var(--subtext)', marginBottom: 8 }}>
            {lang === 'en' ? 'Click to edit each month' : 'Clic para editar cada mes'}
          </div>

          <div className="flex flex-col">
            {Array.from({ length: 12 }, (_, i) => {
              const mes      = `${year}-${String(i + 1).padStart(2, '0')}`
              const inflacion = finInflacion[mes] ?? null
              return (
                <div
                  key={mes}
                  className="flex items-center justify-between px-1.5 py-1 rounded-md"
                  style={{
                    background: i % 2 === 0
                      ? 'transparent'
                      : 'color-mix(in oklch, var(--surface) 40%, transparent)',
                  }}
                >
                  <span style={{ fontSize: 11, color: 'var(--subtext)', fontFamily: 'var(--font-mono)' }}>
                    {shortNames[i]}
                  </span>
                  <InflCell mes={mes} value={inflacion} lang={lang} />
                </div>
              )
            })}
          </div>

          {/* Accumulated total */}
          {hasInflacion && (
            <div
              className="mt-3 flex items-center justify-between px-2.5 py-2 rounded-xl border"
              style={{
                borderColor: 'color-mix(in oklch, var(--accent) 30%, var(--border))',
                background: 'color-mix(in oklch, var(--accent) 8%, transparent)',
              }}
            >
              <span style={{ fontSize: 10, color: 'var(--subtext)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {lang === 'en' ? 'Accumulated' : 'Acumulada'}
              </span>
              <span
                className="serif italic font-semibold tnum"
                style={{ fontSize: 16, color: 'var(--accent)' }}
              >
                {inflAcum.toFixed(1)}%
              </span>
            </div>
          )}
        </div>

      </div>
    </aside>
  )
}
