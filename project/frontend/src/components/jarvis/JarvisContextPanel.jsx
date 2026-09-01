import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import {
  INBOX_STATUS_COLORS, MEMORY_TYPE_COLORS, BUDGET_LEVEL_COLORS, BUDGET_LEVEL_NOTES,
  JARVIS_CONTEXT_RECENT_COUNT, JARVIS_CONTEXT_ENTITY_LIMIT, JV_BLINK_MS, rgba,
} from '../../utils/jarvisPalette'
import { formatAge } from '../../utils/formatAge'

const STATUS_ANIM = {
  PENDING: 'none',
  PROCESSING: `jv-blink ${JV_BLINK_MS.processing}ms infinite`,
  DONE: 'none',
  ERROR: `jv-blink ${JV_BLINK_MS.error}ms infinite`,
}

// role (jarvis/budget/tracker.py::_role_for_model) → etiqueta visible.
const ROLE_LABEL = { reason: 'GRANDE', local: 'CHICO', other: 'OTRO' }

export default function JarvisContextPanel() {
  const { jarvisInbox, jarvisBudget, jarvisEntities, setJarvisTab } = useStore(
    useShallow(s => ({
      jarvisInbox:    s.jarvisInbox,
      jarvisBudget:   s.jarvisBudget,
      jarvisEntities: s.jarvisEntities,
      setJarvisTab:   s.setJarvisTab,
    }))
  )

  const bcol = BUDGET_LEVEL_COLORS[jarvisBudget.status] || BUDGET_LEVEL_COLORS.ACTIVE
  const pct = jarvisBudget.daily_budget_usd > 0
    ? Math.min(100, (jarvisBudget.spent_usd / jarvisBudget.daily_budget_usd) * 100)
    : 0
  const note = BUDGET_LEVEL_NOTES[jarvisBudget.status] || BUDGET_LEVEL_NOTES.ACTIVE
  const byModel = jarvisBudget.by_model || []

  return (
    <div
      style={{
        borderLeft: '1px solid var(--jv-border)',
        padding: '20px 16px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
        background: 'linear-gradient(180deg, rgba(8,10,22,0.5), rgba(6,8,16,0.24))',
      }}
    >
      {/* En proceso */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="jv-mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--jv-mute)' }}>
          EN PROCESO
        </div>
        {jarvisInbox.slice(0, JARVIS_CONTEXT_RECENT_COUNT).length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--jv-mute)' }}>Sin actividad reciente</div>
        )}
        {jarvisInbox.slice(0, JARVIS_CONTEXT_RECENT_COUNT).map(i => {
          const color = INBOX_STATUS_COLORS[i.status] || INBOX_STATUS_COLORS.PENDING
          return (
            <div
              key={i.entry_id}
              style={{
                display: 'flex', flexDirection: 'column', gap: 7, padding: 11, borderRadius: 10,
                background: 'rgba(10,13,26,0.6)', border: `1px solid ${rgba(color, 0.22)}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, animation: STATUS_ANIM[i.status] }} />
                <div className="jv-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', color }}>
                  {i.status}
                </div>
                <div style={{ flex: 1 }} />
                <div className="jv-mono" style={{ fontSize: 9.5, color: 'rgba(200,214,255,0.32)' }}>
                  {formatAge(i.updated_at)}
                </div>
              </div>
              <div
                style={{
                  fontSize: 12, lineHeight: 1.5, color: 'rgba(222,230,255,0.68)',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}
              >
                {i.content_raw}
              </div>
            </div>
          )
        })}
      </div>

      {/* Gasto de hoy */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="jv-mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--jv-mute)' }}>
          GASTO DE HOY
        </div>
        <div
          style={{
            padding: 14, borderRadius: 12,
            background: rgba(bcol, 0.06), border: `1px solid ${rgba(bcol, 0.28)}`,
            display: 'flex', flexDirection: 'column', gap: 11,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div className="jv-mono" style={{ fontSize: 26, fontWeight: 700, color: bcol, lineHeight: 1 }}>
              ${jarvisBudget.spent_usd.toFixed(2)}
            </div>
            <div className="jv-mono" style={{ fontSize: 11, color: 'rgba(200,214,255,0.4)' }}>
              / ${jarvisBudget.daily_budget_usd.toFixed(2)}
            </div>
          </div>
          <div style={{ height: 5, borderRadius: 4, background: 'rgba(150,170,255,0.12)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${rgba(bcol, 0.5)}, ${bcol})` }} />
          </div>
          <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(214,224,255,0.5)' }}>{note}</div>
          {byModel.length > 0 && (
            <div style={{ display: 'flex', gap: 7 }}>
              {byModel.map(m => {
                const mcolor = m.role === 'reason' ? MEMORY_TYPE_COLORS.RAW : MEMORY_TYPE_COLORS.SEMANTIC
                return (
                  <div
                    key={m.model}
                    style={{
                      flex: 1, padding: '7px 9px', borderRadius: 8, background: 'rgba(150,170,255,0.06)',
                      border: `1px solid ${rgba(mcolor, 0.22)}`, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0,
                    }}
                  >
                    <div className="jv-mono" style={{ fontSize: 9, letterSpacing: '0.08em', color: mcolor }}>
                      {ROLE_LABEL[m.role] || 'OTRO'}
                    </div>
                    <div className="jv-mono" style={{ fontSize: 11, color: 'rgba(224,232,255,0.7)' }}>
                      ${m.cost_usd.toFixed(2)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Entidades recientes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="jv-mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--jv-mute)' }}>
          ENTIDADES RECIENTES
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {jarvisEntities.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--jv-mute)' }}>Todavía ninguna</div>
          )}
          {jarvisEntities.slice(0, JARVIS_CONTEXT_ENTITY_LIMIT).map(e => {
            const color = e.entity_type === 'person' ? MEMORY_TYPE_COLORS.PEOPLE : MEMORY_TYPE_COLORS.PROJECT
            return (
              <div
                key={e.name}
                onClick={() => setJarvisTab('entities')}
                style={{
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px',
                  borderRadius: 20, background: rgba(color, 0.1),
                  border: `1px solid ${rgba(color, 0.26)}`, transition: 'transform .18s',
                }}
                onMouseEnter={ev => ev.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={ev => ev.currentTarget.style.transform = 'translateY(0)'}
              >
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
                <div style={{ fontSize: 11.5, color: 'rgba(228,235,255,0.78)' }}>{e.name}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
