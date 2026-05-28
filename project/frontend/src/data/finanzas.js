export const fmtARS = n => '$' + Math.round(n).toLocaleString('es-AR')
export const fmtUSD = n => 'US$ ' + Math.round(n).toLocaleString('es-AR')

const INTERNAL = new Set(['transferencia'])
export const isTransferencia = (mov) => {
  const cat = (mov.cat ?? mov.categoria_nombre ?? '').toLowerCase().trim()
  return INTERNAL.has(cat)
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
