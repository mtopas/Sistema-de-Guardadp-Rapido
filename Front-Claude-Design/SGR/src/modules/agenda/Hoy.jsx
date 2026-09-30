import { useEffect, useMemo, useRef } from 'react'
import { CalendarClock, Clock, Flame, GraduationCap, Plus } from 'lucide-react'
import { Button, Card, CardHead, Checkbox, Chip, Empty, IconButton, Progress } from '../../ui/primitives'
import { clasesDelDia, eventosDelDia, useAgenda } from '../../store/agenda'
import { useHabitos } from '../../store/habitos'
import { buildRegMap, isScheduled, statusDia, valorOf } from '../../lib/habitos'
import {
  DIAS_L, addDays, fmtDate, fmtTime, hasTime, minToTime, parseDate, timeToMin, toISODate,
} from '../../lib/dates'
import { hashColor } from '../../lib/fin'

const H_INI = 6
const H_FIN = 23
const PX_H = 52

/** Grilla horaria 6–23h con eventos, bloques de tareas, hábitos con hora y capa facultad. */
export function Hoy() {
  const { dia, eventos, calendarios, tareas, horario, openEvento, openTarea, editarTarea } = useAgenda()
  const habitos = useHabitos((s) => s.habitos)
  const registros = useHabitos((s) => s.registros)
  const ciclar = useHabitos((s) => s.ciclar)
  const scrollRef = useRef(null)
  const fecha = parseDate(dia) || new Date()
  const regMap = useMemo(() => buildRegMap(registros), [registros])

  const evs = useMemo(() => eventosDelDia(eventos, calendarios, dia), [eventos, calendarios, dia])
  const clases = useMemo(() => clasesDelDia(horario, fecha), [horario, dia]) // eslint-disable-line react-hooks/exhaustive-deps
  const bloques = useMemo(() => tareas.filter((t) => String(t.fecha || '').slice(0, 10) === dia && t.hora_bloque), [tareas, dia])
  const habitosHora = useMemo(
    () => habitos.filter((h) => h.hora && isScheduled(h, fecha)),
    [habitos, dia], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const conHora = evs.filter((e) => !e.todo_el_dia && hasTime(e.fecha_inicio))
  const todoElDia = evs.filter((e) => e.todo_el_dia || !hasTime(e.fecha_inicio))

  // Al montar, el scroll arranca cerca de la hora actual.
  useEffect(() => {
    const t = setTimeout(() => {
      const el = scrollRef.current
      if (!el) return
      const ahora = new Date()
      const min = ahora.getHours() * 60 + ahora.getMinutes()
      el.scrollTop = Math.max(0, ((min - H_INI * 60) / 60) * PX_H - 130)
    }, 90)
    return () => clearTimeout(t)
  }, [])

  const horas = Array.from({ length: H_FIN - H_INI + 1 }, (_, i) => H_INI + i)
  const ahora = new Date()
  const esHoy = dia === toISODate()
  const nowTop = ((ahora.getHours() * 60 + ahora.getMinutes() - H_INI * 60) / 60) * PX_H

  const pos = (iniMin, finMin) => ({
    top: ((iniMin - H_INI * 60) / 60) * PX_H,
    height: Math.max(20, ((Math.max(finMin, iniMin + 25) - iniMin) / 60) * PX_H - 3),
  })

  return (
    <div className="space-y-3">
      {todoElDia.length > 0 && (
        <Card>
          <CardHead title="Todo el día" />
          <div className="flex flex-wrap gap-2 px-3.5 pb-3.5">
            {todoElDia.map((e) => (
              <button key={e.id} onClick={() => openEvento({ evento: e })}>
                <Chip color={e.calendario_color || 'var(--accent)'}>{e.titulo || e.nombre}</Chip>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden" spot>
        <CardHead
          title={`${DIAS_L[fecha.getDay()]} ${fmtDate(dia, { day: 'numeric', month: 'long' })}`}
          sub={`${conHora.length} eventos · ${bloques.length} bloques · ${clases.length} clases`}
          icon={CalendarClock}
          right={<IconButton icon={Plus} label="Nuevo evento" onClick={() => openEvento({ fecha: dia })} />}
        />
        <div ref={scrollRef} className="scroll relative" style={{ maxHeight: 'calc(100vh - 260px)' }}>
          <div className="relative" style={{ height: (H_FIN - H_INI + 1) * PX_H, paddingLeft: 52 }}>
            {/* Líneas de hora */}
            {horas.map((h, i) => (
              <div key={h} className="absolute inset-x-0" style={{ top: i * PX_H, height: PX_H }}>
                <div className="absolute left-0 w-[46px] -translate-y-1/2 pr-2 text-right">
                  <span className="mono text-[10px] text-txt-mute">{String(h).padStart(2, '0')}:00</span>
                </div>
                <div className="absolute left-[52px] right-3 top-0 h-px" style={{ background: 'var(--border)' }} />
              </div>
            ))}

            {/* Capa facultad, opacada detrás de todo */}
            {clases.map((c) => {
              const p = pos(timeToMin(c.hora_inicio) ?? 0, timeToMin(c.hora_fin) ?? 0)
              return (
                <div
                  key={`f${c.id}`}
                  className="absolute right-3 rounded-[9px] px-2 py-1 a-scale"
                  style={{
                    ...p,
                    left: 56,
                    background: `color-mix(in srgb, ${c.color || '#3b82f6'} 13%, transparent)`,
                    border: `1px dashed color-mix(in srgb, ${c.color || '#3b82f6'} 38%, transparent)`,
                  }}
                  title={`${c.materia} · ${c.hora_inicio}–${c.hora_fin}`}
                >
                  <div className="flex items-center gap-1.5 text-[10.5px]" style={{ color: c.color || '#3b82f6' }}>
                    <GraduationCap size={10} />
                    <span className="truncate1">{c.materia}</span>
                  </div>
                </div>
              )
            })}

            {/* Eventos */}
            {conHora.map((e, i) => {
              const ini = timeToMin(String(e.fecha_inicio).slice(11, 16)) ?? 0
              const fin = e.fecha_fin && hasTime(e.fecha_fin) ? timeToMin(String(e.fecha_fin).slice(11, 16)) : ini + 60
              const p = pos(ini, fin)
              const color = e.calendario_color || 'var(--accent)'
              return (
                <button
                  key={e.id}
                  onClick={() => openEvento({ evento: e })}
                  className="absolute overflow-hidden rounded-[10px] px-2.5 py-1.5 text-left transition-transform duration-200 ease-swift hover:z-20 hover:scale-[1.015]"
                  style={{
                    ...p,
                    left: 58 + (i % 2) * 6,
                    right: 12,
                    background: `linear-gradient(135deg, color-mix(in srgb, ${color} 34%, transparent), color-mix(in srgb, ${color} 15%, transparent))`,
                    borderLeft: `2.5px solid ${color}`,
                    boxShadow: `0 6px 18px -10px ${color}`,
                    animation: `slideInRight 380ms cubic-bezier(0.22,1,0.36,1) ${i * 55}ms both`,
                  }}
                >
                  <div className="truncate1 text-[12px] font-medium">{e.titulo || e.nombre}</div>
                  <div className="mono text-[10px] text-txt-sub">
                    {fmtTime(e.fecha_inicio)}{e.fecha_fin && hasTime(e.fecha_fin) ? `–${fmtTime(e.fecha_fin)}` : ''}
                    {e.calendario_nombre ? ` · ${e.calendario_nombre}` : ''}
                  </div>
                </button>
              )
            })}

            {/* Bloques de tareas (time blocking) */}
            {bloques.map((t, i) => {
              const ini = timeToMin(t.hora_bloque) ?? 0
              const p = pos(ini, ini + (Number(t.duracion_estimada) || 45))
              const color = t.lista_color || 'var(--b4)'
              return (
                <button
                  key={`t${t.id}`}
                  onClick={() => openTarea({ tarea: t })}
                  className="absolute overflow-hidden rounded-[10px] px-2.5 py-1 text-left transition-transform duration-200 hover:z-20 hover:scale-[1.015]"
                  style={{
                    ...p,
                    left: 58,
                    right: 12,
                    background: `color-mix(in srgb, ${color} 16%, transparent)`,
                    border: `1px dashed color-mix(in srgb, ${color} 55%, transparent)`,
                    opacity: t.completada ? 0.5 : 1,
                    animation: `slideInRight 380ms cubic-bezier(0.22,1,0.36,1) ${i * 55}ms both`,
                  }}
                >
                  <div className={`truncate1 text-[11.5px] ${t.completada ? 'line-through' : ''}`}>{t.titulo || t.nombre}</div>
                  <div className="mono text-[9.5px] text-txt-mute">{t.hora_bloque} · {t.duracion_estimada || 45} min</div>
                </button>
              )
            })}

            {/* Hábitos con hora */}
            {habitosHora.map((h) => {
              const ini = timeToMin(h.hora) ?? 0
              const p = pos(ini, ini + 30)
              const st = statusDia(h, regMap, fecha)
              const color = h.color || hashColor(h.nombre)
              return (
                <button
                  key={`h${h.id}`}
                  onClick={() => ciclar(h, dia)}
                  className="absolute flex items-center gap-2 overflow-hidden rounded-full px-2.5 transition-transform duration-200 hover:scale-[1.02]"
                  style={{
                    top: p.top,
                    height: 26,
                    right: 14,
                    width: 'min(42%, 210px)',
                    background: st === 'hecho' ? `color-mix(in srgb, ${color} 30%, transparent)` : 'color-mix(in srgb, var(--elev) 80%, transparent)',
                    border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
                  }}
                  title="Clic para marcar total / parcial / pendiente"
                >
                  <Flame size={11} style={{ color }} />
                  <span className={`truncate1 text-[11px] ${st === 'hecho' ? 'line-through opacity-70' : ''}`}>{h.nombre}</span>
                  <span className="mono ml-auto text-[9.5px] text-txt-mute">{h.hora}</span>
                </button>
              )
            })}

            {/* Línea de ahora */}
            {esHoy && nowTop > 0 && nowTop < (H_FIN - H_INI + 1) * PX_H && (
              <div className="pointer-events-none absolute left-[46px] right-3 z-30" style={{ top: nowTop }}>
                <div className="relative h-px" style={{ background: 'var(--danger)', boxShadow: '0 0 8px var(--danger)' }}>
                  <span
                    className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full"
                    style={{ background: 'var(--danger)', animation: 'breathe 2s ease-in-out infinite' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ── Panel izquierdo de HOY ───────────────────────────────────────── */
export function HoyLeft() {
  const { dia, setDia, tareas, toggleTarea, openTarea, editarTarea } = useAgenda()
  const habitos = useHabitos((s) => s.habitos)
  const registros = useHabitos((s) => s.registros)
  const ciclar = useHabitos((s) => s.ciclar)
  const regMap = useMemo(() => buildRegMap(registros), [registros])
  const fecha = parseDate(dia) || new Date()

  const proximas = useMemo(() => {
    const hasta = toISODate(addDays(new Date(), 15))
    return tareas
      .filter((t) => !t.completada && t.fecha && String(t.fecha).slice(0, 10) <= hasta)
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
      .slice(0, 18)
  }, [tareas])

  const delDia = useMemo(
    () => habitos.filter((h) => !h.hora && isScheduled(h, fecha)),
    [habitos, dia], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const hechos = delDia.reduce((a, h) => a + valorOf(regMap, h.id, dia), 0)

  return (
    <div className="space-y-3">
      <Card spot>
        <CardHead title="Día" icon={Clock} />
        <div className="space-y-2 px-3.5 pb-3.5">
          <input type="date" className="input" value={dia} onChange={(e) => setDia(e.target.value)} />
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1" onClick={() => setDia(toISODate(addDays(fecha, -1)))}>Ayer</Button>
            <Button size="sm" variant="primary" className="flex-1" onClick={() => setDia(toISODate())}>Hoy</Button>
            <Button size="sm" className="flex-1" onClick={() => setDia(toISODate(addDays(fecha, 1)))}>Mañana</Button>
          </div>
        </div>
      </Card>

      {delDia.length > 0 && (
        <Card>
          <CardHead
            title="Hábitos de hoy"
            sub={`${hechos.toFixed(1).replace('.0', '')} de ${delDia.length}`}
            icon={Flame}
          />
          <div className="px-3.5 pb-3.5">
            <Progress value={hechos} max={delDia.length} color="var(--success)" height={5} className="mb-2.5" />
            <div className="space-y-1">
              {delDia.map((h) => {
                const st = statusDia(h, regMap, fecha)
                const color = h.color || hashColor(h.nombre)
                return (
                  <button
                    key={h.id}
                    onClick={() => ciclar(h, dia)}
                    className="flex w-full items-center gap-2.5 rounded-[9px] px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-elev"
                  >
                    <span
                      className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] transition-all duration-200 ease-spring"
                      style={{
                        border: `1.5px solid ${st === 'pendiente' ? 'var(--border-2)' : color}`,
                        background: st === 'hecho' ? color : st === 'parcial' ? `color-mix(in srgb, ${color} 45%, transparent)` : 'transparent',
                      }}
                    >
                      {st === 'hecho' && (
                        <svg width="10" height="10" viewBox="0 0 12 12" className="a-pop">
                          <path d="M2 6.2 4.6 8.8 10 3.4" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
                        </svg>
                      )}
                      {st === 'parcial' && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className={`min-w-0 flex-1 truncate1 text-[12px] ${st === 'hecho' ? 'text-txt-mute line-through' : ''}`}>
                      {h.nombre}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHead
          title="Pendientes"
          sub="Próximos 15 días · arrastrá una hora para bloquearla"
          right={<IconButton icon={Plus} label="Nueva tarea" onClick={() => openTarea({ fecha: dia })} />}
        />
        {proximas.length === 0 ? (
          <Empty title="Nada pendiente" body="Disfrutá el día o cargá una tarea nueva." />
        ) : (
          <div className="scroll max-h-[42vh] space-y-1 px-2.5 pb-3">
            {proximas.map((t) => {
              const vencida = String(t.fecha).slice(0, 10) < toISODate()
              const color = t.lista_color || 'var(--accent)'
              return (
                <div key={t.id} className="group flex items-start gap-2 rounded-[9px] px-1.5 py-1.5 transition-colors hover:bg-elev">
                  <Checkbox checked={!!t.completada} onChange={() => toggleTarea(t)} color={color} className="mt-0.5" />
                  <button className="min-w-0 flex-1 text-left" onClick={() => openTarea({ tarea: t })}>
                    <span className="block truncate1 text-[12px]">{t.titulo || t.nombre}</span>
                    <span className="flex items-center gap-1.5 text-[10px]" style={{ color: vencida ? 'var(--danger)' : 'var(--mute)' }}>
                      {fmtDate(t.fecha)}
                      {t.hora && <span className="mono">· {t.hora}</span>}
                      {t.lista_nombre && <span>· {t.lista_nombre}</span>}
                    </span>
                  </button>
                  {!t.hora_bloque && (
                    <button
                      className="shrink-0 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ color: 'var(--accent)' }}
                      title="Bloquear en la grilla de hoy"
                      onClick={() => editarTarea(t.id, { fecha: dia, hora_bloque: minToTime(new Date().getHours() * 60) })}
                    >
                      bloquear
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
