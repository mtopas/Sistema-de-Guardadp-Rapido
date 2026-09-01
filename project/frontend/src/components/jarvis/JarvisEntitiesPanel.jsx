import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { MEMORY_TYPE_COLORS, JARVIS_ENTITY_CARD_MIN, rgba } from '../../utils/jarvisPalette'
import { formatAge } from '../../utils/formatAge'

function initials(name) {
  return name.slice(0, 2).toUpperCase()
}

export default function JarvisEntitiesPanel() {
  const { jarvisEntities, setJarvisTab, jarvisQuery } = useStore(
    useShallow(s => ({
      jarvisEntities: s.jarvisEntities,
      setJarvisTab:   s.setJarvisTab,
      jarvisQuery:    s.jarvisQuery,
    }))
  )

  function ask(name) {
    setJarvisTab('chat')
    jarvisQuery(`¿Qué sé sobre ${name}?`)
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '26px 34px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 600 }}>Entidades reconocidas</div>
        <div className="jv-mono" style={{ fontSize: 11, color: 'var(--jv-mute)' }}>
          personas y organizaciones extraídas de tus capturas
        </div>
      </div>

      {jarvisEntities.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--jv-mute)', padding: '20px 4px' }}>
          Todavía no se detectó ninguna entidad.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${JARVIS_ENTITY_CARD_MIN}px, 1fr))`, gap: 12 }}>
        {jarvisEntities.map(e => {
          const color = e.entity_type === 'person' ? MEMORY_TYPE_COLORS.PEOPLE : MEMORY_TYPE_COLORS.PROJECT
          const kind = e.entity_type === 'person' ? 'PERSONA' : 'ORGANIZACIÓN'
          return (
            <div
              key={e.name}
              onClick={() => ask(e.name)}
              style={{
                cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 11, padding: 16,
                borderRadius: 14, background: 'rgba(10,13,26,0.7)',
                border: `1px solid ${rgba(color, 0.24)}`, transition: 'all .2s',
              }}
              onMouseEnter={ev => { ev.currentTarget.style.transform = 'translateY(-3px)'; ev.currentTarget.style.background = 'rgba(16,20,38,0.85)' }}
              onMouseLeave={ev => { ev.currentTarget.style.transform = 'translateY(0)'; ev.currentTarget.style.background = 'rgba(10,13,26,0.7)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 30, height: 30, borderRadius: e.entity_type === 'person' ? '50%' : 8,
                    background: rgba(color, 0.1), border: `1px solid ${color}`,
                    display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color,
                  }}
                  className="jv-mono"
                >
                  {initials(e.name)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#eaeeff' }}>{e.name}</div>
                  <div className="jv-mono" style={{ fontSize: 9.5, letterSpacing: '0.1em', color }}>{kind}</div>
                </div>
              </div>
              {e.notes && (
                <div style={{ fontSize: 12, lineHeight: 1.55, color: 'rgba(214,224,255,0.5)' }}>{e.notes}</div>
              )}
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {(e.types || []).map(t => (
                  <div key={t} style={{ width: 5, height: 5, borderRadius: '50%', background: MEMORY_TYPE_COLORS[t] || MEMORY_TYPE_COLORS.RAW }} />
                ))}
                <div className="jv-mono" style={{ fontSize: 10, color: 'var(--jv-mute)', marginLeft: 4 }}>
                  {e.memory_count ?? 0} memorias · visto {formatAge(e.last_seen)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
