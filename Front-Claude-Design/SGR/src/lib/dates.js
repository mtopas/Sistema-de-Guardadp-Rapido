// Todo en hora local: `toISOString()` corre las fechas -3h y rompe los días.

export const pad = (n) => String(n).padStart(2, '0')

export const toISODate = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const toISOMonth = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`

export const toLocalDT = (d = new Date()) => `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export function parseDate(s) {
  if (!s) return null
  if (s instanceof Date) return s
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s))
  if (!m) {
    const d = new Date(s)
    return isNaN(d) ? null : d
  }
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

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export function startOfWeek(d) {
  const x = startOfDay(d)
  return addDays(x, -((x.getDay() + 6) % 7)) // lunes primero
}

export const endOfWeek = (d) => addDays(startOfWeek(d), 6)

export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
export const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0)
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()

export const sameDay = (a, b) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export const isToday = (d) => sameDay(d, new Date())

export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
export const MESES_C = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
// Índice JS: 0 = Domingo
export const DIAS_C = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
export const DIAS_L = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
// Índice lunes-primero: 0 = Lunes (convención de agenda_horario_facultad)
export const DIAS_LUN = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
export const DIAS_LUN_L = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']

export const jsToMon = (jsDay) => (jsDay + 6) % 7
export const monToJs = (i) => (i + 1) % 7

export function fmtDate(s, opts = { day: '2-digit', month: 'short' }) {
  const d = parseDate(s)
  return d && !isNaN(d) ? d.toLocaleDateString('es-AR', opts) : ''
}

export const fmtDateLong = (s) => fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long' })

export function fmtTime(s) {
  const d = parseDate(s)
  return d && !isNaN(d) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ''
}

export const hasTime = (s) => typeof s === 'string' && /T\d{2}:\d{2}/.test(s)

export function timeToMin(t) {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + (m || 0)
}

export const minToTime = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(Math.round(min % 60))}`

export function relTime(s) {
  const d = parseDate(s)
  if (!d) return ''
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 0) return `en ${humanDur(-diff)}`
  if (diff < 45) return 'recién'
  if (diff < 86400 * 7) return `hace ${humanDur(diff)}`
  return fmtDate(s, { day: '2-digit', month: 'short', year: '2-digit' })
}

function humanDur(sec) {
  if (sec < 3600) return `${Math.max(1, Math.floor(sec / 60))} min`
  if (sec < 86400) return `${Math.floor(sec / 3600)} h`
  return `${Math.floor(sec / 86400)} d`
}

export const monthLabel = (ym) => {
  const [y, m] = String(ym).split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}

export const monthLabelShort = (ym) => {
  const [y, m] = String(ym).split('-').map(Number)
  return `${MESES_C[m - 1]} ${String(y).slice(2)}`
}

export const shiftMonth = (ym, n) => {
  const [y, m] = String(ym).split('-').map(Number)
  return toISOMonth(new Date(y, m - 1 + n, 1))
}

export const monthDiff = (a, b) => {
  const [ay, am] = String(a).split('-').map(Number)
  const [by, bm] = String(b).split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

export const monthRange = (from, to) => {
  const out = []
  let cur = from
  for (let i = 0; i < 600 && monthDiff(cur, to) >= 0; i++) {
    out.push(cur)
    cur = shiftMonth(cur, 1)
  }
  return out
}

// Rejilla de 6×7 días que arranca el lunes de la semana del día 1.
export function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const start = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}
