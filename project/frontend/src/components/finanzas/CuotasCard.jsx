import { useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtARS } from '../../data/finanzas'
import CardHeader from './CardHeader'

function addMonths(isoStr, n) {
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return null
  d.setMonth(d.getMonth() + n)
  return d
}

export default function CuotasCard() {
  const lang           = useStore(s => s.lang)
  const finMovimientos = useStore(s => s.finMovimientos)

  const now = new Date()

  const cuotasActivas = useMemo(() => {
    return finMovimientos
      .filter(m => {
        const cuotas = m.cuotas ?? 0
        if (cuotas <= 1) return false
        const startRaw = m.fecha ?? new Date().toISOString()
        const endDate  = addMonths(startRaw, cuotas - 1)
        return !endDate || endDate >= now
      })
      .map(m => {
        const cuotas    = m.cuotas
        const startRaw  = m.fecha ?? new Date().toISOString()
        const startDate = new Date(startRaw)
        const endDate   = addMonths(startRaw, cuotas - 1)
        const montoTotal = Math.abs(m.monto ?? 0)
        const montoCuota = cuotas > 0 ? montoTotal / cuotas : montoTotal

        const fmt = d => d && !isNaN(d.getTime())
          ? d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
          : '—'

        return {
          id: m.id,
          desc: m.descripcion ?? '',
          start: fmt(startDate),
          end: fmt(endDate),
          montoCuota,
          cuotas,
        }
      })
  }, [finMovimientos])

  if (cuotasActivas.length === 0) return null

  const thStyle = {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--subtext)',
    padding: '6px 10px',
    borderBottom: '1px solid var(--border)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    background: 'color-mix(in oklch, var(--bg) 40%, transparent)',
  }

  const tdStyle = {
    fontSize: 12,
    padding: '8px 10px',
    color: 'var(--text)',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
  }

  return (
    <div className="panel-strong overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <CardHeader
          title={t(lang, 'installmentPlan')}
          subtitle={`${cuotasActivas.length} activa${cuotasActivas.length !== 1 ? 's' : ''}`}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th style={thStyle}>{t(lang, 'cuotaDesc')}</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>{t(lang, 'cuotaStart')}</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>{t(lang, 'cuotaEnd')}</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>{t(lang, 'cuotaAmount')}</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Cuotas</th>
            </tr>
          </thead>
          <tbody>
            {cuotasActivas.map(c => (
              <tr
                key={c.id}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                style={{ transition: 'background 0.1s' }}
              >
                <td style={tdStyle}>
                  <span className="font-medium">{c.desc}</span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--subtext)', fontSize: 11 }} className="mono">
                  {c.start}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--subtext)', fontSize: 11 }} className="mono">
                  {c.end}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                  <span className="tnum" style={{ color: 'var(--expense)' }}>
                    {fmtARS(c.montoCuota)}
                  </span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <span className="chip tnum" style={{ fontSize: 10.5 }}>{c.cuotas}x</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
