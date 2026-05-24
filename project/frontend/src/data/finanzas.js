export const fmtARS = n => '$' + Math.round(n).toLocaleString('es-AR')
export const fmtUSD = n => 'US$ ' + Math.round(n).toLocaleString('es-AR')

const INTERNAL = new Set(['transferencia'])
export const isTransferencia = (mov) => {
  const cat = (mov.cat ?? mov.categoria_nombre ?? '').toLowerCase().trim()
  return INTERNAL.has(cat)
}
