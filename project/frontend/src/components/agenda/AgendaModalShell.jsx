import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function AgendaModalShell({ title, onClose, onSave, saving, children, deleteBtn, wide }) {
  const modalRef = useRef(null)

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { onSave?.(); return }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, onSave])

  // Focus trap
  useEffect(() => {
    const el = modalRef.current
    if (!el) return
    const nodes = () => [...el.querySelectorAll(FOCUSABLE)]
    const first = nodes()[0]
    if (first) first.focus()
    const trap = (e) => {
      if (e.key !== 'Tab') return
      const all = nodes()
      if (!all.length) return
      const fi = all[0], la = all[all.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === fi) { e.preventDefault(); la.focus() }
      } else {
        if (document.activeElement === la) { e.preventDefault(); fi.focus() }
      }
    }
    el.addEventListener('keydown', trap)
    return () => el.removeEventListener('keydown', trap)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-overlay"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agenda-modal-title"
        className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'} rounded-lg border shadow-2xl flex flex-col`}
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h2 id="agenda-modal-title" className="text-[16px] font-semibold serif italic">{title}</h2>
          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="Cerrar">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto panel-scroll px-5 py-4">
          {children}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
          {deleteBtn || <div />}
          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 rounded-lg text-[13px] border"
              style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}
              onClick={onClose}
            >
              Cancelar
            </button>
            {onSave && (
              <button
                className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
                style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)' }}
                disabled={saving}
                onClick={onSave}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
