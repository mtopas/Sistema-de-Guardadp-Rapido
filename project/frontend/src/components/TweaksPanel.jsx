import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { THEMES, TONES, FONT_PAIRS, SECTION_NAMES } from '../utils/themes'

const AGENDA_SHORTCUTS = {
  hoy:      [['Click celda', 'Nuevo evento'], ['Drag bloque', 'Mover en grilla'], ['Ctrl+Enter', 'Guardar modal']],
  mes:      [['← →', 'Navegar mes'], ['Click día', 'Nuevo evento'], ['Ctrl+Enter', 'Guardar modal']],
  tareas:   [['Click lista', 'Seleccionar'], ['Click check', 'Completar tarea'], ['Ctrl+Enter', 'Guardar modal']],
  revision: [['← →', 'Cambiar semana'], ['PDF', 'Imprimir revisión']],
}

const FINANZAS_SHORTCUTS = {
  global:    [['N', 'Nuevo movimiento'], ['1–5', 'Cambiar tab'], ['← →', 'Mes anterior/siguiente'], ['/', 'Buscar']],
  dashboard: [['Vi', 'Ver todos ingresos'], ['Ve', 'Ver todos gastos'], ['C', 'Focus notas']],
  datos:     [['Ctrl+S', 'Guardar edición'], ['Supr', 'Eliminar fila seleccionada']],
  ahorro:    [['I', 'Nuevo instrumento']],
  fire:      [['E', 'Modo edición']],
}

const PAD = 8

const kbdStyle = {
  padding: '1px 5px',
  borderRadius: 4,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  color: 'var(--subtext)',
}

export default function TweaksPanel() {
  const [open, setOpen] = useState(false)
  const theme           = useStore(s => s.theme)
  const tone            = useStore(s => s.tone)
  const fontPair        = useStore(s => s.fontPair)
  const setTheme        = useStore(s => s.setTheme)
  const setTone         = useStore(s => s.setTone)
  const setFontPair     = useStore(s => s.setFontPair)
  const currentSection  = useStore(s => s.currentSection)
  const agendaActiveTab = useStore(s => s.agendaActiveTab)

  const finActiveTab = useStore(s => s.finActiveTab)

  const { pathname } = useLocation()
  const isAgenda    = pathname.startsWith('/agenda')
  const isFinanzas  = pathname.startsWith('/finanzas')
  const agendaShortcuts   = isAgenda   ? (AGENDA_SHORTCUTS[agendaActiveTab] || []) : []
  const finanzasShortcuts = isFinanzas
    ? [...(FINANZAS_SHORTCUTS.global || []), ...(FINANZAS_SHORTCUTS[finActiveTab] || [])]
    : []

  const isDark = THEMES[theme]?.dark !== false
  const supportsTone = isDark && THEMES[theme]?.allowTone !== false

  const dragRef   = useRef(null)
  const offsetRef = useRef({ x: 16, y: 16 }) // distance from right/bottom edges

  const clampToViewport = useCallback(() => {
    const panel = dragRef.current
    if (!panel) return
    const w = panel.offsetWidth, h = panel.offsetHeight
    const maxRight  = Math.max(PAD, window.innerWidth  - w - PAD)
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD)
    offsetRef.current = {
      x: Math.min(maxRight,  Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    }
    panel.style.right  = offsetRef.current.x + 'px'
    panel.style.bottom = offsetRef.current.y + 'px'
  }, [])

  const onDragStart = (e) => {
    const panel = dragRef.current
    if (!panel) return
    const r = panel.getBoundingClientRect()
    const sx = e.clientX, sy = e.clientY
    const startRight  = window.innerWidth  - r.right
    const startBottom = window.innerHeight - r.bottom
    const move = (ev) => {
      offsetRef.current = {
        x: startRight  - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      }
      clampToViewport()
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // Ctrl+M (Cmd+M) toggles · Escape closes
  useEffect(() => {
    const handler = (e) => {
      const k = e.key?.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'm') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (k === 'escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Keep panel inside viewport on open / resize
  useEffect(() => {
    if (!open) return
    clampToViewport()
    const onResize = () => clampToViewport()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, clampToViewport])

  if (!open) return null

  return (
    <div
      ref={dragRef}
      role="dialog"
      aria-label="Tweaks"
      style={{
        position: 'fixed',
        right: offsetRef.current.x, bottom: offsetRef.current.y,
        zIndex: 1000,
        width: 280, maxHeight: 'calc(100vh - 32px)',
        display: 'flex', flexDirection: 'column',
        background: 'color-mix(in srgb, var(--surface), white 12%)',
        color: 'var(--text)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        border: '1px solid color-mix(in srgb, var(--border), white 18%)',
        borderRadius: 14,
        boxShadow: '0 1px 0 rgba(255,255,255,.06) inset, 0 14px 44px rgba(0,0,0,.45)',
        overflow: 'hidden',
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      {/* Header — drag handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 8px 10px 14px',
          userSelect: 'none', cursor: 'move',
        }}
      >
        <b style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.01em' }}>
          Tweaks · SGR
        </b>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setOpen(false)}
          aria-label="Cerrar"
          style={{
            border: 0, background: 'transparent', color: 'var(--subtext)',
            width: 22, height: 22, borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}
        >✕</button>
      </div>

      {/* Body */}
      <div style={{
        padding: '2px 14px 14px',
        display: 'flex', flexDirection: 'column', gap: 12,
        overflowY: 'auto',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '.06em',
          textTransform: 'uppercase', color: 'var(--subtext)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>Tema</span>
          <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', fontSize: 10, fontStyle: 'italic' }}>
            {SECTION_NAMES[currentSection] ?? 'Bóveda'}
          </span>
        </div>

        {/* Themes grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            fontSize: 11.5, color: 'var(--subtext)',
          }}>
            <span style={{ fontWeight: 500 }}>Temas</span>
            <span style={{ fontSize: 10.5 }}>{THEMES[theme]?.name}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {Object.entries(THEMES).map(([key, t]) => {
              const active = key === theme
              // Chip: --bg as base + accent gradient diagonal stripe so themes are recognizable
              const chipBg = `linear-gradient(135deg, ${t['--accent']} 0%, ${t['--accent-light']} 38%, ${t['--bg']} 38%, ${t['--bg']} 100%)`
              const checkColor = t.dark ? '#fff' : t['--text']
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTheme(key)}
                  title={t.name}
                  aria-label={t.name}
                  style={{
                    position: 'relative',
                    height: 42,
                    borderRadius: 8,
                    border: '1px solid ' + (t['--border'] || 'rgba(0,0,0,.18)'),
                    padding: 0,
                    background: chipBg,
                    cursor: 'pointer',
                    boxShadow: active
                      ? '0 0 0 2px var(--bg), 0 0 0 4px var(--accent)'
                      : '0 0 0 0.5px rgba(0,0,0,.18), 0 1px 2px rgba(0,0,0,.1)',
                    transition: 'transform 0.12s, box-shadow 0.12s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
                >
                  {active && (
                    <svg width="14" height="14" viewBox="0 0 14 14"
                      style={{ position: 'absolute', top: 4, left: 4,
                        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.45))' }}>
                      <path d="M3 7.2 5.8 10 11 4.2"
                        fill="none" strokeWidth="2.4"
                        strokeLinecap="round" strokeLinejoin="round" stroke={checkColor} />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tono base — solo aplica a temas oscuros que permiten modificarlo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: supportsTone ? 1 : 0.45 }}>
          <div style={{ fontSize: 11.5, color: 'var(--subtext)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 500 }}>Tono base</span>
            {!isDark && <span style={{ fontSize: 10, fontStyle: 'italic' }}>solo en oscuros</span>}
            {isDark && !supportsTone && <span style={{ fontSize: 10, fontStyle: 'italic' }}>identidad fija</span>}
          </div>
          <div style={{
            display: 'flex', padding: 2, borderRadius: 8,
            background: 'rgba(0,0,0,0.22)', userSelect: 'none',
            pointerEvents: supportsTone ? 'auto' : 'none',
          }}>
            {Object.entries(TONES).map(([key, t]) => {
              const active = tone === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTone(key)}
                  disabled={!supportsTone}
                  style={{
                    flex: 1, border: 0,
                    background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: 'var(--text)',
                    fontWeight: 500, fontSize: 11.5,
                    minHeight: 24, borderRadius: 6,
                    padding: '4px 6px', cursor: supportsTone ? 'pointer' : 'not-allowed',
                    boxShadow: active ? '0 1px 2px rgba(0,0,0,.25)' : 'none',
                    transition: 'background 0.12s',
                  }}
                >
                  {t.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tipografías — por sección (igual que temas) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            fontSize: 11.5, color: 'var(--subtext)',
          }}>
            <span style={{ fontWeight: 500 }}>Tipografía</span>
            <span style={{ fontSize: 10, fontStyle: 'italic', fontWeight: 400 }}>
              {SECTION_NAMES[currentSection] ?? 'Bóveda'}
            </span>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            fontSize: 10.5, color: 'var(--subtext)', marginTop: -2,
          }}>
            <span />
            <span>{FONT_PAIRS[fontPair]?.name}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {Object.entries(FONT_PAIRS).map(([key, p]) => {
              const active = key === fontPair
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFontPair(key)}
                  title={`${p.name} · ${p.title} / ${p.body}`}
                  aria-label={p.name}
                  style={{
                    position: 'relative',
                    height: 52,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    padding: '4px 6px',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    overflow: 'hidden',
                    boxShadow: active
                      ? '0 0 0 2px var(--bg), 0 0 0 4px var(--accent)'
                      : '0 1px 2px rgba(0,0,0,.1)',
                    transition: 'transform 0.12s, box-shadow 0.12s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}
                >
                  <span style={{
                    ...p.titleStyle,
                    fontSize: 16,
                    lineHeight: 1,
                    color: 'var(--text)',
                    whiteSpace: 'nowrap',
                  }}>
                    {p.title}
                  </span>
                  <span style={{
                    ...p.bodyStyle,
                    fontSize: 10,
                    lineHeight: 1.1,
                    color: 'var(--subtext)',
                    whiteSpace: 'nowrap',
                  }}>
                    {p.body}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Contextual Agenda shortcuts */}
        {agendaShortcuts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '.06em',
              textTransform: 'uppercase', color: 'var(--subtext)',
            }}>
              Atajos · {agendaActiveTab}
            </div>
            {agendaShortcuts.map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                <kbd style={kbdStyle}>{key}</kbd>
                <span style={{ color: 'var(--text-2)' }}>{desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* Contextual Finanzas shortcuts */}
        {finanzasShortcuts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '.06em',
              textTransform: 'uppercase', color: 'var(--subtext)',
            }}>
              Atajos · {finActiveTab || 'finanzas'}
            </div>
            {finanzasShortcuts.map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                <kbd style={kbdStyle}>{key}</kbd>
                <span style={{ color: 'var(--subtext)', textAlign: 'right', maxWidth: 140 }}>{desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* Shortcut hint */}
        <div style={{
          fontSize: 10, color: 'var(--subtext)',
          textAlign: 'center', marginTop: 4, opacity: 0.75,
        }}>
          <kbd style={kbdStyle}>Ctrl</kbd>{' + '}<kbd style={kbdStyle}>M</kbd>
          <span style={{ marginLeft: 6 }}>para abrir / cerrar</span>
        </div>
      </div>
    </div>
  )
}
