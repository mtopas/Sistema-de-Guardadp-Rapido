import { useState } from 'react'
import { X, StickyNote } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'

export default function NotasCard() {
  const lang       = useStore(s => s.lang)
  const finNotas   = useStore(s => s.finNotas)
  const addFinNota = useStore(s => s.addFinNota)
  const deleteFinNota = useStore(s => s.deleteFinNota)

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAdd = async () => {
    const text = input.trim()
    if (!text) return
    setLoading(true)
    await addFinNota(text)
    setInput('')
    setLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="panel-strong p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <StickyNote size={14} style={{ color: 'var(--accent)' }} />
        <span
          className="serif italic text-[15px] font-semibold"
          style={{ color: 'var(--text)' }}
        >
          {t(lang, 'notesTitle')}
        </span>
        {finNotas.length > 0 && (
          <span
            className="ml-auto chip text-[10px]"
            style={{ color: 'var(--subtext)' }}
          >
            {finNotas.length}
          </span>
        )}
      </div>

      {/* Notes list */}
      {finNotas.length === 0 ? (
        <p className="text-[12px] italic mb-3" style={{ color: 'var(--subtext)' }}>
          {t(lang, 'noNotes')}
        </p>
      ) : (
        <div className="flex flex-col gap-2 mb-3">
          {finNotas.map(nota => {
            const contenido = nota.contenido ?? nota
            const id = nota.id ?? contenido
            const fecha = nota.fecha
              ? new Date(nota.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
              : null

            return (
              <div
                key={id}
                className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
                style={{
                  background: 'color-mix(in oklch, var(--accent-light) 30%, var(--bg))',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text)' }}>
                    {contenido}
                  </p>
                  {fecha && (
                    <p className="text-[10px] mt-0.5 mono" style={{ color: 'var(--subtext)' }}>
                      {fecha}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t(lang, 'deleteNote')}
                  onClick={() => deleteFinNota(id)}
                  className="icon-btn-fin shrink-0 mt-0.5 opacity-50 hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t(lang, 'addNote')}
          disabled={loading}
          className="flex-1 px-3 py-2 rounded-xl border outline-none text-[12.5px] transition-colors"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!input.trim() || loading}
          className="btn-fin disabled:opacity-40"
          style={{
            background: 'var(--cta-bg)',
            color: 'var(--cta-text)',
            border: 'none',
            fontWeight: 600,
          }}
        >
          +
        </button>
      </div>
    </div>
  )
}
