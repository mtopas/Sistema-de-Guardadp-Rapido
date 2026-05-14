import { useEffect, useRef, useState } from 'react'
import { X, FileText, Link as LinkIcon, Image as ImageIcon, Sparkles, Zap, Clock, Plus, BookOpen, Target, Calendar, TrendingUp } from 'lucide-react'
import { useStore } from '../store/useStore'
import { detectType } from '../utils/detectType'
import { API_URL, DEBUG } from '../config'
import CategoryPicker from './CategoryPicker'
import LinkPreview from './LinkPreview'

const TYPES = [
  { id: 'texto', label: 'Texto', Icon: FileText },
  { id: 'link',  label: 'Link',  Icon: LinkIcon },
  { id: 'foto',  label: 'Foto',  Icon: ImageIcon },
]

const SECTIONS = [
  { id: 'boveda',   name: 'Bóveda',   Icon: BookOpen,   enabled: true,  subtitle: 'A la Bóveda',     title: 'Captura rápida'    },
  { id: 'finanzas', name: 'Finanzas', Icon: TrendingUp, enabled: false, subtitle: 'A Finanzas',      title: 'Nuevo movimiento' },
  { id: 'agenda',   name: 'Agenda',   Icon: Calendar,   enabled: false, subtitle: 'A la Agenda',     title: 'Nuevo evento'     },
  { id: 'habitos',  name: 'Hábitos',  Icon: Target,     enabled: false, subtitle: 'A Hábitos',       title: 'Nuevo hábito'     },
]

export default function CaptureModal() {
  const open         = useStore(s => s.captureOpen)
  const close        = useStore(s => s.closeCapture)
  const categorias   = useStore(s => s.categorias)
  const crearHoja    = useStore(s => s.crearHoja)
  const showToast    = useStore(s => s.showToast)

  const [section,     setSection]     = useState('boveda')
  const [contenido,   setContenido]   = useState('')
  const [tipoManual,  setTipoManual]  = useState(null) // null = auto
  const [categoriaId, setCategoriaId] = useState(null)
  const [fotoUrl,     setFotoUrl]     = useState('')
  const [saving,      setSaving]      = useState(false)
  const [previewUrl,  setPreviewUrl]  = useState('')

  const currentSection = SECTIONS.find(s => s.id === section) ?? SECTIONS[0]

  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  const autoTipo = detectType(contenido)
  const tipo = tipoManual ?? (fotoUrl ? 'foto' : autoTipo)
  const isAuto = tipoManual === null

  // Reset when (re)opened
  useEffect(() => {
    if (!open) return
    setSection('boveda')
    setContenido('')
    setTipoManual(null)
    setFotoUrl('')
    setPreviewUrl('')
    setCategoriaId(categorias[0]?.id ?? null)
    setTimeout(() => textareaRef.current?.focus(), 30)
  }, [open])

  // Debounced link preview
  useEffect(() => {
    if (tipo !== 'link') { setPreviewUrl(''); return }
    const t = setTimeout(() => setPreviewUrl(contenido.trim()), 600)
    return () => clearTimeout(t)
  }, [contenido, tipo])

  // ESC + Ctrl/Cmd+Enter
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close() }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, contenido, categoriaId, tipo, fotoUrl, saving])

  const handleSave = async () => {
    if (saving) return
    if (!categoriaId) { showToast('Elegí una categoría', 'error'); return }
    const payload = { categoria_id: categoriaId, tipo }
    if (tipo === 'foto') {
      if (!fotoUrl) { showToast('Subí una foto', 'error'); return }
      payload.contenido = fotoUrl
    } else {
      if (!contenido.trim()) { showToast('Escribí algo', 'error'); return }
      payload.contenido = contenido.trim()
    }
    setSaving(true)
    try {
      await crearHoja(payload)
      if (DEBUG) console.log('captureModal save:', payload.tipo)
      showToast('Guardado ✓')
      close()
    } catch (e) {
      showToast(e.message || 'Error al guardar', 'error')
    } finally { setSaving(false) }
  }

  const handleFile = async (file) => {
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: form })
      if (!res.ok) throw new Error('Upload falló')
      const data = await res.json()
      setFotoUrl(data.url)
      setTipoManual('foto')
    } catch (e) {
      showToast(e.message || 'Error subiendo foto', 'error')
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center animate-fade"
      onClick={close}
      style={{ background: 'color-mix(in oklch, black 50%, transparent)', backdropFilter: 'blur(8px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-in w-[92%] max-w-xl rounded-2xl overflow-hidden border"
        style={{
          background: 'var(--panel-bg)',
          borderColor: 'var(--border)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.45), var(--shadow-soft)',
        }}
      >
        {/* Section tabs */}
        <div
          className="flex items-center gap-1 px-3 pt-3 pb-2 border-b"
          style={{ borderColor: 'var(--border)', background: 'color-mix(in oklch, var(--surface) 50%, transparent)' }}
        >
          {SECTIONS.map(s => {
            const on = s.id === section
            const { Icon } = s
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (!s.enabled) { showToast(`${s.name}: próximamente`, 'info'); return }
                  setSection(s.id)
                }}
                aria-pressed={on}
                aria-disabled={!s.enabled}
                title={s.enabled ? s.name : `${s.name} · próximamente`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                style={{
                  color: on ? 'var(--accent-light)' : 'var(--text-2)',
                  background: on
                    ? 'color-mix(in oklch, var(--accent) 14%, transparent)'
                    : 'transparent',
                  border: on
                    ? '1px solid color-mix(in oklch, var(--accent) 28%, transparent)'
                    : '1px solid transparent',
                  opacity: s.enabled ? 1 : 0.45,
                  cursor: s.enabled ? 'pointer' : 'not-allowed',
                }}
              >
                <Icon size={12} /> {s.name}
              </button>
            )
          })}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--subtext)' }}>{currentSection.subtitle}</div>
            <div
              className="text-[16px] font-semibold mt-0.5"
              style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--text)' }}
            >
              {currentSection.title}
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg grid place-items-center transition-colors"
            style={{ color: 'var(--subtext)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--subtext)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {tipo === 'foto' ? (
            <div className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border border-dashed"
                 style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              {fotoUrl ? (
                <img src={`${API_URL}${fotoUrl}`} alt="" className="max-h-48 rounded-lg" />
              ) : (
                <ImageIcon size={28} style={{ color: 'var(--subtext)' }} />
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-[12.5px] border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)', background: 'var(--bg)' }}
              >
                {fotoUrl ? 'Cambiar foto' : 'Elegir foto…'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={contenido}
              onChange={e => setContenido(e.target.value)}
              placeholder="Pegá un link, escribí texto, o usá la cámara…"
              rows={4}
              className="w-full rounded-xl px-3 py-2.5 text-[15px] outline-none resize-none border transition-colors"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          )}

          {/* Link preview */}
          {previewUrl && tipo === 'link' && (
            <div className="mt-3 animate-in">
              <LinkPreview url={previewUrl} />
            </div>
          )}

          {/* Type chips + auto-detect indicator */}
          <div className="flex gap-2 mt-4 flex-wrap items-center">
            {TYPES.map(({ id, label, Icon }) => {
              const on = tipo === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTipoManual(id)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px] transition-colors"
                  style={{
                    color: on ? 'var(--accent-light)' : 'var(--text-2)',
                    borderColor: on
                      ? 'color-mix(in oklch, var(--accent) 30%, transparent)'
                      : 'var(--border)',
                    background: on
                      ? 'color-mix(in oklch, var(--accent) 14%, transparent)'
                      : 'var(--surface)',
                  }}
                >
                  <Icon size={11} /> {label}
                </button>
              )
            })}
            {isAuto && (
              <span
                className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px]"
                style={{
                  color: 'var(--accent-light)',
                  borderColor: 'color-mix(in oklch, var(--accent) 28%, transparent)',
                  background: 'color-mix(in oklch, var(--accent) 14%, transparent)',
                }}
              >
                <Sparkles size={11} /> Auto-detectar
              </span>
            )}
          </div>

          {/* Category + Recordar (disabled placeholder) */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--subtext)' }}>
                Categoría
              </div>
              <CategoryPicker value={categoriaId} onChange={setCategoriaId} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--subtext)' }}>
                Recordar (opcional)
              </div>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Próximamente"
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm cursor-not-allowed"
                style={{
                  background: 'var(--surface)',
                  borderColor: 'var(--border)',
                  color: 'var(--subtext)',
                  opacity: 0.55,
                }}
              >
                <span className="flex items-center gap-2">
                  <Clock size={12} /> Sin recordatorio
                </span>
                <Plus size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-4 border-t flex items-center gap-2 justify-between"
          style={{ borderColor: 'var(--border)', background: 'color-mix(in oklch, var(--surface) 40%, transparent)' }}
        >
          <div className="text-[10.5px]" style={{ color: 'var(--subtext)', fontFamily: 'var(--font-mono)' }}>
            <kbd className="px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border)' }}>Ctrl</kbd>
            <kbd className="px-1.5 py-0.5 rounded border ml-1" style={{ borderColor: 'var(--border)' }}>↵</kbd>
            <span className="ml-2">para guardar</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="px-3 py-2 rounded-lg text-[13px]"
              style={{ color: 'var(--text-2)', background: 'transparent' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium active:scale-[0.985] transition-all disabled:opacity-50"
              style={{
                background: 'var(--cta-bg)',
                color: 'var(--cta-text)',
                boxShadow: 'var(--shadow-accent)',
              }}
            >
              <Zap size={14} strokeWidth={2.5} />
              {saving ? 'Guardando…' : 'Guardar en Bóveda'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
