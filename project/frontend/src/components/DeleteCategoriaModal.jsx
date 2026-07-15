import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { t } from '../utils/i18n'

export default function DeleteCategoriaModal({ cat, hojaCount, subcatCount, onClose, onDeleted }) {
  const lang              = useStore(s => s.lang)
  const eliminarCategoria = useStore(s => s.eliminarCategoria)
  const showToast         = useStore(s => s.showToast)

  if (!cat) return null

  const blocked = hojaCount > 0 || subcatCount > 0

  const handleDelete = async () => {
    if (blocked) {
      if (hojaCount > 0) showToast(t(lang, 'bovedaCatHasHojas'), 'error')
      else showToast(t(lang, 'bovedaCatHasSubcats'), 'error')
      onClose()
      return
    }
    const ok = await eliminarCategoria(cat.id)
    if (ok) {
      onDeleted?.()
      onClose()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 55%, transparent)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="alertdialog"
        aria-labelledby="del-cat-title"
        className="w-full max-w-sm rounded-2xl border p-5 shadow-2xl"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id="del-cat-title" className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
            {t(lang, 'bovedaDeleteCatTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg grid place-items-center"
            style={{ color: 'var(--subtext)' }}
            aria-label={t(lang, 'cancel')}
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--text-2)' }}>
          {t(lang, 'bovedaDeleteCatConfirm').replace('{name}', cat.nombre)}
        </p>
        {hojaCount > 0 && (
          <p className="text-[12px] mb-2" style={{ color: '#ef4444' }}>
            {t(lang, 'bovedaCatHasHojas')} ({hojaCount})
          </p>
        )}
        {subcatCount > 0 && (
          <p className="text-[12px] mb-4" style={{ color: '#ef4444' }}>
            {t(lang, 'bovedaCatHasSubcats')} ({subcatCount})
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl text-[13px] font-medium border"
            style={{ borderColor: 'var(--border)', color: 'var(--subtext)', background: 'transparent' }}
          >
            {t(lang, 'cancel')}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={blocked}
            className="flex-1 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-50"
            style={{ background: '#ef4444', color: '#fff', border: 'none' }}
          >
            {t(lang, 'confirmDelete')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
