import { useState, useCallback } from 'react'
import { X, Trash2, Save } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { useStore } from '../store/useStore'
import LinkPreview from './LinkPreview'
import { t } from '../utils/i18n'

function EditorToolbar({ editor }) {
  if (!editor) return null
  const btn = (action, label, active) => (
    <button type="button" onClick={action}
      className="px-2 py-0.5 text-[11px] rounded transition-colors duration-100"
      style={{ color: active ? 'var(--accent)' : 'var(--subtext)', background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent' }}
    >{label}</button>
  )
  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 flex-wrap border-b" style={{ borderColor: 'var(--border)' }}>
      {btn(() => editor.chain().focus().toggleBold().run(),        'B',  editor.isActive('bold'))}
      {btn(() => editor.chain().focus().toggleItalic().run(),      'I',  editor.isActive('italic'))}
      {btn(() => editor.chain().focus().toggleUnderline().run(),   'U',  editor.isActive('underline'))}
      {btn(() => editor.chain().focus().toggleHeading({level:1}).run(), 'H1', editor.isActive('heading',{level:1}))}
      {btn(() => editor.chain().focus().toggleBulletList().run(),  '•',  editor.isActive('bulletList'))}
      {btn(() => editor.chain().focus().toggleOrderedList().run(), '1.', editor.isActive('orderedList'))}
    </div>
  )
}

export default function DetailPanel({ hojaId, onClose }) {
  const hojas          = useStore(s => s.hojas)
  const eliminarHoja   = useStore(s => s.eliminarHoja)
  const updateApuntes  = useStore(s => s.updateApuntes)
  const showToast      = useStore(s => s.showToast)
  const lang           = useStore(s => s.lang)

  const hoja = hojas.find(h => h.id === hojaId)
  const [confirmDel, setConfirmDel] = useState(false)
  const [isDirty,    setIsDirty]    = useState(false)
  const [saving,     setSaving]     = useState(false)

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: hoja?.apuntes || '',
    editorProps: { attributes: { class: 'outline-none min-h-[80px] text-sm leading-relaxed' } },
    onUpdate: () => setIsDirty(true),
  }, [hojaId]) // re-init when hojaId changes

  const handleSave = useCallback(async () => {
    if (!editor || saving) return
    setSaving(true)
    try {
      await updateApuntes(hoja.id, editor.getHTML())
      setIsDirty(false)
      showToast(t(lang, 'notesSaved'))
    } catch (_) { showToast('Error', 'error') }
    finally { setSaving(false) }
  }, [editor, hoja, saving, lang])

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return }
    await eliminarHoja(hoja.id)
    showToast(t(lang, 'deleted'))
    onClose()
  }

  if (!hoja) return null

  // Build category breadcrumb label
  const typeLabel = { link: '🔗 Enlace', texto: '📝 Texto', foto: '📷 Foto' }[hoja.tipo] || '📝'
  const domain = hoja.tipo === 'link' ? (() => { try { return new URL(hoja.contenido).hostname } catch { return '' } })() : ''

  return (
    <div
      className="w-80 flex-shrink-0 flex flex-col border-l overflow-hidden animate-fade"
      style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--accent)' }}>
            {typeLabel} · {hoja.categoria_nombre}
          </span>
          <button onClick={onClose} className="flex-shrink-0" style={{ color: 'var(--subtext)' }}>
            <X size={14} />
          </button>
        </div>
        <p className="font-serif text-sm leading-snug" style={{ color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
          {hoja.contenido.replace(/https?:\/\/\S+/g, '').trim().slice(0, 80) || hoja.contenido.slice(0, 80)}
        </p>
        <div className="flex gap-3 mt-1.5 text-[11px]" style={{ color: 'var(--subtext)' }}>
          <span>📅 {new Date(hoja.fecha).toLocaleDateString('es-AR')}</span>
          {domain && <span>▶ {domain}</span>}
        </div>
      </div>

      {/* Link preview */}
      {hoja.tipo === 'link' && (
        <div className="px-3 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <LinkPreview url={hoja.contenido} />
        </div>
      )}

      {/* Apuntes */}
      <div className="flex-1 overflow-y-auto flex flex-col px-4 py-3" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--subtext)' }}>
            ✏️ {t(lang, 'notes')}
          </span>
          {isDirty && (
            <button onClick={handleSave} disabled={saving}
              className="ml-auto flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg disabled:opacity-50 transition-all"
              style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)' }}
            >
              <Save size={10} />
              {saving ? t(lang, 'saving') : t(lang, 'saveNotes')}
            </button>
          )}
        </div>
        <div className="rounded-lg overflow-hidden border flex-1" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <EditorToolbar editor={editor} />
          <div className="px-3 py-2" style={{ color: 'var(--text)' }}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* Category pills + delete */}
      <div className="px-3 py-2 border-t flex items-center gap-2 flex-wrap flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[10px] px-2.5 py-1 rounded-full border"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
          {hoja.categoria_nombre}
        </span>
        <button onClick={handleDelete} className="ml-auto text-[11px] px-2.5 py-1 rounded-lg transition-colors"
          style={confirmDel
            ? { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }
            : { color: 'var(--subtext)' }
          }>
          {confirmDel ? t(lang, 'confirmDelete') : <Trash2 size={13} />}
        </button>
      </div>
    </div>
  )
}
