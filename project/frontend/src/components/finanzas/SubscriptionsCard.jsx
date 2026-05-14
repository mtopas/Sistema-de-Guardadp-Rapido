import { Repeat } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { FINANZAS, fmtARS } from '../../data/finanzas'
import CardHeader from './CardHeader'

export default function SubscriptionsCard() {
  const lang = useStore(s => s.lang)
  const items = FINANZAS.suscripciones
  const total = items.reduce((a, b) => a + b.amount, 0)

  return (
    <div className="panel-strong p-5">
      <CardHeader
        title={t(lang, 'subscriptions')}
        subtitle={t(lang, 'recurring')}
        action={
          <span
            className="chip tnum"
            style={{
              color: 'var(--accent-light)',
              background:  'color-mix(in oklch, var(--accent) 14%, transparent)',
              borderColor: 'color-mix(in oklch, var(--accent) 28%, transparent)',
            }}
          >
            {fmtARS(total)}{t(lang, 'recurringTotal')}
          </span>
        }
      />

      <div className="flex flex-col">
        {items.map((s, i) => (
          <div
            key={s.name}
            className="flex items-center gap-3 py-2"
            style={{ borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            <div
              className="w-7 h-7 rounded-md grid place-items-center shrink-0"
              style={{
                background: 'color-mix(in oklch, var(--accent) 14%, transparent)',
                color: 'var(--accent-light)',
              }}
            >
              <Repeat size={13} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium truncate" style={{ color: 'var(--text)' }}>
                {s.name}
              </div>
              <div className="text-[10.5px]" style={{ color: 'var(--subtext)' }}>
                {t(lang, 'nextDue')} {s.next}
              </div>
            </div>
            <div className="text-[12.5px] font-semibold tnum shrink-0" style={{ color: 'var(--text)' }}>
              {fmtARS(s.amount)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
