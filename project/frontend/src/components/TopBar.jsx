import { useNavigate } from 'react-router-dom'
import { Search, Bell, Plus, Settings } from 'lucide-react'
import { useStore } from '../store/useStore'
import { t } from '../utils/i18n'

const kbdStyle = {
  borderColor: 'var(--border)',
  color: 'var(--subtext)',
  background: 'var(--bg)',
  fontFamily: 'var(--font-mono)',
}

function IconButton({ children, onClick, ariaLabel, badge = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="relative inline-flex items-center justify-center rounded-[10px] transition-colors duration-150"
      style={{
        width: 32, height: 32, color: 'var(--subtext)',
        background: 'transparent', border: '1px solid transparent',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--surface)'
        e.currentTarget.style.color = 'var(--text)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--subtext)'
      }}
    >
      {children}
      {badge && (
        <span
          className="absolute"
          style={{
            top: 6, right: 6,
            width: 8, height: 8, borderRadius: 999,
            background: 'var(--accent)',
            boxShadow: '0 0 0 2px var(--bg)',
          }}
        />
      )}
    </button>
  )
}

export default function TopBar({ searchQuery, onSearchChange }) {
  const navigate    = useNavigate()
  const userName    = useStore(s => s.userName)
  const lang        = useStore(s => s.lang)
  const openCapture = useStore(s => s.openCapture)
  const initial     = userName ? userName.trim()[0].toUpperCase() : '?'
  const title       = (t(lang, 'brandName') || 'Bóveda').toUpperCase()

  return (
    <header
      className="h-[60px] shrink-0 sticky top-0 z-30 flex items-center px-6 gap-6 border-b"
      style={{
        background: 'var(--panel-bg)',
        borderColor: 'var(--border)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Module title */}
      <button
        type="button"
        onClick={() => navigate('/')}
        aria-label="Inicio"
        className="flex items-center rounded-md select-none transition-transform duration-150 hover:scale-[1.03] active:scale-95 focus:outline-none"
      >
        <span
          className="gradient-text font-bold"
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 28,
            lineHeight: 1.2,
            display: 'inline-block',
            paddingBottom: '0.08em',
            paddingRight: '0.18em',
            paddingLeft: '0.02em',
          }}
        >
          {title}
        </span>
      </button>

      {/* Search */}
      <div className="flex-1 max-w-[520px] mx-auto relative">
        <div
          className="flex items-center gap-2 px-3 h-9 rounded-xl border transition-colors duration-150"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <Search size={15} style={{ color: 'var(--subtext)', flexShrink: 0 }} />
          <input
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={t(lang, 'searchPlaceholder')}
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:opacity-60"
            style={{ color: 'var(--text)' }}
          />
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border text-[10px]" style={kbdStyle}>Ctrl</kbd>
            <kbd className="px-1.5 py-0.5 rounded border text-[10px]" style={kbdStyle}>M</kbd>
          </div>
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        <IconButton ariaLabel="Notificaciones" badge>
          <Bell size={16} />
        </IconButton>

        <div className="w-px h-6" style={{ background: 'var(--border)' }} />

        <button
          type="button"
          onClick={openCapture}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-[13px] font-medium transition-all duration-150 active:scale-[0.985]"
          style={{
            background: 'var(--cta-bg)',
            color: 'var(--cta-text)',
            border: '1px solid transparent',
            boxShadow: 'var(--shadow-accent)',
          }}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.06)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'none'}
        >
          <Plus size={15} strokeWidth={2} />
          Capturar
        </button>

        <div className="w-px h-6" style={{ background: 'var(--border)' }} />

        <div className="flex items-center gap-2.5 pl-1">
          <div
            className="w-9 h-9 rounded-full grid place-items-center shrink-0"
            style={{
              background: 'var(--cta-bg)',
              color: 'var(--cta-text)',
              fontFamily: "var(--font-serif)",
              fontStyle: 'italic',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {initial}
          </div>
          <div className="hidden lg:flex flex-col leading-tight min-w-0">
            <div className="text-[12.5px] font-medium truncate" style={{ color: 'var(--text)' }}>
              {userName || '—'}
            </div>
            <div className="text-[10.5px] truncate" style={{ color: 'var(--subtext)' }}>
              HomeLab · local
            </div>
          </div>
          <IconButton onClick={() => navigate('/settings')} ariaLabel="Ajustes">
            <Settings size={16} />
          </IconButton>
        </div>
      </div>
    </header>
  )
}
