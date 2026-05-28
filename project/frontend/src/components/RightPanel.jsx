import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X, Calendar, Pencil, FileText, Link as LinkIcon, Image as ImageIcon } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useStore } from '../store/useStore'
import { t } from '../utils/i18n'
import { BRANCH_COLORS } from '../utils/themes'
import { extractTags } from '../utils/tags'
import { getLeafIcon, LEAF_ICON_LIST, DEFAULT_LEAF_ICON } from '../utils/leafIcons'
import ScrollArea from './ScrollArea'
import LinkPreview from './LinkPreview'

function relativeDate(dateStr) {
  if (!dateStr) return ''
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

function categoryBreadcrumb(catId, categorias) {
  const map = new Map(categorias.map(c => [c.id, c]))
  const path = []
  let cur = map.get(catId)
  let guard = 0
  while (cur && guard++ < 32) {
    path.unshift(cur)
    cur = cur.padre_id ? map.get(cur.padre_id) : null
  }
  return path
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

// ── Type chip ─────────────────────────────────────────────────────────────────
function TypeChip({ tipo, color }) {
  const meta = {
    link:  { Icon: LinkIcon,  label: 'link'  },
    foto:  { Icon: ImageIcon, label: 'foto'  },
    texto: { Icon: FileText,  label: 'texto' },
  }[tipo] || { Icon: FileText, label: tipo || 'nota' }
  const { Icon: ChipIcon, label } = meta
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10.5px] font-medium border"
      style={{
        background:  color + '22',
        borderColor: color + '40',
        color,
      }}
    >
      <ChipIcon size={10} />
      {label}
    </span>
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
      style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--border)' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 0 1px ${color}60`}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 0 1px var(--border)'}
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
        {relativeDate(hoja.fecha_actualizado || hoja.fecha)}
      </div>
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function RightPanel({ openHojaId, onClose }) {
  const navigate      = useNavigate()
  const hojas         = useStore(s => s.hojas)
  const categorias    = useStore(s => s.categorias)
  const updateApuntes = useStore(s => s.updateApuntes)
  const updateIcono   = useStore(s => s.updateIcono)
  const updateHoja    = useStore(s => s.updateHoja)
  const showToast     = useStore(s => s.showToast)
  const lang          = useStore(s => s.lang)
  const agendaEventos = useStore(s => s.agendaEventos)

  const [expanded,        setExpanded]       = useState(false)
  const [view,            setView]           = useState('latest') // 'latest' | 'note'
  const [selHoja,         setSelHoja]        = useState(null)
  const [saving,          setSaving]         = useState(false)
  const [savedFlash,      setSavedFlash]     = useState(false)
  const [saveError,       setSaveError]      = useState(false)
  const [iconPickerOpen,  setIconPickerOpen] = useState(false)
  const [editContenido,   setEditContenido]  = useState(false)
  const [contenidoDraft,  setContenidoDraft] = useState('')
  const [editCategoria,   setEditCategoria]  = useState(false)
  const iconPickerRef = useRef(null)
  const saveTimerRef  = useRef(null)
  const pendingRef    = useRef(null)
  const selHojaRef    = useRef(null)

  useEffect(() => { selHojaRef.current = selHoja }, [selHoja])

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

  // Keep selHoja in sync with store updates (e.g., fecha_actualizado after save)
  useEffect(() => {
    if (!selHoja) return
    const fresh = hojas.find(h => h.id === selHoja.id)
    if (fresh && fresh.fecha_actualizado !== selHoja.fecha_actualizado) {
      setSelHoja(fresh)
    }
  }, [hojas])

  const latestHojas = useMemo(
    () => [...hojas].sort((a, b) =>
      new Date(b.fecha_actualizado || b.fecha) - new Date(a.fecha_actualizado || a.fecha)
    ).slice(0, 8),
    [hojas]
  )

  // For foto notes: split the leading <img> from the rest so TipTap doesn't strip it
  const photoImgHtml = useMemo(() => {
    if (selHoja?.tipo !== 'foto' || !selHoja?.apuntes) return ''
    const m = selHoja.apuntes.match(/^(<img\b[^>]*\/?>)/i)
    return m ? m[1] : ''
  }, [selHoja?.id, selHoja?.apuntes])

  const editorInitContent = useMemo(() => {
    if (view !== 'note' || !selHoja) return ''
    if (photoImgHtml) return (selHoja.apuntes || '').slice(photoImgHtml.length).trim()
    return selHoja.apuntes || ''
  }, [view, selHoja?.id])

  // ── Autosave (debounced) ────────────────────────────────────────────────────
  const flushSave = useCallback(async () => {
    const target = selHojaRef.current
    if (!target || pendingRef.current == null) return
    const apuntes = pendingRef.current
    pendingRef.current = null
    if (apuntes === (target.apuntes ?? '')) return
    setSaving(true)
    try {
      await updateApuntes(target.id, apuntes)
      setSavedFlash(true)
      setSaveError(false)
      setTimeout(() => setSavedFlash(false), 1200)
    } catch (_) {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }, [updateApuntes, showToast])

  const scheduleSave = useCallback((html) => {
    pendingRef.current = html
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => { flushSave() }, 800)
  }, [flushSave])

  // Flush pending save on hoja switch / unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      flushSave()
    }
  }, [selHoja?.id, flushSave])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: true, autolink: true, linkOnPaste: true }),
      Placeholder.configure({ placeholder: 'Apuntes, #tags, ideas…' }),
    ],
    content: editorInitContent,
    editorProps: { attributes: { class: 'outline-none min-h-[140px] text-sm leading-relaxed tiptap-editor' } },
    onUpdate: ({ editor }) => {
      const imgPrefix = selHojaRef.current?.tipo === 'foto'
        ? (selHojaRef.current.apuntes?.match(/^(<img\b[^>]*\/?>)/i)?.[1] ?? '')
        : ''
      scheduleSave(imgPrefix + editor.getHTML())
    },
  }, [view === 'note' ? selHoja?.id : null])

  const handleIconChange = useCallback(async (key) => {
    setIconPickerOpen(false)
    try {
      await updateIcono(selHoja.id, key)
    } catch (_) { showToast('Error', 'error') }
  }, [selHoja, updateIcono, showToast])

  const handleClose = () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); flushSave() }
    setView('latest')
    setSelHoja(null)
    onClose?.()
  }

  const handleBack = () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); flushSave() }
    handleClose()
  }

  const panelWidth = expanded ? '50vw' : '425px'
  const dotColor   = selHoja ? getColor(selHoja.categoria_id) : 'var(--accent)'
  const LeafIcon   = selHoja ? getLeafIcon(selHoja.icono, selHoja.tipo) : null
  const breadcrumb = selHoja ? categoryBreadcrumb(selHoja.categoria_id, categorias) : []
  const strippedContenido = selHoja
    ? (selHoja.contenido?.replace(/https?:\/\/\S+/g, '').trim() || '')
    : ''
  const title = selHoja
    ? (selHoja.tipo === 'link'
        ? (selHoja.link_preview?.title || strippedContenido || selHoja.contenido || '—')
        : (strippedContenido || selHoja.contenido || '—'))
    : ''
  const linkUrl = selHoja?.tipo === 'link'
    ? (selHoja.contenido.match(/https?:\/\/\S+/)?.[0] || selHoja.contenido)
    : null

  return (
    <div
      className="absolute right-0 top-0 h-full z-20 flex flex-col transition-all duration-300 overflow-hidden"
      style={{
        width:          panelWidth,
        background:     'color-mix(in oklch, var(--panel-bg) 55%, transparent)',
        backdropFilter: 'blur(18px)',
        boxShadow:      'inset 1px 0 0 0 color-mix(in oklch, var(--border) 60%, transparent)',
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
            {view === 'latest' ? t(lang, 'latestLeaves') : t(lang, 'apuntes')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {view === 'note' && saveError && !saving && (
            <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--warning)' }}
              title="El último guardado falló. Se reintentará al editar.">
              ⚠ Sin guardar
            </span>
          )}
          {view === 'note' && (saving || savedFlash) && !saveError && (
            <span className="text-[10px]" style={{ color: savedFlash ? dotColor : 'var(--subtext)' }}>
              {saving ? t(lang, 'saving') : t(lang, 'saved')}
            </span>
          )}
          <button onClick={() => setExpanded(e => !e)}
            className="p-1 rounded-lg transition-colors"
            aria-label={expanded ? 'Contraer panel' : 'Expandir panel'}
            style={{ color: 'var(--subtext)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--subtext)'}
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          {view !== 'latest' && (
            <button onClick={handleClose}
              className="p-1 rounded-lg transition-colors"
              aria-label="Cerrar panel"
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
      <ScrollArea className="flex-1">

        {/* Latest leaves */}
        {view === 'latest' && (
          <div className="px-3 py-3 space-y-2">
            {/* Mini agenda widget */}
            {(() => {
              const todayISO = new Date().toISOString().slice(0, 10)
              const todayEvts = agendaEventos
                .filter(e => e.fecha_inicio?.slice(0, 10) === todayISO && !e.todo_el_dia)
                .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))
                .slice(0, 4)
              if (!todayEvts.length) return null
              return (
                <div className="panel-strong rounded-xl p-3 mb-1">
                  <button
                    className="flex items-center gap-1.5 w-full mb-2"
                    onClick={() => navigate('/agenda?tab=hoy')}
                  >
                    <Calendar size={11} style={{ color: 'var(--accent)' }} />
                    <span className="text-[10.5px] uppercase tracking-widest font-semibold" style={{ color: 'var(--accent)' }}>
                      Agenda hoy
                    </span>
                  </button>
                  <div className="flex flex-col gap-1">
                    {todayEvts.map(e => (
                      <button
                        key={e.id}
                        className="flex items-center gap-2 text-left w-full rounded-lg px-1.5 py-1 hover:bg-[var(--surface)]"
                        onClick={() => navigate('/agenda?tab=hoy')}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: e.calendario_color || 'var(--accent)' }} />
                        <span className="text-[11.5px] flex-1 truncate" style={{ color: 'var(--text)' }}>{e.titulo}</span>
                        <span className="mono text-[10px]" style={{ color: 'var(--mute)' }}>{e.fecha_inicio?.slice(11, 16)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })()}
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

            {/* Row 1: type chip + last edited */}
            <div className="flex items-center gap-2">
              <TypeChip tipo={selHoja.tipo} color={dotColor} />
              <span className="text-[10.5px]" style={{ color: 'var(--subtext)' }}>
                · {t(lang, 'edited') || 'Editado'} {relativeDate(selHoja.fecha_actualizado || selHoja.fecha)}
              </span>
              <div className="flex-1" />
              <div ref={iconPickerRef} className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIconPickerOpen(o => !o)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center relative group"
                  style={{ background: dotColor + '1a' }}
                  title="Cambiar ícono"
                >
                  {LeafIcon && <LeafIcon size={13} style={{ color: dotColor }} />}
                  <span className="absolute inset-0 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: dotColor + '33' }}>
                    <Pencil size={10} style={{ color: '#fff' }} />
                  </span>
                </button>
                {iconPickerOpen && (
                  <div className="absolute z-50 top-9 right-0 p-2 rounded-xl border shadow-2xl"
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
            </div>

            {/* Row 2: title (editable on click) */}
            {editContenido ? (
              <input
                autoFocus
                className="text-[17px] leading-tight font-semibold w-full rounded-lg px-2 py-1 border outline-none"
                style={{ color: 'var(--text)', fontFamily: 'var(--font-serif)', borderColor: dotColor, background: 'transparent' }}
                value={contenidoDraft}
                onChange={e => setContenidoDraft(e.target.value)}
                onBlur={async () => {
                  setEditContenido(false)
                  if (contenidoDraft.trim() && contenidoDraft.trim() !== selHoja.contenido) {
                    await updateHoja(selHoja.id, { contenido: contenidoDraft.trim() })
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') { setEditContenido(false) }
                }}
              />
            ) : (
              <h2
                className="text-[18px] leading-tight font-semibold cursor-text rounded-lg px-1 -mx-1 transition-colors"
                style={{ color: 'var(--text)', fontFamily: 'var(--font-serif)' }}
                title="Click para editar"
                onClick={() => { setEditContenido(true); setContenidoDraft(selHoja.contenido ?? '') }}
                onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in oklch, var(--surface) 60%, transparent)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {title || '—'}
              </h2>
            )}

            {/* Row 3: breadcrumb (clickeable → muestra select de categoría) */}
            <div className="flex items-center gap-1 text-[11px] flex-wrap" style={{ color: 'var(--subtext)' }}>
              {editCategoria ? (
                <>
                  <select
                    autoFocus
                    value={selHoja.categoria_id}
                    className="text-[11px] rounded-lg px-2 py-1 border outline-none"
                    style={{ borderColor: dotColor, background: 'var(--surface)', color: 'var(--text)' }}
                    onChange={async e => {
                      const newCatId = parseInt(e.target.value)
                      setEditCategoria(false)
                      await updateHoja(selHoja.id, { categoria_id: newCatId })
                    }}
                    onBlur={() => setEditCategoria(false)}
                  >
                    {categorias.map(c => (
                      <option key={c.id} value={c.id}>{c.icono ? `${c.icono} ` : ''}{c.nombre}</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  {breadcrumb.length === 0 && <span>—</span>}
                  {breadcrumb.map((c, idx) => (
                    <span key={c.id} className="inline-flex items-center gap-1">
                      {idx > 0 && <ChevronRight size={10} style={{ opacity: 0.6 }} />}
                      <button
                        className="hover:underline transition-colors"
                        style={{ color: idx === breadcrumb.length - 1 ? dotColor : 'var(--subtext)' }}
                        onClick={() => setEditCategoria(true)}
                        title="Cambiar categoría"
                      >
                        {c.icono ? `${c.icono} ` : ''}{c.nombre}
                      </button>
                    </span>
                  ))}
                </>
              )}
              <span className="mx-1.5" style={{ opacity: 0.5 }}>·</span>
              <Calendar size={10} />
              <span>
                {new Date(selHoja.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>

            {/* Row 4: type-specific preview */}
            {selHoja.tipo === 'link' && linkUrl && (
              <LinkPreview url={linkUrl} preview={selHoja.link_preview} />
            )}
            {selHoja.tipo === 'foto' && photoImgHtml && (
              <div
                className="rounded-xl overflow-hidden border"
                style={{ borderColor: dotColor + '30' }}
                dangerouslySetInnerHTML={{ __html: photoImgHtml }}
              />
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

            {/* Row 5: always-editable apuntes */}
            <div className="rounded-xl overflow-hidden border"
              style={{ borderColor: dotColor + '40', background: 'rgba(255,255,255,0.04)' }}>
              <EditorToolbar editor={editor} color={dotColor} />
              <div
                className="px-3 py-2.5 cursor-text"
                style={{ color: 'var(--text)' }}
                onClick={() => editor?.chain().focus().run()}
              >
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
