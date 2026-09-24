import { useRef, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Bell, Plus, Settings, Target, CheckCircle2, Calendar, CheckSquare, Sparkles } from 'lucide-react'
import { useStore } from '../store/useStore'
import { t } from '../utils/i18n'
import { API_URL } from '../config'
import { APP_MODULES, adjacentModule, moduleIndexForPath } from '../utils/themes'

const kbdStyle = {
  borderColor: 'var(--border)',
  color: 'var(--subtext)',
  background: 'var(--bg)',
  fontFamily: 'var(--font-mono)',
}

function IconButton({ children, onClick, ariaLabel, badge = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="relative inline-flex items-center justify-center rounded-[10px] transition-colors duration-150 topbar-icon-btn"
      style={{
        width: 32, height: 32, color: 'var(--subtext)',
        background: 'transparent', border: '1px solid transparent',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--surface)'
        e.currentTarget.style.color = 'var(--text)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--subtext)'
      }}
    >
      {children}
      {badge && (
        <span
          className="absolute"
          style={{
            top: 6, right: 6,
            width: 8, height: 8, borderRadius: 999,
            background: 'var(--accent-alt, var(--accent))',
            boxShadow: '0 0 0 2px var(--bg)',
          }}
        />
      )}
    </button>
  )
}

export default function TopBar({ searchQuery = '', onSearchChange, searchInputRef }) {
  const navigate    = useNavigate()
  const location    = useLocation()
  const userName     = useStore(s => s.userName)
  const lang         = useStore(s => s.lang)
  const agendaReminderMinutes = useStore(s => s.agendaReminderMinutes)
  const openCapture      = useStore(s => s.openCapture)
  const openMovement     = useStore(s => s.openMovement)
  const openAgendaEvento = useStore(s => s.openAgendaEvento)
  const openHabitoModal  = useStore(s => s.openHabitoModal)
  const openJarvisCapture = useStore(s => s.openJarvisCapture)
  const openFeedback     = useStore(s => s.openFeedback)
  const initial      = userName ? userName.trim()[0].toUpperCase() : '?'

  const isHabitos  = location.pathname.startsWith('/habitos')
  const isAgenda   = location.pathname.startsWith('/agenda')
  const isFinanzas = location.pathname.startsWith('/finanzas')
  const [bellOpen, setBellOpen]             = useState(false)
  const [pendingHabitos, setPendingHabitos]   = useState([])
  const [agendaNotifPending, setAgendaNotifPending] = useState([])
  const bellRef = useRef(null)
  const searchRef = useRef(null)
  const [agendaResults, setAgendaResults] = useState(null)
  const [finResults,    setFinResults]    = useState(null)

  // Finanzas data for local search
  const finMovAll    = useStore(s => s.finMovimientosAll)
  const finNotas     = useStore(s => s.finNotas)
  const finObjetivos = useStore(s => s.finObjetivos)

  // Debounced Finanzas search (local)
  useEffect(() => {
    if (!isFinanzas || !searchQuery.trim()) { setFinResults(null); return }
    const q = searchQuery.trim().toLowerCase()
    const timer = setTimeout(() => {
      const movs = finMovAll
        .filter(m => (m.descripcion ?? m.desc ?? '').toLowerCase().includes(q) || (m.categoria_nombre ?? m.cat ?? '').toLowerCase().includes(q))
        .slice(0, 8)
      const notas = (finNotas || [])
        .filter(n => n.contenido.toLowerCase().includes(q))
        .slice(0, 4)
      const objs = (finObjetivos || [])
        .filter(o => o.nombre.toLowerCase().includes(q))
        .slice(0, 4)
      setFinResults({ movs, notas, objs })
    }, 200)
    return () => clearTimeout(timer)
  }, [searchQuery, isFinanzas, finMovAll, finNotas, finObjetivos])

  // Debounced agenda search
  useEffect(() => {
    if (!isAgenda || !searchQuery.trim()) { setAgendaResults(null); return }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/agenda/buscar?q=${encodeURIComponent(searchQuery.trim())}`)
        if (res.ok) setAgendaResults(await res.json())
      } catch { /* noop */ }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, isAgenda])

  // Close search dropdowns on outside click
  useEffect(() => {
    if (!agendaResults && !finResults) return
    const h = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setAgendaResults(null)
        setFinResults(null)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [agendaResults, finResults])

  // Close dropdown on outside click
  useEffect(() => {
    if (!bellOpen) return
    const h = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [bellOpen])

  // Poll for upcoming agenda events every minute
  useEffect(() => {
    if (!isAgenda) return
    const checkNotifs = async () => {
      try {
        const res = await fetch(`${API_URL}/agenda/notificaciones/pending?ventana_min=${agendaReminderMinutes}`)
        if (!res.ok) return
        const data = await res.json()
        setAgendaNotifPending(data)
      } catch { /* noop */ }
    }
    checkNotifs()
    const id = setInterval(checkNotifs, 60000)
    return () => clearInterval(id)
  }, [isAgenda, agendaReminderMinutes])

  async function handleBellClick() {
    if (isAgenda) { setBellOpen(v => !v); return }
    if (!isHabitos) return
    if (bellOpen) { setBellOpen(false); return }
    try {
      const res = await fetch(`${API_URL}/habitos/pendientes-hoy`)
      if (res.ok) {
        const data = await res.json()
        setPendingHabitos(data.filter(h => !h.registro_hoy || h.registro_hoy.valor === 0))
      }
    } catch { /* noop */ }
    setBellOpen(true)
  }

  const path        = location.pathname
  const modIdx      = moduleIndexForPath(path)
  const currentMod  = APP_MODULES[modIdx]
  const isBoveda    = currentMod.id === 'boveda'
  const prevMod     = adjacentModule(path, -1)
  const nextMod     = adjacentModule(path, 1)
  const title       = (t(lang, currentMod.titleKey) || 'SGR').toUpperCase()
  const cycleNext   = () => navigate(nextMod.path)
  const cyclePrev   = (e) => { e.preventDefault(); navigate(prevMod.path) }

  const ctaLabel     = t(lang, currentMod.ctaKey)
  const ctaActions   = { openCapture, openMovement, openAgendaEvento, openHabitoModal, openJarvisCapture }
  const runCta       = () => ctaActions[currentMod.ctaStore]?.()

  return (
    <header
      className={`${isBoveda ? 'h-[72px]' : 'h-[60px]'} shrink-0 sticky top-0 z-30 flex items-center px-5 lg:px-6 gap-4 lg:gap-6 border-b`}
      style={{
        background: 'var(--header-bg, var(--panel-bg))',
        borderColor: 'var(--border)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Module identity — clic = siguiente · clic derecho = anterior */}
      <button
        type="button"
        onClick={cycleNext}
        onContextMenu={cyclePrev}
        title={`→ ${t(lang, nextMod.titleKey)}  ·  ← ${t(lang, prevMod.titleKey)}`}
        className="flex items-center gap-3 min-w-0 rounded-md select-none transition-transform duration-150 hover:scale-[1.02] active:scale-95 focus:outline-none cursor-pointer"
      >
        {isBoveda && (
          <span className="hidden lg:inline-flex items-center gap-2.5 pr-3 border-r" style={{ borderColor: 'var(--border)' }}>
            <span className="w-8 h-8 grid place-items-center rounded-lg" style={{ background: 'color-mix(in oklch, var(--accent) 15%, transparent)', color: 'var(--accent-light)' }}>
              <Sparkles size={18} strokeWidth={2.25} />
            </span>
            <span className="text-[20px] font-bold tracking-[0.06em]" style={{ color: 'var(--text)' }}>SGR</span>
          </span>
        )}
        <span className="min-w-0 text-left">
          <span
            className="gradient-text font-bold block"
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: isBoveda ? 24 : 28,
              lineHeight: 1.08,
              paddingBottom: '0.08em',
              paddingRight: '0.18em',
              paddingLeft: '0.02em',
            }}
          >
            {title}
          </span>
          {isBoveda && (
            <span className="hidden sm:block text-[10px] leading-tight truncate" style={{ color: 'var(--subtext)' }}>
              Todo tu conocimiento, conectado
            </span>
          )}
        </span>
      </button>

      {/* Search */}
      <div ref={searchRef} className="flex-1 max-w-[520px] mx-auto relative">
        <div
          className="flex items-center gap-2 px-3 h-9 rounded-xl border transition-colors duration-150"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <Search size={15} style={{ color: 'var(--subtext)', flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={isAgenda ? t(lang, 'agendaBuscarPlaceholder') : t(lang, 'searchPlaceholder')}
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:opacity-60"
            style={{ color: 'var(--text)' }}
          />
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border text-[10px]" style={kbdStyle}>Ctrl</kbd>
            <kbd className="px-1.5 py-0.5 rounded border text-[10px]" style={kbdStyle}>M</kbd>
          </div>
        </div>

        {/* Finanzas search dropdown */}
        {isFinanzas && finResults && (
          <div
            className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border shadow-2xl z-50 overflow-hidden"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)' }}
          >
            {finResults.movs.length === 0 && finResults.notas.length === 0 && finResults.objs.length === 0 ? (
              <div className="px-4 py-3 text-[12.5px] italic" style={{ color: 'var(--subtext)' }}>Sin resultados</div>
            ) : (
              <div className="max-h-[320px] overflow-y-auto">
                {finResults.movs.length > 0 && (
                  <div className="px-4 pt-2 pb-1 text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--subtext)' }}>Movimientos</div>
                )}
                {finResults.movs.map(m => (
                  <button
                    key={`m-${m.id}`}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                    style={{ color: 'var(--text)' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface)'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                    onClick={() => { setFinResults(null); onSearchChange('') }}
                  >
                    <span style={{ fontSize: 13 }}>{(m.tipo ?? m.type) === 'income' ? '💰' : '💸'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium truncate">{m.descripcion ?? m.desc}</div>
                      <div className="text-[10.5px] mono" style={{ color: 'var(--subtext)' }}>
                        {m.fecha?.slice(0,10)} · {m.categoria_nombre ?? m.cat}
                      </div>
                    </div>
                    <span className="mono tnum text-[11.5px] shrink-0" style={{ color: (m.tipo ?? m.type) === 'income' ? 'var(--income)' : 'var(--expense)' }}>
                      {Math.abs(m.monto ?? m.amount ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                    </span>
                  </button>
                ))}
                {finResults.objs.length > 0 && (
                  <div className="px-4 pt-2 pb-1 text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--subtext)' }}>Objetivos</div>
                )}
                {finResults.objs.map(o => (
                  <button
                    key={`o-${o.id}`}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                    style={{ color: 'var(--text)' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface)'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                    onClick={() => { setFinResults(null); onSearchChange('') }}
                  >
                    <span style={{ fontSize: 13 }}>🎯</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium truncate">{o.nombre}</div>
                      <div className="text-[10.5px] mono" style={{ color: 'var(--subtext)' }}>Meta: {o.meta?.toLocaleString('es-AR')} {o.moneda}</div>
                    </div>
                  </button>
                ))}
                {finResults.notas.length > 0 && (
                  <div className="px-4 pt-2 pb-1 text-[9.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--subtext)' }}>Notas</div>
                )}
                {finResults.notas.map(n => (
                  <button
                    key={`n-${n.id}`}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                    style={{ color: 'var(--text)' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface)'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                    onClick={() => { setFinResults(null); onSearchChange('') }}
                  >
                    <span style={{ fontSize: 13 }}>📝</span>
                    <div className="text-[12.5px] truncate">{n.contenido}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Agenda search dropdown */}
        {isAgenda && agendaResults && (
          <div
            className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border shadow-2xl z-50 overflow-hidden"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)' }}
          >
            {agendaResults.eventos?.length === 0 && agendaResults.tareas?.length === 0 ? (
              <div className="px-4 py-3 text-[12.5px] italic" style={{ color: 'var(--subtext)' }}>
                {t(lang, 'agendaSinResultados')}
              </div>
            ) : (
              <div className="max-h-[320px] overflow-y-auto">
                {agendaResults.eventos?.slice(0, 5).map(e => (
                  <button
                    key={`e-${e.id}`}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ color: 'var(--text)' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface)'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                    onClick={() => {
                      const d = e.fecha_inicio?.slice(0, 10) || ''
                      navigate(`/agenda?tab=mes&highlight=${e.id}&highlightDate=${d}`)
                      setAgendaResults(null); onSearchChange('')
                    }}
                  >
                    <Calendar size={13} style={{ color: e.calendario_color || 'var(--accent)', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium truncate">{e.titulo}</div>
                      {e.fecha_inicio && (
                        <div className="text-[10.5px] mono" style={{ color: 'var(--subtext)' }}>{e.fecha_inicio.slice(0, 10)}</div>
                      )}
                    </div>
                  </button>
                ))}
                {agendaResults.tareas?.slice(0, 5).map(tt => (
                  <button
                    key={`t-${tt.id}`}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ color: 'var(--text)' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface)'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                    onClick={() => { navigate(`/agenda?tab=mes&highlight=${tt.id}&highlightDate=${tt.fecha_opcional || ''}`); setAgendaResults(null); onSearchChange('') }}
                  >
                    <CheckSquare size={13} style={{ color: tt.lista_color || 'var(--accent)', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium truncate">{tt.titulo}</div>
                      {tt.fecha_opcional && (
                        <div className="text-[10.5px] mono" style={{ color: 'var(--subtext)' }}>{tt.fecha_opcional}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        {/* Bell — functional on /habitos, decorative elsewhere */}
        <div ref={bellRef} className="relative">
          <IconButton
            ariaLabel={
              isHabitos ? `Pendientes hoy${pendingHabitos.length > 0 ? ` (${pendingHabitos.length})` : ''}`
              : isAgenda ? `Próximos eventos${agendaNotifPending.length > 0 ? ` (${agendaNotifPending.length})` : ''}`
              : 'Notificaciones'
            }
            badge={isHabitos ? pendingHabitos.length > 0 : isAgenda ? agendaNotifPending.length > 0 : false}
            onClick={(isHabitos || isAgenda) ? handleBellClick : undefined}
          >
            <Bell size={16} />
          </IconButton>

          {bellOpen && isAgenda && (
            <div
              className="absolute right-0 top-full mt-2 w-[260px] rounded-2xl shadow-2xl border z-50 overflow-hidden"
              style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)' }}
            >
              <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
                <Bell size={13} style={{ color: 'var(--accent)' }} />
                <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
                  Próximos 15 min
                </span>
              </div>
              {agendaNotifPending.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-5">
                  <CheckCircle2 size={22} style={{ color: 'var(--success)' }} />
                  <p className="text-[12px] text-center" style={{ color: 'var(--subtext)' }}>
                    Sin eventos próximos
                  </p>
                </div>
              ) : (
                <div className="flex flex-col max-h-[280px] overflow-y-auto">
                  {agendaNotifPending.map(e => (
                    <button
                      key={e.id}
                      onClick={() => { navigate('/agenda?tab=hoy'); setBellOpen(false) }}
                      className="flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      style={{ color: 'var(--text)' }}
                      onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface)'}
                      onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.calendario_color || 'var(--accent)' }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium truncate">{e.titulo}</div>
                        <div className="text-[10.5px] mono" style={{ color: 'var(--subtext)' }}>
                          {e.fecha_inicio?.slice(11, 16)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {bellOpen && isHabitos && (
            <div
              className="absolute right-0 top-full mt-2 w-[260px] rounded-2xl shadow-2xl border z-50 overflow-hidden"
              style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)' }}
            >
              <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
                <Target size={13} style={{ color: 'var(--accent)' }} />
                <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
                  Hábitos pendientes hoy
                </span>
              </div>
              {pendingHabitos.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-5">
                  <CheckCircle2 size={22} style={{ color: 'var(--success)' }} />
                  <p className="text-[12px] text-center" style={{ color: 'var(--subtext)' }}>
                    ¡Todo completado por hoy!
                  </p>
                </div>
              ) : (
                <div className="flex flex-col max-h-[280px] overflow-y-auto">
                  {pendingHabitos.map(h => (
                    <button
                      key={h.id}
                      onClick={() => { navigate('/habitos'); setBellOpen(false) }}
                      className="flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      style={{ color: 'var(--text)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: h.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium truncate">{h.nombre}</div>
                        {h.hora && (
                          <div className="text-[10.5px] mono" style={{ color: 'var(--subtext)' }}>{h.hora}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-px h-6" style={{ background: 'var(--border)' }} />

        <button
          type="button"
          onClick={runCta}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-[13px] font-medium transition-all duration-150 active:scale-[0.985] topbar-cta"
          style={{
            background: 'var(--header-cta-bg, var(--cta-bg))',
            color: 'var(--cta-text)',
            border: '1px solid transparent',
            boxShadow: 'var(--shadow-accent)',
          }}
          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.06)'}
          onMouseLeave={e => e.currentTarget.style.filter = 'none'}
        >
          <Plus size={15} strokeWidth={2} />
          {ctaLabel}
        </button>

        <div className="w-px h-6" style={{ background: 'var(--border)' }} />

        <div className="flex items-center gap-2.5 pl-1">
          <button
            type="button"
            onClick={openFeedback}
            aria-label={t(lang, 'feedbackTitle') || 'Feedback'}
            title={t(lang, 'feedbackTitle') || 'Feedback'}
            className="w-9 h-9 rounded-full grid place-items-center shrink-0 topbar-avatar transition-transform duration-150 hover:scale-[1.06] active:scale-95 cursor-pointer"
            style={{
              background: 'var(--header-avatar-bg, var(--cta-bg))',
              color: 'var(--cta-text)',
              fontFamily: "var(--font-serif)",
              fontStyle: 'italic',
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
            }}
          >
            {initial}
          </button>
          <div className="hidden lg:flex flex-col leading-tight min-w-0">
            <div className="text-[12.5px] font-medium truncate" style={{ color: 'var(--text)' }}>
              {userName || '—'}
            </div>
            <div className="text-[10.5px] truncate" style={{ color: 'var(--subtext)' }}>
              HomeLab · local
            </div>
          </div>
          <IconButton onClick={() => navigate('/settings')} ariaLabel="Ajustes">
            <Settings size={16} />
          </IconButton>
        </div>
      </div>
    </header>
  )
}
