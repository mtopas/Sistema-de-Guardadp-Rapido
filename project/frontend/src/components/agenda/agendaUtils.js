// Converts a Date to a local ISO date string (YYYY-MM-DD) without UTC conversion.
// Using toISOString() would shift dates by the timezone offset (e.g. UTC-3 Argentina
// gives the wrong date after 21:00 local time).
export const toLocalISODate = (d = new Date()) => {
  const offset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offset).toISOString().slice(0, 10)
}

export const HOURS = Array.from({ length: 18 }, (_, i) => i + 6) // 6–23
export const HOUR_HEIGHT = 56 // px per hour

export const timeToMinutes = (s) => {
  if (!s) return null
  const [h, m] = s.split(':').map(Number)
  return h * 60 + (m || 0)
}

export const minutesToTop = (minutes, startHour = 6) =>
  ((minutes - startHour * 60) / 60) * HOUR_HEIGHT
