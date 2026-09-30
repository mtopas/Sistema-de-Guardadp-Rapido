import { useEffect, useMemo } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Eye, EyeOff, Pencil, Plus } from 'lucide-react'
import { Button, Card, CardHead, Chip, IconButton, Tabs, cx } from '../../ui/primitives'
import { calendariosActivos, eventosDelDia, useAgenda } from '../../store/agenda'
import {
  DIAS_LUN, addDays, endOfMonth, endOfWeek, fmtTime, hasTime, monthGrid, parseDate,
  startOfMonth, startOfWeek, toISODate,
} from '../../lib/dates'

export function Mes() {
  const {
    refMes, setRefMes, vistaMes, setVistaMes, eventos, calendarios, tareas, dia, setDia,
    setTab, openEvento, ensureRange,
  } = useAgenda()

  const ref = parseDate(refMes) || new Date()

  const [desde, hasta] = useMemo(() => {
    if (vistaMes === 'semana') {
      const i = startOfWeek(ref)
      return [toISODate(addDays(i, -7)), toISODate(addDays(i, 13))]
    }
    const g = monthGrid(ref.getFullYear(), ref.getMonth())
    return [toISODate(g[0]), toISODate(g[41])]
  }, [refMes, vistaMes]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { ensureRange(desde, hasta) }, [desde, hasta]) // eslint-disable-line react-hooks/exhaustive-deps

  const dias = useMemo(() => {
    if (vistaMes === 'semana') {
      const i = startOfWeek(ref)
      return Array.from({ length: 7 }, (_, k) => addDays(i, k))
    }
    return monthGrid(ref.getFullYear(), ref.getMonth())
  }, [refMes, vistaMes]) // eslint-disable-line react-hooks/exhaustive-deps

  const hoy = toISODate()
  const mesActual = ref.getMonth()

  const shift = (n) => {
    if (vistaMes === 'semana') setRefMes(toISODate(addDays(ref, n * 7)))
    else setRefMes(toISODate(new Date(ref.getFullYear(), ref.getMonth() + n, 1)))
  }

  const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1)
  const titulo = capitalizar(
    vistaMes === 'semana'
      ? `${toISODate(startOfWeek(ref)).slice(8)} – ${toISODate(endOfWeek(ref)).slice(8)} de ${ref.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`
      : ref.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
  )

  return (
    <Card className="overflow-hidden" spot>
      <CardHead
        title={titulo}
        icon={CalendarDays}
        right={
          <>
            <Tabs
              value={vistaMes}
              onChange={setVistaMes}
              items={[{ id: 'mes', label: 'Mes' }, { id: 'semana', label: 'Semana' }]}
            />
            <IconButton icon={ChevronLeft} label="Anterior" onClick={() => shift(-1)} />
            <button className="btn btn-sm" onClick={() => setRefMes(toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))}>Hoy</button>
            <IconButton icon={ChevronRight} label="Siguiente" onClick={() => shift(1)} />
          </>
        }
      />

      <div className="grid grid-cols-7 border-b border-line px-2">
        {DIAS_LUN.map((d) => (
          <div key={d} className="label py-1.5 text-center">{d}</div>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-1 p-2"
        style={
          vistaMes === 'mes'
            ? { gridTemplateRows: 'repeat(6, minmax(0, 1fr))', height: 'calc(100vh - 252px)', minHeight: 520 }
            : { height: 'calc(100vh - 252px)', minHeight: 420 }
        }
      >
        {dias.map((d, i) => {
          const iso = toISODate(d)
          const evs = eventosDelDia(eventos, calendarios, iso)
          const tks = tareas.filter((t) => String(t.fecha || '').slice(0, 10) === iso)
          const esHoy = iso === hoy
          const fuera = vistaMes === 'mes' && d.getMonth() !== mesActual
          const sel = iso === dia
          return (
            <button
              key={iso}
              onClick={() => { setDia(iso); openEvento({ fecha: iso }) }}
              onDoubleClick={() => { setDia(iso); setTab('hoy') }}
              className={cx(
                'group relative flex flex-col overflow-hidden rounded-[10px] p-1.5 text-left transition-all duration-200 ease-swift hover:-translate-y-0.5',
                fuera && 'opacity-35',
              )}
              style={{
                background: esHoy
                  ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                  : 'color-mix(in srgb, var(--elev) 42%, transparent)',
                boxShadow: sel
                  ? 'inset 0 0 0 1.5px var(--accent)'
                  : esHoy
                    ? 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent)'
                    : 'inset 0 0 0 1px var(--border)',
                animation: `scaleIn 260ms cubic-bezier(0.22,1,0.36,1) ${i * 7}ms both`,
              }}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cx('mono text-[11px]', esHoy && 'font-bold')}
                  style={{ color: esHoy ? 'var(--accent)' : 'var(--subtext)' }}
                >
                  {d.getDate()}
                </span>
                <Plus size={11} className="text-txt-mute opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="scroll min-h-0 flex-1 space-y-[3px]">
                {evs.slice(0, vistaMes === 'semana' ? 12 : 3).map((e) => (
                  <div
                    key={e.id}
                    className="truncate1 rounded-[5px] px-1.5 py-[2px] text-[10px]"
                    style={{
                      background: `color-mix(in srgb, ${e.calendario_color || 'var(--accent)'} 34%, transparent)`,
                      borderLeft: `2px solid ${e.calendario_color || 'var(--accent)'}`,
                    }}
                    title={e.titulo || e.nombre}
                  >
                    {!e.todo_el_dia && hasTime(e.fecha_inicio) && (
                      <span className="mono mr-1 opacity-70">{fmtTime(e.fecha_inicio)}</span>
                    )}
                    {e.titulo || e.nombre}
                  </div>
                ))}
                {tks.slice(0, vistaMes === 'semana' ? 8 : 2).map((t) => (
                  <div
                    key={`t${t.id}`}
                    className={cx('truncate1 rounded-[5px] px-1.5 py-[2px] text-[10px]', t.completada && 'line-through opacity-50')}
                    style={{
                      border: `1px dashed color-mix(in srgb, ${t.lista_color || 'var(--b4)'} 60%, transparent)`,
                      color: t.lista_color || 'var(--b4)',
                    }}
                    title={t.titulo || t.nombre}
                  >
                    {t.titulo || t.nombre}
                  </div>
                ))}
                {evs.length + tks.length > (vistaMes === 'semana' ? 20 : 5) && (
                  <div className="text-[9.5px] text-txt-mute">+{evs.length + tks.length - 5} más</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

export function MesLeft() {
  const { calendarios, toggleCalendario, openCalendario, eventos, tareas } = useAgenda()
  const activos = calendariosActivos(calendarios)

  const conteo = useMemo(() => {
    const m = new Map()
    for (const e of eventos) m.set(e.calendario_id, (m.get(e.calendario_id) || 0) + 1)
    return m
  }, [eventos])

  return (
    <div className="space-y-3">
      <Card spot>
        <CardHead
          title="Calendarios"
          sub={`${activos.size} de ${calendarios.length} visibles`}
          icon={CalendarDays}
          right={<IconButton icon={Plus} label="Nuevo calendario" onClick={() => openCalendario({})} />}
        />
        <div className="space-y-1 px-2.5 pb-3">
          {calendarios.length === 0 ? (
            <p className="px-1.5 py-3 text-center text-[11.5px] text-txt-mute">Sin calendarios. Creá el primero.</p>
          ) : (
            calendarios.map((c) => {
              const on = c.activo !== false && c.activo !== 0
              return (
                <div key={c.id} className="group flex items-center gap-2 rounded-[9px] px-1.5 py-1.5 transition-colors hover:bg-elev">
                  <button
                    className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] transition-all duration-200 ease-spring"
                    style={{
                      border: `1.5px solid ${c.color || 'var(--accent)'}`,
                      background: on ? c.color || 'var(--accent)' : 'transparent',
                      transform: on ? 'scale(1.06)' : 'scale(1)',
                    }}
                    onClick={() => toggleCalendario(c)}
                    title={on ? 'Ocultar' : 'Mostrar'}
                  >
                    {on && (
                      <svg width="10" height="10" viewBox="0 0 12 12" className="a-pop">
                        <path d="M2 6.2 4.6 8.8 10 3.4" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                  <span className={cx('min-w-0 flex-1 truncate1 text-[12.5px]', !on && 'text-txt-mute')}>{c.nombre}</span>
                  <span className="badge shrink-0">{conteo.get(c.id) || 0}</span>
                  <IconButton
                    icon={Pencil}
                    size={11}
                    label="Editar"
                    className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => openCalendario({ calendario: c })}
                  />
                </div>
              )
            })
          )}
        </div>
      </Card>

      <Card>
        <CardHead title="Leyenda" />
        <div className="space-y-2 px-3.5 pb-3.5 text-[11.5px] text-txt-sub">
          <div className="flex items-center gap-2">
            <span className="h-4 w-8 rounded-[5px]" style={{ background: 'color-mix(in srgb, var(--accent) 34%, transparent)', borderLeft: '2px solid var(--accent)' }} />
            Evento
          </div>
          <div className="flex items-center gap-2">
            <span className="h-4 w-8 rounded-[5px]" style={{ border: '1px dashed color-mix(in srgb, var(--b4) 60%, transparent)' }} />
            Tarea con fecha
          </div>
          <p className="pt-1 text-[10.5px] leading-relaxed text-txt-mute">
            Un clic en un día abre el alta de evento. Doble clic salta a la vista HOY de ese día.
          </p>
        </div>
      </Card>
    </div>
  )
}

export function MesRight() {
  const { eventos, calendarios, tareas, openEvento, openTarea } = useAgenda()
  const hoy = toISODate()

  const proximos = useMemo(() => {
    const items = []
    for (const e of eventos) {
      const iso = String(e.fecha_inicio || '').slice(0, 10)
      if (iso >= hoy) items.push({ tipo: 'evento', iso, hora: hasTime(e.fecha_inicio) ? fmtTime(e.fecha_inicio) : null, obj: e })
    }
    for (const t of tareas) {
      const iso = String(t.fecha || '').slice(0, 10)
      if (iso >= hoy && !t.completada) items.push({ tipo: 'tarea', iso, hora: t.hora || null, obj: t })
    }
    return items
      .sort((a, b) => a.iso.localeCompare(b.iso) || String(a.hora || '99').localeCompare(String(b.hora || '99')))
      .slice(0, 22)
  }, [eventos, tareas, hoy])

  const porDia = useMemo(() => {
    const m = new Map()
    for (const it of proximos) {
      if (!m.has(it.iso)) m.set(it.iso, [])
      m.get(it.iso).push(it)
    }
    return [...m.entries()]
  }, [proximos])

  return (
    <Card spot>
      <CardHead title="Lo que viene" sub={`${proximos.length} próximos`} />
      <div className="scroll max-h-[calc(100vh-220px)] space-y-3 px-3.5 pb-3.5">
        {porDia.length === 0 ? (
          <p className="py-5 text-center text-[11.5px] text-txt-mute">Agenda libre.</p>
        ) : (
          porDia.map(([iso, items], gi) => (
            <div key={iso} className="a-up" style={{ animationDelay: `${gi * 50}ms` }}>
              <div className="label mb-1.5">
                {iso === hoy ? 'Hoy' : new Date(...isoParts(iso)).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
              <div className="space-y-1">
                {items.map((it) => {
                  const color = it.tipo === 'evento' ? it.obj.calendario_color || 'var(--accent)' : it.obj.lista_color || 'var(--b4)'
                  return (
                    <button
                      key={`${it.tipo}${it.obj.id}`}
                      onClick={() => (it.tipo === 'evento' ? openEvento({ evento: it.obj }) : openTarea({ tarea: it.obj }))}
                      className="surface flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-transform duration-200 hover:-translate-y-px"
                    >
                      <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate1 text-[12px]">{it.obj.titulo || it.obj.nombre}</span>
                        <span className="block text-[10px] text-txt-mute">
                          {it.tipo === 'evento' ? it.obj.calendario_nombre || 'Evento' : it.obj.lista_nombre || 'Tarea'}
                        </span>
                      </span>
                      {it.hora && <span className="mono shrink-0 text-[10.5px] text-txt-sub">{it.hora}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

const isoParts = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return [y, m - 1, d]
}
