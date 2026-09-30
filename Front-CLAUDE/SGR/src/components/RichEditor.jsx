import { useEffect, useRef } from 'react'
import { Bold, Italic, Underline, Heading2, Heading3, List, ListOrdered, Quote, Code, Link2, Eraser, Strikethrough } from 'lucide-react'

// Editor enriquecido liviano (contentEditable) — produce HTML compatible con los
// apuntes de las hojas (el backend lo convierte a Markdown al guardar).
export default function RichEditor({ value, onChange, placeholder = 'Escribí tus apuntes…', minHeight = 200 }) {
  const ref = useRef(null)
  const last = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    if (value !== last.current) {
      ref.current.innerHTML = value || ''
      last.current = value
    }
  }, [value])

  const emit = () => {
    const html = ref.current.innerHTML
    const clean = html === '<br>' ? '' : html
    last.current = clean
    onChange?.(clean)
  }

  const cmd = (c, arg) => {
    ref.current.focus()
    document.execCommand(c, false, arg)
    emit()
  }

  const tools = [
    { i: Bold, t: 'Negrita (Ctrl+B)', run: () => cmd('bold') },
    { i: Italic, t: 'Itálica (Ctrl+I)', run: () => cmd('italic') },
    { i: Underline, t: 'Subrayado', run: () => cmd('underline') },
    { i: Strikethrough, t: 'Tachado', run: () => cmd('strikeThrough') },
    { sep: true },
    { i: Heading2, t: 'Título', run: () => cmd('formatBlock', 'H2') },
    { i: Heading3, t: 'Subtítulo', run: () => cmd('formatBlock', 'H3') },
    { i: Quote, t: 'Cita', run: () => cmd('formatBlock', 'BLOCKQUOTE') },
    { i: Code, t: 'Código', run: () => cmd('formatBlock', 'PRE') },
    { sep: true },
    { i: List, t: 'Lista', run: () => cmd('insertUnorderedList') },
    { i: ListOrdered, t: 'Lista numerada', run: () => cmd('insertOrderedList') },
    {
      i: Link2,
      t: 'Enlace',
      run: () => {
        const url = window.prompt('URL del enlace')
        if (url) cmd('createLink', url)
      },
    },
    { i: Eraser, t: 'Limpiar formato', run: () => { cmd('removeFormat'); cmd('formatBlock', 'P') } },
  ]

  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="rte-bar">
        {tools.map((t, k) =>
          t.sep ? (
            <span key={k} style={{ width: 1, background: 'var(--line)', margin: '4px 4px' }} />
          ) : (
            <button key={k} type="button" className="iconbtn sm" title={t.t} onMouseDown={(e) => e.preventDefault()} onClick={t.run}>
              <t.i size={15} />
            </button>
          ),
        )}
      </div>
      <div
        ref={ref}
        className="rte"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        style={{ minHeight }}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault()
            cmd(e.shiftKey ? 'outdent' : 'indent')
          }
        }}
        onClick={(e) => {
          const a = e.target.closest('a')
          if (a && (e.ctrlKey || e.metaKey)) window.open(a.href, '_blank', 'noopener')
        }}
      />
    </div>
  )
}
