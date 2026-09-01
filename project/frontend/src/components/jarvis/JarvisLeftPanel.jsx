import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { MEMORY_TYPE_COLORS, MEMORY_TYPE_DESC, MEMORY_TYPE_ORDER, rgba } from '../../utils/jarvisPalette'

export default function JarvisLeftPanel() {
  const { jarvisTypeCounts, jarvisProjects, setJarvisTab } = useStore(
    useShallow(s => ({
      jarvisTypeCounts: s.jarvisTypeCounts,
      jarvisProjects:   s.jarvisProjects,
      setJarvisTab:     s.setJarvisTab,
    }))
  )

  // heat es una decisión de escala visual del frontend (Fase B2: el backend
  // devuelve memory_count crudo, no un heat pre-normalizado).
  const maxCount = Math.max(1, ...jarvisProjects.map(p => p.memory_count || 0))

  return (
    <div
      className="jv-mono"
      style={{
        borderRight: '1px solid var(--jv-border)',
        padding: '20px 16px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 26,
        background: 'linear-gradient(180deg, rgba(8,10,22,0.5), rgba(6,8,16,0.24))',
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div className="jv-mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--jv-mute)' }}>
          TIPOS DE MEMORIA
        </div>
        {MEMORY_TYPE_ORDER.map(key => {
          const color = MEMORY_TYPE_COLORS[key]
          const count = jarvisTypeCounts[key] ?? 0
          return (
            <div
              key={key}
              onClick={() => setJarvisTab('chat')}
              style={{
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                alignItems: 'center',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 9,
                border: `1px solid ${rgba(color, 0.16)}`,
                background: rgba(color, 0.05),
                transition: 'transform .2s',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateX(3px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}
            >
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 10px 1px ${color}` }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                <div className="jv-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color }}>
                  {key}
                </div>
                <div style={{ fontSize: 11, color: 'var(--jv-subtext)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {MEMORY_TYPE_DESC[key]}
                </div>
              </div>
              <div className="jv-mono" style={{ fontSize: 12, color: 'rgba(214,224,255,0.72)' }}>{count}</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div className="jv-mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--jv-mute)' }}>
          PROYECTOS ACTIVOS
        </div>
        {jarvisProjects.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--jv-mute)', padding: '4px 2px' }}>Sin proyectos todavía</div>
        )}
        {jarvisProjects.map(p => {
          const heat = Math.round(((p.memory_count || 0) / maxCount) * 100)
          return (
            <div
              key={p.id}
              style={{
                display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 9,
                background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.14)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e4e9ff' }}>{p.name}</div>
                <div className="jv-mono" style={{ fontSize: 10, color: 'rgba(214,224,255,0.44)' }}>{p.memory_count}</div>
              </div>
              <div style={{ height: 3, borderRadius: 3, background: 'rgba(167,139,250,0.16)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${heat}%`, background: 'linear-gradient(90deg,#a78bfa,#7dd3fc)' }} />
              </div>
            </div>
          )
        })}
      </div>

      <div
        style={{
          marginTop: 'auto', padding: 11, borderRadius: 9, border: '1px dashed rgba(150,170,255,0.16)',
          display: 'flex', flexDirection: 'column', gap: 5,
        }}
      >
        <div className="jv-mono" style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--jv-mute)' }}>PRÓXIMAMENTE</div>
        <div style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(214,224,255,0.42)' }}>
          Grafo navegable · timeline de validez · voz · Jarvis ejecuta tareas
        </div>
      </div>
    </div>
  )
}
