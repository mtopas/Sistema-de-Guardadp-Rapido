import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Halo que sigue al cursor: escribe --mx/--my que usa `.spotlight`. */
export function useSpotlight() {
  const ref = useRef(null)
  const onMove = useCallback((e) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
  }, [])
  return { ref, onMouseMove: onMove }
}

/** Número que cuenta hasta su valor con easing. */
export function useCountUp(value, { dur = 700, decimals = 0 } = {}) {
  const [v, setV] = useState(value)
  const from = useRef(value)
  const raf = useRef(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(value); return }
    const a = from.current
    const b = Number(value) || 0
    if (a === b) return
    const t0 = performance.now()
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      const cur = a + (b - a) * e
      setV(decimals ? Number(cur.toFixed(decimals)) : Math.round(cur))
      if (p < 1) raf.current = requestAnimationFrame(step)
      else from.current = b
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [value, dur, decimals])
  return v
}

/** Cierra con Escape. */
export function useEscape(onClose, active = true) {
  useEffect(() => {
    if (!active) return
    const h = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, active])
}

/** Atajos globales: mapa { 'ctrl+k': fn, 'escape': fn }. */
export function useHotkeys(map, deps = []) {
  useEffect(() => {
    const h = (e) => {
      const parts = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.shiftKey) parts.push('shift')
      if (e.altKey) parts.push('alt')
      parts.push(e.key.toLowerCase())
      const fn = map[parts.join('+')]
      if (!fn) return
      const tag = document.activeElement?.tagName
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable
      // Los atajos con modificador funcionan igual dentro de un input.
      if (editable && !(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      fn(e)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** Foco automático (modales). */
export function useAutoFocus(active = true) {
  const ref = useRef(null)
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => ref.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [active])
  return ref
}

/** Click fuera. */
export function useClickOutside(onOut, active = true) {
  const ref = useRef(null)
  useEffect(() => {
    if (!active) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut?.() }
    // `mousedown` en lugar de `click`: evita cerrarse por el click que abrió.
    setTimeout(() => document.addEventListener('mousedown', h), 0)
    return () => document.removeEventListener('mousedown', h)
  }, [onOut, active])
  return ref
}

/** Medida del contenedor, para gráficos responsivos. */
export function useSize() {
  const ref = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect
      setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

/** Estado espejado en localStorage. */
export function useLocal(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : JSON.parse(raw)
    } catch { return initial }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* noop */ }
  }, [key, v])
  return [v, setV]
}

/** Valor con retardo (búsquedas). */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** true una vez que el nodo entró en viewport: dispara animaciones de entrada. */
export function useInView({ once = true, margin = '0px' } = {}) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || (once && seen)) return
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setSeen(true); if (once) io.disconnect() } else if (!once) setSeen(false) },
      { rootMargin: margin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [once, margin, seen])
  return [ref, seen]
}
