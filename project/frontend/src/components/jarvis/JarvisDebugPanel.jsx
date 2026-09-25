import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { INBOX_STATUS_COLORS, MEMORY_TYPE_COLORS, JARVIS_EVENTS_MAX_LIMIT, rgba } from '../../utils/jarvisPalette'

const _TRUNCATE_LEN = 40

const LEVEL_COLOR = {
  CLASSIFY: MEMORY_TYPE_COLORS.DECISION,
  ENTITY: MEMORY_TYPE_COLORS.PEOPLE,
  EMBED: MEMORY_TYPE_COLORS.RAW,
  LINK: MEMORY_TYPE_COLORS.PROJECT,
  ERROR: INBOX_STATUS_COLORS.ERROR,
  TELEGRAM_FAIL: INBOX_STATUS_COLORS.ERROR,
}

function timeLabel(iso) {
  if (!iso) return '—'
  return iso.slice(11, 19)
}

export default function JarvisDebugPanel() {
  const { jarvisBudget, jarvisInboxStats, jarvisEvents, jarvisEventsLimit, loadMoreJarvisEvents } = useStore(
    useShallow(s => ({
      jarvisBudget:         s.jarvisBudget,
      jarvisInboxStats:     s.jarvisInboxStats,
      jarvisEvents:         s.jarvisEvents,
      jarvisEventsLimit:    s.jarvisEventsLimit,
      loadMoreJarvisEvents: s.loadMoreJarvisEvents,
    }))
  )

  const queuePending = jarvisInboxStats.pending + jarvisInboxStats.processing
  const lastDone = jarvisInboxStats.last_done

  const stats = [
    {
      label: 'ÚLTIMO PROCESADO',
      value: lastDone ? timeLabel(lastDone.updated_at) : '—',
      sub: lastDone ? `${lastDone.type} · ${lastDone.content_raw?.slice(0, _TRUNCATE_LEN)}${lastDone.content_raw?.length > _TRUNCATE_LEN ? '…' : ''}` : 'sin entradas procesadas',
      color: MEMORY_TYPE_COLORS.SEMANTIC,
    },
    {
      label: 'COLA',
      value: String(queuePending),
      sub: `${jarvisInboxStats.pending} pending · ${jarvisInboxStats.processing} processing`,
      color: MEMORY_TYPE_COLORS.DECISION,
    },
    {
      label: 'ERRORES',
      value: String(jarvisInboxStats.errors),
      sub: jarvisInboxStats.last_error?.slice(0, _TRUNCATE_LEN) || 'sin errores',
      color: MEMORY_TYPE_COLORS.PEOPLE,
    },
    {
      label: 'PRESUPUESTO',
      value: jarvisBudget.status,
      sub: `$${jarvisBudget.spent_usd.toFixed(4)} / $${jarvisBudget.daily_budget_usd.toFixed(2)}`,
      color: MEMORY_TYPE_COLORS.RAW,
    },
  ]

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '26px 34px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ fontSize: 22, fontWeight: 600 }}>Estado del sistema</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 11 }}>
        {stats.map(s => (
          <div
            key={s.label}
            style={{
              padding: 15, borderRadius: 12, background: 'rgba(10,13,26,0.7)',
              border: `1px solid ${rgba(s.color, 0.2)}`,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}
          >
            <div className="jv-mono" style={{ fontSize: 9.5, letterSpacing: '0.13em', color: 'var(--jv-mute)' }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'rgba(214,224,255,0.42)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="jv-mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--jv-mute)' }}>
        LOG DEL WORKER
      </div>
      <div
        style={{
          flex: 1, minHeight: 200, borderRadius: 12, border: '1px solid rgba(150,170,255,0.14)',
          background: 'rgba(5,7,15,0.85)', padding: '14px 16px', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 5,
        }}
      >
        {jarvisEvents.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--jv-mute)' }}>Sin eventos todavía.</div>
        )}
        {jarvisEvents.map(ev => (
          <div
            key={ev.id}
            className="jv-mono"
            style={{ display: 'grid', gridTemplateColumns: '78px 150px 1fr', gap: 12, fontSize: 11.5, lineHeight: 1.7 }}
          >
            <div style={{ color: 'rgba(200,214,255,0.3)' }}>{timeLabel(ev.created_at)}</div>
            <div
              style={{
                color: LEVEL_COLOR[ev.level] || MEMORY_TYPE_COLORS.RAW, fontWeight: 700,
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              title={ev.level}
            >
              {ev.level}
            </div>
            <div style={{ color: 'rgba(220,228,255,0.66)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ev.message}
            </div>
          </div>
        ))}
        {jarvisEvents.length >= jarvisEventsLimit && jarvisEventsLimit < JARVIS_EVENTS_MAX_LIMIT && (
          <button
            onClick={loadMoreJarvisEvents}
            className="jv-mono"
            style={{
              alignSelf: 'flex-start', marginTop: 4, fontSize: 10.5, letterSpacing: '0.08em',
              color: 'var(--jv-subtext)', background: 'rgba(150,170,255,0.06)', border: '1px solid rgba(150,170,255,0.14)',
              borderRadius: 7, padding: '5px 12px', cursor: 'pointer',
            }}
          >
            CARGAR MÁS
          </button>
        )}
      </div>
    </div>
  )
}
