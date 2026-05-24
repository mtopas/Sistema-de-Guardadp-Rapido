import { useEffect, useRef, useState } from 'react'
import { X, FileText, Link as LinkIcon, Image as ImageIcon, Sparkles, Zap, Clock, Plus, BookOpen, Target, Calendar, TrendingUp } from 'lucide-react'
import { useStore } from '../store/useStore'
import { detectType } from '../utils/detectType'
import { API_URL, DEBUG } from '../config'
import CategoryPicker from './CategoryPicker'
import LinkPreview from './LinkPreview'
import { HABITO_COLORS } from './habitos/habitosUtils'

const TYPES = [
  { id: 'texto', label: 'Texto', Icon: FileText },
  { id: 'link',  label: 'Link',  Icon: LinkIcon },
  { id: 'foto',  label: 'Foto',  Icon: ImageIcon },
]

const SECTIONS = [
  { id: 'boveda',   name: 'Bóveda',   Icon: BookOpen,   enabled: true,  subtitle: 'A la Bóveda',     title: 'Captura rápida'    },
  { id: 'finanzas', name: 'Finanzas', Icon: TrendingUp, enabled: false, subtitle: 'A Finanzas',      title: 'Nuevo movimiento' },
  { id: 'agenda',   name: 'Agenda',   Icon: Calendar,   enabled: true,  subtitle: 'A la Agenda',     title: 'Nueva entrada'    },
  { id: 'habitos',  name: 'Hábitos',  Icon: Target,     enabled: true,  subtitle: 'A Hábitos',       title: 'Nuevo hábito'     },
]

const LS_LAST_CAT_BOVEDA = 'sgr-boveda-last-cat'

export default function CaptureModal() {
  const open                     = useStore(s => s.captureOpen)
  const close                    = useStore(s => s.closeCapture)
  const captureDefaultCategoriaId = useStore(s => s.captureDefaultCategoriaId)
  const categorias               = useStore(s => s.categorias)
  const crearHoja                = useStore(s => s.crearHoja)
  const addHabito                = useStore(s => s.addHabito)
  const addAgendaEvento          = useStore(s => s.addAgendaEvento)
  const addAgendaTarea           = useStore(s => s.addAgendaTarea)
  const agendaListas             = useStore(s => s.agendaListas)
  const showToast                = useStore(s => s.showToast)

  const modalRef = useRef(null)

  const [section,     setSection]     = useState('boveda')
  const [contenido,   setContenido]   = useState('')
  const [tipoManual,  setTipoManual]  = useState(null) // null = auto
  const [categoriaId, setCategoriaId] = useState(null)
  const [fotoUrl,     setFotoUrl]     = useState('')
  const [saving,      setSaving]      = useState(false)
  const [previewUrl,  setPreviewUrl]  = useState('')
  // Agenda quick-create state
  const [aTipo,     setATipo]     = useState('evento') // 'evento' | 'tarea'
  const [aTitulo,   setATitulo]   = useState('')
  const [aFecha,    setAFecha]    = useState('')
  const [aHora,     setAHora]     = useState('')
  const [aListaId,  setAListaId]  = useState(null)
  // Hábito quick-create state
  const [hNombre,   setHNombre]   = useState('')
  const [hColor,    setHColor]    = useState(HABITO_COLORS[0])
  const [hFreq,     setHFreq]     = useState('diario')
  const [hError,    setHError]    = useState('')

  const currentSection = SECTIONS.find(s => s.id === section) ?? SECTIONS[0]

  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  const autoTipo = detectType(contenido)
  const tipo = tipoManual ?? (fotoUrl ? 'foto' : autoTipo)
  const isAuto = tipoManual === null

  // Reset when (re)opened — respect captureDefaultCategoriaId and last used
  useEffect(() => {
    if (!open) return
    setSection('boveda')
    setContenido('')
    setTipoManual(null)
    setFotoUrl('')
    setPreviewUrl('')
    // Priority: preset from store > last used in localStorage > first category
    const lastUsed   = localStorage.getItem(LS_LAST_CAT_BOVEDA)
    const defaultId  = captureDefaultCategoriaId
      ?? (lastUsed ? parseInt(lastUsed) : null)
      ?? categorias[0]?.id
      ?? null
    setCategoriaId(defaultId)
    setATitulo(''); setAFecha(''); setAHora(''); setATipo('evento')
    setAListaId(agendaListas[0]?.id ?? null)
    setHNombre('')
    setHColor(HABITO_COLORS[0])
    setHFreq('diario')
    setHError('')
    setTimeout(() => textareaRef.current?.focus(), 30)
  }, [open])

  // Focus trap: Tab/Shift+Tab cycle within modal
  useEffect(() => {
    if (!open || !modalRef.current) return
    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const trap = (e) => {
      if (e.key !== 'Tab') return
      const els = Array.from(modalRef.current.querySelectorAll(FOCUSABLE)).filter(el => !el.disabled)
      if (!els.length) return
      const first = els[0], last = els[els.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', trap)
    return () => document.removeEventListener('keydown', trap)
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
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (section === 'habitos') handleSaveHabito(); else handleSave()
      }
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
      if (categoriaId) localStorage.setItem(LS_LAST_CAT_BOVEDA, String(categoriaId))
      showToast('Guardado ✓')
      close()
    } catch (e) {
      showToast(e.message || 'Error al guardar', 'error')
    } finally { setSaving(false) }
  }

  const handleSaveAgenda = async () => {
    if (!aTitulo.trim()) { showToast('El título es requerido', 'error'); return }
    setSaving(true)
    try {
      if (aTipo === 'evento') {
        const fechaInicio = aFecha ? `${aFecha}T${aHora || '00:00'}:00` : new Date().toISOString().slice(0, 19)
        await addAgendaEvento({ titulo: aTitulo.trim(), fecha_inicio: fechaInicio })
        showToast('Evento creado ✓')
      } else {
        await addAgendaTarea({ titulo: aTitulo.trim(), fecha_opcional: aFecha || null, hora_opcional: aHora || null, lista_id: aListaId })
        showToast('Tarea creada ✓')
      }
      close()
    } catch { showToast('Error al guardar', 'error') }
    finally { setSaving(false) }
  }

  const handleSaveHabito = async () => {
    if (!hNombre.trim()) { setHError('El nombre es requerido'); return }
    setSaving(true)
    try {
      await addHabito({ nombre: hNombre.trim(), color: hColor, frecuencia_tipo: hFreq })
      showToast(`Hábito "${hNombre.trim()}" creado ✓`)
      close()
    } catch { showToast('Error al crear hábito', 'error') }
    finally { setSaving(false) }
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
      aria-hidden="true"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={currentSection.title}
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
          {section === 'agenda' ? (
            <div className="flex flex-col gap-4">
              {/* Tipo toggle */}
              <div className="flex gap-1 p-1 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
                {[['evento', 'Evento'], ['tarea', 'Tarea']].map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setATipo(val)}
                    className="flex-1 text-[12px] py-1.5 rounded-lg transition-all"
                    style={{ background: aTipo === val ? 'var(--bg)' : 'transparent', color: aTipo === val ? 'var(--text)' : 'var(--subtext)', fontWeight: aTipo === val ? 600 : 400 }}>
                    {label}
                  </button>
                ))}
              </div>
              {/* Título */}
              <input
                autoFocus
                type="text"
                value={aTitulo}
                onChange={e => setATitulo(e.target.value)}
                placeholder={aTipo === 'evento' ? 'Título del evento' : 'Título de la tarea'}
                className="w-full text-[14px] px-3 py-2.5 rounded-xl border outline-none bg-transparent"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
              {/* Fecha + hora */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--subtext)' }}>Fecha</div>
                  <input type="date" value={aFecha} onChange={e => setAFecha(e.target.value)}
                    className="w-full text-[13px] px-3 py-2 rounded-xl border outline-none bg-transparent"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--subtext)' }}>Hora</div>
                  <input type="time" value={aHora} onChange={e => setAHora(e.target.value)}
                    className="w-full text-[13px] px-3 py-2 rounded-xl border outline-none bg-transparent"
                    style={{ borderColor: 'var(--border)', color: 'var(--text)' }} />
                </div>
              </div>
              {/* Lista (solo tareas) */}
              {aTipo === 'tarea' && agendaListas.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--subtext)' }}>Lista</div>
                  <div className="flex flex-wrap gap-2">
                    {agendaListas.map(l => (
                      <button key={l.id} type="button" onClick={() => setAListaId(l.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] transition-all"
                        style={{ borderColor: aListaId === l.id ? l.color : 'var(--border)', background: aListaId === l.id ? `color-mix(in oklch, ${l.color} 15%, transparent)` : 'transparent', color: 'var(--text)' }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: l.color }} /> {l.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : section === 'habitos' ? (
            <div className="flex flex-col gap-4">
              {/* Nombre */}
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: 'var(--subtext)' }}>
                  Nombre del hábito
                </label>
                <input
                  autoFocus
                  type="text"
                  value={hNombre}
                  onChange={e => { setHNombre(e.target.value); setHError('') }}
                  placeholder="Ej: Meditar 10 min"
                  className="w-full text-[14px] px-3 py-2.5 rounded-xl border outline-none bg-transparent"
                  style={{
                    borderColor: hError ? 'var(--danger)' : 'var(--border)',
                    color: 'var(--text)',
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = hError ? 'var(--danger)' : 'var(--border)'}
                />
                {hError && <p className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>{hError}</p>}
              </div>

              {/* Color */}
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: 'var(--subtext)' }}>Color</label>
                <div className="flex gap-2 flex-wrap">
                  {HABITO_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setHColor(c)}
                      className="w-6 h-6 rounded-full transition-transform duration-100"
                      style={{
                        background: c,
                        transform: hColor === c ? 'scale(1.25)' : 'scale(1)',
                        outline: hColor === c ? `2px solid ${c}` : 'none',
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Frecuencia */}
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: 'var(--subtext)' }}>Frecuencia</label>
                <div
                  className="flex gap-1 p-1 rounded-xl border"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                >
                  {[['diario','Diario'],['semanal','Semanal']].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setHFreq(val)}
                      className="flex-1 text-[12px] py-1.5 rounded-lg transition-all"
                      style={{
                        background: hFreq === val ? 'var(--bg)' : 'transparent',
                        color: hFreq === val ? 'var(--text)' : 'var(--subtext)',
                        fontWeight: hFreq === val ? 600 : 400,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : tipo === 'foto' ? (
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

          {/* Type chips + auto-detect indicator — only for boveda */}
          {section === 'boveda' && <div className="flex gap-2 mt-4 flex-wrap items-center">
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
          </div>}

          {/* Category + Recordar — only for boveda */}
          {section === 'boveda' && <div className="grid grid-cols-2 gap-3 mt-4">
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
          </div>}
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
              onClick={section === 'habitos' ? handleSaveHabito : section === 'agenda' ? handleSaveAgenda : handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium active:scale-[0.985] transition-all disabled:opacity-50"
              style={{
                background: 'var(--cta-bg)',
                color: 'var(--cta-text)',
                boxShadow: 'var(--shadow-accent)',
              }}
            >
              <Zap size={14} strokeWidth={2.5} />
              {saving
                ? 'Guardando…'
                : section === 'habitos' ? 'Crear hábito'
                : section === 'agenda' ? (aTipo === 'evento' ? 'Crear evento' : 'Crear tarea')
                : 'Guardar en Bóveda'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
