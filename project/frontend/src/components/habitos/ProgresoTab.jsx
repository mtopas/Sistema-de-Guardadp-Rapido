import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { buildRegistrosMap, calcStreak, calcMaxStreak, calcMonthPct, isScheduled, toISODate } from './habitosUtils'
import HabitosRightPanel from './HabitosRightPanel'

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function getMomentumMsg(pctThisWeek, pctLastWeek) {
  if (pctThisWeek >= 90) return { text: 'Semana excelente — seguís en racha', type: 'success' }
  if (pctThisWeek >= 70) return { text: 'Buena semana, seguí así', type: 'success' }
  if (pctThisWeek >= 50 && pctLastWeek > pctThisWeek) return { text: 'Ojo, estás cayendo — retomá hoy', type: 'warning' }
  if (pctThisWeek >= 50) return { text: 'A mitad de camino — podés más', type: 'warning' }
  if (pctLastWeek >= 70 && pctThisWeek < 50) return { text: 'Caíste esta semana — buen recovery empieza hoy', type: 'warning' }
  return { text: 'Esta semana podés hacer más — empezá hoy', type: 'muted' }
}

function getWeekBounds(weeksAgo = 0) {
  const now = new Date(); now.setHours(0,0,0,0)
  const dow = now.getDay()
  const startOfThisWeek = new Date(now); startOfThisWeek.setDate(now.getDate() - dow)
  const start = new Date(startOfThisWeek); start.setDate(start.getDate() - weeksAgo * 7)
  const end   = new Date(start); end.setDate(start.getDate() + 6)
  return { start, end }
}

function calcWeekPct(habitos, registrosMap, weeksAgo) {
  const { start, end } = getWeekBounds(weeksAgo)
  const today = new Date(); today.setHours(0,0,0,0)
  let scheduled = 0, done = 0
  for (let d = new Date(start); d <= end && d <= today; d.setDate(d.getDate() + 1)) {
    for (const h of habitos) {
      if (isScheduled(h, d)) {
        scheduled++
        const reg = registrosMap[`${h.id}-${toISODate(d)}`]
        if (reg) done += reg.valor
      }
    }
  }
  return scheduled > 0 ? Math.round((done / scheduled) * 100) : 0
}

export default function ProgresoTab({ selectedId, setSelectedId, onEdit, onHeatmapClick, onHabitoContextMenu }) {
  const habitos          = useStore(s => s.habitos)
  const habitosRegistros = useStore(s => s.habitosRegistros)

  const [catFilter, setCatFilter] = useState(null)

  const registrosMap = useMemo(() => buildRegistrosMap(habitosRegistros), [habitosRegistros])
  const activos      = useMemo(() => habitos.filter(h => h.activo), [habitos])
  const today        = new Date()

  // Available categories
  const categorias = useMemo(() => {
    const cats = activos.map(h => h.categoria).filter(Boolean)
    return [...new Set(cats)].sort()
  }, [activos])

  // Filtered habits for table/cards
  const filtered = useMemo(() =>
    catFilter ? activos.filter(h => h.categoria === catFilter) : activos,
    [activos, catFilter]
  )

  const pctThisWeek  = calcWeekPct(filtered, registrosMap, 0)
  const pctLastWeek  = calcWeekPct(filtered, registrosMap, 1)
  const pctThisMonth = useMemo(() => {
    const y = today.getFullYear(), m = today.getMonth()
    let s = 0, d = 0
    for (const h of filtered) {
      const daysInMonth = new Date(y, m + 1, 0).getDate()
      for (let day = 1; day <= Math.min(daysInMonth, today.getDate()); day++) {
        const date = new Date(y, m, day)
        if (isScheduled(h, date)) {
          s++
          const reg = registrosMap[`${h.id}-${toISODate(date)}`]
          if (reg) d += reg.valor
        }
      }
    }
    return s > 0 ? Math.round((d / s) * 100) : 0
  }, [filtered, registrosMap])

  const momentum = getMomentumMsg(pctThisWeek, pctLastWeek)

  // Heatmap: last 84 days using ALL activos (not filtered)
  const heatmapDays = useMemo(() => {
    const days = []
    for (let i = 83; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      const dateStr = toISODate(d)
      let s = 0, done = 0
      for (const h of activos) {
        if (isScheduled(h, d)) {
          s++
          const reg = registrosMap[`${h.id}-${dateStr}`]
          if (reg) done += reg.valor
        }
      }
      const pct = s > 0 ? done / s : null
      days.push({ dateStr, pct, d: new Date(d) })
    }
    return days
  }, [activos, registrosMap])

  // 6-month sparkline
  const sparkData = useMemo(() => {
    const data = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const y = d.getFullYear(), m = d.getMonth()
      const daysInMonth = new Date(y, m + 1, 0).getDate()
      let s = 0, done = 0
      for (const h of filtered) {
        const maxDay = (y === today.getFullYear() && m === today.getMonth()) ? today.getDate() : daysInMonth
        for (let day = 1; day <= maxDay; day++) {
          const date = new Date(y, m, day)
          if (isScheduled(h, date)) {
            s++
            const reg = registrosMap[`${h.id}-${toISODate(date)}`]
            if (reg) done += reg.valor
          }
        }
      }
      data.push({ label: MONTH_NAMES[m], pct: s > 0 ? Math.round((done / s) * 100) : 0 })
    }
    return data
  }, [filtered, registrosMap])

  // Habit stats table
  const habitStats = useMemo(() =>
    filtered.map(h => {
      const streak  = calcStreak(h, registrosMap)
      const maxStr  = calcMaxStreak(h, registrosMap)
      const pctMes  = calcMonthPct(h, registrosMap, today.getFullYear(), today.getMonth())
      const prevMonth = today.getMonth() === 0 ? 11 : today.getMonth() - 1
      const prevYear  = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
      const pctLast   = calcMonthPct(h, registrosMap, prevYear, prevMonth)
      const trend = pctMes > pctLast ? '↑' : pctMes < pctLast ? '↓' : '→'
      return { h, streak, maxStr, pctMes, pctLast, trend }
    }).sort((a, b) => b.pctMes - a.pctMes),
    [filtered, registrosMap]
  )

  // Cards mejor/peor hábito
  const mejorHabito = habitStats.length > 0 ? habitStats[0] : null
  const peorHabito  = habitStats.length > 1 ? habitStats[habitStats.length - 1] : null

  // Afirmaciones de identidad basadas en stats reales
  const afirmaciones = useMemo(() => {
    const afs = []
    const monthName = ['enero','febrero','marzo','abril','mayo','junio',
                       'julio','agosto','septiembre','octubre','noviembre','diciembre'][today.getMonth()]
    // Cuántos días programados completados este mes
    const y = today.getFullYear(), m = today.getMonth()
    let totalSched = 0, totalDone = 0
    for (const h of filtered) {
      for (let day = 1; day <= today.getDate(); day++) {
        const date = new Date(y, m, day)
        if (isScheduled(h, date)) {
          totalSched++
          const reg = registrosMap[`${h.id}-${toISODate(date)}`]
          if (reg && reg.valor > 0) totalDone++
        }
      }
    }
    if (totalSched > 0) {
      afs.push(`Completaste ${totalDone} de ${totalSched} sesiones programadas en ${monthName}.`)
    }
    // Mejor racha actual
    const maxStreakStat = habitStats.reduce((best, s) => s.streak > best ? s.streak : best, 0)
    const maxStreakHabito = habitStats.find(s => s.streak === maxStreakStat)
    if (maxStreakStat >= 3 && maxStreakHabito) {
      afs.push(`Llevas ${maxStreakStat} días seguidos con "${maxStreakHabito.h.nombre}".`)
    }
    // Mejor hábito del mes con % alto
    if (mejorHabito && mejorHabito.pctMes >= 70) {
      afs.push(`Tu hábito más consistente es "${mejorHabito.h.nombre}" con ${mejorHabito.pctMes}% este mes.`)
    }
    // Mejora respecto al mes anterior
    const improved = habitStats.filter(s => s.trend === '↑' && s.pctMes - s.pctLast >= 15)
    if (improved.length > 0) {
      afs.push(`"${improved[0].h.nombre}" mejoró ${improved[0].pctMes - improved[0].pctLast} puntos respecto al mes pasado.`)
    }
    return afs.slice(0, 3)
  }, [habitStats, filtered, registrosMap, mejorHabito])

  // Sparkline SVG
  const sparkW = 200, sparkH = 40
  const sparkPts = sparkData.map((d, i) => {
    const x = sparkData.length > 1 ? (i / (sparkData.length - 1)) * sparkW : sparkW / 2
    const y = sparkH - (d.pct / 100) * sparkH
    return [x, y]
  })
  const sparkPath = sparkPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const areaPath  = sparkPath + ` L ${sparkW} ${sparkH} L 0 ${sparkH} Z`

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Center */}
      <div className="flex-1 min-w-0 overflow-y-auto p-5 flex flex-col gap-5">

        {/* Filtro categorías */}
        {categorias.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setCatFilter(null)}
              className="chip text-[11px] transition-all"
              style={{
                background: !catFilter ? 'var(--accent)' : 'var(--surface)',
                color: !catFilter ? 'white' : 'var(--subtext)',
                borderColor: !catFilter ? 'var(--accent)' : 'var(--border)',
              }}
            >
              Todos
            </button>
            {categorias.map(c => (
              <button
                key={c}
                onClick={() => setCatFilter(catFilter === c ? null : c)}
                className="chip text-[11px] transition-all"
                style={{
                  background: catFilter === c ? 'var(--accent)' : 'var(--surface)',
                  color: catFilter === c ? 'white' : 'var(--subtext)',
                  borderColor: catFilter === c ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Esta semana', value: pctThisWeek, diff: pctThisWeek - pctLastWeek },
            { label: 'Este mes',    value: pctThisMonth, diff: null },
            { label: 'Sem. ant.',   value: pctLastWeek,  diff: null },
          ].map((s, i) => (
            <div key={i} className="panel-strong p-4">
              <div className="label mb-1">{s.label}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[26px] font-semibold tnum serif italic" style={{ color: 'var(--text)' }}>{s.value}%</span>
                {s.diff !== null && s.diff !== 0 && (
                  <span className="text-[12px] font-medium" style={{ color: s.diff > 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {s.diff > 0 ? '+' : ''}{s.diff} pp
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Momentum message */}
        <div
          className="rounded-xl px-4 py-3 text-[13px] font-medium"
          style={{
            background: momentum.type === 'success'
              ? 'color-mix(in oklch, var(--success) 12%, transparent)'
              : momentum.type === 'warning'
              ? 'color-mix(in oklch, var(--warning) 12%, transparent)'
              : 'var(--surface)',
            color: momentum.type === 'success' ? 'var(--success)'
              : momentum.type === 'warning' ? 'var(--warning)'
              : 'var(--subtext)',
            border: `1px solid color-mix(in oklch, ${
              momentum.type === 'success' ? 'var(--success)'
              : momentum.type === 'warning' ? 'var(--warning)'
              : 'var(--border)'
            } 30%, transparent)`,
          }}
        >
          {momentum.text}
        </div>

        {/* Afirmaciones de identidad */}
        {afirmaciones.length > 0 && (
          <div className="flex flex-col gap-2">
            {afirmaciones.map((af, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 px-4 py-2.5 rounded-xl text-[12.5px]"
                style={{
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ color: 'var(--accent)', fontSize: 14, lineHeight: 1.4 }}>✦</span>
                <span style={{ lineHeight: 1.5 }}>{af}</span>
              </div>
            ))}
          </div>
        )}

        {/* Cards mejor / peor hábito del mes */}
        {habitStats.length >= 2 && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Más consistente', stat: mejorHabito, icon: '🏆' },
              { label: 'Más fallas',      stat: peorHabito,  icon: '⚡' },
            ].map(({ label, stat, icon }) => stat && (
              <div key={label} className="panel-strong p-3">
                <div className="label mb-1.5">{label}</div>
                <div className="flex items-center gap-2">
                  <span className="text-[16px]">{icon}</span>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stat.h.color }} />
                  <span className="text-[12px] font-medium truncate flex-1" style={{ color: 'var(--text)' }}>
                    {stat.h.nombre}
                  </span>
                  <span className="text-[13px] font-semibold tnum shrink-0" style={{
                    color: stat.pctMes >= 80 ? 'var(--success)' : stat.pctMes >= 50 ? 'var(--warning)' : 'var(--danger)'
                  }}>
                    {stat.pctMes}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Heatmap */}
        <div className="panel-strong p-4">
          <div className="label mb-3">Últimos 3 meses</div>
          <div className="flex flex-wrap gap-1">
            {heatmapDays.map(({ dateStr, pct, d }) => {
              const bg = pct === null ? 'var(--border)'
                : pct === 0 ? 'color-mix(in oklch, var(--accent) 8%, transparent)'
                : pct <= 0.5 ? 'color-mix(in oklch, var(--warning) 50%, transparent)'
                : pct < 1 ? 'color-mix(in oklch, var(--accent) 60%, transparent)'
                : 'var(--accent)'
              return (
                <div
                  key={dateStr}
                  className="w-4 h-4 rounded-sm cursor-pointer transition-transform hover:scale-125"
                  style={{ background: bg }}
                  title={`${dateStr}: ${pct !== null ? Math.round(pct * 100) + '%' : 'sin datos'}`}
                  onClick={() => onHeatmapClick?.(d.getFullYear(), d.getMonth())}
                />
              )
            })}
          </div>
          <div className="flex items-center gap-2 mt-3 text-[10px]" style={{ color: 'var(--subtext)' }}>
            <span>Menos</span>
            {[0.08, 0.3, 0.6, 0.85, 1].map((o, i) => (
              <div key={i} className="w-3 h-3 rounded-sm" style={{ background: `color-mix(in oklch, var(--accent) ${Math.round(o * 100)}%, transparent)` }} />
            ))}
            <span>Más</span>
          </div>
        </div>

        {/* Sparkline */}
        <div className="panel-strong p-4">
          <div className="label mb-2">Últimos 6 meses</div>
          <svg viewBox={`0 0 ${sparkW} ${sparkH}`} className="w-full h-[44px]">
            <defs>
              <linearGradient id="hbSparkGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35"/>
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#hbSparkGrad)" />
            <path d={sparkPath} stroke="var(--accent)" strokeWidth="1.6" fill="none" />
            {sparkPts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={i === sparkPts.length - 1 ? 3 : 1.8}
                fill={i === sparkPts.length - 1 ? 'var(--accent-light)' : 'var(--accent)'} />
            ))}
          </svg>
          <div className="flex justify-between text-[10px] mono mt-1" style={{ color: 'var(--mute)' }}>
            {sparkData.map((d, i) => <span key={i}>{d.label}</span>)}
          </div>
        </div>

        {/* Habit stats table */}
        {habitStats.length > 0 && (
          <div className="panel-strong overflow-hidden">
            <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="label">Todos los hábitos</div>
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Hábito', 'Racha', 'Máx.', '% Mes', '% Ant.', ''].map(col => (
                    <th key={col} className="px-4 py-2 text-left font-medium label">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {habitStats.map(({ h, streak, maxStr, pctMes, pctLast, trend }) => (
                  <tr
                    key={h.id}
                    onClick={() => setSelectedId(selectedId === h.id ? null : h.id)}
                    onContextMenu={onHabitoContextMenu ? e => onHabitoContextMenu(e, h) : undefined}
                    className="cursor-pointer transition-colors"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: selectedId === h.id ? `color-mix(in oklch, ${h.color} 6%, transparent)` : 'transparent',
                    }}
                    onMouseEnter={e => { if (selectedId !== h.id) e.currentTarget.style.background = 'var(--surface)' }}
                    onMouseLeave={e => { if (selectedId !== h.id) e.currentTarget.style.background = 'transparent' }}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: h.color }} />
                        <span style={{ color: 'var(--text)' }}>{h.nombre}</span>
                        {h.categoria && (
                          <span className="chip text-[10px]" style={{ fontSize: 10 }}>{h.categoria}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 tnum" style={{ color: 'var(--warning)' }}>{streak}🔥</td>
                    <td className="px-4 py-2.5 tnum" style={{ color: 'var(--subtext)' }}>{maxStr}</td>
                    <td className="px-4 py-2.5 tnum font-medium" style={{ color: pctMes >= 80 ? 'var(--success)' : pctMes >= 50 ? 'var(--warning)' : 'var(--danger)' }}>{pctMes}%</td>
                    <td className="px-4 py-2.5 tnum" style={{ color: 'var(--subtext)' }}>{pctLast}%</td>
                    <td className="px-4 py-2.5" style={{ color: trend === '↑' ? 'var(--success)' : trend === '↓' ? 'var(--danger)' : 'var(--mute)' }}>{trend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right panel */}
      <HabitosRightPanel selectedId={selectedId} onEdit={onEdit} />
    </div>
  )
}
