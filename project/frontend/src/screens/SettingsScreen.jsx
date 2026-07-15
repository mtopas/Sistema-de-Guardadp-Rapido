import { Check } from 'lucide-react'
import { useStore } from '../store/useStore'
import { THEMES, FONT_PAIRS, SECTION_ORDER, SECTION_NAMES } from '../utils/themes'
import { t } from '../utils/i18n'

const SECTIONS = SECTION_ORDER

export default function SettingsScreen() {
  const sectionThemes      = useStore(s => s.sectionThemes)
  const sectionFontPairs   = useStore(s => s.sectionFontPairs)
  const setThemeForSection = useStore(s => s.setThemeForSection)
  const setFontPairForSection = useStore(s => s.setFontPairForSection)
  const lang             = useStore(s => s.lang)
  const setLang     = useStore(s => s.setLang)
  const userName    = useStore(s => s.userName)
  const setUserName = useStore(s => s.setUserName)

  return (
    <div className="px-4 py-6 max-w-xl mx-auto space-y-8">
      <h2 className="font-semibold text-lg" style={{ color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
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
                  background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--surface)',
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

      {/* Themes — per section */}
      <section>
        <h3 className="text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--subtext)' }}>
          {t(lang, 'colorTheme')}
        </h3>
        <div className="flex flex-col gap-6">
          {SECTIONS.map(section => (
            <div key={section}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                {SECTION_NAMES[section]}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(THEMES).map(([key, th]) => {
                  const active = sectionThemes[section] === key
                  return (
                    <button key={key} onClick={() => setThemeForSection(section, key)}
                      className="relative flex items-center gap-3 p-3 rounded-xl border transition-all duration-150 active:scale-[0.97]"
                      style={{
                        background: th['--bg'],
                        borderColor: active ? th['--accent'] : th['--border'],
                        boxShadow: active ? `0 0 0 1px ${th['--accent']}` : 'none',
                      }}
                    >
                      <div className="flex gap-1 flex-shrink-0">
                        <div className="w-4 h-4 rounded-full border" style={{ background: th['--surface'], borderColor: th['--border'] }} />
                        <div className="w-4 h-4 rounded-full" style={{ background: `linear-gradient(135deg, ${th['--accent']}, ${th['--accent-light']})` }} />
                        <div className="w-4 h-4 rounded-full" style={{ background: th['--accent-deep'] }} />
                      </div>
                      <span className="text-xs flex-1 text-left font-medium truncate" style={{ color: th['--text'], fontFamily: th['--font-sans'] }}>
                        {th.name}
                      </span>
                      {active && <Check size={13} style={{ color: th['--accent'], flexShrink: 0 }} />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Typography — per section */}
      <section>
        <h3 className="text-[10px] uppercase tracking-widest mb-4" style={{ color: 'var(--subtext)' }}>
          Tipografía
        </h3>
        <div className="flex flex-col gap-6">
          {SECTIONS.map(section => (
            <div key={section}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                {SECTION_NAMES[section]}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(FONT_PAIRS).map(([key, fp]) => {
                  const active = sectionFontPairs[section] === key
                  return (
                    <button key={key} onClick={() => setFontPairForSection(section, key)}
                      className="relative flex flex-col items-start gap-1 p-3 rounded-xl border transition-all duration-150 active:scale-[0.97]"
                      style={{
                        background: 'var(--surface)',
                        borderColor: active ? 'var(--accent)' : 'var(--border)',
                        boxShadow: active ? '0 0 0 1px var(--accent)' : 'none',
                      }}
                    >
                      <span className="text-sm font-medium truncate w-full text-left" style={{ ...fp.titleStyle, color: 'var(--text)' }}>
                        {fp.title}
                      </span>
                      <span className="text-[11px] truncate w-full text-left" style={{ ...fp.bodyStyle, color: 'var(--subtext)' }}>
                        {fp.body}
                      </span>
                      <span className="text-[10px] truncate w-full text-left" style={{ color: 'var(--mute)' }}>
                        {fp.name}
                      </span>
                      {active && <Check size={13} className="absolute top-2.5 right-2.5" style={{ color: 'var(--accent)' }} />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
