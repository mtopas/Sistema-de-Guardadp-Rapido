import { useRef, useEffect, useState } from 'react'
import { Send, Trash2, ChevronDown, ChevronUp, Brain } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'

const ERROR_MSG = 'Error al consultar. Verificá que el worker de Jarvis esté activo.'

function SourcesToggle({ sources, contextSent, contextCount }) {
  const [open, setOpen] = useState(false)
  if (!sources || sources.length === 0) return null
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[10px] transition-colors"
        style={{ color: 'var(--subtext)' }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--subtext)'}
      >
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        <span>{contextSent}/{contextCount} fuentes</span>
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1">
          {sources.map((src, i) => (
            <div
              key={i}
              className="px-2 py-1.5 rounded-lg text-[10px] leading-snug"
              style={{ background: 'var(--surface)', color: 'var(--text-2)' }}
            >
              <div className="flex items-center gap-1 mb-0.5">
                <span
                  className="font-semibold uppercase text-[8.5px] tracking-wide px-1 py-px rounded"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {src.type || 'RAW'}
                </span>
                {src.score != null && (
                  <span className="mono" style={{ color: 'var(--mute)' }}>
                    {(src.score * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="line-clamp-2" style={{ color: 'var(--text-2)' }}>
                {src.title_hint || src.content_raw || src.title || '—'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Brain size={13} />
        </div>
      )}
      <div style={{ maxWidth: '78%' }}>
        <div
          className="px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed"
          style={
            isUser
              ? {
                  background: 'var(--accent)',
                  color: '#fff',
                  borderBottomRightRadius: 6,
                }
              : msg.error
                ? {
                    background: 'var(--surface)',
                    color: 'var(--expense, #ef4444)',
                    borderBottomLeftRadius: 6,
                    border: '1px solid var(--border)',
                  }
                : {
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    borderBottomLeftRadius: 6,
                    border: '1px solid var(--border)',
                  }
          }
        >
          {msg.error ? ERROR_MSG : (msg.content || '')}
        </div>
        {!isUser && !msg.error && (
          <SourcesToggle
            sources={msg.sources}
            contextSent={msg.context_sent}
            contextCount={msg.context_count}
          />
        )}
        <div
          className="text-[9.5px] mono mt-1 px-1"
          style={{
            color: 'var(--mute)',
            textAlign: isUser ? 'right' : 'left',
          }}
        >
          {msg.ts ? new Date(msg.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : ''}
        </div>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        <Brain size={13} />
      </div>
      <div
        className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderBottomLeftRadius: 6,
        }}
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{
              background: 'var(--subtext)',
              animationDelay: `${i * 0.15}s`,
              animationDuration: '0.9s',
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default function JarvisChat() {
  const { jarvisMessages, jarvisLoading, jarvisQuery, jarvisClearHistory } = useStore(
    useShallow(s => ({
      jarvisMessages:    s.jarvisMessages,
      jarvisLoading:     s.jarvisLoading,
      jarvisQuery:       s.jarvisQuery,
      jarvisClearHistory: s.jarvisClearHistory,
    }))
  )

  const [input, setInput] = useState('')
  const bottomRef   = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [jarvisMessages, jarvisLoading])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleSend() {
    const q = input.trim()
    if (!q || jarvisLoading) return
    setInput('')
    textareaRef.current?.focus()
    await jarvisQuery(q)
  }

  function handleClear() {
    if (jarvisMessages.length === 0) return
    if (window.confirm('¿Borrar el historial de la conversación?')) {
      jarvisClearHistory()
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 min-h-0">
        {jarvisMessages.length === 0 && (
          <div
            className="flex flex-col items-center justify-center h-full gap-4 pb-16"
            style={{ color: 'var(--subtext)' }}
          >
            <Brain size={40} style={{ color: 'var(--accent)', opacity: 0.5 }} />
            <div className="text-center">
              <p className="text-[14px] font-medium" style={{ color: 'var(--text-2)' }}>
                Jarvis — Segundo Cerebro
              </p>
              <p className="text-[12px] mt-1" style={{ color: 'var(--subtext)' }}>
                Preguntale algo para consultar tu memoria
              </p>
            </div>
          </div>
        )}
        {jarvisMessages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {jarvisLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="shrink-0 border-t px-4 py-3"
        style={{ borderColor: 'var(--border)', background: 'var(--panel-bg)' }}
      >
        <div className="flex items-center gap-2">
          {/* Clear button */}
          <button
            onClick={handleClear}
            disabled={jarvisMessages.length === 0}
            className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0 transition-colors"
            style={{
              color: jarvisMessages.length > 0 ? 'var(--subtext)' : 'var(--mute)',
              background: 'transparent',
            }}
            onMouseEnter={e => { if (jarvisMessages.length > 0) e.currentTarget.style.background = 'var(--surface)' }}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title="Borrar historial"
          >
            <Trash2 size={14} />
          </button>

          {/* Textarea */}
          <div
            className="flex-1 flex items-end gap-2 rounded-2xl border px-3 py-2 transition-colors"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
            }}
            onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Preguntale algo a Jarvis... (Enter = enviar, Shift+Enter = nueva línea)"
              rows={1}
              className="flex-1 bg-transparent text-[13px] outline-none resize-none leading-relaxed placeholder:opacity-50"
              style={{
                color: 'var(--text)',
                maxHeight: 120,
                overflowY: 'auto',
              }}
              onInput={e => {
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || jarvisLoading}
              className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0 transition-all"
              style={{
                background: input.trim() && !jarvisLoading ? 'var(--accent)' : 'var(--mute)',
                color: '#fff',
              }}
              title="Enviar (Enter)"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
        <p className="text-[9.5px] mt-1.5 pl-10" style={{ color: 'var(--mute)' }}>
          Enter envía · Shift+Enter nueva línea
        </p>
      </div>
    </div>
  )
}
