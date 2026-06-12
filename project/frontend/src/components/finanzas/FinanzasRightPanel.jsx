import { useMemo, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import {
  fmtARS,
  fmtUSD,
  isTransferencia,
  acumuladoPorCategoriaNombre,
  fireAportePlanMes,
  ahorradoFireEnMes,
} from '../../data/finanzas'
import { buildFinCategoriaColorByName, getFinCategoriaColor } from '../../data/finCategoriaColors'

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

const FIN_INT_OPTS = { minimumFractionDigits: 0, maximumFractionDigits: 0 }

function fmtMontoInt(monto, moneda) {
  const x = Number(monto)
  if (!Number.isFinite(x)) return moneda === 'USD' ? 'US$ 0' : '$0'
  const sign = x < 0 ? '−' : ''
  const abs = Math.abs(x).toLocaleString('es-AR', FIN_INT_OPTS)
  return moneda === 'USD' ? `${sign}US$ ${abs}` : `${sign}$${abs}`
}

function OkChip({ lang }) {
  return (
    <span
      className="text-[10px] chip shrink-0"
      style={{
        color: 'var(--income)',
        borderColor: 'color-mix(in oklch, var(--income) 30%, transparent)',
        background: 'color-mix(in oklch, var(--income) 10%, transparent)',
      }}
    >
      ✓ {t(lang, 'dashGoalOk')}
    </span>
  )
}

function MetaRow({ lang, label, ok, barValue, barMax, barColor, subLeft, subRight }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-[12.5px] font-medium truncate min-w-0" style={{ color: 'var(--text)' }}>
          {label}
        </span>
        {ok && <OkChip lang={lang} />}
      </div>
      <ProgressBar value={barValue} max={barMax} color={barColor} />
      <div className="flex justify-between text-[10.5px] mono tnum gap-2" style={{ color: 'var(--subtext)' }}>
        <span className="truncate" style={{ color: barColor }}>{subLeft}</span>
        <span className="shrink-0">{subRight}</span>
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function FinanzasRightPanel() {
  const lang               = useStore(s => s.lang)
  const finMovimientos     = useStore(s => s.finMovimientos)
  const finMovimientosAll = useStore(s => s.finMovimientosAll)
  const finCategorias      = useStore(s => s.finCategorias)
  const finConfig          = useStore(s => s.finConfig)
  const finObjetivos       = useStore(s => s.finObjetivos)
  const finFireFilas       = useStore(s => s.finFireFilas)
  const fetchFinObjetivos  = useStore(s => s.fetchFinObjetivos)
  const fetchFinFireFilas  = useStore(s => s.fetchFinFireFilas)
  const selectedMes        = useStore(s => s.selectedMes)

  useEffect(() => {
    fetchFinObjetivos()
    fetchFinFireFilas()
  }, [])

  const tasaObjetivo = Number(finConfig?.tasa_ahorro_objetivo ?? 40)

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const expenses = finMovimientos.filter(m => (m.type ?? m.tipo) === 'expense' && !isTransferencia(m))
    const incomes  = finMovimientos.filter(m => (m.type ?? m.tipo) === 'income'  && !isTransferencia(m))

    const totalGastos   = expenses.reduce((a, m) => a + Math.abs(m.amount ?? m.monto ?? 0), 0)
    const totalIngresos = incomes.reduce((a, m)  => a + Math.abs(m.amount ?? m.monto ?? 0), 0)

    const [year, month] = selectedMes.split('-').map(Number)
    const daysInMonth   = new Date(year, month, 0).getDate()
    const now           = new Date()
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
    const daysElapsed   = isCurrentMonth ? now.getDate() : daysInMonth

    const avgDaily = daysElapsed > 0 ? totalGastos / daysElapsed : 0

    const catMap = {}
    expenses.forEach(m => {
      const cat = m.cat ?? m.categoria_nombre ?? 'Otros'
      catMap[cat] = (catMap[cat] ?? 0) + Math.abs(m.amount ?? m.monto ?? 0)
    })
    const colorByName = buildFinCategoriaColorByName(finCategorias)
    const topEntry  = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0]
    const topCat    = topEntry ? topEntry[0] : '—'
    const topCatColor = topEntry ? getFinCategoriaColor(colorByName, topCat, 0) : undefined
    const topCatPct = topEntry && totalGastos > 0
      ? Math.round((topEntry[1] / totalGastos) * 100)
      : 0

    const tasaAhorro = totalIngresos > 0
      ? Math.round(((totalIngresos - totalGastos) / totalIngresos) * 100)
      : 0

    const spendDays     = new Set(expenses.map(m => (m.fecha ?? '').slice(0, 10)).filter(Boolean))
    const diasSinGastar = Math.max(0, daysElapsed - spendDays.size)

    return { avgDaily, topCat, topCatColor, topCatPct, tasaAhorro, diasSinGastar, totalGastos, totalIngresos }
  }, [finMovimientos, finCategorias, selectedMes])

  const savingsColor = kpis.tasaAhorro >= tasaObjetivo ? 'var(--income)' : 'var(--expense)'

  const fireMeta = useMemo(() => {
    const dolar       = finConfig?.dolar_mep ?? finConfig?.dolar_oficial ?? finConfig?.dolar_default ?? 1245
    const aporteUSD   = fireAportePlanMes(finConfig, selectedMes)
    const ahorradoARS = ahorradoFireEnMes(finMovimientosAll, finFireFilas, selectedMes)
    const ahorradoUSD = ahorradoARS / (dolar || 1)
    const ok          = aporteUSD > 0 && ahorradoUSD >= aporteUSD
    const color       = ok ? '#22c55e' : 'var(--cta-bg)'
    return { aporteUSD, ahorradoUSD, ok, color }
  }, [finConfig, finMovimientosAll, finFireFilas, selectedMes])

  const objetivosMetas = useMemo(() => {
    return finObjetivos.map(obj => {
      const acumulado = acumuladoPorCategoriaNombre(finMovimientosAll, obj.nombre)
      const meta = Number(obj.meta) || 0
      const pct = meta > 0 ? Math.min(100, (acumulado / meta) * 100) : 0
      const ok = pct >= 100
      return {
        id: obj.id,
        nombre: obj.nombre,
        acumulado,
        meta,
        moneda: obj.moneda ?? 'ARS',
        pct,
        ok,
        color: ok ? '#22c55e' : 'var(--accent)',
      }
    })
  }, [finObjetivos, finMovimientosAll])

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
              valueColor={kpis.topCatColor}
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

          <div className="flex flex-col gap-4">
            <MetaRow
              lang={lang}
              label={t(lang, 'metaFIREMes')}
              ok={fireMeta.ok}
              barValue={fireMeta.ahorradoUSD}
              barMax={fireMeta.aporteUSD || fireMeta.ahorradoUSD || 1}
              barColor={fireMeta.color}
              subLeft={fmtUSD(fireMeta.ahorradoUSD)}
              subRight={fireMeta.aporteUSD > 0 ? `/ ${fmtUSD(fireMeta.aporteUSD)}` : '—'}
            />

            {objetivosMetas.length === 0 ? (
              <p className="text-[11px]" style={{ color: 'var(--subtext)' }}>
                {t(lang, 'sinObjetivos')}
              </p>
            ) : (
              objetivosMetas.map(obj => (
                <MetaRow
                  key={obj.id}
                  lang={lang}
                  label={obj.nombre}
                  ok={obj.ok}
                  barValue={obj.acumulado}
                  barMax={obj.meta || obj.acumulado || 1}
                  barColor={obj.color}
                  subLeft={fmtMontoInt(obj.acumulado, obj.moneda)}
                  subRight={`/ ${fmtMontoInt(obj.meta, obj.moneda)}`}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
