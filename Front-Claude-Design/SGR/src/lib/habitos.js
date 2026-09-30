// Helpers de Hábitos. `dias_semana` es un JSON array con índices JS: 0 = Domingo … 6 = Sábado.
// Regla de racha: días consecutivos con valor > 0; un día no programado no rompe la racha.

import { addDays, parseDate, startOfDay, toISODate } from './dates'

export function diasDe(h) {
  if (!h?.dias_semana) return []
  try {
    const v = typeof h.dias_semana === 'string' ? JSON.parse(h.dias_semana) : h.dias_semana
    return Array.isArray(v) ? v.map(Number).filter((n) => n >= 0 && n <= 6) : []
  } catch {
    return []
  }
}

export const creadoISO = (h) => String(h?.creado_en || '').slice(0, 10) || '0000-00-00'

export function isScheduled(h, date) {
  if (!h || h.activo === false || h.activo === 0) return false
  const iso = typeof date === 'string' ? date : toISODate(date)
  if (iso < creadoISO(h)) return false
  if (h.frecuencia_tipo !== 'semanal') return true
  const d = typeof date === 'string' ? parseDate(date) : date
  return d ? diasDe(h).includes(d.getDay()) : false
}

/** Mapa `${habito_id}|${fecha}` → registro. */
export function buildRegMap(registros) {
  const m = new Map()
  for (const r of registros || []) m.set(`${r.habito_id}|${r.fecha}`, r)
  return m
}
export const regOf = (map, hid, iso) => map.get(`${hid}|${iso}`)
export const valorOf = (map, hid, iso) => Number(regOf(map, hid, iso)?.valor || 0)

export function calcStreak(h, map, today = new Date()) {
  let streak = 0
  let d = startOfDay(today)
  const floor = creadoISO(h)
  // Hoy programado pero todavía pendiente no rompe la racha: se empieza a contar ayer.
  if (isScheduled(h, d) && !(valorOf(map, h.id, toISODate(d)) > 0)) d = addDays(d, -1)
  for (let i = 0; i < 900; i++) {
    const iso = toISODate(d)
    if (iso < floor) break
    if (isScheduled(h, d)) {
      if (valorOf(map, h.id, iso) > 0) streak++
      else break
    }
    d = addDays(d, -1)
  }
  return streak
}

export function calcMaxStreak(h, map, today = new Date()) {
  let best = 0
  let cur = 0
  const t = startOfDay(today)
  const start = parseDate(creadoISO(h)) || addDays(t, -400)
  let d = start < addDays(t, -900) ? addDays(t, -900) : startOfDay(start)
  const todayISO = toISODate(t)
  while (d <= t) {
    if (isScheduled(h, d)) {
      const iso = toISODate(d)
      if (valorOf(map, h.id, iso) > 0) { cur++; if (cur > best) best = cur }
      else if (iso !== todayISO) cur = 0
    }
    d = addDays(d, 1)
  }
  return best
}

/** % de cumplimiento en [desde, hasta] = Σ valor / días programados. null si no había nada programado. */
export function pctRange(habitos, map, desde, hasta) {
  let prog = 0
  let done = 0
  const hoy = startOfDay(new Date())
  for (let d = startOfDay(desde); d <= hasta && d <= hoy; d = addDays(d, 1)) {
    const iso = toISODate(d)
    for (const h of habitos) {
      if (!isScheduled(h, d)) continue
      prog++
      done += valorOf(map, h.id, iso)
    }
  }
  return prog ? (done / prog) * 100 : null
}

export function pctHabitoRange(h, map, desde, hasta) {
  let prog = 0
  let done = 0
  const hoy = startOfDay(new Date())
  for (let d = startOfDay(desde); d <= hasta && d <= hoy; d = addDays(d, 1)) {
    if (!isScheduled(h, d)) continue
    prog++
    done += valorOf(map, h.id, toISODate(d))
  }
  return prog ? (done / prog) * 100 : null
}

/** Fracción 0..1 del día (null si no había nada programado). */
export function dayPct(habitos, map, d) {
  let prog = 0
  let done = 0
  const iso = toISODate(d)
  for (const h of habitos) {
    if (!isScheduled(h, d)) continue
    prog++
    done += valorOf(map, h.id, iso)
  }
  return prog ? done / prog : null
}

export const ESTADOS = {
  hecho: { label: 'Hecho', color: 'var(--success)' },
  parcial: { label: 'Parcial', color: 'var(--warning)' },
  pendiente: { label: 'Pendiente', color: 'var(--mute)' },
  libre: { label: 'No toca', color: 'var(--border-2)' },
}

export function statusDia(h, map, d = new Date()) {
  if (!isScheduled(h, d)) return 'libre'
  const v = valorOf(map, h.id, toISODate(d))
  if (!v) return 'pendiente'
  return v >= 1 ? 'hecho' : 'parcial'
}

export function frecuenciaTexto(h) {
  if (h?.frecuencia_tipo !== 'semanal') return h?.hora ? `Todos los días · ${h.hora}` : 'Todos los días'
  const nombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const d = diasDe(h)
  if (!d.length) return 'Sin días asignados'
  const txt = [...d].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((x) => nombres[x]).join(' · ')
  return h.hora ? `${txt} · ${h.hora}` : txt
}

/** Tendencia comparando las dos últimas ventanas de `dias` días. */
export function tendencia(habitos, map, dias = 7) {
  const hoy = startOfDay(new Date())
  const act = pctRange(habitos, map, addDays(hoy, -(dias - 1)), hoy)
  const ant = pctRange(habitos, map, addDays(hoy, -(dias * 2 - 1)), addDays(hoy, -dias))
  if (act == null || ant == null) return { delta: null, act, ant }
  return { delta: act - ant, act, ant }
}

export function mensajeMomentum(delta, pct) {
  if (pct == null) return 'Todavía no hay hábitos programados para medir.'
  if (delta == null) return `Vas al ${Math.round(pct)}% esta semana. Falta historia para comparar.`
  if (delta > 12) return `En alza: ${Math.round(delta)} puntos mejor que la semana pasada. Momentum a favor.`
  if (delta > 3) return `Subiendo de a poco: +${Math.round(delta)} puntos contra la semana pasada.`
  if (delta > -3) return `Parejo con la semana pasada (${Math.round(pct)}%). La constancia ya es el logro.`
  if (delta > -12) return `Bajó ${Math.round(-delta)} puntos. Nada grave, pero conviene recuperar uno o dos hábitos.`
  return `Caída de ${Math.round(-delta)} puntos. Elegí el hábito más fácil y arrancá por ahí.`
}

/** Color del heatmap según fracción 0..1 (null = no programado). */
export function heatColor(pct) {
  if (pct == null) return 'color-mix(in srgb, var(--elev) 45%, transparent)'
  if (pct <= 0) return 'color-mix(in srgb, var(--danger) 16%, transparent)'
  if (pct < 0.34) return 'color-mix(in srgb, var(--warning) 32%, transparent)'
  if (pct < 0.67) return 'color-mix(in srgb, var(--warning) 62%, transparent)'
  if (pct < 1) return 'color-mix(in srgb, var(--success) 62%, transparent)'
  return 'var(--success)'
}
