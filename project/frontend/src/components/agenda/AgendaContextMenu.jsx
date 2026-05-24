import { useEffect, useRef } from 'react'

export default function AgendaContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  // Clamp to viewport
  const clampedX = Math.min(x, window.innerWidth  - 180)
  const clampedY = Math.min(y, window.innerHeight - items.length * 34 - 12)

  useEffect(() => {
    const onKey   = (e) => { if (e.key === 'Escape') onClose() }
    const onClick = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Menú contextual"
      style={{
        position: 'fixed',
        left: clampedX,
        top: clampedY,
        zIndex: 9999,
        minWidth: 160,
        background: 'var(--panel-bg)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
        padding: '4px 0',
        fontSize: 12.5,
      }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
        }
        return (
          <button
            key={i}
            role="menuitem"
            style={{
              display: 'block',
              width: '100%',
              padding: '7px 14px',
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              color: item.danger ? '#ef4444' : 'var(--text)',
              fontSize: 12.5,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = item.danger
                ? 'color-mix(in oklch, #ef4444 10%, transparent)'
                : 'var(--surface)'
            }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            onClick={() => { item.onClick?.(); onClose() }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
