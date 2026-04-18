import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Settings } from 'lucide-react'
import { useStore } from '../store/useStore'
import { t } from '../utils/i18n'

export default function TopBar({ searchQuery, onSearchChange }) {
  const navigate  = useNavigate()
  const userName  = useStore(s => s.userName)
  const lang      = useStore(s => s.lang)
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef(null)

  const initial = userName ? userName.trim()[0].toUpperCase() : '?'

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div
      className="flex items-center gap-3 px-4 h-12 flex-shrink-0 z-30 border-b"
      style={{
        background: 'var(--panel-bg)',
        backdropFilter: 'blur(18px)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Logo */}
      <button onClick={() => navigate('/')} className="flex-shrink-0 select-none">
        <span
          className="gradient-text font-bold text-xl tracking-wide"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          hoja
        </span>
      </button>

      {/* Search — centered, takes remaining space */}
      <div
        className="flex-1 flex items-center gap-2 rounded-xl px-3 py-1.5 border transition-colors duration-150 max-w-lg mx-auto"
        style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)' }}
        onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <Search size={13} style={{ color: 'var(--subtext)', flexShrink: 0 }} />
        <input
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={t(lang, 'searchPlaceholder')}
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--text)' }}
        />
      </div>

      {/* Avatar + dropdown */}
      <div className="relative flex-shrink-0" ref={dropRef}>
        <button
          onClick={() => setDropOpen(o => !o)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold select-none transition-all duration-150 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-light))',
            color: '#fff',
            boxShadow: dropOpen ? '0 0 0 2px var(--accent)' : 'none',
          }}
        >
          {initial}
        </button>

        {dropOpen && (
          <div
            className="absolute right-0 top-10 w-52 rounded-xl border shadow-xl overflow-hidden z-50 animate-fade"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            {/* Name row */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-light))', color: '#fff' }}
              >
                {initial}
              </div>
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                {userName || '—'}
              </p>
            </div>

            {/* Settings link */}
            <button
              onClick={() => { setDropOpen(false); navigate('/settings') }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors duration-100"
              style={{ color: 'var(--subtext)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--subtext)'; e.currentTarget.style.background = 'transparent' }}
            >
              <Settings size={14} />
              {t(lang, 'settings')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
