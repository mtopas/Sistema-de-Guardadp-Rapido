import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import {
  BUDGET_LEVEL_COLORS, MEMORY_TYPE_COLORS, JARVIS_BUDGET_BARS, JARVIS_SUBHEADER_HEIGHT,
  JV_BREATHE_MS, rgba,
} from '../../utils/jarvisPalette'

// Dots de tab reusan la misma familia de 5 colores de tipo de memoria del mock
// (no son "colores de estado de inbox" ni "de nivel de budget" — son identidad
// visual de cada tab).
const TABS = [
  { key: 'chat',     label: 'Cerebro',   dot: MEMORY_TYPE_COLORS.RAW },
  { key: 'browse',   label: 'Explorar',  dot: MEMORY_TYPE_COLORS.PROJECT },
  { key: 'inbox',    label: 'Inbox',     dot: MEMORY_TYPE_COLORS.DECISION },
  { key: 'entities', label: 'Entidades', dot: MEMORY_TYPE_COLORS.PEOPLE },
  { key: 'debug',    label: 'Debug',     dot: MEMORY_TYPE_COLORS.SEMANTIC },
]

function BudgetIndicator({ budget }) {
  const spent = budget.daily_budget_usd > 0 ? budget.spent_usd / budget.daily_budget_usd : 0
  const color = BUDGET_LEVEL_COLORS[budget.status] || BUDGET_LEVEL_COLORS.ACTIVE
  const bars = Array.from({ length: JARVIS_BUDGET_BARS }, (_, i) => ({
    h: 5 + ((i * 7) % 11),
    filled: i / JARVIS_BUDGET_BARS < spent,
  }))
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px', borderRadius: 10,
        border: `1px solid ${rgba(color, 0.28)}`, background: rgba(color, 0.06),
      }}
    >
      <div className="jv-mono" style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--jv-subtext)' }}>BUDGET</div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
        {bars.map((b, i) => (
          <div key={i} style={{ width: 3, height: b.h, borderRadius: 2, background: b.filled ? color : 'rgba(150,170,255,0.16)' }} />
        ))}
      </div>
      <div className="jv-mono" style={{ fontSize: 12, fontWeight: 700, color }}>${budget.spent_usd.toFixed(2)}</div>
    </div>
  )
}

export default function JarvisSubBar() {
  const { jarvisTab, setJarvisTab, jarvisBudget, jarvisInbox, jarvisHealth } = useStore(
    useShallow(s => ({
      jarvisTab:    s.jarvisTab,
      setJarvisTab: s.setJarvisTab,
      jarvisBudget: s.jarvisBudget,
      jarvisInbox:  s.jarvisInbox,
      jarvisHealth: s.jarvisHealth,
    }))
  )

  const pending = jarvisInbox.filter(i => i.status === 'PENDING' || i.status === 'PROCESSING').length
  const alive = jarvisHealth.worker_alive
  const healthColor = alive ? BUDGET_LEVEL_COLORS.ACTIVE : BUDGET_LEVEL_COLORS.EXHAUSTED

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 20, padding: '0 22px',
        height: JARVIS_SUBHEADER_HEIGHT, flex: 'none',
        borderBottom: '1px solid var(--jv-border)', backdropFilter: 'blur(14px)',
        background: 'linear-gradient(180deg, rgba(8,10,22,0.82), rgba(8,10,22,0.45))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 11, background: 'rgba(140,160,255,0.06)', border: '1px solid rgba(150,170,255,0.1)' }}>
        {TABS.map(t => {
          const active = jarvisTab === t.key
          return (
            <div
              key={t.key}
              onClick={() => setJarvisTab(t.key)}
              style={{
                cursor: 'pointer', padding: '7px 15px', borderRadius: 8, fontSize: 13,
                fontWeight: active ? 600 : 500, display: 'flex', alignItems: 'center', gap: 8,
                color: active ? '#f2f5ff' : 'rgba(220,230,255,0.62)',
                background: active ? 'rgba(150,170,255,0.09)' : 'transparent', transition: 'all .18s',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: 2, background: t.dot, boxShadow: `0 0 8px ${t.dot}` }} />
              <span>{t.label}</span>
              {t.key === 'inbox' && pending > 0 && (
                <span
                  className="jv-mono"
                  style={{ fontSize: 10, padding: '1px 5px', borderRadius: 20, background: rgba(MEMORY_TYPE_COLORS.DECISION, 0.16), color: MEMORY_TYPE_COLORS.DECISION }}
                >
                  {pending}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ flex: 1 }} />

      <BudgetIndicator budget={jarvisBudget} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div
          style={{
            width: 8, height: 8, borderRadius: '50%', background: healthColor,
            boxShadow: `0 0 10px 2px ${healthColor}`, animation: `jv-breathe ${JV_BREATHE_MS}ms ease-in-out infinite`,
          }}
        />
        <div className="jv-mono" style={{ fontSize: 11, color: 'var(--jv-subtext)' }}>
          {alive ? 'worker activo' : 'worker caído'}
        </div>
      </div>
    </div>
  )
}
