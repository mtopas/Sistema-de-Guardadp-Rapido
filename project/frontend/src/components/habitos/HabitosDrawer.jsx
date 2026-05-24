import { useEffect } from 'react'
import { X } from 'lucide-react'
import HabitosRightPanel from './HabitosRightPanel'

/**
 * Slide-in drawer for HabitosRightPanel on screens < xl.
 * On xl+ the panel is always visible inline; this drawer is never shown.
 */
export default function HabitosDrawer({ selectedId, onEdit, onClose }) {
  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 xl:hidden"
        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="fixed top-0 right-0 h-full z-50 xl:hidden flex flex-col shadow-2xl"
        style={{
          width: 280,
          background: 'var(--panel-bg)',
          borderLeft: '1px solid var(--border)',
          animation: 'drawer-slide-in 200ms ease-out',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del hábito"
      >
        {/* Close button row */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[13px] font-semibold serif italic" style={{ color: 'var(--text)' }}>
            Detalle
          </span>
          <button onClick={onClose} className="icon-btn" aria-label="Cerrar detalle">
            <X size={15} />
          </button>
        </div>

        {/* Panel content — reuse the same component, hide its own xl wrapper */}
        <div className="flex-1 overflow-y-auto">
          <HabitosRightPanel selectedId={selectedId} onEdit={onEdit} forceVisible />
        </div>
      </div>
    </>
  )
}
