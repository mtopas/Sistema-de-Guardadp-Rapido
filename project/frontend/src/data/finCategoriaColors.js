import { BRANCH_COLORS } from '../utils/themes'
import { isTransferencia } from './finanzas'

/** Paleta de respaldo cuando la categoría no tiene color en DB. */
export const FIN_CAT_PALETTE = [
  BRANCH_COLORS[0],
  BRANCH_COLORS[1],
  BRANCH_COLORS[2],
  BRANCH_COLORS[3],
  BRANCH_COLORS[5],
  BRANCH_COLORS[6],
  BRANCH_COLORS[7],
  BRANCH_COLORS[8],
  BRANCH_COLORS[9] ?? '#888',
]

/** Mapa nombre de categoría → color hex (desde finCategorias de la API). */
export function buildFinCategoriaColorByName(finCategorias) {
  const map = {}
  if (!finCategorias?.length) return map
  let fallbackIdx = 0
  for (const c of finCategorias) {
    const name = (c.name ?? c.nombre ?? '').trim()
    if (!name) continue
    const stored = typeof c.color === 'string' ? c.color.trim() : ''
    if (stored) {
      map[name] = stored
    } else if (!(name in map)) {
      map[name] = FIN_CAT_PALETTE[fallbackIdx % FIN_CAT_PALETTE.length]
      fallbackIdx += 1
    }
  }
  return map
}

/** Color para una categoría (DB primero; si no existe, hash estable por nombre). */
export function getFinCategoriaColor(colorByName, catName, fallbackIndex = 0) {
  const key = (catName ?? '').trim()
  if (!key) return FIN_CAT_PALETTE[fallbackIndex % FIN_CAT_PALETTE.length]
  if (colorByName?.[key]) return colorByName[key]
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (h + key.charCodeAt(i) * 31) % FIN_CAT_PALETTE.length
  }
  return FIN_CAT_PALETTE[(fallbackIndex + h) % FIN_CAT_PALETTE.length]
}

/**
 * Agrega gastos/ingresos por categoría con colores de fin_categorias.
 * Usado en donuts, listas de movimientos y filtros del dashboard.
 */
export function buildCategories(movimientos, type, finCategorias = null) {
  const colorByName = buildFinCategoriaColorByName(finCategorias ?? [])

  const filtered = movimientos.filter(m => {
    const t = m.type ?? m.tipo
    return t === type && !isTransferencia(m)
  })

  if (filtered.length === 0) {
    return { cats: [], total: 0, colorByName }
  }

  const map = {}
  filtered.forEach(m => {
    const cat = m.cat ?? m.categoria_nombre ?? 'Otros'
    const amt = Math.abs(m.amount ?? m.monto ?? 0)
    if (!map[cat]) map[cat] = { name: cat, amount: 0 }
    map[cat].amount += amt
  })

  const entries = Object.values(map).sort((a, b) => b.amount - a.amount)
  const total = entries.reduce((a, c) => a + c.amount, 0)
  const cats = entries.map((c, i) => ({
    ...c,
    color: getFinCategoriaColor(colorByName, c.name, i),
    pct: total > 0 ? Math.round((c.amount / total) * 100) : 0,
  }))

  return { cats, total, colorByName }
}
