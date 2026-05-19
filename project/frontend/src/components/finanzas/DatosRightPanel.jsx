import { useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtARS, isTransferencia } from '../../data/finanzas'

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

export default function DatosRightPanel() {
  const lang   = useStore(s => s.lang)
  const movAll = useStore(s => s.finMovimientosAll)

  const kpis = useMemo(() => {
    const movs = movAll.filter(m => !isTransferencia(m))
    if (!movs.length) return null

    const toDate = m => {
      const v = m.date ?? m.fecha ?? ''
      const d = new Date(v)
      return isNaN(d.getTime()) ? null : d
    }

    const dates = movs.map(toDate).filter(Boolean).sort((a, b) => a - b)
    const first = dates[0]
    const last  = dates[dates.length - 1]

    const daysSince = first
      ? Math.floor((Date.now() - first.getTime()) / 86_400_000)
      : 0

    const monthSpan = first && last
      ? Math.max(1, (last - first) / (86_400_000 * 30.44))
      : 1

    const incomes  = movs.filter(m => (m.type ?? m.tipo) === 'income')
    const expenses = movs.filter(m => (m.type ?? m.tipo) === 'expense')

    const totalInc = incomes.reduce((a, m) => a + Math.abs(m.amount ?? m.monto ?? 0), 0)
    const totalExp = expenses.reduce((a, m) => a + Math.abs(m.amount ?? m.monto ?? 0), 0)
    const neto     = totalInc - totalExp
    const tasa     = totalInc > 0 ? Math.round((neto / totalInc) * 100) : 0

    return {
      total:     movs.length,
      firstDate: first ? first.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      daysSince,
      avgPerMonth: (movs.length / monthSpan).toFixed(1),
      totalInc,
      totalExp,
      neto,
      tasa,
    }
  }, [movAll])

  return (
    <div
      style={{
        width: 256,
        height: '100%',
        borderLeft: '1px solid var(--border)',
        background: 'var(--panel-bg)',
        overflowY: 'auto',
        padding: '20px 14px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div className="label mb-0.5">{t(lang, 'datosHistorico')}</div>

      {!kpis ? (
        <p style={{ color: 'var(--subtext)', fontSize: 13 }}>{t(lang, 'sinMovimientos')}</p>
      ) : (
        <>
          <KpiBox label={t(lang, 'datosTotalMov')}   value={kpis.total} />
          <KpiBox label={t(lang, 'datosPrimerMov')}  value={kpis.firstDate} />
          <KpiBox label={t(lang, 'datosDias')}        value={`${kpis.daysSince}d`} />
          <KpiBox label={t(lang, 'datosPromMes')}     value={`${kpis.avgPerMonth} mov`} />
          <KpiBox
            label={t(lang, 'datosIncTotal')}
            value={fmtARS(kpis.totalInc)}
            valueColor="#22c55e"
          />
          <KpiBox
            label={t(lang, 'datosExpTotal')}
            value={fmtARS(kpis.totalExp)}
            valueColor="#ef4444"
          />
          <KpiBox
            label={t(lang, 'datosNeto')}
            value={fmtARS(Math.abs(kpis.neto))}
            valueColor={kpis.neto >= 0 ? '#22c55e' : '#ef4444'}
            sub={kpis.neto >= 0 ? t(lang, 'datosSuperavit') : t(lang, 'datosDeficit')}
          />
          <KpiBox label={t(lang, 'datosTasaAhorro')} value={`${kpis.tasa}%`} />
        </>
      )}
    </div>
  )
}
