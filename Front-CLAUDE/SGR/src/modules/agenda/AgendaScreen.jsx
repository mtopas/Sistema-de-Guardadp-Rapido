import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Sun, CalendarRange, Calendar, ListChecks, ClipboardList, ChevronLeft, ChevronRight, Plus, GraduationCap, Pencil, Eye, EyeOff,
  CheckSquare, Sprout, Clock, Download, AlertTriangle, CalendarPlus, GripVertical, DollarSign,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAgenda, eventosDelDia, weekRange } from '../../store/agenda'
import { useHabitos } from '../../store/habitos'
import { Panel, Tabs, Check, Empty, Loader } from '../../components/ui'
import TimeGrid, { useAgendaData, dayItems } from './TimeGrid'
import { CalendarioModal, FacultadModal } from './Modals'
import TareasView, { TareasRight } from './Tareas'
import RevisionView, { RevisionRight } from './Revision'
import { buildRegMap, isScheduled, regOf } from '../../lib/habitos'
import { apiUrl } from '../../lib/api'
import {
  toISODate, parseDate, addDays, addMonths, startOfWeek, sameDay, MESES, DIAS_LUN, fmtDateLong, fmtTime, hasTime, fmtDate,
} from '../../lib/dates'

const TABS = [
  { id: 'hoy', label: 'Hoy', icon: Sun },
  { id: 'semana', label: 'Semana', icon: CalendarRange },
  { id: 'mes', label: 'Mes', icon: Calendar },
  { id: 'tareas', label: 'Tareas', icon: ListChecks },
  { id: 'revision', label: 'Revisión', icon: ClipboardList },
]

export default function AgendaScreen() {
  const { tab, setTab, dia, setDia, refMes, setRefMes, ensureRange, loaded, openEvento, openTarea, editarTarea } = useAgenda()
  const [calModal, setCalModal] = useState(null)
  const [facu, setFacu] = useState(false)
  const diaD = parseDate(dia)
  const refD = parseDate(refMes)

  // Rango de eventos necesario para la vista actual
  useEffect(() => {
    const base = tab === 'mes' ? refD : diaD
    const desde = toISODate(addDays(startOfWeek(new Date(base.getFullYear(), base.getMonth(), 1)), -7))
    const hasta = toISODate(addDays(new Date(base.getFullYear(), base.getMonth() + 1, 0), 14))
    ensureRange(desde, hasta)
  }, [tab, dia, refMes]) // eslint-disable-line react-hooks/exhaustive-deps

  const move = (n) => {
    if (tab === 'hoy') setDia(toISODate(addDays(diaD, n)))
    else if (tab === 'semana') setDia(toISODate(addDays(diaD, n * 7)))
    else if (tab === 'mes') setRefMes(toISODate(addMonths(refD, n)))
  }
  const goToday = () => { setDia(toISODate()); setRefMes(toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))) }

  const label = tab === 'hoy' ? fmtDateLong(dia) : tab === 'semana' ? (() => { const [a, b] = weekRange(diaD); return `${fmtDate(toISODate(a))} – ${fmtDate(toISODate(b))}` })() : `${MESES[refD.getMonth()]} ${refD.getFullYear()}`

  const onItem = (it) => {
    if (it.kind === 'evento') openEvento({ evento: it.raw })
    else if (it.kind === 'tarea') openTarea({ tarea: it.raw })
  }
  const onDropTask = (id, iso, time) => editarTarea(id, { fecha_opcional: iso, hora_bloque: time, ...(useAgenda.getState().tareas.find((t) => t.id === id)?.duracion_estimada ? {} : { duracion_estimada: 30 }) })

  const showNav = ['hoy', 'semana', 'mes'].includes(tab)

  return (
    <div className="mod">
      <aside className="mod-col">
        <MiniCal />
        {(tab === 'hoy' || tab === 'semana') && <PendientesPanel />}
        {(tab === 'hoy' || tab === 'semana') && <HabitosHoy />}
        <CalendariosPanel onEdit={setCalModal} onFacu={() => setFacu(true)} />
      </aside>

      <section className="mod-center">
        <div className="mod-bar">
          <Tabs id="agenda" value={tab} onChange={setTab} tabs={TABS} />
          <span className="grow" />
          {showNav && (
            <div className="row gap4 glass" style={{ padding: 4, borderRadius: 14 }}>
              <button className="iconbtn sm" onClick={() => move(-1)}><ChevronLeft size={16} /></button>
              <AnimatePresence mode="wait">
                <motion.span key={label} className="display" style={{ minWidth: 170, textAlign: 'center', fontSize: 12.5, fontWeight: 600, textTransform: 'capitalize' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>{label}</motion.span>
              </AnimatePresence>
              <button className="iconbtn sm" onClick={() => move(1)}><ChevronRight size={16} /></button>
              <button className="btn xs" onClick={goToday}>Hoy</button>
            </div>
          )}
          <button className="btn sm" onClick={() => openTarea({ fecha: tab === 'hoy' ? dia : toISODate() })}><CheckSquare size={14} /> Tarea</button>
          <button className="btn primary sm" onClick={() => openEvento({ fecha: tab === 'hoy' || tab === 'semana' ? dia : toISODate() })}><Plus size={15} /> Evento</button>
        </div>
        {!loaded ? (
          <div className="glass center" style={{ flex: 1 }}><Loader label="Cargando agenda" /></div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={tab} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              {tab === 'hoy' && <TimeGrid days={[diaD]} onSlot={(iso, time) => openEvento({ fecha: iso, hora: time })} onItem={onItem} onDropTask={onDropTask} />}
              {tab === 'semana' && <TimeGrid days={Array.from({ length: 7 }, (_, i) => addDays(weekRange(diaD)[0], i))} onSlot={(iso, time) => openEvento({ fecha: iso, hora: time })} onItem={onItem} onDropTask={onDropTask} />}
              {tab === 'mes' && <MesView refD={refD} onMove={move} />}
              {tab === 'tareas' && <TareasView />}
              {tab === 'revision' && <RevisionView />}
            </motion.div>
          </AnimatePresence>
        )}
      </section>

      <aside className="mod-col mod-right">
        {tab === 'tareas' ? <TareasRight /> : tab === 'revision' ? <RevisionRight /> : <DiaPanel />}
      </aside>
      <CalendarioModal data={calModal} onClose={() => setCalModal(null)} />
      <FacultadModal open={facu} onClose={() => setFacu(false)} />
    </div>
  )
}

function MiniCal() {
  const { dia, setDia, refMes, setRefMes, tab, setTab, eventos, calendarios } = useAgenda()
  const [ref, setRef] = useState(() => parseDate(refMes))
  useEffect(() => { setRef(parseDate(refMes)) }, [refMes])
  const start = startOfWeek(new Date(ref.getFullYear(), ref.getMonth(), 1))
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const conEventos = useMemo(() => {
    const s = new Set()
    for (const e of eventos) s.add(e.fecha_inicio.slice(0, 10))
    return s
  }, [eventos])
  const sel = parseDate(dia)
  return (
    <Panel edge={false}>
      <div className="row" style={{ marginBottom: 8 }}>
        <b className="display grow" style={{ fontSize: 13 }}>{MESES[ref.getMonth()]} {ref.getFullYear()}</b>
        <button className="iconbtn sm" onClick={() => setRef(addMonths(ref, -1))}><ChevronLeft size={14} /></button>
        <button className="iconbtn sm" onClick={() => setRef(addMonths(ref, 1))}><ChevronRight size={14} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
        {DIAS_LUN.map((d) => <div key={d} className="tiny dim">{d[0]}</div>)}
        {days.map((d) => {
          const iso = toISODate(d)
          const inMonth = d.getMonth() === ref.getMonth()
          const isSel = sameDay(d, sel)
          const today = sameDay(d, new Date())
          return (
            <motion.button
              key={iso}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => { setDia(iso); setRefMes(toISODate(new Date(d.getFullYear(), d.getMonth(), 1))); if (tab === 'tareas' || tab === 'revision') setTab('hoy') }}
              style={{
                border: 0, cursor: 'pointer', height: 28, borderRadius: 9, fontSize: 12, position: 'relative', fontFamily: 'var(--font-mono)',
                color: isSel ? '#fff' : inMonth ? 'var(--text)' : 'var(--dim)',
                background: isSel ? 'linear-gradient(135deg, var(--a1), var(--a2))' : today ? 'rgba(var(--a1-rgb), .18)' : 'transparent',
                boxShadow: isSel ? '0 0 14px -3px var(--a2)' : today ? 'inset 0 0 0 1px var(--a1)' : 'none',
              }}
            >
              {d.getDate()}
              {conEventos.has(iso) && !isSel && <span style={{ position: 'absolute', bottom: 3, left: '50%', width: 4, height: 4, marginLeft: -2, borderRadius: '50%', background: 'var(--a3)', boxShadow: '0 0 6px var(--a3)' }} />}
            </motion.button>
          )
        })}
      </div>
    </Panel>
  )
}

const FIN_RE = /pag(ar|o)|cuota|venc|factur|tarjeta|impuesto|expensa|alquiler|abonar|deuda/i

function PendientesPanel() {
  const { tareas, toggleTarea, crearTarea, openTarea, listas } = useAgenda()
  const [txt, setTxt] = useState('')
  const nav = useNavigate()
  const hoy = toISODate()
  const lim = toISODate(addDays(new Date(), 15))
  const list = tareas
    .filter((t) => !t.completada && (!t.fecha_opcional || t.fecha_opcional <= lim))
    .sort((a, b) => (a.fecha_opcional || '9999').localeCompare(b.fecha_opcional || '9999'))
    .slice(0, 30)
  return (
    <Panel title="Pendientes" icon={CheckSquare} actions={<span className="chip">{list.length}</span>}>
      <form onSubmit={(e) => { e.preventDefault(); if (txt.trim()) { crearTarea({ titulo: txt.trim(), fecha_opcional: hoy, lista_id: listas[0]?.id ?? null }); setTxt('') } }}>
        <input className="input sm" placeholder="+ Nueva tarea para hoy…" value={txt} onChange={(e) => setTxt(e.target.value)} />
      </form>
      <div className="tiny dim" style={{ margin: '6px 0' }}>Arrastrá una tarea a la grilla para bloquear tiempo.</div>
      <div className="list">
        <AnimatePresence initial={false}>
          {list.map((t) => {
            const vencida = t.fecha_opcional && t.fecha_opcional < hoy
            const esHoy = t.fecha_opcional === hoy
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30, height: 0 }}
                className={`li ${t._pending ? 'pending' : ''}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/sgr-tarea', String(t.id))}
                onClick={() => openTarea({ tarea: t })}
                style={{ cursor: 'grab' }}
              >
                <GripVertical size={12} className="dim" />
                <Check on={t.completada} onClick={() => toggleTarea(t)} color={t.lista_color} size={18} />
                <span className="grow ellipsis small">{t.titulo}</span>
                {FIN_RE.test(t.titulo) && <button className="iconbtn sm" title="Ir a Finanzas" onClick={(e) => { e.stopPropagation(); nav('/finanzas') }}><DollarSign size={12} style={{ color: 'var(--amber)' }} /></button>}
                {t.hora_bloque && <Clock size={11} style={{ color: 'var(--a3)' }} />}
                <span className="tiny mono" style={{ color: vencida ? 'var(--red)' : esHoy ? 'var(--amber)' : 'var(--dim)' }}>
                  {t.fecha_opcional ? (esHoy ? 'hoy' : fmtDate(t.fecha_opcional)) : '—'}
                </span>
              </motion.div>
            )
          })}
        </AnimatePresence>
        {list.length === 0 && <div className="small dim">Nada pendiente ✦</div>}
      </div>
    </Panel>
  )
}

function HabitosHoy() {
  const dia = useAgenda((s) => s.dia)
  const { habitos, registros, registrar, desmarcar } = useHabitos()
  const d = parseDate(dia)
  const map = useMemo(() => buildRegMap(registros), [registros])
  const list = habitos.filter((h) => h.activo !== false && !h.hora && isScheduled(h, d))
  if (!list.length) return null
  const futuro = dia > toISODate()
  return (
    <Panel title="Hábitos del día" icon={Sprout}>
      <div className="list">
        {list.map((h) => {
          const r = regOf(map, h.id, dia)
          return (
            <div key={h.id} className="li" style={{ cursor: futuro ? 'default' : 'pointer' }} onClick={() => !futuro && (r ? desmarcar(h.id, dia) : registrar(h.id, dia, 1))}>
              <Check on={r?.valor >= 1} half={r?.valor === 0.5} color={h.color} size={18} onClick={() => !futuro && (r ? desmarcar(h.id, dia) : registrar(h.id, dia, 1))} />
              <span className={`grow ellipsis small ${r?.valor >= 1 ? 'strike' : ''}`}>{h.nombre}</span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function CalendariosPanel({ onEdit, onFacu }) {
  const { calendarios, editarCalendario, horario } = useAgenda()
  return (
    <Panel title="Calendarios" icon={Calendar} actions={<button className="iconbtn sm" onClick={() => onEdit({})}><Plus size={15} /></button>}>
      <div className="list">
        {calendarios.map((c) => (
          <div key={c.id} className="li" onClick={() => editarCalendario(c.id, { activo: !(c.activo !== false) })}>
            <motion.span className="dot" animate={{ opacity: c.activo !== false ? 1 : 0.25, scale: c.activo !== false ? 1 : 0.7 }} style={{ background: c.color, color: c.color, width: 11, height: 11 }} />
            <span className={`grow ellipsis small ${c.activo === false ? 'dim' : ''}`}>{c.nombre}</span>
            <span className="li-actions">
              <button className="iconbtn sm" onClick={(e) => { e.stopPropagation(); onEdit({ cal: c }) }}><Pencil size={12} /></button>
            </span>
            {c.activo !== false ? <Eye size={12} className="dim" /> : <EyeOff size={12} className="dim" />}
          </div>
        ))}
        {calendarios.length === 0 && <div className="small dim">Creá un calendario para organizar eventos.</div>}
      </div>
      <div className="hr" />
      <button className="btn sm" style={{ width: '100%' }} onClick={onFacu}><GraduationCap size={14} /> Facultad {horario.length ? `(${horario.length})` : ''}</button>
    </Panel>
  )
}

function MesView({ refD, onMove }) {
  const data = useAgendaData()
  const { dia, setDia, openEvento, openTarea, setTab } = useAgenda()
  const first = new Date(refD.getFullYear(), refD.getMonth(), 1)
  const start = startOfWeek(first)
  const last = new Date(refD.getFullYear(), refD.getMonth() + 1, 0)
  const weeks = Math.ceil((((first.getDay() + 6) % 7) + last.getDate()) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
  const sel = parseDate(dia)
  const [wheelLock, setWheelLock] = useState(false)

  return (
    <div
      className="glass"
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 22, overflow: 'hidden' }}
      onWheel={(e) => {
        if (wheelLock || Math.abs(e.deltaY) < 30) return
        setWheelLock(true)
        onMove(e.deltaY > 0 ? 1 : -1)
        setTimeout(() => setWheelLock(false), 450)
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--line)' }}>
        {DIAS_LUN.map((d) => <div key={d} className="tiny upper dim" style={{ padding: '8px 10px' }}>{d}</div>)}
      </div>
      <motion.div
        key={`${refD.getFullYear()}-${refD.getMonth()}`}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: `repeat(${weeks}, minmax(90px, 1fr))`, minHeight: 0 }}
      >
        {days.map((d, i) => {
          const iso = toISODate(d)
          const inMonth = d.getMonth() === refD.getMonth()
          const today = sameDay(d, new Date())
          const isSel = sameDay(d, sel)
          const { timed, allDay } = dayItems(d, data)
          const tareas = data.tareas.filter((t) => t.fecha_opcional === iso && !t.hora_bloque)
          const chips = [...allDay, ...timed.filter((t) => t.kind !== 'habito'), ...tareas.map((t) => ({ kind: 'tarea', id: `t${t.id}`, title: t.titulo, color: t.lista_color || '#4d7cff', raw: t, done: t.completada }))]
          return (
            <motion.div
              key={iso}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.008 }}
              onClick={() => setDia(iso)}
              onDoubleClick={() => openEvento({ fecha: iso })}
              style={{
                borderRight: (i + 1) % 7 ? '1px solid var(--line)' : 0, borderBottom: '1px solid var(--line)', padding: 6, minWidth: 0, overflow: 'hidden', cursor: 'pointer',
                background: isSel ? 'rgba(var(--a1-rgb), .12)' : today ? 'rgba(var(--a2-rgb), .06)' : undefined, opacity: inMonth ? 1 : 0.4, transition: 'background .2s',
                boxShadow: isSel ? 'inset 0 0 0 1px rgba(var(--a1-rgb), .6)' : undefined,
              }}
            >
              <div className="row" style={{ marginBottom: 4 }}>
                <span className="mono small center" style={{ width: 24, height: 24, borderRadius: 8, fontWeight: 700, ...(today ? { background: 'linear-gradient(135deg, var(--a1), var(--a2))', color: '#fff', boxShadow: '0 0 12px -2px var(--a2)' } : {}) }}>{d.getDate()}</span>
                <span className="grow" />
                {chips.length > 0 && <span className="tiny dim">{chips.length}</span>}
              </div>
              <div className="col" style={{ gap: 2 }}>
                {chips.slice(0, 3).map((c) => (
                  <div
                    key={c.id}
                    className={`tiny ellipsis ${c.done ? 'strike' : ''}`}
                    onClick={(e) => { e.stopPropagation(); c.kind === 'evento' ? openEvento({ evento: c.raw }) : openTarea({ tarea: c.raw }) }}
                    style={{
                      padding: '2px 6px', borderRadius: 6, fontWeight: 600, letterSpacing: 0,
                      ...(c.kind === 'evento' ? { background: `${c.color}40`, borderLeft: `2px solid ${c.color}` } : { border: `1px dashed ${c.color}99` }),
                    }}
                  >
                    {c.start != null && c.kind === 'evento' ? <span className="mono dim">{fmtTime(c.raw.fecha_inicio)} </span> : null}{c.title}
                  </div>
                ))}
                {chips.length > 3 && <div className="tiny dim" onClick={(e) => { e.stopPropagation(); setDia(iso); setTab('hoy') }}>+{chips.length - 3} más</div>}
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}

function DiaPanel() {
  const { dia, eventos, calendarios, tareas, openEvento, openTarea, toggleTarea, setTab, tab } = useAgenda()
  const d = parseDate(dia)
  const evs = eventosDelDia(eventos, calendarios, dia)
  const tds = tareas.filter((t) => t.fecha_opcional === dia)
  const proximos = useMemo(() => {
    const hoy = toISODate()
    return eventos.filter((e) => e.fecha_inicio.slice(0, 10) >= hoy).slice(0, 6)
  }, [eventos])
  const [a, b] = weekRange(d)
  return (
    <>
      <Panel title={fmtDateLong(dia)} icon={Calendar} actions={<button className="iconbtn sm" onClick={() => openEvento({ fecha: dia })}><CalendarPlus size={15} /></button>}>
        {evs.length === 0 && tds.length === 0 && <div className="small dim">Sin eventos ni tareas.</div>}
        <div className="list">
          {evs.map((e) => (
            <motion.div key={e.id} className="li" onClick={() => openEvento({ evento: e })} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: e.calendario_color || 'var(--a1)', boxShadow: `0 0 8px ${e.calendario_color || 'var(--a1)'}` }} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small ellipsis" style={{ fontWeight: 600 }}>{e.titulo}</div>
                <div className="tiny dim">{!e.todo_el_dia && hasTime(e.fecha_inicio) ? `${fmtTime(e.fecha_inicio)}${e.fecha_fin && hasTime(e.fecha_fin) ? ` – ${fmtTime(e.fecha_fin)}` : ''}` : 'Todo el día'} · {e.calendario_nombre || 'sin calendario'}</div>
              </div>
            </motion.div>
          ))}
          {tds.map((t) => (
            <div key={t.id} className="li" onClick={() => openTarea({ tarea: t })}>
              <Check on={t.completada} onClick={() => toggleTarea(t)} color={t.lista_color} size={18} />
              <span className={`grow ellipsis small ${t.completada ? 'strike' : ''}`}>{t.titulo}</span>
              {t.hora_bloque && <span className="tiny mono" style={{ color: 'var(--a3)' }}>{t.hora_bloque}</span>}
            </div>
          ))}
        </div>
        {tab === 'mes' && <button className="btn xs" style={{ marginTop: 8 }} onClick={() => setTab('hoy')}>Ver día completo</button>}
      </Panel>
      <Panel title="Próximos" icon={Clock}>
        {proximos.length === 0 ? <div className="small dim">Nada agendado.</div> : (
          <div className="list">
            {proximos.map((e) => (
              <div key={e.id} className="li" onClick={() => openEvento({ evento: e })}>
                <span className="dot" style={{ background: e.calendario_color || 'var(--a1)', color: e.calendario_color || 'var(--a1)' }} />
                <span className="grow ellipsis small">{e.titulo}</span>
                <span className="tiny mono dim">{fmtDate(e.fecha_inicio)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Exportar" icon={Download}>
        <a className="btn sm" style={{ width: '100%' }} href={apiUrl('/agenda/export.ics', { desde: toISODate(a), hasta: toISODate(b) })} download>
          <Download size={14} /> Semana en .ics
        </a>
      </Panel>
    </>
  )
}

