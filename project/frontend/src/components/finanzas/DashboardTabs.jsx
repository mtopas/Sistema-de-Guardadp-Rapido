import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { MONTHS } from '../../utils/months'

const TABS = [
  { id: 'dashboard', key: 'dashboard' },
  { id: 'anual',     key: 'anual'     },
  { id: 'fire',      key: 'fire'      },
  { id: 'ahorro',    key: 'ahorro'    },
  { id: 'datos',     key: 'datos'     },
]

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

const selectStyle = {
  borderColor: 'var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
}

export default function DashboardTabs({ active, onChange, hideSelector = false, yearOnly = false }) {
  const lang         = useStore(s => s.lang)
  const selectedMes  = useStore(s => s.selectedMes)
  const setSelectedMes = useStore(s => s.setSelectedMes)

  const [year, month] = selectedMes.split('-')

  const handleMonth = e => setSelectedMes(`${year}-${e.target.value}`)
  const handleYear  = e => setSelectedMes(`${e.target.value}-${month}`)

  return (
    <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
      <div
        role="tablist"
        className="flex items-center gap-1 p-1 rounded-xl border"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        {TABS.map(tab => {
          const isActive = tab.id === active
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-all duration-150"
              style={{
                background: isActive ? 'var(--bg)'      : 'transparent',
                color:      isActive ? 'var(--text)'    : 'var(--subtext)',
                boxShadow:  isActive ? '0 1px 0 var(--border)' : 'none',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--subtext)' }}
            >
              {t(lang, tab.key)}
            </button>
          )
        })}
      </div>

      {/* Month / Year selectors — hidden on tabs that don't use them */}
      {!hideSelector && (
        <div className="flex items-center gap-2">
          {!yearOnly && (
            <select
              value={month}
              onChange={handleMonth}
              className="px-2.5 py-1.5 rounded-xl border outline-none transition-colors"
              style={selectStyle}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              {MONTHS.map(m => (
                <option key={m.v} value={m.v}>
                  {lang === 'en' ? m.en : m.es}
                </option>
              ))}
            </select>
          )}
          <select
            value={year}
            onChange={handleYear}
            className="px-2.5 py-1.5 rounded-xl border outline-none transition-colors"
            style={selectStyle}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            {YEARS.map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
