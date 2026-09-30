// Helpers de Hábitos. `dias_semana` usa 0 = Domingo … 6 = Sábado (JS getDay()).
import { addDays, parseDate, toISODate } from './dates'

export function diasDe(h) {
  if (!h?.dias_semana) return []
  try {
    const v = typeof h.dias_semana === 'string' ? JSON.parse(h.dias_semana) : h.dias_semana
    return Array.isArray(v) ? v.map(Number) : []
  } catch {
    return []
  }
}

export function creadoISO(h) {
  return (h?.creado_en || '').slice(0, 10) || '0000-00-00'
}

export function isScheduled(h, date) {
  if (!h || h.activo === false) return false
  const iso = typeof date === 'string' ? date : toISODate(date)
  if (iso < creadoISO(h)) return false
  if (h.frecuencia_tipo !== 'semanal') return true
  const d = typeof date === 'string' ? parseDate(date) : date
  return diasDe(h).includes(d.getDay())
}

// Mapa `${habito_id}|${fecha}` → registro
export function buildRegMap(registros) {
  const m = new Map()
  for (const r of registros || []) m.set(`${r.habito_id}|${r.fecha}`, r)
  return m
}

export const regOf = (map, hid, iso) => map.get(`${hid}|${iso}`)

export function calcStreak(h, map, today = new Date()) {
  let streak = 0
  let d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const floor = creadoISO(h)
  // Hoy programado y todavía pendiente no rompe la racha.
  const todayISO = toISODate(d)
  if (isScheduled(h, d) && !(regOf(map, h.id, todayISO)?.valor > 0)) d = addDays(d, -1)
  for (let i = 0; i < 800; i++) {
    const iso = toISODate(d)
    if (iso < floor) break
    if (isScheduled(h, d)) {
      if (regOf(map, h.id, iso)?.valor > 0) streak++
      else break
    }
    d = addDays(d, -1)
  }
  return streak
}

export function calcMaxStreak(h, map, today = new Date()) {
  let best = 0
  let cur = 0
  const start = parseDate(creadoISO(h)) || addDays(today, -400)
  let d = start < addDays(today, -800) ? addDays(today, -800) : start
  while (d <= today) {
    if (isScheduled(h, d)) {
      if (regOf(map, h.id, toISODate(d))?.valor > 0) { cur++; best = Math.max(best, cur) }
      else if (toISODate(d) !== toISODate(today)) cur = 0
    }
    d = addDays(d, 1)
  }
  return best
}

// % de cumplimiento en un rango [desde, hasta] (Date) — suma valor / días programados
export function pctRange(habitos, map, desde, hasta) {
  let prog = 0
  let done = 0
  const today = new Date()
  for (let d = new Date(desde); d <= hasta && d <= today; d = addDays(d, 1)) {
    const iso = toISODate(d)
    for (const h of habitos) {
      if (!isScheduled(h, d)) continue
      prog++
      done += Number(regOf(map, h.id, iso)?.valor || 0)
    }
  }
  return prog ? (done / prog) * 100 : null
}

export function dayPct(habitos, map, d) {
  let prog = 0
  let done = 0
  const iso = toISODate(d)
  for (const h of habitos) {
    if (!isScheduled(h, d)) continue
    prog++
    done += Number(regOf(map, h.id, iso)?.valor || 0)
  }
  return prog ? done / prog : null
}

export function statusHoy(h, map, d = new Date()) {
  if (!isScheduled(h, d)) return 'libre'
  const r = regOf(map, h.id, toISODate(d))
  if (!r) return 'pendiente'
  return r.valor >= 1 ? 'hecho' : 'parcial'
}

export function frecuenciaTexto(h) {
  if (h.frecuencia_tipo !== 'semanal') return 'Todos los días'
  const nombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const d = diasDe(h)
  if (!d.length) return 'Sin días'
  return d.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((x) => nombres[x]).join(' · ')
}
