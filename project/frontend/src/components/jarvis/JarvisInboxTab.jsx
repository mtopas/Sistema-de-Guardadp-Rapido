import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { INBOX_STATUS_COLORS, INBOX_STATUS_ORDER, MEMORY_TYPE_COLORS, JARVIS_INBOX_GRID_COLS, JV_BLINK_MS, rgba } from '../../utils/jarvisPalette'
import { formatAge } from '../../utils/formatAge'

const STATUS_ANIM = {
  PENDING: 'none',
  PROCESSING: `jv-blink ${JV_BLINK_MS.processing}ms infinite`,
  DONE: 'none',
  ERROR: `jv-blink ${JV_BLINK_MS.error}ms infinite`,
}

export default function JarvisInboxTab() {
  const jarvisInbox = useStore(useShallow(s => s.jarvisInbox))

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '26px 34px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 600 }}>Inbox de captura</div>
        <div className="jv-mono" style={{ fontSize: 11, color: 'var(--jv-mute)' }}>
          refresco automático cada 15s
        </div>
        <div style={{ flex: 1 }} />
        {INBOX_STATUS_ORDER.map(s => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: INBOX_STATUS_COLORS[s] }} />
            <div className="jv-mono" style={{ fontSize: 10, color: 'var(--jv-subtext)' }}>{s}</div>
          </div>
        ))}
      </div>

      {jarvisInbox.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--jv-mute)', padding: '20px 4px' }}>Inbox vacío.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {jarvisInbox.map(i => {
          const color = INBOX_STATUS_COLORS[i.status] || INBOX_STATUS_COLORS.PENDING
          const typeColor = MEMORY_TYPE_COLORS[i.type] || MEMORY_TYPE_COLORS.RAW
          return (
            <div
              key={i.entry_id}
              style={{
                display: 'grid', gridTemplateColumns: JARVIS_INBOX_GRID_COLS, alignItems: 'center', gap: 16,
                padding: '14px 16px', borderRadius: 12, background: 'rgba(10,13,26,0.66)',
                border: `1px solid ${rgba(color, 0.22)}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 9px ${color}`, animation: STATUS_ANIM[i.status] }} />
                <div className="jv-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color }}>
                  {i.status}
                </div>
              </div>
              <div style={{ fontSize: 13.5, color: 'rgba(230,236,255,0.82)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {i.content_raw}
                {i.status === 'ERROR' && i.last_error && (
                  <div title={i.last_error} style={{ fontSize: 11, color: INBOX_STATUS_COLORS.ERROR, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {i.last_error}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 6, height: 6, borderRadius: 2, background: typeColor }} />
                <div className="jv-mono" style={{ fontSize: 10, color: typeColor }}>{i.type}</div>
              </div>
              <div className="jv-mono" style={{ fontSize: 10.5, color: 'var(--jv-mute)', textAlign: 'right' }}>
                {formatAge(i.updated_at)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
