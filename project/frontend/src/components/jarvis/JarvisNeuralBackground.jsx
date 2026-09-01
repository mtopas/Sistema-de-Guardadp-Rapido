import { useEffect, useRef } from 'react'
import {
  MEMORY_TYPE_COLORS, MEMORY_TYPE_ORDER,
  JARVIS_CANVAS_DENSITY_DEFAULT, JARVIS_CANVAS_PULSE_SPEED_DEFAULT,
  rgba,
} from '../../utils/jarvisPalette'

const COLORS = MEMORY_TYPE_ORDER.map(k => MEMORY_TYPE_COLORS[k])

export default function JarvisNeuralBackground({
  density = JARVIS_CANVAS_DENSITY_DEFAULT,
  pulseSpeed = JARVIS_CANVAS_PULSE_SPEED_DEFAULT,
}) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let W = 0, H = 0

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const nodes = Array.from({ length: density }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00012, vy: (Math.random() - 0.5) * 0.00012,
      r: 0.7 + Math.random() * 2.3,
      z: 0.25 + Math.random() * 0.75,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
      ph: Math.random() * 6.28,
    }))

    const edges = []
    nodes.forEach((a, i) => {
      const near = nodes
        .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
        .filter(o => o.j !== i)
        .sort((p, q) => p.d - q.d)
        .slice(0, 2)
      near.forEach(o => {
        if (o.d < 0.035 && !edges.some(e => e.a === o.j && e.b === i)) edges.push({ a: i, b: o.j })
      })
    })

    const pulses = Array.from({ length: Math.max(8, Math.round(density / 4)) }, () => ({
      e: Math.floor(Math.random() * edges.length), t: Math.random(),
      s: (0.0022 + Math.random() * 0.005) * pulseSpeed,
    }))

    let mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5
    function onPointer(e) {
      tmx = e.clientX / window.innerWidth
      tmy = e.clientY / window.innerHeight
    }
    window.addEventListener('pointermove', onPointer)

    let raf
    function frame(ts) {
      mx += (tmx - mx) * 0.05
      my += (tmy - my) * 0.05
      ctx.clearRect(0, 0, W, H)
      const px = (mx - 0.5) * 34, py = (my - 0.5) * 34
      const P = n => [n.x * W + px * n.z, n.y * H + py * n.z]

      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy
        if (n.x < 0 || n.x > 1) n.vx *= -1
        if (n.y < 0 || n.y > 1) n.vy *= -1
      })

      ctx.lineWidth = 0.7
      edges.forEach(e => {
        const a = nodes[e.a], b = nodes[e.b]
        const [ax, ay] = P(a), [bx, by] = P(b)
        const g = ctx.createLinearGradient(ax, ay, bx, by)
        g.addColorStop(0, rgba(a.c, 0.13 * a.z))
        g.addColorStop(1, rgba(b.c, 0.13 * b.z))
        ctx.strokeStyle = g
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
      })

      nodes.forEach(n => {
        const [x, y] = P(n)
        const tw = 0.55 + 0.45 * Math.sin(ts / 900 + n.ph)
        ctx.beginPath()
        ctx.fillStyle = rgba(n.c, 0.55 * n.z * tw)
        ctx.arc(x, y, n.r * n.z * 1.6, 0, 6.2832); ctx.fill()
        ctx.beginPath()
        ctx.fillStyle = rgba(n.c, 0.07 * n.z * tw)
        ctx.arc(x, y, n.r * n.z * 7, 0, 6.2832); ctx.fill()
      })

      pulses.forEach(p => {
        const e = edges[p.e]; if (!e) return
        const a = nodes[e.a], b = nodes[e.b]
        const [ax, ay] = P(a), [bx, by] = P(b)
        const x = ax + (bx - ax) * p.t, y = ay + (by - ay) * p.t
        const tail = 0.3
        const tx = ax + (bx - ax) * Math.max(0, p.t - tail), ty = ay + (by - ay) * Math.max(0, p.t - tail)
        const g = ctx.createLinearGradient(tx, ty, x, y)
        g.addColorStop(0, rgba(b.c, 0))
        g.addColorStop(1, rgba(b.c, 0.85))
        ctx.strokeStyle = g; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke()
        ctx.beginPath(); ctx.fillStyle = rgba(b.c, 0.95); ctx.arc(x, y, 1.7, 0, 6.2832); ctx.fill()
        ctx.beginPath(); ctx.fillStyle = rgba(b.c, 0.18); ctx.arc(x, y, 6, 0, 6.2832); ctx.fill()
        p.t += p.s
        if (p.t > 1) { p.t = 0; p.e = Math.floor(Math.random() * edges.length) }
      })

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
    }
  }, [density, pulseSpeed])

  return (
    <div
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        background: 'radial-gradient(120% 90% at 20% 0%, #10132a 0%, #070914 45%, #04050b 100%)',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(75% 60% at 50% 45%, rgba(4,5,11,0) 0%, rgba(4,5,11,0.55) 70%, rgba(3,4,8,0.9) 100%)',
        }}
      />
    </div>
  )
}
