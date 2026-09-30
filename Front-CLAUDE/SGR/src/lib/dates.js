// Fechas siempre en hora local (evita el corrimiento UTC−3 de toISOString).

export const pad = (n) => String(n).padStart(2, '0')

export function toISODate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function toISOMonth(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function toLocalDateTime(d = new Date()) {
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function parseDate(s) {
  if (!s) return null
  if (s instanceof Date) return s
  // "YYYY-MM-DD" → medianoche local; con hora → local
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s)
  if (!m) return new Date(s)
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
}

export function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function addMonths(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()
  x.setDate(Math.min(d.getDate(), last))
  return x
}

export function startOfWeek(d, mondayFirst = true) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = x.getDay()
  const diff = mondayFirst ? (day + 6) % 7 : day
  return addDays(x, -diff)
}

export function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate()
}

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
// Índice JS (0 = Domingo)
export const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const DIAS_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
// Semana empezando en lunes (índice 0 = Lunes) — convención de la API de Agenda
export const DIAS_LUN = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const DIAS_LUN_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// JS getDay() (0=Dom) → índice lunes-primero (0=Lun)
export const jsToMon = (jsDay) => (jsDay + 6) % 7

export function fmtDate(s, opts = { day: '2-digit', month: 'short' }) {
  const d = parseDate(s)
  if (!d || isNaN(d)) return ''
  return d.toLocaleDateString('es-AR', opts)
}

export function fmtDateLong(s) {
  const d = parseDate(s)
  if (!d || isNaN(d)) return ''
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function fmtTime(s) {
  const d = parseDate(s)
  if (!d || isNaN(d)) return ''
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function hasTime(s) {
  return typeof s === 'string' && /T\d{2}:\d{2}/.test(s)
}

export function timeToMin(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function minToTime(min) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${pad(Math.min(h, 23))}:${pad(m)}`
}

export function relativeTime(s) {
  const d = parseDate(s)
  if (!d) return ''
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'recién'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)} d`
  return fmtDate(s, { day: '2-digit', month: 'short', year: '2-digit' })
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}

export function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return toISOMonth(d)
}

export function monthDiff(a, b) {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}
