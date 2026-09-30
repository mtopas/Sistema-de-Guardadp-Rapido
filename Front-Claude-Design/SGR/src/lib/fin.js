// Reglas de negocio de Finanzas (tal como las describe project/README.md).
//
//  · Transferencia (tipo `transfer` o categoría "Transferencia") NO es ingreso ni gasto.
//  · Cajón FIRE = categoría `FIRE`. Cada objetivo tiene una categoría homónima.
//  · Dentro de un cajón: el GASTO suma (aportás), el INGRESO resta (retirás).
//  · Antes de sumar montos hay que convertir a una sola moneda con el MEP.
//  · `Ajuste` es la categoría de saldos iniciales: no cuenta como ingreso/gasto real.
//
// La API devuelve `tipo`/`monto`/`categoria_nombre`; partes del proyecto usan
// `type`/`amount`/`cat`. `normalizeMov` deja siempre la forma canónica.

import { addMonths, parseDate, shiftMonth, toISOMonth } from './dates'

export const RESERVADAS = ['fire', 'transferencia', 'ajuste']

const low = (s) => String(s ?? '').trim().toLowerCase()
export const eqName = (a, b) => low(a) === low(b) && low(a) !== ''

/** Tipos internos canónicos: income | expense | transfer. */
const TIPO_ALIAS = {
  income: 'income', ingreso: 'income', in: 'income', entrada: 'income',
  expense: 'expense', gasto: 'expense', egreso: 'expense', out: 'expense', salida: 'expense',
  transfer: 'transfer', transferencia: 'transfer',
}
export const normTipo = (t) => TIPO_ALIAS[low(t)] || 'expense'

export function normalizeMov(m) {
  if (!m) return m
  const monto = Number(m.monto ?? m.amount ?? 0)
  return {
    ...m,
    tipo: normTipo(m.tipo ?? m.type),
    monto: Number.isFinite(monto) ? monto : 0,
    moneda: (m.moneda ?? m.currency ?? 'ARS').toUpperCase(),
    fecha: (m.fecha ?? m.date ?? m.datetime ?? '').slice(0, 10),
    descripcion: m.descripcion ?? m.desc ?? m.description ?? '',
    categoria_nombre: m.categoria_nombre ?? m.categoria ?? m.cat ?? null,
    cuenta_nombre: m.cuenta_nombre ?? m.cuenta ?? null,
    cuotas: Number(m.cuotas || 0) || null,
  }
}

/** Cuentas y categorías: el backend usó `name` en algunas versiones y `nombre` en otras. */
export const nameOf = (x) => x?.nombre ?? x?.name ?? ''

export function normalizeCuenta(c) {
  if (!c) return c
  return {
    ...c,
    nombre: nameOf(c),
    tipo: low(c.tipo) || 'bank',
    ars: Number(c.ars ?? c.saldo_ars ?? 0),
    usd: Number(c.usd ?? c.saldo_usd ?? 0),
  }
}

export function normalizeCategoria(c) {
  if (!c) return c
  return { ...c, nombre: nameOf(c), oculta: !!(c.oculta === true || c.oculta === 1) }
}

/** Grupos del panel izquierdo. Acepta los dos juegos de nombres de tipo. */
export const TIPOS_CUENTA = [
  { id: 'wallet', alias: ['wallet', 'billetera'], label: 'Billetera', grupo: 'Billeteras' },
  { id: 'bank', alias: ['bank', 'banco'], label: 'Banco', grupo: 'Bancos' },
  { id: 'cash', alias: ['cash', 'efectivo', 'mano'], label: 'En mano', grupo: 'En mano' },
]
export const grupoCuenta = (c) =>
  TIPOS_CUENTA.find((t) => t.alias.includes(low(c?.tipo)))?.grupo || 'Otras'

export const TIPOS_INSTRUMENTO = [
  { id: 'acciones', label: 'Acciones / CEDEARs' },
  { id: 'fci', label: 'FCI' },
  { id: 'plazo_fijo', label: 'Plazo fijo' },
  { id: 'ons', label: 'Obligaciones negociables' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'otros', label: 'Otros' },
]

// ── Clasificación ───────────────────────────────────────────────────────
export const isTransferencia = (m) => m?.tipo === 'transfer' || low(m?.categoria_nombre) === 'transferencia'
export const isAjuste = (m) => low(m?.categoria_nombre) === 'ajuste'
export const isFire = (m) => low(m?.categoria_nombre) === 'fire'
export const isReservada = (c) => RESERVADAS.includes(low(nameOf(c))) || c?.objetivo_id != null

// ── Dólar y conversión ──────────────────────────────────────────────────
export function dolarDe(config) {
  if (!config) return null
  const v = Number(config.dolar_mep || config.dolar_default || config.dolar_oficial_compra || config.dolar_oficial || 0)
  return v > 0 ? v : null
}

export const toARS = (m, dolar) => (m.moneda === 'USD' ? (dolar ? m.monto * dolar : 0) : m.monto)
export const toUSD = (m, dolar) => (m.moneda === 'USD' ? m.monto : dolar ? m.monto / dolar : 0)
export const conv = (m, dolar, moneda) => (moneda === 'USD' ? toUSD(m, dolar) : toARS(m, dolar))

export const movMes = (m) => String(m?.fecha || '').slice(0, 7)

/** Un movimiento mixto sin cotización no se puede sumar: lo marcamos. */
export const faltaDolar = (movs, dolar) => !dolar && movs.some((m) => m.moneda === 'USD')

// ── Agregados ───────────────────────────────────────────────────────────
export function totalesMes(movs, mes, dolar) {
  let ingresos = 0
  let gastos = 0
  let n = 0
  for (const m of movs) {
    if (movMes(m) !== mes || isTransferencia(m) || isAjuste(m)) continue
    n++
    const v = toARS(m, dolar)
    if (m.tipo === 'income') ingresos += v
    else gastos += v
  }
  const balance = ingresos - gastos
  return { ingresos, gastos, balance, n, tasa: ingresos > 0 ? (balance / ingresos) * 100 : 0 }
}

export function totalesRango(movs, desde, hasta, dolar) {
  let ingresos = 0
  let gastos = 0
  for (const m of movs) {
    const mm = movMes(m)
    if (!mm || mm < desde || mm > hasta) continue
    if (isTransferencia(m) || isAjuste(m)) continue
    const v = toARS(m, dolar)
    if (m.tipo === 'income') ingresos += v
    else gastos += v
  }
  return { ingresos, gastos, balance: ingresos - gastos, tasa: ingresos > 0 ? ((ingresos - gastos) / ingresos) * 100 : 0 }
}

export function porCategoria(movs, { tipo, mes, dolar, desde, hasta } = {}) {
  const map = new Map()
  for (const m of movs) {
    if (tipo && m.tipo !== tipo) continue
    if (isTransferencia(m) || isAjuste(m)) continue
    const mm = movMes(m)
    if (mes && mm !== mes) continue
    if (desde && mm < desde) continue
    if (hasta && mm > hasta) continue
    const k = m.categoria_nombre || 'Sin categoría'
    map.set(k, (map.get(k) || 0) + toARS(m, dolar))
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
}

export function porMes(movs, dolar, meses) {
  return meses.map((mes) => ({ mes, ...totalesMes(movs, mes, dolar) }))
}

// ── Cajones (FIRE + objetivos) ──────────────────────────────────────────
/** Signo del aporte: el movimiento pertenece al cajón por categoría o por descripción. */
export function aporteCajon(m, nombre) {
  const match = eqName(m.categoria_nombre, nombre) || (!m.categoria_nombre && eqName(m.descripcion, nombre))
  if (!match) return 0
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
    t += s * conv(m, dolar, moneda)
  }
  return t
}

export function cajonPorMes(movs, nombre, dolar, moneda = 'USD') {
  const map = {}
  for (const m of movs) {
    const s = aporteCajon(m, nombre)
    if (!s) continue
    const k = movMes(m)
    map[k] = (map[k] || 0) + s * conv(m, dolar, moneda)
  }
  return map
}

// ── Cuotas ──────────────────────────────────────────────────────────────
/** El monto guardado es el total de la compra; cada cuota = total / N desde el mes de compra. */
export function cuotasActivas(movs, refMes) {
  const out = []
  for (const m of movs) {
    const n = Number(m.cuotas || 0)
    if (n <= 1 || m.tipo !== 'expense') continue
    const inicio = parseDate(m.fecha)
    if (!inicio) continue
    const meses = Array.from({ length: n }, (_, i) => toISOMonth(addMonths(inicio, i)))
    if (meses[0] > refMes) continue
    const idx = meses.indexOf(refMes)
    const pagadas = meses.filter((x) => x <= refMes).length
    if (pagadas >= n && idx === -1) continue
    const cuota = m.monto / n
    out.push({
      mov: m,
      n,
      actual: idx === -1 ? pagadas : idx + 1,
      cuota,
      restante: cuota * Math.max(0, n - pagadas),
      fin: meses[n - 1],
      moneda: m.moneda,
    })
  }
  return out.sort((a, b) => a.fin.localeCompare(b.fin))
}

// ── Instrumentos ────────────────────────────────────────────────────────
export function interesPlazoFijo(inst, hoy = new Date()) {
  const cap = Number(inst.capital_ars || 0)
  const tna = Number(inst.tna || 0)
  const ini = parseDate(inst.fecha_inicio)
  if (!cap || !tna || !ini) return 0
  let fin = parseDate(inst.fecha_vencimiento) || hoy
  if (fin > hoy) fin = hoy
  return cap * (tna / 100) * (Math.max(0, (fin - ini) / 86400000) / 365)
}

export function costoInstrumentoUSD(inst, dolar) {
  if (inst.tipo === 'plazo_fijo') return dolar ? Number(inst.capital_ars || 0) / dolar : 0
  return Number(inst.costo_usd || 0)
}

export function valorInstrumentoUSD(inst, dolar) {
  if (inst.tipo === 'plazo_fijo') {
    const total = Number(inst.capital_ars || 0) + interesPlazoFijo(inst)
    return dolar ? total / dolar : 0
  }
  const precio = Number(inst.precio_actual ?? 0)
  const cant = Number(inst.cantidad ?? 0)
  return precio && cant ? precio * cant : Number(inst.costo_usd || 0)
}

// ── Proyección FIRE ─────────────────────────────────────────────────────
/**
 * Proyecta N meses de plan FIRE en USD.
 *  aporteBase  → aporte del primer mes
 *  aumentoPct  → % de aumento del aporte cada mes
 *  rentaAnual  → % anual esperado (se capitaliza mensual)
 *  overrides   → { 'YYYY-MM': aportado real } de fin_fire_filas
 */
export function proyeccionFire({ desde, meses, inicial = 0, aporteBase = 0, aumentoPct = 0, rentaAnual = 0, overrides = {}, reales = {} }) {
  const rMes = Math.pow(1 + Number(rentaAnual || 0) / 100, 1 / 12) - 1
  const rows = []
  let saldo = Number(inicial || 0)
  let aporte = Number(aporteBase || 0)
  let cur = desde
  for (let i = 0; i < meses; i++) {
    const override = overrides[cur]
    const real = reales[cur]
    const aportado = override != null ? Number(override) : real != null ? Number(real) : aporte
    const interes = saldo * rMes
    saldo = saldo + interes + aportado
    rows.push({
      mes: cur,
      plan: aporte,
      aportado,
      esOverride: override != null,
      esReal: override == null && real != null,
      interes,
      saldo,
    })
    aporte = aporte * (1 + Number(aumentoPct || 0) / 100)
    cur = shiftMonth(cur, 1)
  }
  return rows
}
// ── Formato ─────────────────────────────────────────────────────────────
export function fmtMoney(v, moneda = 'ARS', { compact = false, decimals, signo = false } = {}) {
  const n = Number(v || 0)
  const pre = moneda === 'USD' ? 'US$' : '$'
  const sg = signo && n > 0 ? '+' : ''
  const abs = Math.abs(n)
  if (compact && abs >= 1e9) return `${sg}${pre}${(n / 1e9).toLocaleString('es-AR', { maximumFractionDigits: 2 })}MM`
  if (compact && abs >= 1e6) return `${sg}${pre}${(n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 2 })}M`
  if (compact && abs >= 1e4) return `${sg}${pre}${(n / 1e3).toLocaleString('es-AR', { maximumFractionDigits: 1 })}k`
  // Por encima de mil se redondea para que las listas no se llenen de ceros,
  // pero nunca se esconden centavos reales: $12.500,50 no puede leerse $12.501.
  const centavos = Math.abs(n % 1) > 0.004
  const d = decimals ?? (moneda === 'USD' ? 2 : abs >= 1000 && !centavos ? 0 : 2)
  return `${sg}${pre}${n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })}`
}
export const fmtARS = (v, o) => fmtMoney(v, 'ARS', o)
export const fmtUSD = (v, o) => fmtMoney(v, 'USD', o)
export const fmtPct = (v, d = 1) =>
  `${Number(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: d })}%`
export const fmtNum = (v, d = 2) =>
  Number(v || 0).toLocaleString('es-AR', { maximumFractionDigits: d })

// ── Color estable por nombre ────────────────────────────────────────────
export const PALETA = [
  '#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#3b82f6',
  '#f97316','#14b8a6','#a855f7','#f43f5e','#84cc16','#ec4899',
]

export function hashColor(name) {
  let h = 0
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETA[h % PALETA.length]
}

export function colorFor(name, cats) {
  const c = cats?.find((x) => eqName(nameOf(x), name))
  return c?.color || hashColor(name)
}

// ── CSV ─────────────────────────────────────────────────────────────────
export const csvEscape = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(rows, cols) {
  const head = cols.map((c) => csvEscape(c.label)).join(',')
  const body = rows.map((r) => cols.map((c) => csvEscape(c.get(r))).join(',')).join('\n')
  return `${head}\n${body}`
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
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

/** "1.500,50" → 1500.5 · "1500.50" → 1500.5 · "1.500" → 1500 */
export function parseMonto(s) {
  let t = String(s ?? '').trim().replace(/[\s$]/g, '').replace(/^US/i, '')
  if (!t) return NaN
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if ((t.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, '')
  return parseFloat(t)
}

export function downloadFile(name, content, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
