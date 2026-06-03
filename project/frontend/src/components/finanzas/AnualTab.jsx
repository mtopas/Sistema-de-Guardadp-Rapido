import { useState, useMemo, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { fmtARS, isTransferencia, movimientoAnio } from '../../data/finanzas'
import { buildFinCategoriaColorByName, getFinCategoriaColor } from '../../data/finCategoriaColors'
import CardHeader from './CardHeader'

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_ES  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const SHORT_EN  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtShort(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

function fmtPct(n, decimals = 1) {
  return `${n >= 0 ? '' : '-'}${Math.abs(n).toFixed(decimals)}%`
}

export function buildMonthly(movimientos, year) {
  const months = Array.from({ length: 12 }, (_, i) => ({
    mes: `${year}-${String(i + 1).padStart(2, '0')}`,
    idx: i,
    ingresos: 0,
    gastos: 0,
  }))
  movimientos.forEach(m => {
    if (isTransferencia(m)) return
    const tipo  = m.type  ?? m.tipo
    if (movimientoAnio(m) !== String(year)) return
    if (tipo !== 'income' && tipo !== 'expense') return
    const raw   = m.date ?? m.fecha ?? ''
    const idx   = parseInt(String(raw).slice(5, 7), 10) - 1
    if (idx < 0 || idx > 11) return
    const monto = Math.abs(m.amount ?? m.monto ?? 0)
    if (tipo === 'income') months[idx].ingresos += monto
    else                   months[idx].gastos   += monto
  })
  return months.map(m => ({
    ...m,
    ahorro:  m.ingresos - m.gastos,
    tasa:    m.ingresos > 0 ? ((m.ingresos - m.gastos) / m.ingresos) * 100 : 0,
    hasData: m.ingresos > 0 || m.gastos > 0,
  }))
}

export function computeDeflators(inflMap, year) {
  const deflators = []
  let cumul = 1
  for (let i = 0; i < 12; i++) {
    if (i > 0) {
      const mes = `${year}-${String(i + 1).padStart(2, '0')}`
      cumul *= 1 + (inflMap[mes] ?? 0) / 100
    }
    deflators.push(cumul)
  }
  return deflators
}

export function computeInflAcum(inflMap, year) {
  let acum = 1
  for (let i = 1; i < 12; i++) {
    const mes = `${year}-${String(i + 1).padStart(2, '0')}`
    acum *= 1 + (inflMap[mes] ?? 0) / 100
  }
  return (acum - 1) * 100
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function BarChart({ monthlyData, deflators, showReal, lang }) {
  const names = lang === 'en' ? SHORT_EN : SHORT_ES

  const data = monthlyData.map((d, i) => {
    const def = deflators[i]
    return {
      ...d,
      ingresos: showReal ? d.ingresos / def : d.ingresos,
      gastos:   showReal ? d.gastos   / def : d.gastos,
      ahorro:   showReal ? d.ahorro   / def : d.ahorro,
    }
  })

  const maxVal = Math.max(
    ...data.flatMap(d => [d.ingresos, d.gastos, Math.abs(d.ahorro)]),
    1,
  )

  const VW = 580, VH = 190
  const PAD = { t: 8, r: 12, b: 36, l: 52 }
  const cW  = VW - PAD.l - PAD.r
  const cH  = VH - PAD.t - PAD.b

  const groupW = cW / 12
  const barW   = Math.max(5, groupW * 0.19)
  const gap    = Math.max(1.5, groupW * 0.05)

  const scaleH = v => (Math.max(v, 0) / maxVal) * cH
  const scaleY = v => cH - scaleH(v)

  const yTicks = [0, 0.25, 0.5, 0.75, 1]

  const now       = new Date()
  const currentMs = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return (
    <div style={{ position: 'relative' }}>
      {/* Legend */}
      <div
        className="flex items-center gap-4 mb-3"
        style={{ fontSize: 10, color: 'var(--subtext)' }}
      >
        {[
          { color: 'var(--income)',  label: lang === 'en' ? 'Income'   : 'Ingresos' },
          { color: 'var(--expense)', label: lang === 'en' ? 'Expenses' : 'Gastos'   },
          { color: 'var(--accent)',  label: lang === 'en' ? 'Savings'  : 'Ahorro'   },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: color }} />
            {label}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', overflow: 'visible' }}>
        <defs>
          {[
            { id: 'anualInc', color: 'var(--income)'  },
            { id: 'anualExp', color: 'var(--expense)' },
            { id: 'anualSav', color: 'var(--accent)'  },
          ].map(({ id, color }) => (
            <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color} stopOpacity="0.88" />
              <stop offset="100%" stopColor={color} stopOpacity="0.38" />
            </linearGradient>
          ))}
        </defs>

        <g transform={`translate(${PAD.l}, ${PAD.t})`}>
          {/* Grid + Y labels */}
          {yTicks.map(p => (
            <g key={p}>
              <line
                x1={0} y1={cH * (1 - p)} x2={cW} y2={cH * (1 - p)}
                stroke="var(--border)"
                strokeWidth={p === 0 ? 1 : 0.5}
                strokeDasharray={p === 0 ? undefined : '3,3'}
              />
              {p > 0 && (
                <text
                  x={-4} y={cH * (1 - p) + 3}
                  textAnchor="end" fontSize={7}
                  fill="var(--subtext)" fontFamily="var(--font-mono)"
                >
                  {fmtShort(maxVal * p)}
                </text>
              )}
            </g>
          ))}

          {/* Left axis */}
          <line x1={0} y1={0} x2={0} y2={cH} stroke="var(--border)" strokeWidth={1} />

          {/* Bars */}
          {data.map((d, i) => {
            const cx          = i * groupW + groupW / 2
            const totalW      = 3 * barW + 2 * gap
            const startX      = cx - totalW / 2
            const isCurrent   = d.mes === currentMs
            const isFuture    = !d.hasData && d.mes > currentMs
            const opacity     = isFuture ? 0.2 : 1

            const incH = scaleH(d.ingresos)
            const expH = scaleH(d.gastos)
            const savH = scaleH(Math.abs(d.ahorro))

            return (
              <g key={d.mes} opacity={opacity}>
                {incH > 0 && (
                  <rect
                    x={startX} y={cH - incH} width={barW} height={incH}
                    fill="url(#anualInc)" rx={2}
                  />
                )}
                {expH > 0 && (
                  <rect
                    x={startX + barW + gap} y={cH - expH} width={barW} height={expH}
                    fill="url(#anualExp)" rx={2}
                  />
                )}
                {savH > 0 && (
                  <rect
                    x={startX + 2 * (barW + gap)} y={cH - savH} width={barW} height={savH}
                    fill={d.ahorro >= 0 ? 'url(#anualSav)' : 'var(--expense)'}
                    rx={2} opacity={d.ahorro >= 0 ? 1 : 0.55}
                  />
                )}
                {/* Current month marker */}
                {isCurrent && (
                  <circle cx={cx} cy={cH + 22} r={2} fill="var(--accent)" />
                )}
                {/* Month label */}
                <text
                  x={cx} y={cH + 14}
                  textAnchor="middle" fontSize={8}
                  fill={isFuture ? 'var(--mute)' : isCurrent ? 'var(--accent)' : 'var(--subtext)'}
                  fontFamily="var(--font-mono)"
                >
                  {names[i]}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

// ── Summary stat card ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }) {
  return (
    <div
      className="rounded-xl border p-3.5"
      style={{ borderColor: 'var(--border)', background: 'color-mix(in oklch, var(--bg) 50%, transparent)' }}
    >
      <div className="text-[10.5px] mb-1" style={{ color: 'var(--subtext)' }}>{label}</div>
      <div
        className="text-[18px] serif italic font-semibold tnum leading-tight"
        style={{ color: color ?? 'var(--text)' }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] mt-1" style={{ color: 'var(--subtext)' }}>{sub}</div>
      )}
    </div>
  )
}

// ── Month-by-month table ──────────────────────────────────────────────────────

const TH = {
  padding: '6px 8px', fontSize: 10, fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--subtext)', borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap', textAlign: 'right',
  position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
}
const THL = { ...TH, textAlign: 'left' }
const TD  = { padding: '5px 8px', fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right', whiteSpace: 'nowrap' }
const TDL = { ...TD, textAlign: 'left' }

function MonthTable({ monthlyData, inflMap, lang }) {
  const names    = lang === 'en' ? MONTHS_EN : MONTHS_ES
  const now      = new Date()
  const currentMs = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return (
    <div className="panel-strong overflow-hidden">
      <div className="p-4 pb-2">
        <div className="label">{lang === 'en' ? 'Month by month' : 'Mes a mes'}</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={THL}>{lang === 'en' ? 'Month' : 'Mes'}</th>
              <th style={TH}>{lang === 'en' ? 'Income' : 'Ingresos'}</th>
              <th style={TH}>{lang === 'en' ? 'Expenses' : 'Gastos'}</th>
              <th style={TH}>{lang === 'en' ? 'Savings' : 'Ahorrado'}</th>
              <th style={TH}>Tasa%</th>
              <th style={TH}>{lang === 'en' ? 'Inflation%' : 'Inflación%'}</th>
              <th style={TH}>{lang === 'en' ? 'vs prev' : 'vs anterior'}</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map((d, i) => {
              const isCurrent  = d.mes === currentMs
              const isFuture   = d.mes > currentMs && !d.hasData
              const isDeficit  = d.hasData && d.ahorro < 0
              const inflacion  = inflMap[d.mes] ?? null
              const prevD      = i > 0 ? monthlyData[i - 1] : null
              const vsAnterior = prevD?.hasData && d.hasData
                ? d.ahorro - prevD.ahorro : null

              const rowBg = isCurrent
                ? 'color-mix(in oklch, var(--accent) 8%, transparent)'
                : isDeficit
                  ? 'color-mix(in oklch, var(--expense) 5%, transparent)'
                  : i % 2 === 0 ? 'transparent' : 'color-mix(in oklch, var(--surface) 30%, transparent)'

              return (
                <tr key={d.mes} style={{ borderBottom: '1px solid var(--border)', background: rowBg }}>
                  <td style={{
                    ...TDL,
                    fontWeight: isCurrent ? 700 : 400,
                    color: isCurrent ? 'var(--accent)' : isFuture ? 'var(--mute)' : 'var(--text)',
                  }}>
                    {names[i]}
                    {isCurrent && <span className="ml-1 text-[8px]" style={{ color: 'var(--accent)' }}>●</span>}
                  </td>
                  <td style={{ ...TD, color: d.hasData ? 'var(--income)' : 'var(--mute)' }}>
                    {d.hasData ? fmtARS(d.ingresos) : '—'}
                  </td>
                  <td style={{ ...TD, color: d.hasData ? 'var(--expense)' : 'var(--mute)' }}>
                    {d.hasData ? fmtARS(d.gastos) : '—'}
                  </td>
                  <td style={{
                    ...TD,
                    fontWeight: d.hasData ? 600 : 400,
                    color: !d.hasData ? 'var(--mute)' : d.ahorro >= 0 ? 'var(--text)' : '#ef4444',
                  }}>
                    {d.hasData ? fmtARS(d.ahorro) : '—'}
                  </td>
                  <td style={{
                    ...TD,
                    color: !d.hasData ? 'var(--mute)' : d.tasa >= 0 ? 'var(--text)' : '#ef4444',
                  }}>
                    {d.hasData ? fmtPct(d.tasa) : '—'}
                  </td>
                  <td style={{ ...TD, color: inflacion !== null ? 'var(--subtext)' : 'var(--mute)' }}>
                    {inflacion !== null ? `${inflacion.toFixed(1)}%` : '—'}
                  </td>
                  <td style={{
                    ...TD, fontSize: 11,
                    color: vsAnterior === null ? 'var(--mute)' : vsAnterior >= 0 ? '#22c55e' : '#ef4444',
                  }}>
                    {vsAnterior !== null
                      ? `${vsAnterior >= 0 ? '+' : ''}${fmtARS(vsAnterior)}`
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Category breakdown ────────────────────────────────────────────────────────

function CategoryTable({ movimientos, year, lang, finCategorias }) {
  const colorByName = useMemo(
    () => buildFinCategoriaColorByName(finCategorias),
    [finCategorias],
  )

  const cats = useMemo(() => {
    const map = {}
    movimientos.forEach(m => {
      if (isTransferencia(m)) return
      if ((m.type ?? m.tipo) !== 'expense') return
      if (movimientoAnio(m) !== String(year)) return
      const cat   = m.cat ?? m.categoria_nombre ?? (lang === 'en' ? 'Other' : 'Otro')
      const monto = Math.abs(m.amount ?? m.monto ?? 0)
      map[cat] = (map[cat] ?? 0) + monto
    })
    const total = Object.values(map).reduce((a, b) => a + b, 0)
    return Object.entries(map)
      .map(([nombre, monto], i) => ({
        nombre,
        monto,
        pct: total > 0 ? (monto / total) * 100 : 0,
        color: getFinCategoriaColor(colorByName, nombre, i),
      }))
      .sort((a, b) => b.monto - a.monto)
  }, [movimientos, year, lang, colorByName])

  if (cats.length === 0) return null

  const maxMonto = cats[0]?.monto ?? 1

  return (
    <div className="panel-strong p-5">
      <CardHeader
        title={lang === 'en' ? 'Annual expenses by category' : 'Gastos anuales por categoría'}
      />
      <div className="flex flex-col gap-2 mt-3">
        {cats.map(c => (
          <div key={c.nombre} className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} aria-hidden />
            <div className="w-22 shrink-0 text-[11.5px] truncate" style={{ color: 'var(--text)' }}>
              {c.nombre}
            </div>
            <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(c.monto / maxMonto) * 100}%`,
                  background: `linear-gradient(90deg, ${c.color}, color-mix(in oklch, ${c.color} 40%, transparent))`,
                }}
              />
            </div>
            <div className="w-22 text-right text-[11px] mono tnum shrink-0" style={{ color: 'var(--text)' }}>
              {fmtARS(c.monto)}
            </div>
            <div className="w-9 text-right text-[10px] mono shrink-0" style={{ color: 'var(--subtext)' }}>
              {c.pct.toFixed(0)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Aviso cuando hay movimientos pero no suman (p. ej. solo Transferencia) ───

function AnualDataHint({ movimientos, year, hasChartData, lang }) {
  const enAnio = useMemo(
    () => movimientos.filter(m => movimientoAnio(m) === String(year)),
    [movimientos, year],
  )
  const xferCount = enAnio.filter(isTransferencia).length
  if (hasChartData || enAnio.length === 0) return null

  const soloTransferencias = xferCount === enAnio.length
  const msg = soloTransferencias
    ? (lang === 'en'
        ? `All ${xferCount} movement(s) in ${year} use category Transferencia — they are excluded from income/expense totals. Change the category in the Datos tab (e.g. Salary, Groceries).`
        : `Los ${xferCount} movimiento(s) de ${year} están en categoría Transferencia y no entran en ingresos/gastos. Cambiá la categoría en la pestaña Datos (ej. Sueldo, Supermercado).`)
    : (lang === 'en'
        ? `${enAnio.length} movement(s) in ${year} do not contribute to the chart (${xferCount} transfer(s)). Check categories in Datos.`
        : `${enAnio.length} movimiento(s) en ${year} no aparecen en el gráfico (${xferCount} transferencia(s)). Revisá categorías en Datos.`)

  return (
    <div
      className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-[12.5px] leading-snug"
      style={{
        background: 'color-mix(in oklch, var(--warning) 12%, transparent)',
        border: '1px solid color-mix(in oklch, var(--warning) 28%, transparent)',
        color: 'var(--text)',
      }}
      role="status"
    >
      <span style={{ fontSize: 16, lineHeight: 1.2 }} aria-hidden>⚠</span>
      <span>{msg}</span>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AnualTab() {
  const lang             = useStore(s => s.lang)
  const selectedMes      = useStore(s => s.selectedMes)
  const finMovimientosAll = useStore(s => s.finMovimientosAll)
  const finCategorias     = useStore(s => s.finCategorias)
  const finInflacion     = useStore(s => s.finInflacion)
  const fetchAll         = useStore(s => s.fetchFinMovimientosAll)
  const fetchInflacion   = useStore(s => s.fetchFinInflacion)

  const [showReal, setShowReal] = useState(false)

  useEffect(() => { fetchAll(); fetchInflacion() }, [])

  const year = selectedMes.split('-')[0]

  const monthlyData = useMemo(
    () => buildMonthly(finMovimientosAll, year),
    [finMovimientosAll, year],
  )

  const deflators = useMemo(
    () => computeDeflators(finInflacion, year),
    [finInflacion, year],
  )

  const totals = useMemo(() => {
    const ingresos = monthlyData.reduce((a, m) => a + m.ingresos, 0)
    const gastos   = monthlyData.reduce((a, m) => a + m.gastos,   0)
    const ahorro   = ingresos - gastos
    const tasa     = ingresos > 0 ? (ahorro / ingresos) * 100 : 0
    const inflAcum = computeInflAcum(finInflacion, year)
    return { ingresos, gastos, ahorro, tasa, inflAcum }
  }, [monthlyData, finInflacion, year])

  const hasInflacion = Object.keys(finInflacion).some(k => k.startsWith(year))
  const hasChartData = monthlyData.some(m => m.hasData)

  return (
    <div className="flex flex-col gap-4">
      <AnualDataHint
        movimientos={finMovimientosAll}
        year={year}
        hasChartData={hasChartData}
        lang={lang}
      />

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label={lang === 'en' ? 'Annual income' : 'Ingresos año'}
          value={fmtARS(totals.ingresos)}
          color="var(--income)"
        />
        <StatCard
          label={lang === 'en' ? 'Annual expenses' : 'Gastos año'}
          value={fmtARS(totals.gastos)}
          color="var(--expense)"
        />
        <StatCard
          label={lang === 'en' ? 'Total saved' : 'Total ahorrado'}
          value={fmtARS(totals.ahorro)}
          color={totals.ahorro >= 0 ? 'var(--text)' : '#ef4444'}
        />
        <StatCard
          label={lang === 'en' ? 'Avg savings rate' : 'Tasa ahorro prom.'}
          value={`${totals.tasa.toFixed(1)}%`}
        />
        <StatCard
          label={lang === 'en' ? 'Cumulative inflation' : 'Inflación acumulada'}
          value={hasInflacion ? `${totals.inflAcum.toFixed(1)}%` : '—'}
          sub={!hasInflacion ? (lang === 'en' ? 'Enter in right panel →' : 'Cargá en el panel →') : undefined}
        />
      </div>

      {/* Bar chart */}
      <div className="panel-strong p-5">
        <div className="flex items-start justify-between mb-2">
          <CardHeader
            title={lang === 'en' ? 'Monthly flow' : 'Flujo mensual'}
            subtitle={year}
          />
          {hasInflacion && (
            <div
              className="flex items-center gap-0.5 p-1 rounded-lg border shrink-0"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              {[
                { label: 'Nominal', active: !showReal },
                { label: lang === 'en' ? 'Real (CPI)' : 'Real (IPC)', active: showReal },
              ].map(({ label, active }, idx) => (
                <button
                  key={label}
                  onClick={() => setShowReal(idx === 1)}
                  className="px-3 py-1 rounded-md text-[11px] font-medium transition-all duration-150"
                  style={{
                    background: active ? 'var(--bg)' : 'transparent',
                    color: active ? 'var(--text)' : 'var(--subtext)',
                    boxShadow: active ? '0 1px 2px var(--border)' : 'none',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <BarChart
          monthlyData={monthlyData}
          deflators={deflators}
          showReal={showReal && hasInflacion}
          lang={lang}
        />
      </div>

      {/* Month-by-month table */}
      <MonthTable monthlyData={monthlyData} inflMap={finInflacion} lang={lang} />

      {/* Category breakdown */}
      <CategoryTable movimientos={finMovimientosAll} year={year} lang={lang} finCategorias={finCategorias} />
    </div>
  )
}
