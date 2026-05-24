/**
 * Reusable left/right side panel for Agenda tabs.
 * Provides consistent width, border, scroll behaviour and optional header.
 *
 * Props:
 *   side       'left' | 'right'   — which edge the border appears on (default 'left')
 *   width      string             — Tailwind/inline width, default 'w-[260px]'
 *   className  string             — extra classes
 *   header     ReactNode          — optional sticky header rendered above the scroll area
 *   children   ReactNode
 */
export default function AgendaPanel({
  side      = 'left',
  width     = 'w-[260px]',
  className = '',
  header,
  children,
}) {
  const borderClass = side === 'right' ? 'border-l' : 'border-r'

  return (
    <aside
      className={`${width} shrink-0 flex flex-col h-full ${borderClass} ${className}`}
      style={{ borderColor: 'var(--border)' }}
    >
      {header && (
        <div
          className="shrink-0 px-4 pt-4 pb-2"
          style={{ borderBottom: header ? '1px solid var(--border)' : 'none' }}
        >
          {header}
        </div>
      )}
      <div className="flex-1 overflow-y-auto panel-scroll px-4 py-3">
        {children}
      </div>
    </aside>
  )
}
