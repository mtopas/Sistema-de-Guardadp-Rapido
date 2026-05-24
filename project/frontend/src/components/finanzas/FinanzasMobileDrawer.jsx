import { useEffect } from 'react'
import { X } from 'lucide-react'
import FinanzasLeftPanel from './FinanzasLeftPanel'

/**
 * Slide-in drawer wrapping FinanzasLeftPanel for mobile (< md).
 * On md+ the panel is always visible inline — never show this.
 */
export default function FinanzasMobileDrawer({ onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 md:hidden"
        style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="fixed top-0 left-0 h-full z-50 md:hidden flex flex-col shadow-2xl"
        style={{
          width: 280,
          background: 'var(--panel-bg)',
          borderRight: '1px solid var(--border)',
          animation: 'drawer-slide-in-left 200ms ease-out',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Resumen financiero"
      >
        {/* Close row */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}>
          <span className="text-[13px] font-semibold serif italic" style={{ color: 'var(--text)' }}>
            Resumen
          </span>
          <button onClick={onClose} className="icon-btn-fin" aria-label="Cerrar resumen">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto panel-scroll">
          <FinanzasLeftPanel />
        </div>
      </div>
    </>
  )
}
