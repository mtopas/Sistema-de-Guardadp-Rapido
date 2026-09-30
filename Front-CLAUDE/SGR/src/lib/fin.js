// Reglas de negocio de Finanzas (derivadas del README del proyecto):
// - Transferencias (tipo `transfer` o categoría "Transferencia") no cuentan como ingreso/gasto.
// - Cajón FIRE = categoría `FIRE`; cada objetivo tiene su categoría homónima.
// - En un cajón, el gasto suma y el ingreso resta.
// - Montos USD se convierten con el MEP (fallback: dólar default / oficial) antes de sumar.

import { addMonths, parseDate, toISOMonth } from './dates'

export const RESERVADAS = ['fire', 'transferencia', 'ajuste']

export function normalizeMov(m) {
  if (!m) return m
  return {
    ...m,
    tipo: m.tipo ?? m.type,
    monto: Number(m.monto ?? m.amount ?? 0),
    moneda: m.moneda ?? m.currency ?? 'ARS',
    fecha: m.fecha ?? m.date ?? m.datetime,
    descripcion: m.descripcion ?? m.desc ?? '',
    categoria_nombre: m.categoria_nombre ?? m.cat ?? null,
  }
}

export const isTransferencia = (m) =>
  m?.tipo === 'transfer' || (m?.categoria_nombre || '').trim().toLowerCase() === 'transferencia'

export const isAjuste = (m) => (m?.categoria_nombre || '').trim().toLowerCase() === 'ajuste'

export function dolarDe(config) {
  if (!config) return null
  const v = Number(config.dolar_mep || config.dolar_default || config.dolar_oficial || 0)
  return v > 0 ? v : null
}

export function toARS(m, dolar) {
  if (m.moneda === 'USD') return dolar ? m.monto * dolar : 0
  return m.monto
}

export function toUSD(m, dolar) {
  if (m.moneda === 'USD') return m.monto
  return dolar ? m.monto / dolar : 0
}

export function movMes(m) {
  return (m.fecha || '').slice(0, 7)
}

export function totalesMes(movs, mes, dolar, { excluirAjuste = true } = {}) {
  let ingresos = 0
  let gastos = 0
  for (const m of movs) {
    if (movMes(m) !== mes || isTransferencia(m)) continue
    if (excluirAjuste && isAjuste(m)) continue
    const v = toARS(m, dolar)
    if (m.tipo === 'income') ingresos += v
    else if (m.tipo === 'expense') gastos += v
  }
  const balance = ingresos - gastos
  const tasa = ingresos > 0 ? (balance / ingresos) * 100 : 0
  return { ingresos, gastos, balance, tasa }
}

export function porCategoria(movs, { tipo, mes, dolar, desde, hasta }) {
  const map = new Map()
  for (const m of movs) {
    if (m.tipo !== tipo || isTransferencia(m) || isAjuste(m)) continue
    const mm = movMes(m)
    if (mes && mm !== mes) continue
    if (desde && mm < desde) continue
    if (hasta && mm > hasta) continue
    const k = m.categoria_nombre || 'Sin categoría'
    map.set(k, (map.get(k) || 0) + toARS(m, dolar))
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

const eqName = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase()

// Aporte de un movimiento a un cajón (categoría con nombre `nombre`, o descripción igual al nombre).
export function aporteCajon(m, nombre) {
  if (!(eqName(m.categoria_nombre, nombre) || (!m.categoria_nombre && eqName(m.descripcion, nombre)))) return 0
  if (m.tipo === 'expense') return 1
  if (m.tipo === 'income') return -1
  return 0
}

export function acumuladoCajon(movs, nombre, dolar, { moneda = 'ARS', hastaMes } = {}) {
  let t = 0
  for (const m of movs) {
    const s = aporteCajon(m, nombre)
    if (!s) continue
    if (hastaMes && movMes(m) > hastaMes) continue
    t += s * (moneda === 'USD' ? toUSD(m, dolar) : toARS(m, dolar))
  }
  return t
}

export function fireUSDPorMes(movs, dolar) {
  const map = {}
  for (const m of movs) {
    const s = aporteCajon(m, 'FIRE')
    if (!s) continue
    const k = movMes(m)
    map[k] = (map[k] || 0) + s * toUSD(m, dolar)
  }
  return map
}

// Cuotas: el monto registrado es el total; cada cuota = total / N, mes a mes desde la compra.
export function cuotasActivas(movs, refMes) {
  const out = []
  for (const m of movs) {
    const n = Number(m.cuotas || 0)
    if (n <= 1 || m.tipo !== 'expense') continue
    const inicio = parseDate(m.fecha)
    if (!inicio) continue
    const cuotasMes = []
    for (let i = 0; i < n; i++) cuotasMes.push(toISOMonth(addMonths(inicio, i)))
    const idx = cuotasMes.indexOf(refMes)
    const pagadas = cuotasMes.filter((x) => x <= refMes).length
    if (pagadas >= n && idx === -1) continue
    if (cuotasMes[0] > refMes) continue
    out.push({
      mov: m,
      n,
      actual: idx === -1 ? pagadas : idx + 1,
      cuota: m.monto / n,
      restante: (m.monto / n) * (n - pagadas),
      fin: cuotasMes[n - 1],
    })
  }
  return out.sort((a, b) => a.fin.localeCompare(b.fin))
}

export function valorInstrumentoUSD(inst, dolar) {
  if (inst.tipo === 'plazo_fijo') {
    const cap = Number(inst.capital_ars || 0)
    const interes = interesPlazoFijo(inst)
    return dolar ? (cap + interes) / dolar : 0
  }
  const precio = Number(inst.precio_actual ?? 0)
  const cant = Number(inst.cantidad ?? 0)
  if (precio && cant) return precio * cant
  return Number(inst.costo_usd || 0)
}

export function costoInstrumentoUSD(inst, dolar) {
  if (inst.tipo === 'plazo_fijo') return dolar ? Number(inst.capital_ars || 0) / dolar : 0
  return Number(inst.costo_usd || 0)
}

export function interesPlazoFijo(inst, hoy = new Date()) {
  const cap = Number(inst.capital_ars || 0)
  const tna = Number(inst.tna || 0)
  const ini = parseDate(inst.fecha_inicio)
  if (!cap || !tna || !ini) return 0
  let fin = parseDate(inst.fecha_vencimiento) || hoy
  if (fin > hoy) fin = hoy
  const dias = Math.max(0, (fin - ini) / 86400000)
  return cap * (tna / 100) * (dias / 365)
}

export const TIPOS_INSTRUMENTO = [
  { id: 'acciones', label: 'Acciones / CEDEARs' },
  { id: 'fci', label: 'FCI' },
  { id: 'plazo_fijo', label: 'Plazo fijo' },
  { id: 'ons', label: 'Obligaciones negociables' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'otros', label: 'Otros' },
]

export const TIPOS_CUENTA = [
  { id: 'wallet', label: 'Billetera', grupo: 'Billeteras' },
  { id: 'bank', label: 'Banco', grupo: 'Bancos' },
  { id: 'cash', label: 'En mano', grupo: 'En mano' },
]

export function fmtMoney(v, moneda = 'ARS', { compact = false, decimals } = {}) {
  const n = Number(v || 0)
  const d = decimals ?? (moneda === 'USD' ? 2 : Math.abs(n) >= 1000 ? 0 : 2)
  if (compact && Math.abs(n) >= 1e6) {
    return `${moneda === 'USD' ? 'US$' : '$'}${(n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 2 })}M`
  }
  if (compact && Math.abs(n) >= 1e4) {
    return `${moneda === 'USD' ? 'US$' : '$'}${(n / 1e3).toLocaleString('es-AR', { maximumFractionDigits: 1 })}k`
  }
  const s = n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })
  return `${moneda === 'USD' ? 'US$' : '$'}${s}`
}

export const fmtARS = (v, o) => fmtMoney(v, 'ARS', o)
export const fmtUSD = (v, o) => fmtMoney(v, 'USD', o)
export const fmtPct = (v, d = 1) => `${Number(v || 0).toLocaleString('es-AR', { maximumFractionDigits: d })}%`

// Paleta neón para categorías (estable por nombre si no hay color propio).
export const NEON = ['#ff2e97', '#00f0ff', '#b4ff39', '#ffb800', '#9d4bff', '#ff6b2c', '#2effa8', '#4d7cff', '#ff4d6d', '#f9f871', '#00c2ff', '#ff8af2']

export function colorFor(name, cats) {
  const c = cats?.find((x) => eqName(x.name, name))
  if (c?.color) return c.color
  let h = 0
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return NEON[h % NEON.length]
}

export function csvEscape(v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function parseCSV(text) {
  const rows = []
  let row = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); rows.push(row); row = []; cur = ''
    } else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

// "1.500,50" → 1500.5 · "1500.50" → 1500.5 · "1.500" → 1500
export function parseMonto(s) {
  let t = String(s ?? '').trim().replace(/\s/g, '')
  if (!t) return NaN
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if ((t.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, '')
  return parseFloat(t)
}
