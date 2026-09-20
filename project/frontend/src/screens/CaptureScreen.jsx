import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Send } from 'lucide-react'
import { useStore } from '../store/useStore'
import CategoryPicker from '../components/CategoryPicker'
import IconPicker from '../components/IconPicker'
import LinkPreview from '../components/LinkPreview'
import TopBar from '../components/TopBar'
import { detectType } from '../utils/detectType'
import { getCategoriaColor } from '../utils/categoriaColors'
import { DEBUG } from '../config'

export default function CaptureScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const crearHoja = useStore(s => s.crearHoja)
  const categorias = useStore(s => s.categorias)
  const showToast = useStore(s => s.showToast)
  const initialText = params.get('text') || params.get('url') || ''
  const [contenido, setContenido] = useState(initialText)
  const [categoriaId, setCategoriaId] = useState(null)
  const [icono, setIcono] = useState('')
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const textareaRef = useRef(null)
  const catColor = categoriaId ? getCategoriaColor(categorias, categoriaId) : 'var(--accent)'
  const tipo = detectType(contenido)
  const isUrl = tipo === 'link'
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    if (!isUrl) { setPreviewUrl(''); return }
    const timer = setTimeout(() => setPreviewUrl(contenido.trim()), 600)
    return () => clearTimeout(timer)
  }, [contenido, isUrl])
  useEffect(() => { textareaRef.current?.focus() }, [])
  useEffect(() => {
    if (categorias.length && categoriaId === null) setCategoriaId(categorias[0].id)
  }, [categorias, categoriaId])

  const handleSave = async () => {
    if (!contenido.trim() || !categoriaId || saving) return
    setSaving(true)
    try {
      await crearHoja({ contenido: contenido.trim(), categoria_id: categoriaId, tipo, icono })
      if (DEBUG) console.log('saved hoja tipo:', tipo)
      showToast('Guardado')
      navigate('/')
    } catch (error) {
      showToast(error.message || 'Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      <TopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <main className="flex-1 overflow-y-auto px-4 lg:px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button type="button" onClick={() => navigate('/')} className="w-8 h-8 grid place-items-center" style={{ color: 'var(--subtext)' }} aria-label="Volver a Bóveda"><ArrowLeft size={18} /></button>
            <div><p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--subtext)' }}>Bóveda</p><h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>Nueva hoja</h2></div>
          </div>
          <div className="border p-4 sm:p-5 space-y-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 8 }}>
            {contenido.trim() && <div className="animate-fade"><span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full border font-medium" style={{ color: catColor, borderColor: `${catColor}55`, background: `${catColor}16` }}>{isUrl ? 'Link detectado' : 'Texto'}</span></div>}
            <textarea ref={textareaRef} value={contenido} onChange={event => setContenido(event.target.value)} placeholder="Pegá un link, texto, cita..." rows={6} className="w-full border px-3 py-3 text-sm resize-none outline-none transition-colors duration-150 leading-relaxed" style={{ color: 'var(--text)', background: 'var(--bg)', borderColor: 'var(--border)', borderRadius: 7 }} onFocus={event => { event.currentTarget.style.borderColor = 'var(--accent)' }} onBlur={event => { event.currentTarget.style.borderColor = 'var(--border)' }} />
            {previewUrl && <div className="animate-in"><LinkPreview url={previewUrl} /></div>}
            <div className="flex gap-2 items-start"><div className="flex-1"><CategoryPicker value={categoriaId} onChange={setCategoriaId} /></div><IconPicker value={icono} onChange={setIcono} accentColor={catColor} tipo={tipo} /></div>
            <div className="flex justify-end pt-1"><button type="button" onClick={handleSave} disabled={!contenido.trim() || !categoriaId || saving} className="h-10 inline-flex items-center justify-center gap-2 px-4 text-sm font-semibold disabled:opacity-40 transition-all duration-150" style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', borderRadius: 7 }}><Send size={15} />{saving ? 'Guardando...' : 'Guardar hoja'}</button></div>
          </div>
        </div>
      </main>
    </div>
  )
}
