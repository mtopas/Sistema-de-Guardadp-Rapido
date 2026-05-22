import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function AgendaModalShell({ title, onClose, onSave, saving, children, deleteBtn, wide }) {
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose()
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onSave?.()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, onSave])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-overlay"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'} rounded-2xl border shadow-2xl flex flex-col`}
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-[16px] font-semibold serif italic">{title}</h2>
          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={onClose}>
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
              className="px-4 py-2 rounded-xl text-[13px] border"
              style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}
              onClick={onClose}
            >
              Cancelar
            </button>
            {onSave && (
              <button
                className="px-4 py-2 rounded-xl text-[13px] font-medium transition-all"
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
