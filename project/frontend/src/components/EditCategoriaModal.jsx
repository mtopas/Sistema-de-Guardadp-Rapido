import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { BRANCH_COLORS } from '../utils/themes'

const CATEGORY_EMOJIS = ['📁', '📚', '💡', '🔗', '🎯', '📝', '🏠', '💼', '🎨', '🎵', '⭐', '🔬', '💰', '🌱', '📌', '🗂️']

export default function EditCategoriaModal({ cat, color, onClose }) {
  const actualizarCategoria = useStore(s => s.actualizarCategoria)
  const showToast           = useStore(s => s.showToast)

  const [nombre, setNombre] = useState('')
  const [icono, setIcono]   = useState('')
  const [colorSel, setColorSel] = useState(BRANCH_COLORS[0])
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!cat) return
    setNombre(cat.nombre || '')
    setIcono(cat.icono || '')
    setColorSel(cat.color || color || BRANCH_COLORS[0])
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [cat, color])

  if (!cat) return null

  const handleSave = async () => {
    const trimmed = nombre.trim()
    if (!trimmed) {
      showToast('El nombre no puede estar vacío', 'error')
      return
    }
    setSaving(true)
    const ok = await actualizarCategoria(cat.id, {
      nombre: trimmed,
      icono: icono.trim() || null,
      color: colorSel,
    })
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
        aria-labelledby="edit-cat-title"
        className="w-full max-w-sm rounded-2xl border p-5 shadow-2xl"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="edit-cat-title" className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
            Editar categoría
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg grid place-items-center transition-colors"
            style={{ color: 'var(--subtext)' }}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtext)' }}>
              Nombre
            </label>
            <input
              ref={inputRef}
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
              className="w-full px-3 py-2 rounded-xl border outline-none text-[13px] bg-transparent"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtext)' }}>
              Emoji
            </label>
            <input
              type="text"
              value={icono}
              onChange={e => setIcono(e.target.value.slice(0, 4))}
              placeholder="Opcional"
              className="w-full px-3 py-2 rounded-xl border outline-none text-[13px] bg-transparent mb-2"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            />
            <div className="flex flex-wrap gap-1">
              {CATEGORY_EMOJIS.map(em => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setIcono(em)}
                  className="w-8 h-8 rounded-lg text-base transition-all"
                  style={{
                    background: icono === em ? 'color-mix(in oklch, var(--accent) 18%, transparent)' : 'var(--surface)',
                    outline: icono === em ? '2px solid var(--accent)' : 'none',
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtext)' }}>
              Color
            </label>
            <p className="text-[11px] mb-2" style={{ color: 'var(--subtext)' }}>
              Las subcategorías heredarán este color.
            </p>
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
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-60"
            style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', border: 'none' }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
