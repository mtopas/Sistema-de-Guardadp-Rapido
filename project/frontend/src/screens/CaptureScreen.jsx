import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Send } from 'lucide-react'
import { useStore } from '../store/useStore'
import CategoryPicker from '../components/CategoryPicker'
import IconPicker from '../components/IconPicker'
import LinkPreview from '../components/LinkPreview'
import { detectType } from '../utils/detectType'
import { getCategoriaColor } from '../utils/categoriaColors'
import { DEBUG } from '../config'

export default function CaptureScreen() {
  const navigate      = useNavigate()
  const [params]      = useSearchParams()
  const crearHoja     = useStore(s => s.crearHoja)
  const categorias    = useStore(s => s.categorias)
  const showToast     = useStore(s => s.showToast)

  const initialText   = params.get('text') || params.get('url') || ''
  const [contenido,   setContenido]   = useState(initialText)
  const [categoriaId, setCategoriaId] = useState(null)
  const [icono,       setIcono]       = useState('')
  const [saving,      setSaving]      = useState(false)
  const textareaRef   = useRef(null)

  const catColor = categoriaId
    ? getCategoriaColor(categorias, categoriaId)
    : 'var(--accent)'

  const tipo  = detectType(contenido)
  const isUrl = tipo === 'link'
  // Only show preview after a debounce — avoid flicker while typing a URL
  const [previewUrl, setPreviewUrl] = useState('')
  useEffect(() => {
    if (!isUrl) { setPreviewUrl(''); return }
    const t = setTimeout(() => setPreviewUrl(contenido.trim()), 600)
    return () => clearTimeout(t)
  }, [contenido, isUrl])

  useEffect(() => { textareaRef.current?.focus() }, [])
  useEffect(() => {
    if (categorias.length && categoriaId === null) setCategoriaId(categorias[0].id)
  }, [categorias])

  const handleSave = async () => {
    if (!contenido.trim() || !categoriaId || saving) return
    setSaving(true)
    try {
      await crearHoja({ contenido: contenido.trim(), categoria_id: categoriaId, tipo, icono })
      if (DEBUG) console.log('saved hoja tipo:', tipo)
      showToast('Guardado ✓')
      navigate('/')
    } catch (e) {
      showToast(e.message || 'Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full flex flex-col px-4 py-6 gap-4 max-w-xl mx-auto">
      <h2 className="text-app-text font-semibold text-lg">Nueva hoja</h2>

      {/* Type badge */}
      {contenido.trim() && (
        <div className="animate-fade">
          <span className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full border font-medium ${
            isUrl
              ? 'border-blue-500/40 text-blue-300 bg-blue-500/10'
              : 'border-app-border text-app-subtext bg-app-surface'
          }`}>
            {isUrl ? '🔗 Link detectado' : '📝 Texto'}
          </span>
        </div>
      )}

      {/* Input */}
      <textarea
        ref={textareaRef}
        value={contenido}
        onChange={e => setContenido(e.target.value)}
        placeholder="Pegá un link, texto, cita..."
        rows={5}
        className="w-full bg-app-surface border border-app-border rounded-xl px-4 py-3 text-app-text placeholder:text-app-subtext text-sm resize-none outline-none focus:border-app-accent transition-colors duration-150 leading-relaxed"
      />

      {/* Link preview (debounced) */}
      {previewUrl && (
        <div className="animate-in">
          <LinkPreview url={previewUrl} />
        </div>
      )}

      {/* Category + icon row */}
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <CategoryPicker value={categoriaId} onChange={setCategoriaId} />
        </div>
        <IconPicker value={icono} onChange={setIcono} accentColor={catColor} tipo={tipo} />
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={!contenido.trim() || !categoriaId || saving}
        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-sm disabled:opacity-40 hover:brightness-110 active:scale-[0.98] transition-all duration-150"
        style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)' }}
      >
        <Send size={15} />
        {saving ? 'Guardando...' : 'Guardar'}
      </button>
    </div>
  )
}
