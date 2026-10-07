import { getHojaTags } from './tags'

export function buildBovedaTagCounts(hojas) {
  const counts = new Map()
  hojas.forEach(hoja => getHojaTags(hoja).forEach(tag => {
    counts.set(tag, (counts.get(tag) || 0) + 1)
  }))
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export function filterBovedaHojas(hojas, { selectedTag = null, searchQuery = '', query = '' } = {}) {
  const terms = [searchQuery, query].map(value => value.trim().toLowerCase()).filter(Boolean)
  return hojas
    .filter(hoja => {
      const hojaTags = getHojaTags(hoja)
      const matchingTag = !selectedTag || hojaTags.includes(selectedTag)
      const matchingQuery = terms.every(term => [
        hoja.contenido, hoja.apuntes, hoja.categoria_nombre, ...hojaTags,
      ].filter(Boolean).some(value => value.toLowerCase().includes(term)))
      return matchingTag && matchingQuery
    })
    .sort((a, b) => new Date(b.fecha_actualizado || b.fecha) - new Date(a.fecha_actualizado || a.fecha))
}
