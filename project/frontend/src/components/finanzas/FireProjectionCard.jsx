import { useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { FINANZAS, fmtUSD } from '../../data/finanzas'
import CardHeader from './CardHeader'

export default function FireProjectionCard() {
  const lang = useStore(s => s.lang)
  const data = FINANZAS.history
  const W = 460
  const H = 110

  const { pts, areaPath, linePath } = useMemo(() => {
    const max = Math.max(...data.map(d => d.in))
    const min = 1900
    const pts = data.map((d, i) => {
      const x = (i / (data.length - 1)) * (W - 10) + 5
      const y = H - ((d.in - min) / (max - min)) * (H - 20) - 10
      return [x, y]
    })
    const linePath = pts
      .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1))
      .join(' ')
    const areaPath = linePath + ` L ${pts[pts.length - 1][0]} ${H} L ${pts[0][0]} ${H} Z`
    return { pts, areaPath, linePath }
  }, [data])

  return (
    <div className="panel-strong p-5 col-span-2">
      <CardHeader
        title={t(lang, 'fireTitle')}
        subtitle={t(lang, 'fireSubtitle')}
        action={<button className="btn-fin" type="button">{t(lang, 'seeFull')}</button>}
      />

      <div className="grid grid-cols-[1fr_auto] gap-5 items-end">
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[110px]">
            <defs>
              <linearGradient id="firegrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="var(--accent)" stopOpacity="0.5" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* objective line */}
            <line x1="0" y1="14" x2={W} y2="14" stroke="var(--accent-light)" strokeDasharray="2 4" opacity="0.5" />
            <text x={W - 2} y={11} textAnchor="end" fontSize="9" style={{ fontFamily: 'var(--font-mono)' }} fill="var(--subtext)">
              {t(lang, 'objective')}
            </text>
            <path d={areaPath} fill="url(#firegrad)" />
            <path d={linePath} stroke="var(--accent)" strokeWidth="1.8" fill="none" />
            {pts.map((p, i) => (
              <circle
                key={i}
                cx={p[0]} cy={p[1]}
                r={i === pts.length - 1 ? 3.4 : 1.6}
                fill={i === pts.length - 1 ? 'var(--accent-light)' : 'var(--accent)'}
              />
            ))}
            {data.map((d, i) => (
              <text
                key={i} x={pts[i][0]} y={H - 1} textAnchor="middle"
                fontSize="9" style={{ fontFamily: 'var(--font-mono)' }}
                fill="var(--mute)"
              >
                {d.m}
              </text>
            ))}
          </svg>
        </div>

        <div className="flex flex-col gap-3 min-w-[180px]">
          <div>
            <div className="label">{t(lang, 'reachFireIn')}</div>
            <div className="serif italic text-[26px] font-semibold tnum gradient-text leading-tight">
              {FINANZAS.fire.year}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--subtext)' }}>
              {t(lang, 'yearsLeftFmt').replace('{years}', FINANZAS.fire.yearsLeft)}
            </div>
          </div>
          <div>
            <div className="label">{t(lang, 'monthlyRetirement')}</div>
            <div className="serif italic text-[18px] font-semibold tnum" style={{ color: 'var(--text)' }}>
              {fmtUSD(FINANZAS.fire.monthlyRetirementUSD)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
