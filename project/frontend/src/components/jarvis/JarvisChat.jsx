import { useRef, useEffect, useState } from 'react'
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { MEMORY_TYPE_COLORS, QUERY_COLOR, rgba } from '../../utils/jarvisPalette'
import { formatAge } from '../../utils/formatAge'
import JarvisChatTabs from './JarvisChatTabs'
import JarvisSourceModal from './JarvisSourceModal'

const ERROR_MSG = 'Error al consultar. Verificá que el worker de Jarvis esté activo.'
// Composer es solo-consulta (decisión cerrada, Fase 2 de PLAN-IMPLEMENTACION.md) —
// el pill es fijo, sin heurística de tipo de memoria (eso es de captura, no de acá).
const QUERY_PILL_COLOR = QUERY_COLOR

// Componentes de react-markdown restyleados al tema oscuro de Jarvis en vez de
// usar sus tags HTML por defecto (que heredarían estilos de SGR/Tailwind) —
// Mejoras_Jarvis.md punto 5 ("veo '**SQLite**' en vez de que se aplique").
const MARKDOWN_COMPONENTS = {
  p:          ({ children }) => <p style={{ margin: 0 }}>{children}</p>,
  strong:     ({ children }) => <strong style={{ color: '#f2f5ff', fontWeight: 700 }}>{children}</strong>,
  em:         ({ children }) => <em style={{ color: '#dbe2ff' }}>{children}</em>,
  ul:         ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</ul>,
  ol:         ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</ol>,
  li:         ({ children }) => <li style={{ lineHeight: 1.6 }}>{children}</li>,
  code:       ({ children }) => <code style={{ background: 'rgba(150,170,255,0.12)', borderRadius: 4, padding: '1px 5px', fontSize: '0.92em' }}>{children}</code>,
  a:          ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'underline' }}>{children}</a>,
  h1:         ({ children }) => <div style={{ fontSize: 16, fontWeight: 700, color: '#f2f5ff' }}>{children}</div>,
  h2:         ({ children }) => <div style={{ fontSize: 15, fontWeight: 700, color: '#f2f5ff' }}>{children}</div>,
  h3:         ({ children }) => <div style={{ fontSize: 14.5, fontWeight: 700, color: '#f2f5ff' }}>{children}</div>,
}

function typeColor(type) {
  return MEMORY_TYPE_COLORS[type] || MEMORY_TYPE_COLORS.RAW
}

function SourcesToggle({ sources, contextSent, contextCount, onOpenSource }) {
  const [open, setOpen] = useState(false)
  if (!sources || sources.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(150,170,255,0.22), transparent)' }} />
      <button
        onClick={() => setOpen(v => !v)}
        className="jv-mono"
        style={{
          display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, letterSpacing: '0.14em',
          color: 'var(--jv-mute)', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          alignSelf: 'flex-start',
        }}
      >
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        FUENTES · {contextSent ?? sources.length} / {contextCount ?? sources.length} MEMORIAS
      </button>
      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {sources.map((s, i) => {
            const color = typeColor(s.type)
            const text = s.title_hint || s.content_raw || s.title || '—'
            return (
              <button
                key={i}
                onClick={() => onOpenSource(s.id)}
                title="Ver la fuente completa"
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, maxWidth: 300, padding: '6px 10px',
                  borderRadius: 8, background: rgba(color, 0.08), border: `1px solid ${rgba(color, 0.26)}`,
                  cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => e.currentTarget.style.background = rgba(color, 0.16)}
                onMouseLeave={e => e.currentTarget.style.background = rgba(color, 0.08)}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, flex: 'none' }} />
                <div className="jv-mono" style={{ fontSize: 9.5, fontWeight: 700, color, flex: 'none' }}>{s.type}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(220,228,255,0.62)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {text}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MessageTime({ createdAt }) {
  if (!createdAt) return null
  return (
    <div className="jv-mono" style={{ fontSize: 9.5, color: 'rgba(200,214,255,0.28)', marginTop: 4 }}>
      {formatAge(createdAt)}
    </div>
  )
}

function MessageRow({ msg, onOpenSource }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', animation: 'jv-rise .35s ease both' }}>
        <div
          style={{
            maxWidth: 600, padding: '13px 17px', borderRadius: '15px 15px 4px 15px',
            background: 'linear-gradient(135deg, rgba(125,211,252,0.14), rgba(167,139,250,0.12))',
            border: '1px solid rgba(150,190,255,0.2)', fontSize: 14.5, lineHeight: 1.6, color: 'var(--jv-text-2)',
          }}
        >
          {msg.content}
        </div>
        <MessageTime createdAt={msg.created_at} />
      </div>
    )
  }

  if (msg.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', animation: 'jv-rise .35s ease both' }}>
        <div
          style={{
            maxWidth: 640, padding: '15px 18px', borderRadius: '4px 15px 15px 15px',
            background: 'rgba(244,114,182,0.07)', border: '1px solid rgba(244,114,182,0.28)',
            fontSize: 14.5, lineHeight: 1.6, color: '#f2dde8',
          }}
        >
          {ERROR_MSG}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', animation: 'jv-rise .35s ease both' }}>
      <div
        style={{
          maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 12, padding: '17px 19px',
          borderRadius: '4px 16px 16px 16px', background: 'rgba(12,16,32,0.72)',
          border: '1px solid var(--jv-border)', boxShadow: '0 18px 50px -24px rgba(0,0,0,0.9)',
        }}
      >
        <div style={{ fontSize: 14.5, lineHeight: 1.68, color: '#e9eeff', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ReactMarkdown components={MARKDOWN_COMPONENTS}>{msg.content || ''}</ReactMarkdown>
        </div>
        <SourcesToggle
          sources={msg.sources}
          contextSent={msg.context_sent}
          contextCount={msg.context_count}
          onOpenSource={onOpenSource}
        />
      </div>
      <MessageTime createdAt={msg.created_at} />
    </div>
  )
}

function TypingIndicator() {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 11,
        alignSelf: 'flex-start', background: 'rgba(12,16,32,0.6)', border: '1px solid var(--jv-border)',
      }}
    >
      <div style={{ display: 'flex', gap: 4 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7dd3fc', animation: 'jv-blink 1s infinite' }} />
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', animation: 'jv-blink 1s .2s infinite' }} />
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f472b6', animation: 'jv-blink 1s .4s infinite' }} />
      </div>
      <div className="jv-mono" style={{ fontSize: 11, color: 'var(--jv-subtext)' }}>
        clasificando · buscando en memoria · redactando
      </div>
    </div>
  )
}

export default function JarvisChat() {
  const { jarvisMessages, jarvisLoading, jarvisQuery, createJarvisChat } = useStore(
    useShallow(s => ({
      jarvisMessages:   s.jarvisMessages,
      jarvisLoading:    s.jarvisLoading,
      jarvisQuery:      s.jarvisQuery,
      createJarvisChat: s.createJarvisChat,
    }))
  )

  const [input, setInput] = useState('')
  const [openSourceId, setOpenSourceId] = useState(null)
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

  // Antes "borrar historial" solo limpiaba el estado local y el chat de
  // escritorio seguía siendo, del lado del backend, la misma conversación
  // compartida de siempre — el próximo mensaje volvía a traer todo el
  // historial "borrado" (causa raíz documentada en useStore.js). Ahora el
  // botón arranca un chat nuevo de verdad (id propio en el backend); el
  // chat viejo sigue existiendo y accesible desde la tira de chats, no se
  // pierde nada.
  function handleNewChat() {
    if (jarvisMessages.length === 0) return
    if (window.confirm('¿Empezar un chat nuevo? El actual queda guardado en la lista de chats.')) {
      createJarvisChat()
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <JarvisChatTabs />

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '26px 34px 10px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {jarvisMessages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'var(--jv-subtext)' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--jv-text-2)' }}>Jarvis — Segundo Cerebro</div>
            <div style={{ fontSize: 12 }}>Preguntale algo a tu memoria</div>
          </div>
        )}
        {jarvisMessages.map((msg, i) => <MessageRow key={i} msg={msg} onOpenSource={setOpenSourceId} />)}
        {jarvisLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {openSourceId && <JarvisSourceModal entryId={openSourceId} onClose={() => setOpenSourceId(null)} />}

      {/* Composer */}
      <div style={{ padding: '14px 34px 22px' }}>
        <div
          style={{
            borderRadius: 16, padding: 1,
            background: 'linear-gradient(110deg, rgba(125,211,252,0.5), rgba(74,222,128,0.4), rgba(251,191,36,0.4), rgba(167,139,250,0.5), rgba(244,114,182,0.45), rgba(125,211,252,0.5))',
            backgroundSize: '200% 100%', animation: 'jv-sweep 14s linear infinite',
          }}
        >
          <div style={{ borderRadius: 15, background: 'rgba(8,10,20,0.94)', backdropFilter: 'blur(16px)', padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Preguntale algo a tu memoria."
              style={{
                width: '100%', resize: 'none', border: 'none', background: 'transparent', color: 'var(--jv-text-2)',
                fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, lineHeight: 1.6,
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={handleNewChat}
                disabled={jarvisMessages.length === 0}
                title="Empezar chat nuevo"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26,
                  borderRadius: 8, border: 'none', background: 'transparent',
                  color: jarvisMessages.length > 0 ? 'var(--jv-subtext)' : 'var(--jv-mute)', cursor: jarvisMessages.length > 0 ? 'pointer' : 'default',
                }}
              >
                <Trash2 size={13} />
              </button>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', borderRadius: 20,
                  background: rgba(QUERY_PILL_COLOR, 0.1), border: `1px solid ${rgba(QUERY_PILL_COLOR, 0.3)}`,
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: QUERY_PILL_COLOR, boxShadow: `0 0 8px ${QUERY_PILL_COLOR}` }} />
                <div className="jv-mono" style={{ fontSize: 10, letterSpacing: '0.08em', color: QUERY_PILL_COLOR }}>PREGUNTA · va a retrieval</div>
              </div>
              <div className="jv-mono" style={{ fontSize: 10, color: 'rgba(200,214,255,0.3)' }}>
                {input.length ? `${input.length} caracteres` : 'sin límite de largo'}
              </div>
              <div style={{ flex: 1 }} />
              <div className="jv-mono" style={{ fontSize: 10, color: 'rgba(200,214,255,0.3)' }}>⏎ enviar · ⇧⏎ salto</div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || jarvisLoading}
                style={{
                  cursor: input.trim() && !jarvisLoading ? 'pointer' : 'default', padding: '8px 18px', borderRadius: 10,
                  fontSize: 13, fontWeight: 600, color: '#06070f', border: 'none',
                  background: input.trim() && !jarvisLoading ? 'linear-gradient(120deg,#7dd3fc,#a78bfa)' : 'rgba(150,170,255,0.16)',
                  boxShadow: input.trim() && !jarvisLoading ? '0 8px 26px -12px rgba(140,170,255,0.9)' : 'none',
                }}
              >
                Preguntar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
