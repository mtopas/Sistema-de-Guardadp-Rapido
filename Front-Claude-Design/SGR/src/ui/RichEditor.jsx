import { useEffect, useRef, useState } from 'react'
import {
  Bold, Code, Heading2, Italic, Link2, List, ListOrdered, Quote, Strikethrough, Underline,
} from 'lucide-react'
import { cx } from './primitives'
import { rewriteAssetsInHtml } from '../lib/api'

/**
 * Editor de apuntes sobre `contenteditable`. El proyecto original usa TipTap;
 * acá se mantiene el mismo contrato (HTML en el campo `apuntes`) sin sumar
 * 200 KB de dependencias. `document.execCommand` está deprecado pero es el
 * único camino sin librería y funciona en todos los navegadores actuales.
 */
export function RichEditor({ value, onChange, placeholder = 'Escribí tus apuntes…', className, minHeight = 200, readOnly }) {
  const ref = useRef(null)
  const [focused, setFocused] = useState(false)
  const last = useRef(value)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Solo reescribimos el DOM si el cambio vino de afuera: si no, se pierde el caret.
    if (value !== last.current && value !== el.innerHTML) {
      el.innerHTML = rewriteAssetsInHtml(value || '')
      last.current = value
    }
  }, [value])

  const emit = () => {
    const html = ref.current?.innerHTML ?? ''
    last.current = html
    onChange?.(html)
  }

  const cmd = (name, arg) => {
    ref.current?.focus()
    document.execCommand(name, false, arg)
    emit()
  }

  const link = () => {
    const url = window.prompt('URL del enlace')
    if (url) cmd('createLink', url)
  }

  const tools = [
    { icon: Bold, label: 'Negrita (Ctrl+B)', run: () => cmd('bold') },
    { icon: Italic, label: 'Itálica (Ctrl+I)', run: () => cmd('italic') },
    { icon: Underline, label: 'Subrayado', run: () => cmd('underline') },
    { icon: Strikethrough, label: 'Tachado', run: () => cmd('strikeThrough') },
    { sep: true },
    { icon: Heading2, label: 'Título', run: () => cmd('formatBlock', '<h2>') },
    { icon: Quote, label: 'Cita', run: () => cmd('formatBlock', '<blockquote>') },
    { icon: Code, label: 'Código', run: () => cmd('formatBlock', '<pre>') },
    { sep: true },
    { icon: List, label: 'Lista', run: () => cmd('insertUnorderedList') },
    { icon: ListOrdered, label: 'Lista numerada', run: () => cmd('insertOrderedList') },
    { icon: Link2, label: 'Enlace', run: link },
  ]

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      {!readOnly && (
        <div
          className="flex flex-wrap items-center gap-0.5 rounded-t-[11px] border border-line px-1.5 py-1"
          style={{ background: 'color-mix(in srgb, var(--elev) 55%, transparent)', borderBottom: 0 }}
        >
          {tools.map((t, i) =>
            t.sep ? (
              <span key={i} className="mx-1 h-4 w-px" style={{ background: 'var(--border-2)' }} />
            ) : (
              <button
                key={i}
                type="button"
                className="icon-btn h-7 w-7"
                title={t.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={t.run}
              >
                <t.icon size={13} />
              </button>
            ),
          )}
        </div>
      )}
      <div
        ref={ref}
        className={cx('rich scroll flex-1 px-3.5 py-3 transition-all duration-200', readOnly ? 'rounded-[11px]' : 'rounded-b-[11px]')}
        style={{
          minHeight,
          border: '1px solid',
          borderColor: focused ? 'color-mix(in srgb, var(--accent) 65%, transparent)' : 'var(--border)',
          background: 'color-mix(in srgb, var(--elev) 40%, transparent)',
          boxShadow: focused ? '0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent)' : 'none',
        }}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-ph={placeholder}
        onInput={emit}
        onBlur={() => { setFocused(false); emit() }}
        onFocus={() => setFocused(true)}
        onPaste={(e) => {
          // Pegar como texto plano evita arrastrar estilos de Word/Notion.
          e.preventDefault()
          const t = e.clipboardData.getData('text/plain')
          document.execCommand('insertText', false, t)
        }}
      />
    </div>
  )
}
