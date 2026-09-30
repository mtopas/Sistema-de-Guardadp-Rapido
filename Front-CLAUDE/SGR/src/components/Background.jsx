import { useEffect, useRef } from 'react'
import { useUI } from '../store/ui'

// Fondo: auroras (CSS) + constelación de partículas en canvas + halo que sigue al cursor.
export default function Background({ accent = ['#9d4bff', '#ff2e97', '#00f0ff'] }) {
  const canvasRef = useRef(null)
  const glowRef = useRef(null)
  const prefs = useUI((s) => s.prefs)
  const accentRef = useRef(accent)
  accentRef.current = accent

  useEffect(() => {
    if (!prefs.particles || prefs.effects === 'off') return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let w, h, raf
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const mouse = { x: -9999, y: -9999 }
    let parts = []
    const lite = prefs.effects === 'lite'

    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.round(Math.min(lite ? 50 : 110, (w * h) / (lite ? 26000 : 14000)))
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.4,
        c: Math.floor(Math.random() * 3),
        tw: Math.random() * Math.PI * 2,
      }))
    }
    resize()
    window.addEventListener('resize', resize)
    const onMove = (e) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
    }
    window.addEventListener('pointermove', onMove)

    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      const cols = accentRef.current
      for (const p of parts) {
        p.x += p.vx
        p.y += p.vy
        p.tw += 0.02
        if (p.x < -10) p.x = w + 10
        if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10
        if (p.y > h + 10) p.y = -10
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.hypot(dx, dy)
        if (dist < 140) {
          p.x += (dx / dist) * 0.6
          p.y += (dy / dist) * 0.6
        }
      }
      if (!lite) {
        ctx.lineWidth = 0.6
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            const a = parts[i]
            const b = parts[j]
            const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2
            if (d < 110 * 110) {
              ctx.strokeStyle = hexA(cols[a.c], 0.16 * (1 - Math.sqrt(d) / 110))
              ctx.beginPath()
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(b.x, b.y)
              ctx.stroke()
            }
          }
        }
      }
      for (const p of parts) {
        const tw = 0.55 + Math.sin(p.tw) * 0.45
        ctx.fillStyle = hexA(cols[p.c], 0.85 * tw)
        ctx.shadowColor = cols[p.c]
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.shadowBlur = 0
      raf = requestAnimationFrame(tick)
    }
    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', onVis)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [prefs.particles, prefs.effects])

  useEffect(() => {
    if (!prefs.cursorGlow || prefs.effects === 'off') return
    let raf
    let tx = 0, ty = 0, x = 0, y = 0
    const onMove = (e) => {
      tx = e.clientX
      ty = e.clientY
    }
    const loop = () => {
      x += (tx - x) * 0.12
      y += (ty - y) * 0.12
      if (glowRef.current) glowRef.current.style.transform = `translate(${x - 260}px, ${y - 260}px)`
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('pointermove', onMove)
    raf = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [prefs.cursorGlow, prefs.effects])

  return (
    <>
      <div className="nx-bg" aria-hidden>
        <div className="nx-blob b1" />
        <div className="nx-blob b2" />
        <div className="nx-blob b3" />
        <div className="nx-grid" />
        {prefs.particles && prefs.effects !== 'off' && <canvas ref={canvasRef} />}
        <div className="nx-scan" />
        <div className="nx-noise" />
      </div>
      {prefs.cursorGlow && prefs.effects !== 'off' && <div ref={glowRef} className="nx-cursor" style={{ left: 0, top: 0, transform: 'translate(-999px,-999px)', width: 520, height: 520, marginLeft: 0 }} />}
    </>
  )
}

function hexA(hex, a) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`
}
