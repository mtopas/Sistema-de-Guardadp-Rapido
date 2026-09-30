import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, animate } from 'framer-motion'
import { X, Check as CheckIco, AlertTriangle, Info, CircleAlert } from 'lucide-react'
import { useUI } from '../store/ui'

export const SWATCHES = ['#ff2e97', '#ff4d6d', '#ff6b2c', '#ffb800', '#f9f871', '#b4ff39', '#2effa8', '#00f0ff', '#00c2ff', '#4d7cff', '#9d4bff', '#ff8af2']

export const spring = { type: 'spring', stiffness: 380, damping: 32 }

export const fadeUp = {
  hidden: { opacity: 0, y: 14, filter: 'blur(6px)' },
  show: (i = 0) => ({ opacity: 1, y: 0, filter: 'blur(0px)', transition: { delay: i * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] } }),
}

export function Stagger({ children, className, style, delay = 0.045 }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: delay } } }}
    >
      {children}
    </motion.div>
  )
}

export function Item({ children, className, style, as = 'div', ...rest }) {
  const C = motion[as]
  return (
    <C className={className} style={style} variants={fadeUp} {...rest}>
      {children}
    </C>
  )
}

export function Panel({ children, className = '', title, icon: Icon, actions, edge = true, style, ...rest }) {
  return (
    <motion.section
      className={`glass card ${edge ? 'neon-edge' : ''} ${className}`}
      style={style}
      variants={fadeUp}
      initial="hidden"
      animate="show"
      {...rest}
    >
      {(title || actions) && (
        <div className="card-h">
          {Icon && (
            <span className="ic">
              <Icon size={15} />
            </span>
          )}
          {title && <h3>{title}</h3>}
          <span className="grow" />
          {actions}
        </div>
      )}
      {children}
    </motion.section>
  )
}

export function Modal({ open, onClose, title, icon: Icon, children, footer, wide, onSubmit }) {
  const ref = useRef(null)
  const cbs = useRef({})
  cbs.current = { onClose, onSubmit }
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cbs.current.onClose?.()
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && cbs.current.onSubmit) {
        e.preventDefault()
        cbs.current.onSubmit()
      }
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey, true)
    setTimeout(() => {
      const el = ref.current?.querySelector('[autofocus], input, textarea, select')
      el?.focus()
    }, 60)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, pointerEvents: 'none', transitionEnd: { display: 'none' } }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            className={`glass strong modal ${wide ? 'wide' : ''}`}
            initial={{ opacity: 0, y: 30, scale: 0.94, rotateX: 8 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            style={{ transformPerspective: 1000 }}
          >
            <div className="modal-glow" />
            <div className="modal-h">
              {Icon && (
                <span className="card-h" style={{ margin: 0 }}>
                  <span className="ic">
                    <Icon size={15} />
                  </span>
                </span>
              )}
              <h2 className="grow">{title}</h2>
              <button className="iconbtn" onClick={onClose} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <div className="modal-b">{children}</div>
            {footer && <div className="modal-f">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Pill deslizante medida con refs (sin layoutId: los layoutId de framer-motion
// dentro de un modal que sale dejaban el overlay colgado e invisible).
function useSlidingPill(value, deps = []) {
  const wrap = useRef(null)
  const [box, setBox] = useState(null)
  useEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector('[data-on="1"]')
      if (el) setBox({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight })
      else setBox(null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (wrap.current) ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [value, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  return [wrap, box]
}

export function Tabs({ tabs, value, onChange }) {
  const [wrap, box] = useSlidingPill(value, [tabs.length])
  return (
    <div className="tabs" role="tablist" ref={wrap} style={{ position: 'relative' }}>
      {box && <span className="tab-pill" style={{ position: 'absolute', ...box, zIndex: 0, transition: 'all .45s cubic-bezier(.16,1,.3,1)' }} />}
      {tabs.map((t) => (
        <button key={t.id} data-on={value === t.id ? '1' : '0'} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)} style={{ zIndex: 1 }}>
          {t.icon && <t.icon size={15} style={{ position: 'relative', zIndex: 1 }} />}
          <span>{t.label}</span>
          {t.badge ? <span className="chip" style={{ padding: '0 7px', fontSize: 10, position: 'relative', zIndex: 1 }}>{t.badge}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function Seg({ options, value, onChange }) {
  const [wrap, box] = useSlidingPill(value, [options.length])
  return (
    <div className="seg" ref={wrap}>
      {box && <span className="seg-pill" style={{ position: 'absolute', ...box, inset: 'auto', zIndex: 0, transition: 'all .4s cubic-bezier(.16,1,.3,1)' }} />}
      {options.map((o) => {
        const v = typeof o === 'string' || typeof o === 'number' ? o : o.id
        const l = typeof o === 'string' || typeof o === 'number' ? o : o.label
        return (
          <button key={v} type="button" data-on={value === v ? '1' : '0'} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {l}
          </button>
        )
      })}
    </div>
  )
}

export function Field({ label, children, style, className = '' }) {
  return (
    <div className={`field ${className}`} style={style}>
      {label && <label>{label}</label>}
      {children}
    </div>
  )
}

export function Swatches({ value, onChange, colors = SWATCHES }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          type="button"
          key={c}
          className={`swatch ${value?.toLowerCase() === c ? 'on' : ''}`}
          style={{ background: c, color: c }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
      <label className="swatch" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)', position: 'relative', overflow: 'hidden' }} title="Color personalizado">
        <input type="color" value={value || '#9d4bff'} onChange={(e) => onChange(e.target.value)} style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }} />
      </label>
    </div>
  )
}

export function Check({ on, half, onClick, color, size = 20, title }) {
  return (
    <motion.button
      type="button"
      title={title}
      className={`check ${on ? 'on' : ''} ${half ? 'half' : ''}`}
      style={{ width: size, height: size, ...(on && color ? { background: color, boxShadow: `0 0 14px -2px ${color}` } : {}) }}
      onClick={(e) => { e.stopPropagation(); onClick?.(e) }}
      whileTap={{ scale: 0.8 }}
      animate={on ? { scale: [1, 1.25, 1] } : { scale: 1 }}
    >
      {(on || half) && <Check2 size={size - 7} />}
    </motion.button>
  )
}
const Check2 = ({ size }) => <CheckIco size={size} strokeWidth={3.2} />

export function Switch({ on, onChange }) {
  return <button type="button" className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} />
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && (
        <div className="e-ic">
          <Icon size={26} />
        </div>
      )}
      {title && <div style={{ color: 'var(--text)', fontWeight: 600 }}>{title}</div>}
      {children && <div className="small">{children}</div>}
      {action}
    </div>
  )
}

export function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString('es-AR'), duration = 0.9 }) {
  const ref = useRef(null)
  const prev = useRef(0)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    const ctrl = animate(from, value || 0, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { if (ref.current) ref.current.textContent = format(v) },
    })
    return () => ctrl.stop()
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref}>{format(value || 0)}</span>
}

export function Kpi({ label, value, sub, color = 'var(--a1)', icon: Icon, i = 0 }) {
  return (
    <motion.div className="glass kpi neon-edge" variants={fadeUp} initial="hidden" animate="show" custom={i} whileHover={{ y: -3 }}>
      <div className="k-glow" style={{ background: color }} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="k-l">{label}</span>
        {Icon && <Icon size={16} style={{ color, filter: `drop-shadow(0 0 6px ${color})` }} />}
      </div>
      <div className="k-v tnum">{value}</div>
      {sub && <div className="k-s">{sub}</div>}
    </motion.div>
  )
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts)
  const dismiss = useUI((s) => s.dismissToast)
  const meta = {
    ok: { c: 'var(--ok)', I: CheckIco },
    warn: { c: 'var(--warn)', I: AlertTriangle },
    error: { c: 'var(--err)', I: CircleAlert },
    info: { c: 'var(--cyan)', I: Info },
  }
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => {
          const m = meta[t.kind] || meta.ok
          return (
            <motion.div
              key={t.id}
              layout
              className="toast"
              style={{ '--tc': m.c }}
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={spring}
              onClick={() => dismiss(t.id)}
            >
              <span className="t-ic"><m.I size={18} /></span>
              <span>{t.msg}</span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

// Botón de borrado con confirmación en dos clicks.
export function ConfirmButton({ onConfirm, children, className = 'btn danger sm', confirmText = '¿Seguro? Click de nuevo', icon }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        e.stopPropagation()
        if (armed) { setArmed(false); onConfirm() }
        else setArmed(true)
      }}
    >
      {icon}
      {armed ? confirmText : children}
    </button>
  )
}

export function Dropdown({ open, onClose, children, style, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const k = (e) => e.key === 'Escape' && onClose()
    setTimeout(() => document.addEventListener('mousedown', h), 0)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className={`pop ${className}`}
          style={style}
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.18 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Loader({ label = 'Cargando' }) {
  return (
    <div className="empty">
      <div style={{ position: 'relative', width: 54, height: 54 }}>
        <div className="spin" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: 'var(--a1)', borderRightColor: 'var(--a2)', boxShadow: '0 0 20px -4px var(--a1)' }} />
        <div className="spin" style={{ position: 'absolute', inset: 9, borderRadius: '50%', border: '2px solid transparent', borderBottomColor: 'var(--a3)', animationDirection: 'reverse', animationDuration: '1.6s' }} />
      </div>
      <span className="tiny upper">{label}…</span>
    </div>
  )
}

export function Highlight({ text, q }) {
  if (!q || !text) return text || null
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text
  return (
    <span className="hl-text">
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </span>
  )
}

// Envuelve una acción async para que no pueda dispararse dos veces en paralelo.
export function useBusy(fn) {
  const busy = useRef(false)
  const [state, setState] = useState(false)
  const run = async (...a) => {
    if (busy.current) return
    busy.current = true
    setState(true)
    try { return await fn(...a) } finally { busy.current = false; setState(false) }
  }
  return [run, state]
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
