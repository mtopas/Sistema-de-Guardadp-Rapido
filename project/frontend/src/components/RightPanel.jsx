import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronLeft, Maximize2, Minimize2, X, Save, Calendar, PenLine, Pencil } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { useStore } from '../store/useStore'
import { t } from '../utils/i18n'
import { BRANCH_COLORS } from '../utils/themes'
import { extractTags } from '../utils/tags'
import { getLeafIcon, LEAF_ICON_LIST, DEFAULT_LEAF_ICON } from '../utils/leafIcons'

function relativeDate(dateStr) {
  const diff  = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  <  1) return 'ahora'
  if (hours <  1) return `${mins}m`
  if (days  <  1) return `${hours}h`
  if (days  < 30) return `${days}d`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// ── Editor toolbar ─────────────────────────────────────────────────────────────
function EditorToolbar({ editor, color }) {
  if (!editor) return null
  const btn = (action, label, active) => (
    <button type="button" onClick={action}
      className="px-2 py-0.5 text-[11px] rounded transition-colors duration-100"
      style={{
        color:      active ? color : 'var(--subtext)',
        background: active ? color + '20' : 'transparent',
      }}
    >{label}</button>
  )
  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 flex-wrap border-b" style={{ borderColor: 'var(--border)' }}>
      {btn(() => editor.chain().focus().toggleBold().run(),                 'B',  editor.isActive('bold'))}
      {btn(() => editor.chain().focus().toggleItalic().run(),               'I',  editor.isActive('italic'))}
      {btn(() => editor.chain().focus().toggleUnderline().run(),            'U',  editor.isActive('underline'))}
      {btn(() => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'H1', editor.isActive('heading', { level: 1 }))}
      {btn(() => editor.chain().focus().toggleBulletList().run(),           '•',  editor.isActive('bulletList'))}
      {btn(() => editor.chain().focus().toggleOrderedList().run(),          '1.', editor.isActive('orderedList'))}
    </div>
  )
}

// ── Shared note card (latest list) ─────────────────────────────────────────────
function NoteCard({ hoja, color, onClick }) {
  const LeafIcon = getLeafIcon(hoja.icono, hoja.tipo)
  const tags     = extractTags(hoja.contenido, hoja.apuntes)
  const title    = hoja.contenido.replace(/https?:\/\/\S+/g, '').trim().slice(0, 80) || hoja.contenido.slice(0, 80)

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl px-4 py-3.5 flex items-center gap-3.5 transition-all duration-150 active:scale-[0.99]"
      style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px rgba(255,255,255,0.05)' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 0 1px ${color}60`}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.05)'}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: color + '22' }}>
        <LeafIcon size={18} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug line-clamp-2 mb-1.5" style={{ color: 'var(--text)' }}>
          {title || '—'}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] px-2.5 py-0.5 rounded-full font-medium"
            style={{ background: color + '22', color }}>
            ● {hoja.tipo ?? 'nota'}
          </span>
          {tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[11px] px-2.5 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--subtext)' }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="flex-shrink-0 text-[12px] pl-1" style={{ color: 'var(--subtext)' }}>
        {relativeDate(hoja.fecha)}
      </div>
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function RightPanel({ openHojaId, onClose }) {
  const hojas         = useStore(s => s.hojas)
  const categorias    = useStore(s => s.categorias)
  const updateApuntes = useStore(s => s.updateApuntes)
  const updateIcono   = useStore(s => s.updateIcono)
  const showToast     = useStore(s => s.showToast)
  const lang          = useStore(s => s.lang)

  const [expanded,       setExpanded]       = useState(false)
  const [view,           setView]           = useState('latest') // 'latest' | 'note' | 'apuntes'
  const [selHoja,        setSelHoja]        = useState(null)
  const [isDirty,        setIsDirty]        = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const iconPickerRef = useRef(null)

  useEffect(() => {
    if (!iconPickerOpen) return
    const handler = e => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target))
        setIconPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [iconPickerOpen])

  // Color map
  const rootCats = categorias.filter(c => !c.padre_id)
  const colorMap = {}
  rootCats.forEach((c, i) => { colorMap[c.id] = BRANCH_COLORS[i % BRANCH_COLORS.length] })
  categorias.filter(c => c.padre_id).forEach(c => {
    colorMap[c.id] = colorMap[c.padre_id] || 'var(--accent)'
  })
  const getColor = (catId) => colorMap[catId] || 'var(--accent)'

  useEffect(() => {
    if (!openHojaId) return
    const hoja = hojas.find(h => h.id === openHojaId)
    if (hoja) { setSelHoja(hoja); setView('note') }
  }, [openHojaId])

  const latestHojas = [...hojas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 8)

  // For foto notes: split the leading <img> from the rest so TipTap doesn't strip it
  const photoImgHtml = (() => {
    if (selHoja?.tipo !== 'foto' || !selHoja?.apuntes) return ''
    const m = selHoja.apuntes.match(/^(<img\b[^>]*\/?>)/i)
    return m ? m[1] : ''
  })()
  const editorInitContent = (() => {
    if (view !== 'apuntes' || !selHoja) return ''
    if (photoImgHtml) return selHoja.apuntes.slice(photoImgHtml.length).trim()
    return selHoja.apuntes || ''
  })()

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: editorInitContent,
    editorProps: { attributes: { class: 'outline-none min-h-[120px] text-sm leading-relaxed' } },
    onUpdate: () => setIsDirty(true),
  }, [view === 'apuntes' ? selHoja?.id : null])

  const handleSave = useCallback(async () => {
    if (!editor || saving || !selHoja) return
    setSaving(true)
    const imgPrefix = selHoja.tipo === 'foto'
      ? (selHoja.apuntes?.match(/^(<img\b[^>]*\/?>)/i)?.[1] ?? '')
      : ''
    const newApuntes = imgPrefix + editor.getHTML()
    try {
      await updateApuntes(selHoja.id, newApuntes)
      setSelHoja(prev => ({ ...prev, apuntes: newApuntes }))
      setIsDirty(false)
      showToast(t(lang, 'notesSaved'))
    } catch (_) { showToast('Error', 'error') }
    finally { setSaving(false) }
  }, [editor, selHoja, saving, lang])

  const handleIconChange = useCallback(async (key) => {
    setIconPickerOpen(false)
    try {
      await updateIcono(selHoja.id, key)
      setSelHoja(prev => ({ ...prev, icono: key }))
    } catch (_) { showToast('Error', 'error') }
  }, [selHoja, updateIcono, showToast])

  const handleClose = () => {
    setView('latest')
    setSelHoja(null)
    setIsDirty(false)
    onClose?.()
  }

  const handleBack = () => {
    if (view === 'apuntes') setView('note')
    else handleClose()
  }

  const panelWidth = expanded ? '50vw' : '300px'
  const dotColor   = selHoja ? getColor(selHoja.categoria_id) : 'var(--accent)'

  const LeafIcon = selHoja ? getLeafIcon(selHoja.icono, selHoja.tipo) : null

  return (
    <div
      className="absolute right-0 top-0 h-full z-20 flex flex-col transition-all duration-300 overflow-hidden"
      style={{
        width:          panelWidth,
        background:     'var(--panel-bg)',
        backdropFilter: 'blur(18px)',
        borderLeft:     '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 min-w-0">
          {view !== 'latest' && (
            <button onClick={handleBack} className="flex-shrink-0" style={{ color: 'var(--subtext)' }}>
              <ChevronLeft size={14} />
            </button>
          )}
          <span className="text-[10px] uppercase tracking-widest font-semibold truncate" style={{ color: 'var(--subtext)' }}>
            {view === 'latest'  && t(lang, 'latestLeaves')}
            {view === 'note'    && selHoja?.categoria_nombre}
            {view === 'apuntes' && (
              <span>
                {t(lang, 'apuntes')}
                {selHoja && (
                  <span className="ml-2 normal-case font-normal" style={{ color: dotColor }}>
                    — {selHoja.categoria_nombre}
                  </span>
                )}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {view === 'apuntes' && isDirty && (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg disabled:opacity-50 transition-all"
              style={{ background: dotColor, color: '#fff' }}
            >
              <Save size={10} />
              {saving ? t(lang, 'saving') : t(lang, 'save')}
            </button>
          )}
          <button onClick={() => setExpanded(e => !e)}
            className="p-1 rounded-lg transition-colors"
            style={{ color: 'var(--subtext)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--subtext)'}
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          {view !== 'latest' && (
            <button onClick={handleClose}
              className="p-1 rounded-lg transition-colors"
              style={{ color: 'var(--subtext)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--subtext)'}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto panel-scroll">

        {/* Latest leaves */}
        {view === 'latest' && (
          <div className="px-3 py-3 space-y-2">
            {latestHojas.length === 0 && (
              <p className="text-xs text-center mt-8" style={{ color: 'var(--subtext)' }}>
                {t(lang, 'noHojas')}
              </p>
            )}
            {latestHojas.map(h => (
              <NoteCard key={h.id} hoja={h} color={getColor(h.categoria_id)}
                onClick={() => { setSelHoja(h); setView('note') }} />
            ))}
          </div>
        )}

        {/* Note detail */}
        {view === 'note' && selHoja && (
          <div className="px-4 py-5 space-y-4">

            {/* Hero — icon (+ title for non-foto) */}
            <div className="flex items-center gap-3">
              <div ref={iconPickerRef} className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIconPickerOpen(o => !o)}
                  className="w-11 h-11 rounded-xl flex items-center justify-center relative group"
                  style={{ background: dotColor + '22' }}
                  title="Cambiar ícono"
                >
                  {LeafIcon && <LeafIcon size={20} style={{ color: dotColor }} />}
                  <span className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: dotColor + '44' }}>
                    <Pencil size={13} style={{ color: '#fff' }} />
                  </span>
                </button>
                {iconPickerOpen && (
                  <div className="absolute z-50 top-12 left-0 p-2 rounded-xl border shadow-2xl"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)', width: '220px' }}>
                    <div className="grid grid-cols-8 gap-1">
                      {LEAF_ICON_LIST.map(({ key, Icon }) => {
                        const selected = (selHoja.icono || DEFAULT_LEAF_ICON[selHoja.tipo] || 'FileText') === key
                        return (
                          <button key={key} type="button" title={key}
                            onClick={() => handleIconChange(key)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-100"
                            style={{
                              background:    selected ? dotColor + '30' : 'transparent',
                              outline:       selected ? `2px solid ${dotColor}70` : 'none',
                              outlineOffset: '1px',
                            }}
                            onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                            onMouseLeave={e => { if (!selected) e.currentTarget.style.background = selected ? dotColor + '30' : 'transparent' }}
                          >
                            <Icon size={14} style={{ color: selected ? dotColor : 'var(--subtext)' }} />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              {selHoja.tipo !== 'foto' && (
                <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text)', fontFamily: "'Playfair Display', serif" }}>
                  {selHoja.contenido.replace(/https?:\/\/\S+/g, '').trim() || selHoja.contenido}
                </p>
              )}
            </div>

            {/* Link */}
            {selHoja.tipo === 'link' && (
              <a href={selHoja.contenido} target="_blank" rel="noopener noreferrer"
                className="text-xs break-all block px-3 py-2 rounded-xl"
                style={{ color: dotColor, background: dotColor + '12', border: `1px solid ${dotColor}30` }}>
                {selHoja.contenido}
              </a>
            )}

            {/* Tags */}
            {extractTags(selHoja.contenido, selHoja.apuntes).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {extractTags(selHoja.contenido, selHoja.apuntes).map(tag => (
                  <span key={tag} className="text-[11px] px-2.5 py-0.5 rounded-full"
                    style={{ background: dotColor + '20', color: dotColor }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Date */}
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--subtext)' }}>
              <Calendar size={11} />
              {new Date(selHoja.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>

            {/* Apuntes preview + edit button */}
            {selHoja.apuntes?.trim() && (
              <div className="rounded-xl px-3 py-2.5"
                style={{ background: dotColor + '0e', border: `1px solid ${dotColor}25` }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <PenLine size={10} style={{ color: dotColor }} />
                  <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: dotColor }}>
                    {t(lang, 'apuntes')}
                  </span>
                </div>
                <div
                  className="apuntes-preview"
                  style={{ color: 'var(--text)' }}
                  dangerouslySetInnerHTML={{ __html: selHoja.apuntes }}
                />
              </div>
            )}

            <button
              onClick={() => setView('apuntes')}
              className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
              style={{ background: dotColor + '18', color: dotColor, border: `1px solid ${dotColor}40` }}
              onMouseEnter={e => e.currentTarget.style.background = dotColor + '28'}
              onMouseLeave={e => e.currentTarget.style.background = dotColor + '18'}
            >
              <PenLine size={12} />
              {selHoja.apuntes?.trim()
                ? t(lang, 'editApuntes') || 'Editar apuntes'
                : t(lang, 'apuntes')}
            </button>
          </div>
        )}

        {/* Apuntes editor */}
        {view === 'apuntes' && selHoja && (
          <div className="px-3 py-3 space-y-3">
            {/* Frozen photo at top of editor */}
            {photoImgHtml && (
              <div className="rounded-xl overflow-hidden border"
                style={{ borderColor: dotColor + '30' }}
                dangerouslySetInnerHTML={{ __html: photoImgHtml }}
              />
            )}
            {/* Title hint for non-foto */}
            {!photoImgHtml && (
              <p className="text-xs line-clamp-2 leading-snug pb-3 border-b"
                style={{ color: 'var(--subtext)', borderColor: 'var(--border)' }}>
                {selHoja.contenido.replace(/https?:\/\/\S+/g, '').trim() || selHoja.contenido}
              </p>
            )}
            <div className="rounded-xl overflow-hidden border"
              style={{ borderColor: dotColor + '40', background: 'rgba(255,255,255,0.04)' }}>
              <EditorToolbar editor={editor} color={dotColor} />
              <div className="px-3 py-2" style={{ color: 'var(--text)' }}>
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
