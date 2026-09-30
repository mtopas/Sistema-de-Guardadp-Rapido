import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Sprout, GraduationCap, CheckSquare, Check } from 'lucide-react'
import { useAgenda, eventosDelDia, clasesDelDia } from '../../store/agenda'
import { useHabitos } from '../../store/habitos'
import { buildRegMap, isScheduled, regOf } from '../../lib/habitos'
import { toISODate, sameDay, timeToMin, minToTime, hasTime, DIAS_CORTO, pad } from '../../lib/dates'

export const HOUR_H = 58

export function dayItems(date, { eventos, calendarios, tareas, horario, habitos, regMap }) {
  const iso = toISODate(date)
  const out = []
  const allDay = []
  for (const e of eventosDelDia(eventos, calendarios, iso)) {
    const timed = !e.todo_el_dia && hasTime(e.fecha_inicio)
    if (!timed) { allDay.push({ kind: 'evento', id: `e${e.id}`, title: e.titulo, color: e.calendario_color || '#00c2ff', raw: e }); continue }
    const sameStart = e.fecha_inicio.slice(0, 10) === iso
    const start = sameStart ? timeToMin(e.fecha_inicio.slice(11, 16)) : 0
    let end
    if (e.fecha_fin && hasTime(e.fecha_fin)) end = e.fecha_fin.slice(0, 10) === iso ? timeToMin(e.fecha_fin.slice(11, 16)) : 24 * 60
    else end = start + 60
    out.push({ kind: 'evento', id: `e${e.id}`, start, end: Math.max(end, start + 20), title: e.titulo, color: e.calendario_color || '#00c2ff', raw: e })
  }
  for (const t of tareas) {
    if (t.fecha_opcional !== iso) continue
    if (t.hora_bloque) {
      const start = timeToMin(t.hora_bloque)
      out.push({ kind: 'tarea', id: `t${t.id}`, start, end: start + Math.max(15, Number(t.duracion_estimada) || 30), title: t.titulo, color: t.lista_color || '#4d7cff', raw: t, done: t.completada })
    }
  }
  for (const h of habitos) {
    if (!h.hora || h.activo === false || !isScheduled(h, date)) continue
    const start = timeToMin(h.hora)
    const r = regOf(regMap, h.id, iso)
    out.push({ kind: 'habito', id: `h${h.id}`, start, end: start + 30, title: h.nombre, color: h.color || '#b4ff39', raw: h, done: r?.valor >= 1, half: r?.valor === 0.5 })
  }
  const clases = clasesDelDia(horario, date).map((c) => ({ kind: 'clase', id: `c${c.id}`, start: timeToMin(c.hora_inicio), end: timeToMin(c.hora_fin), title: c.materia, sub: c.descripcion, color: c.color || '#ffb800', raw: c }))
  return { timed: layoutCols(out), allDay, clases }
}

function layoutCols(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const groups = []
  let cur = []
  let curEnd = -1
  for (const it of sorted) {
    if (it.start >= curEnd && cur.length) { groups.push(cur); cur = [] }
    cur.push(it)
    curEnd = Math.max(curEnd, it.end)
  }
  if (cur.length) groups.push(cur)
  for (const g of groups) {
    const cols = []
    for (const it of g) {
      let c = cols.findIndex((end) => end <= it.start)
      if (c === -1) { c = cols.length; cols.push(it.end) } else cols[c] = it.end
      it.col = c
    }
    g.forEach((it) => (it.cols = cols.length))
  }
  return sorted
}

export function useAgendaData() {
  const eventos = useAgenda((s) => s.eventos)
  const calendarios = useAgenda((s) => s.calendarios)
  const tareas = useAgenda((s) => s.tareas)
  const horario = useAgenda((s) => s.horario)
  const habitos = useHabitos((s) => s.habitos)
  const registros = useHabitos((s) => s.registros)
  const regMap = useMemo(() => buildRegMap(registros), [registros])
  return { eventos, calendarios, tareas, horario, habitos, regMap }
}

export default function TimeGrid({ days, onSlot, onItem, onDropTask, compactHeader = false }) {
  const data = useAgendaData()
  const toggleTarea = useAgenda((s) => s.toggleTarea)
  const registrar = useHabitos((s) => s.registrar)
  const desmarcar = useHabitos((s) => s.desmarcar)
  const scroller = useRef(null)
  const [now, setNow] = useState(new Date())
  const [dropHint, setDropHint] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const cols = useMemo(() => days.map((d) => ({ d, ...dayItems(d, data) })), [days, data])
  const minStart = Math.min(6 * 60, ...cols.flatMap((c) => [...c.timed, ...c.clases].map((i) => i.start)))
  const h0 = Math.floor(minStart / 60)
  const hours = Array.from({ length: 24 - h0 }, (_, i) => h0 + i)
  const top = (min) => ((min - h0 * 60) / 60) * HOUR_H

  useEffect(() => {
    if (!scroller.current) return
    const target = days.some((d) => sameDay(d, new Date())) ? top(now.getHours() * 60 + now.getMinutes()) - 160 : top(8 * 60)
    scroller.current.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [days.map((d) => toISODate(d)).join()]) // eslint-disable-line react-hooks/exhaustive-deps

  const minFromY = (e, el) => {
    const r = el.getBoundingClientRect()
    const y = e.clientY - r.top
    const m = h0 * 60 + (y / HOUR_H) * 60
    return Math.max(0, Math.min(23 * 60 + 45, Math.round(m / 15) * 15))
  }

  const hasAllDay = cols.some((c) => c.allDay.length)

  return (
    <div className="glass timegrid" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 22, overflow: 'hidden' }}>
      {(days.length > 1 || hasAllDay) && (
        <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${days.length}, 1fr)`, borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <div />
          {cols.map(({ d, allDay }) => {
            const today = sameDay(d, new Date())
            return (
              <div key={toISODate(d)} style={{ padding: '8px 6px', borderLeft: '1px solid var(--line)', minWidth: 0 }}>
                {days.length > 1 && !compactHeader && (
                  <div className="row gap6" style={{ justifyContent: 'center', marginBottom: allDay.length ? 6 : 0 }}>
                    <span className="tiny upper dim">{DIAS_CORTO[d.getDay()]}</span>
                    <span className="display center" style={{ fontWeight: 700, width: 28, height: 28, borderRadius: 10, ...(today ? { background: 'linear-gradient(135deg, var(--a1), var(--a2))', boxShadow: '0 0 16px -4px var(--a2)' } : {}) }}>{d.getDate()}</span>
                  </div>
                )}
                <div className="col" style={{ gap: 3 }}>
                  {allDay.map((it) => (
                    <div key={it.id} className="ellipsis small" onClick={() => onItem?.(it)} style={{ cursor: 'pointer', padding: '2px 8px', borderRadius: 7, background: `${it.color}33`, borderLeft: `3px solid ${it.color}`, fontWeight: 600 }}>{it.title}</div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div ref={scroller} style={{ flex: 1, overflowY: 'auto', position: 'relative' }} role="grid">
        <div style={{ display: 'grid', gridTemplateColumns: `56px repeat(${days.length}, 1fr)`, position: 'relative', height: hours.length * HOUR_H }}>
          <div style={{ position: 'relative' }}>
            {hours.map((h) => (
              <div key={h} className="mono tiny dim" style={{ position: 'absolute', top: top(h * 60) - 7, right: 8 }}>{pad(h)}:00</div>
            ))}
          </div>
          {cols.map(({ d, timed, clases }) => {
            const iso = toISODate(d)
            const today = sameDay(d, now)
            const nowMin = now.getHours() * 60 + now.getMinutes()
            return (
              <div
                key={iso}
                role="row"
                style={{ position: 'relative', borderLeft: '1px solid var(--line)', background: today && days.length > 1 ? 'rgba(var(--a1-rgb), .05)' : undefined }}
                onClick={(e) => { if (e.target === e.currentTarget || e.target.dataset.slot) onSlot?.(iso, minToTime(minFromY(e, e.currentTarget))) }}
                onDragOver={(e) => { e.preventDefault(); setDropHint({ iso, min: minFromY(e, e.currentTarget) }) }}
                onDragLeave={() => setDropHint(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropHint(null)
                  const id = e.dataTransfer.getData('text/sgr-tarea')
                  if (id) onDropTask?.(Number(id), iso, minToTime(minFromY(e, e.currentTarget)))
                }}
              >
                {hours.map((h) => (
                  <div key={h} data-slot="1" style={{ position: 'absolute', left: 0, right: 0, top: top(h * 60), height: HOUR_H, borderTop: '1px solid rgba(150,170,255,.07)' }}>
                    <div data-slot="1" style={{ position: 'absolute', left: 0, right: 0, top: HOUR_H / 2, borderTop: '1px dashed rgba(150,170,255,.04)' }} />
                  </div>
                ))}
                {clases.map((c) => (
                  <div key={c.id} title={`${c.title} ${c.sub || ''}`} style={{ position: 'absolute', left: 2, right: 2, top: top(c.start), height: top(c.end) - top(c.start), borderRadius: 10, background: `repeating-linear-gradient(135deg, ${c.color}18 0 8px, transparent 8px 16px)`, border: `1px dashed ${c.color}66`, padding: '4px 8px', pointerEvents: 'none' }}>
                    <div className="tiny row gap4" style={{ color: c.color, opacity: 0.85 }}><GraduationCap size={11} /> {c.title}</div>
                  </div>
                ))}
                {timed.map((it, k) => {
                  const w = 100 / it.cols
                  const Icon = it.kind === 'habito' ? Sprout : it.kind === 'tarea' ? CheckSquare : null
                  const h = top(it.end) - top(it.start)
                  return (
                    <motion.div
                      key={it.id}
                      initial={{ opacity: 0, scaleY: 0.6 }}
                      animate={{ opacity: it.done ? 0.55 : 1, scaleY: 1 }}
                      transition={{ delay: k * 0.03, type: 'spring', stiffness: 260, damping: 24 }}
                      whileHover={{ scale: 1.02, zIndex: 5 }}
                      onClick={(e) => { e.stopPropagation(); onItem?.(it) }}
                      draggable={it.kind === 'tarea'}
                      onDragStart={(e) => it.kind === 'tarea' && e.dataTransfer.setData('text/sgr-tarea', String(it.raw.id))}
                      style={{
                        position: 'absolute', top: top(it.start) + 1, height: Math.max(20, h - 2), left: `calc(${it.col * w}% + 3px)`, width: `calc(${w}% - 6px)`,
                        transformOrigin: 'top', borderRadius: 10, padding: '4px 8px', overflow: 'hidden', cursor: 'pointer',
                        background: it.kind === 'evento' ? `linear-gradient(135deg, ${it.color}55, ${it.color}22)` : `${it.color}1c`,
                        border: `1px ${it.kind === 'evento' ? 'solid' : 'dashed'} ${it.color}aa`,
                        borderLeft: `3px solid ${it.color}`,
                        boxShadow: `0 6px 22px -12px ${it.color}`,
                        backdropFilter: 'blur(6px)',
                      }}
                    >
                      <div className="row gap4" style={{ alignItems: 'flex-start' }}>
                        {(it.kind === 'tarea' || it.kind === 'habito') && (
                          <button
                            className={`check ${it.done ? 'on' : ''} ${it.half ? 'half' : ''}`}
                            style={{ width: 16, height: 16, borderRadius: 5, marginTop: 1, ...(it.done ? { background: it.color } : {}) }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (it.kind === 'tarea') toggleTarea(it.raw)
                              else if (d <= new Date()) it.done || it.half ? desmarcar(it.raw.id, iso) : registrar(it.raw.id, iso, 1)
                            }}
                          >{(it.done || it.half) && <Check size={10} strokeWidth={3} />}</button>
                        )}
                        {Icon && !(it.kind === 'tarea' || it.kind === 'habito') && <Icon size={12} />}
                        <div style={{ minWidth: 0 }}>
                          <div className={`small ellipsis ${it.done ? 'strike' : ''}`} style={{ fontWeight: 600, lineHeight: 1.2 }}>{it.title}</div>
                          {h > 34 && <div className="tiny dim mono">{minToTime(it.start)}–{minToTime(Math.min(it.end, 24 * 60 - 1))}{it.kind === 'habito' ? ' · hábito' : it.kind === 'tarea' ? ' · bloque' : ''}</div>}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
                {dropHint?.iso === iso && (
                  <div style={{ position: 'absolute', left: 3, right: 3, top: top(dropHint.min), height: HOUR_H / 2, borderRadius: 10, border: '2px dashed var(--a2)', background: 'rgba(var(--a2-rgb), .12)', pointerEvents: 'none' }}>
                    <span className="tiny mono" style={{ padding: 4 }}>{minToTime(dropHint.min)}</span>
                  </div>
                )}
                {today && (
                  <div style={{ position: 'absolute', left: -4, right: 0, top: top(nowMin), height: 2, background: 'linear-gradient(90deg, var(--a2), transparent)', boxShadow: '0 0 12px var(--a2)', pointerEvents: 'none', zIndex: 4 }}>
                    <span style={{ position: 'absolute', left: -2, top: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--a2)', boxShadow: '0 0 12px var(--a2)', animation: 'pulse 1.6s infinite' }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
