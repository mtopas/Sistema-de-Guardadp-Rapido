import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, Save, Calendar, MapPin, PenLine } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { useStore } from '../store/useStore'
import LinkPreview from '../components/LinkPreview'
import { getCategoriaColor } from '../utils/categoriaColors'
import { getLeafIcon } from '../utils/leafIcons'
import { extractTags } from '../utils/tags'
import { DEBUG } from '../config'

function EditorToolbar({ editor, color }) {
  if (!editor) return null
  const btn = (action, label, active) => (
    <button type="button" onClick={action}
      className="px-2 py-1 text-xs rounded transition-colors duration-100"
      style={{
        color:      active ? color : 'var(--subtext)',
        background: active ? color + '20' : 'transparent',
      }}
    >{label}</button>
  )
  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b flex-wrap" style={{ borderColor: 'var(--border)' }}>
      {btn(() => editor.chain().focus().toggleBold().run(),                 'B',  editor.isActive('bold'))}
      {btn(() => editor.chain().focus().toggleItalic().run(),               'I',  editor.isActive('italic'))}
      {btn(() => editor.chain().focus().toggleUnderline().run(),            'U',  editor.isActive('underline'))}
      {btn(() => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'H1', editor.isActive('heading', { level: 1 }))}
      {btn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'H2', editor.isActive('heading', { level: 2 }))}
      {btn(() => editor.chain().focus().toggleBulletList().run(),           '•',  editor.isActive('bulletList'))}
      {btn(() => editor.chain().focus().toggleOrderedList().run(),          '1.', editor.isActive('orderedList'))}
    </div>
  )
}

export default function DetailScreen() {
  const { id }        = useParams()
  const navigate      = useNavigate()
  const hojas         = useStore(s => s.hojas)
  const categorias    = useStore(s => s.categorias)
  const eliminarHoja  = useStore(s => s.eliminarHoja)
  const updateApuntes = useStore(s => s.updateApuntes)
  const showToast     = useStore(s => s.showToast)

  const hoja = hojas.find(h => h.id === parseInt(id))

  const color = hoja ? getCategoriaColor(categorias, hoja.categoria_id) : 'var(--accent)'

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDirty,       setIsDirty]       = useState(false)
  const [saving,        setSaving]        = useState(false)

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: hoja?.apuntes || '',
    editorProps: { attributes: { class: 'outline-none min-h-[100px] text-sm leading-relaxed' } },
    onUpdate: () => setIsDirty(true),
  })

  const handleSave = useCallback(async () => {
    if (!editor || saving) return
    setSaving(true)
    try {
      await updateApuntes(hoja.id, editor.getHTML())
      setIsDirty(false)
      showToast('Apuntes guardados')
      if (DEBUG) console.log('apuntes saved for hoja:', hoja.id)
    } catch (_) {
      showToast('Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }, [editor, hoja, saving])

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    await eliminarHoja(hoja.id)
    showToast('Hoja eliminada')
    navigate('/')
  }

  if (!hoja) return (
    <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--subtext)' }}>
      Hoja no encontrada.
    </div>
  )

  const LeafIcon = getLeafIcon(hoja.icono, hoja.tipo)
  const tags     = extractTags(hoja.contenido, hoja.apuntes)
  const title    = hoja.contenido.replace(/https?:\/\/\S+/g, '').trim() || hoja.contenido

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <button onClick={() => navigate(-1)}
          className="p-0.5 transition-colors"
          style={{ color: 'var(--subtext)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--subtext)'}
        >
          <ArrowLeft size={20} />
        </button>

        <span className="flex-1 text-xs truncate font-medium" style={{ color }}>
          {hoja.categoria_nombre}
        </span>

        {isDirty && (
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white transition-all active:scale-95 disabled:opacity-50"
            style={{ background: color }}
          >
            <Save size={12} />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        )}

        <button onClick={handleDelete}
          className="text-sm px-2.5 py-1.5 rounded-lg transition-colors"
          style={confirmDelete
            ? { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }
            : { color: 'var(--subtext)' }
          }
          onMouseEnter={e => { if (!confirmDelete) e.currentTarget.style.color = '#f87171' }}
          onMouseLeave={e => { if (!confirmDelete) e.currentTarget.style.color = 'var(--subtext)' }}
        >
          {confirmDelete ? 'Confirmar' : <Trash2 size={16} />}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 max-w-2xl mx-auto w-full">

        {/* Hero card */}
        <div className="rounded-2xl px-5 py-4 flex items-start gap-4"
          style={{ background: 'var(--surface)', boxShadow: `0 0 0 1px ${color}30` }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: color + '22' }}>
            <LeafIcon size={22} style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium leading-snug mb-3"
              style={{ color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
              {title}
            </p>
            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-medium"
                  style={{ background: color + '22', color }}>
                  ● {hoja.tipo}
                </span>
                {tags.map(tag => (
                  <span key={tag} className="text-[11px] px-2.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--subtext)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {/* Meta */}
            <div className="flex flex-wrap gap-3 text-[11px]" style={{ color: 'var(--subtext)' }}>
              <span className="flex items-center gap-1">
                <Calendar size={10} />
                {new Date(hoja.fecha).toLocaleString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              {hoja.lugar && (
                <span className="flex items-center gap-1">
                  <MapPin size={10} />
                  {hoja.lugar}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Link preview */}
        {hoja.tipo === 'link' && (
          <div>
            <a href={hoja.contenido} target="_blank" rel="noopener noreferrer"
              className="text-xs break-all block px-3 py-2 rounded-xl mb-2"
              style={{ color, background: color + '12', border: `1px solid ${color}30` }}>
              {hoja.contenido}
            </a>
            <LinkPreview url={hoja.contenido} />
          </div>
        )}

        {/* Apuntes */}
        <div>
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <PenLine size={11} style={{ color: 'var(--subtext)' }} />
            <h3 className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--subtext)' }}>
              Apuntes
            </h3>
          </div>

          {/* Read-only preview */}
          {hoja.apuntes && hoja.apuntes.replace(/<[^>]*>/g, '').trim() && (
            <div className="rounded-xl px-4 py-3 mb-3"
              style={{ background: color + '0e', border: `1px solid ${color}25` }}>
              <div
                className="apuntes-preview"
                style={{ color: 'var(--text)' }}
                dangerouslySetInnerHTML={{ __html: hoja.apuntes }}
              />
            </div>
          )}

          {/* Editor */}
          <div className="rounded-xl overflow-hidden border transition-colors"
            style={{ borderColor: color + '40', background: 'var(--surface)' }}>
            <EditorToolbar editor={editor} color={color} />
            <div className="px-4 py-3" style={{ color: 'var(--text)' }}>
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
