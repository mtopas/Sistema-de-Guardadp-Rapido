import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Activity, Command, PanelLeftClose, PanelLeftOpen, Plus, Sparkles, Wifi, WifiOff } from 'lucide-react'
import { MODULES, moduleOf } from './modules'
import { Aurora } from '../ui/Aurora'
import { IconButton, Kbd, cx } from '../ui/primitives'
import { useUI } from '../store/ui'
import { ping } from '../lib/api'

export function Shell({ children }) {
  const { pathname } = useLocation()
  const prefs = useUI((s) => s.prefs)
  const setPref = useUI((s) => s.setPref)
  const setRoute = useUI((s) => s.setRoute)
  const togglePalette = useUI((s) => s.togglePalette)
  const toggleTweaks = useUI((s) => s.toggleTweaks)
  const online = useUI((s) => s.online)
  const latency = useUI((s) => s.latency)
  const setOnline = useUI((s) => s.setOnline)

  useEffect(() => { setRoute(pathname) }, [pathname, setRoute])

  // Latido de conexión: marca la API como caída sin bloquear nada.
  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const ms = await ping()
        if (alive) setOnline(true, ms)
      } catch {
        if (alive) setOnline(false, null)
      }
    }
    check()
    const t = setInterval(check, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [setOnline])

  const mod = moduleOf(pathname)
  const expanded = prefs.railExpanded

  return (
    <div className="relative flex h-screen w-screen overflow-hidden" style={{ zoom: 'var(--scale, 1)' }}>
      <Aurora />

      {/* ── Rail lateral ───────────────────────────────────────────── */}
      <nav
        className="relative z-20 flex shrink-0 flex-col border-r border-line transition-[width] duration-300 ease-swift"
        style={{
          width: expanded ? 208 : 'var(--shell-rail)',
          background: 'color-mix(in srgb, var(--sidebar) 84%, transparent)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className={cx('flex items-center gap-2.5 px-4 pb-3 pt-4', !expanded && 'justify-center px-0')}>
          <Logo />
          {expanded && (
            <div className="min-w-0 a-fade">
              <div className="grad-text text-[15px] font-bold leading-none">SGR</div>
              <div className="mt-0.5 truncate1 text-[9.5px] tracking-wider text-txt-mute">GUARDADO RÁPIDO</div>
            </div>
          )}
        </div>

        <div className="mt-1 flex flex-1 flex-col gap-1 px-2.5">
          {MODULES.map((m) => (
            <NavLink
              key={m.id}
              to={m.path}
              end={m.path === '/'}
              className={({ isActive }) =>
                cx(
                  'group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-all duration-200 ease-swift',
                  !expanded && 'justify-center px-0',
                  isActive ? 'text-txt' : 'text-txt-sub hover:text-txt',
                )
              }
              style={({ isActive }) =>
                isActive
                  ? {
                      background: `linear-gradient(100deg, color-mix(in srgb, ${m.accent} 24%, transparent), transparent)`,
                      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${m.accent} 26%, transparent)`,
                    }
                  : undefined
              }
              title={expanded ? undefined : m.label}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full a-scale"
                      style={{ background: m.accent, boxShadow: `0 0 12px ${m.accent}` }}
                    />
                  )}
                  <m.icon
                    size={19}
                    className="shrink-0 transition-transform duration-300 ease-spring group-hover:scale-110"
                    style={{ color: isActive ? m.accent : undefined }}
                  />
                  {expanded && <span className="truncate1 text-[13px] font-medium a-fade">{m.label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </div>

        <div className={cx('flex flex-col gap-1 px-2.5 pb-3', !expanded && 'items-center')}>
          <button
            className={cx(
              'flex items-center gap-3 rounded-xl px-2.5 py-2 text-txt-sub transition-colors duration-200 hover:text-txt',
              !expanded && 'justify-center px-0',
            )}
            onClick={() => toggleTweaks()}
            title="Apariencia (Ctrl+M)"
          >
            <Sparkles size={17} className="shrink-0" />
            {expanded && <span className="text-[12.5px] a-fade">Apariencia</span>}
          </button>
          <button
            className={cx(
              'flex items-center gap-3 rounded-xl px-2.5 py-2 text-txt-sub transition-colors duration-200 hover:text-txt',
              !expanded && 'justify-center px-0',
            )}
            onClick={() => setPref('railExpanded', !expanded)}
            title={expanded ? 'Colapsar' : 'Expandir'}
          >
            {expanded ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            {expanded && <span className="text-[12.5px] a-fade">Colapsar</span>}
          </button>
        </div>
      </nav>

      {/* ── Columna principal ──────────────────────────────────────── */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-[17px] font-semibold leading-none">
              <span
                className="grid h-7 w-7 place-items-center rounded-[10px]"
                style={{
                  background: `color-mix(in srgb, ${mod.accent} 20%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${mod.accent} 32%, transparent)`,
                  color: mod.accent,
                }}
              >
                <mod.icon size={15} />
              </span>
              <span className="grad-text">{mod.label}</span>
            </h1>
            <p className="mt-1 truncate1 pl-9 text-[11.5px] text-txt-sub">{mod.hint}</p>
          </div>

          <button
            className="btn btn-sm gap-2 text-txt-sub"
            onClick={() => togglePalette(true)}
            title="Paleta de comandos"
          >
            <Command size={13} />
            <span className="hidden sm:inline">Buscar o ejecutar</span>
            <Kbd>Ctrl K</Kbd>
          </button>

          <ConnBadge online={online} latency={latency} />
        </header>

        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}

function Logo() {
  return (
    <div
      className="relative grid h-9 w-9 shrink-0 place-items-center rounded-[11px]"
      style={{
        background: 'linear-gradient(135deg, var(--accent-deep), var(--accent) 50%, var(--b2))',
        boxShadow: '0 8px 22px -10px color-mix(in srgb, var(--accent) 85%, transparent)',
      }}
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
        <path d="M6 17c4 0 5-3 5.5-5.5S13 6 18 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="6" cy="17" r="2.4" fill="#fff" />
        <circle cx="18" cy="6" r="2.4" fill="#fff" fillOpacity=".8" />
      </svg>
      <span
        className="absolute inset-0 rounded-[11px]"
        style={{ boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 35%)' }}
      />
    </div>
  )
}

function ConnBadge({ online, latency }) {
  const [hover, setHover] = useState(false)
  const color = online === null ? 'var(--mute)' : online ? 'var(--success)' : 'var(--danger)'
  const txt = online === null ? 'Conectando…' : online ? `API ${latency} ms` : 'API offline'
  return (
    <div
      className="chip shrink-0 gap-2"
      style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, color }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={online ? 'La API de SGR responde' : 'Los cambios quedan solo en pantalla hasta que vuelva la API'}
    >
      {online === false ? <WifiOff size={12} /> : online ? <Wifi size={12} /> : <Activity size={12} className="a-blink" />}
      <span className="mono hidden text-[10.5px] sm:inline">{txt}</span>
      {online && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, animation: 'breathe 2.4s ease-in-out infinite' }} />
      )}
    </div>
  )
}
