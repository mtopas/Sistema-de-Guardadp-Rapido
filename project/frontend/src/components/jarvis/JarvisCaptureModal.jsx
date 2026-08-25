import { useState, useEffect, useRef } from 'react'
import { X, Brain, Lock } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'

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
  const textareaRef               = useRef(null)

  useEffect(() => {
    if (jarvisCaptureOpen) {
      setText('')
      setLocalOnly(false)
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

  async function handleSubmit(e) {
    e.preventDefault()
    const content = text.trim()
    if (!content || saving) return
    setSaving(true)
    const result = await jarvisCapture(content, localOnly)
    setSaving(false)
    if (result) {
      showToast('Capturado en el cerebro', 'success')
      closeJarvisCapture()
    } else {
      showToast('Error al capturar — API no disponible', 'error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) closeJarvisCapture() }}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Brain size={16} style={{ color: 'var(--accent)' }} />
            <span className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
              Capturar en el cerebro
            </span>
          </div>
          <button
            onClick={closeJarvisCapture}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--subtext)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--subtext)'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Pegá texto, un link, una idea, una decisión..."
            rows={5}
            className="w-full rounded-xl border px-4 py-3 text-[13px] leading-relaxed resize-none outline-none transition-colors"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={localOnly}
              onChange={e => setLocalOnly(e.target.checked)}
              className="w-4 h-4 rounded accent-[var(--accent)]"
            />
            <Lock size={12} style={{ color: 'var(--subtext)' }} />
            <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>
              Solo local — nunca sale del dispositivo
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeJarvisCapture}
              className="px-4 py-2 rounded-xl text-[13px] transition-colors"
              style={{ color: 'var(--subtext)', background: 'var(--surface)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!text.trim() || saving}
              className="px-5 py-2 rounded-xl text-[13px] font-medium transition-all"
              style={{
                background: text.trim() && !saving ? 'var(--accent)' : 'var(--mute)',
                color: '#fff',
              }}
            >
              {saving ? 'Capturando...' : 'Capturar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
