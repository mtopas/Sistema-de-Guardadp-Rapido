import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { LEAF_ICON_LIST, LEAF_ICON_MAP, DEFAULT_LEAF_ICON } from '../utils/leafIcons'
import { BRANCH_COLORS } from '../utils/themes'

export default function IconPicker({ value, onChange, accentColor, tipo, colorValue, onColorChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const color = accentColor || 'var(--accent)'

  // Resolve which icon to display in the trigger button
  const activeKey = value || DEFAULT_LEAF_ICON[tipo] || 'FileText'
  const ActiveIcon = LEAF_ICON_MAP[activeKey] || LEAF_ICON_MAP['FileText']

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-colors duration-150"
        style={{
          background: 'var(--surface)',
          borderColor: open ? color : 'var(--border)',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = color }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        <span
          className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ background: color + '25' }}
        >
          <ActiveIcon size={15} style={{ color }} />
        </span>
        <span className="text-xs" style={{ color: 'var(--subtext)' }}>Ícono</span>
        <ChevronDown size={13} style={{
          color: 'var(--subtext)',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 150ms',
        }} />
      </button>

      {/* Dropdown grid */}
      {open && (
        <div
          className="absolute z-50 mt-1 p-2 rounded-xl border shadow-2xl"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', width: '240px' }}
        >
          {onColorChange && (
            <div className="flex flex-wrap gap-1 pb-2 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
              {BRANCH_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => onColorChange(c)}
                  className="w-6 h-6 rounded-md transition-all"
                  style={{
                    background: c,
                    outline: colorValue === c ? '2px solid var(--text)' : 'none',
                    outlineOffset: 1,
                  }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          )}
          <div className="grid grid-cols-8 gap-1">
            {LEAF_ICON_LIST.map(({ key, Icon }) => {
              const selected = (value || DEFAULT_LEAF_ICON[tipo] || 'FileText') === key
              return (
                <button
                  key={key}
                  type="button"
                  title={key}
                  onClick={() => { onChange(key); setOpen(false) }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-100"
                  style={{
                    background:  selected ? color + '30' : 'transparent',
                    outline:     selected ? `2px solid ${color}70` : 'none',
                    outlineOffset: '1px',
                  }}
                  onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                  onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
                >
                  <Icon size={14} style={{ color: selected ? color : 'var(--subtext)' }} />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
