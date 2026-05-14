import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtARS } from '../../data/finanzas'
import CardHeader from './CardHeader'

export default function KPIsCard() {
  const lang = useStore(s => s.lang)

  const kpis = [
    { label: t(lang, 'avgDaily'),            value: fmtARS(39950), delta: '-12%',                             deltaColor: 'var(--success)' },
    { label: t(lang, 'topCategory'),         value: 'Alquiler',    delta: `32% ${t(lang, 'ofTotal')}`,        deltaColor: 'var(--subtext)' },
    { label: t(lang, 'vsLastMonth'),         value: '-9.8%',       delta: t(lang, 'lessExpenses'),            deltaColor: 'var(--success)' },
    { label: t(lang, 'daysWithoutSpending'), value: '4',           delta: t(lang, 'thisMonth'),               deltaColor: 'var(--subtext)' },
  ]

  return (
    <div className="panel-strong p-5">
      <CardHeader title={t(lang, 'kpis')} subtitle={t(lang, 'indicators')} />
      <div className="grid grid-cols-2 gap-3">
        {kpis.map(k => (
          <div
            key={k.label}
            className="rounded-lg border p-3"
            style={{ borderColor: 'var(--border)', background: 'color-mix(in oklch, var(--bg) 50%, transparent)' }}
          >
            <div className="text-[10.5px]" style={{ color: 'var(--subtext)' }}>{k.label}</div>
            <div className="text-[18px] serif italic font-semibold mt-0.5 tnum" style={{ color: 'var(--text)' }}>
              {k.value}
            </div>
            <div className="text-[10.5px] mt-1" style={{ color: k.deltaColor }}>
              {k.delta}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
