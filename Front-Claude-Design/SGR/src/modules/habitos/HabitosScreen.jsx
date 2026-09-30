import { useEffect, useMemo } from 'react'
import {
  Activity, CalendarRange, ChevronLeft, ChevronRight, Flame, History, Pencil, Plus, Trash2, TrendingUp,
} from 'lucide-react'
import {
  Button, Card, CardHead, Chip, Empty, IconButton, Progress, SkeletonList, Stat, Tabs, ThreeCol, cx,
} from '../../ui/primitives'
import { Heatmap, Sparkline } from '../../ui/charts'
import { CompletarModal, HabitoModal } from './modals'
import { useHabitos } from '../../store/habitos'
import {
  buildRegMap, calcMaxStreak, calcStreak, dayPct, diasDe, frecuenciaTexto, heatColor, isScheduled,
  mensajeMomentum, pctHabitoRange, pctRange, regOf, statusDia, tendencia, valorOf,
} from '../../lib/habitos'
import {
  DIAS_C, MESES, addDays, addMonths, daysInMonth, fmtDate, monthGrid, parseDate, startOfDay,
  startOfWeek, toISODate,
} from '../../lib/dates'
import { hashColor } from '../../lib/fin'

const TABS = [
  { id: 'hoy', label: 'HOY', icon: Flame },
  { id: 'progreso', label: 'Progreso', icon: TrendingUp },
  { id: 'historial', label: 'Historial', icon: History },
]

export default function HabitosScreen() {
  const { loaded, tab, setTab, refMes, setRefMes, fetchAll, openModal } = useHabitos()

  useEffect(() => { if (!loaded) fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const ref = parseDate(refMes) || new Date()
  const centro = { hoy: <Grilla />, progreso: <Progreso />, historial: <Historial /> }[tab]

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-2.5">
        <Tabs value={tab} onChange={setTab} items={TABS} />
        {(tab === 'hoy' || tab === 'historial') && (
          <div
            className="flex items-center gap-1 rounded-xl border border-line px-1 py-0.5"
            style={{ background: 'color-mix(in srgb, var(--elev) 50%, transparent)' }}
          >
            <IconButton icon={ChevronLeft} label="Mes anterior" onClick={() => setRefMes(toISODate(addMonths(ref, -1)))} />
            <button
              className="mono min-w-[122px] text-center text-[12.5px] font-medium capitalize"
              onClick={() => setRefMes(toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))}
            >
              {MESES[ref.getMonth()]} {ref.getFullYear()}
            </button>
            <IconButton icon={ChevronRight} label="Mes siguiente" onClick={() => setRefMes(toISODate(addMonths(ref, 1)))} />
          </div>
        )}
        <Button variant="primary" icon={Plus} className="ml-auto" onClick={() => openModal(null)}>Hábito</Button>
      </div>

      {!loaded ? (
        <div className="px-4"><SkeletonList rows={8} h={52} /></div>
      ) : (
        <ThreeCol left={<HabitosLeft />} center={centro} right={<HabitosRight />} />
      )}

      <HabitoModal />
      <CompletarModal />
    </>
  )
}

/* ═══ HOY: grilla mensual en un solo contenedor con scroll ══════════ */
function Grilla() {
  const { habitos, registros, refMes, openCompletar, openModal, select } = useHabitos()
  const regMap = useMemo(() => buildRegMap(registros), [registros])
  const ref = parseDate(refMes) || new Date()
  const year = ref.getFullYear()
  const month = ref.getMonth()
  const nDias = daysInMonth(year, month)
  const hoyISO = toISODate()
  const activos = habitos.filter((h) => h.activo !== false)

  if (!activos.length) {
    return (
      <Card>
        <Empty
          icon={Flame}
          title="Sin hábitos activos"
          body="Creá el primero: elegí si es diario o de días específicos y, si querés, una hora para que aparezca también en la Agenda."
          action={<Button variant="primary" icon={Plus} onClick={() => openModal(null)}>Nuevo hábito</Button>}
        />
      </Card>
    )
  }

  const dias = Array.from({ length: nDias }, (_, i) => new Date(year, month, i + 1))

  return (
    <Card className="overflow-hidden" spot>
      <CardHead
        title="Grilla del mes"
        sub="Clic en una celda: total (verde) · parcial (amarillo) · vacío"
        icon={CalendarRange}
      />
      {/* Un único contenedor con scroll: columnas nombre y % quedan sticky. */}
      <div className="scroll" style={{ maxHeight: 'calc(100vh - 240px)' }}>
        <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
          <thead>
            <tr>
              <th
                className="sticky left-0 top-0 z-30 px-3 py-2 text-left"
                style={{ background: 'var(--panel-bg)', borderBottom: '1px solid var(--border)', minWidth: 170 }}
              >
                <span className="label">Hábito</span>
              </th>
              {dias.map((d) => {
                const iso = toISODate(d)
                const esHoy = iso === hoyISO
                return (
                  <th
                    key={iso}
                    className="sticky top-0 z-20 px-0 py-1 text-center"
                    style={{ background: 'var(--panel-bg)', borderBottom: '1px solid var(--border)', minWidth: 26 }}
                  >
                    <div
                      className="mono text-[9.5px] font-semibold"
                      style={{ color: esHoy ? 'var(--accent)' : 'var(--mute)' }}
                    >
                      {DIAS_C[d.getDay()].slice(0, 1)}
                    </div>
                    <div
                      className={cx('mono text-[10.5px]', esHoy && 'font-bold')}
                      style={{ color: esHoy ? 'var(--accent)' : 'var(--subtext)' }}
                    >
                      {d.getDate()}
                    </div>
                  </th>
                )
              })}
              <th
                className="sticky right-0 top-0 z-30 px-2 py-2 text-right"
                style={{ background: 'var(--panel-bg)', borderBottom: '1px solid var(--border)', minWidth: 54 }}
              >
                <span className="label">%</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {activos.map((h, hi) => {
              const color = h.color || hashColor(h.nombre)
              const pct = pctHabitoRange(h, regMap, new Date(year, month, 1), new Date(year, month, nDias))
              const streak = calcStreak(h, regMap)
              return (
                <tr key={h.id} style={{ animation: `slideUp 320ms cubic-bezier(0.22,1,0.36,1) ${hi * 35}ms both` }}>
                  <td
                    className="sticky left-0 z-10 px-3 py-1.5"
                    style={{ background: 'var(--panel-bg)', borderBottom: '1px solid var(--border)' }}
                  >
                    <button className="flex w-full items-center gap-2 text-left" onClick={() => select(h.id)}>
                      <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate1 text-[12px]">{h.nombre}</span>
                        {streak >= 3 && (
                          <span className="block text-[9.5px]" style={{ color }}>🔥 {streak} días</span>
                        )}
                      </span>
                    </button>
                  </td>
                  {dias.map((d) => {
                    const iso = toISODate(d)
                    const prog = isScheduled(h, d)
                    const futuro = iso > hoyISO
                    const v = valorOf(regMap, h.id, iso)
                    const reg = regOf(regMap, h.id, iso)
                    return (
                      <td key={iso} className="p-0 text-center" style={{ borderBottom: '1px solid var(--border)' }}>
                        {!prog ? (
                          <span className="block py-2 text-[10px] text-txt-mute">–</span>
                        ) : (
                          <button
                            disabled={futuro}
                            onClick={() => openCompletar(h, iso)}
                            title={reg?.nota || `${h.nombre} · ${fmtDate(iso)}`}
                            className="mx-auto my-1 block h-[19px] w-[19px] rounded-[5px] transition-all duration-200 ease-spring hover:scale-125 disabled:cursor-not-allowed"
                            style={{
                              background:
                                v >= 1
                                  ? color
                                  : v > 0
                                    ? `color-mix(in srgb, ${color} 45%, transparent)`
                                    : futuro
                                      ? 'color-mix(in srgb, var(--elev) 55%, transparent)'
                                      : 'color-mix(in srgb, var(--elev) 95%, transparent)',
                              boxShadow:
                                v > 0
                                  ? `0 0 8px -2px ${color}`
                                  : `inset 0 0 0 1px ${iso === hoyISO ? 'var(--accent)' : 'var(--border-2)'}`,
                              opacity: futuro ? 0.35 : 1,
                            }}
                          >
                            {reg?.nota && (
                              <span className="block h-full w-full rounded-[5px]" style={{ boxShadow: 'inset 0 0 0 1px #fff6' }} />
                            )}
                          </button>
                        )}
                      </td>
                    )
                  })}
                  <td
                    className="sticky right-0 z-10 px-2 text-right"
                    style={{ background: 'var(--panel-bg)', borderBottom: '1px solid var(--border)' }}
                  >
                    <span
                      className="mono tnum text-[11.5px] font-semibold"
                      style={{ color: pct == null ? 'var(--mute)' : pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)' }}
                    >
                      {pct == null ? '—' : `${Math.round(pct)}%`}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ═══ Progreso ═════════════════════════════════════════════════════ */
function Progreso() {
  const { habitos, registros, select } = useHabitos()
  const regMap = useMemo(() => buildRegMap(registros), [registros])
  const activos = habitos.filter((h) => h.activo !== false)
  const hoy = startOfDay(new Date())

  const semana = pctRange(activos, regMap, addDays(hoy, -6), hoy)
  const mes = pctRange(activos, regMap, addDays(hoy, -29), hoy)
  const tend = tendencia(activos, regMap, 7)

  // Heatmap de los últimos ~13 semanas (3 meses), columnas = semanas.
  const weeks = useMemo(() => {
    const start = startOfWeek(addDays(hoy, -90))
    const out = []
    for (let w = 0; w < 14; w++) {
      const col = []
      for (let d = 0; d < 7; d++) {
        const day = addDays(start, w * 7 + d)
        if (day > hoy) { col.push(null); continue }
        const p = dayPct(activos, regMap, day)
        col.push({
          label: fmtDate(toISODate(day), { day: '2-digit', month: 'short' }),
          hint: p == null ? 'sin programar' : `${Math.round(p * 100)}%`,
          color: heatColor(p),
          today: toISODate(day) === toISODate(hoy),
          iso: toISODate(day),
        })
      }
      out.push(col)
    }
    return out
  }, [activos, regMap]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sparkline: % por mes de los últimos 6 meses.
  const seis = useMemo(() => {
    const out = []
    for (let i = 5; i >= 0; i--) {
      const d = addMonths(hoy, -i)
      const ini = new Date(d.getFullYear(), d.getMonth(), 1)
      const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      out.push(pctRange(activos, regMap, ini, fin) ?? 0)
    }
    return out
  }, [activos, regMap]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!activos.length) {
    return <Card><Empty icon={TrendingUp} title="Nada para medir todavía" body="Creá un hábito y en unos días vas a ver acá tu tendencia." /></Card>
  }

  return (
    <div className="space-y-3">
      <div className="stagger grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Últimos 7 días" value={semana == null ? '—' : `${Math.round(semana)}%`} animate={false} tone={semana >= 70 ? 'good' : semana >= 40 ? 'warn' : 'bad'} icon={Activity} />
        <Stat label="Últimos 30 días" value={mes == null ? '—' : `${Math.round(mes)}%`} animate={false} tone={mes >= 70 ? 'good' : 'warn'} />
        <Stat label="Tendencia" value={tend.delta == null ? '—' : `${tend.delta >= 0 ? '+' : ''}${Math.round(tend.delta)} pts`} animate={false} tone={tend.delta >= 0 ? 'good' : 'bad'} sub="vs. semana anterior" />
        <Stat label="Hábitos activos" value={activos.length} sub={`${habitos.length - activos.length} archivados`} />
      </div>

      <Card spot>
        <CardHead title="Momentum" icon={TrendingUp} />
        <div className="flex items-center gap-4 px-4 pb-4">
          <p className="flex-1 text-[13px] leading-relaxed text-txt-2">{mensajeMomentum(tend.delta, semana)}</p>
          <div className="shrink-0 text-right">
            <Sparkline data={seis} width={120} height={38} color="var(--accent)" />
            <div className="mt-1 text-[10px] text-txt-mute">últimos 6 meses</div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Mapa de calor" sub="Los últimos 3 meses · una columna por semana" />
        <div className="scroll px-4 pb-4">
          <Heatmap weeks={weeks} cell={14} gap={3} legend={heatColor} />
        </div>
      </Card>

      <Card>
        <CardHead title="Hábito por hábito" />
        <div className="scroll max-h-[420px] px-1 pb-2">
          <table className="tbl">
            <thead>
              <tr>
                <th>Hábito</th>
                <th>Frecuencia</th>
                <th className="num">Racha</th>
                <th className="num">Máxima</th>
                <th className="num">30 días</th>
                <th style={{ width: 110 }}>Últimas 6 sem.</th>
              </tr>
            </thead>
            <tbody>
              {activos.map((h) => {
                const color = h.color || hashColor(h.nombre)
                const st = calcStreak(h, regMap)
                const max = calcMaxStreak(h, regMap)
                const p30 = pctHabitoRange(h, regMap, addDays(hoy, -29), hoy)
                const spark = Array.from({ length: 6 }, (_, i) => {
                  const fin = addDays(hoy, -(5 - i) * 7)
                  return pctHabitoRange(h, regMap, addDays(fin, -6), fin) ?? 0
                })
                return (
                  <tr key={h.id} className="cursor-pointer" onClick={() => select(h.id)}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="h-5 w-1 rounded-full" style={{ background: color }} />
                        <span className="truncate1 text-[12.5px]">{h.nombre}</span>
                      </div>
                    </td>
                    <td className="text-[11px] text-txt-sub">{frecuenciaTexto(h)}</td>
                    <td className="num">{st >= 3 ? `🔥 ${st}` : st}</td>
                    <td className="num text-txt-sub">{max}</td>
                    <td className="num font-semibold" style={{ color: p30 == null ? 'var(--mute)' : p30 >= 80 ? 'var(--success)' : p30 >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                      {p30 == null ? '—' : `${Math.round(p30)}%`}
                    </td>
                    <td><Sparkline data={spark} width={100} height={22} color={color} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

/* ═══ Historial ════════════════════════════════════════════════════ */
function Historial() {
  const { habitos, registros, refMes, filtroHistorial, setFiltroHistorial, openCompletar } = useHabitos()
  const regMap = useMemo(() => buildRegMap(registros), [registros])
  const ref = parseDate(refMes) || new Date()
  const activos = habitos.filter((h) => h.activo !== false)
  const conjunto = filtroHistorial ? activos.filter((h) => h.id === filtroHistorial) : activos
  const grid = useMemo(() => monthGrid(ref.getFullYear(), ref.getMonth()), [refMes]) // eslint-disable-line react-hooks/exhaustive-deps
  const hoy = startOfDay(new Date())

  const notasDelMes = useMemo(
    () =>
      registros
        .filter((r) => r.nota && String(r.fecha).slice(0, 7) === toISODate(ref).slice(0, 7))
        .filter((r) => !filtroHistorial || r.habito_id === filtroHistorial)
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))),
    [registros, refMes, filtroHistorial], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <div className="space-y-3">
      <Card spot>
        <CardHead
          title="Calendario del mes"
          sub="Color por % de cumplimiento del día"
          icon={History}
          right={
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setFiltroHistorial(null)}>
                <Chip active={!filtroHistorial} color="var(--accent)">Todos</Chip>
              </button>
              {activos.slice(0, 5).map((h) => (
                <button key={h.id} onClick={() => setFiltroHistorial(filtroHistorial === h.id ? null : h.id)}>
                  <Chip active={filtroHistorial === h.id} color={h.color || hashColor(h.nombre)}>{h.nombre}</Chip>
                </button>
              ))}
            </div>
          }
        />
        <div className="grid grid-cols-7 px-3">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
            <div key={d} className="label py-1.5 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5 px-3 pb-4">
          {grid.map((d, i) => {
            const iso = toISODate(d)
            const fuera = d.getMonth() !== ref.getMonth()
            const futuro = d > hoy
            const p = futuro ? null : dayPct(conjunto, regMap, d)
            const notas = registros.filter(
              (r) => r.fecha === iso && r.nota && (!filtroHistorial || r.habito_id === filtroHistorial),
            )
            const esHoy = iso === toISODate(hoy)
            return (
              <div
                key={iso}
                className="group relative aspect-square rounded-[9px] p-1.5 transition-all duration-200 ease-swift hover:-translate-y-0.5 hover:scale-[1.04]"
                style={{
                  background: futuro ? 'color-mix(in srgb, var(--elev) 35%, transparent)' : heatColor(p),
                  opacity: fuera ? 0.3 : 1,
                  boxShadow: esHoy ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1px var(--border)',
                  animation: `scaleIn 260ms cubic-bezier(0.22,1,0.36,1) ${i * 6}ms both`,
                }}
                title={p == null ? `${fmtDate(iso)} · sin programar` : `${fmtDate(iso)} · ${Math.round(p * 100)}%`}
              >
                <div className="mono text-[10.5px]" style={{ color: p != null && p > 0.6 ? '#fff' : 'var(--subtext)' }}>
                  {d.getDate()}
                </div>
                {notas.length > 0 && (
                  <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-white/70" title={notas.map((n) => n.nota).join(' · ')} />
                )}
                {notas.length > 0 && (
                  <div
                    className="panel pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 w-max max-w-[220px] -translate-x-1/2 px-2.5 py-1.5 text-left opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    style={{ boxShadow: '0 16px 32px -16px #000' }}
                  >
                    {notas.map((n) => {
                      const h = habitos.find((x) => x.id === n.habito_id)
                      return (
                        <div key={n.id} className="text-[10.5px] leading-snug">
                          <b style={{ color: h?.color || 'var(--accent)' }}>{h?.nombre}: </b>
                          {n.nota}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <CardHead title="Notas del mes" sub={`${notasDelMes.length} registro${notasDelMes.length === 1 ? '' : 's'} con nota`} />
        {notasDelMes.length === 0 ? (
          <Empty title="Sin notas" body="Al marcar una celda podés dejar una nota corta; queda acá y en el hover del calendario." />
        ) : (
          <div className="scroll max-h-[300px] space-y-1.5 px-3.5 pb-3.5">
            {notasDelMes.map((n, i) => {
              const h = habitos.find((x) => x.id === n.habito_id)
              return (
                <div
                  key={n.id}
                  className="surface flex items-start gap-2.5 px-3 py-2"
                  style={{ animation: `slideUp 300ms cubic-bezier(0.22,1,0.36,1) ${i * 30}ms both` }}
                >
                  <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: h?.color || 'var(--accent)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate1 text-[12px] font-medium">{h?.nombre || 'Hábito'}</span>
                      <span className="mono shrink-0 text-[10px] text-txt-mute">{fmtDate(n.fecha)}</span>
                      <span className="badge ml-auto shrink-0">{n.valor >= 1 ? 'total' : 'parcial'}</span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-txt-sub">{n.nota}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ═══ Panel izquierdo ══════════════════════════════════════════════ */
function HabitosLeft() {
  const { habitos, registros, selectedId, select, openModal, openCompletar } = useHabitos()
  const regMap = useMemo(() => buildRegMap(registros), [registros])
  const hoy = new Date()
  const hoyISO = toISODate(hoy)
  const activos = habitos.filter((h) => h.activo !== false)
  const programados = activos.filter((h) => isScheduled(h, hoy))
  const hechos = programados.reduce((a, h) => a + valorOf(regMap, h.id, hoyISO), 0)

  return (
    <div className="space-y-3">
      <Card spot>
        <CardHead
          title="Hoy"
          sub={programados.length ? `${hechos.toFixed(1).replace('.0', '')} de ${programados.length} programados` : 'Nada programado hoy'}
          icon={Flame}
        />
        <div className="px-3.5 pb-3.5">
          <Progress
            value={hechos}
            max={programados.length || 1}
            color={hechos >= programados.length && programados.length ? 'var(--success)' : 'var(--accent)'}
            height={7}
            showPct
            label={programados.length ? 'Progreso del día' : ''}
          />
        </div>
      </Card>

      <Card>
        <CardHead
          title="Hábitos"
          sub={`${activos.length} activo${activos.length === 1 ? '' : 's'}`}
          right={<IconButton icon={Plus} label="Nuevo hábito" onClick={() => openModal(null)} />}
        />
        <div className="scroll max-h-[58vh] space-y-1 px-2.5 pb-3">
          {activos.length === 0 ? (
            <p className="px-1.5 py-4 text-center text-[11.5px] text-txt-mute">Sin hábitos todavía.</p>
          ) : (
            activos.map((h, i) => {
              const color = h.color || hashColor(h.nombre)
              const st = statusDia(h, regMap, hoy)
              const streak = calcStreak(h, regMap)
              const on = selectedId === h.id
              return (
                <div
                  key={h.id}
                  className="group flex items-center gap-2 rounded-[9px] px-1.5 py-1.5 transition-all duration-200"
                  style={{
                    background: on ? `color-mix(in srgb, ${color} 15%, transparent)` : undefined,
                    boxShadow: on ? `inset 0 0 0 1px color-mix(in srgb, ${color} 34%, transparent)` : undefined,
                    animation: `slideUp 300ms cubic-bezier(0.22,1,0.36,1) ${i * 30}ms both`,
                  }}
                >
                  <button
                    disabled={st === 'libre'}
                    onClick={() => openCompletar(h, hoyISO)}
                    className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] transition-all duration-200 ease-spring disabled:opacity-40"
                    style={{
                      border: `1.5px solid ${st === 'libre' ? 'var(--border-2)' : color}`,
                      background: st === 'hecho' ? color : st === 'parcial' ? `color-mix(in srgb, ${color} 45%, transparent)` : 'transparent',
                    }}
                    title={st === 'libre' ? 'Hoy no toca' : 'Marcar'}
                  >
                    {st === 'hecho' && (
                      <svg width="10" height="10" viewBox="0 0 12 12" className="a-pop">
                        <path d="M2 6.2 4.6 8.8 10 3.4" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
                      </svg>
                    )}
                    {st === 'parcial' && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    {st === 'libre' && <span className="text-[9px] text-txt-mute">–</span>}
                  </button>
                  <button className="min-w-0 flex-1 text-left" onClick={() => select(h.id)}>
                    <span className={cx('block truncate1 text-[12.5px]', st === 'hecho' && 'text-txt-mute line-through')}>
                      {h.nombre}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-txt-mute">
                      {streak >= 3 ? <span style={{ color }}>🔥 {streak}</span> : null}
                      {h.hora && <span className="mono">{h.hora}</span>}
                      {h.categoria && <span>{h.categoria}</span>}
                    </span>
                  </button>
                  <IconButton
                    icon={Pencil}
                    size={11}
                    label="Editar"
                    className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => openModal(h)}
                  />
                </div>
              )
            })
          )}
        </div>
        {habitos.some((h) => h.activo === false) && (
          <div className="border-t border-line px-3.5 py-2">
            <span className="text-[10.5px] text-txt-mute">
              {habitos.filter((h) => h.activo === false).length} hábito(s) archivados
            </span>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ═══ Panel derecho: detalle ═══════════════════════════════════════ */
function HabitosRight() {
  const { habitos, registros, selectedId, openModal, borrar, archivar } = useHabitos()
  const regMap = useMemo(() => buildRegMap(registros), [registros])
  const h = habitos.find((x) => x.id === selectedId)
  const hoy = startOfDay(new Date())

  if (!h) {
    return (
      <Card>
        <Empty icon={Flame} title="Elegí un hábito" body="Hacé clic en un hábito del panel izquierdo para ver su racha, su historial y sus notas." />
      </Card>
    )
  }

  const color = h.color || hashColor(h.nombre)
  const streak = calcStreak(h, regMap)
  const max = calcMaxStreak(h, regMap)
  const pctMes = pctHabitoRange(h, regMap, new Date(hoy.getFullYear(), hoy.getMonth(), 1), hoy)
  const recientes = registros
    .filter((r) => r.habito_id === h.id)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    .slice(0, 12)

  return (
    <div className="space-y-3">
      <Card spot>
        <CardHead
          title={h.nombre}
          sub={frecuenciaTexto(h)}
          right={
            <>
              <IconButton icon={Pencil} label="Editar" onClick={() => openModal(h)} />
              <IconButton icon={Trash2} label="Eliminar" onClick={() => borrar(h.id)} />
            </>
          }
        />
        <div className="px-3.5 pb-3.5">
          {h.descripcion && <p className="mb-3 text-[12px] leading-relaxed text-txt-sub">{h.descripcion}</p>}
          <div className="grid grid-cols-3 gap-2">
            <div className="surface px-2 py-2.5 text-center">
              <div className="label">Racha</div>
              <div className="mono text-[18px] font-bold" style={{ color }}>{streak}</div>
            </div>
            <div className="surface px-2 py-2.5 text-center">
              <div className="label">Máxima</div>
              <div className="mono text-[18px] font-bold text-txt-2">{max}</div>
            </div>
            <div className="surface px-2 py-2.5 text-center">
              <div className="label">Mes</div>
              <div
                className="mono text-[18px] font-bold"
                style={{ color: pctMes == null ? 'var(--mute)' : pctMes >= 80 ? 'var(--success)' : 'var(--warning)' }}
              >
                {pctMes == null ? '—' : `${Math.round(pctMes)}`}
              </div>
            </div>
          </div>
          {h.categoria && <div className="mt-3"><Chip color={color}>{h.categoria}</Chip></div>}
        </div>
      </Card>

      <Card>
        <CardHead title="Últimos registros" />
        {recientes.length === 0 ? (
          <Empty title="Sin registros" body="Marcá una celda de la grilla para empezar." />
        ) : (
          <div className="scroll max-h-[38vh] space-y-1 px-3 pb-3">
            {recientes.map((r, i) => (
              <div
                key={r.id}
                className="surface flex items-start gap-2.5 px-2.5 py-1.5"
                style={{ animation: `slideUp 280ms cubic-bezier(0.22,1,0.36,1) ${i * 25}ms both` }}
              >
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: r.valor >= 1 ? 'var(--success)' : 'var(--warning)' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="mono text-[11.5px]">{fmtDate(r.fecha, { day: '2-digit', month: 'short' })}</span>
                    <span className="text-[10px] text-txt-mute">{r.valor >= 1 ? 'total' : 'parcial'}</span>
                  </div>
                  {r.nota && <p className="mt-0.5 text-[11px] leading-snug text-txt-sub">{r.nota}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHead title="Acciones" />
        <div className="flex gap-2 px-3.5 pb-3.5">
          <Button size="sm" className="flex-1" onClick={() => archivar(h)}>
            {h.activo === false ? 'Reactivar' : 'Archivar'}
          </Button>
          <Button size="sm" className="flex-1" icon={Pencil} onClick={() => openModal(h)}>Editar</Button>
        </div>
      </Card>
    </div>
  )
}
