import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardCheck, PieChart, Timer } from 'lucide-react'
import { Button, Card, CardHead, Checkbox, Chip, Empty, IconButton, Progress, Stat } from '../../ui/primitives'
import { Donut, GroupedBars } from '../../ui/charts'
import { calendariosActivos, eventosDelDia, useAgenda } from '../../store/agenda'
import { DIAS_LUN, addDays, fmtDate, hasTime, parseDate, startOfWeek, timeToMin, toISODate } from '../../lib/dates'
import { hashColor } from '../../lib/fin'

/** Retrospectiva semanal: qué se cumplió, qué quedó, cuánto tiempo se planificó. */
export function Revision() {
  const {
    semanaRevision, setSemanaRevision, eventos, calendarios, tareas, toggleTarea, openTarea, ensureRange,
  } = useAgenda()

  const ini = parseDate(semanaRevision) || startOfWeek(new Date())
  const fin = addDays(ini, 6)
  const desde = toISODate(ini)
  const hasta = toISODate(fin)

  useEffect(() => { ensureRange(desde, hasta) }, [desde, hasta]) // eslint-disable-line react-hooks/exhaustive-deps

  const dias = Array.from({ length: 7 }, (_, i) => addDays(ini, i))

  const dentro = (iso) => iso >= desde && iso <= hasta

  const tks = useMemo(
    () => tareas.filter((t) => t.fecha && dentro(String(t.fecha).slice(0, 10))),
    [tareas, desde, hasta], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const completadas = tks.filter((t) => t.completada)
  const incompletas = tks.filter((t) => !t.completada)

  const vencidas = useMemo(
    () =>
      tareas.filter(
        (t) => !t.completada && t.fecha && String(t.fecha).slice(0, 10) < toISODate() && String(t.fecha).slice(0, 10) >= toISODate(addDays(new Date(), -7)),
      ),
    [tareas],
  )

  const evs = useMemo(
    () => dias.flatMap((d) => eventosDelDia(eventos, calendarios, toISODate(d)).map((e) => ({ ...e, _dia: toISODate(d) }))),
    [eventos, calendarios, desde], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // % de tiempo planificado sobre una jornada útil de 6 a 23h (17h × 7 días).
  const minutosPlan = useMemo(() => {
    let total = 0
    for (const e of evs) {
      if (e.todo_el_dia || !hasTime(e.fecha_inicio)) { total += 8 * 60; continue }
      const a = timeToMin(String(e.fecha_inicio).slice(11, 16)) ?? 0
      const b = e.fecha_fin && hasTime(e.fecha_fin) ? timeToMin(String(e.fecha_fin).slice(11, 16)) : a + 60
      total += Math.max(15, b - a)
    }
    for (const t of tks) if (t.hora_bloque) total += Number(t.duracion_estimada) || 45
    return total
  }, [evs, tks])
  const capacidad = 17 * 60 * 7
  const pctPlan = Math.min(100, (minutosPlan / capacidad) * 100)

  const porCalendario = useMemo(() => {
    const m = new Map()
    for (const e of evs) {
      const k = e.calendario_nombre || 'Sin calendario'
      let min = 60
      if (e.todo_el_dia || !hasTime(e.fecha_inicio)) min = 8 * 60
      else {
        const a = timeToMin(String(e.fecha_inicio).slice(11, 16)) ?? 0
        const b = e.fecha_fin && hasTime(e.fecha_fin) ? timeToMin(String(e.fecha_fin).slice(11, 16)) : a + 60
        min = Math.max(15, b - a)
      }
      if (!m.has(k)) m.set(k, { name: k, value: 0, color: e.calendario_color || hashColor(k) })
      m.get(k).value += min
    }
    return [...m.values()].sort((a, b) => b.value - a.value)
  }, [evs])

  const porDia = useMemo(
    () =>
      dias.map((d, i) => {
        const iso = toISODate(d)
        const dt = tks.filter((t) => String(t.fecha).slice(0, 10) === iso)
        return {
          label: DIAS_LUN[i],
          full: fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'short' }),
          hechas: dt.filter((t) => t.completada).length,
          pendientes: dt.filter((t) => !t.completada).length,
        }
      }),
    [tks, desde], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const pct = tks.length ? (completadas.length / tks.length) * 100 : null

  return (
    <div className="space-y-3">
      <Card spot>
        <CardHead
          title={`Semana del ${fmtDate(desde, { day: 'numeric', month: 'long' })}`}
          sub={`al ${fmtDate(hasta, { day: 'numeric', month: 'long', year: 'numeric' })}`}
          icon={ClipboardCheck}
          right={
            <>
              <IconButton icon={ChevronLeft} label="Semana anterior" onClick={() => setSemanaRevision(toISODate(addDays(ini, -7)))} />
              <button className="btn btn-sm" onClick={() => setSemanaRevision(toISODate(startOfWeek(new Date())))}>Esta semana</button>
              <IconButton icon={ChevronRight} label="Semana siguiente" onClick={() => setSemanaRevision(toISODate(addDays(ini, 7)))} />
            </>
          }
        />
        <div className="grid gap-2.5 px-3.5 pb-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Tareas con fecha" value={tks.length} sub="en la semana" />
          <Stat label="Completadas" value={completadas.length} sub={pct != null ? `${Math.round(pct)}% de cumplimiento` : ''} tone="good" />
          <Stat label="Quedaron" value={incompletas.length} tone={incompletas.length ? 'warn' : 'good'} />
          <Stat label="Eventos" value={evs.length} sub={`${Math.round(minutosPlan / 60)} h planificadas`} />
        </div>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[1fr,320px]">
        <Card>
          <CardHead title="Cumplimiento día a día" />
          <div className="px-4 pb-4">
            <GroupedBars
              data={porDia}
              series={[
                { key: 'hechas', label: 'Completadas', color: 'var(--success)' },
                { key: 'pendientes', label: 'Pendientes', color: 'var(--warning)' },
              ]}
              height={165}
              format={(v) => `${v}`}
            />
          </div>
        </Card>

        <Card>
          <CardHead title="Tiempo planificado" icon={Timer} />
          <div className="px-3.5 pb-3.5">
            <Progress
              value={pctPlan}
              max={100}
              color={pctPlan > 75 ? 'var(--danger)' : pctPlan > 45 ? 'var(--warning)' : 'var(--success)'}
              height={8}
              showPct
              label={`${Math.round(minutosPlan / 60)} h de ${Math.round(capacidad / 60)} h disponibles`}
            />
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-txt-sub">
              {pctPlan > 75
                ? 'La semana está casi llena. Si aparece algo urgente no hay lugar donde ponerlo.'
                : pctPlan > 45
                  ? 'Carga razonable: queda margen para lo imprevisto.'
                  : 'Semana holgada. Buen momento para meter eso que venís postergando.'}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHead title="Distribución por calendario" sub="Minutos ocupados" icon={PieChart} />
          {porCalendario.length === 0 ? (
            <Empty title="Sin eventos" body="Nada agendado en esta semana." />
          ) : (
            <div className="flex flex-col items-center gap-4 px-4 pb-4 sm:flex-row">
              <Donut
                data={porCalendario}
                size={148}
                center={
                  <div>
                    <div className="label">Total</div>
                    <div className="mono text-[14px] font-semibold">{Math.round(minutosPlan / 60)} h</div>
                  </div>
                }
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                {porCalendario.map((c) => (
                  <div key={c.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="min-w-0 flex-1 truncate1 text-[12px]">{c.name}</span>
                    <span className="mono shrink-0 text-[11.5px] text-txt-sub">{(c.value / 60).toFixed(1)} h</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHead
            title="Arrastres"
            sub="Vencidas en los últimos 7 días"
            icon={AlertTriangle}
          />
          {vencidas.length === 0 ? (
            <Empty title="Nada vencido" body="No quedaron tareas colgadas. Buena semana." />
          ) : (
            <div className="scroll max-h-[260px] space-y-0.5 px-2 pb-2">
              {vencidas.map((t, i) => (
                <div
                  key={t.id}
                  className="flex items-start gap-2.5 rounded-[9px] px-2 py-1.5 transition-colors hover:bg-elev"
                  style={{ animation: `slideUp 300ms cubic-bezier(0.22,1,0.36,1) ${i * 25}ms both` }}
                >
                  <Checkbox checked={false} onChange={() => toggleTarea(t)} color="var(--danger)" className="mt-0.5" />
                  <button className="min-w-0 flex-1 text-left" onClick={() => openTarea({ tarea: t })}>
                    <span className="block truncate1 text-[12.5px]">{t.titulo || t.nombre}</span>
                    <span className="block text-[10.5px]" style={{ color: 'var(--danger)' }}>vencía el {fmtDate(t.fecha)}</span>
                  </button>
                  {t.lista_nombre && <Chip color={t.lista_color} className="shrink-0">{t.lista_nombre}</Chip>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHead title="Detalle de la semana" sub="Tareas por día" />
        <div className="grid gap-2 px-3.5 pb-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {dias.map((d, i) => {
            const iso = toISODate(d)
            const dt = tks.filter((t) => String(t.fecha).slice(0, 10) === iso)
            const evd = eventosDelDia(eventos, calendarios, iso)
            return (
              <div
                key={iso}
                className="surface p-2.5"
                style={{
                  boxShadow: iso === toISODate() ? 'inset 0 0 0 1px var(--accent)' : undefined,
                  animation: `slideUp 320ms cubic-bezier(0.22,1,0.36,1) ${i * 40}ms both`,
                }}
              >
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[12px] font-semibold">{DIAS_LUN[i]} {d.getDate()}</span>
                  <span className="mono text-[10px] text-txt-mute">{evd.length} ev · {dt.length} tk</span>
                </div>
                {dt.length === 0 && evd.length === 0 ? (
                  <p className="text-[10.5px] text-txt-mute">Libre</p>
                ) : (
                  <div className="space-y-1">
                    {dt.slice(0, 4).map((t) => (
                      <div key={t.id} className="flex items-center gap-1.5 text-[10.5px]">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: t.completada ? 'var(--success)' : 'var(--warning)' }}
                        />
                        <span className={`truncate1 ${t.completada ? 'text-txt-mute line-through' : ''}`}>{t.titulo || t.nombre}</span>
                      </div>
                    ))}
                    {evd.slice(0, 3).map((e) => (
                      <div key={`e${e.id}`} className="flex items-center gap-1.5 text-[10.5px]">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.calendario_color || 'var(--accent)' }} />
                        <span className="truncate1 text-txt-sub">{e.titulo || e.nombre}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
