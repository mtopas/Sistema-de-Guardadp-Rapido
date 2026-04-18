import { extractTags } from './tags'

/**
 * Build a graph from hojas + categorias.
 * Returns { nodes, edges }
 * Node types: 'root' | 'category' | 'tag' | 'hoja'
 */
export function buildGraph(hojas, categorias) {
  const nodes = []
  const edges = []

  // Root node
  nodes.push({ id: 'root', type: 'root', label: 'hoja', r: 22 })

  // Category nodes
  categorias.forEach(cat => {
    nodes.push({ id: `cat-${cat.id}`, type: 'category', label: cat.nombre, catId: cat.id, r: 14 })
    // All root categories connect to root
    if (!cat.padre_id) {
      edges.push({ source: 'root', target: `cat-${cat.id}` })
    } else {
      // Sub-category connects to parent
      edges.push({ source: `cat-${cat.padre_id}`, target: `cat-${cat.id}` })
    }
  })

  // Collect all unique tags across all hojas
  const allTags = new Set()
  hojas.forEach(h => extractTags(h.contenido, h.apuntes).forEach(t => allTags.add(t)))

  // Tag nodes — connect to root
  allTags.forEach(tag => {
    nodes.push({ id: `tag-${tag}`, type: 'tag', label: `#${tag}`, r: 11 })
    edges.push({ source: 'root', target: `tag-${tag}` })
  })

  // Hoja nodes
  hojas.forEach(h => {
    const nid = `hoja-${h.id}`
    const label = h.contenido.replace(/https?:\/\/\S+/g, '').trim().slice(0, 22) || '—'
    nodes.push({ id: nid, type: 'hoja', label, hojaId: h.id, tipo: h.tipo, r: 6 })

    // Connect to category
    edges.push({ source: `cat-${h.categoria_id}`, target: nid })

    // Connect to each tag
    extractTags(h.contenido, h.apuntes).forEach(tag => {
      edges.push({ source: `tag-${tag}`, target: nid })
    })
  })

  return { nodes, edges }
}
