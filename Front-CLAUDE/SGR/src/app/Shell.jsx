import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bell, Plus, Search, WifiOff, CalendarClock, Sprout, DollarSign, RefreshCw } from 'lucide-react'
import { MODULES, SETTINGS_MODULE, moduleFor } from './modules'
import { useUI } from '../store/ui'
import { useFin } from '../store/fin'
import { useHabitos } from '../store/habitos'
import { get } from '../lib/api'
import { toLocalDateTime, fmtTime, pad } from '../lib/dates'
import { buildRegMap, statusHoy } from '../lib/habitos'
import { Dropdown, spring } from '../components/ui'
import { dolarDe } from '../lib/fin'

export function Sidebar() {
  const loc = useLocation()
  const nav = useNavigate()
  const current = moduleFor(loc.pathname)
  const items = [...MODULES]
  return (
    <nav className="nx-side" aria-label="Módulos">
      <div className="nx-logo" onClick={() => nav('/')} title="SGR · Nexus">
        <svg viewBox="0 0 64 64">
          <defs>
            <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--a1)" />
              <stop offset="0.5" stopColor="var(--a2)" />
              <stop offset="1" stopColor="var(--a3)" />
            </linearGradient>
          </defs>
          <path d="M32 4 56 18v28L32 60 8 46V18z" fill="none" stroke="url(#lg)" strokeWidth="2.5" />
          <path d="M32 14 47 23v18L32 50 17 41V23z" fill="none" stroke="url(#lg)" strokeWidth="1.2" opacity="0.6" strokeDasharray="4 3" />
        </svg>
        <span className="core" />
      </div>
      {items.map((m) => (
        <NavBtn key={m.id} m={m} active={current.id === m.id} onClick={() => nav(m.path)} />
      ))}
      <div className="spacer" />
      <NavBtn m={SETTINGS_MODULE} active={current.id === 'settings'} onClick={() => nav('/settings')} />
    </nav>
  )
}

function NavBtn({ m, active, onClick }) {
  const Icon = m.icon
  return (
    <motion.button
      className={`nx-navbtn ${active ? 'active' : ''}`}
      style={{ '--c1': m.colors[0], '--c2': m.colors[1] }}
      onClick={onClick}
      title={m.label}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.92 }}
    >
      {active && <motion.span layoutId="nav-pill" className="pill" transition={spring} />}
      {active && <motion.span layoutId="nav-dot" className="glowdot" transition={spring} />}
      <span className="ico" style={!active ? { color: m.colors[0] } : undefined}>
        <Icon size={21} strokeWidth={active ? 2.2 : 1.8} />
      </span>
      <span className="lbl hide-sm">{m.short}</span>
    </motion.button>
  )
}

export function TopBar() {
  const loc = useLocation()
  const mod = moduleFor(loc.pathname)
  const setPalette = useUI((s) => s.setPalette)
  const openCapture = useUI((s) => s.openCapture)
  const online = useUI((s) => s.online)
  const nombre = useUI((s) => s.profile.nombre)
  return (
    <header className="nx-top">
      <motion.div className="nx-title" key={mod.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
        <h1>{mod.label}</h1>
        <small>{mod.sub}</small>
      </motion.div>
      <div className="nx-search" onClick={() => setPalette(true)}>
        <Search size={16} className="si" />
        <input readOnly placeholder={nombre ? `Buscar o ejecutar, ${nombre}…` : 'Buscar o ejecutar…'} onFocus={(e) => { e.target.blur(); setPalette(true) }} />
        <kbd className="hide-sm">Ctrl K</kbd>
      </div>
      {!online && (
        <span className="chip hide-sm" style={{ borderColor: 'rgba(255,184,0,.5)', color: 'var(--amber)' }} title="La API no responde — los cambios se guardan localmente">
          <WifiOff size={13} /> offline
        </span>
      )}
      <DolarChip />
      <Clock />
      <BellMenu />
      <motion.button className="btn primary sm" onClick={() => openCapture()} whileTap={{ scale: 0.94 }} title="Captura rápida (Ctrl+Enter)">
        <Plus size={16} /> <span className="hide-sm">Capturar</span>
      </motion.button>
    </header>
  )
}

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="hide-sm mono" style={{ textAlign: 'right', lineHeight: 1.1 }}>
      <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.06em' }}>
        {pad(now.getHours())}
        <span style={{ opacity: now.getSeconds() % 2 ? 0.3 : 1, transition: 'opacity .3s' }}>:</span>
        {pad(now.getMinutes())}
      </div>
      <div className="tiny dim">{now.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' })}</div>
    </div>
  )
}

function DolarChip() {
  const config = useFin((s) => s.config)
  const actualizar = useFin((s) => s.actualizarDolar)
  const [busy, setBusy] = useState(false)
  const d = dolarDe(config)
  if (!d) return null
  return (
    <button
      className="chip click hide-sm"
      title={`MEP · oficial compra ${config.dolar_oficial_compra ?? '—'} — click para actualizar`}
      onClick={async () => { setBusy(true); await actualizar(); setBusy(false) }}
      style={{ borderColor: 'rgba(255,184,0,.35)' }}
    >
      {busy ? <RefreshCw size={12} className="spin" /> : <DollarSign size={12} style={{ color: 'var(--amber)' }} />}
      <span className="mono">{Math.round(d).toLocaleString('es-AR')}</span>
    </button>
  )
}

function BellMenu() {
  const [open, setOpen] = useState(false)
  const [eventos, setEventos] = useState([])
  const prefs = useUI((s) => s.prefs)
  const habitos = useHabitos((s) => s.habitos)
  const registros = useHabitos((s) => s.registros)
  const registrar = useHabitos((s) => s.registrar)
  const nav = useNavigate()
  const notified = useRef(new Set())

  const pendientes = useMemo(() => {
    const map = buildRegMap(registros)
    return habitos.filter((h) => h.activo !== false && statusHoy(h, map) === 'pendiente')
  }, [habitos, registros])

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const r = await get('/agenda/notificaciones/pending', { ventana_min: Math.min(120, prefs.notifyMinutes || 15), ahora: toLocalDateTime() })
        if (!alive) return
        const list = Array.isArray(r) ? r : r?.eventos || r?.items || []
        setEventos(list)
        if (prefs.notifyBrowser && 'Notification' in window && Notification.permission === 'granted') {
          for (const ev of list) {
            const key = `${ev.id}|${ev.fecha_inicio}`
            if (notified.current.has(key)) continue
            notified.current.add(key)
            new Notification(ev.titulo || 'Evento próximo', { body: `${fmtTime(ev.fecha_inicio)} · ${ev.calendario_nombre || 'Agenda'}` })
          }
        }
      } catch { /* offline */ }
    }
    poll()
    const t = setInterval(poll, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [prefs.notifyBrowser, prefs.notifyMinutes])

  const count = eventos.length + pendientes.length
  const today = toLocalDateTime().slice(0, 10)
  return (
    <div style={{ position: 'relative' }}>
      <button className="iconbtn" onClick={() => setOpen((v) => !v)} aria-label="Avisos">
        <motion.span animate={count ? { rotate: [0, -14, 12, -8, 0] } : {}} transition={{ duration: 0.8, repeat: count ? Infinity : 0, repeatDelay: 6 }} style={{ display: 'grid' }}>
          <Bell size={18} />
        </motion.span>
        {count > 0 && <span className="badge-dot">{count}</span>}
      </button>
      <Dropdown open={open} onClose={() => setOpen(false)} style={{ right: 0, top: 44, width: 320 }}>
        <div className="pop-sec">Próximos {prefs.notifyMinutes || 15} min</div>
        {eventos.length === 0 && <div className="small dim" style={{ padding: '4px 10px 8px' }}>Sin eventos inminentes</div>}
        {eventos.map((ev, i) => (
          <div key={i} className="pop-item" onClick={() => { setOpen(false); nav('/agenda') }}>
            <CalendarClock size={15} style={{ color: ev.calendario_color || 'var(--cyan)' }} />
            <span className="grow ellipsis">{ev.titulo}</span>
            <span className="mono small muted">{fmtTime(ev.fecha_inicio)}</span>
          </div>
        ))}
        <div className="pop-sec">Hábitos pendientes hoy</div>
        {pendientes.length === 0 && <div className="small dim" style={{ padding: '4px 10px 8px' }}>Todo al día ✦</div>}
        {pendientes.map((h) => (
          <div key={h.id} className="pop-item">
            <Sprout size={15} style={{ color: h.color }} />
            <span className="grow ellipsis" onClick={() => { setOpen(false); nav('/habitos') }}>{h.nombre}</span>
            <button className="btn xs" onClick={() => registrar(h.id, today, 1)}>Hecho</button>
          </div>
        ))}
      </Dropdown>
    </div>
  )
}
