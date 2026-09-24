/** Decimales de montos en todo el módulo Finanzas. */
export const FIN_MONEY_OPTS = { minimumFractionDigits: 2, maximumFractionDigits: 2 }

export const fmtARS = (n) => {
  const x = Number(n)
  if (!Number.isFinite(x)) return '$0,00'
  const sign = x < 0 ? '−' : ''
  return `${sign}$${Math.abs(x).toLocaleString('es-AR', FIN_MONEY_OPTS)}`
}

export const fmtUSD = (n) => {
  const x = Number(n)
  if (!Number.isFinite(x)) return 'US$ 0,00'
  const sign = x < 0 ? '−' : ''
  return `${sign}US$ ${Math.abs(x).toLocaleString('es-AR', FIN_MONEY_OPTS)}`
}

/** Ejes y leyendas compactas (K/M) con 2 decimales en el coeficiente. */
export function fmtARSShort(n) {
  const x = Number(n) || 0
  const sign = x < 0 ? '−' : ''
  const abs = Math.abs(x)
  // El redondeo a 2 decimales de toLocaleString puede llevar "999.999K" a
  // mostrarse como "1.000,00K" (parece 1M sin serlo) -- si el valor en K ya
  // redondea a 1000 o más, mostrarlo en M directamente en vez de dejar que
  // el bug de presentación sugiera que se cruzó el millón sin haberlo hecho.
  const redondeaAUnMillon = Math.round((abs / 1_000) * 100) / 100 >= 1000
  if (abs >= 1_000_000 || redondeaAUnMillon) {
    return `${sign}$${(abs / 1_000_000).toLocaleString('es-AR', FIN_MONEY_OPTS)}M`
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toLocaleString('es-AR', FIN_MONEY_OPTS)}K`
  }
  return fmtARS(x)
}

/** Cantidades de instrumentos (acciones, CEDEARs). */
export function fmtCantidad(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '0,00'
  return x.toLocaleString('es-AR', FIN_MONEY_OPTS)
}

/** Cotización USD→ARS (panel dólar). */
export function fmtDolarQuote(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return `$${Number(n).toLocaleString('es-AR', FIN_MONEY_OPTS)}`
}

const INTERNAL = new Set(['transferencia'])
export const isTransferencia = (mov) => {
  const cat = (mov.categoria_nombre ?? '').toLowerCase().trim()
  return INTERNAL.has(cat)
}

export const CATEGORIA_FIRE = 'FIRE'

/** Nombre de categoría del movimiento (normalizado). */
export function nombreCategoriaMovimiento(mov) {
  return String(mov?.categoria_nombre || '').trim().toLowerCase()
}

/** Descripción del movimiento (normalizada). */
export function descripcionMovimiento(mov) {
  return String(mov?.descripcion || '').trim().toLowerCase()
}

/**
 * Cajón por nombre de categoría/objetivo: coincide categoría O descripción (igualdad exacta, sin importar mayúsculas).
 */
export function movimientoAsignadoACajon(mov, nombre) {
  const key = (nombre || '').trim().toLowerCase()
  if (!key) return false
  return nombreCategoriaMovimiento(mov) === key || descripcionMovimiento(mov) === key
}

/** Movimiento asignado al cajón FIRE (categoría o descripción "FIRE"). */
export function isCategoriaFire(mov) {
  return movimientoAsignadoACajon(mov, CATEGORIA_FIRE)
}

/** Contribución firmada: gasto suma al cajón, ingreso resta (puede quedar negativo). */
export function contribucionCategoria(mov) {
  const monto = Math.abs(Number(mov?.monto ?? 0))
  const tipo = mov?.tipo
  return tipo === 'income' ? -monto : monto
}

/** Alias histórico — misma lógica que contribucionCategoria. */
export const contribucionAhorro = contribucionCategoria

export function contribucionFire(mov) {
  return isCategoriaFire(mov) ? contribucionCategoria(mov) : 0
}

export function contribucionFireUSD(mov, dolar) {
  if (!isCategoriaFire(mov)) return 0
  const monto = Math.abs(Number(mov?.monto ?? 0))
  const tipo  = mov?.tipo
  const signo = tipo === 'income' ? -1 : 1
  const enUSD = (mov?.moneda ?? 'ARS').toUpperCase() === 'USD'
    ? monto
    : monto / (Number(dolar) || 1)
  return signo * enUSD
}

export function acumuladoPorCategoriaNombre(movs, nombreCategoria) {
  const key = (nombreCategoria || '').trim().toLowerCase()
  if (!key) return 0
  return (movs || []).reduce((sum, m) => {
    if (!movimientoAsignadoACajon(m, key)) return sum
    return sum + contribucionCategoria(m)
  }, 0)
}

/** Nombre del objetivo/categoría seed del fondo de emergencia (ver app/db/database.py). */
export const NOMBRE_FONDO_EMERGENCIA = 'Fondo de emergencia'

/**
 * Saldo del fondo de emergencia calculado en cliente desde finMovimientosAll — reemplaza
 * al deprecated GET /fin/emergencia. Misma lógica que cualquier otro objetivo/cajón
 * (ver acumuladoPorCategoriaNombre): reusa el patrón ya usado por FIRE y objetivos.
 */
export function saldoFondoEmergencia(movs) {
  return acumuladoPorCategoriaNombre(movs, NOMBRE_FONDO_EMERGENCIA)
}

/** Meses calendario (inclusivo) desde refDate hasta el mes de fecha_limite. Ej: ene → 1/dic = 12. */
export function mesesCalendarioHasta(fechaLimite, refDate = new Date()) {
  const m = String(fechaLimite ?? '').match(/^(\d{4})-(\d{2})/)
  if (!m) return null
  const endY = parseInt(m[1], 10)
  const endM = parseInt(m[2], 10)
  const startY = refDate.getFullYear()
  const startM = refDate.getMonth() + 1
  const diff = (endY - startY) * 12 + (endM - startM) + 1
  return diff > 0 ? diff : null
}

/** Cuota mensual = falta ÷ meses hasta fecha límite (requiere fecha_limite). */
export function cuotaMensualObjetivo(obj, acumulado = 0, refDate = new Date()) {
  const meses = mesesCalendarioHasta(obj?.fecha_limite, refDate)
  if (!meses) return null
  const meta = Number(obj?.meta) || 0
  const falta = Math.max(0, meta - (Number(acumulado) || 0))
  return falta / meses
}

export function nextFinMes(m) {
  const [y, mo] = m.split('-').map(Number)
  if (mo === 12) return `${y + 1}-01`
  return `${y}-${String(mo + 1).padStart(2, '0')}`
}

/** Aporte FIRE planificado para un mes (compuesto desde fire_inicio_mes). */
export function fireAportePlanMes(finConfig, mes) {
  const cfg = finConfig ?? {}
  const aumento = (cfg.fire_aumento_aporte ?? 1.20) / 100
  const aporteInicial = cfg.fire_aporte_inicial ?? 0
  const inicioMes = cfg.fire_inicio_mes ?? mes
  if (mes < inicioMes) return 0
  let aporte = aporteInicial
  let cursor = inicioMes
  while (cursor < mes) {
    aporte = aporte * (1 + aumento)
    cursor = nextFinMes(cursor)
  }
  return aporte
}

/** Ahorrado categoría FIRE en un mes (movimientos; fallback override en fin_fire_filas). */
export function ahorradoFireEnMes(finMovimientosAll, finFireFilas, mes) {
  const computed = (finMovimientosAll ?? [])
    .filter(m => mesMovimiento(m) === mes)
    .reduce((sum, m) => sum + contribucionFire(m), 0)
  const override = finFireFilas?.[mes]
  if (computed !== 0) return computed
  if (override !== undefined) return override
  return 0
}

/** @deprecated Usar isCategoriaFire */
export function isCategoriaAhorro(mov) {
  return isCategoriaFire(mov)
}

/** @deprecated Usar contribucionFire */
export function ahorroFireResidual(mov, _objetivoNombres) {
  return contribucionFire(mov)
}

/** Mes calendario YYYY-MM sin bug de timezone en fechas ISO cortas. */
export function mesMovimiento(mov) {
  const raw = String(mov?.fecha ?? '')
  const m = raw.match(/^(\d{4})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}`
  const d = new Date(raw)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Año calendario del movimiento (ISO o corto). */
export function movimientoAnio(mov) {
  const raw = mov?.fecha ?? ''
  const match = String(raw).match(/^(\d{4})/)
  return match ? match[1] : null
}

/** Categoría por defecto al crear movimiento (nunca Transferencia). */
export function pickDefaultCategoria(categorias, tipo, lastSaved = null) {
  if (!categorias?.length) return ''
  if (lastSaved && !isTransferencia({ categoria_nombre: lastSaved })) {
    const hit = categorias.find(c => c.name === lastSaved)
    if (hit) {
      const t = hit.tipo ?? 'expense'
      if (t === 'both' || t === tipo) return lastSaved
    }
  }
  const pool = categorias.filter(c => {
    if (isTransferencia({ categoria_nombre: c.name })) return false
    const t = c.tipo ?? 'expense'
    if (tipo === 'income') return t === 'income' || t === 'both'
    return t === 'expense' || t === 'both'
  })
  const specific = pool.find(c => c.tipo === tipo)
  return specific?.name ?? pool[0]?.name ?? ''
}

/**
 * Filtra movimientos por categoría, cuenta, tipo (income|expense|transferencia) y rango de
 * fechas (YYYY-MM-DD, inclusivo). Reusa isTransferencia/nombreCategoriaMovimiento — no
 * reinventar qué es transferencia ni cómo se normaliza el nombre de categoría.
 */
export function filtrarMovimientos(movs, filtros = {}) {
  const { categoria, cuenta, tipo, desde, hasta } = filtros
  const categoriaKey = (categoria || '').trim().toLowerCase()
  const cuentaKey = (cuenta || '').trim().toLowerCase()
  return (movs || []).filter(m => {
    if (categoriaKey && nombreCategoriaMovimiento(m) !== categoriaKey) return false
    if (cuentaKey) {
      const cuentaMov = String(m.cuenta_nombre ?? '').trim().toLowerCase()
      if (cuentaMov !== cuentaKey) return false
    }
    if (tipo) {
      const xfer = isTransferencia(m)
      if (tipo === 'transferencia') {
        if (!xfer) return false
      } else {
        if (xfer) return false
        if ((m.tipo ?? 'expense') !== tipo) return false
      }
    }
    const fecha = String(m.fecha ?? '').slice(0, 10)
    if (desde && (!fecha || fecha < desde)) return false
    if (hasta && (!fecha || fecha > hasta)) return false
    return true
  })
}
