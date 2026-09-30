import { useEffect, useRef } from 'react'
import { useUI } from '../store/ui'

/**
 * Fondo animado: blobs de color que derivan, grilla en perspectiva y grano.
 * Es puro CSS (sin canvas ni rAF) para que no pese en el hilo principal.
 * Se desactiva desde Ajustes o si el sistema pide menos movimiento.
 */
export function Aurora() {
  const on = useUI((s) => s.prefs.aurora)
  const ref = useRef(null)

  // Paralaje suave: el fondo se corre un poco con el mouse.
  useEffect(() => {
    if (!on) return
    const el = ref.current
    if (!el) return
    let raf = 0
    const onMove = (e) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth - 0.5) * 24
        const y = (e.clientY / window.innerHeight - 0.5) * 24
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf) }
  }, [on])

  if (!on) return <div className="aurora" aria-hidden><div className="aurora-grid" style={{ opacity: 0.3 }} /></div>

  return (
    <div className="aurora" aria-hidden>
      <div ref={ref} className="absolute inset-0 transition-transform duration-500 ease-swift">
        <div
          className="aurora-blob"
          style={{ top: '-14%', left: '-8%', width: '46vw', height: '46vw', background: 'var(--accent)', '--t': '24s' }}
        />
        <div
          className="aurora-blob"
          style={{ top: '34%', right: '-12%', width: '40vw', height: '40vw', background: 'var(--b2)', '--t': '31s', animationDelay: '-8s', opacity: 0.35 }}
        />
        <div
          className="aurora-blob"
          style={{ bottom: '-18%', left: '26%', width: '38vw', height: '38vw', background: 'var(--b3)', '--t': '28s', animationDelay: '-15s', opacity: 0.28 }}
        />
        <div
          className="aurora-blob"
          style={{ top: '8%', left: '48%', width: '26vw', height: '26vw', background: 'var(--b10)', '--t': '35s', animationDelay: '-4s', opacity: 0.22 }}
        />
      </div>
      <div className="aurora-grid" />
      <div className="aurora-noise" />
      {/* Franja de barrido, muy sutil, como un scanner. */}
      <div
        className="absolute inset-x-0 h-24 opacity-[0.045]"
        style={{
          background: 'linear-gradient(180deg, transparent, var(--accent-light), transparent)',
          animation: 'scanline 14s linear infinite',
        }}
      />
    </div>
  )
}
