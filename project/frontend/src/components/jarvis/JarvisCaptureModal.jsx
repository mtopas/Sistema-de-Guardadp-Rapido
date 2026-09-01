import { useState, useEffect, useRef } from 'react'
import { X, Brain, Lock } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { MEMORY_TYPE_COLORS, rgba } from '../../utils/jarvisPalette'

const ASK_COLOR = MEMORY_TYPE_COLORS.DECISION // amber — mismo estilo "ask" del mock

export default function JarvisCaptureModal() {
  const { jarvisCaptureOpen, closeJarvisCapture, jarvisCapture, showToast } = useStore(
    useShallow(s => ({
      jarvisCaptureOpen:  s.jarvisCaptureOpen,
      closeJarvisCapture: s.closeJarvisCapture,
      jarvisCapture:      s.jarvisCapture,
      showToast:          s.showToast,
    }))
  )

  const [text, setText]           = useState('')
  const [localOnly, setLocalOnly] = useState(false)
  const [saving, setSaving]       = useState(false)
  // { question, originalText, originalLocalOnly } cuando la API pide razón
  // antes de encolar (DECISION sin "porque..." -- ver jarvis/captures/clarification.py)
  const [clarification, setClarification] = useState(null)
  const [reason, setReason]       = useState('')
  const textareaRef               = useRef(null)

  useEffect(() => {
    if (jarvisCaptureOpen) {
      setText('')
      setLocalOnly(false)
      setClarification(null)
      setReason('')
      setTimeout(() => textareaRef.current?.focus(), 80)
    }
  }, [jarvisCaptureOpen])

  useEffect(() => {
    if (!jarvisCaptureOpen) return
    const h = (e) => { if (e.key === 'Escape') closeJarvisCapture() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [jarvisCaptureOpen, closeJarvisCapture])

  if (!jarvisCaptureOpen) return null

  function finish(result) {
    if (result?.entry_id) {
      showToast('Capturado en el cerebro', 'success')
      closeJarvisCapture()
    } else {
      showToast('Error al capturar — API no disponible', 'error')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const content = text.trim()
    if (!content || saving) return
    setSaving(true)
    const result = await jarvisCapture(content, localOnly, { check_clarification: true })
    setSaving(false)
    if (result?.clarification_needed) {
      setClarification({ question: result.question, originalText: content, originalLocalOnly: localOnly })
      return
    }
    finish(result)
  }

  async function handleSubmitReason(e) {
    e.preventDefault()
    if (saving || !clarification) return
    setSaving(true)
    const result = await jarvisCapture(clarification.originalText, clarification.originalLocalOnly, {
      clarification: reason.trim(),
    })
    setSaving(false)
    finish(result)
  }

  async function handleSkipReason() {
    if (saving || !clarification) return
    setSaving(true)
    const result = await jarvisCapture(clarification.originalText, clarification.originalLocalOnly)
    setSaving(false)
    finish(result)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) closeJarvisCapture() }}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#0a0d1a', border: '1px solid rgba(150,170,255,0.14)', fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(150,170,255,0.14)' }}
        >
          <div className="flex items-center gap-2">
            <Brain size={16} style={{ color: MEMORY_TYPE_COLORS.RAW }} />
            <span className="text-[14px] font-semibold" style={{ color: '#eef2ff' }}>
              Capturar en el cerebro
            </span>
          </div>
          <button
            onClick={closeJarvisCapture}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'rgba(200,214,255,0.5)' }}
            onMouseEnter={e => e.currentTarget.style.color = '#eef2ff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(200,214,255,0.5)'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {clarification ? (
          <form onSubmit={handleSubmitReason} className="p-5 flex flex-col gap-4">
            <div
              style={{
                display: 'flex', flexDirection: 'column', gap: 9, padding: '15px 18px', borderRadius: '4px 15px 15px 15px',
                background: rgba(ASK_COLOR, 0.07), border: `1px solid ${rgba(ASK_COLOR, 0.28)}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: ASK_COLOR, animation: 'jv-blink 1.4s infinite' }} />
                <div className="jv-mono" style={{ fontSize: 10, letterSpacing: '0.12em', color: ASK_COLOR }}>FALTA RAZONAMIENTO</div>
              </div>
              <p className="text-[14.5px] leading-relaxed" style={{ color: '#f2ecdd' }}>
                {clarification.question}
              </p>
            </div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Escribí la razón (opcional)..."
              rows={3}
              autoFocus
              className="w-full rounded-xl px-4 py-3 text-[13px] leading-relaxed resize-none outline-none transition-colors"
              style={{ background: 'rgba(150,170,255,0.06)', border: '1px solid rgba(150,170,255,0.14)', color: '#eef2ff' }}
              onFocus={e => e.target.style.borderColor = MEMORY_TYPE_COLORS.RAW}
              onBlur={e => e.target.style.borderColor = 'rgba(150,170,255,0.14)'}
            />
            <div className="flex justify-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={closeJarvisCapture}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-[13px] transition-colors"
                style={{ color: 'rgba(200,214,255,0.6)', background: 'rgba(150,170,255,0.06)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(150,170,255,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(150,170,255,0.06)'}
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={handleSkipReason}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-[13px] transition-colors"
                style={{ color: 'rgba(200,214,255,0.6)', background: 'rgba(150,170,255,0.06)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(150,170,255,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(150,170,255,0.06)'}
              >
                Guardar sin razón
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl text-[13px] font-medium transition-all"
                style={{
                  background: !saving ? 'linear-gradient(120deg,#7dd3fc,#a78bfa)' : 'rgba(150,170,255,0.16)',
                  color: !saving ? '#06070f' : 'rgba(200,214,255,0.5)',
                }}
              >
                {saving ? 'Guardando...' : 'Guardar con esta razón'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Pegá texto, un link, una idea, una decisión..."
              rows={5}
              className="w-full rounded-xl px-4 py-3 text-[13px] leading-relaxed resize-none outline-none transition-colors"
              style={{ background: 'rgba(150,170,255,0.06)', border: '1px solid rgba(150,170,255,0.14)', color: '#eef2ff' }}
              onFocus={e => e.target.style.borderColor = MEMORY_TYPE_COLORS.RAW}
              onBlur={e => e.target.style.borderColor = 'rgba(150,170,255,0.14)'}
            />

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={localOnly}
                onChange={e => setLocalOnly(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: MEMORY_TYPE_COLORS.RAW }}
              />
              <Lock size={12} style={{ color: 'rgba(200,214,255,0.5)' }} />
              <span className="text-[12px]" style={{ color: 'rgba(220,228,255,0.7)' }}>
                Solo local — nunca sale del dispositivo
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeJarvisCapture}
                className="px-4 py-2 rounded-xl text-[13px] transition-colors"
                style={{ color: 'rgba(200,214,255,0.6)', background: 'rgba(150,170,255,0.06)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(150,170,255,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(150,170,255,0.06)'}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!text.trim() || saving}
                className="px-5 py-2 rounded-xl text-[13px] font-medium transition-all"
                style={{
                  background: text.trim() && !saving ? 'linear-gradient(120deg,#7dd3fc,#a78bfa)' : 'rgba(150,170,255,0.16)',
                  color: text.trim() && !saving ? '#06070f' : 'rgba(200,214,255,0.5)',
                }}
              >
                {saving ? 'Capturando...' : 'Capturar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
