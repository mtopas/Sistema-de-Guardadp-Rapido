import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, CalendarPlus, CornerDownLeft, DollarSign, Flame, Layers, ListPlus,
  Plus, RefreshCw, Search, Settings2, Sparkles, Wallet,
} from 'lucide-react'
import { MODULES } from './modules'
import { Kbd, cx } from '../ui/primitives'
import { useUI } from '../store/ui'
import { useBoveda, hojaTitulo } from '../store/boveda'
import { useFin } from '../store/fin'
import { useAgenda } from '../store/agenda'
import { useHabitos } from '../store/habitos'
import { fmtARS } from '../lib/fin'
import { fmtDate, toISODate } from '../lib/dates'

/** Ctrl+K: navegación, acciones y búsqueda en los cuatro módulos a la vez. */
export function CommandPalette() {
  const open = useUI((s) => s.palette)
  const toggle = useUI((s) => s.togglePalette)
  const toggleTweaks = useUI((s) => s.toggleTweaks)
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const hojas = useBoveda((s) => s.hojas)
  const openCaptura = useBoveda((s) => s.openCaptura)
  const movs = useFin((s) => s.movs)
  const openMov = useFin((s) => s.openMov)
  const setFinTab = useFin((s) => s.setTab)
  const tareas = useAgenda((s) => s.tareas)
  const openEvento = useAgenda((s) => s.openEvento)
  const openTareaModal = useAgenda((s) => s.openTarea)
  const setAgendaTab = useAgenda((s) => s.setTab)
  const habitos = useHabitos((s) => s.habitos)
  const openHabito = useHabitos((s) => s.openModal)

  useEffect(() => {
    if (open) { setQ(''); setI(0); setTimeout(() => inputRef.current?.focus(), 40) }
  }, [open])

  const items = useMemo(() => {
    const t = q.trim().toLowerCase()
    const out = []

    const acciones = [
      { id: 'a-cap', label: 'Capturar en la Bóveda', hint: 'Ctrl+Enter', icon: Plus, run: () => { nav('/'); openCaptura() } },
      { id: 'a-mov', label: 'Nuevo movimiento', hint: 'Finanzas', icon: DollarSign, run: () => { nav('/finanzas'); openMov() } },
      { id: 'a-ev', label: 'Nuevo evento', hint: 'Agenda', icon: CalendarPlus, run: () => { nav('/agenda'); openEvento({ fecha: toISODate() }) } },
      { id: 'a-tarea', label: 'Nueva tarea', hint: 'Agenda', icon: ListPlus, run: () => { nav('/agenda'); setAgendaTab('tareas'); openTareaModal({}) } },
      { id: 'a-hab', label: 'Nuevo hábito', hint: 'Hábitos', icon: Flame, run: () => { nav('/habitos'); openHabito(null) } },
      { id: 'a-tweaks', label: 'Cambiar apariencia', hint: 'Ctrl+M', icon: Sparkles, run: () => toggleTweaks(true) },
      // Las tabs internas también son destinos: escribir "ahorro" o "revisión" tiene que llevar ahí.
      ...[
        ['dashboard', 'Dashboard de Finanzas'], ['anual', 'Resumen anual'], ['fire', 'Plan FIRE'],
        ['ahorro', 'Ahorro e inversiones'], ['datos', 'Datos e histórico'],
      ].map(([id, label]) => ({ id: `f-${id}`, label, hint: 'Finanzas', icon: Wallet, color: '#f59e0b', run: () => { nav('/finanzas'); setFinTab(id) } })),
      ...[
        ['hoy', 'Agenda de hoy'], ['mes', 'Calendario mensual'], ['tareas', 'Tareas'], ['revision', 'Revisión semanal'],
      ].map(([id, label]) => ({ id: `ag-${id}`, label, hint: 'Agenda', icon: CalendarPlus, color: '#3b82f6', run: () => { nav('/agenda'); setAgendaTab(id) } })),
      ...[
        ['hoy', 'Grilla de hábitos'], ['progreso', 'Progreso de hábitos'], ['historial', 'Historial de hábitos'],
      ].map(([id, label]) => ({ id: `hb-${id}`, label, hint: 'Hábitos', icon: Flame, color: '#10b981', run: () => { nav('/habitos'); useHabitos.getState().setTab(id) } })),
      { id: 'a-reload', label: 'Recargar datos de la API', icon: RefreshCw, run: () => window.location.reload() },
      { id: 'a-set', label: 'Ajustes', icon: Settings2, run: () => nav('/ajustes') },
    ]

    const push = (arr, grupo) => { for (const x of arr) out.push({ ...x, grupo }) }

    push(
      MODULES.filter((m) => !t || m.label.toLowerCase().includes(t)).map((m) => ({
        id: `m-${m.id}`, label: m.label, hint: m.hint, icon: m.icon, color: m.accent, run: () => nav(m.path),
      })),
      'Ir a',
    )
    push(acciones.filter((a) => !t || a.label.toLowerCase().includes(t)), 'Acciones')

    if (t.length >= 2) {
      push(
        hojas.filter((h) => hojaTitulo(h).toLowerCase().includes(t)).slice(0, 6).map((h) => ({
          id: `h-${h.id}`, label: hojaTitulo(h), hint: h.categoria_nombre || 'Bóveda', icon: Layers,
          run: () => { nav('/'); useBoveda.getState().select(h.id) },
        })),
        'Bóveda',
      )
      push(
        movs.filter((m) => String(m.descripcion).toLowerCase().includes(t)).slice(0, 5).map((m) => ({
          id: `mv-${m.id}`, label: m.descripcion || 'Movimiento', hint: `${fmtARS(m.monto)} · ${fmtDate(m.fecha)}`,
          icon: DollarSign, run: () => { nav('/finanzas'); openMov({ mov: m }) },
        })),
        'Movimientos',
      )
      push(
        tareas.filter((x) => String(x.titulo || x.nombre).toLowerCase().includes(t)).slice(0, 5).map((x) => ({
          id: `t-${x.id}`, label: x.titulo || x.nombre, hint: x.fecha ? fmtDate(x.fecha) : 'Sin fecha', icon: ListPlus,
          run: () => { nav('/agenda'); setAgendaTab('tareas'); useAgenda.getState().setTareaSel(x.id) },
        })),
        'Tareas',
      )
      push(
        habitos.filter((h) => String(h.nombre).toLowerCase().includes(t)).slice(0, 5).map((h) => ({
          id: `hb-${h.id}`, label: h.nombre, hint: 'Hábito', icon: Flame,
          run: () => { nav('/habitos'); useHabitos.getState().select(h.id) },
        })),
        'Hábitos',
      )
    }
    return out
  }, [q, hojas, movs, tareas, habitos, nav, openCaptura, openMov, openEvento, openTareaModal, openHabito, setAgendaTab, setFinTab, toggleTweaks])

  useEffect(() => { setI(0) }, [q])

  useEffect(() => {
    if (!open) return
    const h = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setI((v) => Math.min(items.length - 1, v + 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setI((v) => Math.max(0, v - 1)) }
      else if (e.key === 'Enter') {
        e.preventDefault()
        const it = items[i]
        if (it) { toggle(false); it.run() }
      } else if (e.key === 'Escape') { e.preventDefault(); toggle(false) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, items, i, toggle])

  useEffect(() => {
    listRef.current?.querySelector('[data-on="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [i])

  if (!open) return null

  let lastGrupo = null
  return createPortal(
    <div className="overlay" style={{ alignItems: 'flex-start', paddingTop: '11vh' }} onMouseDown={(e) => { if (e.target === e.currentTarget) toggle(false) }}>
      <div className="modal" style={{ maxWidth: 620 }} role="dialog" aria-modal="true" aria-label="Paleta de comandos">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search size={17} style={{ color: 'var(--accent)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscá una hoja, un movimiento, una tarea… o escribí una acción"
            className="flex-1 border-0 bg-transparent text-[14px] outline-none placeholder:text-txt-mute focus-visible:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={listRef} className="scroll max-h-[54vh] p-1.5">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12.5px] text-txt-sub">Sin resultados para “{q}”.</p>
          ) : (
            items.map((it, idx) => {
              const head = it.grupo !== lastGrupo ? it.grupo : null
              lastGrupo = it.grupo
              const on = idx === i
              return (
                <div key={it.id}>
                  {head && <div className="label px-2.5 pb-1 pt-2.5">{head}</div>}
                  <button
                    data-on={on}
                    onMouseEnter={() => setI(idx)}
                    onClick={() => { toggle(false); it.run() }}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors duration-100',
                      on && 'bg-elev',
                    )}
                    style={on ? { boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent)' } : undefined}
                  >
                    <it.icon size={15} style={{ color: it.color || (on ? 'var(--accent)' : 'var(--subtext)') }} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate1 text-[13px]">{it.label}</span>
                    {it.hint && <span className="shrink-0 truncate1 text-[11px] text-txt-mute">{it.hint}</span>}
                    {on ? <CornerDownLeft size={13} className="shrink-0 text-txt-sub" /> : <ArrowRight size={13} className="shrink-0 opacity-0" />}
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[10.5px] text-txt-mute">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navegar</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> ejecutar</span>
          <span className="ml-auto">{items.length} resultado{items.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
