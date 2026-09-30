import { createContext, useContext, useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Loader2, Search, X } from 'lucide-react'
import { useAutoFocus, useClickOutside, useCountUp, useEscape, useSpotlight } from './hooks'

export const cx = (...a) => a.filter(Boolean).join(' ')

// ── Card ───────────────────────────────────────────────────────────────
export function Card({ as: As = 'section', className, lit = true, spot = false, lift = false, children, ...rest }) {
  const sp = useSpotlight()
  const extra = spot ? { ref: sp.ref, onMouseMove: sp.onMouseMove } : {}
  return (
    <As
      className={cx('panel', lit && 'panel-lit', spot && 'spotlight', lift && 'lift', className)}
      {...extra}
      {...rest}
    >
      {children}
    </As>
  )
}

export function CardHead({ title, sub, icon: Icon, right, className }) {
  return (
    <header className={cx('flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5', className)}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-txt">
          {Icon && <Icon size={15} style={{ color: 'var(--accent)' }} />}
          <span className="truncate1">{title}</span>
        </h3>
        {sub && <p className="mt-0.5 text-[11.5px] text-txt-sub clamp2">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
    </header>
  )
}

// ── Botones ────────────────────────────────────────────────────────────
export function Button({ variant = 'default', size, icon: Icon, loading, className, children, ...rest }) {
  const v = { default: '', primary: 'btn-primary', ghost: 'btn-ghost', danger: 'btn-danger' }[variant] || ''
  return (
    <button className={cx('btn', v, size === 'sm' && 'btn-sm', className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Loader2 size={14} className="a-spin" /> : Icon ? <Icon size={14} /> : null}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, label, size = 15, active, className, ...rest }) {
  return (
    <button
      className={cx('icon-btn', className)}
      title={label}
      aria-label={label}
      style={active ? { color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)' } : undefined}
      {...rest}
    >
      <Icon size={size} />
    </button>
  )
}

// ── Inputs ─────────────────────────────────────────────────────────────
export function Field({ label, hint, error, children, className, required }) {
  return (
    <label className={cx('block min-w-0', className)}>
      {label && (
        <span className="label mb-1.5 block">
          {label}
          {required && <span style={{ color: 'var(--danger)' }}> *</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1 block text-[11px]" style={{ color: 'var(--danger)' }}>{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11px] text-txt-mute">{hint}</span>
      ) : null}
    </label>
  )
}

// Ojo: el className va DESPUÉS del spread. Al revés, un `className: undefined`
// en el resto de props pisaba la clase y los campos quedaban sin estilo.
export const Input = ({ className, ...rest }) => <input {...rest} className={cx('input', className)} />
export const Textarea = ({ className, ...rest }) => <textarea {...rest} className={cx('textarea', className)} />

export function Select({ options = [], placeholder, className, ...rest }) {
  return (
    <div className={cx('relative', className)}>
      <select className="select" {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) =>
          typeof o === 'object' ? (
            <option key={o.value ?? o.id} value={o.value ?? o.id}>{o.label ?? o.nombre}</option>
          ) : (
            <option key={o} value={o}>{o}</option>
          ),
        )}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-txt-sub" />
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', onClear, className, ...rest }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-txt-sub" />
      <input
        className="input pl-9 pr-8"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        {...rest}
      />
      {value ? (
        <button
          className="icon-btn absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
          onClick={() => (onClear ? onClear() : onChange(''))}
          aria-label="Limpiar"
        >
          <X size={13} />
        </button>
      ) : null}
    </div>
  )
}

export function Switch({ checked, onChange, label, className }) {
  return (
    <button
      role="switch"
      aria-checked={!!checked}
      onClick={() => onChange(!checked)}
      className={cx('flex items-center gap-2.5 text-[12.5px]', className)}
      type="button"
    >
      <span
        className="relative inline-block h-[19px] w-[34px] shrink-0 rounded-full transition-all duration-300"
        style={{
          background: checked
            ? 'linear-gradient(115deg, var(--accent-deep), var(--accent))'
            : 'color-mix(in srgb, var(--elev) 90%, transparent)',
          border: '1px solid var(--border)',
          boxShadow: checked ? '0 0 14px -3px color-mix(in srgb, var(--accent) 70%, transparent)' : 'none',
        }}
      >
        <span
          className="absolute top-[2px] h-[13px] w-[13px] rounded-full bg-white transition-all duration-300 ease-swift"
          style={{ left: checked ? 18 : 3 }}
        />
      </span>
      {label && <span className="text-txt-2">{label}</span>}
    </button>
  )
}

export function Checkbox({ checked, onChange, label, color, className }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!checked}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      className={cx('flex items-center gap-2 text-left', className)}
    >
      <span
        className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] transition-all duration-200 ease-spring"
        style={{
          border: `1.5px solid ${checked ? color || 'var(--accent)' : 'var(--border-2)'}`,
          background: checked ? color || 'var(--accent)' : 'transparent',
          transform: checked ? 'scale(1.06)' : 'scale(1)',
        }}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="a-pop">
            <path d="M2 6.2 4.6 8.8 10 3.4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label && <span className="min-w-0 flex-1">{label}</span>}
    </button>
  )
}

export function ColorPicker({ value, onChange, colors, className }) {
  const list = colors || ['#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#3b82f6','#f97316','#14b8a6','#a855f7','#f43f5e','#84cc16','#ec4899']
  return (
    <div className={cx('flex flex-wrap gap-1.5', className)}>
      {list.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          className="h-6 w-6 rounded-lg transition-all duration-200 ease-spring"
          style={{
            background: c,
            transform: value === c ? 'scale(1.18)' : 'scale(1)',
            boxShadow: value === c ? `0 0 0 2px var(--panel-bg), 0 0 0 4px ${c}, 0 6px 16px -6px ${c}` : 'none',
          }}
        />
      ))}
      <label className="grid h-6 w-6 cursor-pointer place-items-center rounded-lg border border-line text-[9px] text-txt-sub">
        <input type="color" value={value || '#8b5cf6'} onChange={(e) => onChange(e.target.value)} className="sr-only" />
        +
      </label>
    </div>
  )
}

// ── Tabs con píldora animada ───────────────────────────────────────────
export function Tabs({ value, onChange, items, className }) {
  const id = useId()
  return (
    <div className={cx('tabs', className)} role="tablist">
      {items.map((it) => {
        const on = value === it.id
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={on}
            data-on={on}
            className="tab"
            onClick={() => onChange(it.id)}
          >
            {on && <span className="tab-pill a-scale" key={`${id}-pill`} />}
            <span className="relative z-10 flex items-center gap-1.5">
              {it.icon && <it.icon size={13} />}
              {it.label}
              {it.badge != null && <span className="badge ml-0.5">{it.badge}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, sub, icon: Icon, width = 560, footer, children, dismissable = true }) {
  useEscape(dismissable ? onClose : undefined, open)
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (dismissable && e.target === e.currentTarget) onClose?.() }}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, var(--accent), var(--b2), transparent)' }}
        />
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              {Icon && (
                <span
                  className="grid h-7 w-7 place-items-center rounded-[9px]"
                  style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}
                >
                  <Icon size={15} />
                </span>
              )}
              <span className="truncate1">{title}</span>
            </h2>
            {sub && <p className="mt-1 text-[11.5px] text-txt-sub">{sub}</p>}
          </div>
          <IconButton icon={X} label="Cerrar" onClick={onClose} />
        </header>
        <div className="scroll flex-1 px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

export function Confirm({ open, onClose, onConfirm, title = '¿Seguro?', body, cta = 'Eliminar', danger = true }) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={430}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => { setBusy(true); try { await onConfirm?.() } finally { setBusy(false); onClose?.() } }}
          >
            {cta}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-txt-2">{body}</p>
    </Modal>
  )
}

// ── Menú contextual ────────────────────────────────────────────────────
export function Menu({ trigger, items, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside(() => setOpen(false), open)
  return (
    <div className="relative" ref={ref}>
      <span onClick={() => setOpen((v) => !v)}>{trigger}</span>
      {open && (
        <div
          className={cx(
            'panel absolute z-50 mt-1 min-w-[178px] overflow-hidden p-1 a-scale',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          style={{ boxShadow: '0 22px 48px -20px #000' }}
        >
          {items.filter(Boolean).map((it, i) =>
            it.sep ? (
              <hr key={i} className="divider my-1" />
            ) : (
              <button
                key={i}
                className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[12.5px] transition-colors duration-150 hover:bg-elev"
                style={it.danger ? { color: 'var(--danger)' } : undefined}
                onClick={() => { setOpen(false); it.onClick?.() }}
              >
                {it.icon && <it.icon size={14} />}
                <span className="flex-1">{it.label}</span>
                {it.hint && <span className="text-[10.5px] text-txt-mute mono">{it.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

// ── Piezas informativas ────────────────────────────────────────────────
export function Chip({ color, children, onClick, active, className, style }) {
  return (
    <span
      className={cx('chip', onClick && 'cursor-pointer transition-all duration-200 hover:-translate-y-px', className)}
      onClick={onClick}
      style={{
        ...(color ? { borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, color } : null),
        ...(active ? { background: `color-mix(in srgb, ${color || 'var(--accent)'} 20%, transparent)` } : null),
        ...style,
      }}
    >
      {color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  )
}

export function Dot({ color = 'var(--accent)', size = 7, pulse }) {
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full" style={{ background: color }} />
      {pulse && (
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: color, animation: 'breathe 2s ease-in-out infinite' }}
        />
      )}
    </span>
  )
}

export function Stat({ label, value, sub, tone, icon: Icon, delta, className, animate = true, decimals = 0, format }) {
  const numeric = typeof value === 'number'
  const shown = useCountUp(numeric && animate ? value : 0, { decimals })
  const render = () => {
    if (!numeric || !animate) return format && numeric ? format(value) : value
    return format ? format(shown) : shown.toLocaleString('es-AR', { maximumFractionDigits: decimals })
  }
  const color = tone === 'good' ? 'var(--success)' : tone === 'bad' ? 'var(--danger)' : tone === 'warn' ? 'var(--warning)' : 'var(--text)'
  return (
    <div className={cx('surface relative overflow-hidden px-3.5 py-3', className)}>
      <div
        className="stat-glow pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full"
        style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="label truncate1">{label}</span>
        {Icon && <Icon size={13} style={{ color }} className="shrink-0 opacity-70" />}
      </div>
      <div className="mono tnum mt-1.5 text-[19px] font-semibold leading-none" style={{ color }}>
        {render()}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {sub && <span className="truncate1 text-[11px] text-txt-sub">{sub}</span>}
        {delta != null && (
          <span
            className="mono text-[10.5px] font-semibold"
            style={{ color: delta >= 0 ? 'var(--success)' : 'var(--danger)' }}
          >
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}

export function Progress({ value, max = 100, color = 'var(--accent)', height = 6, label, className, showPct }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className={className}>
      {(label || showPct) && (
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
          <span className="truncate1 text-txt-sub">{label}</span>
          {showPct && <span className="mono tnum shrink-0 font-semibold" style={{ color }}>{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="overflow-hidden rounded-full" style={{ height, background: 'color-mix(in srgb, var(--elev) 90%, transparent)' }}>
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-swift"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, color-mix(in srgb, ${color} 62%, transparent), ${color})`,
            boxShadow: `0 0 12px -2px ${color}`,
          }}
        />
      </div>
    </div>
  )
}

export function Empty({ icon: Icon, title, body, action, className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-12 text-center a-fade', className)}>
      {Icon && (
        <div
          className="a-float mb-3.5 grid h-14 w-14 place-items-center rounded-[18px]"
          style={{
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 26%, transparent)',
            color: 'var(--accent)',
          }}
        >
          <Icon size={24} />
        </div>
      )}
      <h4 className="text-[14px] font-semibold">{title}</h4>
      {body && <p className="mt-1.5 max-w-[340px] text-[12.5px] leading-relaxed text-txt-sub">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ h = 16, w = '100%', className, style }) {
  return <div className={cx('skeleton', className)} style={{ height: h, width: w, ...style }} />
}

export function SkeletonList({ rows = 5, h = 46 }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={h} style={{ animationDelay: `${i * 90}ms`, opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  )
}

export function Spinner({ size = 16, className }) {
  return <Loader2 size={size} className={cx('a-spin', className)} style={{ color: 'var(--accent)' }} />
}

/** Barra de scroll horizontal con degradados de borde para listas largas. */
export function Scroller({ children, className }) {
  return (
    <div className={cx('relative', className)}>
      <div className="scroll flex gap-2 pb-1" style={{ scrollbarWidth: 'none' }}>{children}</div>
    </div>
  )
}

export function Kbd({ children }) {
  return (
    <kbd
      className="mono rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: 'color-mix(in srgb, var(--elev) 90%, transparent)', border: '1px solid var(--border-2)', color: 'var(--subtext)' }}
    >
      {children}
    </kbd>
  )
}

// ── Layout de 3 columnas compartido por Finanzas / Agenda / Hábitos ────
export function ThreeCol({ left, center, right, leftWidth = 272, rightWidth = 312 }) {
  return (
    <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
      {left && (
        <aside className="scroll hidden shrink-0 lg:block a-left" style={{ width: leftWidth }}>
          {left}
        </aside>
      )}
      <div className="scroll min-w-0 flex-1 a-up">{center}</div>
      {right && (
        <aside className="scroll hidden shrink-0 xl:block a-right" style={{ width: rightWidth }}>
          {right}
        </aside>
      )}
    </div>
  )
}

// ── Contexto de "sección" para los accents por módulo ──────────────────
const SectionCtx = createContext('/')
export const useSection = () => useContext(SectionCtx)
export const SectionProvider = SectionCtx.Provider
