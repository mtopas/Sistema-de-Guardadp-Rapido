import { useEffect } from 'react'

/**
 * Keyboard navigation hook for Agenda screens.
 *
 * Binds arrow keys for date/week navigation and optional
 * shortcut keys for creating new items.
 *
 * Usage:
 *   useAgendaKeyboard({
 *     onPrev:      () => goMonth(-1),   // ← ArrowLeft
 *     onNext:      () => goMonth(1),    // → ArrowRight
 *     onToday:     () => goToday(),     // T key
 *     onNew:       () => openModal(),   // N key
 *     disabled:    modalIsOpen,         // suspend when modal is open
 *   })
 */
export function useAgendaKeyboard({ onPrev, onNext, onToday, onNew, disabled = false } = {}) {
  useEffect(() => {
    if (disabled) return

    const handler = (e) => {
      // Ignore when focus is inside an input/textarea/contenteditable
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          onPrev?.()
          break
        case 'ArrowRight':
          e.preventDefault()
          onNext?.()
          break
        case 't':
        case 'T':
          onToday?.()
          break
        case 'n':
        case 'N':
          onNew?.()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onPrev, onNext, onToday, onNew, disabled])
}
