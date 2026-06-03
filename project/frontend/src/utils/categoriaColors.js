import { BRANCH_COLORS } from './themes'

function hasStoredColor(c) {
  return typeof c.color === 'string' && c.color.length > 0
}

/** IDs de todas las subcategorías (descendientes) de una categoría. */
export function categoriaDescendantIds(categorias, categoriaId) {
  const ids = []
  const queue = [categoriaId]
  while (queue.length) {
    const pid = queue.shift()
    for (const c of categorias) {
      if (c.padre_id === pid) {
        ids.push(c.id)
        queue.push(c.id)
      }
    }
  }
  return ids
}

/** Mapa id → color hex para categorías de Bóveda (raíz + subcategorías). */
export function buildCategoriaColorMap(categorias) {
  const map = {}
  const roots = categorias.filter(c => !c.padre_id)
  roots.forEach((c, i) => {
    map[c.id] = hasStoredColor(c) ? c.color : BRANCH_COLORS[i % BRANCH_COLORS.length]
  })
  let changed = true
  while (changed) {
    changed = false
    for (const c of categorias) {
      if (map[c.id]) continue
      if (hasStoredColor(c)) {
        map[c.id] = c.color
        changed = true
      } else if (c.padre_id && map[c.padre_id]) {
        map[c.id] = map[c.padre_id]
        changed = true
      }
    }
  }
  for (const c of categorias) {
    if (!map[c.id]) map[c.id] = 'var(--accent)'
  }
  return map
}

export function getCategoriaColor(categorias, catId) {
  return buildCategoriaColorMap(categorias)[catId] || 'var(--accent)'
}
