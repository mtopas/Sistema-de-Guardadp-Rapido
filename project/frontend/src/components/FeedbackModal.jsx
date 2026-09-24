import { useEffect, useRef, useState } from 'react'
import { X, MessageSquarePlus } from 'lucide-react'
import { useStore } from '../store/useStore'
import { t } from '../utils/i18n'

export default function FeedbackModal() {
  const open         = useStore(s => s.feedbackOpen)
  const close        = useStore(s => s.closeFeedback)
  const feedbackList = useStore(s => s.feedbackList)
  const addFeedback  = useStore(s => s.addFeedback)
  const showToast    = useStore(s => s.showToast)
  const lang         = useStore(s => s.lang)

  const [input,   setInput]   = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setInput('')
    setTimeout(() => textareaRef.current?.focus(), 30)
  }, [open])

  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, close])

  if (!open) return null

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    await addFeedback(text)
    setSending(false)
    setInput('')
    showToast(t(lang, 'feedbackSent') || 'Gracias por el feedback')
  }

  const handleKeyDown = e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSend() }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 70%, transparent)', backdropFilter: 'blur(10px)' }}
      onClick={close}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="panel-strong w-full max-w-[480px] flex flex-col anim-card-in"
        style={{ background: 'var(--surface)', maxHeight: '85vh' }}
        role="dialog"
        aria-modal="true"
        aria-label={t(lang, 'feedbackTitle') || 'Feedback'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg grid place-items-center"
              style={{ background: 'color-mix(in oklch, var(--accent) 15%, transparent)', color: 'var(--accent-light)' }}
            >
              <MessageSquarePlus size={15} strokeWidth={2.25} />
            </div>
            <span className="serif italic text-[17px] font-semibold" style={{ color: 'var(--text)' }}>
              {t(lang, 'feedbackTitle') || 'Feedback'}
            </span>
          </div>
          <button type="button" onClick={close} className="icon-btn-fin" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        {/* Input (arriba, fijo) */}
        <div className="px-5 pt-4 pb-3 shrink-0">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t(lang, 'feedbackPlaceholder')}
            rows={4}
            disabled={sending}
            className="w-full px-3 py-2.5 rounded-xl border outline-none text-[13px] resize-none transition-colors"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12.5px] font-semibold transition-all disabled:opacity-40"
              style={{
                background: 'var(--cta-bg)',
                color: 'var(--cta-text)',
                boxShadow: 'var(--shadow-accent)',
              }}
            >
              {sending ? t(lang, 'feedbackSending') : t(lang, 'feedbackSend')}
            </button>
          </div>
        </div>

        {/* Listado (abajo, con scroll propio) */}
        <div className="px-5 pb-2 pt-1 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="pt-3 text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--subtext)' }}>
            {t(lang, 'feedbackHistoryTitle')} {feedbackList.length > 0 && `(${feedbackList.length})`}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto panel-scroll px-5 pb-5 min-h-0">
          {feedbackList.length === 0 ? (
            <p className="text-[12px] italic py-2" style={{ color: 'var(--subtext)' }}>
              {t(lang, 'feedbackEmpty')}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {feedbackList.map(item => {
                const fecha = item.fecha
                  ? new Date(item.fecha).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                  : null
                return (
                  <div
                    key={item.id}
                    className="px-3 py-2.5 rounded-xl"
                    style={{
                      background: 'color-mix(in oklch, var(--accent-light) 30%, var(--bg))',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <p className="text-[12.5px] leading-snug whitespace-pre-wrap" style={{ color: 'var(--text)' }}>
                      {item.contenido}
                    </p>
                    {fecha && (
                      <p className="text-[10px] mt-1 mono" style={{ color: 'var(--subtext)' }}>
                        {fecha}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
