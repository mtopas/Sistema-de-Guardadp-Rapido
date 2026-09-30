import { useId, useMemo, useState } from 'react'
import { motion } from 'framer-motion'

const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]

function arcPath(cx, cy, r, r2, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a1)
  const [x2, y2] = polar(cx, cy, r2, a1)
  const [x3, y3] = polar(cx, cy, r2, a0)
  return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r2},${r2} 0 ${large} 0 ${x3},${y3} Z`
}

export function Donut({ data, size = 190, thickness = 26, format = (v) => v, center, onSelect, selected }) {
  const [hover, setHover] = useState(null)
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0)
  const cx = size / 2
  const r = size / 2 - 6
  const r2 = r - thickness
  let acc = -Math.PI / 2
  const gap = data.length > 1 ? 0.025 : 0
  const segs = data.map((d) => {
    const frac = total ? Math.max(0, d.value) / total : 0
    const a0 = acc + gap / 2
    const a1 = Math.min(acc + frac * Math.PI * 2 - gap / 2, a0 + Math.PI * 2 - 0.0008)
    acc += frac * Math.PI * 2
    return { ...d, a0, a1, frac }
  })
  const active = hover ?? (selected ? segs.find((s) => s.name === selected) : null)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
        <circle cx={cx} cy={cx} r={(r + r2) / 2} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={thickness} />
        {segs.map((s, i) =>
          s.frac > 0.0005 ? (
            <motion.path
              key={s.name}
              d={arcPath(cx, cx, active?.name === s.name ? r + 5 : r, r2, s.a0, Math.max(s.a0 + 0.001, s.a1))}
              fill={s.color}
              style={{ filter: `drop-shadow(0 0 ${active?.name === s.name ? 12 : 5}px ${s.color})`, cursor: onSelect ? 'pointer' : 'default' }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: active && active.name !== s.name ? 0.35 : 1, scale: 1 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 200, damping: 22 }}
              onMouseEnter={() => setHover(s)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(selected === s.name ? null : s.name)}
            />
          ) : null,
        )}
      </svg>
      <div style={{ position: 'absolute', inset: thickness + 10, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
        {active ? (
          <div>
            <div className="tiny upper" style={{ color: active.color }}>{active.name}</div>
            <div className="display tnum" style={{ fontSize: 15, fontWeight: 600 }}>{format(active.value)}</div>
            <div className="small muted">{(active.frac * 100).toFixed(1)}%</div>
          </div>
        ) : (
          center
        )}
      </div>
    </div>
  )
}

export function Legend({ data, format, onSelect, selected, max = 8 }) {
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <div className="list" style={{ gap: 2 }}>
      {data.slice(0, max).map((d, i) => (
        <motion.div
          key={d.name}
          className={`li ${selected === d.name ? 'on' : ''}`}
          style={{ padding: '5px 8px' }}
          onClick={() => onSelect?.(selected === d.name ? null : d.name)}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
        >
          <span className="dot" style={{ background: d.color, color: d.color }} />
          <span className="grow ellipsis small">{d.name}</span>
          <span className="mono small tnum">{format(d.value)}</span>
          <span className="mono tiny dim" style={{ width: 38, textAlign: 'right' }}>{total ? ((d.value / total) * 100).toFixed(0) : 0}%</span>
        </motion.div>
      ))}
      {data.length > max && <div className="tiny dim" style={{ padding: '4px 8px' }}>+{data.length - max} más</div>}
    </div>
  )
}

// Barras agrupadas: series = [{ key, label, color }], data = [{ label, [key]: value }]
export function Bars({ data, series, height = 220, format = (v) => v, onClick, highlight }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Math.abs(d[s.key] || 0))))
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height, padding: '10px 2px 0' }}>
        {data.map((d, i) => (
          <div
            key={d.label + i}
            style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: onClick ? 'pointer' : 'default', position: 'relative' }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onClick?.(d, i)}
          >
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 'calc(100% - 22px)', justifyContent: 'center' }}>
              {series.map((s, j) => {
                const v = Math.abs(d[s.key] || 0)
                return (
                  <motion.div
                    key={s.key}
                    initial={{ height: 0 }}
                    animate={{ height: `${(v / max) * 100}%` }}
                    transition={{ delay: i * 0.03 + j * 0.05, type: 'spring', stiffness: 120, damping: 18 }}
                    style={{
                      width: `${Math.min(22, 70 / series.length)}%`, minWidth: 5, maxWidth: 22, borderRadius: '6px 6px 2px 2px',
                      background: `linear-gradient(180deg, ${s.color}, ${s.color}55)`,
                      boxShadow: hover === i || highlight === i ? `0 0 16px ${s.color}` : `0 0 6px ${s.color}66`,
                      opacity: hover !== null && hover !== i ? 0.45 : 1,
                      transition: 'opacity .2s, box-shadow .2s',
                    }}
                  />
                )
              })}
            </div>
            <div className="tiny dim" style={{ textAlign: 'center', height: 18, marginTop: 4, color: highlight === i ? 'var(--text)' : undefined }}>{d.label}</div>
            {hover === i && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass strong"
                style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', padding: '8px 10px', borderRadius: 10, zIndex: 5, whiteSpace: 'nowrap', pointerEvents: 'none' }}
              >
                <div className="tiny upper muted">{d.full || d.label}</div>
                {series.map((s) => (
                  <div key={s.key} className="row small" style={{ gap: 6 }}>
                    <span className="dot" style={{ background: s.color, color: s.color, width: 7, height: 7 }} />
                    {s.label}: <b className="mono">{format(d[s.key] || 0)}</b>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function Sparkline({ values, width = 240, height = 56, color = 'var(--a1)', fill = true, dots = false, strokeWidth = 2 }) {
  const gid = useId().replace(/:/g, '')
  const pts = useMemo(() => {
    const clean = values.map((v) => (v == null || isNaN(v) ? null : v))
    const nums = clean.filter((v) => v != null)
    if (!nums.length) return []
    const max = Math.max(...nums)
    const min = Math.min(0, ...nums)
    const span = max - min || 1
    return clean.map((v, i) => (v == null ? null : [(i / Math.max(1, clean.length - 1)) * width, height - 4 - ((v - min) / span) * (height - 8)]))
  }, [values, width, height])
  const valid = pts.filter(Boolean)
  if (!valid.length) return <svg width={width} height={height} />
  const d = valid.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${d} L${valid[valid.length - 1][0]},${height} L${valid[0][0]},${height} Z`
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.45" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <motion.path d={area} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} />}
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
      {dots && valid.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill={color} />)}
    </svg>
  )
}

export function Ring({ value, size = 64, stroke = 7, color = 'var(--a1)', color2 = 'var(--a2)', children }) {
  const gid = useId().replace(/:/g, '')
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value || 0))
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={gid}>
            <stop offset="0" stopColor={color} />
            <stop offset="1" stopColor={color2} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 5px ${color2})` }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{children}</div>
    </div>
  )
}

// Línea multi-serie con eje X por etiquetas
export function LineChart({ series, labels, height = 240, format = (v) => v, markerIndex }) {
  const [hover, setHover] = useState(null)
  const W = 800
  const H = height
  const pad = { l: 8, r: 8, t: 12, b: 24 }
  const all = series.flatMap((s) => s.values.filter((v) => v != null))
  const max = Math.max(1, ...all)
  const min = Math.min(0, ...all)
  const x = (i) => pad.l + (i / Math.max(1, labels.length - 1)) * (W - pad.l - pad.r)
  const y = (v) => pad.t + (1 - (v - min) / (max - min || 1)) * (H - pad.t - pad.b)
  const step = Math.ceil(labels.length / 10)
  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (labels.length - 1))
          setHover(Math.max(0, Math.min(labels.length - 1, i)))
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="rgba(150,170,255,0.08)" strokeDasharray="4 6" />
        ))}
        {markerIndex != null && markerIndex >= 0 && markerIndex < labels.length && (
          <line x1={x(markerIndex)} x2={x(markerIndex)} y1={pad.t} y2={H - pad.b} stroke="var(--a2)" strokeDasharray="3 4" opacity="0.7" />
        )}
        {series.map((s, si) => {
          const d = s.values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean)
          if (!d.length) return null
          return (
            <motion.polyline
              key={s.label}
              points={d.join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={s.dashed ? 1.6 : 2.4}
              strokeDasharray={s.dashed ? '6 6' : undefined}
              vectorEffect="non-scaling-stroke"
              style={{ filter: `drop-shadow(0 0 5px ${s.color})` }}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.4, delay: si * 0.15 }}
            />
          )
        })}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,0.3)" />}
        {labels.map((l, i) =>
          i % step === 0 ? (
            <text key={i} x={x(i)} y={H - 6} fill="var(--dim)" fontSize="11" textAnchor="middle" style={{ fontFamily: 'var(--font-mono)' }}>
              {l}
            </text>
          ) : null,
        )}
      </svg>
      {hover != null && (
        <div className="glass strong" style={{ position: 'absolute', top: 6, left: `min(calc(${(x(hover) / W) * 100}% + 12px), calc(100% - 200px))`, padding: '8px 10px', borderRadius: 10, pointerEvents: 'none', zIndex: 3 }}>
          <div className="tiny upper muted">{labels[hover]}</div>
          {series.map((s) =>
            s.values[hover] != null ? (
              <div key={s.label} className="row small" style={{ gap: 6 }}>
                <span className="dot" style={{ background: s.color, color: s.color, width: 7, height: 7 }} /> {s.label}: <b className="mono">{format(s.values[hover])}</b>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}
