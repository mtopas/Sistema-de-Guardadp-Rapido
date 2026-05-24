// Shared helpers for the Hábitos module

export const HABITO_COLORS = [
  '#7c3aed','#059669','#2563eb','#d97706','#dc2626',
  '#db2777','#0891b2','#65a30d','#9333ea','#ea580c',
]

export const DIAS_SEMANA = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
export const DIAS_SEMANA_FULL = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']

/** Returns true if `date` (Date) is a scheduled day for `habito`. */
export function isScheduled(habito, date) {
  if (!habito.activo) return false
  if (habito.frecuencia_tipo === 'diario') return true
  const dias = parseDias(habito.dias_semana)
  return dias.includes(date.getDay())
}

export function parseDias(raw) {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

/** YYYY-MM-DD string from a Date */
export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Build a Map keyed by "habitoId-fecha" from registros array */
export function buildRegistrosMap(registros) {
  const map = {}
  for (const r of registros) {
    map[`${r.habito_id}-${r.fecha}`] = r
  }
  return map
}

/**
 * Compute current streak for a habit.
 * Streak = consecutive scheduled days with valor > 0, going backwards from today.
 * Non-scheduled days are skipped (don't break the streak).
 */
export function calcStreak(habito, registrosMap) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let streak = 0
  const d = new Date(today)
  const startISO = habito.creado_en ? habito.creado_en.slice(0, 10) : '2000-01-01'

  for (let i = 0; i < 400; i++) {
    const dateStr = toISODate(d)
    if (dateStr < startISO) break

    if (isScheduled(habito, d)) {
      const reg = registrosMap[`${habito.id}-${dateStr}`]
      if (reg && reg.valor > 0) {
        streak++
      } else if (d <= today) {
        break // scheduled day in the past with no completion — breaks streak
      }
    }
    d.setDate(d.getDate() - 1)
  }
  return streak
}

/**
 * % completion for the given month (0-indexed).
 * Uses the registros from registrosMap.
 * Only counts up to today for the current month.
 */
export function calcMonthPct(habito, registrosMap, year, month) {
  const today = new Date()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()
  const maxDay = isCurrentMonth ? today.getDate() : daysInMonth

  let scheduled = 0
  let total = 0
  for (let d = 1; d <= maxDay; d++) {
    const date = new Date(year, month, d)
    if (isScheduled(habito, date)) {
      scheduled++
      const dateStr = toISODate(date)
      const reg = registrosMap[`${habito.id}-${dateStr}`]
      if (reg) total += reg.valor
    }
  }
  return scheduled > 0 ? Math.round((total / scheduled) * 100) : 0
}

/**
 * Compute the all-time maximum streak for a habit.
 * Walks ALL registros sorted by date and tracks the longest run of
 * consecutive SCHEDULED days with valor > 0. Non-scheduled days are skipped.
 */
export function calcMaxStreak(habito, registrosMap) {
  if (!habito.creado_en) return 0
  const startISO = habito.creado_en.slice(0, 10)
  const today    = new Date(); today.setHours(0, 0, 0, 0)

  let maxStreak = 0
  let cur       = 0
  const d       = new Date(startISO + 'T00:00:00')

  while (d <= today) {
    if (isScheduled(habito, d)) {
      const dateStr = toISODate(d)
      const reg     = registrosMap[`${habito.id}-${dateStr}`]
      if (reg && reg.valor > 0) {
        cur++
        if (cur > maxStreak) maxStreak = cur
      } else if (d < today) {
        cur = 0
      }
    }
    d.setDate(d.getDate() + 1)
  }
  return maxStreak
}

/** Today's status for a habit: 'done' | 'partial' | 'pending' | 'off' */
export function todayStatus(habito, registrosMap) {
  const today = new Date()
  if (!isScheduled(habito, today)) return 'off'
  const dateStr = toISODate(today)
  const reg = registrosMap[`${habito.id}-${dateStr}`]
  if (!reg) return 'pending'
  if (reg.valor >= 1) return 'done'
  return 'partial'
}
