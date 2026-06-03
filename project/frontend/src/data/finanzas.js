export const fmtARS = n => '$' + Math.round(n).toLocaleString('es-AR')
export const fmtUSD = n => 'US$ ' + Math.round(n).toLocaleString('es-AR')

const INTERNAL = new Set(['transferencia'])
export const isTransferencia = (mov) => {
  const cat = (mov.cat ?? mov.categoria_nombre ?? '').toLowerCase().trim()
  return INTERNAL.has(cat)
}

export const CATEGORIA_FIRE = 'FIRE'

/** Categoría exacta FIRE (insensible a mayúsculas). */
export function isCategoriaFire(mov) {
  const cat = (mov?.cat ?? mov?.categoria_nombre ?? '').trim().toLowerCase()
  return cat === 'fire'
}

/** Contribución firmada: gasto suma al cajón, ingreso resta (puede quedar negativo). */
export function contribucionCategoria(mov) {
  const monto = Math.abs(Number(mov?.amount ?? mov?.monto ?? 0))
  const tipo = mov?.type ?? mov?.tipo
  return tipo === 'income' ? -monto : monto
}

/** Alias histórico — misma lógica que contribucionCategoria. */
export const contribucionAhorro = contribucionCategoria

export function contribucionFire(mov) {
  return isCategoriaFire(mov) ? contribucionCategoria(mov) : 0
}

export function acumuladoPorCategoriaNombre(movs, nombreCategoria) {
  const key = (nombreCategoria || '').trim().toLowerCase()
  if (!key) return 0
  return (movs || []).reduce((sum, m) => {
    const cat = (m?.cat ?? m?.categoria_nombre ?? '').trim().toLowerCase()
    if (cat !== key) return sum
    return sum + contribucionCategoria(m)
  }, 0)
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
  const raw = String(mov?.date ?? mov?.fecha ?? '')
  const m = raw.match(/^(\d{4})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}`
  const d = new Date(raw)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Año calendario del movimiento (ISO o corto). */
export function movimientoAnio(mov) {
  const raw = mov?.date ?? mov?.fecha ?? ''
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

/** Normalize a movimiento to consistent shape regardless of mock vs API schema. */
export const normalizeMovimiento = (m) => ({
  id:               m.id,
  tipo:             m.type   ?? m.tipo   ?? 'expense',
  monto:            m.amount ?? m.monto  ?? 0,
  fecha:            m.date   ?? m.fecha  ?? '',
  descripcion:      m.desc   ?? m.descripcion ?? '',
  categoria_nombre: m.cat    ?? m.categoria_nombre ?? '',
  cuenta_nombre:    m.method ?? m.cuenta_nombre ?? '',
  moneda:           m.moneda ?? m.currency ?? 'ARS',
  cuotas:           m.cuotas ?? null,
  nota:             m.nota   ?? null,
  icono:            m.icon   ?? m.icono  ?? '',
})
