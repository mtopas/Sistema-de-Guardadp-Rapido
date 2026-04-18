import { Check } from 'lucide-react'
import { useStore } from '../store/useStore'
import { THEMES } from '../utils/themes'
import { t } from '../utils/i18n'

export default function SettingsScreen() {
  const theme       = useStore(s => s.theme)
  const setTheme    = useStore(s => s.setTheme)
  const lang        = useStore(s => s.lang)
  const setLang     = useStore(s => s.setLang)
  const userName    = useStore(s => s.userName)
  const setUserName = useStore(s => s.setUserName)

  return (
    <div className="px-4 py-6 max-w-xl mx-auto space-y-8">
      <h2 className="font-semibold text-lg" style={{ color: 'var(--text)', fontFamily: "'Playfair Display', serif" }}>
        {t(lang, 'settings')}
      </h2>

      {/* User name */}
      <section>
        <h3 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--subtext)' }}>
          {t(lang, 'Your name')}
        </h3>
        <input
          type="text"
          value={userName}
          onChange={e => setUserName(e.target.value)}
          placeholder={t(lang, 'namePlaceholder')}
          className="w-full rounded-xl px-4 py-2.5 text-sm border outline-none transition-colors"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text)',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
        />
        <p className="text-[10px] mt-1.5 px-1" style={{ color: 'var(--subtext)' }}>
          {t(lang, 'namePlaceholder')}
        </p>
      </section>

      {/* Language */}
      <section>
        <h3 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--subtext)' }}>
          {t(lang, 'language')}
        </h3>
        <div className="flex gap-2">
          {[
            { code: 'es', label: '🇦🇷 Español' },
            { code: 'en', label: '🇺🇸 English' },
          ].map(({ code, label }) => {
            const active = lang === code
            return (
              <button key={code} onClick={() => setLang(code)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-all duration-150 active:scale-[0.97]"
                style={{
                  background: active ? 'rgba(139,92,246,0.15)' : 'var(--surface)',
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  color: active ? 'var(--accent)' : 'var(--subtext)',
                  boxShadow: active ? '0 0 0 1px var(--accent)' : 'none',
                }}
              >
                {label}
                {active && <Check size={13} />}
              </button>
            )
          })}
        </div>
      </section>

      {/* Themes */}
      <section>
        <h3 className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--subtext)' }}>
          {t(lang, 'colorTheme')}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(THEMES).map(([key, th]) => {
            const active = theme === key
            return (
              <button key={key} onClick={() => setTheme(key)}
                className="relative flex items-center gap-3 p-3 rounded-xl border transition-all duration-150 active:scale-[0.97]"
                style={{
                  background: th['--surface'],
                  borderColor: active ? th['--accent'] : th['--border'],
                  boxShadow: active ? `0 0 0 1px ${th['--accent']}` : 'none',
                }}
              >
                <div className="flex gap-1 flex-shrink-0">
                  {['--bg','--accent','--accent-light'].map(v => (
                    <div key={v} className="w-3.5 h-3.5 rounded-full" style={{ background: th[v] }} />
                  ))}
                </div>
                <span className="text-xs flex-1 text-left font-medium truncate" style={{ color: th['--text'] }}>
                  {th.name}
                </span>
                {active && <Check size={13} style={{ color: th['--accent'], flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
