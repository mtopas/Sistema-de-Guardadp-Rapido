import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getCategoriaColor } from '../utils/categoriaColors'
import { getHojaDisplayTitle } from '../utils/hojaUtils'
import CategoryPicker from './CategoryPicker'
import IconPicker from './IconPicker'

export default function EditHojaModal({ hoja, onClose, onSaved }) {
  const categorias  = useStore(s => s.categorias)
  const updateHoja    = useStore(s => s.updateHoja)
  const showToast     = useStore(s => s.showToast)

  const [nombre, setNombre]           = useState('')
  const [categoriaId, setCategoriaId] = useState(null)
  const [icono, setIcono]             = useState('')
  const [saving, setSaving]           = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!hoja) return
    setNombre(getHojaDisplayTitle(hoja))
    setCategoriaId(hoja.categoria_id ?? null)
    setIcono(hoja.icono || '')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [hoja])

  if (!hoja) return null

  const accentColor = categoriaId
    ? getCategoriaColor(categorias, categoriaId)
    : 'var(--accent)'

  const handleSave = async () => {
    const trimmed = nombre.trim()
    if (!trimmed) {
      showToast('El nombre no puede estar vacío', 'error')
      return
    }
    if (!categoriaId) {
      showToast('Elegí una categoría', 'error')
      return
    }
    setSaving(true)
    try {
      await updateHoja(hoja.id, {
        contenido: trimmed,
        categoria_id: categoriaId,
        icono: icono || null,
      })
      showToast('Hoja actualizada', 'success')
      onSaved?.()
      onClose()
    } catch {
      showToast('Error al actualizar la hoja', 'error')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 55%, transparent)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-labelledby="edit-hoja-title"
        className="w-full max-w-sm rounded-2xl border p-5 shadow-2xl"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)' }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="edit-hoja-title" className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>
            Editar hoja
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
              Categoría
            </label>
            <CategoryPicker value={categoriaId} onChange={setCategoriaId} />
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtext)' }}>
              Ícono
            </label>
            <IconPicker
              value={icono}
              onChange={setIcono}
              accentColor={accentColor}
              tipo={hoja.tipo}
            />
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
