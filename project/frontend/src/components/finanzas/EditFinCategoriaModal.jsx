import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { BRANCH_COLORS } from '../../utils/themes'
import { isFinCategoriaReservada } from '../../data/finCategorias'

export default function EditFinCategoriaModal({ cat, onClose }) {
  const lang               = useStore(s => s.lang)
  const updateFinCategoria = useStore(s => s.updateFinCategoria)
  const showToast          = useStore(s => s.showToast)

  const [nombre, setNombre] = useState('')
  const [colorSel, setColorSel] = useState(BRANCH_COLORS[0])
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  const reserved = cat ? isFinCategoriaReservada(cat) : false

  useEffect(() => {
    if (!cat) return
    setNombre(cat.name || '')
    setColorSel(cat.color || BRANCH_COLORS[0])
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [cat])

  if (!cat) return null

  const handleSave = async () => {
    const trimmed = nombre.trim()
    if (!reserved && !trimmed) {
      showToast(t(lang, 'finCatNameRequired'), 'error')
      return
    }
    setSaving(true)
    const patch = { color: colorSel }
    if (!reserved) patch.nombre = trimmed
    const ok = await updateFinCategoria(cat.id, patch)
    setSaving(false)
    if (ok) onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 55%, transparent)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-labelledby="edit-fin-cat-title"
        className="w-full max-w-sm rounded-2xl border p-5 shadow-2xl"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="edit-fin-cat-title" className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
            {t(lang, 'finCatEditTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg grid place-items-center transition-colors"
            style={{ color: 'var(--subtext)' }}
            aria-label={t(lang, 'cancel')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtext)' }}>
              {t(lang, 'finCatNamePlaceholder')}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={nombre}
              disabled={reserved}
              onChange={e => setNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
              className="w-full px-3 py-2 rounded-xl border outline-none text-[13px] bg-transparent disabled:opacity-60"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            {reserved && (
              <p className="text-[10.5px] mt-1" style={{ color: 'var(--subtext)' }}>
                {t(lang, 'finCatReservedName')}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtext)' }}>
              Color
            </label>
            <div className="flex flex-wrap gap-1.5">
              {BRANCH_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColorSel(c)}
                  className="w-7 h-7 rounded-lg transition-all"
                  style={{
                    background: c,
                    outline: colorSel === c ? '2px solid var(--text)' : 'none',
                    outlineOffset: 2,
                  }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
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
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-60"
            style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', border: 'none' }}
          >
            {saving ? t(lang, 'saving') : t(lang, 'save')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
