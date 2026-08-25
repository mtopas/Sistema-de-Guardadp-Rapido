import { useEffect, useState } from 'react'
import { RefreshCw, Inbox, Zap } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'

const STATUS_LABELS = {
  DONE:       { label: 'DONE',       bg: 'var(--success, #059669)',  text: '#fff' },
  PENDING:    { label: 'PEND',       bg: 'var(--mute)',              text: 'var(--text-2)' },
  PROCESSING: { label: 'PROC',       bg: 'var(--accent)',            text: '#fff' },
  ERROR:      { label: 'ERR',        bg: 'var(--expense, #ef4444)', text: '#fff' },
}

const TYPE_EMOJI = {
  RAW:       '📥',
  SEMANTIC:  '💡',
  DECISION:  '🔑',
  PROJECT:   '📁',
}

function StatusBadge({ status }) {
  const cfg = STATUS_LABELS[status] || STATUS_LABELS.PENDING
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
      style={{ background: cfg.bg, color: cfg.text, letterSpacing: '0.04em' }}
    >
      {cfg.label}
    </span>
  )
}

function BudgetBar({ budget }) {
  const pct = budget.daily_budget_usd > 0
    ? Math.min(100, (budget.spent_usd / budget.daily_budget_usd) * 100)
    : 0
  const barColor = budget.status === 'EXHAUSTED'
    ? 'var(--expense, #ef4444)'
    : budget.status === 'LOW'
      ? '#f59e0b'
      : 'var(--accent)'

  return (
    <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Zap size={11} style={{ color: 'var(--accent)' }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--subtext)' }}>
            Budget
          </span>
        </div>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
          style={{
            background: barColor,
            color: '#fff',
            letterSpacing: '0.04em',
          }}
        >
          {budget.status}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9.5px] mono" style={{ color: 'var(--subtext)' }}>
          ${budget.spent_usd.toFixed(4)}
        </span>
        <span className="text-[9.5px] mono" style={{ color: 'var(--mute)' }}>
          / ${budget.daily_budget_usd.toFixed(2)} hoy
        </span>
      </div>
    </div>
  )
}

export default function JarvisInboxPanel() {
  const { jarvisInbox, jarvisBudget, fetchJarvisInbox, fetchJarvisBudget } = useStore(
    useShallow(s => ({
      jarvisInbox:       s.jarvisInbox,
      jarvisBudget:      s.jarvisBudget,
      fetchJarvisInbox:  s.fetchJarvisInbox,
      fetchJarvisBudget: s.fetchJarvisBudget,
    }))
  )
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchJarvisInbox()
    fetchJarvisBudget()
    const id = setInterval(() => {
      fetchJarvisInbox()
      fetchJarvisBudget()
    }, 15000)
    return () => clearInterval(id)
  }, [fetchJarvisInbox, fetchJarvisBudget])

  async function handleRefresh() {
    setRefreshing(true)
    await Promise.all([fetchJarvisInbox(), fetchJarvisBudget()])
    setRefreshing(false)
  }

  return (
    <div
      className="flex flex-col h-full border-r shrink-0"
      style={{
        width: 240,
        borderColor: 'var(--border)',
        background: 'var(--panel-bg)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Inbox size={13} style={{ color: 'var(--accent)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--subtext)' }}>
            Inbox
          </span>
        </div>
        <button
          onClick={handleRefresh}
          className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: 'var(--subtext)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--subtext)'}
          title="Actualizar"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Budget */}
      <BudgetBar budget={jarvisBudget} />

      {/* Inbox list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {jarvisInbox.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 px-4">
            <Inbox size={22} style={{ color: 'var(--mute)' }} />
            <p className="text-[11px] text-center" style={{ color: 'var(--subtext)' }}>
              Inbox vacío
            </p>
          </div>
        ) : (
          jarvisInbox.map(item => (
            <div
              key={item.entry_id}
              className="px-3 py-2.5 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span style={{ fontSize: 11 }}>
                  {TYPE_EMOJI[item.type] || '📥'}
                </span>
                <StatusBadge status={item.status} />
                {item.attempts > 1 && (
                  <span className="text-[9px] mono" style={{ color: 'var(--mute)' }}>
                    ×{item.attempts}
                  </span>
                )}
              </div>
              <p
                className="text-[11px] leading-snug line-clamp-2"
                style={{ color: 'var(--text-2)' }}
              >
                {item.content_raw}
              </p>
              <p className="text-[9.5px] mono mt-0.5" style={{ color: 'var(--mute)' }}>
                {item.updated_at?.slice(0, 16).replace('T', ' ') || ''}
              </p>
              {item.status === 'ERROR' && item.last_error && (
                <p
                  className="text-[9px] mt-0.5 leading-tight line-clamp-1"
                  style={{ color: 'var(--expense, #ef4444)' }}
                  title={item.last_error}
                >
                  {item.last_error}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
