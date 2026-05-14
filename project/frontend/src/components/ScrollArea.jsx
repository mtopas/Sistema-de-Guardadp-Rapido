import { useEffect, useRef, useState } from 'react'

export default function ScrollArea({
  children,
  className = '',
  contentClassName = '',
  style = {},
}) {
  const scrollRef = useRef(null)
  const [thumb, setThumb] = useState({ top: 0, height: 0, pos: 0, visible: false })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let raf = 0
    const compute = () => {
      raf = 0
      const { scrollTop, scrollHeight, clientHeight } = el
      const max = scrollHeight - clientHeight
      if (max <= 0) {
        setThumb({ top: 0, height: 0, pos: 0, visible: false })
        return
      }
      const ratio  = clientHeight / scrollHeight
      const height = Math.max(28, clientHeight * ratio)
      const pos    = scrollTop / max
      const top    = pos * (clientHeight - height)
      setThumb({ top, height, pos, visible: true })
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(compute) }
    compute()
    el.addEventListener('scroll', schedule, { passive: true })
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', schedule)
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className={`relative ${className}`} style={style}>
      <div
        ref={scrollRef}
        className={`absolute inset-0 overflow-y-auto scroll-area-host ${contentClassName}`}
      >
        {children}
      </div>
      {thumb.visible && (
        <div
          aria-hidden
          className="scroll-area-thumb"
          style={{
            top:    thumb.top,
            height: thumb.height,
            backgroundPositionY: `${(thumb.pos * 100).toFixed(2)}%`,
          }}
        />
      )}
    </div>
  )
}
