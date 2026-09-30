import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, FileText, Link2, Image, Receipt, CalendarDays, CheckSquare, Sprout, Plus, ArrowRight, Sparkles, Command } from 'lucide-react'
import { useUI } from '../store/ui'
import { useBoveda, hojaTitulo } from '../store/boveda'
import { useFin } from '../store/fin'
import { useAgenda } from '../store/agenda'
import { useHabitos } from '../store/habitos'
import { MODULES, SETTINGS_MODULE } from './modules'
import { fmtARS, fmtMoney } from '../lib/fin'
import { fmtDate } from '../lib/dates'
import { useDebounced, Highlight } from '../components/ui'

export default function CommandPalette() {
  const open = useUI((s) => s.palette)
  const setOpen = useUI((s) => s.setPalette)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const [remote, setRemote] = useState({ eventos: [], tareas: [] })
  const dq = useDebounced(q, 220)
  const nav = useNavigate()
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const hojas = useBoveda((s) => s.hojas)
  const selectHoja = useBoveda((s) => s.select)
  const movs = useFin((s) => s.movs)
  const openMov = useFin((s) => s.openMov)
  const buscarAgenda = useAgenda((s) => s.buscar)
  const openEvento = useAgenda((s) => s.openEvento)
  const openTarea = useAgenda((s) => s.openTarea)
  const setAgendaTab = useAgenda((s) => s.setTab)
  const setDia = useAgenda((s) => s.setDia)
  const habitos = useHabitos((s) => s.habitos)
  const openHabito = useHabitos((s) => s.openModal)
  const selectHabito = useHabitos((s) => s.select)
  const openCapture = useUI((s) => s.openCapture)

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!dq || dq.length < 2) return setRemote({ eventos: [], tareas: [] })
    let alive = true
    buscarAgenda(dq).then((r) => alive && setRemote(r || { eventos: [], tareas: [] })).catch(() => {})
    return () => { alive = false }
  }, [dq, buscarAgenda])

  const close = () => setOpen(false)

  const items = useMemo(() => {
    const out = []
    const ql = dq.trim().toLowerCase()
    const cmds = [
      { sec: 'Acciones', icon: Plus, label: 'Nueva nota en la Bóveda', run: () => openCapture({ tab: 'nota' }), color: '#9d4bff' },
      { sec: 'Acciones', icon: Receipt, label: 'Nuevo movimiento', run: () => openMov({}), color: '#ffb800' },
      { sec: 'Acciones', icon: CalendarDays, label: 'Nuevo evento', run: () => openEvento({}), color: '#00c2ff' },
      { sec: 'Acciones', icon: CheckSquare, label: 'Nueva tarea', run: () => openTarea({}), color: '#4d7cff' },
      { sec: 'Acciones', icon: Sprout, label: 'Nuevo hábito', run: () => { nav('/habitos'); openHabito(null) }, color: '#b4ff39' },
      { sec: 'Acciones', icon: Sparkles, label: 'Preguntarle a Jarvis', run: () => nav('/jarvis'), color: '#00f0ff' },
      ...[...MODULES, SETTINGS_MODULE].map((m) => ({ sec: 'Ir a', icon: m.icon, label: m.label, hint: m.sub, run: () => nav(m.path), color: m.colors[0] })),
    ]
    out.push(...cmds.filter((c) => !ql || c.label.toLowerCase().includes(ql)))
    if (ql.length >= 2) {
      hojas
        .filter((h) => (h.contenido || '').toLowerCase().includes(ql) || (h.apuntes || '').toLowerCase().includes(ql) || (h.link_preview?.title || '').toLowerCase().includes(ql))
        .slice(0, 6)
        .forEach((h) =>
          out.push({
            sec: 'Bóveda',
            icon: h.tipo === 'link' ? Link2 : h.tipo === 'foto' ? Image : FileText,
            label: hojaTitulo(h),
            hint: h.categoria_nombre,
            color: h.color || '#9d4bff',
            run: () => { selectHoja(h.id); nav('/') },
          }),
        )
      movs
        .filter((m) => (m.descripcion || '').toLowerCase().includes(ql) || (m.categoria_nombre || '').toLowerCase().includes(ql))
        .slice(0, 5)
        .forEach((m) =>
          out.push({
            sec: 'Finanzas',
            icon: Receipt,
            label: m.descripcion || m.categoria_nombre || 'Movimiento',
            hint: `${fmtDate(m.fecha)} · ${m.moneda === 'USD' ? fmtMoney(m.monto, 'USD') : fmtARS(m.monto)}`,
            color: m.tipo === 'income' ? '#2effa8' : '#ff6b2c',
            run: () => openMov({ mov: m }),
          }),
        )
      ;(remote.eventos || []).slice(0, 5).forEach((e) =>
        out.push({
          sec: 'Agenda',
          icon: CalendarDays,
          label: e.titulo,
          hint: fmtDate(e.fecha_inicio, { day: '2-digit', month: 'short', year: 'numeric' }),
          color: e.calendario_color || '#00c2ff',
          run: () => { setDia(e.fecha_inicio.slice(0, 10)); setAgendaTab('hoy'); nav('/agenda'); openEvento({ evento: e }) },
        }),
      )
      ;(remote.tareas || []).slice(0, 5).forEach((t) =>
        out.push({
          sec: 'Agenda',
          icon: CheckSquare,
          label: t.titulo,
          hint: t.fecha_opcional ? fmtDate(t.fecha_opcional) : 'Sin fecha',
          color: t.lista_color || '#4d7cff',
          run: () => { nav('/agenda'); openTarea({ tarea: t }) },
        }),
      )
      habitos
        .filter((h) => h.nombre.toLowerCase().includes(ql))
        .slice(0, 4)
        .forEach((h) => out.push({ sec: 'Hábitos', icon: Sprout, label: h.nombre, hint: h.categoria, color: h.color, run: () => { selectHabito(h.id); nav('/habitos') } }))
    }
    return out
  }, [dq, hojas, movs, remote, habitos]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setIdx(0), [dq])
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
    if (e.key === 'Enter' && items[idx]) { e.preventDefault(); close(); items[idx].run() }
    if (e.key === 'Escape') close()
  }

  let lastSec = null
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" style={{ alignItems: 'start', paddingTop: '12vh' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none', transitionEnd: { display: 'none' } }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <motion.div
            className="glass strong neon-edge lit"
            style={{ width: 'min(640px, 100%)', borderRadius: 22, overflow: 'hidden' }}
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div className="row" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
              <Command size={18} style={{ color: 'var(--a1)' }} />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Buscá notas, movimientos, eventos, hábitos… o escribí un comando"
                style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', fontSize: 16 }}
              />
              <kbd>Esc</kbd>
            </div>
            <div ref={listRef} style={{ maxHeight: '55vh', overflowY: 'auto', padding: 8 }}>
              {items.length === 0 && (
                <div className="empty">
                  <Search size={22} />
                  Sin resultados para “{dq}”
                </div>
              )}
              {items.map((it, i) => {
                const header = it.sec !== lastSec
                lastSec = it.sec
                return (
                  <div key={i}>
                    {header && <div className="pop-sec">{it.sec}</div>}
                    <motion.div
                      data-i={i}
                      className={`pop-item ${i === idx ? 'hl' : ''}`}
                      onMouseEnter={() => setIdx(i)}
                      onClick={() => { close(); it.run() }}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i, 12) * 0.015 }}
                    >
                      <span style={{ width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', background: `${it.color}22`, color: it.color, boxShadow: i === idx ? `0 0 14px -2px ${it.color}` : 'none', flexShrink: 0 }}>
                        <it.icon size={15} />
                      </span>
                      <span className="grow ellipsis"><Highlight text={it.label} q={dq} /></span>
                      {it.hint && <span className="small dim ellipsis" style={{ maxWidth: 200 }}>{it.hint}</span>}
                      {i === idx && <ArrowRight size={14} style={{ color: 'var(--a1)' }} />}
                    </motion.div>
                  </div>
                )
              })}
            </div>
            <div className="row tiny dim" style={{ padding: '8px 16px', borderTop: '1px solid var(--line)', gap: 14 }}>
              <span><kbd>↑↓</kbd> navegar</span>
              <span><kbd>Enter</kbd> abrir</span>
              <span className="grow" />
              <span>SGR · NEXUS</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
