import { useMemo, useState } from 'react'
import { useInView, useSize } from './hooks'
import { cx } from './primitives'

const uid = () => `g${Math.random().toString(36).slice(2, 9)}`

/* ═══ Donut ═══════════════════════════════════════════════════════════
   Anillo animado con hueco central. `data` = [{ name, value, color }]. */
export function Donut({ data = [], size = 168, thickness = 16, center, onSlice, className }) {
  const [ref, seen] = useInView()
  const [hover, setHover] = useState(null)
  const total = data.reduce((a, b) => a + Math.max(0, b.value), 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r

  let acc = 0
  const slices = data
    .filter((d) => d.value > 0)
    .map((d, i) => {
      const frac = total ? d.value / total : 0
      const s = { ...d, frac, offset: acc, i }
      acc += frac
      return s
    })

  return (
    <div ref={ref} className={cx('relative grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="color-mix(in srgb, var(--elev) 90%, transparent)" strokeWidth={thickness}
        />
        {slices.map((s) => {
          const active = hover === s.i
          return (
            <circle
              key={s.name}
              cx={size / 2} cy={size / 2} r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={active ? thickness + 4 : thickness}
              strokeLinecap="butt"
              strokeDasharray={`${seen ? s.frac * c : 0} ${c}`}
              strokeDashoffset={-s.offset * c}
              style={{
                transition: 'stroke-dasharray 900ms cubic-bezier(0.22,1,0.36,1), stroke-width 200ms ease',
                transitionDelay: `${s.i * 70}ms`,
                filter: active ? `drop-shadow(0 0 7px ${s.color})` : 'none',
                cursor: onSlice ? 'pointer' : 'default',
              }}
              onMouseEnter={() => setHover(s.i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSlice?.(s)}
            />
          )
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        {hover != null && slices[hover] ? (
          <div className="a-fade px-4">
            <div className="truncate1 text-[11px] font-medium" style={{ color: slices[hover].color }}>
              {slices[hover].name}
            </div>
            <div className="mono tnum text-[15px] font-semibold">{Math.round(slices[hover].frac * 100)}%</div>
          </div>
        ) : (
          center
        )}
      </div>
    </div>
  )
}

/* ═══ Barras verticales ═══════════════════════════════════════════════ */
export function Bars({ data = [], height = 150, gap = 5, format = (v) => v, onBar, active, className }) {
  const [ref, seen] = useInView()
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)))
  return (
    <div ref={ref} className={cx('relative', className)}>
      <div className="flex items-end" style={{ height, gap }}>
        {data.map((d, i) => {
          const h = (Math.abs(d.value) / max) * 100
          const on = hover === i || active === d.label
          return (
            <div
              key={d.label ?? i}
              className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
              style={{ height: '100%' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onBar?.(d)}
            >
              <div
                className="w-full rounded-t-[5px]"
                style={{
                  height: seen && Math.abs(d.value) > 0 ? `${Math.max(2, h)}%` : '0%',
                  background: on
                    ? `linear-gradient(180deg, ${d.color || 'var(--accent-light)'}, ${d.color || 'var(--accent)'})`
                    : `linear-gradient(180deg, color-mix(in srgb, ${d.color || 'var(--accent)'} 80%, transparent), color-mix(in srgb, ${d.color || 'var(--accent)'} 34%, transparent))`,
                  transition: 'height 780ms cubic-bezier(0.22,1,0.36,1), background 200ms ease',
                  transitionDelay: `${i * 42}ms`,
                  boxShadow: on ? `0 0 16px -4px ${d.color || 'var(--accent)'}` : 'none',
                  cursor: onBar ? 'pointer' : 'default',
                }}
              />
              {hover === i && (
                <div
                  className="panel a-fade pointer-events-none absolute bottom-full z-20 mb-1.5 whitespace-nowrap px-2 py-1 text-[11px]"
                  style={{ boxShadow: '0 12px 28px -12px #000' }}
                >
                  <b className="mono">{format(d.value)}</b>
                  {d.hint && <span className="ml-1.5 text-txt-sub">{d.hint}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex" style={{ gap }}>
        {data.map((d, i) => (
          <div key={d.label ?? i} className="min-w-0 flex-1 truncate1 text-center text-[9.5px] text-txt-mute">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══ Barras agrupadas (ingresos vs gastos) ═══════════════════════════ */
export function GroupedBars({ data = [], series = [], height = 170, format = (v) => v, className }) {
  const [ref, seen] = useInView()
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Math.abs(d[s.key] || 0))))
  return (
    <div ref={ref} className={cx('relative', className)}>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={d.label ?? i}
            className="relative flex min-w-0 flex-1 items-end justify-center gap-[2px]"
            style={{ height: '100%' }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {series.map((s, si) => {
              const v = Math.abs(d[s.key] || 0)
              return (
                <div
                  key={s.key}
                  className="min-w-0 flex-1 rounded-t-[4px]"
                  style={{
                    height: seen && v > 0 ? `${Math.max(2.5, (v / max) * 100)}%` : '0%',
                    background: `linear-gradient(180deg, ${s.color}, color-mix(in srgb, ${s.color} 40%, transparent))`,
                    transition: 'height 760ms cubic-bezier(0.22,1,0.36,1)',
                    transitionDelay: `${i * 36 + si * 70}ms`,
                    opacity: hover === null || hover === i ? 1 : 0.4,
                    boxShadow: hover === i ? `0 0 14px -5px ${s.color}` : 'none',
                  }}
                />
              )
            })}
            {hover === i && (
              <div
                className="panel a-fade pointer-events-none absolute bottom-full z-20 mb-1.5 min-w-[118px] whitespace-nowrap px-2.5 py-1.5 text-[11px]"
                style={{ boxShadow: '0 12px 28px -12px #000' }}
              >
                <div className="mb-1 font-semibold">{d.full || d.label}</div>
                {series.map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-txt-sub">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <b className="mono tnum">{format(d[s.key] || 0)}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d, i) => (
          <div key={d.label ?? i} className="min-w-0 flex-1 truncate1 text-center text-[9.5px] text-txt-mute">{d.label}</div>
        ))}
      </div>
      {series.length > 1 && (
        <div className="mt-2.5 flex flex-wrap justify-center gap-3">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[10.5px] text-txt-sub">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══ Área + línea (curva suave, trazo animado) ═══════════════════════ */
export function AreaLine({ data = [], height = 160, color = 'var(--accent)', format = (v) => v, labels = true, zeroLine = false, className }) {
  const [wrapRef, { w }] = useSize()
  const [ref, seen] = useInView()
  const [hover, setHover] = useState(null)
  const width = Math.max(120, w || 320)
  const id = useMemo(uid, [])

  const pad = { t: 10, b: labels ? 18 : 6, l: 2, r: 2 }
  const vals = data.map((d) => d.value)
  const min = Math.min(0, ...vals)
  const max = Math.max(1, ...vals)
  const span = max - min || 1
  const H = height - pad.t - pad.b

  const pts = data.map((d, i) => {
    const x = pad.l + (data.length <= 1 ? width / 2 : (i / (data.length - 1)) * (width - pad.l - pad.r))
    const y = pad.t + H - ((d.value - min) / span) * H
    return [x, y]
  })

  const path = smooth(pts)
  const area = pts.length ? `${path} L ${pts[pts.length - 1][0]},${pad.t + H} L ${pts[0][0]},${pad.t + H} Z` : ''
  const zeroY = pad.t + H - ((0 - min) / span) * H

  return (
    <div ref={wrapRef} className={cx('relative', className)}>
      <div ref={ref}>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
          onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.42" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {zeroLine && min < 0 && (
            <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="var(--border-2)" strokeDasharray="3 4" />
          )}
          {area && <path d={area} fill={`url(#${id})`} style={{ opacity: seen ? 1 : 0, transition: 'opacity 700ms ease 260ms' }} />}
          {path && (
            <path
              d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
              style={{
                strokeDasharray: 2600,
                strokeDashoffset: seen ? 0 : 2600,
                transition: 'stroke-dashoffset 1200ms cubic-bezier(0.22,1,0.36,1)',
                filter: `drop-shadow(0 2px 7px color-mix(in srgb, ${color} 55%, transparent))`,
              }}
            />
          )}
          {pts.map(([x, y], i) => (
            <g key={i}>
              <rect
                x={x - (width / Math.max(1, data.length)) / 2} y="0"
                width={width / Math.max(1, data.length)} height={height}
                fill="transparent" onMouseEnter={() => setHover(i)}
              />
              <circle
                cx={x} cy={y} r={hover === i ? 4.5 : 2.6}
                fill="var(--panel-bg)" stroke={color} strokeWidth="2"
                style={{ opacity: seen ? 1 : 0, transition: 'opacity 400ms ease, r 160ms ease', transitionDelay: `${600 + i * 24}ms` }}
              />
            </g>
          ))}
        </svg>
      </div>
      {labels && (
        <div className="-mt-3.5 flex">
          {data.map((d, i) => (
            <div key={i} className="min-w-0 flex-1 truncate1 text-center text-[9.5px] text-txt-mute">{d.label}</div>
          ))}
        </div>
      )}
      {hover != null && data[hover] && (
        <div
          className="panel a-fade pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 text-[11px]"
          style={{ left: `${(pts[hover][0] / width) * 100}%`, top: Math.max(0, pts[hover][1] - 46), boxShadow: '0 12px 28px -12px #000' }}
        >
          <div className="text-txt-sub">{data[hover].full || data[hover].label}</div>
          <b className="mono tnum" style={{ color }}>{format(data[hover].value)}</b>
        </div>
      )}
    </div>
  )
}

/** Curva de Catmull-Rom → Bézier: líneas suaves sin librería. */
function smooth(pts) {
  if (!pts.length) return ''
  if (pts.length < 3) return `M ${pts.map((p) => p.join(',')).join(' L ')}`
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C ${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`
  }
  return d
}

/* ═══ Sparkline ═══════════════════════════════════════════════════════ */
export function Sparkline({ data = [], width = 92, height = 26, color = 'var(--accent)', fill = true }) {
  const id = useMemo(uid, [])
  if (!data.length) return <svg width={width} height={height} />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pts = data.map((v, i) => [
    (i / Math.max(1, data.length - 1)) * (width - 2) + 1,
    height - 2 - ((v - min) / span) * (height - 4),
  ])
  const path = smooth(pts)
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={`${path} L ${pts[pts.length - 1][0]},${height} L ${pts[0][0]},${height} Z`} fill={`url(#${id})`} />}
      <path
        d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round"
        style={{ strokeDasharray: 400, animation: 'drawIn 900ms cubic-bezier(0.22,1,0.36,1) both', '--len': 400 }}
      />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={color} />
    </svg>
  )
}

/* ═══ Barra apilada horizontal (reparto) ═════════════════════════════ */
export function StackBar({ data = [], height = 12, format = (v) => v, className }) {
  const [ref, seen] = useInView()
  const [hover, setHover] = useState(null)
  const total = data.reduce((a, b) => a + Math.max(0, b.value), 0)
  return (
    <div className={className}>
      <div ref={ref} className="flex overflow-hidden rounded-full" style={{ height, background: 'color-mix(in srgb, var(--elev) 90%, transparent)' }}>
        {data.filter((d) => d.value > 0).map((d, i) => (
          <div
            key={d.name}
            title={`${d.name} · ${format(d.value)}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              width: seen && total ? `${(d.value / total) * 100}%` : '0%',
              background: d.color,
              transition: 'width 860ms cubic-bezier(0.22,1,0.36,1)',
              transitionDelay: `${i * 70}ms`,
              filter: hover === i ? 'brightness(1.25)' : 'none',
              cursor: 'default',
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {data.filter((d) => d.value > 0).map((d) => (
          <span key={d.name} className="flex items-center gap-1.5 text-[10.5px] text-txt-sub">
            <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
            {d.name}
            <b className="mono text-txt-2">{format(d.value)}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ═══ Medidor radial (tasa de ahorro, % del mes) ══════════════════════ */
export function Gauge({ value = 0, max = 100, size = 116, thickness = 9, color = 'var(--accent)', label, sub }) {
  const [ref, seen] = useInView()
  const r = (size - thickness) / 2
  const c = Math.PI * r // semicírculo
  const pct = Math.min(1, Math.max(0, value / (max || 1)))
  return (
    <div ref={ref} className="relative grid place-items-center" style={{ width: size, height: size * 0.66 }}>
      <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`}>
        <path
          d={`M ${thickness / 2} ${size * 0.56} A ${r} ${r} 0 0 1 ${size - thickness / 2} ${size * 0.56}`}
          fill="none" stroke="color-mix(in srgb, var(--elev) 90%, transparent)" strokeWidth={thickness} strokeLinecap="round"
        />
        <path
          d={`M ${thickness / 2} ${size * 0.56} A ${r} ${r} 0 0 1 ${size - thickness / 2} ${size * 0.56}`}
          fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={seen ? c * (1 - pct) : c}
          style={{ transition: 'stroke-dashoffset 1000ms cubic-bezier(0.22,1,0.36,1)', filter: `drop-shadow(0 0 7px ${color})` }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="mono tnum text-[19px] font-semibold leading-none" style={{ color }}>{label}</div>
        {sub && <div className="mt-0.5 text-[10px] text-txt-sub">{sub}</div>}
      </div>
    </div>
  )
}

/* ═══ Heatmap de días ═════════════════════════════════════════════════ */
export function Heatmap({ weeks = [], cell = 12, gap = 3, onCell, legend, className }) {
  const [hover, setHover] = useState(null)
  return (
    <div className={className}>
      <div className="flex" style={{ gap }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col" style={{ gap }}>
            {week.map((d, di) => (
              <button
                key={di}
                onClick={() => d && onCell?.(d)}
                onMouseEnter={() => setHover(d)}
                onMouseLeave={() => setHover(null)}
                className="rounded-[3px] transition-transform duration-150 ease-spring hover:scale-125"
                style={{
                  width: cell, height: cell,
                  background: d ? d.color : 'transparent',
                  border: d?.today ? '1px solid var(--accent)' : 'none',
                  animation: d ? 'scaleIn 300ms cubic-bezier(0.22,1,0.36,1) both' : 'none',
                  animationDelay: `${(wi * 7 + di) * 5}ms`,
                  cursor: d && onCell ? 'pointer' : 'default',
                }}
                title={d ? `${d.label}${d.hint ? ` · ${d.hint}` : ''}` : ''}
              />
            ))}
          </div>
        ))}
      </div>
      {legend && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-txt-mute">
          <span>0%</span>
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <span key={p} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: legend(p) }} />
          ))}
          <span>100%</span>
          {hover && <span className="ml-auto text-txt-sub">{hover.label} · {hover.hint}</span>}
        </div>
      )}
    </div>
  )
}

/* ═══ Anillos concéntricos (objetivos) ════════════════════════════════ */
export function Rings({ items = [], size = 150, thickness = 9, gapRing = 4, center, className }) {
  const [ref, seen] = useInView()
  return (
    <div ref={ref} className={cx('relative grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {items.slice(0, 5).map((it, i) => {
          const r = (size - thickness) / 2 - i * (thickness + gapRing)
          if (r <= 6) return null
          const c = 2 * Math.PI * r
          const pct = Math.min(1, Math.max(0, it.pct || 0))
          return (
            <g key={it.name || i}>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke="color-mix(in srgb, var(--elev) 88%, transparent)" strokeWidth={thickness} />
              <circle
                cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={it.color} strokeWidth={thickness} strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={seen ? c * (1 - pct) : c}
                style={{
                  transition: 'stroke-dashoffset 1000ms cubic-bezier(0.22,1,0.36,1)',
                  transitionDelay: `${i * 90}ms`,
                  filter: `drop-shadow(0 0 5px color-mix(in srgb, ${it.color} 70%, transparent))`,
                }}
              />
            </g>
          )
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{center}</div>
    </div>
  )
}
