import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { BRANCH_COLORS } from '../utils/themes'
import { extractTags } from '../utils/tags'
import { DEFAULT_LEAF_ICON } from '../utils/leafIcons'
import { getIconImg } from '../utils/iconCanvas'
import { DEBUG } from '../config'

// ── Helpers ───────────────────────────────────────────────────────────────────
function darkenHex(hex, amount = 0.35) {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)))
  const g = Math.max(0, Math.round(((n >>  8) & 0xff) * (1 - amount)))
  const b = Math.max(0, Math.round(( n        & 0xff) * (1 - amount)))
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

// ── Radial layout builder ─────────────────────────────────────────────────────
function buildRadialGraph(hojas, categorias, W, H, userName) {
  const CX = W / 2, CY = H * 0.58
  const nodes = [], edges = []

  // Root node
  nodes.push({
    id: 'root', type: 'root', label: userName || 'yo',
    x: CX, y: CY, r: 28,
    color: '#ffffff', phase: 0, speed: 0.003, amp: 3,
  })

  // Root categories — distribute in a ring
  const roots = categorias.filter(c => !c.padre_id)
  const rootRingR = Math.min(W, H) * 0.22
  roots.forEach((cat, i) => {
    const angle = (i / roots.length) * Math.PI * 2 - Math.PI / 2
    const color = BRANCH_COLORS[i % BRANCH_COLORS.length]
    const x = CX + Math.cos(angle) * rootRingR
    const y = CY + Math.sin(angle) * rootRingR
    nodes.push({
      id: `cat-${cat.id}`, type: 'category', catId: cat.id,
      label: cat.nombre, icono: cat.icono || '',
      x, y, r: 18, color,
      branchColor: color, branchIdx: i,
      angle, phase: Math.random() * Math.PI * 2, speed: 0.002 + Math.random() * 0.002, amp: 4 + Math.random() * 3,
    })
    edges.push({ source: 'root', target: `cat-${cat.id}`, color: color + '55' })

    // Subcategories — fan out from parent
    const subs = categorias.filter(c => c.padre_id === cat.id)
    const subRingR = rootRingR * 0.58
    subs.forEach((sub, si) => {
      const spread = Math.PI * 0.55
      const subAngle = angle - spread / 2 + (spread / Math.max(subs.length - 1, 1)) * si
      const sx = x + Math.cos(subAngle) * subRingR
      const sy = y + Math.sin(subAngle) * subRingR
      nodes.push({
        id: `cat-${sub.id}`, type: 'subcategory', catId: sub.id,
        label: sub.nombre, icono: sub.icono || '',
        x: sx, y: sy, r: 14,
        color: color + 'cc', // slightly lighter
        branchColor: color, branchIdx: i,
        angle: subAngle, phase: Math.random() * Math.PI * 2, speed: 0.0025 + Math.random() * 0.002, amp: 3 + Math.random() * 3,
      })
      edges.push({ source: `cat-${cat.id}`, target: `cat-${sub.id}`, color: color + '40' })
    })
  })

  // Hojas — leaf dots placed near their category
  const tagOwners = {} // tag → [hojaId]
  hojas.forEach(h => {
    const parentNode = nodes.find(n => (n.type === 'category' || n.type === 'subcategory') && n.catId === h.categoria_id)
    const base = parentNode || nodes[0]
    const angle = Math.random() * Math.PI * 2
    const dist = base.r * 2.2 + Math.random() * 28
    const color = darkenHex(parentNode?.branchColor || '#6d28d9')
    nodes.push({
      id: `hoja-${h.id}`, type: 'hoja', hojaId: h.id,
      label: h.contenido.replace(/https?:\/\/\S+/g, '').trim().slice(0, 22) || '—',
      icono: h.icono || null, tipo: h.tipo || 'texto',
      x: base.x + Math.cos(angle) * dist,
      y: base.y + Math.sin(angle) * dist,
      r: 9, color,
      phase: Math.random() * Math.PI * 2, speed: 0.003 + Math.random() * 0.003, amp: 2 + Math.random() * 4,
    })
    edges.push({ source: base.id, target: `hoja-${h.id}`, color: color + '60' })

    // Track tag → hoja
    const tags = extractTags(h.contenido, h.apuntes)
    tags.forEach(tag => {
      if (!tagOwners[tag]) tagOwners[tag] = []
      tagOwners[tag].push(`hoja-${h.id}`)
    })
  })

  // Leaf-to-leaf connections for shared tags
  Object.values(tagOwners).forEach(ids => {
    if (ids.length < 2) return
    for (let i = 0; i < ids.length - 1; i++) {
      edges.push({ source: ids[i], target: ids[i + 1], color: 'rgba(255,255,255,0.28)', tag: true })
    }
  })

  return { nodes, edges }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function NetworkGraph() {
  const canvasRef = useRef(null)
  const stateRef  = useRef({ nodes: [], edges: [], W: 0, H: 0 })
  const rafRef    = useRef(null)

  const hojas      = useStore(s => s.hojas)
  const categorias = useStore(s => s.categorias)
  const userName   = useStore(s => s.userName)

  // ── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { nodes, edges, W, H } = stateRef.current
    if (!W || !H) return

    ctx.clearRect(0, 0, W, H)

    // 1 — Structural edges
    edges.filter(e => !e.tag).forEach(e => {
      const a = nodes.find(n => n.id === e.source)
      const b = nodes.find(n => n.id === e.target)
      if (!a || !b) return
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = e.color || 'rgba(139,92,246,0.2)'
      if (a.type === 'root')          ctx.lineWidth = 2.2
      else if (a.type === 'category') ctx.lineWidth = 1.4
      else                            ctx.lineWidth = 0.9
      ctx.stroke()
      ctx.restore()
    })

    // 2 — Tag edges (under all nodes)
    edges.filter(e => e.tag).forEach(e => {
      const a = nodes.find(n => n.id === e.source)
      const b = nodes.find(n => n.id === e.target)
      if (!a || !b) return
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = e.color
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
    })

    // 3 — Category / root nodes (on top of tag lines)
    nodes.filter(n => n.type !== 'hoja').forEach(n => {
      if (n.type === 'root') {
        // White glowing center
        const gr = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 3.5)
        gr.addColorStop(0, 'rgba(255,255,255,0.18)')
        gr.addColorStop(1, 'transparent')
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 3.5, 0, Math.PI * 2)
        ctx.fillStyle = gr; ctx.fill()

        const fg = ctx.createRadialGradient(n.x - n.r * 0.3, n.y - n.r * 0.3, 0, n.x, n.y, n.r)
        fg.addColorStop(0, '#ffffff')
        fg.addColorStop(1, '#d4c6ff')
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = fg; ctx.fill()

        // Label inside
        ctx.font = 'bold 10px "Sora",sans-serif'
        ctx.fillStyle = '#1a0040'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText((n.label || 'yo').slice(0, 12), n.x, n.y)

      } else if (n.type === 'category' || n.type === 'subcategory') {
        const alpha = n.type === 'subcategory' ? 0.72 : 1
        // Glow
        const gr = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 2.8)
        gr.addColorStop(0, n.color + '55')
        gr.addColorStop(1, 'transparent')
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 2.8, 0, Math.PI * 2)
        ctx.fillStyle = gr; ctx.fill()

        // Disc
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = n.color
        ctx.globalAlpha = alpha
        ctx.fill()
        ctx.globalAlpha = 1

        // Icon inside disc (emoji or initial)
        const icon = n.icono || n.label.slice(0, 1).toUpperCase()
        ctx.font = n.icono ? `${n.r * 1.1}px sans-serif` : `bold ${n.r * 0.85}px Sora`
        ctx.fillStyle = '#fff'
        ctx.globalAlpha = alpha
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(icon, n.x, n.y)
        ctx.globalAlpha = 1

        // Label below
        if (n.type === 'category') {
          ctx.font = '600 9px Sora,sans-serif'
          ctx.fillStyle = n.color
          ctx.globalAlpha = 0.9
          ctx.textAlign = 'center'; ctx.textBaseline = 'top'
          ctx.fillText(n.label.slice(0, 14), n.x, n.y + n.r + 4)
          ctx.globalAlpha = 1
        }

      }
    })

    // 4 — Leaf nodes (drawn last, on top of tag lines)
    nodes.filter(n => n.type === 'hoja').forEach(n => {
      const gr = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 1.8)
      gr.addColorStop(0, n.color + '55')
      gr.addColorStop(1, 'transparent')
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 1.8, 0, Math.PI * 2)
      ctx.fillStyle = gr; ctx.fill()

      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
      ctx.fillStyle = n.color + 'cc'
      ctx.fill()

      const iconKey = n.icono || DEFAULT_LEAF_ICON[n.tipo] || 'FileText'
      const iconImg = getIconImg(iconKey, '#ffffff')
      if (iconImg && iconImg.complete) {
        const s = n.r * 1.2
        ctx.drawImage(iconImg, n.x - s / 2, n.y - s / 2, s, s)
      }
    })
  }, [])

  // ── Float tick ────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const { nodes } = stateRef.current
    nodes.forEach(n => {
      n.phase += n.speed
      n.x = n.restX + Math.sin(n.phase) * n.amp
      n.y = n.restY + Math.cos(n.phase * 0.87) * n.amp
    })
    draw()
    rafRef.current = requestAnimationFrame(tick)
  }, [draw])

  // ── Init ──────────────────────────────────────────────────────────────────
  const init = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    if (!W || !H) return
    const { nodes, edges } = buildRadialGraph(hojas, categorias, W, H, userName)
    nodes.forEach(n => { n.restX = n.x; n.restY = n.y })
    stateRef.current = { nodes, edges, W, H }
    if (DEBUG) console.log('graph init:', nodes.length, 'nodes,', edges.length, 'edges')
  }, [hojas, categorias, userName])

  // ── Resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    const ro = new ResizeObserver(() => { resize(); init() })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [init])

  // ── Start / restart on data change ────────────────────────────────────────
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    init()
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [hojas, categorias, userName, init, tick])

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="w-full h-full block" style={{ cursor: 'default' }} />
    </div>
  )
}
