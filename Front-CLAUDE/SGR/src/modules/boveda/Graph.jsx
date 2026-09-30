import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ZoomIn, ZoomOut, Maximize2, FileText, Link2, Image } from 'lucide-react'
import { buildTree, isBasura, hojaTitulo } from '../../store/boveda'
import { NEON } from '../../lib/fin'

const MAX_LEAVES = 18

// Grafo radial "neural": núcleo → categorías raíz → subcategorías → hojas.
// Los ángulos se reparten según el peso (hojas + subcategorías) de cada rama.
function layout(categorias, hojas) {
  const tree = buildTree(categorias).filter((c) => !isBasura(c))
  const byCat = new Map()
  for (const h of hojas) {
    if (!byCat.has(h.categoria_id)) byCat.set(h.categoria_id, [])
    byCat.get(h.categoria_id).push(h)
  }
  const weight = (n) => {
    const own = Math.min(MAX_LEAVES, (byCat.get(n.id) || []).length)
    n._w = Math.max(1, own * 0.9 + n.children.reduce((a, c) => a + weight(c), 0))
    return n._w
  }
  const total = tree.reduce((a, n) => a + weight(n), 0) || 1
  const nodes = []
  const edges = []
  const R0 = 150
  const DR = 125

  const place = (n, a0, a1, depth, color, parent) => {
    const am = (a0 + a1) / 2
    const r = R0 + depth * DR
    const x = Math.cos(am) * r
    const y = Math.sin(am) * r
    const node = { id: `c${n.id}`, kind: 'cat', cat: n, x, y, color: n.color || color, depth, count: (byCat.get(n.id) || []).length }
    nodes.push(node)
    edges.push({ from: parent, to: node, color: node.color, kind: 'cat' })
    const span = a1 - a0
    const leaves = byCat.get(n.id) || []
    const kids = n.children
    const kidsW = kids.reduce((a, c) => a + c._w, 0)
    const leafW = Math.min(MAX_LEAVES, leaves.length) * 0.9
    const tot = kidsW + leafW || 1
    let cur = a0
    for (const k of kids) {
      const s = (k._w / tot) * span
      place(k, cur, cur + s, depth + 1, node.color, node)
      cur += s
    }
    // Hojas: en el arco restante, en un anillo externo a la categoría
    const shown = leaves.slice(0, MAX_LEAVES)
    const mid = (cur + a1) / 2
    const half = Math.min((a1 - cur) / 2, 0.09 * shown.length + 0.12)
    const la0 = mid - half
    const la1 = mid + half
    shown.forEach((h, i) => {
      const t = shown.length === 1 ? 0.5 : i / (shown.length - 1)
      const ang = la0 + (la1 - la0) * (0.1 + t * 0.8)
      const rr = r + 62 + (i % 3) * 22
      const hn = { id: `h${h.id}`, kind: 'hoja', hoja: h, x: Math.cos(ang) * rr, y: Math.sin(ang) * rr, color: h.color || node.color }
      nodes.push(hn)
      edges.push({ from: node, to: hn, color: hn.color, kind: 'hoja' })
    })
    if (leaves.length > MAX_LEAVES) {
      const ang = (la0 + la1) / 2
      const rr = r + 140
      nodes.push({ id: `m${n.id}`, kind: 'more', x: Math.cos(ang) * rr, y: Math.sin(ang) * rr, color: node.color, n: leaves.length - MAX_LEAVES, cat: n })
    }
  }

  const core = { id: 'core', kind: 'core', x: 0, y: 0 }
  let cur = -Math.PI / 2
  tree.forEach((n, i) => {
    const s = (n._w / total) * Math.PI * 2
    place(n, cur, cur + s, 0, NEON[(i * 3 + 1) % NEON.length], core)
    cur += s
  })
  return { nodes, edges, core }
}

export default function Graph({ categorias, hojas, matchIds, selectedId, onSelect, onCategory }) {
  const { nodes, edges } = useMemo(() => layout(categorias, hojas), [categorias, hojas])
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [hover, setHover] = useState(null)
  const wrap = useRef(null)
  const drag = useRef(null)
  const [size, setSize] = useState({ w: 800, h: 600 })

  useEffect(() => {
    const el = wrap.current
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Encaje inicial
  const fit = () => {
    const ext = nodes.reduce((a, n) => Math.max(a, Math.abs(n.x) + 40, Math.abs(n.y) + 40), 200)
    const k = Math.min(size.w, size.h) / (ext * 2.1)
    setView({ x: 0, y: 0, k: Math.max(0.25, Math.min(1.6, k)) })
  }
  useEffect(fit, [nodes.length, size.w, size.h]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = wrap.current
    const onWheel = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left - r.width / 2
      const my = e.clientY - r.top - r.height / 2
      setView((v) => {
        const k = Math.max(0.2, Math.min(4, v.k * (e.deltaY < 0 ? 1.12 : 0.89)))
        const f = k / v.k
        return { k, x: mx - (mx - v.x) * f, y: my - (my - v.y) * f }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const selNode = nodes.find((n) => n.kind === 'hoja' && n.hoja.id === selectedId)
  const pathIds = useMemo(() => {
    const s = new Set()
    const target = hover || selNode
    if (!target) return s
    let t = target
    for (let i = 0; i < 6; i++) {
      s.add(t.id)
      const e = edges.find((ed) => ed.to.id === t.id)
      if (!e) break
      t = e.from
    }
    return s
  }, [hover, selNode, edges])

  const dimmed = (n) => {
    if (!matchIds) return false
    if (n.kind === 'hoja') return !matchIds.has(n.hoja.id)
    return false
  }

  return (
    <div
      ref={wrap}
      style={{ position: 'relative', flex: 1, minHeight: 380, overflow: 'hidden', borderRadius: 22, cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
      onPointerDown={(e) => {
        if (e.target.closest('[data-node]')) return
        drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        setView((v) => ({ ...v, x: drag.current.vx + e.clientX - drag.current.x, y: drag.current.vy + e.clientY - drag.current.y }))
      }}
      onPointerUp={() => { drag.current = null }}
    >
      <svg width={size.w} height={size.h} style={{ display: 'block' }}>
        <defs>
          <radialGradient id="coreG">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.35" stopColor="var(--a2)" />
            <stop offset="1" stopColor="var(--a1)" stopOpacity="0" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g transform={`translate(${size.w / 2 + view.x},${size.h / 2 + view.y}) scale(${view.k})`}>
          {/* anillos guía */}
          {[150, 275, 400, 525].map((r, i) => (
            <circle key={r} r={r} fill="none" stroke="rgba(150,170,255,0.07)" strokeDasharray="2 8" style={{ animation: `spin ${80 + i * 30}s linear infinite ${i % 2 ? 'reverse' : ''}` }} />
          ))}
          {edges.map((e, i) => {
            const on = pathIds.has(e.to.id) && pathIds.has(e.from.id)
            const mx = (e.from.x + e.to.x) / 2 * 0.92
            const my = (e.from.y + e.to.y) / 2 * 0.92
            const dim = e.to.kind === 'hoja' && dimmed(e.to)
            return (
              <path
                key={i}
                d={`M${e.from.x},${e.from.y} Q${mx},${my} ${e.to.x},${e.to.y}`}
                fill="none"
                stroke={e.color || 'var(--a1)'}
                strokeOpacity={dim ? 0.05 : on ? 0.95 : e.kind === 'cat' ? 0.35 : 0.2}
                strokeWidth={on ? 2.2 : e.kind === 'cat' ? 1.4 : 0.9}
                strokeDasharray={on ? '6 6' : undefined}
                style={on ? { animation: 'dashflow 0.8s linear infinite', filter: `drop-shadow(0 0 4px ${e.color})` } : undefined}
              />
            )
          })}
          {/* núcleo */}
          <g>
            <circle r="46" fill="url(#coreG)" opacity="0.55" style={{ animation: 'pulse 3s ease-in-out infinite', transformOrigin: 'center', transformBox: 'fill-box' }} />
            <circle r="18" fill="#fff" filter="url(#glow)" />
            <text y="4" textAnchor="middle" fontSize="9" fontWeight="700" fill="#0b0d22" style={{ fontFamily: 'var(--font-display)' }}>SGR</text>
          </g>
          {nodes.map((n, i) => {
            const delay = `${Math.min(i, 120) * 12}ms`
            if (n.kind === 'cat') {
              const r = 13 - n.depth * 2.5 + Math.min(8, Math.sqrt(n.count) * 1.8)
              const on = pathIds.has(n.id)
              return (
                <g
                  key={n.id}
                  data-node
                  transform={`translate(${n.x},${n.y})`}
                  style={{ cursor: 'pointer', animation: `nodein .6s ${delay} both cubic-bezier(.16,1,.3,1)` }}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onCategory?.(n.cat.id)}
                >
                  <circle r={r + 7} fill={n.color} opacity={on ? 0.35 : 0.14} />
                  <polygon points={hexPts(r)} fill="rgba(8,10,26,.9)" stroke={n.color} strokeWidth="2" filter="url(#glow)" />
                  <text y={n.cat.icono ? 4 : 3.5} textAnchor="middle" fontSize={n.cat.icono ? r : 9} fill={n.color} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {n.cat.icono || n.count}
                  </text>
                  <text y={r + 16} textAnchor="middle" fontSize={11 - n.depth} fill="var(--text)" style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, paintOrder: 'stroke', stroke: 'rgba(4,5,13,.85)', strokeWidth: 4 }}>
                    {n.cat.nombre}
                  </text>
                </g>
              )
            }
            if (n.kind === 'more') {
              return (
                <g key={n.id} data-node transform={`translate(${n.x},${n.y})`} style={{ cursor: 'pointer', animation: `nodein .6s ${delay} both` }} onClick={() => onCategory?.(n.cat.id)}>
                  <circle r="14" fill="rgba(8,10,26,.9)" stroke={n.color} strokeDasharray="3 3" />
                  <text y="4" textAnchor="middle" fontSize="10" fill={n.color} style={{ fontFamily: 'var(--font-mono)' }}>+{n.n}</text>
                </g>
              )
            }
            const sel = selectedId === n.hoja.id
            const dim = dimmed(n)
            const on = pathIds.has(n.id)
            return (
              <g
                key={n.id}
                data-node
                transform={`translate(${n.x},${n.y})`}
                style={{ cursor: 'pointer', opacity: dim ? 0.15 : 1, transition: 'opacity .3s', animation: `nodein .6s ${delay} both cubic-bezier(.16,1,.3,1)` }}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect(n.hoja.id)}
              >
                {sel && <circle r="17" fill="none" stroke="#fff" strokeWidth="1.5" style={{ animation: 'ping 1.6s ease-out infinite', transformOrigin: 'center', transformBox: 'fill-box' }} />}
                <circle r={sel ? 9 : on ? 7.5 : 6} fill={n.color} filter="url(#glow)" />
                <circle r={sel ? 3.5 : 2.3} fill="#fff" />
                {(sel || on || view.k > 1.6) && (
                  <text x="12" y="4" fontSize="10.5" fill="var(--text)" style={{ fontFamily: 'var(--font-ui)', paintOrder: 'stroke', stroke: 'rgba(4,5,13,.9)', strokeWidth: 4 }}>
                    {truncate(hojaTitulo(n.hoja), 34)}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {hover && hover.kind !== 'core' && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass strong"
          style={{
            position: 'absolute', pointerEvents: 'none', padding: '10px 12px', borderRadius: 12, maxWidth: 280, zIndex: 3,
            left: Math.min(size.w - 290, size.w / 2 + view.x + hover.x * view.k + 16),
            top: Math.max(8, size.h / 2 + view.y + hover.y * view.k - 20),
          }}
        >
          {hover.kind === 'hoja' ? (
            <>
              <div className="row small" style={{ gap: 6, color: hover.color }}>
                {hover.hoja.tipo === 'link' ? <Link2 size={13} /> : hover.hoja.tipo === 'foto' ? <Image size={13} /> : <FileText size={13} />}
                <span className="tiny upper">{hover.hoja.tipo} · {hover.hoja.categoria_nombre}</span>
              </div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{truncate(hojaTitulo(hover.hoja), 90)}</div>
            </>
          ) : (
            <>
              <div className="tiny upper" style={{ color: hover.color }}>Categoría</div>
              <div style={{ fontWeight: 600 }}>{hover.cat?.nombre}</div>
              <div className="small muted">{hover.count} hojas directas</div>
            </>
          )}
        </motion.div>
      )}

      <div className="glass" style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', flexDirection: 'column', padding: 4, borderRadius: 14 }}>
        <button className="iconbtn sm" onClick={() => setView((v) => ({ ...v, k: Math.min(4, v.k * 1.25) }))} title="Acercar"><ZoomIn size={15} /></button>
        <button className="iconbtn sm" onClick={() => setView((v) => ({ ...v, k: Math.max(0.2, v.k * 0.8) }))} title="Alejar"><ZoomOut size={15} /></button>
        <button className="iconbtn sm" onClick={fit} title="Encajar"><Maximize2 size={15} /></button>
      </div>
      <div className="tiny dim" style={{ position: 'absolute', left: 14, bottom: 12 }}>rueda: zoom · arrastrar: mover · click: abrir</div>
      <style>{`
        @keyframes dashflow { to { stroke-dashoffset: -24; } }
        @keyframes nodein { from { opacity: 0; transform: translate(0,0) scale(0); } }
        @keyframes ping { from { transform: scale(.6); opacity: 1; } to { transform: scale(1.8); opacity: 0; } }
      `}</style>
    </div>
  )
}

function hexPts(r) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6
    return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`
  }).join(' ')
}

function truncate(s, n) {
  s = s || ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
