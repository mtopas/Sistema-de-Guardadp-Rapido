import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'

const TABS = [
  { id: 'hoy',      key: 'agendaHoy'     },
  { id: 'mes',      key: 'agendaMes'     },
  { id: 'tareas',   key: 'agendaTareas'  },
  { id: 'revision', key: 'agendaRevision'},
]

export default function AgendaTabs({ active, onChange }) {
  const lang = useStore(s => s.lang)

  return (
    <div role="tablist" aria-label="Agenda" className="flex items-center gap-1 p-1 rounded-xl border shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      {TABS.map(tab => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`agenda-tab-${tab.id}`}
            id={`agenda-tabBtn-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-all duration-150"
            style={{
              background: isActive ? 'var(--bg)' : 'transparent',
              color: isActive ? 'var(--text)' : 'var(--subtext)',
              boxShadow: isActive ? '0 1px 0 var(--border)' : 'none',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--subtext)' }}
          >
            {t(lang, tab.key)}
          </button>
        )
      })}
    </div>
  )
}
