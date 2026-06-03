import { isTransferencia } from './finanzas'

/** Categorías del sistema — no editar nombre ni eliminar desde la UI. */
export const FIN_CATEGORIAS_SISTEMA = new Set([
  'Transferencia',
  'Ajuste',
  'FIRE',
])

/** @deprecated Usar FIN_CATEGORIAS_SISTEMA */
export const FIN_CATEGORIAS_RESERVADAS = FIN_CATEGORIAS_SISTEMA

export function isFinCategoriaObjetivo(cat) {
  return cat != null && cat.objetivo_id != null && cat.objetivo_id !== ''
}

export function isFinCategoriaReservada(catOrName) {
  if (catOrName && typeof catOrName === 'object') {
    if (isFinCategoriaObjetivo(catOrName)) return true
    return FIN_CATEGORIAS_SISTEMA.has((catOrName.name || '').trim())
  }
  return FIN_CATEGORIAS_SISTEMA.has((catOrName || '').trim())
}

export function categoriaAplicaATipo(cat, tipoMov) {
  if (!cat) return false
  if (isTransferencia({ categoria_nombre: cat.name })) return false
  const t = cat.tipo ?? 'expense'
  if (t === 'both') return true
  return t === tipoMov
}

export function filterCategoriasPorTipo(categorias, tipoMov) {
  if (!categorias?.length) return []
  return categorias.filter(c => categoriaAplicaATipo(c, tipoMov))
}

export const FIN_CAT_TIPO_OPTS = [
  { id: 'expense', labelEs: 'Gasto', labelEn: 'Expense' },
  { id: 'income', labelEs: 'Ingreso', labelEn: 'Income' },
  { id: 'both', labelEs: 'Ambos', labelEn: 'Both' },
]

export function finCatTipoLabel(tipo, lang) {
  const hit = FIN_CAT_TIPO_OPTS.find(o => o.id === (tipo || 'expense'))
  if (!hit) return tipo || '—'
  return lang === 'en' ? hit.labelEn : hit.labelEs
}
