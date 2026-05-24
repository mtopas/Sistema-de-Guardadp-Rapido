import { t } from '../../utils/i18n'
import { useStore } from '../../store/useStore'

const TABS = [
  { id: 'hoy',       key: 'habitosHoy' },
  { id: 'progreso',  key: 'habitosProgreso' },
  { id: 'historial', key: 'habitosHistorial' },
]

export default function HabitosTabs({ active, onChange }) {
  const lang = useStore(s => s.lang)
  return (
    <div role="tablist" aria-label="Secciones de Hábitos" className="flex items-center gap-1">
      {TABS.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={`habitos-tabpanel-${tab.id}`}
          id={`habitos-tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2"
          style={{
            background: active === tab.id ? 'var(--accent)' : 'transparent',
            color:      active === tab.id ? 'white' : 'var(--subtext)',
            '--tw-ring-color': 'var(--accent)',
          }}
        >
          {t(lang, tab.key)}
        </button>
      ))}
    </div>
  )
}
